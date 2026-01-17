# Agency Studio

White-label AI content generation platform for agencies. Built on the same technology as Vixxxen, optimized for agency workflows.

## Features

- **Image Generation** - Seedream, Nano Banana Pro, Qwen models
- **Video Generation** - Kling, WAN, Veo models
- **Editing Tools** - Background removal, inpainting, object eraser
- **AI Chat** - Image analysis and captioning
- **Multi-tenant** - Each agency gets their own branded instance
- **Team Management** - Invite users, set roles, allocate credits
- **Credit System** - Agency credit pools with optional per-user limits

## Project Structure

```
agency-studio/
├── frontend/          # React + Vite frontend
├── backend/           # Express API server
├── database/          # SQL schema and migrations
└── docs/              # Documentation
```

## Quick Start

### Prerequisites

- Node.js 18+
- A Supabase project (create at supabase.com)
- API keys for AI services (Replicate, WaveSpeed, etc.)

### 1. Set up Supabase

1. Create a new Supabase project named "glowagency"
2. Go to SQL Editor and run the contents of `database/schema.sql`
3. Copy your project URL and keys from Settings > API

### 2. Configure Backend

```bash
cd backend
cp .env.template .env
# Edit .env with your Supabase credentials and API keys
npm install
```

### 3. Configure Frontend

```bash
cd frontend
cp .env.example .env
# Edit .env with your Supabase URL and anon key
npm install
```

### 4. Run Development Servers

```bash
# From root directory
npm install
npm run dev
```

This starts:
- Backend: http://localhost:3001
- Frontend: http://localhost:5173

### 5. Create Test User

1. Insert an invited user in Supabase:

```sql
INSERT INTO agency_users (agency_id, email, name, role, status)
VALUES (
    (SELECT id FROM agencies WHERE slug = 'demo'),
    'your-email@example.com',
    'Your Name',
    'owner',
    'invited'
);
```

2. Go to http://localhost:5173 and sign up with that email
3. The user will be automatically linked to the demo agency

## Development

### Backend Structure

```
backend/
├── server.js           # Express app entry point
├── config/             # Configuration management
├── middleware/         # Auth, agency resolution, credits
├── routes/             # API route handlers
└── services/           # Supabase, logging, etc.
```

### Frontend Structure

```
frontend/src/
├── components/         # Reusable UI components
├── pages/              # Page components
├── context/            # React context (auth, agency)
├── services/           # API client, Supabase
├── hooks/              # Custom React hooks
└── styles/             # Global styles, theme
```

## Theming

Agency branding is applied via CSS variables. Update `settings.branding` in the agency record:

```json
{
  "branding": {
    "logo_url": "https://...",
    "favicon_url": "https://...",
    "app_name": "My Studio",
    "primary_color": "#6366f1",
    "secondary_color": "#10b981"
  }
}
```

## Environment Variables

### Backend

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3001) |
| `NODE_ENV` | Environment (development/production) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `FRONTEND_URL` | Frontend URL for CORS |
| `REPLICATE_API_KEY` | Replicate API key |
| `WAVESPEED_API_KEY` | WaveSpeed API key |
| `GOOGLE_API_KEY` | Google AI API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |

### Frontend

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `VITE_API_URL` | Backend API URL (empty for same-origin) |

## Deployment

### Render

1. Create a new Web Service
2. Connect your repository
3. Set build command: `cd frontend && npm install && npm run build && cd ../backend && npm install`
4. Set start command: `cd backend && npm start`
5. Add environment variables
6. Deploy

### Custom Domain

For agency subdomains (`agency.yourdomain.com`):

1. Add a wildcard DNS record: `*.yourdomain.com` -> your server
2. Configure wildcard SSL (Let's Encrypt)
3. The app will automatically resolve agencies by subdomain

## License

Proprietary - All rights reserved.
