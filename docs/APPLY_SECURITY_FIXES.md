# How to Apply Supabase Security Fixes

## Quick Summary

✅ **What's being fixed**:
- Enable RLS on `conversations`, `messages`, `leads` tables
- Create policies allowing backend full access, blocking anonymous access
- Fix `update_updated_at_column()` function search_path warning

✅ **Is it safe**: YES - Backend uses `authenticated` role via DATABASE_URL, will continue working
✅ **Downtime required**: NO - Can apply without downtime

---

## Step 1: Apply SQL Migration

### Option A: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy contents of `supabase/migrations/001_enable_rls_and_policies.sql`
5. Paste into editor
6. Click **Run** (bottom right)
7. Verify output shows success messages

### Option B: Via Supabase CLI

```bash
# If you have Supabase CLI installed
cd /path/to/aichatbot
supabase db push
```

### Option C: Via psql (Direct PostgreSQL)

```bash
# Get your DATABASE_URL from backend/.env
# Run migration
psql "postgresql://postgres:[YOUR-PASSWORD]@[HOST]:5432/postgres" \
  -f supabase/migrations/001_enable_rls_and_policies.sql
```

---

## Step 2: Verify Migration Applied Successfully

### Check 1: RLS is Enabled

In Supabase SQL Editor, run:

```sql
SELECT
    tablename,
    rowsecurity as "RLS Enabled"
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('conversations', 'messages', 'leads');
```

**Expected output**:
```
 tablename     | RLS Enabled
---------------+-------------
 conversations | t
 messages      | t
 leads         | t
```

All should show `t` (true).

### Check 2: Policies Exist

```sql
SELECT
    tablename,
    policyname,
    roles
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('conversations', 'messages', 'leads')
ORDER BY tablename, policyname;
```

**Expected output**: 6 policies total (2 per table):
```
 tablename     | policyname                                    | roles
---------------+-----------------------------------------------+----------------
 conversations | Backend service has full access to...        | {authenticated}
 conversations | Block anonymous access to conversations      | {anon}
 leads         | Backend service has full access to leads     | {authenticated}
 leads         | Block anonymous access to leads              | {anon}
 messages      | Backend service has full access to messages  | {authenticated}
 messages      | Block anonymous access to messages           | {anon}
```

### Check 3: Function is Fixed

```sql
SELECT
    routine_name,
    security_type,
    routine_definition LIKE '%SET search_path%' as "Has Search Path Lock"
FROM information_schema.routines
WHERE routine_name = 'update_updated_at_column';
```

**Expected output**:
```
 routine_name              | security_type | Has Search Path Lock
---------------------------+---------------+---------------------
 update_updated_at_column  | DEFINER       | t
```

### Check 4: Backend Can Still Access Database

```bash
# From backend directory
cd backend
npx ts-node test-database.ts
```

**Expected output**:
```
✅ Connected to database
✅ Database connection test successful
✅ Table 'conversations' exists
✅ Table 'messages' exists
✅ Table 'leads' exists
✅ Database is properly configured!
```

---

## Step 3: End-to-End Testing

### Test 1: Chat Functionality

1. Open your Webflow site
2. Open browser DevTools → Network tab
3. Open chatbot widget
4. Send a test message
5. Verify:
   - ✅ Bot responds normally
   - ✅ Only `POST /api/chat` requests visible (to backend)
   - ❌ NO requests to `*.supabase.co` in Network tab

### Test 2: Lead Saving

1. Have a conversation that captures lead info:
   ```
   User: "Hi"
   Bot: [greeting]
   User: "I need YouTube automation"
   Bot: [asks budget]
   User: "5K"
   Bot: [asks name]
   User: "John"
   Bot: [asks email]
   User: "john@test.com"
   ```

2. Check Supabase Dashboard → Table Editor → `leads`
3. Verify new row exists with:
   - ✅ name: "John"
   - ✅ email: "john@test.com"
   - ✅ interest_area: "YouTube automation"
   - ✅ budget_range: "€1-5K"

### Test 3: Conversation History

1. Close chatbot widget
2. Reopen widget
3. Verify:
   - ✅ Conversation history loads from localStorage
   - ✅ Can continue conversation
   - ✅ Bot remembers name/email from previous messages

### Test 4: Backend Logs

Check backend logs for any errors. Should see:
```
✅ Connected to database
[Chat] ========== NEW CHAT REQUEST ==========
[DB] Found existing lead: ... with email: john@test.com
[Chat] ✅ Lead saved successfully - ID: ... Email: john@test.com
[Chat] ========== REQUEST COMPLETE ==========
```

