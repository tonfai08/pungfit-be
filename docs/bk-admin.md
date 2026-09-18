# Booking admin

The admin UI is at `/booking-admin`; its isolated Express API is at `/v1/bk`.
Existing fitness authentication/routes are unchanged. All booking collections,
including `bk_sessions` and `bk_login_limits`, retain the `bk_` prefix.

## Run locally

1. Use Node.js 22.12 or newer for the backend (Docker uses Node 22), then install
   dependencies with `npm ci` in `backend` and `frontend`.
2. Configure backend `MONGO_URI` for a **replica set** (Atlas also works).
   Transactions are mandatory: a standalone `mongod` cannot accept booking writes.
   The existing app connects to `fitness_db`. Do not use a live database for tests.
3. Set `BK_ALLOWED_ORIGINS=http://localhost:3000` in the backend environment.
4. Run `npm run bk:create-super-admin` in `backend`. The command prompts for the
   email, display name and hidden password. It creates a new super admin, never
   overwrites an existing account, and does not print the password. Noninteractive
   provisioning may use `BK_BOOTSTRAP_EMAIL`, `BK_BOOTSTRAP_PASSWORD`, and
   `BK_BOOTSTRAP_NAME`; remove these variables after provisioning.
5. Start backend with `npm run dev` (port 5000).
6. Start frontend with `npm run dev` (port 3000), then visit
   `http://localhost:3000/booking-admin`.

Frontend `BK_API_ORIGIN` defaults to `http://127.0.0.1:5000`. It is a server-side
Next.js rewrite target, never a browser token. It is required for production builds. Set it before building/deploying
the frontend if the API runs on another host. The browser uses same-origin
`/bk-api/*`, including protected image requests.

## Production configuration

- Set backend `NODE_ENV=production` and serve the frontend over HTTPS. Session
  cookies are then `Secure`, with `HttpOnly`, `SameSite=Lax`, host-only scope and
  an 8-hour absolute expiry. Do not set a parent-domain cookie.
- Set `BK_ALLOWED_ORIGINS` to exact trusted frontend origins. There is no wildcard
  or production localhost fallback. Writes require both a trusted Origin and the
  session's CSRF token; login requires a trusted Origin too.
- Put `BK_UPLOAD_DIR` on persistent **private** storage outside `uploads/` and
  the web root; include it in backups. Images are decoded and re-encoded as WebP,
  limited to 6 MB / 25 million source pixels. File requests require staff auth.
- Build/verify the MongoDB unique indexes before opening booking. The application
  currently follows the repository's existing `autoIndex: true` policy.
- API requests should reach the backend only through trusted infrastructure;
  account-based login throttling remains effective independently of forwarding
  headers. A single account permits 20 login attempts per 15-minute bucket.
- Audit logs intentionally omit passwords, session tokens and slip contents.

## Roles and account management

| Capability | Admin | Super admin |
| --- | --- | --- |
| Events, private media, table types and layout templates | Yes | Yes |
| Bookings, payment review, assignments, waitlist, check-in | Yes | Yes |
| Customer contact records and audit history | Yes | Yes |
| Change own password | Yes | Yes |
| Create, disable, reset password or delete ordinary admins | No | Yes |
| Promote accounts or delete other super admins through the UI | No | No |

Additional super admins are provisioned through the server CLI. Deleting an
admin is a soft delete so past audits remain attributable. Disabled/deleted
accounts, password resets and logout invalidate sessions. Authorization loads
the current account and credential version for every request; the browser's
displayed role is never trusted. Customer contact records are not admin logins.

## Implemented workflows

- Create/edit draft or scheduled events with cover/poster images, sanitized rich
  text, venue, Thai time inputs, publication/booking/hide windows and terms.
- Drag/drop tables, chairs, stage, entrances and labels; edit coordinates, size,
  rotation, shape and capacity; duplicate/delete objects; undo edits; save a
  reusable template. Tables added in the editor also get chair objects.
  Table capacity is authoritative; changing it later does not auto-redraw chairs.
- Copy a template into a new event layout with fresh object IDs and remapped chair
  parents. Changes to the original template do not affect existing event layouts.
  Copied table types start at price zero; set their prices before taking bookings.
- Create table categories and prices; set table codes, zones and bookable flags.
  Existing active reservations prevent destructive inventory edits. Historical
  assignments prevent deleting/retyping their tables even after cancellation.
- Staff-created bookings can contain multiple categories. Quantities reserve
  inventory before table numbers are assigned. Amounts and capacities come from
  server-side type snapshots. Free bookings confirm immediately without a slip.
- Allocate/reallocate concrete tables, upload payment evidence, approve exact
  full payments, reject with a reason and new payment deadline, and check in
  groups incrementally. Cancelled paid bookings **do not automatically refund**.
- Record waitlist contacts, mark contacted/declined, offer a slot by atomically
  creating a real held booking, and open the resulting booking for follow-up.

Every event inventory write first updates a shared event revision in the same
transaction. This serializes conflicting bookings, table edits, payment review,
expiry and check-ins. Automatic expiry runs once a minute while the backend is
running and also before event mutations; inventory counts exclude elapsed holds
even before cleanup. The worker catches up on startup after downtime. No external
notification delivery is configured yet.

## Scope and limitations

This is the staff back office. A public customer booking page, public event
rendering, automated notifications, payment-gateway verification, refunds,
installments and seat-sharing are not part of this implementation. The event's
customer-select/admin-assign preference is stored for the future public flow;
staff can always allocate tables manually.

List endpoints currently cap events/templates at 200, bookings/contacts/waitlist
at 500, and audits at the latest 100. Server-side pagination is needed before
using the admin with larger datasets. Event times are entered in Asia/Bangkok.

## Tests

`npm run test:bk` uses a disposable `mongodb-memory-server` replica set, not the
configured `MONGO_URI`. First run downloads MongoDB 7.0.24 into ignored
`backend/.cache/mongodb`. Tests exercise real HTTP routes, cookie/CSRF/RBAC,
template independence, concurrent last-table booking, payment review,
concurrent check-in, expiry, waitlist and session revocation.

From `frontend`, run `npx tsc --noEmit`, scoped ESLint for the booking files,
and `npm run build`. Tests and previews must not seed a production database.

For a disposable visual preview, run `npm run bk:preview` in `backend`, then start
the frontend with `BK_API_ORIGIN=http://127.0.0.1:5101` on port 3100. Open
`http://127.0.0.1:3100/booking-admin` and use `preview@example.test` /
`Preview-only-593!`. This API binds to loopback, uses a fresh temporary database,
does not read `.env`, and loses its data when stopped. These credentials never
exist in the production setup. With the preview running, `npm run test:bk:browser`
uses installed Chrome to test the UI and writes screenshots to `.cache/browser`.
