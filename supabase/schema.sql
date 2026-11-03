-- ==============================================================================
-- alifcrptoai - Autonomous Crypto Trading Monorepo
-- Database Layer: PostgreSQL Schema & Realtime Configuration for Supabase
-- Author & Developer: Alifu Haji (Individual Developer)
-- ==============================================================================

-- Clean up existing objects if re-running
DROP VIEW IF EXISTS strategy_performance_view CASCADE;

-- 1. BOT CONFIGURATION TABLE (Single-Row Pattern)
CREATE TABLE IF NOT EXISTS bot_config (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    is_active BOOLEAN NOT NULL DEFAULT false,
    sandbox_mode BOOLEAN NOT NULL DEFAULT true,
    auto_apply_lessons BOOLEAN NOT NULL DEFAULT false,
    symbols TEXT[] NOT NULL DEFAULT ARRAY['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    active_strategies TEXT[] NOT NULL DEFAULT ARRAY[
        'SMC_Liquidity_Sweep', 
        'ICT_OrderBlock_FVG',
        'Supertrend_ADX_Momentum',
        'EMA_Trend_Pullback', 
        'BB_Volatility_Breakout', 
        'RSI_Divergence_Reversal'
    ],
    timeframe TEXT NOT NULL DEFAULT '15m',
    risk_pct NUMERIC NOT NULL DEFAULT 0.01 CHECK (risk_pct BETWEEN 0.0025 AND 0.02),
    min_score INT NOT NULL DEFAULT 75 CHECK (min_score BETWEEN 70 AND 95),
    min_rvol NUMERIC NOT NULL DEFAULT 1.2 CHECK (min_rvol BETWEEN 0.8 AND 2.5),
    enable_breakeven_partial BOOLEAN NOT NULL DEFAULT true,
    max_directional_exposure_pct NUMERIC NOT NULL DEFAULT 0.015,
    max_hold_bars INT NOT NULL DEFAULT 20,
    use_limit_maker_entry BOOLEAN NOT NULL DEFAULT true,
    max_funding_rate_pct NUMERIC NOT NULL DEFAULT 0.05,
    telegram_notifications BOOLEAN NOT NULL DEFAULT true,
    blocked_utc_hours INT[] NOT NULL DEFAULT ARRAY[]::INT[],
    quarantined_symbols TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    deepseek_model TEXT NOT NULL DEFAULT 'deepseek-chat',
    deepseek_base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com',
    binance_api_key_override TEXT DEFAULT NULL,
    binance_secret_override TEXT DEFAULT NULL,
    deepseek_key_override TEXT DEFAULT NULL,
    telegram_token_override TEXT DEFAULT NULL,
    telegram_chat_id_override TEXT DEFAULT NULL,
    panic_close_all BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure default singleton configuration exists
INSERT INTO bot_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 2. ACCOUNT SNAPSHOTS TABLE
CREATE TABLE IF NOT EXISTS account_snapshots (
    id BIGSERIAL PRIMARY KEY,
    equity_usdt NUMERIC NOT NULL DEFAULT 0,
    free_usdt NUMERIC NOT NULL DEFAULT 0,
    daily_pnl_usdt NUMERIC NOT NULL DEFAULT 0,
    daily_pnl_pct NUMERIC NOT NULL DEFAULT 0,
    open_positions JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_snapshots_created_at 
    ON account_snapshots (created_at DESC);

-- 3. AI AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS ai_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    strategy_name TEXT NOT NULL,
    proposed_direction TEXT NOT NULL,
    total_score INT NOT NULL,
    veto_triggered BOOLEAN NOT NULL DEFAULT false,
    veto_reason TEXT DEFAULT NULL,
    rubric_breakdown JSONB NOT NULL DEFAULT '{}'::JSONB,
    market_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    news_context JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_created_at 
    ON ai_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_symbol_strat 
    ON ai_audit_logs (symbol, strategy_name);

-- 4. TRADE EXECUTIONS TABLE
CREATE TABLE IF NOT EXISTS trade_executions (
    id BIGSERIAL PRIMARY KEY,
    exchange_order_id TEXT,
    sl_order_id TEXT,
    tp_order_id TEXT,
    symbol TEXT NOT NULL,
    strategy_name TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    initial_qty NUMERIC NOT NULL,
    qty NUMERIC NOT NULL,
    entry_price NUMERIC NOT NULL,
    exit_price NUMERIC,
    stop_loss NUMERIC NOT NULL,
    take_profit NUMERIC NOT NULL,
    breakeven_activated BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'CLOSED_TP', 'CLOSED_SL', 'TIME_STOP', 'MANUAL_CLOSE')
    ),
    pnl_usdt NUMERIC,
    pnl_r NUMERIC,
    mfe_r NUMERIC NOT NULL DEFAULT 0,
    mae_r NUMERIC NOT NULL DEFAULT 0,
    funding_rate_at_entry NUMERIC,
    entry_session_utc INT,
    entry_regime TEXT,
    entry_rvol NUMERIC,
    entry_scores JSONB NOT NULL DEFAULT '{}'::JSONB,
    autopsy_completed BOOLEAN NOT NULL DEFAULT false,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trade_executions_status 
    ON trade_executions (status);
CREATE INDEX IF NOT EXISTS idx_trade_executions_symbol 
    ON trade_executions (symbol);
CREATE INDEX IF NOT EXISTS idx_trade_executions_strategy 
    ON trade_executions (strategy_name);
CREATE INDEX IF NOT EXISTS idx_trade_executions_opened_at 
    ON trade_executions (opened_at DESC);

-- 5. TRADE AUTOPSIES TABLE
CREATE TABLE IF NOT EXISTS trade_autopsies (
    id BIGSERIAL PRIMARY KEY,
    trade_id BIGINT NOT NULL REFERENCES trade_executions(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    strategy_name TEXT NOT NULL,
    outcome TEXT NOT NULL,
    failure_category TEXT NOT NULL CHECK (
        failure_category IN (
            'premature_entry_before_sweep',
            'counter_htf_trend',
            'low_volume_fakeout',
            'stop_too_tight_for_atr',
            'greedy_target_reversal'
        )
    ),
    root_cause_analysis TEXT NOT NULL,
    recommended_rule_adjustment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_autopsies_trade_id 
    ON trade_autopsies (trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_autopsies_created_at 
    ON trade_autopsies (created_at DESC);

-- 6. BOT LESSONS & GUARDRAILS TABLE
CREATE TABLE IF NOT EXISTS bot_lessons (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL DEFAULT 'ALL',
    strategy_name TEXT NOT NULL DEFAULT 'ALL',
    weakness_detected TEXT NOT NULL,
    prompt_guardrail_rule TEXT NOT NULL,
    suggested_param_key TEXT,
    suggested_param_value JSONB,
    win_rate_impact TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'ACTIVE', 'DISMISSED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_lessons_status 
    ON bot_lessons (status);
CREATE INDEX IF NOT EXISTS idx_bot_lessons_strat_sym 
    ON bot_lessons (strategy_name, symbol);

-- 7. MARKET & MACRO NEWS TABLE
CREATE TABLE IF NOT EXISTS market_news (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    url TEXT DEFAULT NULL,
    coin TEXT NOT NULL DEFAULT 'MARKET',
    category TEXT NOT NULL DEFAULT 'crypto' CHECK (category IN ('crypto', 'macro')),
    sentiment TEXT NOT NULL DEFAULT 'NEUTRAL' CHECK (sentiment IN ('BULLISH', 'BEARISH', 'NEUTRAL')),
    impact TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (impact IN ('HIGH', 'MEDIUM', 'LOW')),
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_news_published_at 
    ON market_news (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_news_coin 
    ON market_news (coin);
CREATE INDEX IF NOT EXISTS idx_market_news_category 
    ON market_news (category);

-- 8. REAL-TIME STRATEGY PERFORMANCE VIEW
CREATE OR REPLACE VIEW strategy_performance_view AS
SELECT
    strategy_name,
    COUNT(CASE WHEN status IN ('CLOSED_TP', 'CLOSED_SL', 'TIME_STOP', 'MANUAL_CLOSE') THEN 1 END)::INT AS closed_trades,
    COUNT(CASE WHEN status = 'OPEN' THEN 1 END)::INT AS open_trades,
    COUNT(CASE WHEN status IN ('CLOSED_TP', 'CLOSED_SL', 'TIME_STOP', 'MANUAL_CLOSE') AND COALESCE(pnl_usdt, 0) > 0 THEN 1 END)::INT AS wins,
    COUNT(CASE WHEN status IN ('CLOSED_TP', 'CLOSED_SL', 'TIME_STOP', 'MANUAL_CLOSE') AND COALESCE(pnl_usdt, 0) < 0 THEN 1 END)::INT AS losses,
    ROUND(
        COALESCE(
            (COUNT(CASE WHEN status IN ('CLOSED_TP', 'CLOSED_SL', 'TIME_STOP', 'MANUAL_CLOSE') AND COALESCE(pnl_usdt, 0) > 0 THEN 1 END)::NUMERIC * 100.0) /
            NULLIF(COUNT(CASE WHEN status IN ('CLOSED_TP', 'CLOSED_SL', 'TIME_STOP', 'MANUAL_CLOSE') THEN 1 END), 0),
            0.0
        ),
        2
    ) AS win_rate_pct,
    ROUND(
        COALESCE(
            SUM(CASE WHEN status IN ('CLOSED_TP', 'CLOSED_SL', 'TIME_STOP', 'MANUAL_CLOSE') THEN pnl_usdt ELSE 0 END),
            0.0
        ),
        4
    ) AS net_pnl_usdt,
    ROUND(
        COALESCE(
            AVG(CASE WHEN status IN ('CLOSED_TP', 'CLOSED_SL', 'TIME_STOP', 'MANUAL_CLOSE') THEN pnl_r ELSE NULL END),
            0.0
        ),
        2
    ) AS avg_r_multiple,
    ROUND(
        COALESCE(
            SUM(CASE WHEN status IN ('CLOSED_TP', 'CLOSED_SL', 'TIME_STOP', 'MANUAL_CLOSE') AND pnl_usdt > 0 THEN pnl_usdt ELSE 0 END) /
            NULLIF(ABS(SUM(CASE WHEN status IN ('CLOSED_TP', 'CLOSED_SL', 'TIME_STOP', 'MANUAL_CLOSE') AND pnl_usdt < 0 THEN pnl_usdt ELSE 0 END)), 0),
            0.0
        ),
        2
    ) AS profit_factor
FROM trade_executions
GROUP BY strategy_name;

-- 9. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_autopsies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_news ENABLE ROW LEVEL SECURITY;

-- Clean existing policies before recreating
DROP POLICY IF EXISTS "Authenticated users full access to bot_config" ON bot_config;
DROP POLICY IF EXISTS "Authenticated users full access to account_snapshots" ON account_snapshots;
DROP POLICY IF EXISTS "Authenticated users full access to ai_audit_logs" ON ai_audit_logs;
DROP POLICY IF EXISTS "Authenticated users full access to trade_executions" ON trade_executions;
DROP POLICY IF EXISTS "Authenticated users full access to trade_autopsies" ON trade_autopsies;
DROP POLICY IF EXISTS "Authenticated users full access to bot_lessons" ON bot_lessons;
DROP POLICY IF EXISTS "Authenticated users full access to market_news" ON market_news;

DROP POLICY IF EXISTS "Service role full access to bot_config" ON bot_config;
DROP POLICY IF EXISTS "Service role full access to account_snapshots" ON account_snapshots;
DROP POLICY IF EXISTS "Service role full access to ai_audit_logs" ON ai_audit_logs;
DROP POLICY IF EXISTS "Service role full access to trade_executions" ON trade_executions;
DROP POLICY IF EXISTS "Service role full access to trade_autopsies" ON trade_autopsies;
DROP POLICY IF EXISTS "Service role full access to bot_lessons" ON bot_lessons;
DROP POLICY IF EXISTS "Service role full access to market_news" ON market_news;

DROP POLICY IF EXISTS "Anon read access to bot_config" ON bot_config;
DROP POLICY IF EXISTS "Anon read access to account_snapshots" ON account_snapshots;
DROP POLICY IF EXISTS "Anon read access to ai_audit_logs" ON ai_audit_logs;
DROP POLICY IF EXISTS "Anon read access to trade_executions" ON trade_executions;
DROP POLICY IF EXISTS "Anon read access to trade_autopsies" ON trade_autopsies;
DROP POLICY IF EXISTS "Anon read access to bot_lessons" ON bot_lessons;
DROP POLICY IF EXISTS "Anon read access to market_news" ON market_news;

-- Allow authenticated users full read/write access
CREATE POLICY "Authenticated users full access to bot_config"
    ON bot_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access to account_snapshots"
    ON account_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access to ai_audit_logs"
    ON ai_audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access to trade_executions"
    ON trade_executions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access to trade_autopsies"
    ON trade_autopsies FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access to bot_lessons"
    ON bot_lessons FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access to market_news"
    ON market_news FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow service_role full access bypass for backend worker/bot
CREATE POLICY "Service role full access to bot_config"
    ON bot_config FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to account_snapshots"
    ON account_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to ai_audit_logs"
    ON ai_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to trade_executions"
    ON trade_executions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to trade_autopsies"
    ON trade_autopsies FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to bot_lessons"
    ON bot_lessons FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to market_news"
    ON market_news FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon read access for dashboard display if needed
CREATE POLICY "Anon read access to bot_config"
    ON bot_config FOR SELECT TO anon USING (true);

CREATE POLICY "Anon read access to account_snapshots"
    ON account_snapshots FOR SELECT TO anon USING (true);

CREATE POLICY "Anon read access to ai_audit_logs"
    ON ai_audit_logs FOR SELECT TO anon USING (true);

CREATE POLICY "Anon read access to trade_executions"
    ON trade_executions FOR SELECT TO anon USING (true);

CREATE POLICY "Anon read access to trade_autopsies"
    ON trade_autopsies FOR SELECT TO anon USING (true);

CREATE POLICY "Anon read access to bot_lessons"
    ON bot_lessons FOR SELECT TO anon USING (true);

CREATE POLICY "Anon read access to market_news"
    ON market_news FOR SELECT TO anon USING (true);

-- 10. ADD TABLES TO SUPABASE REALTIME PUBLICATION SAFELY
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bot_config') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE bot_config;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'account_snapshots') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE account_snapshots;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ai_audit_logs') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE ai_audit_logs;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'trade_executions') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE trade_executions;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'trade_autopsies') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE trade_autopsies;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bot_lessons') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE bot_lessons;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'market_news') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE market_news;
        END IF;
    END IF;
END $$;

-- ==============================================================================
-- 11. MIGRATION BLOCK: Upgrades for Dynamic AI Base URL & Institutional Indicators
-- ==============================================================================
DO $$
BEGIN
    -- Add deepseek_base_url column if not present
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bot_config' AND column_name = 'deepseek_base_url'
    ) THEN
        ALTER TABLE bot_config ADD COLUMN deepseek_base_url TEXT DEFAULT 'https://api.deepseek.com';
    END IF;

    -- Update active_strategies column default to include all 6 strategies
    ALTER TABLE bot_config 
    ALTER COLUMN active_strategies SET DEFAULT ARRAY[
        'SMC_Liquidity_Sweep',
        'ICT_OrderBlock_FVG',
        'Supertrend_ADX_Momentum',
        'EMA_Trend_Pullback',
        'BB_Volatility_Breakout',
        'RSI_Divergence_Reversal'
    ];

    -- Update existing singleton row (id = 1) deepseek_base_url if NULL or empty
    UPDATE bot_config 
    SET deepseek_base_url = 'https://api.deepseek.com' 
    WHERE id = 1 AND (deepseek_base_url IS NULL OR deepseek_base_url = '');

    -- Ensure existing row 1 has the full set of 6 active strategies if previously set to legacy 4
    UPDATE bot_config 
    SET active_strategies = ARRAY[
        'SMC_Liquidity_Sweep',
        'ICT_OrderBlock_FVG',
        'Supertrend_ADX_Momentum',
        'EMA_Trend_Pullback',
        'BB_Volatility_Breakout',
        'RSI_Divergence_Reversal'
    ]
    WHERE id = 1 AND cardinality(active_strategies) <= 4;
END $$;
