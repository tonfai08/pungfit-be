# Booking schemas

The booking module uses the project's existing MongoDB/Mongoose stack. All 18
model names, explicit collection names, and schema variable names start with
`bk_`. Load the complete registry with `require('../models/bk')`; the application
also registers it at startup. No existing model or collection is renamed.

## Collections

| Collection | Purpose |
| --- | --- |
| `bk_events` | Event content, publication/booking windows, venue and rules |
| `bk_layout_templates` | Reusable canvas dimensions and background |
| `bk_template_objects` | Template tables, chairs, stage, entrance and labels |
| `bk_event_layouts` | Independent event canvas copied from a template |
| `bk_event_layout_objects` | Event-specific canvas objects and parent relationships |
| `bk_event_table_types` | Capacity, THB price and limits per table category |
| `bk_event_tables` | Actual saleable tables linked to event canvas objects |
| `bk_users` | Booking identities and staff roles, independent from fitness users |
| `bk_sessions` | Hashed opaque staff sessions, CSRF tokens and absolute expiry |
| `bk_login_limits` | Expiring account/IP login rate-limit buckets |
| `bk_bookings` | Contact snapshot, booking lifecycle, total and deadlines |
| `bk_booking_items` | Reserved quantities per table type and price/capacity snapshots |
| `bk_table_assignments` | Concrete table allocations and release history |
| `bk_payment_submissions` | Slip submissions and approval/rejection history |
| `bk_waitlist_entries` | One requested table type per entry, contact and offer lifecycle |
| `bk_check_ins` | Incremental arrival counts per booking |
| `bk_files` | Upload metadata and public/private classification |
| `bk_audit_logs` | Actor, action, entity and sanitized change history |

## Storage conventions

- References use MongoDB ObjectIds, not SQL foreign keys or UUID primary keys.
  Mongoose `ref` enables population; it does **not** verify target existence.
- Money uses non-negative safe integers in satang: `price_satang`,
  `total_amount_satang`, `unit_price_satang`, `line_total_satang`, and
  `submitted_amount_satang`. For example, THB 2,000 = 200000 satang. Version one
  supports THB and one full approved payment per booking, not installments/refunds.
- Dates are UTC instants. The UI must send an offset and display using the event's
  IANA `timezone`, defaulting to `Asia/Bangkok`.
- Common timestamps are `created_at` and `updated_at`. Audit records only have
  `created_at`. Event layout `version` is Mongoose's optimistic concurrency key;
  other documents retain `__v`.
- Draft events may omit scheduling fields. Scheduled events require publication,
  booking and event timestamps; validation checks their ordering.
- New `bk_users` are customer profiles by default. Staff use email/password and
  roles `admin` or `super_admin`. `auth_uid` is optional and unique when supplied.
  Booking sessions are independent of fitness authentication. See [admin setup](bk-admin.md).
- Rich-text JSON and canvas presentation metadata are flexible JSON. Rendering
  must validate allowed nodes and sanitize HTML/URLs. Authoritative capacity,
  pricing and reservation state live in typed fields, not canvas JSON.
- Files default to private. This is metadata, not an access-control mechanism.
  Slips must be stored outside the existing public `/v1/uploads` directory and
  served through an authorized endpoint or short-lived signed URL.

## Constraints included here

Schemas validate required fields, enumerated states, finite canvas geometry,
positive integer quantities/capacities, exact line totals, booking deadlines,
payment review metadata and waitlist offer references. Unique indexes cover
event slugs, booking numbers, one layout per event, table codes within an event,
one inventory table per canvas object, and one line per booking/table type.

A partial unique index permits only one unreleased assignment per physical
table. Another permits only one approved payment submission per booking.
Index definitions only enforce uniqueness **after MongoDB builds the indexes**;
Mongoose validation alone cannot catch duplicate keys.

Use document `validate()`/`save()` for the custom pre-validation rules. Query
updates, bulk writes and direct MongoDB writes do not run these document hooks;
`runValidators: true` alone does not replace them. Optimistic concurrency applies
to document saves, not arbitrary query updates or multi-document operations.

## Required service layer before accepting bookings

The initial schema design below records the required transaction invariants.
The admin API now implements these workflows; see [implementation and remaining
scope](bk-admin.md). Public customer booking and live deployment remain separate.

1. Verify reference existence and that booking, table type, canvas, table,
   assignment and waitlist offer belong to the same event. Canvas parents must
   stay in the same layout and be acyclic; chairs can reference table parents.
   An inventory table must point to an object of kind `table`.
2. Copy template objects with fresh IDs and remap parent IDs. Changing a template
   must never mutate its event copies. Save child-object edits and increment the
   owning layout's version together; its version alone does not guard child writes.
3. Reserve quantities in `bk_booking_items` for pending holds, payment review and
   confirmed bookings. Assignments name the reserved tables; do not subtract them
   again. Available quantity = saleable tables minus effective reserved quantities.
4. Prevent concurrent overselling with serialized inventory writes per table type
   inside a transaction (for example, a transactional write to the shared type
   document before rechecking availability). A read/count followed by inserts,
   even in snapshot transactions without a common write conflict, is insufficient.
   MongoDB multi-document transactions require a replica set or sharded deployment.
5. Customer-selected tables must use matching active assignments in the same
   transaction as quantity reservation. Admin assignments must match the booked
   type and not exceed its quantity. Reassignment releases and allocates together.
6. A pending booking requires `hold_expires_at`; `payment_due_at` is the customer
   deadline. Receipt of timely evidence transitions to `payment_review` and keeps
   inventory reserved, typically clearing `hold_expires_at`. A rejected submission
   can return the booking to `pending_payment` with a new explicit deadline.
7. Expiry/cancellation must transition the booking and release its assignments
   atomically. Never TTL-delete bookings. Before reusing an expired hold's table,
   release its old assignment transactionally. Payment review/approval and expiry
   must contend on the same booking so they cannot race.
8. Compute prices and totals server-side; verify attendee capacity, event booking
   window, maximum quantities, matching currencies and submitted payment amount.
   Approval changes payment and booking together. Duplicate client retries need
   an idempotency mechanism at the API boundary.
9. A waitlist entry does not reserve inventory. Offering a slot creates a real
   pending booking with a hold deadline and links it to the entry atomically.
10. Serialize check-in increments for a booking; check confirmed status and the
    cumulative arrival limit in the same transaction. Derive partial/full check-in
    and assignment status instead of storing inconsistent duplicate states.
11. Restrict role changes and payment approvals; verify file ownership/privacy,
    prevent untrusted role assignment, and append sanitized audit entries with
    each mutation. Audit append-only behavior requires service/database permissions.
12. Do not delete referenced tables or reduce capacity after reservations exist.
    Blocked tables cannot invalidate existing reservations. Archive historical
    records instead of deleting them.

## Verification

Run `npm run test:bk` from `backend`. Schema tests inspect validation/references;
admin integration tests run HTTP requests against a disposable replica set to
exercise indexes, sessions and inventory/check-in concurrency.
When deploying, verify that the unique indexes are built before opening booking;
do not use `syncIndexes()` against existing unrelated collections.
