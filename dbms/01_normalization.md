# Zomato Food Delivery: Normalization

This document normalizes the data exported for the Zomato food-delivery app.
The source files contain cities, localities, customers, restaurants, menu
items, delivery partners, coupons, orders, order items, payments, and reviews.
The design uses surrogate identifiers where the export already provides them
and keeps business identifiers such as `email`, `phone`, and `coupon_code`
unique. The primary goal of this process is to eliminate data redundancy, prevent update anomalies, and establish a robust relational schema.

## 0. Unnormalized starting point

A single order export could contain a row like:

```text
ORDER(
  order_id, customer_id, customer_name, customer_city, restaurant_id,
  restaurant_name, locality_name, city_name, coupon_code, coupon_details,
  item_1(item_id, item_name, quantity, unit_price),
  item_2(item_id, item_name, quantity, unit_price), ...,
  payment_1(payment_id, amount, method, status),
  payment_2(payment_id, amount, method, status), ...,
  review(review_id, customer_id, restaurant_id, food_rating,
         delivery_rating, review_text),
  placed_at, accepted_at, picked_up_at, delivered_at, status,
  item_total, delivery_fee, discount, total_amount
)
```

This representation has repeating groups (`item_1`, `item_2`, and multiple
payments), duplicated customer/restaurant/location data, and a multi-valued
`cuisines` attribute in the restaurant export. It is not in 1NF.

## 1NF: atomic values and one row per repeating item

To reach first normal form:

- Every field contains one value. The restaurant `cuisines` array becomes a
  separate row in `RestaurantCuisine(restaurant_id, cuisine)`.
- The repeating order-item group becomes one row per item in
  `OrderItem(order_id, item_id, quantity, unit_price)`.
- Payment attempts become one row per attempt in `Payment`.
- A review is one row in `Review`.
- No comma-separated lists or numbered columns are retained.

The resulting 1NF relations can still contain duplication:

```text
Order1NF(
  order_id, customer_id, customer_name, customer_email, customer_phone,
  customer_city_id, restaurant_id, restaurant_name, locality_id,
  locality_name, city_id, city_name, coupon_code, coupon_discount_pct,
  placed_at, accepted_at, picked_up_at, delivered_at, distance_km,
  item_total, delivery_fee, discount, total_amount, status
)

OrderItem1NF(order_id, item_id, item_name, quantity, unit_price)
Payment1NF(payment_id, order_id, amount, method, payment_status, attempted_at)
RestaurantCuisine1NF(restaurant_id, cuisine)
Review1NF(
  review_id, order_id, customer_id, restaurant_id, food_rating,
  delivery_rating, review_text, created_at
)
```

The key of `OrderItem1NF` is `(order_id, item_id)` because an item occurs at
most once in an order. `payment_id`, `review_id`, and `order_id` are keys for
their respective one-row entities (with at most one review per order).

## 2NF: remove partial dependencies

Second normal form requires 1NF and that every non-key attribute depend on the
whole key. The important composite key is `(order_id, item_id)` in the order
line relation:

- `item_name` depends only on `item_id`, not on the complete order-line key.
- The menu item's restaurant, category, price, and availability also depend
  only on `item_id`.
- `quantity` and the captured sale `unit_price` depend on the complete
  `(order_id, item_id)` relationship.

Decompose it into:

```text
MenuItem(
  item_id PK, restaurant_id FK, item_name, category, price,
  is_veg, is_bestseller, is_available
)

OrderItem(
  order_id PK/FK, item_id PK/FK, quantity, unit_price
)
```

The same principle applies to `RestaurantCuisine`: the cuisine value depends
on the full `(restaurant_id, cuisine)` key, while restaurant name and address
do not belong in that relation. Payment and review relations already use
single-column keys, so they have no partial dependencies.

## 3NF: remove transitive dependencies

Third normal form requires 2NF and that non-key attributes do not determine
other non-key attributes. The final relations are:

