# Product provider 001: Purina Canada official-page review

## Decision

Provider 001 is `purina_ca_official_manual`, a reviewed CSV containing factual product identity and official Canadian links from Purina Canada. It is a manual source, not a scraper, API, feed, affiliate catalog, or claim of a commercial data licence.

This source was selected for its strong product identity, explicit dog taxonomy, and Canadian context. It is limited to food and dental products. Furvise does not add grooming, skin and coat, paw, or ear products from another provider merely to increase the first batch.

Commercial publication is currently blocked. Purina Canada's [Terms of Use](https://www.purina.ca/terms-of-use) permit browsing and limited reproduction but say website material may not be incorporated into another website or distributed for commercial gain. The staged records therefore use `source_use_status: unresolved`. Written permission or an authorized product feed agreement is required before these records can pass the publication gate.

## Options considered

| Provider or route | Access method | Permission or terms basis | Canada coverage | Categories | Available fields | Image-use status | Price / stock | Affiliate compatibility | Refresh | Expected quality | Effort / decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Official manufacturer structured feed or API | No Purina Canada product feed or public product API was found or configured | Would require a direct agreement | Strong if granted | Food, dental | Expected identity, labels, images, variants | Agreement required | Manufacturer feeds rarely prove retailer stock | Possible through separate retailer links | API/feed | High | Best long-term option, unavailable now |
| Impact product catalogs | Partner catalog download or API | Catalog access is available to accepted partners under the applicable brand relationship; see [Impact product catalogs](https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/marketing-content/product-marketplace-and-catalogs) | Campaign-dependent | Potentially broad | Identity, links, images, price, availability when supplied | Campaign-dependent | Often included but merchant-defined | Native | Feed/API | Medium to high | Project has site verification but no catalog credential or confirmed pet merchant catalog; not selected |
| Canadian pet distributors (Pet Science, Yamas, Canadian Pet Connection) | Approved retailer account/export or negotiated feed | Relationship and account approval required; [Pet Science](https://www.petscience.ca/about-us), [Yamas](https://yamas.ca/en/), and [Canadian Pet Connection](https://cpcpets.ca/become-a-retailer/) describe business-only access | Strong regional or national coverage | Broad pet catalog | Likely SKUs, wholesale price, stock, brand data | Contract-dependent | Strong after authorization | Usually not affiliate-oriented | Portal/export/feed | High | No authorized account or reusable export is configured; not selected |
| Retailer API/export | Negotiated API or merchant export | No unrestricted Pet Valu or PetSmart Canada product API was verified; access cannot be assumed | Strong | Broad | Retail identity, price, stock, links | Merchant-dependent | Strong | Potentially | API/export | High | Not selected without permission |
| Open Food Facts | Public API | ODbL database licence; source contribution quality varies | Filterable to Canada | Food only; pet coverage uncertain | Barcode, name, labels, images when contributed | Separate image attribution/licence obligations | Usually no authoritative retail stock or price | Weak | API | Low to medium | Legitimate open route but weaker identity and country certainty for this first safety-sensitive catalog |
| Purina Canada reviewed CSV | Manual transcription of factual identity and official links; no automated page retrieval | Internal evaluation is allowed by this task, but commercial republication rights are unresolved under [Purina terms](https://www.purina.ca/terms-of-use) | Explicit Canadian site; the terms say products and offers are intended for Canadian users | Dog food and dental | Name, brand, product form, official URL, Canadian taxonomy | Not authorized; omitted | Not authoritative; omitted | No | Full reviewed file | High identity / low completeness | Selected for staging and gate validation; blocked from publication pending permission |

Major retailers are not treated as unrestricted APIs. Distributor portals are not treated as feeds Furvise can reuse without an account and contract.

## Initial import manifest

The machine-readable manifest is `data/product-providers/purina-ca-001/manifest.json`.

- Country: CA
- Species: dog
- Expected records: 49
- Coverage: 40 distinct food formulas and 9 dental products
- Excluded: veterinary diets, prescription or medicated products, grooming, skin and coat, paw care, and ear care
- Prices authoritative: no
- Availability authoritative: no
- Images display permitted: no
- Canada evidence: an individual product page on the official Canadian hostname
- Source use: unresolved

The food count exceeds the preferred 20-30 because the selected provider does not cover the other desired categories and each row is a distinct formula, life-stage product, or breed-size formulation. Package sizes are not separate rows. One explicit variety-pack product is retained as a distinct commercial product.

## Provider boundary and safety

Provider-specific parsing lives in `PurinaCanadaManualAdapter`. It accepts only the exact documented UTF-8 CSV schema, at most 100 rows and 512 KiB. Each source URL must use HTTPS and the `purina.ca` or `www.purina.ca` hostname. Country must be CA and species must be an explicit dog value. Raw CSV rows are preserved unchanged.

No credentials are needed. The adapter does not fetch web pages, accept arbitrary URLs, transmit user or pet data, download images, or copy files into the repository. A general allowlisted fetch helper exists for a future authorized feed, but it is not used for this manual source.

## Quality outcome expected before staging

Every current row should be `blocked` because source-use permission is unresolved. Missing images, descriptions, ingredients, warnings, offers, prices, and stock are structured non-blocking quality gaps, but source permission is blocking. Product-name claim terms such as "Treats" are flagged for contextual human review; a flag is not an assertion that the source is false.

No reviewer may approve a blocked record. Batch approval never approves records. Publication re-runs the gate even after a stored approval.

## Secure workflow

Preview without database writes:

```powershell
npm.cmd run catalog:provider-001 -- preview
```

Create a fresh staging batch or perform a manual refresh:

```powershell
npm.cmd run catalog:provider-001 -- stage
npm.cmd run catalog:provider-001 -- refresh
```

Review:

```powershell
node --env-file=.env.local scripts/catalog-ingestion.mjs summary BATCH_ID
node --env-file=.env.local scripts/catalog-ingestion.mjs inspect RECORD_ID
node --env-file=.env.local scripts/catalog-ingestion.mjs review-claim RECORD_ID CLAIM_INDEX allow REVIEWER "Reason"
node --env-file=.env.local scripts/catalog-ingestion.mjs override RECORD_ID category '{"categorySlug":"food","sourceCategory":"Food","sourceSubcategory":"Dry Dog Food","subcategorySlug":"dry-food"}' REVIEWER "Reason"
node --env-file=.env.local scripts/catalog-ingestion.mjs resolve RECORD_ID create
node --env-file=.env.local scripts/catalog-ingestion.mjs approve BATCH_ID RECORD_ID REVIEWER "Reason"
node --env-file=.env.local scripts/catalog-ingestion.mjs reject BATCH_ID RECORD_ID "Reason"
```

Only after every intended record has passed individual review:

```powershell
node --env-file=.env.local scripts/catalog-ingestion.mjs approve-batch BATCH_ID
node --env-file=.env.local scripts/catalog-ingestion.mjs publish BATCH_ID
```

## Refresh and failure behaviour

A refresh always creates a new batch. It never deletes, deactivates, or changes a live product merely because a row is absent or source loading fails. Unchanged normalized records become `skip` proposals by stable provider record ID and hash. A changed or missing product remains reviewable. Discontinued status requires explicit source evidence and an audited reviewer action; absence from a file is not evidence.

This is not mass-catalog infrastructure. Scheduled jobs, provider monitoring, affiliate enrollment, offer refresh, price history, image rights/hosting, additional providers, and broader categories remain future work.
