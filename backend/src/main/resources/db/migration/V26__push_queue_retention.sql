-- Existing terminal rows begin retention at migration time; no historical completion time is inferred.
ALTER TABLE push_outbox ADD COLUMN terminal_at TIMESTAMPTZ(6);
ALTER TABLE push_deliveries ADD COLUMN terminal_at TIMESTAMPTZ(6);

UPDATE push_outbox SET terminal_at = clock_timestamp() WHERE status IN ('COMPLETE','CANCELLED');
UPDATE push_deliveries SET terminal_at = clock_timestamp()
 WHERE status IN ('CANCELLED','FAILED') OR (status='SENT' AND result_code IN ('RECEIPT_OK','RECEIPT_UNKNOWN'));

CREATE FUNCTION push_outbox_terminal_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('COMPLETE','CANCELLED') THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN NEW.terminal_at := clock_timestamp(); END IF;
  ELSE NEW.terminal_at := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER push_outbox_terminal_time_trigger BEFORE INSERT OR UPDATE OF status ON push_outbox
 FOR EACH ROW EXECUTE FUNCTION push_outbox_terminal_time();

CREATE FUNCTION push_delivery_terminal_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('CANCELLED','FAILED') OR (NEW.status='SENT' AND NEW.result_code IN ('RECEIPT_OK','RECEIPT_UNKNOWN')) THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.result_code IS DISTINCT FROM NEW.result_code THEN NEW.terminal_at := clock_timestamp(); END IF;
  ELSE NEW.terminal_at := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER push_delivery_terminal_time_trigger BEFORE INSERT OR UPDATE OF status,result_code ON push_deliveries
 FOR EACH ROW EXECUTE FUNCTION push_delivery_terminal_time();

CREATE INDEX idx_push_outbox_retention ON push_outbox(environment,app_id,terminal_at,outbox_id) WHERE terminal_at IS NOT NULL;
CREATE INDEX idx_push_outbox_scoped_expiry ON push_outbox(environment,app_id,expires_at,outbox_id) WHERE environment IS NOT NULL;