```text
City(
  city_id PK, city_name UNIQUE, state
)

Locality(
  locality_id PK, city_id FK, locality_name, pincode,
  UNIQUE(city_id, locality_name)
)

Customer(
  customer_id PK, full_name, email UNIQUE, phone UNIQUE,
  city_id FK, signup_date, is_gold_member, gold_expires_on, is_active
)

Restaurant(
  restaurant_id PK, name, locality_id FK, avg_cost_for_two, rating,
  rating_count, opens_at, closes_at, is_pure_veg, status, onboarded_on
)

RestaurantCuisine(
  restaurant_id PK/FK, cuisine PK
)

MenuItem(
  item_id PK, restaurant_id FK, item_name, category, price,
  is_veg, is_bestseller, is_available
)

DeliveryPartner(
  partner_id PK, full_name, phone UNIQUE, city_id FK, vehicle_type,
  joined_on, rating, status
)

Coupon(
  coupon_code PK, discount_pct, max_discount, min_order_value,
  valid_from, valid_to
)

Order(
  order_id PK, customer_id FK, restaurant_id FK, partner_id FK NULL,
  coupon_code FK NULL, placed_at, accepted_at, picked_up_at,
  delivered_at, distance_km, item_total, delivery_fee, discount,
  total_amount, status
)

OrderItem(
  order_id PK/FK, item_id PK/FK, quantity, unit_price
)

Payment(
  payment_id PK, order_id FK, amount, method, payment_status, attempted_at
)

Review(
  review_id PK, order_id FK UNIQUE, customer_id FK, restaurant_id FK,
  food_rating, delivery_rating, review_text, created_at
)
```

The main transitive dependencies removed are:

- `locality_id -> city_id`: city is stored once in `City` and linked through
  `Locality`; it is not repeated in `Restaurant`.
- `restaurant_id -> locality_id -> city_id`: a restaurant stores its locality,
  not a copied city name or city state.
- `customer_id -> city_id -> city_name/state`: a customer stores only the
  city foreign key, not copied city attributes.
- `partner_id -> city_id -> city_name/state`: the same applies to delivery
  partners.
- `item_id -> restaurant_id`: menu-item ownership is stored in `MenuItem`,
  not repeated as descriptive restaurant data in `OrderItem`.
- `coupon_code -> discount_pct, max_discount, min_order_value, valid dates`:
  coupon rules are stored once in `Coupon`.
- `order_id -> customer_id, restaurant_id`: review customer and restaurant
  references are retained for integrity and query convenience; application
  constraints must ensure they match the referenced order. They are not used
  as replacement copies of customer or restaurant attributes.

`OrderItem.unit_price` intentionally records the price charged at purchase
time. It is a transaction fact and must not be replaced by the current
`MenuItem.price`, which may change later.

## BCNF (optional)

The relations satisfy BCNF under these business rules:

- Each listed `PK` is a determinant.
- `email`, customer `phone`, partner `phone`, and `coupon_code` are candidate
  keys where marked `UNIQUE`.
- `(city_id, locality_name)` is an alternate key for `Locality`.
- `(order_id, item_id)` is the key for `OrderItem`.
- `(restaurant_id, cuisine)` is the key for `RestaurantCuisine`.
- `Review.order_id` is unique because an order receives at most one review.

Thus every non-trivial functional dependency has a determinant that is a
candidate key. If the application allows multiple reviews per order, remove
`UNIQUE(order_id)` and treat `review_id` as the sole key; the relation remains
in BCNF. If a business rule later makes a restaurant name unique, it may be
added as an alternate key, but it is not assumed here.

## Integrity assumptions

1. A menu item belongs to exactly one restaurant.
2. An order can contain a given menu item at most once; `quantity` represents
   repeated units.
3. An order may have multiple payment attempts but at most one review.
4. `OrderItem.unit_price` is the historical charged price.
5. Foreign keys enforce valid cities, localities, customers, restaurants,
   partners, coupons, menu items, orders, and reviews.
6. Boolean and status values use constrained PostgreSQL types or `CHECK`
   constraints in the final schema.

## Seed-data exceptions

The supplied CSV files contain three valid historical missing-value cases that
must be accepted by the schema:

- 124 restaurants have no `rating` value. A missing rating is different from a
  zero rating, so `restaurants.rating` is nullable.
- 21,405 reviews have no `review_text`. The review record and its numeric
  ratings are still usable, so `reviews.review_text` is nullable.
- 7,741 reviews have no `delivery_rating`. The food rating and review record
  remain valid, so `reviews.delivery_rating` is nullable.

Expired Gold members can also retain their historical `gold_expires_on` date
after `is_gold_member` becomes false. The schema therefore does not require
the expiry date to be null when membership is inactive.
