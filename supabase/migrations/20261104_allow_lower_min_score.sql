-- Migration: Allow Min DeepSeek Score down to 50 for realistic macro conditions
-- Run this in your Supabase Dashboard -> SQL Editor

ALTER TABLE bot_config DROP CONSTRAINT IF EXISTS bot_config_min_score_check;
ALTER TABLE bot_config ADD CONSTRAINT bot_config_min_score_check CHECK (min_score BETWEEN 50 AND 95);
