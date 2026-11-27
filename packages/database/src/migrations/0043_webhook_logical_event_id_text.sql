-- Durable outbox identities include provider and operation prefixes, not only UUIDs.
-- Preserve existing event keys and the subscription-scoped uniqueness index.
ALTER TABLE webhook_deliveries
  ALTER COLUMN logical_event_id TYPE text USING logical_event_id::text;
