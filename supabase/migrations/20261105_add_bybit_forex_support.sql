-- ==============================================================================
-- Migration: Add Bybit API, Multi-Exchange Mode & Forex/CFD Asset Support
-- Author & Developer: Alifu Haji (Individual Developer)
-- System: alifcrptoai Multi-Asset Autonomous Trading Engine
-- ==============================================================================

-- 1. Ensure bot_config min_score check constraint allows 50-95 score range
DO $$
BEGIN
    ALTER TABLE bot_config DROP CONSTRAINT IF EXISTS bot_config_min_score_check;
    ALTER TABLE bot_config ADD CONSTRAINT bot_config_min_score_check CHECK (min_score BETWEEN 50 AND 95);
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 2. Expand bot_config with Bybit & Forex parameters
ALTER TABLE bot_config
ADD COLUMN IF NOT EXISTS exchange_mode TEXT NOT NULL DEFAULT 'binance' CHECK (exchange_mode IN ('binance', 'bybit', 'dual')),
ADD COLUMN IF NOT EXISTS bybit_api_key_override TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS bybit_secret_override TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS enable_forex_trading BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS forex_symbols TEXT[] NOT NULL DEFAULT ARRAY['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD'],
ADD COLUMN IF NOT EXISTS forex_max_leverage INT NOT NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS forex_weekend_shield BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS forex_rollover_shield BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS forex_max_spread_pips NUMERIC NOT NULL DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS panic_close_target TEXT NOT NULL DEFAULT 'ALL' CHECK (panic_close_target IN ('ALL', 'CRYPTO', 'FOREX'));

-- 3. Expand trade_executions with exchange & forex pip metrics
ALTER TABLE trade_executions
ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'binance' CHECK (exchange IN ('binance', 'bybit')),
ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto' CHECK (asset_class IN ('crypto', 'forex', 'commodity')),
ADD COLUMN IF NOT EXISTS pnl_pips NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS spread_at_entry NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS forex_session TEXT DEFAULT NULL;

-- 4. Expand ai_audit_logs with exchange & session context
ALTER TABLE ai_audit_logs
ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'binance',
ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto',
ADD COLUMN IF NOT EXISTS forex_session TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS spread_pips NUMERIC DEFAULT NULL;

-- 5. Create index for fast multi-exchange queries
CREATE INDEX IF NOT EXISTS idx_trade_executions_exchange ON trade_executions(exchange);
CREATE INDEX IF NOT EXISTS idx_trade_executions_asset_class ON trade_executions(asset_class);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_exchange ON ai_audit_logs(exchange);
