-- ========================================================
-- Nuxt Todo - Supabase Migration
-- Add subgroup / category support to the 'todos' table
-- ========================================================

-- 1. Aggiungi la colonna 'group_name' con valore predefinito 'Generale'
ALTER TABLE todos 
ADD COLUMN IF NOT EXISTS group_name TEXT DEFAULT 'Generale';

-- 2. Aggiorna eventuali record esistenti che hanno group_name nullo
UPDATE todos 
SET group_name = 'Generale' 
WHERE group_name IS NULL;

-- 3. (Opzionale) Indice per velocizzare i filtri per gruppo
CREATE INDEX IF NOT EXISTS idx_todos_group_name ON todos (group_name);
