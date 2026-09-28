-- Readings are never edited.
CREATE TRIGGER readings_no_update BEFORE UPDATE ON readings
BEGIN
  SELECT RAISE(ABORT, 'readings can''t be changed');
END;
--> statement-breakpoint
-- Arrival readings are never deleted; origin readings only before the proof is locked.
CREATE TRIGGER readings_delete_guard BEFORE DELETE ON readings
WHEN OLD.stage = 'arrival' OR (SELECT proof_locked_at FROM deals WHERE id = OLD.deal_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'readings can''t be removed');
END;
--> statement-breakpoint
CREATE TRIGGER readings_origin_insert_guard BEFORE INSERT ON readings
WHEN NEW.stage = 'origin' AND (SELECT proof_locked_at FROM deals WHERE id = NEW.deal_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'proof is locked for this deal');
END;
--> statement-breakpoint
-- The transit log is attached once and never changed.
CREATE TRIGGER transit_logs_no_update BEFORE UPDATE ON transit_logs
BEGIN
  SELECT RAISE(ABORT, 'the transit log can''t be changed');
END;
--> statement-breakpoint
CREATE TRIGGER transit_logs_no_delete BEFORE DELETE ON transit_logs
BEGIN
  SELECT RAISE(ABORT, 'the transit log can''t be removed');
END;
--> statement-breakpoint
-- Arrival is confirmed once.
CREATE TRIGGER deals_arrival_once BEFORE UPDATE OF arrived_at ON deals
WHEN OLD.arrived_at IS NOT NULL AND NEW.arrived_at IS NOT OLD.arrived_at
BEGIN
  SELECT RAISE(ABORT, 'arrival is already confirmed');
END;
