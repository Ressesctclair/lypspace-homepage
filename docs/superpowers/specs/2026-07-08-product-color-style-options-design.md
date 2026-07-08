# Product Color & Style Options — Design

## Problem

Custom products (admin-created, `custom_products` table) currently only support one variant dimension — Size — entered as flat rows in `admin-products.html`'s editor (`option1_name`/`option1_value` on each variant, per the existing Shopify-style schema `product.html` already partially supports). The admin wants to also offer Color and Style as selectable options, with stock tracked independently per exact combination (e.g. "S + Red" and "S + Blue" are separate counts).

Scope: **custom products only** — the 224 Shopify-imported catalog products (`products.json`) are out of scope; none of them currently use more than `option1` (Size), confirmed by inspecting `products.json`.

## Data model

No new column/table. Each variant object gains two more optional slots, reusing the existing `option{N}_name`/`option{N}_value` pattern `product.html` already partially implements for `option1`/`option2`:

```
{ option1_name: 'Size',  option1_value: 'S',   option2_name: 'Color', option2_value: 'Red',
  option3_name: 'Style', option3_value: 'Floral', price, qty }
```

**Fixed dimension assignment per product:** Size is always `option1` (required on every row), Color is always `option2` (optional — either every row for a product leaves it blank, or every row fills it in), Style is always `option3` (same rule). This avoids ambiguity in `product.html`'s grouping logic, which groups by option slot number across all of a product's variant rows — mixing meanings per slot within one product would scramble the rendered groups. A product that has no color variation simply leaves `option2_name`/`option2_value` blank on every row.

## Admin editor (`admin-products.html`)

Each row in "VARIANTS & STOCK QTY" changes from *[Type dropdown: Size/Color/Style] [Value] [Qty] [Delete]* to four independent fields: **Size / Color / Style / Qty**, plus the existing delete button. Size is required for a row to be saved (mirrors today's "value required" rule); Color and Style are optional per row, consistently across a product's rows per the rule above.

`getVariants()` builds each row's `option1_name/value` from the Size field (always), and conditionally adds `option2_name/value` (Color) and `option3_name/value` (Style) only when those fields are non-empty for that row.

## Storefront (`product.html`)

`product.html` already builds `optGroups` (option1) and `opt2Groups` (option2) from the variant list and renders one button-group per dimension; `selectVariant()` already matches on up to two simultaneously-selected dimensions and auto-highlights a paired option2 when only one exists for the resolved variant. This design generalizes that existing option1/option2 handling to also cover **option3** the same way:

- A third `opt3Groups` is built and rendered the same way as `optGroups`/`opt2Groups`.
- `selectVariant()`'s matching predicate gains a third condition (`m3`) mirroring `m1`/`m2`, and the auto-highlight-the-paired-option block extends to option3.
- `getVariantLabel()` appends `/ <option3_value>` when present, so cart/checkout line items read like "Product Name (S / Red / Floral)".

## Stock enforcement (bundled per user request, not previously covered)

Today, `validateVariant()` only blocks Add to Cart / Buy Now when no variant is selected at all — it does not check whether the *resolved* variant/combination has any stock left (`selectedVariant.qty <= 0`), even though the button for a depleted option is visually greyed out (`.var-btn.out`). This gap predates this feature (it already exists for Size-only products) but the user asked to fix it while this file is being touched:

`validateVariant()` gains an additional check: if a `selectedVariant` is resolved but its `qty <= 0`, show the existing `#variant-err` element with a "this combination is sold out" message and return `false`, blocking both `addToCart()` and `buyNow()` (both already call `validateVariant()` first and bail out on `false`).

## Out of scope

- No auto-generated combination grid (admin adds each combination row by hand) — this is Approach A from the design discussion; Approach B (a matrix generator) was explicitly not chosen.
- No changes to the 224 Shopify-imported catalog products or `product_overrides` — Color/Style are custom-products-only.
- No change to `admin-products.html`'s "Hidden"/"Unlisted" checkboxes or the Quick Payment Link panel — unrelated features, not touched by this work.
- No swatch/color-picker UI — Color is a free-text value exactly like Size is today (e.g. admin types "Red", not a hex/swatch picker).
