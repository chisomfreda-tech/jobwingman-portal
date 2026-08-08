// api/create-order.js
// Server-side endpoint to create a client order in Supabase.
// Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS — safe because this runs on Vercel, never in the browser.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://dpgisnslhirfljwerrci.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Build a payment_schedule jsonb array matching the format the dashboard expects.
// Same date logic the portal has always used: deposit due in 3 days, first installment 7 days out, then biweekly.
function buildSchedule({ paymentType, deposit, installments, installmentAmount, total }) {
  const schedule = [];
  const now = new Date();

  const depositDate = new Date(now);
  depositDate.setDate(depositDate.getDate() + 3);
  schedule.push({
    label: paymentType === 'full' ? 'Payment in full' : 'Deposit',
    amount: paymentType === 'full' ? total : deposit,
    due_date: depositDate.toISOString().split('T')[0],
    status: 'upcoming',
  });

  if (paymentType !== 'full' && installments > 0) {
    for (let i = 1; i <= installments; i++) {
      const installmentDate = new Date(now);
      installmentDate.setDate(installmentDate.getDate() + 7 + i * 14);
      schedule.push({
        label: `Installment ${i} of ${installments}`,
        amount: installmentAmount,
        due_date: installmentDate.toISOString().split('T')[0],
        status: 'upcoming',
      });
    }
  }

  return schedule;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY env var is not set');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const {
    clientId,
    firstName,
    lastName,
    email,
    accessCode,
    items,
    total,
    paymentType,       // 'full' or 'installment'
    deposit,
    installments,
    installmentAmount,
  } = req.body || {};

  // Validate
  if (!clientId || !firstName || !email || !items || !Array.isArray(items) || !total) {
    return res.status(400).json({ error: 'Missing required fields', got: Object.keys(req.body || {}) });
  }

  // Server-side Supabase client with service role — bypasses RLS
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Build schedule
    const schedule = buildSchedule({
      paymentType,
      deposit: Number(deposit) || 0,
      installments: Number(installments) || 0,
      installmentAmount: Number(installmentAmount) || 0,
      total: Number(total),
    });

    // Package description from item names
    const packageType = items.map(i => i.name).join(', ') || 'Custom';

    // 1. Insert the order
    const orderData = {
      client_id: clientId,
      first_name: firstName,
      last_name: lastName || null,
      email,
      items,                                         // jsonb, not stringified
      total_amount: Number(total),
      original_amount: Number(total),
      discount_amount: 0,
      payment_type: paymentType === 'full' ? 'full' : 'installment',
      deposit_amount: paymentType === 'full' ? Number(total) : Number(deposit) || 0,
      num_installments: paymentType === 'full' ? 0 : Number(installments) || 0,
      installment_amount: paymentType === 'full' ? null : Number(installmentAmount) || 0,
      status: 'pending',
      source: 'services_site',                       // NEW — flags this row for dashboard review
      package_type: packageType,
      payment_schedule: schedule,                    // NEW — jsonb array of installments
      notes: accessCode ? `Access code: ${accessCode.toUpperCase()}` : null,
    };

    const { data: order, error: orderError } = await supabase
      .from('client_orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      console.error('Order insert error:', orderError);
      return res.status(500).json({ error: 'Failed to create order', details: orderError.message });
    }

    // 2. Insert individual payment rows (same shape the dashboard consumes)
    const paymentRows = schedule.map(item => ({
      order_id: order.id,
      client_id: clientId,
      description: item.label,
      amount: item.amount,
      due_date: item.due_date,
      status: 'upcoming',
    }));

    const { error: paymentsError } = await supabase
      .from('client_payments')
      .insert(paymentRows);

    if (paymentsError) {
      // Order was created, payments failed — return partial success so admin can rebuild schedule
      console.error('Payment rows insert error:', paymentsError);
      return res.status(200).json({
        success: true,
        orderId: order.id,
        warning: 'Order created but payment schedule failed to save',
        details: paymentsError.message,
      });
    }

    return res.status(200).json({ success: true, orderId: order.id });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
