# Staff invitations

Platform administrators open **Administration → Staff access**, choose **Invite staff member**, enter a name and email, select a role and properties, and send the invitation. The recipient verifies their email and chooses their own password in Keycloak. Setup links expire after 24 hours. The staff list shows pending, active and disabled accounts; administrators can resend pending invitations, change access and disable accounts.

The Property manager role is restricted to selected properties. Platform administrator grants access across the portfolio and website administration. Other roles reuse the native permission catalogue. The form exposes the role's permission descriptions before submission. Only an active administrator with staff and role administration grants at every affected property may change an invitation. A person cannot change or disable their own access here.

## Identity configuration

Use the staff realm already configured by KEYCLOAK_URL and KEYCLOAK_REALM. Configure its SMTP transport, dashboard callback and password policy. Do not enable public staff registration.

Set these API environment variables:

- STAFF_IDENTITY_CLIENT_ID: dedicated confidential service account client.
- STAFF_IDENTITY_CLIENT_SECRET: that client's protected secret.
- STAFF_INVITATION_CLIENT_ID: dashboard client (default haip-dashboard).
- STAFF_INVITATION_REDIRECT_URI: exact permitted HTTPS callback to the dashboard.

The service account requires realm-management **manage-users**, **view-users** and **query-users**. Disable interactive and direct grant flows. With fullScopeAllowed disabled, assign those same roles to the client's scope mappings as well as the service account. The application never assigns realm roles to invited users: their effective role and properties come from HAIP on each verified request.

In the realm's user profile, add **haip_staff_id**, with view/edit restricted to **admin** and maximum length 36. This ownership marker must be persisted by Keycloak and must never be editable by the account holder. Unknown unmanaged attributes can be silently dropped by Keycloak; an absent marker deliberately prevents account takeover. An existing unmarked sign-in account is never modified by an invitation.

The dashboard token must include the API audience and originate from an allowed dashboard client. Keycloak remains responsible for signature verification, email ownership, passwords and sessions. No password or setup link is stored in HAIP or returned to its dashboard.

## Persistence and recovery

Apply migration 0033 before deploying the API. It adds nullable provisioning state to native users. Existing users and service identities retain their existing authorization path. Invitation accounts are subject-linked and never matched by email fallback. Effective native grants and property membership are stored in the existing role tables. Reserved staff_invite_* roles are system-managed.

Email delivery and identity calls can fail after account creation. The durable staff row retains its status and offers retry; provisioning reconciles only an identity carrying the same ownership marker. A successful resend has a one-minute cooldown. A completed invitation is not sent another password action.

Disabling commits local denial first, then disables the owned identity and logs out its sessions. Remote failure leaves PMS access denied and exposes a retry action. Role/property changes apply on subsequent API requests and WebSocket broadcasts, including with an older token. Access edits use optimistic concurrency to avoid silently overwriting another administrator.

Legacy local-user administration remains available for existing identities. Managed invitation accounts link to Staff access and reject legacy role/status mutations, keeping login lifecycle and permissions consistent. This release does not migrate existing identities or re-enable disabled invitations.
