-- ============================================================================
-- Supabase Security Migration
-- Enable RLS and create policies for defense-in-depth
-- ============================================================================
-- Created: 2024-12-24
-- Purpose: Fix RLS disabled warnings and function search_path issues
-- ============================================================================

-- ============================================================================
-- PART 1: FIX FUNCTION SEARCH_PATH WARNING
-- ============================================================================

-- Drop existing function if exists
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- Recreate with locked search_path
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- ✅ FIX: Lock search_path to prevent SQL injection
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Add comment explaining the security fix
COMMENT ON FUNCTION update_updated_at_column() IS
'Updates the updated_at timestamp. Search path locked to public schema for security.';

-- ============================================================================
-- PART 2: ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 3: CREATE RLS POLICIES
-- ============================================================================
-- Strategy: Allow full access to authenticated backend service role
--          Block all anonymous/public access
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CONVERSATIONS TABLE POLICIES
-- ----------------------------------------------------------------------------

-- Policy: Allow backend service role full access
CREATE POLICY "Backend service has full access to conversations"
ON public.conversations
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: Block anonymous access (defense-in-depth)
CREATE POLICY "Block anonymous access to conversations"
ON public.conversations
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- MESSAGES TABLE POLICIES
-- ----------------------------------------------------------------------------

-- Policy: Allow backend service role full access
CREATE POLICY "Backend service has full access to messages"
ON public.messages
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: Block anonymous access (defense-in-depth)
CREATE POLICY "Block anonymous access to messages"
ON public.messages
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- LEADS TABLE POLICIES
-- ----------------------------------------------------------------------------

-- Policy: Allow backend service role full access
CREATE POLICY "Backend service has full access to leads"
ON public.leads
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: Block anonymous access (defense-in-depth)
CREATE POLICY "Block anonymous access to leads"
ON public.leads
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- ============================================================================
-- PART 4: RECREATE TRIGGERS (if they were dropped)
-- ============================================================================

-- Ensure triggers exist for updated_at columns
DO $$
BEGIN
    -- Conversations trigger
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_conversations_updated_at'
    ) THEN
        CREATE TRIGGER update_conversations_updated_at
            BEFORE UPDATE ON public.conversations
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Messages trigger (if it has updated_at)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages'
        AND column_name = 'updated_at'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_messages_updated_at'
    ) THEN
        CREATE TRIGGER update_messages_updated_at
            BEFORE UPDATE ON public.messages
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Leads trigger
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_leads_updated_at'
    ) THEN
        CREATE TRIGGER update_leads_updated_at
            BEFORE UPDATE ON public.leads
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- PART 5: GRANT PERMISSIONS
-- ============================================================================

-- Ensure service role has all necessary permissions
GRANT ALL ON public.conversations TO authenticated;
GRANT ALL ON public.messages TO authenticated;
GRANT ALL ON public.leads TO authenticated;

-- Revoke public/anon access (defense-in-depth)
REVOKE ALL ON public.conversations FROM anon, public;
REVOKE ALL ON public.messages FROM anon, public;
REVOKE ALL ON public.leads FROM anon, public;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify RLS is enabled
SELECT
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('conversations', 'messages', 'leads');

-- Expected output:
-- schemaname | tablename      | rowsecurity
-- -----------+----------------+-------------
-- public     | conversations  | t
-- public     | messages       | t
-- public     | leads          | t

-- Verify policies exist
SELECT
    schemaname,
    tablename,
    policyname,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('conversations', 'messages', 'leads')
ORDER BY tablename, policyname;

-- Expected output: 6 policies total (2 per table)

-- Verify function has locked search_path
SELECT
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE routine_name = 'update_updated_at_column'
AND routine_schema = 'public';

-- Expected: Function definition should contain SET search_path = public

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

-- To rollback this migration (NOT RECOMMENDED in production):
/*
ALTER TABLE public.conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend service has full access to conversations" ON public.conversations;
DROP POLICY IF EXISTS "Block anonymous access to conversations" ON public.conversations;
DROP POLICY IF EXISTS "Backend service has full access to messages" ON public.messages;
DROP POLICY IF EXISTS "Block anonymous access to messages" ON public.messages;
DROP POLICY IF EXISTS "Backend service has full access to leads" ON public.leads;
DROP POLICY IF EXISTS "Block anonymous access to leads" ON public.leads;
*/

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
