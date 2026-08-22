### Test Case ID

TC_ORDERS_002

### Test Case Title

Order History page displays order cards with correct content for each past order

### Feature Area

Orders

### Priority

High

**Rationale:** Verifies all data fields on an order card are present and correctly formatted — missing fields directly impact a user's ability to review their purchase history.

### Preconditions

- Navigate to $BASE_URL
- User is logged in as $USER_NAME
- User has placed at least one order (TC_CHECKOUT_007 has been executed)
- Navigate to the Order History page by clicking "My Orders" in the navbar

### Test Steps

1. Read the subtitle text displayed below the "Order History" heading.
2. Locate the first order card.
3. Read the order number, date, status label, and total amount from the card header.
4. Read the product name, quantity/price text, and line total from an item row within the card.
5. Read the item count and total paid label from the card footer.

### Expected Result

1. The subtitle reads "X orders placed" (where X matches the number of past orders placed by the user).
2. The first order card is visible on the page.
3. The card header contains all of the following:
   - Order number in the format `ORD-XXXXXX` (6 digits, e.g. "ORD-793662")
   - Order date in the format "DD Month YYYY" (e.g. "26 July 2026")
   - Status badge: "Delivered"
   - Total amount in the format "LKR X.XX" (e.g. "LKR 50.00")
4. The item row contains:
   - The product name
   - Quantity and unit price (e.g. "Qty: 1 · LKR 50 each")
   - Line item subtotal (e.g. "LKR 50.00")
5. The card footer shows:
   - Item count (e.g. "1 item" or "2 items")
   - Total paid label: "Total paid: LKR X.XX"

### Notes and Assumptions

- Tags: Regression
- AC3: All four header data points (order number, date, status, total) must be present on every card.
- Order number is 6 digits (confirmed live 2026-07-26; earlier JSON reference of 8 characters was incorrect).
- The only confirmed status value is "Delivered".
- Product image presence is asserted through alt text — verify the image renders (not broken link).

### Defect Opportunity

- The order number may be truncated or formatted incorrectly.
- The date may use a different format (e.g. "2026-07-26" instead of "26 July 2026").
- The "Total paid:" footer label may not match the amount in the card header.
- A product image with a broken src will render as a broken image icon rather than the product thumbnail.
