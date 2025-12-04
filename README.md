# 🐰 Bunny Honey AI Chatbot

Production-ready AI chatbot system for Bunny Honey agency website, built with OpenAI Chat Completions API.

## 🎯 Overview

This is a full-stack AI chatbot solution that:

- Answers questions about Bunny Honey services (AI content, n8n automations, AI websites, consultancy)
- Acts as an intelligent sales assistant
- Collects lead data naturally during conversations
- Integrates seamlessly with Webflow sites
- Tracks conversations and leads in Supabase Postgres

## 📁 Project Structure

```
aichatbot/
├── backend/                 # Node.js + Express backend
│   ├── src/
│   │   ├── config/         # Configuration and database setup
│   │   ├── middleware/     # CORS, rate limiting, validation
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic (DB, OpenAI)
│   │   ├── types/          # TypeScript types
│   │   └── index.ts        # Server entry point
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── frontend-widget/        # React chat widget
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── styles/         # CSS styles
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # API client, session manager
│   │   └── embed.ts        # Widget entry point
│   ├── .env.example
│   ├── package.json
│   ├── vite.config.ts
│   └── index.html          # Development preview
│
└── database/
    └── schema.sql          # Supabase migration
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Supabase account
- OpenAI API key
- Railway account (for backend deployment)
- Vercel account (for frontend deployment)

### 1. Database Setup (Supabase)

1. Create a new project on [Supabase](https://supabase.com)
2. Go to SQL Editor and run the migration:

```bash
# Copy the contents of database/schema.sql and execute it in Supabase SQL Editor
```

3. Get your database connection string:
   - Go to Project Settings → Database
   - Copy the connection string (URI mode)
   - Replace `[YOUR-PASSWORD]` with your actual database password

### 2. Backend Setup

```bash
cd backend
npm install
```

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
CALENDLY_URL=https://calendly.com/your-link
CONTACT_EMAIL=contact@bunnyhoney.com
CONTACT_PHONE=+1234567890
ORG_NAME=Bunny Honey
PORT=8080
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://yourdomain.webflow.io
```

Run locally:

```bash
npm run dev
```

Test the API:

```bash
curl http://localhost:8080/api/health
```

### 3. Frontend Widget Setup

```bash
cd frontend-widget
npm install
```

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_BACKEND_URL=http://localhost:8080
VITE_CALENDLY_URL=https://calendly.com/your-link
```

Run locally:

```bash
npm run dev
```

Open http://localhost:5173 to see the widget in development mode.

### 4. Build for Production

**Backend:**

```bash
cd backend
npm run build
npm start
```

**Frontend:**

```bash
cd frontend-widget
npm run build
```

The built files will be in `frontend-widget/dist/`:
- `embed.js` - Main widget script
- `widget.css` - Styles

## 🌐 Deployment

### Deploy Backend to Railway

1. Create account on [Railway](https://railway.app)
2. Create new project → Deploy from GitHub
3. Select your repository
4. Set root directory to `backend`
5. Add environment variables in Railway dashboard:
   ```
   OPENAI_API_KEY
   DATABASE_URL
   CALENDLY_URL
   CONTACT_EMAIL
   CONTACT_PHONE
   ORG_NAME
   ALLOWED_ORIGINS
   NODE_ENV=production
   ```
6. Railway will auto-deploy on push
7. Note your backend URL: `https://your-app.railway.app`

**Build Configuration:**
- Build Command: `npm run build`
- Start Command: `npm start`
- Install Command: `npm install`

### Deploy Frontend to Vercel

