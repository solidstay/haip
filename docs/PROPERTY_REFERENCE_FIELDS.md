# Property reference fields

Add property and Property settings use Base UI searchable selectors for countries, currencies and timezones. Human-readable names resolve to canonical stored codes. Country/currency membership is also validated at the HTTP boundary on create and patch; timezone validation accepts supported IANA aliases. Shared lists are generated from the installed validator.js country data and Node ICU currency/timezone data; provenance is recorded in `packages/shared/src/property-reference.ts`. No reference service account is required.

Optional address search uses Photon/OpenStreetMap. Staff explicitly submit a search, select a result and review editable fields before saving. Address search returns only provider-supplied fields. Choosing a new address replaces address fields, including missing fields with blanks, to avoid mixing two addresses. Operational/public address controls remain separate.

The authenticated `/api/v1/properties/location-search` route allows administrator and general-manager roles, reads no tenant records and uses fixed provider origins. It limits query length, result count, request timeout, redirects, country scope, and aggregate requests (one request per 1.1 seconds per API process). Up to 200 result sets are cached for 24 hours. Browser edits/country changes invalidate pending responses. No automatic queries are sent while typing. Manual entry remains available on lookup failure or missing coverage.

The public Photon endpoint permits reasonable use without availability guarantees: https://github.com/komoot/photon . The UI shows a compact source credit beside populated suggestions: OpenStreetMap for addresses. The empty form contains no provider paragraph. The free provider does not constitute a complete licensed postal-address database or proof that an accommodation exists. At materially larger deployment scale, review the provider limits and move to an appropriately operated service.

UK postal codes are trimmed, uppercased and spaced on save. Other countries retain their postal conventions. Existing rows are not migrated or overwritten merely by opening a form.

Postcode-only lookup was removed at the owner’s request. Postcodes remain editable manually or populated when present in an address suggestion. No paid provider is configured. Legacy `kind=postcode` requests are rejected before network access.
