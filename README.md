# Job Wingman Portal

## Deploy to Vercel

### Option 1: Vercel CLI
```bash
# Unzip the project
unzip jobwingman-vercel.zip
cd jobwingman-vercel

# Install dependencies
npm install

# Deploy to Vercel
npx vercel
```

### Option 2: GitHub + Vercel Dashboard
1. Unzip and push to a GitHub repo
2. Go to vercel.com/new
3. Import your GitHub repo
4. Vercel auto-detects Vite - just click Deploy

### Option 3: Drag & Drop
1. Unzip the project
2. Run `npm install && npm run build`
3. Drag the `dist` folder to vercel.com/new

## Local Development
```bash
npm install
npm run dev
```

## Configure Client Passwords
Edit `src/App.jsx` line 4-8:
```javascript
const CLIENT_PASSWORDS = {
  'demo2025': true,
  'clientname123': true,
  // add more...
};
```

## Customize
- Colors: `src/index.css` and Tailwind classes in `src/App.jsx`
- Content: Case studies and pricing in `src/App.jsx`
