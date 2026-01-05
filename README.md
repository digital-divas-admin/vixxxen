# Vixxxen - AI Image & Video Generator

An AI-powered content generation platform with image generation, video creation, and editing tools.

---

## Quick Reference (Commands You'll Use Most)

```powershell
# Check what branch you're on
git branch

# Get the latest code from main
git pull origin main

# Start the backend server
cd backend
npm run dev
```

---

## Production

| Environment | URL |
|-------------|-----|
| **Live Site** | https://vixxxen.onrender.com/ |
| **Future Home** | https://www.vixxxxen.ai |
| **Render Project** | vixxxen |
| **Render Service ID** | srv-d5dglikhg0os73f8hp10 |

---

## Git Workflow

### Which Branch to Use

- **Normal work**: Use the `main` branch
- **Feature work**: If I specify a feature branch, stay on that branch until I say to merge back to main

### Common Git Commands (PowerShell)

**Check what branch you're on:**
```powershell
git branch
```
The branch with the `*` next to it is your current branch.

**Switch to main branch:**
```powershell
git checkout main
```

**Get the latest code before starting work:**
```powershell
git pull origin main
```

**See what files you've changed:**
```powershell
git status
```

**Save your changes and push them:**
```powershell
git add .
git commit -m "Description of what you changed"
git push origin main
```

**If you're on a feature branch, push to that branch instead:**
```powershell
git push origin your-branch-name
```

### If You Get Stuck with Git

**"I don't know what branch I'm on"**
```powershell
git branch
```

**"I want to throw away my local changes and get the latest"**
```powershell
git checkout .
git pull origin main
```

**"Git says I have conflicts"**
Don't panic. Ask for help or run `git status` to see which files have conflicts.

---

## Local Development Setup

### Prerequisites Checklist

- [ ] Node.js v22.14.0 or later installed
- [ ] Git installed
- [ ] API keys configured (see `.env.template` in backend folder)

### Setup Steps (Windows/PowerShell)

1. **Open PowerShell and navigate to the project:**
   ```powershell
   cd path\to\vixxxen
   ```

2. **Make sure you have the latest code:**
   ```powershell
   git pull origin main
   ```

3. **Go to the backend folder:**
   ```powershell
   cd backend
   ```

4. **Create your environment file** (first time only):
   ```powershell
   copy .env.template .env
   ```
   Then open `.env` in your editor and add your API keys.

5. **Install dependencies** (first time, or after pulling new code):
   ```powershell
   npm install
   ```

6. **Start the backend server:**
   ```powershell
   npm run dev
   ```
   You should see the server start on `http://localhost:3001`

7. **Open the frontend:**
   Open `index.html` in your browser (just double-click it)

---

## Project Structure

```
vixxxen/
├── backend/
│   ├── server.js          # Main Express server
│   ├── seedream.js        # Seedream image generation
│   ├── nanoBanana.js      # Nano Banana Pro
│   ├── kling.js           # Kling video generation
│   ├── wan.js             # WAN video generation
│   ├── veo.js             # Veo video generation
│   ├── qwen.js            # Qwen AI
│   ├── qwen-image-edit.js # Qwen image editing
│   ├── deepseek.js        # DeepSeek chat
│   ├── elevenlabs.js      # ElevenLabs audio
│   ├── bg-remover.js      # Background removal
│   ├── inpaint.js         # Inpainting
│   ├── eraser.js          # Object eraser
│   ├── payments.js        # Payment processing
│   ├── characters.js      # Character management
│   ├── compliance.js      # 2257 compliance
│   ├── age-verification.js
│   ├── .env.template      # Template for environment variables
│   └── package.json
├── index.html             # Main frontend app (all-in-one)
├── supabase-*.sql         # Database schemas
└── README.md              # This file
```

---

## Features

- **Image Generation**: Seedream, Nano Banana Pro, Qwen
- **Video Generation**: Kling, WAN, Veo
- **Editing Tools**: Background remover, Inpainting, Eraser
- **Audio**: ElevenLabs integration
- **AI Chat**: DeepSeek
- **Platform**: User authentication, payments, age verification, 2257 compliance

---

## Troubleshooting

### Backend won't start

**"npm is not recognized"**
- Node.js isn't installed or isn't in your PATH
- Download from https://nodejs.org/ and restart PowerShell after installing

**"Cannot find module" errors**
- Run `npm install` in the backend folder

**"EADDRINUSE" or "port already in use"**
- Another process is using port 3001
- Close other terminals or restart your computer

### Git issues

**"Your branch is behind"**
```powershell
git pull origin main
```

**"Please commit your changes or stash them"**
- You have unsaved changes. Either commit them or discard them:
```powershell
# To discard changes:
git checkout .

# Or to commit them:
git add .
git commit -m "Save my work"
```

**"CONFLICT" errors during pull**
- Your changes conflict with remote changes
- Ask for help, or carefully edit the conflicted files (look for `<<<<<<<` markers)

### Frontend issues

**Page is blank or shows errors**
- Check browser console (F12 > Console tab) for error messages
- Make sure the backend is running
- Try hard refresh: Ctrl+Shift+R

**"CORS error"**
- Backend isn't running, or is on the wrong port
- Make sure backend shows `http://localhost:3001`

---

## Deployment

The site auto-deploys to Render when changes are pushed to the main branch.

To deploy:
1. Commit your changes
2. Push to main: `git push origin main`
3. Render will automatically rebuild and deploy

---

## Documentation

- **LOCAL_SETUP_GUIDE.md** - Additional local setup details (if available)
