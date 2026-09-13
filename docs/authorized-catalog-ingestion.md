# Authorized catalog ingestion readiness

Step 5A prepares a provider-neutral catalog adapter. It does not activate Impact, create a merchant relationship, grant content rights, or authorize publication.

## Provider contract

Every configuration records provider identity, agreement type and status, effective date, catalog-access status, allowed countries and hosts, file formats, content permissions, attribution, refresh limits, credential environment-variable names, and source trust. Agreement states are `pending`, `approved`, `suspended`, `expired`, and `rejected`. Only `approved` plus active catalog access can produce `sourceUseStatus: permitted`.

The adapter intersects provider-level permissions with the permissions attached to an individual export. Disallowed descriptions, images, prices, destination links, affiliate links, ingredients, warnings, and directions are omitted. Missing optional content can remain a quality gap. It does not become permission to ingest that content.

## Declarative mapping

Exact source aliases map common product, offer, label, and variant fields into `RawIngestionProduct`. Mapping is exact and case-sensitive. The adapter does not fuzzy-match. Multiple present aliases for one canonical field are ambiguous and enter review; missing required external ID, product name, or brand mappings also enter review or validation failure.

Structural templates exist for Impact-style catalogs, generic affiliate CSV/TSV, and generic distributor CSV. All templates are pending and deliberately non-publishable.

## Impact readiness

Impact's partner API documentation uses Account SID and Auth Token credentials with catalog endpoints under `/Mediapartners/{AccountSID}/Catalogs/{CatalogId}`. Furvise therefore reserves these server-only names:

- `IMPACT_ACCOUNT_SID`
- `IMPACT_AUTH_TOKEN`
- `IMPACT_CATALOG_ID`

The isolated module first requires an approved local agreement and active catalog-access configuration. It then retrieves catalog metadata, verifies Canadian service area when CA is requested, checks the campaign active-contract endpoint, and downloads at most 200 items. Requests use the `api.impact.com` allowlist, JSON content validation, response-size limits, timeouts, bounded retries, and bounded `Retry-After` handling. Feed hashing makes an unchanged response a no-op.

No Impact request is made by tests, previews, builds, or this task. Real use still requires an approved Impact partner account, an approved merchant relationship, catalog access, a catalog ID, scoped API credentials, and documented content rights.

Official references:

- [Impact catalog object](https://integrations.impact.com/impact-publisher/reference/the-catalogs-object)
- [Impact catalog items endpoint](https://integrations.impact.com/impact-publisher/reference/list-all-items-for-a-catalog)
- [Impact active contract endpoint](https://integrations.impact.com/impact-publisher/reference/download-active-contract)
- [Impact API rate limits](https://integrations.impact.com/impact-publisher/reference/rate-limits)

## Private manual upload

Place the approved feed, provider configuration, authorization metadata, and optional field mapping beneath the ignored `private/catalog-imports/` directory. Authorization metadata must include provider ID, merchant or brand, authorization reference, export date, country, format, permitted content types, and catalog ID when available.

Preview:

```powershell
npm.cmd run catalog:authorized -- preview provider.json authorization.json catalog.csv mapping.json
```

Stage after preview and authorization review:

```powershell
npm.cmd run catalog:authorized -- stage provider.json authorization.json catalog.csv mapping.json
```

Files outside the private directory, mismatched file extensions, pending or expired agreements, inactive catalog access, unauthorized countries, and permission claims beyond the provider contract are rejected by this operational workflow. Staging still uses the existing secure review, approval, and publication commands. Batch approval cannot bypass a blocked record.

## Offer freshness and links

Authorized offers retain fetch time, last-check time, export date, feed version, content hash, and stale threshold. A stale offer may retain its validated destination link, but its price is omitted and availability becomes unknown. Publication also clears a stale price instead of retaining it from an older feed.

Tracking URLs are preserved without adding parameters. They must be HTTPS, within the provider or merchant allowlist, credential-free, and within the length limit. Public link preference remains active affiliate URL, then retailer destination URL, then a permitted official product URL.

## Existing Purina review batch

The 49 Purina Canada rows remain blocked and preserved. This generic adapter does not retroactively authorize them. They may only be reconsidered after written permission or an authorized Purina catalog agreement is recorded and reviewed.
