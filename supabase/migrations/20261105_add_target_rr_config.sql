-- Migration: Add target_rr to bot_config for dynamic Reward-to-Risk Ratio management (e.g. 1:2.5, 1:3, 1:5)
DO $$
BEGIN
    ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS target_rr NUMERIC(4, 2) NOT NULL DEFAULT 2.5;
    
    -- Ensure existing row 1 has default target_rr if NULL
    UPDATE bot_config 
    SET target_rr = 2.5 
    WHERE id = 1 AND target_rr IS NULL;
END $$;
