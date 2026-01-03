# 🎨 DivaForge - Local Development Setup

Get DivaForge running locally in 5 minutes!

## 📦 What You Get

All the files you need to run DivaForge locally:

- ✅ **LOCAL_SETUP_GUIDE.md** - Complete step-by-step instructions
- ✅ **backend/server.js** - Main server file
- ✅ **backend/seedream.js** - Seedream integration
- ✅ **backend/nanoBanana.js** - Nano Banana Pro integration
- ✅ **backend/package.json** - Dependencies
- ✅ **backend/.env.template** - Environment variables template
- ✅ **simple-generator.html** - Your DivaForge frontend

## 🚀 Quick Start (5 Minutes)

### Step 1: Get API Key

Go to https://replicate.com and create a free account, then get your API token from https://replicate.com/account/api-tokens

### Step 2: Setup Backend

```bash
# Navigate to backend folder
cd divaforge/backend

# Copy .env.template to .env
cp .env.template .env

# Install dependencies
npm install

# Edit .env and add your Replicate API key
nano .env  # or use any text editor
```

Your `.env` file should look like:
```
PORT=3001
REPLICATE_API_KEY=r8_your_actual_key_here
GOOGLE_API_KEY=optional_for_now
```

### Step 3: Start Backend

```bash
npm run dev
```

You should see:
```
🚀 DivaForge Backend running on http://localhost:3001
📋 API Status:
   Seedream: ✅ Configured
```

### Step 4: Open Frontend

Just double-click `simple-generator.html` in your browser!

### Step 5: Generate!

1. Enter a prompt: "A serene mountain landscape at sunset"
2. Make sure "Seedream" is selected
3. Click "⚡ Generate"
4. Watch the magic happen! 🎨

## 📁 Folder Structure

```
divaforge/
├── backend/
│   ├── server.js
│   ├── seedream.js
│   ├── nanoBanana.js
│   ├── package.json
│   ├── .env.template
│   ├── .env (you create this)
│   ├── .gitignore
│   └── node_modules/ (created by npm install)
├── simple-generator.html
├── README.md
└── LOCAL_SETUP_GUIDE.md
```

## 💰 Cost

Each generation costs approximately:
- **2K image**: ~$0.05 per image
- **4K image**: ~$0.10 per image

You'll get charged on your Replicate account.

## 🐛 Troubleshooting

**Backend won't start?**
- Make sure you're in the `backend` folder
- Make sure you ran `npm install`
- Check that `.env` has your API key

**CORS error?**
- Make sure backend is running on port 3001
- Check browser console for the exact error

**"Insufficient funds" error?**
- Add credits to your Replicate account at https://replicate.com/account/billing

## 📚 Full Documentation

For complete details, see **LOCAL_SETUP_GUIDE.md**

## 🎯 Next Steps

Once this works:
1. Experiment with different prompts
2. Try different resolutions
3. Generate multiple images at once
4. When ready, move to the full commercial version with auth & payments!

## 💬 Questions?

Check the full guides:
- **LOCAL_SETUP_GUIDE.md** - Detailed local setup
- **COMMERCIAL_APP_GUIDE.md** - Path to production app

---

**Ready to make magic? Let's go! 🚀✨**
