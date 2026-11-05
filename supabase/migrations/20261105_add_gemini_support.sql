-- ==============================================================================
-- Migration: Add Google Gemini AI Support & Multi-Model Toggle
-- Author & Developer: Alifu Haji (Individual Developer)
-- System: alifcrptoai Multi-Asset Autonomous Trading Engine
-- ==============================================================================

-- 1. Expand bot_config with Gemini parameters and AI provider toggle
ALTER TABLE bot_config
ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'deepseek' CHECK (ai_provider IN ('deepseek', 'gemini', 'auto')),
ADD COLUMN IF NOT EXISTS gemini_api_key_override TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS gemini_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash';

-- 2. Expand ai_audit_logs with model attribution
ALTER TABLE ai_audit_logs
ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'deepseek-chat';

-- 3. Expand trade_autopsies with model attribution
ALTER TABLE trade_autopsies
ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'deepseek-chat';
