-- Migration: Add Qwen Configuration and 3-Model AI Council Telemetry Columns
-- Date: 2026-11-07
-- Description: Adds Qwen AI credentials, base URL, model name, and 3-Model Council report columns to bot_config and ai_audit_logs

DO $$
BEGIN
    -- 1. Extend bot_config with Qwen AI credentials
    ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS qwen_api_key_override TEXT DEFAULT NULL;
    ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS qwen_base_url TEXT DEFAULT 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS qwen_model TEXT DEFAULT 'qwen3.7-flash';

    -- 2. Extend ai_audit_logs with Council Specialist Reports
    ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS gemini_report JSONB DEFAULT '{}'::JSONB;
    ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS qwen_report JSONB DEFAULT '{}'::JSONB;
    ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS deepseek_report JSONB DEFAULT '{}'::JSONB;
    ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS council_scores JSONB DEFAULT '{}'::JSONB;

    -- 3. Set default ai_provider to council_3model for existing singleton row
    UPDATE bot_config 
    SET ai_provider = 'council_3model'
    WHERE id = 1 AND (ai_provider IS NULL OR ai_provider = 'deepseek' OR ai_provider = 'auto');

END $$;
