# ⚡ Quick Start Guide

Get the Bunny Honey AI Chatbot running locally in 5 minutes.

## 1. Clone & Install

```bash
git clone <your-repo-url>
cd aichatbot
```

## 2. Set Up Database

1. Create Supabase account: https://supabase.com
2. Create new project
3. Run `database/schema.sql` in SQL Editor
4. Copy connection string from Settings → Database

## 3. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
```env
OPENAI_API_KEY=sk-your-key
DATABASE_URL=your-supabase-url
CALENDLY_URL=your-calendly-link
CONTACT_EMAIL=your-email
CONTACT_PHONE=your-phone
ALLOWED_ORIGINS=http://localhost:5173
```

Start backend:
```bash
npm run dev
```

Should see: ✅ Server running on port 8080

## 4. Frontend Setup

New terminal:
```bash
cd frontend-widget
npm install
cp .env.example .env
```

Edit `.env`:
```env
VITE_BACKEND_URL=http://localhost:8080
VITE_CALENDLY_URL=your-calendly-link
```

Start frontend:
```bash
npm run dev
```

## 5. Test It!

1. Open http://localhost:5173
2. Click chat button (bottom-right)
3. Send a message
4. Should get AI response

## ✅ Checklist

- [ ] Supabase project created
- [ ] Schema migrated
- [ ] OpenAI API key added
- [ ] Backend running on 8080
- [ ] Frontend running on 5173
- [ ] Chat working

## 🚀 Next Steps

- Read [README.md](./README.md) for full documentation
- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- Customize colors in `frontend-widget/src/styles/widget.css`
- Adjust system prompt in `backend/src/config/index.ts`

## 🐛 Common Issues

**Port already in use:**
```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9
```

**Database connection fails:**
- Verify DATABASE_URL is correct
- Check Supabase project is active
- Ensure password is correct in connection string

**CORS errors:**
- Add `http://localhost:5173` to ALLOWED_ORIGINS
- Restart backend after .env changes

## 📞 Need Help?

Check the full [README.md](./README.md) and [DEPLOYMENT.md](./DEPLOYMENT.md)
