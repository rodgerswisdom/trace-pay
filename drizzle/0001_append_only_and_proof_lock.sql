-- Timeline events are append-only: nothing edits or deletes them.
CREATE TRIGGER events_no_update BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER events_no_delete BEFORE DELETE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
--> statement-breakpoint
-- Once a deal's proof is locked, its proof items can't be added, changed or removed.
CREATE TRIGGER proof_items_lock_insert BEFORE INSERT ON proof_items
WHEN (SELECT proof_locked_at FROM deals WHERE id = NEW.deal_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'proof is locked for this deal');
END;
--> statement-breakpoint
CREATE TRIGGER proof_items_lock_update BEFORE UPDATE ON proof_items
WHEN (SELECT proof_locked_at FROM deals WHERE id = OLD.deal_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'proof is locked for this deal');
END;
--> statement-breakpoint
CREATE TRIGGER proof_items_lock_delete BEFORE DELETE ON proof_items
WHEN (SELECT proof_locked_at FROM deals WHERE id = OLD.deal_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'proof is locked for this deal');
END;
--> statement-breakpoint
-- Proof can only be locked once.
CREATE TRIGGER deals_proof_lock_once BEFORE UPDATE OF proof_locked_at ON deals
WHEN OLD.proof_locked_at IS NOT NULL AND NEW.proof_locked_at IS NOT OLD.proof_locked_at
BEGIN
  SELECT RAISE(ABORT, 'proof is already locked');
END;
