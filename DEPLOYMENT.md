# 🚀 Deployment Guide

Complete step-by-step deployment instructions for the Bunny Honey AI Chatbot.

## 📋 Prerequisites Checklist

Before deploying, ensure you have:

- [ ] GitHub repository with the code
- [ ] Supabase account and project created
- [ ] OpenAI API key
- [ ] Railway account
- [ ] Vercel account
- [ ] Webflow site access
- [ ] Custom domain (optional)

## 1️⃣ Database Deployment (Supabase)

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Fill in:
   - Project name: `bunny-honey-chatbot`
   - Database password: (save this!)
   - Region: Choose closest to your users
4. Click "Create new project"
5. Wait for project to provision (~2 minutes)

### Step 2: Run Database Migration

1. In Supabase dashboard, go to "SQL Editor"
2. Click "New query"
3. Copy entire contents of `database/schema.sql`
4. Paste into SQL editor
5. Click "Run"
6. Verify tables created:
   - Go to "Table Editor"
   - You should see: `leads`, `conversations`, `messages`

### Step 3: Get Database Connection String

1. Go to "Project Settings" (gear icon)
2. Click "Database" in sidebar
3. Scroll to "Connection string"
4. Select "URI" mode
5. Copy the connection string
6. Replace `[YOUR-PASSWORD]` with your database password
7. Save this for Railway deployment

Example:
```
postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres
```

### Step 4: Configure Database Security (Optional)

For production, you may want to:
1. Go to "Authentication" → "Policies"
2. Review RLS (Row Level Security) settings
3. For this app, we're accessing via backend only, so RLS can be disabled

## 2️⃣ Backend Deployment (Railway)

### Step 1: Connect GitHub

