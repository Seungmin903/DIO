ALTER TABLE diaries ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0);
-- Existing creation receipts remain creation snapshots, with the initial metadata version.
UPDATE diary_creation_requests
SET response_body = jsonb_set(response_body::jsonb, '{diary,version}', '"1"'::jsonb)::text
WHERE response_body IS NOT NULL AND NOT (response_body::jsonb -> 'diary' ? 'version');