❌ Should NOT see:
```
[DB] Error in ...
permission denied for table ...
RLS policy violation ...
```

---

## Step 4: Verify Security Settings in Supabase

### In Supabase Dashboard:

1. Go to **Database** → **Tables**
2. Click on `conversations` table
3. Check top-right corner - should show:
   ```
   RLS: ✅ Enabled
   Policies: 2 active
   ```
4. Repeat for `messages` and `leads`

### Verify Warnings are Gone:

1. Go to **Database** → **Advisors**
2. Check security warnings
3. ✅ Should NO LONGER see:
   - "RLS not enabled on public.conversations"
   - "RLS not enabled on public.messages"
   - "RLS not enabled on public.leads"
   - "Function update_updated_at_column has mutable search_path"

---

## Step 5: Browser Verification (No Supabase Access)

### Test Anonymous Access is Blocked:

1. Open browser console on Webflow site
2. Try to access Supabase directly (simulate an attack):

```javascript
// This should NOT work if security is properly configured
fetch('https://YOUR-PROJECT.supabase.co/rest/v1/leads', {
  headers: {
    'apikey': 'YOUR-ANON-KEY',
    'Authorization': 'Bearer YOUR-ANON-KEY'
  }
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

**Expected result**:
```
❌ 403 Forbidden or empty result (RLS blocking access)
```

**If you see data**: ⚠️ Security issue! RLS not properly configured.

---

## Troubleshooting

### Issue: Backend can't access database after migration

**Symptom**: `permission denied for table conversations`

**Solution**:
```sql
-- Grant permissions to authenticated role
GRANT ALL ON public.conversations TO authenticated;
GRANT ALL ON public.messages TO authenticated;
GRANT ALL ON public.leads TO authenticated;
```

### Issue: "tuple concurrently updated" error

**Symptom**: Race condition on lead updates

**Solution**: This is normal with concurrent requests. The backend handles it gracefully with transactions.

### Issue: Policies showing wrong role

**Symptom**: Backend connects as `postgres` not `authenticated`

**Solution**: Check your DATABASE_URL format:
```
# ✅ Correct (uses connection pooler with auth)
postgresql://postgres.xyz:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres

# ❌ Incorrect (direct connection, might use different role)
postgresql://postgres:[PASSWORD]@db.xyz.supabase.co:5432/postgres
```

Use the **connection pooling URL** from Supabase Dashboard → Project Settings → Database.

### Issue: Migration fails with "policy already exists"

**Solution**: Policies were already created. Drop them first:
```sql
DROP POLICY IF EXISTS "Backend service has full access to conversations" ON public.conversations;
-- ... (drop all 6 policies)
-- Then re-run migration
```

---

## Rollback Instructions

⚠️ **Only use if absolutely necessary**

If you need to rollback (NOT recommended in production):

```sql
-- Disable RLS
ALTER TABLE public.conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;

-- Drop policies
DROP POLICY IF EXISTS "Backend service has full access to conversations" ON public.conversations;
DROP POLICY IF EXISTS "Block anonymous access to conversations" ON public.conversations;
DROP POLICY IF EXISTS "Backend service has full access to messages" ON public.messages;
DROP POLICY IF EXISTS "Block anonymous access to messages" ON public.messages;
DROP POLICY IF EXISTS "Backend service has full access to leads" ON public.leads;
DROP POLICY IF EXISTS "Block anonymous access to leads" ON public.leads;
```

---

## Post-Migration Checklist

After applying migration, verify:

- [ ] RLS enabled on all 3 tables (conversations, messages, leads)
- [ ] 6 policies created (2 per table)
- [ ] Function search_path warning gone from Supabase dashboard
- [ ] Backend test-database.ts runs successfully
- [ ] Chatbot sends/receives messages normally
- [ ] Leads are saved to database
- [ ] No Supabase requests visible in browser Network tab
- [ ] Backend logs show no permission errors
- [ ] Supabase Advisors shows no security warnings

---

## Summary

**Before Migration**:
```
⚠️ RLS: Disabled
⚠️ Policies: None
⚠️ Anonymous: Can potentially access if anon key leaks
⚠️ Function: Has mutable search_path
```

**After Migration**:
```
✅ RLS: Enabled on all tables
✅ Policies: Backend has full access, anon blocked
✅ Anonymous: Cannot access any data
✅ Function: Locked to public schema
✅ Defense-in-depth: Multiple security layers
```

**Architecture unchanged**:
- Frontend → Backend API → Supabase (same as before)
- No client-side database access (same as before)
- Added RLS as extra security layer