1. Create account on [Vercel](https://vercel.com)
2. Import project from GitHub
3. Set root directory to `frontend-widget`
4. Build settings:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Add environment variables:
   ```
   VITE_BACKEND_URL=https://your-backend.railway.app
   VITE_CALENDLY_URL=https://calendly.com/your-link
   ```
6. Deploy!
7. Note your widget URL: `https://your-widget.vercel.app`

**IMPORTANT:** After deployment, update the `ALLOWED_ORIGINS` in Railway to include:
```
https://your-widget.vercel.app,https://yourdomain.webflow.io
```

## 🔗 Webflow Integration

Add this code to your Webflow site (Settings → Custom Code → Footer Code):

```html
<script
  src="https://your-widget.vercel.app/embed.js"
  data-backend-url="https://your-backend.railway.app"
  data-calendly-url="https://calendly.com/your-link"
></script>
```

The widget will appear as a floating chat button in the bottom-right corner.

### Custom Styling

The widget uses CSS custom properties that you can override:

```html
<style>
  .bh-widget-container {
    --bh-primary: #your-brand-color;
    --bh-primary-hover: #your-hover-color;
  }
</style>
```

## 🔒 Security Features

✅ **Environment Variable Protection**
- All secrets stay on the backend
- Frontend only receives public configuration

✅ **CORS Configuration**
- Whitelist specific domains
- Blocks unauthorized origins

✅ **Rate Limiting**
- 30 requests/minute per IP
- 10 requests/10 seconds per session

✅ **Input Validation**
- Session ID: 1-100 characters
- Message: 1-2000 characters
- SQL injection prevention via parameterized queries

✅ **Error Handling**
- Detailed server logs
- Generic client error messages
- No stack traces exposed

## 📊 Database Schema

### Tables

**leads**
- Stores contact information collected during conversations
- Fields: name, email, phone, business_type, company_name, interest_area, budget_range, preferred_contact_channel, notes

**conversations**
- Tracks chat sessions by browser session ID
- Links to leads when contact info is collected

**messages**
- Stores all chat messages (user and bot)
- Includes metadata (extracted lead JSON)

## 🤖 How Lead Extraction Works

1. User chats with the bot
2. OpenAI model maintains an internal JSON object with lead data
3. Every response includes a hidden `LEAD_JSON:` block
4. Backend parses this JSON and updates the database
5. Lead data accumulates naturally over the conversation

Example OpenAI response:
```
I'd be happy to help with your AI content needs! What's your company name?

LEAD_JSON: {"interest_area": "AI content", "business_type": "business"}
```

## 🧪 Testing

**Backend API Test:**

```bash
# Health check
curl http://localhost:8080/api/health

# Chat test
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test123","message":"Hello"}'
```

**Frontend Test:**
```bash
cd frontend-widget
npm run dev
```

Open http://localhost:5173 and test the chat interface.

## 📝 Environment Variables Reference

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | ✅ | OpenAI API key (sk-...) |
| `DATABASE_URL` | ✅ | Supabase Postgres connection string |
| `CALENDLY_URL` | ❌ | Calendly booking link |
| `CONTACT_EMAIL` | ❌ | Contact email address |
| `CONTACT_PHONE` | ❌ | Contact phone number |
| `ORG_NAME` | ❌ | Organization name (default: Bunny Honey) |
| `PORT` | ❌ | Server port (default: 8080) |
| `NODE_ENV` | ❌ | Environment (development/production) |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated list of allowed CORS origins |

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_BACKEND_URL` | ✅ | Backend API URL (for development) |
| `VITE_CALENDLY_URL` | ❌ | Calendly link (for development) |

**Note:** In production, frontend config comes from script tag attributes, not environment variables.

## 🎨 Customization

### Change Brand Colors

Edit `frontend-widget/src/styles/widget.css`:

```css
.bh-widget-container {
  --bh-primary: #8b5cf6;        /* Primary color */
  --bh-primary-hover: #7c3aed;  /* Hover state */
  --bh-secondary: #f3f4f6;      /* Secondary background */
  --bh-text: #1f2937;           /* Text color */
}
```

### Modify System Prompt

Edit `backend/src/config/index.ts` → `SYSTEM_PROMPT`

### Change AI Model

Edit `backend/src/services/openai.service.ts`:

```typescript
model: 'gpt-4o-mini', // Change to 'gpt-4o' for more advanced responses
```

## 🐛 Troubleshooting

### Widget not appearing on Webflow

1. Check browser console for errors
2. Verify script `data-backend-url` is correct
3. Ensure CORS is configured properly
4. Check that backend is running

### CORS errors

1. Add your domain to `ALLOWED_ORIGINS` in backend `.env`
2. Redeploy backend
3. Clear browser cache

### Database connection issues

1. Verify `DATABASE_URL` is correct
2. Check Supabase project is active
3. Ensure IP allowlist includes Railway IP (or enable "Allow all" in Supabase)

### Rate limiting errors

Adjust limits in `backend/src/middleware/rateLimiter.ts`

## 📦 Dependencies

### Backend
- `express` - Web framework
- `openai` - OpenAI API client
- `pg` - PostgreSQL client
- `cors` - CORS middleware
- `helmet` - Security headers
- `express-rate-limit` - Rate limiting
- `dotenv` - Environment variables

### Frontend
- `react` - UI framework
- `react-dom` - React DOM renderer
- `vite` - Build tool
- `typescript` - Type safety

## 📄 License

MIT

## 🤝 Support

For issues or questions:
- Check troubleshooting section
- Review error logs on Railway/Vercel
- Verify environment variables

## 🎉 Features

- ✅ Real-time chat with OpenAI GPT-4
- ✅ Natural lead collection
- ✅ Session persistence
- ✅ Mobile responsive
- ✅ Rate limiting
- ✅ CORS protection
- ✅ Error handling
- ✅ Loading states
- ✅ Auto-scroll
- ✅ Clean, modern UI
- ✅ Easy Webflow integration
- ✅ Production-ready
- ✅ TypeScript throughout

---

Built with ❤️ for Bunny Honey
