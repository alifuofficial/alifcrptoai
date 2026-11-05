-- ==============================================================================
-- Security Patch: Reinstate Row Level Security (RLS) & Access Controls
-- Author & Developer: Alifu Haji (Individual Developer)
-- System: alifcrptoai Multi-Asset Autonomous Trading Engine
-- ==============================================================================

-- 1. Re-enable Row Level Security on all core database tables
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_autopsies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_news ENABLE ROW LEVEL SECURITY;

-- 2. Drop insecure anon policies on sensitive configuration
DROP POLICY IF EXISTS "Anon read access to bot_config" ON bot_config;
DROP POLICY IF EXISTS "Anon read access to account_snapshots" ON account_snapshots;
DROP POLICY IF EXISTS "Anon read access to ai_audit_logs" ON ai_audit_logs;
DROP POLICY IF EXISTS "Anon read access to trade_executions" ON trade_executions;
DROP POLICY IF EXISTS "Anon read access to trade_autopsies" ON trade_autopsies;
DROP POLICY IF EXISTS "Anon read access to bot_lessons" ON bot_lessons;
DROP POLICY IF EXISTS "Anon read access to market_news" ON market_news;

-- 3. Ensure Authenticated Users (logged into Dashboard via Supabase Auth) have full access
DROP POLICY IF EXISTS "Authenticated users full access to bot_config" ON bot_config;
CREATE POLICY "Authenticated users full access to bot_config"
    ON bot_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access to account_snapshots" ON account_snapshots;
CREATE POLICY "Authenticated users full access to account_snapshots"
    ON account_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access to ai_audit_logs" ON ai_audit_logs;
CREATE POLICY "Authenticated users full access to ai_audit_logs"
    ON ai_audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access to trade_executions" ON trade_executions;
CREATE POLICY "Authenticated users full access to trade_executions"
    ON trade_executions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access to trade_autopsies" ON trade_autopsies;
CREATE POLICY "Authenticated users full access to trade_autopsies"
    ON trade_autopsies FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access to bot_lessons" ON bot_lessons;
CREATE POLICY "Authenticated users full access to bot_lessons"
    ON bot_lessons FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access to market_news" ON market_news;
CREATE POLICY "Authenticated users full access to market_news"
    ON market_news FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Ensure Service Role (Python Trading Engine & Next.js backend API) has unrestricted access
DROP POLICY IF EXISTS "Service role full access to bot_config" ON bot_config;
CREATE POLICY "Service role full access to bot_config"
    ON bot_config FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to account_snapshots" ON account_snapshots;
CREATE POLICY "Service role full access to account_snapshots"
    ON account_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to ai_audit_logs" ON ai_audit_logs;
CREATE POLICY "Service role full access to ai_audit_logs"
    ON ai_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to trade_executions" ON trade_executions;
CREATE POLICY "Service role full access to trade_executions"
    ON trade_executions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to trade_autopsies" ON trade_autopsies;
CREATE POLICY "Service role full access to trade_autopsies"
    ON trade_autopsies FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to bot_lessons" ON bot_lessons;
CREATE POLICY "Service role full access to bot_lessons"
    ON bot_lessons FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to market_news" ON market_news;
CREATE POLICY "Service role full access to market_news"
    ON market_news FOR ALL TO service_role USING (true) WITH CHECK (true);
