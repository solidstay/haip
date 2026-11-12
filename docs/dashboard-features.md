# Shared dashboard navigation

Administrators can open **Administration → Admin features** (`/admin/features`) to choose optional menu entries for all staff and all properties in this installation. **Use Essentials** selects the core property/photo, room, rate, reservation, enquiry and settings workflow. **Show all tools** selects every optional surface. Changes apply on Save; other sessions refetch within one minute or on window focus.

The Administration view has its own layout and return link. Ordinary staff see no entry point and direct visits redirect them to Properties before controls mount.

These are presentation preferences, not authorization. Existing API permissions, background services, operational data and direct links remain active. Booking-linked guest and folio details continue working. Users and Roles/Webhooks tabs follow the matching optional menu groups. Booking requests still require the existing deployment feature flag.

`DASHBOARD_DEFAULT_PROFILE=essentials` sets the initial baseline when no preference exists. The default is `full`, retaining existing navigation. Saved choices override that environment default, including an explicit empty Essentials list. If preferences cannot be loaded, core tools remain usable and a retry notice appears.

Migration 0031 adds a single installation-wide `dashboard_settings` row, deliberately outside property scope because it holds presentation configuration only. Authenticated staff can GET `/api/v1/admin/dashboard-features`; only the `admin` realm role can PUT `{ enabled: [...] }`. Allowed IDs are defined in the shared package. Writes and global audit records share a transaction. Concurrent saves use last committed selection; they never merge unrelated partial choices.

The Properties hub provides Add property and scoped links to property details/photos, room photos, pricing and reservations. File upload uses the existing media storage driver. No property is published or room inventory created merely by creating the property record.

Rollback can run an older application while retaining the additive table. Changing the default environment does not overwrite a saved choice; use the admin control/API to change that choice deliberately.
