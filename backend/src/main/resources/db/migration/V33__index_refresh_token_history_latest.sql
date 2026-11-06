-- Bound migration lock/build waits; transactional failure leaves existing data unchanged.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE INDEX refresh_token_history_token_rotated_idx
    ON refresh_token_history (token_id, rotated_at DESC);
