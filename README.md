# Vixxxen - AI Image & Video Generator

An AI-powered content generation platform with image generation, video creation, and editing tools.

## Deployment

**Production**: Currently running on [Render](https://render.com)

## Features

- **Image Generation**: Seedream, Nano Banana Pro, Qwen
- **Video Generation**: Kling, WAN, Veo
- **Editing Tools**: Background remover, Inpainting, Eraser
- **Audio**: ElevenLabs integration
- **AI Chat**: DeepSeek
- **Platform**: User authentication, payments, age verification, 2257 compliance

## Local Development

### Prerequisites

- Node.js
- API keys for services (Replicate, Google, ElevenLabs, etc.)

### Setup

```bash
# Navigate to backend folder
cd backend

# Copy environment template
cp .env.template .env

# Add your API keys to .env

# Install dependencies
npm install

# Start development server
npm run dev
```

Backend will run on `http://localhost:3001`

### Frontend

Open `index.html` in your browser.

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
│   └── package.json
├── index.html             # Main frontend app
└── supabase-*.sql         # Database schemas
```

## Documentation

- **LOCAL_SETUP_GUIDE.md** - Detailed local setup instructions
