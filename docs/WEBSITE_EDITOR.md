# Optional website page editor

Set the dashboard build argument `VITE_WEBSITE_API_URL` to the HTTPS base URL of an external editorial service, e.g. `https://content.example.com/v1/admin/website`. When absent or invalid, the Website pages navigation is hidden. The editor lives under `/admin/website/pages` and only mounts for administrators. It uses the existing staff sign-in and refreshes the current Keycloak token before each request. Tokens are never stored by the editor or sent with redirects/cookies.

The external service must validate the staff issuer, `haip-api` audience, dashboard authorized party, administrator role, active identity, trusted write origin and payloads. It must allow CORS for the dashboard origin with Authorization and Content-Type. UI guards are not authorization.

## JSON contract

- `GET /pages` → `{pages: Page[]}`.
- `GET /media` → `{properties: [{slug, name, photos: [{filename, url, alt}]}]}`. Reuse existing published PMS media; do not duplicate uploads or storage.
- `PUT /pages/:id/draft`, `PUT /pages/:id/publish` accept `{revision, content}` and return the saved `Page`. Reject stale revisions with HTTP 409. Draft writes must never change public content; publication and its audit must be atomic.
- `POST /pages/:id/preview` → `{url, expiresInSeconds}`. The external website renders a short-lived snapshot of the saved draft. Preview must not publish content.

`Page` is `{id, label, revision, draft: Content, published: Content, updatedAt: string|null, publishedAt: string|null}`. `Content` is `{heading, description, photo: {propertySlug, filename}, actions: [{label, href}]}` with at most two actions. Page IDs contain lowercase letters, numbers and hyphens. Heading text is plain text and may include newlines. Links must be validated by the service. No custom HTML/CSS executes in the dashboard. An upload or property operation still belongs in the existing PMS property screens.

The service owns page definitions, defaults, content persistence, audit, validation and the public rendering. HAIP has no editorial database or website-specific copy. This optional interface does not depend on the selected operational property, and does not change PMS role or inventory models. Photos remain governed by the existing PMS catalogue/media policies.
