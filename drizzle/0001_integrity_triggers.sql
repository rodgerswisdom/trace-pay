-- Integrity rules enforced by the database itself, whatever the app does.

-- Timeline events are append-only.
CREATE OR REPLACE FUNCTION tp_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'events are append-only';
END $$;
--> statement-breakpoint
CREATE TRIGGER events_no_update_delete BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION tp_events_append_only();
--> statement-breakpoint

-- Once a deal's proof is locked, its proof items can't be added, changed or removed.
CREATE OR REPLACE FUNCTION tp_proof_items_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT proof_locked_at FROM deals WHERE id = COALESCE(NEW.deal_id, OLD.deal_id)) IS NOT NULL THEN
    RAISE EXCEPTION 'proof is locked for this deal';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER proof_items_lock_guard BEFORE INSERT OR UPDATE OR DELETE ON proof_items
  FOR EACH ROW EXECUTE FUNCTION tp_proof_items_locked();
--> statement-breakpoint

-- Proof is locked once; arrival is confirmed once.
CREATE OR REPLACE FUNCTION tp_deals_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.proof_locked_at IS NOT NULL AND NEW.proof_locked_at IS DISTINCT FROM OLD.proof_locked_at THEN
    RAISE EXCEPTION 'proof is already locked';
  END IF;
  IF OLD.arrived_at IS NOT NULL AND NEW.arrived_at IS DISTINCT FROM OLD.arrived_at THEN
    RAISE EXCEPTION 'arrival is already confirmed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER deals_set_once BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION tp_deals_once();
--> statement-breakpoint

-- Readings are never edited; origin readings follow the proof lock; arrival readings are never removed.
CREATE OR REPLACE FUNCTION tp_readings_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  locked timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'readings can''t be changed';
  END IF;
  SELECT proof_locked_at INTO locked FROM deals WHERE id = COALESCE(NEW.deal_id, OLD.deal_id);
  IF TG_OP = 'DELETE' AND (OLD.stage = 'arrival' OR locked IS NOT NULL) THEN
    RAISE EXCEPTION 'readings can''t be removed';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.stage = 'origin' AND locked IS NOT NULL THEN
    RAISE EXCEPTION 'proof is locked for this deal';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER readings_guard BEFORE INSERT OR UPDATE OR DELETE ON readings
  FOR EACH ROW EXECUTE FUNCTION tp_readings_guard();
--> statement-breakpoint

-- The transit log is attached once and never changed.
CREATE OR REPLACE FUNCTION tp_transit_logs_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the transit log can''t be changed or removed';
END $$;
--> statement-breakpoint
CREATE TRIGGER transit_logs_fixed BEFORE UPDATE OR DELETE ON transit_logs
  FOR EACH ROW EXECUTE FUNCTION tp_transit_logs_fixed();
--> statement-breakpoint

-- Stored file bytes never change (removal of a mistaken, unlocked upload is allowed by the app).
CREATE OR REPLACE FUNCTION tp_files_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stored files can''t be changed';
END $$;
--> statement-breakpoint
CREATE TRIGGER files_no_update BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION tp_files_immutable();
