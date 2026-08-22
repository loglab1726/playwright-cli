### Test Case ID

TC_CHECKOUT_018

### Test Case Title

Wishlisted item is removed from wishlist after it is purchased

### Feature Area

Checkout

### Priority

Medium

### Preconditions

- Navigate to $BASE_URL
- User is logged in as $USER_NAME
- Cart is empty
- Wishlist is empty (or note any existing wishlist items that will not be purchased)
- Navigate to a product page (e.g., `/product/2`)

### Test Steps

1. On the product page, click the "♡" (Add to wishlist) button to add the product to the wishlist.
2. Click the ♡ navbar link to go to the Wishlist page.
3. Check that the product appears in "My Wishlist" under "N item(s) saved".
4. Click the product card on the Wishlist page to navigate to the product detail page.
5. Select a size (e.g., "M").
6. Click the "Add to Cart" button.
7. Click the "✓ In Cart — View Cart" button to go to the cart page.
8. Click the "Proceed to Checkout" button.
9. Select "💵 Cash on Delivery" on Step 1 and click "Continue →".
10. Fill in the delivery details:
    - Street Address: "No. 45, Main Street"
    - City: "Colombo"
    - Phone: "+94 77 000 0000"
11. Click the "Confirm Order" button.
12. Wait for the success screen (Step 4) to appear.
13. Click the ♡ navbar link to go to the Wishlist page and check the wishlist contents.

### Expected Result

1. The "♡" button on the product page toggles to "♥" after clicking — the product is wishlisted.
2. The wishlist button shows "♥" (filled heart).
3. The wishlist page (`/wishlist`) loads and displays the product under "My Wishlist".
4. The product name is visible with "N item(s) saved" count.
5. The product detail page loads.
6. A size is selected and highlighted.
7. The "Add to Cart" button is clicked and the product is added to cart (button changes to "✓ In Cart — View Cart").
8. The cart page loads with the product visible.
9. The checkout modal opens on Step 1.
10. Cash on Delivery Step 2 form is displayed with delivery fields.
11. Delivery fields accept the entered values.
12. "Confirm Order" is clicked; the modal transitions to processing and then to the success screen displaying "Order Placed Successfully!" and an order number.
13. The purchased product is **no longer listed** in the wishlist — the wishlist shows "0 item(s) saved" or the "Your wishlist is empty" state.

### Notes and Assumptions

- Tags: Regression
- This test verifies AC9: "purchased items that were wishlisted are removed from the wishlist."
- The wishlist button locator on product cards: `getByRole('button', { name: '♡' })` (empty heart — adds to wishlist).
- Wishlisted state indicator: `button.item-wishlist-btn.wishlisted` with text "♥".
- Wishlist page heading: `getByRole('heading', { level: 1, name: 'My Wishlist' })`.
- Wishlist item count: `getByText(/\d+ item(s)? saved/)` (class: `wishlist-subtitle`).
- Empty wishlist heading: `getByRole('heading', { level: 2, name: 'Your wishlist is empty' })`.

### Defect Opportunity

- The purchased product may remain in the wishlist if the post-order wishlist cleanup logic is not triggered.
- Other wishlisted items (not purchased) must not be removed — only the purchased item should be cleared.
- The wishlist count badge in the navigation ("♡ N") may still show the old count even after the item is removed.
