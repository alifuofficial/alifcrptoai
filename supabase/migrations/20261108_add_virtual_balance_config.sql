-- Migration: 20261108_add_virtual_balance_config.sql
-- Description: Adds simulated_equity to bot_config for Zero-Balance Virtual Capital configuration

DO $$
BEGIN
    -- 1. Add simulated_equity column if not present
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bot_config' 
        AND column_name = 'simulated_equity'
    ) THEN
        ALTER TABLE bot_config ADD COLUMN simulated_equity NUMERIC NOT NULL DEFAULT 1000.0;
    END IF;

    -- 2. Update default row 1 to have simulated_equity = 1000.0 if NULL
    UPDATE bot_config 
    SET simulated_equity = 1000.0 
    WHERE id = 1 AND simulated_equity IS NULL;
END $$;
