# Quantity Manual Input — Design

## Problem

On `product.html`, the Quantity control only lets a customer click `−`/`+` one at a time — there's no way to type a specific number directly, unlike the "jump to page" number input already used in `catalog.html`'s pagination. The admin wants typing enabled, with a live, non-blocking warning when the typed quantity exceeds available stock.

## Change

`product.html`'s quantity display (`<span class="qty-num" id="qty-display">1</span>`) becomes a real `<input type="number" min="1">`, styled like `catalog.html`'s `.pg-jump input` (bordered, centered), sitting between the existing `−`/`+` buttons exactly where the span is today.

**Stock reference:** whichever quantity currently governs sold-out state — `selectedVariant.qty` if a variant is selected, otherwise `product.total_qty`. This is the same value the existing `.out` button styling and Task 3's `validateVariant()` sold-out check already read.

**Live check, non-blocking:** on every input event, compare the typed number against the stock reference. If it exceeds stock, show red text "Exceeds stock" next to the input; otherwise hide it. This warning is purely informational — it does **not** block "Add to Cart" or "Buy Now" (per explicit instruction: the existing sold-out block from Task 3 only fires when the resolved variant/product has zero stock, not when a typed quantity merely exceeds a positive stock count — those are two different, independently-triggered checks).

**Invalid input handling:** an empty, zero, negative, or non-numeric value is treated as `1` (matching `changeQty`'s existing `Math.max(1, ...)` floor) and does not show the stock warning.

**`+`/`−` buttons:** unchanged behavior, just now they increment/decrement the input's value instead of a plain text span, and their handler also re-runs the same stock check so the warning stays in sync whether the customer types or clicks.

## Out of scope

- No change to `validateVariant()` or the Task-3 sold-out block/checkout enforcement — this is a separate, non-blocking warning.
- No change to `catalog.html`'s pagination input — only its visual style is being reused as a pattern reference.
- No maximum-quantity hard cap — a customer can still submit an order for more than is in stock (existing site behavior, unchanged by this design; only the visual warning is new).
