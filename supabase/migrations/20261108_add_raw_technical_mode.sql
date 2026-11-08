-- Migration: Add Raw Technical Strategy Mode to bot_config
-- Date: 2026-11-08
-- Description: Allows bot_config.ai_provider to accept 'technical' for direct mathematical trade execution

DO $$
BEGIN
    -- 1. Drop existing check constraint on ai_provider if it exists
    ALTER TABLE bot_config DROP CONSTRAINT IF EXISTS bot_config_ai_provider_check;

    -- 2. Add updated check constraint supporting 'technical' (Raw Technical Strategy Mode)
    ALTER TABLE bot_config ADD CONSTRAINT bot_config_ai_provider_check 
        CHECK (ai_provider IN ('council_3model', 'deepseek', 'gemini', 'auto', 'technical', 'raw_technical'));

END $$;