1. Go to [railway.app](https://railway.app)
2. Sign up/login with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Authorize Railway to access your repos
6. Select your `aichatbot` repository

### Step 2: Configure Project

1. Railway detects your project
2. Click "Add variables" to set environment variables
3. Add these variables:

```env
OPENAI_API_KEY=sk-your-actual-key-here
DATABASE_URL=postgresql://postgres:PASSWORD@db.xxxxx.supabase.co:5432/postgres
CALENDLY_URL=https://calendly.com/your-actual-link
CONTACT_EMAIL=contact@bunnyhoney.com
CONTACT_PHONE=+1234567890
ORG_NAME=Bunny Honey
NODE_ENV=production
ALLOWED_ORIGINS=http://localhost:5173,https://your-widget.vercel.app,https://yourdomain.webflow.io
```

**Important Notes:**
- For `ALLOWED_ORIGINS`, you'll add your Vercel URL in next step
- For now, just add `http://localhost:5173`

### Step 3: Configure Build Settings

1. Click "Settings"
2. Set these values:
   - **Root Directory**: `backend`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Install Command**: `npm install`

### Step 4: Deploy

1. Click "Deploy"
2. Wait for build to complete (~2-3 minutes)
3. Check logs for errors
4. Look for: "✅ Server running on port 8080"

### Step 5: Get Backend URL

1. Go to "Settings" → "Domains"
2. Railway provides a URL like: `your-app.up.railway.app`
3. Copy this URL (you'll need it for frontend)
4. Test it: `https://your-app.up.railway.app/api/health`
   - Should return: `{"status":"ok",...}`

### Step 6: Custom Domain (Optional)

1. In "Domains", click "Add custom domain"
2. Enter your domain: `api.yourdomain.com`
3. Add DNS records as shown by Railway
4. Wait for DNS propagation (~10 minutes)

## 3️⃣ Frontend Deployment (Vercel)

### Step 1: Connect GitHub

1. Go to [vercel.com](https://vercel.com)
2. Sign up/login with GitHub
3. Click "Add New..." → "Project"
4. Import your GitHub repository
5. Select the repository

### Step 2: Configure Project

1. **Framework Preset**: Vite
2. **Root Directory**: `frontend-widget`
3. **Build Command**: `npm run build`
4. **Output Directory**: `dist`
5. **Install Command**: `npm install`

### Step 3: Add Environment Variables

Click "Environment Variables" and add:

```env
VITE_BACKEND_URL=https://your-backend.up.railway.app
VITE_CALENDLY_URL=https://calendly.com/your-link
```

Replace `your-backend.up.railway.app` with your actual Railway URL.

### Step 4: Deploy

1. Click "Deploy"
2. Wait for build (~1-2 minutes)
3. Vercel will provide a URL: `your-widget.vercel.app`
4. Copy this URL

### Step 5: Update Backend CORS

**CRITICAL STEP!**

Go back to Railway:
1. Open your backend project
2. Go to "Variables"
3. Edit `ALLOWED_ORIGINS`
4. Add your Vercel URL:

```env
ALLOWED_ORIGINS=https://your-widget.vercel.app,https://yourdomain.webflow.io
```

5. Save (Railway will auto-redeploy)

### Step 6: Test Widget

1. Visit: `https://your-widget.vercel.app`
2. You should see the development info page
3. Widget should appear in bottom-right
4. Click it and test chat functionality
5. Send a message - should get response from AI

### Step 7: Custom Domain (Optional)

1. In Vercel project, go to "Settings" → "Domains"
2. Add custom domain: `widget.yourdomain.com`
3. Configure DNS as instructed
4. Wait for SSL certificate (~10 minutes)

## 4️⃣ Webflow Integration

### Step 1: Get Embed Code

Your embed code should look like this:

```html
<script
  src="https://your-widget.vercel.app/embed.js"
  data-backend-url="https://your-backend.up.railway.app"
  data-calendly-url="https://calendly.com/your-link"
></script>
```

Replace:
- `your-widget.vercel.app` with your Vercel URL
- `your-backend.up.railway.app` with your Railway URL
- `your-link` with your actual Calendly link

### Step 2: Add to Webflow

1. Go to your Webflow project
2. Click "Project Settings" (gear icon)
3. Go to "Custom Code"
4. Scroll to "Footer Code"
5. Paste the embed code
6. Click "Save Changes"

### Step 3: Publish

1. Click "Publish" in top-right
2. Select your domain
3. Click "Publish to selected domains"
4. Wait for publish to complete

### Step 4: Test on Live Site

1. Visit your Webflow site
2. Wait a few seconds for widget to load
3. You should see chat button in bottom-right
4. Click and test conversation
5. Verify AI responds correctly

### Step 5: Add Domain to CORS (If Needed)

If you get CORS errors:

1. Go back to Railway
2. Edit `ALLOWED_ORIGINS`
3. Add your Webflow domain:

```env
ALLOWED_ORIGINS=https://your-widget.vercel.app,https://yourdomain.webflow.io,https://yourdomain.com
```

4. Save and redeploy

## 5️⃣ Verification & Testing

### Backend Health Check

```bash
curl https://your-backend.up.railway.app/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 123.45
}
```

### Test Chat API

```bash
curl -X POST https://your-backend.up.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test123","message":"Hello"}'
```

Expected response:
```json
{
  "reply": "Hi! I'm the Bunny Honey Assistant...",
  "lead": null
}
```

### Test Frontend Widget

1. Visit your Vercel URL
2. Open browser console (F12)
3. Look for: "✅ Bunny Honey Widget initialized"
4. No errors should appear

### Test on Webflow

1. Visit live Webflow site
2. Open browser console
3. Verify no CORS errors
4. Test chat functionality
5. Send several messages
6. Verify responses are relevant

### Verify Database

1. Go to Supabase dashboard
2. Open "Table Editor"
3. Check `conversations` table - should have entries
4. Check `messages` table - should have user and bot messages
5. Check `leads` table - test by providing contact info in chat

## 6️⃣ Post-Deployment

### Monitor Logs

**Railway (Backend):**
1. Go to project dashboard
2. Click "Deployments"
3. Click latest deployment
4. View logs in real-time
5. Watch for errors

**Vercel (Frontend):**
1. Go to project dashboard
2. Click "Deployments"
3. Click latest deployment
4. Check "Functions" logs if needed

### Set Up Alerts

**Railway:**
1. Go to project settings
2. Enable "Deployment Notifications"
3. Add email or Slack webhook

**Vercel:**
1. Project Settings → "Notifications"
2. Enable "Deployment Notifications"

### Regular Maintenance

- **Weekly**: Check error logs
- **Monthly**: Review lead data in Supabase
- **Quarterly**: Update dependencies
- **As needed**: Adjust system prompt based on common questions

## 🔧 Troubleshooting

### Issue: Widget not loading

**Solution:**
1. Check browser console for errors
2. Verify script URL is correct
3. Check CORS configuration
4. Ensure backend is running

### Issue: CORS errors

**Solution:**
1. Add domain to `ALLOWED_ORIGINS`
2. Include both www and non-www versions
3. Redeploy backend after changes

### Issue: Chat not responding

**Solution:**
1. Check Railway logs for errors
2. Verify OpenAI API key is valid
3. Check OpenAI account has credits
4. Test `/api/health` endpoint

### Issue: Database errors

**Solution:**
1. Verify `DATABASE_URL` is correct
2. Check Supabase project is active
3. Ensure schema was migrated correctly
4. Check connection pooling limits

### Issue: Slow responses

**Solution:**
1. Check OpenAI API status
2. Consider upgrading Railway plan
3. Optimize database queries
4. Add caching if needed

## 📊 Monitoring

### Key Metrics to Watch

1. **Response Time**: Should be < 3 seconds
2. **Error Rate**: Should be < 1%
3. **Database Connections**: Monitor pool usage
4. **OpenAI Usage**: Track API costs
5. **Lead Conversion**: Track leads collected

### Tools

- **Railway**: Built-in metrics and logs
- **Vercel**: Analytics dashboard
- **Supabase**: Database metrics
- **OpenAI**: Usage dashboard

## 🎉 Success Checklist

- [ ] Backend deployed to Railway
- [ ] Frontend deployed to Vercel
- [ ] Database created on Supabase
- [ ] Migration executed successfully
- [ ] Environment variables configured
- [ ] CORS configured correctly
- [ ] Widget embedded on Webflow
- [ ] Chat functionality tested
- [ ] Leads saving to database
- [ ] OpenAI responding correctly
- [ ] No console errors
- [ ] Mobile responsive working
- [ ] Custom domains configured (if applicable)
- [ ] Monitoring set up
- [ ] Team trained on system

## 📞 Support

If you encounter issues:

1. Check logs first (Railway/Vercel)
2. Review this guide step-by-step
3. Check GitHub issues
4. Verify all environment variables
5. Test each component individually

---

Deployment complete! 🎉 Your Bunny Honey AI chatbot is now live!
