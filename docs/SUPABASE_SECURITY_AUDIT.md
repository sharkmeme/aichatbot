# Supabase Security Audit Report

**Date**: 2024-12-24
**Project**: Bunny Honey AI Chatbot
**Auditor**: Claude (Automated Security Review)

---

## Executive Summary

✅ **ARCHITECTURE IS SECURE** - No client-side database access detected
⚠️ **RLS DISABLED** - Tables lack Row Level Security policies (defense-in-depth issue)
⚠️ **FUNCTION WARNING** - `update_updated_at_column` has mutable search_path

---

## 1. Supabase Access Map

### Component: Webflow Embed Script
- **Location**: Footer of Webflow site (external)
- **Supabase Operations**: NONE
- **Keys Used**: NONE
- **Access Method**: Loads widget JavaScript from CDN/static hosting

### Component: Frontend Widget (React/Vite)
- **Location**: `/frontend-widget/src/`
- **Supabase Operations**: NONE
- **Keys Used**: NONE
- **Access Method**:
  - Makes HTTP POST requests to backend API (`/api/chat`)
  - Only knows `backendUrl` (passed via script tag attribute)
  - NO Supabase client code
  - NO environment variables with Supabase credentials
  - NO direct database access

**Verified in**:
- `frontend-widget/src/utils/api.ts` - Only HTTP fetch to backend
- `frontend-widget/.env.example` - Only `VITE_BACKEND_URL` (backend API)
- NO Supabase SDK imports anywhere in frontend code

### Component: Backend API (Node.js/Express)
- **Location**: `/backend/src/`
- **Supabase Operations**: Full CRUD on all tables
- **Keys Used**: `DATABASE_URL` (PostgreSQL connection string)
- **Access Method**:
  - Direct PostgreSQL connection via `pg` library
  - Connection pooling (`Pool` class)
  - Connects as database superuser/service role
  - NO Supabase JavaScript SDK used

**Tables Accessed**:
- `conversations` - SELECT, INSERT, UPDATE
- `messages` - SELECT, INSERT
- `leads` - SELECT, INSERT, UPDATE

**Verified in**:
- `backend/src/config/database.ts` - PostgreSQL pool setup
- `backend/src/services/database.service.ts` - Raw SQL queries
- `backend/.env.example` - `DATABASE_URL` only (no SUPABASE_URL or keys)

---

## 2. Current Security Posture

### ✅ STRENGTHS

1. **No Client-Side Database Access**
   - Frontend never touches Supabase directly
   - No Supabase anon key exposed to browser
   - No PostgREST API calls from client
   - All database operations go through authenticated backend API

2. **Proper API Architecture**
   - Clear separation: Frontend → Backend → Database
   - Backend validates and sanitizes all inputs
   - Rate limiting implemented (`sessionRateLimiter`)
   - CORS configured to restrict origins

3. **Session Management**
   - Sessions managed server-side
   - No sensitive data stored client-side (except localStorage conversation cache)

### ⚠️ WEAKNESSES (Defense-in-Depth Issues)

1. **RLS Disabled on All Tables**
   - `public.conversations` - No RLS policies
   - `public.messages` - No RLS policies
   - `public.leads` - No RLS policies
   - **Risk**: If DATABASE_URL leaks, attacker has unrestricted access
   - **Impact**: Medium (requires credential leak)

2. **Function Search Path Warning**
   - `update_updated_at_column()` has mutable search_path
   - **Risk**: Potential SQL injection if function is called with malicious context
   - **Impact**: Low (function is only used in triggers)

3. **No Backup Authentication Layer**
   - If backend API is compromised, no database-level restrictions exist

---

## 3. Risk Assessment

### Scenario 1: Webflow Site Compromised
**Likelihood**: Low
**Impact**: Low
**Reasoning**: Attacker could modify frontend widget, but widget has no database access. Would only affect UI/UX or phishing attacks.

### Scenario 2: Backend API Compromised
**Likelihood**: Medium
**Impact**: HIGH
**Reasoning**: Attacker gains full database access via API endpoints. No RLS to limit damage.

### Scenario 3: DATABASE_URL Leaked
**Likelihood**: Low
**Impact**: CRITICAL
**Reasoning**: Direct PostgreSQL access with no RLS = complete database compromise.

### Scenario 4: Insider Threat
**Likelihood**: Low
**Impact**: HIGH
**Reasoning**: Anyone with DATABASE_URL has unrestricted access.

---

## 4. Browser Network Tab Verification

**How to verify frontend doesn't access Supabase directly:**

1. Open Webflow site with chatbot
2. Open Chrome DevTools (F12) → Network tab
3. Clear network log
4. Open chatbot widget
5. Send a message
6. Check network requests

**Expected (Secure)**:
```
✅ POST https://your-backend-domain.com/api/chat
   - Request payload: { sessionId, message }
   - Response: { reply, lead }
```

**Not Expected (Would be insecure)**:
```
❌ POST https://abc123.supabase.co/rest/v1/...
❌ POST https://abc123.supabase.co/auth/v1/...
❌ WebSocket to supabase.co/realtime/...
```

**Current Status**: ✅ Only backend API calls visible

---

## 5. Recommendations

### Priority 1: Enable RLS (Defense-in-Depth)
- Enable RLS on `conversations`, `messages`, `leads`
- Create policies allowing service role full access
- Block all anonymous access

### Priority 2: Fix Function Search Path
- Lock `update_updated_at_column()` search_path to `public`

### Priority 3: Environment Variable Security
- Ensure DATABASE_URL is never committed to git
- Use secret managers in production (AWS Secrets Manager, etc.)
- Rotate credentials periodically

### Priority 4: Monitoring
- Log failed database connection attempts
- Monitor for unusual query patterns
- Set up alerts for RLS policy violations (when enabled)

---

## 6. Conclusion

**Overall Security Grade**: B+ (Good, but could be better)

The architecture is fundamentally secure with proper separation of concerns. The main risk is defense-in-depth: if the backend is compromised or credentials leak, there's no secondary protection layer.

**Recommended Actions**:
1. ✅ Enable RLS policies (included in this audit)
2. ✅ Fix function search_path (included in this audit)
3. Monitor backend logs for anomalies
4. Consider adding API key authentication for backend endpoints
5. Implement request signing for additional security

---

## Appendix: Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Webflow Site (Public)                                       │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ Footer Script: <script data-backend-url="...">       │   │
│ │ Loads: frontend-widget bundle                        │   │
│ └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ Loads JavaScript
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend Widget (React - Runs in Browser)                   │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ api.ts: HTTP POST to backend API                     │   │
│ │ NO Supabase client                                   │   │
│ │ NO database credentials                              │   │
│ └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS POST /api/chat
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend API (Node.js/Express)                               │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ database.service.ts: Raw SQL queries via pg library  │   │
│ │ Uses: DATABASE_URL (PostgreSQL connection string)    │   │
│ │ Connection: Direct to Supabase Postgres              │   │
│ └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ PostgreSQL protocol (port 5432)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Supabase (Cloud PostgreSQL)                                 │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ Tables: conversations, messages, leads               │   │
│ │ RLS: ❌ DISABLED (to be fixed)                       │   │
│ │ Access: Unrestricted for authenticated connections   │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Security Boundary**: Backend API is the ONLY component that can access the database. Browser has zero database access.
