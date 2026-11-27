# Upstream synchronization — 2026-11-27

This upgrade merges upstream `0c6e5b17653dcc79d28840804aafd8bf68fc82c1` into fork main `d9183a8617d4ac944345ebac12a463c1d6240021`, preserving the existing fork history and operational changes. It includes upstream generic OIDC, property-scope reconciliation, guest check-in, Worldline and Connect payments, staff workflow improvements, reporting and housekeeping changes.

## Integration decisions

- Keep local disabled-identity enforcement for HTTP and WebSocket authentication. Opaque OIDC subjects now participate in the same status checks; previously accepted UUID spellings remain supported after the subject column changes to text.
- Preserve Stripe Checkout, invoices, refunds, event idempotency and the folio collection lock. Route signed checkout events by their existing ownership metadata so direct Checkout and Connect handlers both remain reachable.
- Retain direct booking holds, expiry, inventory locking, calendar polling and unit mapping, room-allocation guards, trusted guest reuse, scoped reporting and the staging seed entry point.
- Keep the existing folio invoice controls alongside upstream Worldline controls.

## Migration identities

The fork has already applied versions 0027–0030, and its property-configuration feature stack uses 0031. Never renumber those deployed migrations. Incoming upstream migrations are assigned unused fork versions:

| Upstream | Fork | Change |
| --- | --- | --- |
| 0027 | 0035 | Unique Worldline webhook key |
| 0028 | 0036 | Online check-in fields |
| 0029 | 0037 | Connect payment sessions |
| 0030 | 0038 | Widen charge tax-rate precision |
| 0031 | 0039 | Professions catalogue |
| 0032 | 0040 | OIDC subject UUID → text |
| 0033 | 0041 | Room status timestamp |
| 0034 | 0042 | Reservation card-guarantee metadata |

A regression check verifies unique tracked versions and preserves the existing fork migration identities. Future upstream syncs must reconcile migration numbers before running the migration entry point. This numbering applies to databases following this fork's history; an independently migrated upstream database needs separate reconciliation.

An isolated PostgreSQL upgrade from deployed source `f84b1b8` retained all ten existing migration ledger entries, synthetic property settings and a disabled linked user. All eight new migrations applied, the new columns/tables and widened types were verified, and replay applied no further changes. The source checkout and live databases were not used for writes.

## Durable delivery correction

Live adapter validation exposed an existing incompatibility: the payment outbox emits stable prefixed identities such as `haip:direct:<id>:0` and `stripe:<event>:0`, while webhook deliveries accepted only UUIDs. Migration 0043 widens that column to text while retaining its uniqueness index. Existing UUID delivery IDs survive the upgrade, duplicate retries still produce one delivery, and previously blocked outbox events drain after migration. The PostgreSQL regression exercises both identity formats with the real delivery service and a simulated queue.

## Rollout

Repository synchronization does not advance a deployment pin. The deployed property-configuration branch contains additional changes that must also be merged and validated before a rollout. Keep deployed commit pins until that candidate passes the guest/staff acceptance checks.

Upstream adds `ID_ENCRYPTION_KEY` to the production startup checks. Guest check-in also requires a production magic-link secret. Review these settings before enabling or deploying those paths; do not silently enable new payment gateways, check-in links or outbound notifications.

## Validation

- Frozen installation, full application workspace build, lint and type checks passed; existing lint warnings remain.
- Release smoke passed through availability, reservation, check-in, folio charge and night audit against the real API and PostgreSQL.
- The consuming guest adapter passed its 76 unit tests, then real HTTP catalogue/media/availability/quote and manual/card/enquiry create/replay/read checks. Manual/card cancellations passed. Card payments were simulated.
- PostgreSQL upgrade tests preserved deployed migrations and data and verified replay; webhook migration preserved existing deliveries and recovered pending outbox events.
- Local database validation used PostgreSQL 18; hosted CI uses PostgreSQL 16. External gateway credentials, external OIDC login, guest check-in email/wallet providers and the separate repo-control utility were not exercised. These checks establish source integration, not production acceptance of every incoming feature.
- Workspace results: **2,893 passing tests across 341 files**, excluding skipped cases. The broad run passed 2,892 tests/340 files; the added PostgreSQL outbox regression passed separately after that run had discovered its API files. Published counts include both successful reports.
