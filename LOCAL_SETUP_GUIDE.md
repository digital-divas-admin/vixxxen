# 📖 DivaForge - Complete Local Setup Guide

This guide will walk you through setting up DivaForge on your local machine for development and testing.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Getting Your API Key](#getting-your-api-key)
3. [Backend Setup](#backend-setup)
4. [Frontend Setup](#frontend-setup)
5. [Testing Your Setup](#testing-your-setup)
6. [Troubleshooting](#troubleshooting)
7. [Understanding the Project](#understanding-the-project)
8. [Cost Estimation](#cost-estimation)

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js** (version 16 or higher) - [Download here](https://nodejs.org/)
- A **Replicate account** (free to create)
- A **text editor** (VS Code, Sublime, etc.)
- A **web browser** (Chrome, Firefox, Safari, etc.)

### Check Your Node.js Installation

```bash
node --version
npm --version
```

You should see version numbers. If not, install Node.js first.

---

## Getting Your API Key

1. **Create a Replicate Account**
   - Go to https://replicate.com
   - Click "Sign up" and create a free account

2. **Get Your API Token**
   - Once logged in, go to https://replicate.com/account/api-tokens
   - Click "Create token" or copy your existing token
   - Save this token - you'll need it in the next step!

3. **Add Billing (Important!)**
   - Go to https://replicate.com/account/billing
   - Add a payment method
   - Add at least $5 in credits to start generating images
   - Don't worry - each image only costs $0.05-$0.10

---

## Backend Setup

### Step 1: Navigate to Backend Directory

```bash
cd divaforge/backend
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install:
- `express` - Web server framework
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variable management
- `replicate` - Replicate API client
- `nodemon` - Auto-restart during development

### Step 3: Configure Environment Variables

Create a `.env` file from the template:

```bash
cp .env.template .env
```

Now edit the `.env` file:

```bash
nano .env
# or use your preferred editor
```

Replace the placeholder with your actual API key:

```env
PORT=3001
NODE_ENV=development
REPLICATE_API_KEY=r8_your_actual_api_key_here
```

**Important:** Replace `r8_your_actual_api_key_here` with the token you got from Replicate!

### Step 4: Start the Backend Server

```bash
npm run dev
```

You should see:

```
🚀 DivaForge Backend running on http://localhost:3001

📋 API Status:
   Seedream: ✅ Configured
   Nano Banana Pro: ✅ Configured

💡 Available endpoints:
   GET  http://localhost:3001/health
   POST http://localhost:3001/api/seedream/generate
   POST http://localhost:3001/api/nano-banana/generate

📝 Make sure to set REPLICATE_API_KEY in your .env file
```

**✅ Success!** Your backend is now running.

**Keep this terminal window open** - the server needs to keep running while you use DivaForge.

---

## Frontend Setup

### Step 1: Open the Frontend

The frontend is a single HTML file that you can open directly in your browser!

**Option 1: Double-click**
- Navigate to the `divaforge` folder
- Double-click `simple-generator.html`

**Option 2: Command line (Mac/Linux)**
```bash
open simple-generator.html
```

**Option 3: Command line (Windows)**
```bash
start simple-generator.html
```

**Option 4: Drag and drop**
- Drag `simple-generator.html` into your browser window

### Step 2: Verify Backend Connection

When the page loads, check the browser console (F12 or Right-click → Inspect → Console):

- If you see: `✅ Backend is ready!` - Perfect!
- If you see a warning - make sure the backend server is running

---

## Testing Your Setup

### Test 1: Simple Generation

1. In the frontend, enter this prompt:
   ```
   A serene mountain landscape at sunset with vibrant orange and pink skies
   ```

2. Make sure "Seedream" is selected

3. Click **"⚡ Generate"**

4. Wait 30-60 seconds (first generation may take longer)

5. You should see a beautiful generated image!

### Test 2: Multiple Images

1. Click "⚙️ Advanced Options"

2. Change "Number of Images" to 2

3. Enter a new prompt:
   ```
   A futuristic cityscape with flying cars and neon lights
   ```

4. Click **"⚡ Generate"**

5. You should get 2 different variations!

### Test 3: Nano Banana Pro

1. Select "🍌 Nano Banana Pro"

2. In Advanced Options, change Aspect Ratio to "16:9 (Landscape)"

3. Enter prompt:
   ```
   A peaceful zen garden with cherry blossoms and a koi pond
   ```

4. Click **"⚡ Generate"**

5. You should get a landscape-oriented image!

---

## Troubleshooting

### Backend Won't Start

**Error:** `Cannot find module 'express'`
- **Solution:** Run `npm install` in the backend directory

**Error:** `Port 3001 is already in use`
- **Solution:** Change the PORT in `.env` to 3002 or another available port
- Update `API_BASE_URL` in `simple-generator.html` to match

**Error:** Backend starts but APIs show ❌
- **Solution:** Check that your `.env` file has the correct API key
- Make sure there are no extra spaces in the API key

### Frontend Issues

**Error:** "Failed to fetch" or "Network error"
- **Solution:** Make sure backend is running on port 3001
- Check that you're using `http://localhost:3001` (not `https`)

**Error:** "CORS policy blocked"
- **Solution:** This shouldn't happen, but if it does:
  - Make sure the backend server is running
  - Try clearing your browser cache

### Generation Errors

**Error:** "Insufficient funds"
- **Solution:** Add credits to your Replicate account
- Go to https://replicate.com/account/billing

**Error:** "Invalid API key"
- **Solution:** Double-check your API key in `.env`
- Make sure you copied the entire key (starts with `r8_`)
- Restart the backend server after changing `.env`

**Generation is slow**
- This is normal! AI image generation takes time:
  - 2K images: 30-60 seconds
  - 4K images: 1-2 minutes
- The first generation may take longer as the model initializes

---

## Understanding the Project

### Project Structure

```
divaforge/
├── backend/
│   ├── server.js           # Main Express server
│   ├── seedream.js         # Seedream model API routes
│   ├── nanoBanana.js       # Nano Banana Pro API routes
│   ├── package.json        # Dependencies
│   ├── .env                # Your API keys (DO NOT COMMIT)
│   ├── .env.template       # Template for .env
│   └── .gitignore          # Git ignore rules
│
├── simple-generator.html   # Frontend interface
├── README.md               # Quick start guide
└── LOCAL_SETUP_GUIDE.md    # This file
```

### How It Works

1. **Frontend (simple-generator.html)**
   - User enters a prompt
   - Sends HTTP POST request to backend
   - Displays generated images

2. **Backend (server.js)**
   - Receives generation requests
   - Routes to appropriate model handler
   - Returns image URLs

3. **Model Handlers (seedream.js, nanoBanana.js)**
   - Call Replicate API with parameters
   - Handle errors and responses
   - Return image URLs to backend

4. **Replicate**
   - Runs the AI models in the cloud
   - Generates images
   - Hosts images temporarily

### API Endpoints

**GET /health**
- Check backend status
- Response: Server status and configuration

**POST /api/seedream/generate**
- Generate images with Seedream
- Body: `{ prompt, resolution, numOutputs, guidanceScale }`
- Returns: Array of image URLs

**POST /api/nano-banana/generate**
- Generate images with Nano Banana Pro
- Body: `{ prompt, aspectRatio, numOutputs, guidanceScale }`
- Returns: Array of image URLs

**GET /api/seedream/status**
- Check Seedream configuration status

**GET /api/nano-banana/status**
- Check Nano Banana Pro configuration status

---

## Cost Estimation

### Replicate Pricing

**Seedream:**
- 2K (2048x2048): ~$0.05 per image
- 4K (4096x4096): ~$0.10 per image

**Nano Banana Pro:**
- All resolutions: ~$0.03 per image

### Example Costs

- **10 test images (2K):** ~$0.50
- **50 images (mixed):** ~$2.50
- **100 images (2K):** ~$5.00

### Tips to Save Money

1. **Start with 2K resolution** - It's cheaper and faster
2. **Use Nano Banana Pro for testing** - It's the cheapest option
3. **Generate 1 image at a time** until you're happy with the prompt
4. **Only use 4K** when you need the extra quality

---

## Next Steps

### Experiment with Prompts

Try different types of prompts:

- **Landscapes:** "A misty forest at dawn with rays of sunlight"
- **Abstract:** "Colorful geometric patterns in a spiral formation"
- **Characters:** "A cyberpunk character with neon hair and tech gadgets"
- **Scenes:** "A cozy coffee shop on a rainy day, warm lighting"

### Understand the Parameters

- **Guidance Scale (3-15)**
  - Lower (3-5): More creative, unexpected results
  - Higher (10-15): More literal, follows prompt exactly

- **Resolution / Aspect Ratio**
  - 1:1 - Square, good for social media
  - 16:9 - Landscape, good for wallpapers
  - 9:16 - Portrait, good for phone screens

- **Number of Outputs**
  - Generate multiple variations to find the best one
  - Each counts as a separate generation for cost

### Learn More

- [Replicate Documentation](https://replicate.com/docs)
- [Seedream Model Page](https://replicate.com/adirik/seedream)
- [Nano Banana Pro Model Page](https://replicate.com/asiryan/flux-nanobanana-pro)

---

## Support

Having issues? Here's how to get help:

1. **Check the Troubleshooting section** above
2. **Review the error message** - it usually tells you what's wrong
3. **Check backend logs** - Look at the terminal where the server is running
4. **Check browser console** - Press F12 and look for errors
5. **Verify API key** - Most issues are due to incorrect or missing API keys

---

## Ready for Production?

This local setup is perfect for:
- Testing and experimentation
- Learning how the system works
- Developing new features

When you're ready to deploy:
- See **COMMERCIAL_APP_GUIDE.md** (coming soon)
- Add user authentication
- Add payment processing
- Deploy to a cloud platform
- Add a database for image storage

---

**Happy generating! 🎨✨**
