-- Migration: Conversation history for leads
-- Run in Supabase SQL editor.

-- Add conversation log column to pending_demands
-- Each entry: { role: 'client'|'agent', type: 'message'|'offer', text, ts, vehicleName?, priceTotal? }
ALTER TABLE pending_demands
  ADD COLUMN IF NOT EXISTS conversation JSONB NOT NULL DEFAULT '[]'::jsonb;
