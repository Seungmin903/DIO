ALTER TABLE diary_invites ADD COLUMN retention_until TIMESTAMPTZ(6);

UPDATE diary_invites
SET retention_until = CASE
    WHEN invite_type LIKE 'EMAIL%' THEN created_at + INTERVAL '7 days'
    ELSE expires_at
END
WHERE retention_until IS NULL;

ALTER TABLE diary_invites ALTER COLUMN retention_until SET NOT NULL;
CREATE INDEX diary_invites_email_retention_idx
    ON diary_invites(retention_until, invite_id)
    WHERE invite_type LIKE 'EMAIL%';
