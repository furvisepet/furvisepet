# Organic curated catalogue

Furvise can launch with manually verified, commission-neutral product records through the `organic_curated` ingestion mode. This is an internal review workflow, not an affiliate, retailer-feed, manufacturer-feed, or commercial-data relationship. Organic records remain fully eligible for product matching; ranking has no affiliate or monetization input.

## Permission contract and record evidence

An operator supplies a reviewed provider contract and a JSON product file:

```text
npm.cmd run catalog:organic -- preview contract.json products.json
npm.cmd run catalog:organic -- stage contract.json products.json
```

The contract contains an internal provider ID and display name, exact allowed hosts, CA/US market coverage, and the maximum fields that the review process may permit. It contains no credentials. Each product independently supplies:

- `sourceUrl`, pointing to the exact official manufacturer or legitimate retailer product page;
- `sourceMetadata.verificationDate`;
- `sourceMetadata.permissionReference` for the retained review evidence;
- `sourceMetadata.sourceUseStatus` (`permitted`, `restricted`, or `unresolved`);
- `sourceMetadata.permittedFields`, explicitly listing what Furvise may display;
- safety declarations such as `ingredientsComplete`, `ingredientSensitiveMatching`, and `warningsApplicable` where relevant.

The adapter stores an immutable permission snapshot in the normalized record. Raw input, normalized payload, overrides, reviewer actions, and publication events continue through the existing append-only audit workflow. A public webpage alone does not establish reuse permission.

The separately governed fields are `product_names`, `factual_identifiers`, `furvise_summaries`, `copied_descriptions`, `destination_links`, `images`, `ingredients`, `warnings`, and `directions`. A summary must declare `summaryOrigin` as `furvise_original` or `source_copied`. Images are optional and are accepted only when `images` is explicitly permitted; otherwise the Shop uses its neutral Furvise placeholder. Product names, factual identifiers, Furvise-authored summaries, and outbound links are still permission-controlled per record.

## Publication gates

Only dog and cat records for CA or US are supported. Every record requires permitted source use, complete provenance, an exact allowlisted product URL, brand, exact product name, species, market, and a mapped category.

- Food, treats, chews, supplements, and other ingestibles require a non-empty full ingredient list and `ingredientsComplete: true`.
- Topicals require complete ingredients when ingredient-sensitive matching is enabled, and applicable cautions when `warningsApplicable: true`.
- Non-ingestible accessories may omit ingredients, but still require exact identity, species compatibility, market, category, and a valid product URL.

An organic product does not require an offer row. Its verified `sourceUrl` is the organic product-detail destination. The authenticated Shop route resolves that URL through a narrowly scoped security-definer function. The function returns only `product_id` and `validated_destination_url` after rechecking active publication, regional/species eligibility, provenance, permission, and the exact hostname; `product_sources` remains unreadable to clients. Organic records cannot publish `affiliateUrl`, unqualified prices, discounts, or asserted availability. Availability remains unknown. Price/currency/stock data belongs to a separately authorized, freshness-controlled provider workflow.

## Existing blocked batches

This mode does not approve, mutate, delete, or retroactively reclassify existing batches. In particular, the Purina Canada manual batch remains blocked: `source_use_status` is unresolved and its ingestible records do not contain complete ingredients. Missing images, directions, warnings, prices, GTINs, and manufacturer codes remain recorded quality gaps; none is invented or filled from an unapproved source. A reviewer cannot bypass source permission or ingestible safety gates by approving the batch.

In the Shop, organic products use the same recommendation presentation as other eligible products. Links say "View product"; unknown availability is not presented as in stock, and absent qualified offer data never produces live-price, lowest-price, or best-deal claims. The disclosure states that recommendations are selected for fit and Furvise may not earn a commission.
