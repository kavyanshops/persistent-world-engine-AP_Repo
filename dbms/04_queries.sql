-- =====================================================================
-- Zomato Food Delivery Application: Application SQL Queries Workload
-- Repository: AP Repo (persistent-world-engine-AP_Repo)
-- Checkpoint: CP3 (dbms/04_queries.sql)
--
-- Team Details:
--   Team No.: T0102 · Section: B
--   Group Lead: Kavyansh Saini (2501010216, kavyanshops)
--   Member 2:   Ansh Verma     (2501010069, ansh-v10)
--   Member 3:   Aditya Singh   (2501010027, opg857609-bot)
--   Member 4:   Rajat Soni     (2501010367, rajatsoni367)
--
-- Description:
--   Contains all SQL queries powering the Zomato food delivery application.
--   Queries utilize relational JOINs across normalized entities (3NF/BCNF).
--   Every query is classified as either -- READ or -- WRITE with unique IDs
--   (R1..R28, W1..W13) and descriptive headings matching CP4 timing requirements.
-- =====================================================================

SET search_path TO zomato;

-- =====================================================================
-- PART 1: CUSTOMER MODULE & DISCOVERY (READ QUERIES R1 - R12)
-- =====================================================================

-- @R1
-- READ: Customer login authentication by email with city details
SELECT c.customer_id, c.full_name, c.email, c.phone, c.is_gold_member,
       c.gold_expires_on, c.is_active, ci.city_id, ci.city_name, ci.state
FROM customers c
JOIN cities ci ON ci.city_id = c.city_id
WHERE c.email = 'Vivaan.Sharma1@Gmail.com'
  AND c.is_active = true;

-- @R2
-- READ: Customer profile and active delivery address lookup
SELECT c.customer_id, c.full_name, c.phone, c.is_gold_member,
       l.locality_id, l.locality_name, l.pincode, ci.city_name
FROM customers c
JOIN cities ci ON ci.city_id = c.city_id
JOIN localities l ON l.city_id = ci.city_id
WHERE c.customer_id = 1042
LIMIT 1;

-- @R3
-- READ: Home feed: Open restaurants in user's locality, best rated first
SELECT r.restaurant_id, r.name, r.cuisines, r.avg_cost_for_two,
       r.rating, r.rating_count, l.locality_name, ci.city_name
FROM restaurants r
JOIN localities l ON l.locality_id = r.locality_id
JOIN cities ci ON ci.city_id = l.city_id
WHERE l.locality_name = 'Koramangala'
  AND r.status = 'OPEN'
ORDER BY r.rating DESC NULLS LAST
LIMIT 20;

-- @R4
-- READ: Restaurant search by cuisine and city with locality info
SELECT r.restaurant_id, r.name, r.cuisines, r.avg_cost_for_two,
       r.rating, l.locality_name, ci.city_name
FROM restaurants r
JOIN localities l ON l.locality_id = r.locality_id
JOIN cities ci ON ci.city_id = l.city_id
WHERE ci.city_id = 6
  AND r.status = 'OPEN'
  AND 'Chinese' = ANY (r.cuisines)
ORDER BY r.rating DESC NULLS LAST
LIMIT 25;

-- @R5
-- READ: Dish search: Available matching dishes in customer city
SELECT m.item_id, m.item_name, m.category, m.price, m.is_veg,
       r.restaurant_id, r.name AS restaurant_name, l.locality_name
FROM menu_items m
JOIN restaurants r ON r.restaurant_id = m.restaurant_id
JOIN localities l ON l.locality_id = r.locality_id
WHERE l.city_id = 1
  AND m.is_available = true
  AND r.status = 'OPEN'
  AND m.item_name ILIKE '%paneer%'
ORDER BY m.price ASC
LIMIT 50;

-- @R6
-- READ: Restaurant page: Complete menu categorized and ordered with bestseller badges
SELECT m.item_id, m.category, m.item_name, m.price,
       m.is_veg, m.is_bestseller, m.is_available, r.name AS restaurant_name
FROM menu_items m
JOIN restaurants r ON r.restaurant_id = m.restaurant_id
WHERE r.restaurant_id = 217
  AND m.is_available = true
ORDER BY m.category, m.is_bestseller DESC, m.item_name;

-- @R7
-- READ: Coupon verification: Check validity, minimum order value, and discount rate
SELECT cp.coupon_code, cp.discount_pct, cp.max_discount, cp.min_order_value,
       cp.valid_from, cp.valid_to
FROM coupons cp
WHERE cp.coupon_code = 'DINNER150'
  AND CURRENT_DATE BETWEEN cp.valid_from AND cp.valid_to
  AND 540.00 >= cp.min_order_value;

-- @R8
-- READ: Cart checkout verification: Validate item availability and subtotal calculation
SELECT oi_check.item_id, m.item_name, m.price AS current_unit_price,
       m.is_available, r.restaurant_id, r.name AS restaurant_name, r.status AS restaurant_status
FROM menu_items m
JOIN restaurants r ON r.restaurant_id = m.restaurant_id
JOIN (VALUES (22241), (22242)) AS oi_check(item_id) ON oi_check.item_id = m.item_id
WHERE r.restaurant_id = 1113;

-- @R9
-- READ: Order live tracking: Status, ETA checkpoints, restaurant and delivery partner details
SELECT o.order_id, o.status, o.placed_at, o.accepted_at, o.picked_up_at, o.delivered_at,
       r.name AS restaurant_name, r.locality_id, l.locality_name AS restaurant_locality,
       dp.partner_id, dp.full_name AS partner_name, dp.phone AS partner_phone,
       dp.vehicle_type, o.distance_km, o.total_amount
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
JOIN localities l ON l.locality_id = r.locality_id
LEFT JOIN delivery_partners dp ON dp.partner_id = o.partner_id
WHERE o.order_id = 123457;

-- @R10
-- READ: Customer order history: Last 10 orders with restaurant names and amounts
SELECT o.order_id, r.name AS restaurant_name, l.locality_name,
       o.status, o.item_total, o.delivery_fee, o.discount,
       o.total_amount, o.placed_at
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
JOIN localities l ON l.locality_id = r.locality_id
WHERE o.customer_id = 1042
ORDER BY o.placed_at DESC
LIMIT 10;

-- @R11
-- READ: Bill page / Receipt: Order items breakdown, unit prices, applied coupon and payment mode
SELECT o.order_id, o.placed_at, r.name AS restaurant_name,
       m.item_name, oi.quantity, oi.unit_price, (oi.quantity * oi.unit_price) AS line_total,
       o.item_total, o.delivery_fee, o.coupon_code, o.discount, o.total_amount,
       p.method AS payment_method, p.payment_status
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
JOIN order_items oi ON oi.order_id = o.order_id
JOIN menu_items m ON m.item_id = oi.item_id
LEFT JOIN payments p ON p.order_id = o.order_id AND p.payment_status = 'SUCCESS'
WHERE o.order_id = 123457;

-- @R12
-- READ: Customer reviews: Feedback and ratings for a restaurant
SELECT rv.review_id, c.full_name AS customer_name, rv.food_rating,
       rv.delivery_rating, rv.review_text, rv.created_at
FROM reviews rv
JOIN customers c ON c.customer_id = rv.customer_id
WHERE rv.restaurant_id = 217
ORDER BY rv.created_at DESC
LIMIT 20;


-- =====================================================================
-- PART 2: RESTAURANT PARTNER, FLEET & OPERATIONS ANALYTICS (READ R13 - R28)
-- =====================================================================

-- @R13
-- READ: Restaurant partner app: Active pending kitchen orders
SELECT o.order_id, o.status, o.placed_at, o.accepted_at,
       c.full_name AS customer_name, o.item_total, o.total_amount
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
WHERE o.restaurant_id = 217
  AND o.status IN ('PLACED', 'ACCEPTED', 'PREPARING')
ORDER BY o.placed_at ASC;

-- @R14
-- READ: Restaurant partner app: Daily orders received and sales revenue
SELECT o.order_id, o.status, o.item_total, o.delivery_fee,
       o.discount, o.total_amount, o.placed_at
FROM orders o
WHERE o.restaurant_id = 217
  AND DATE(o.placed_at) = '2026-06-15'
ORDER BY o.placed_at ASC;

-- @R15
-- READ: Restaurant partner app: Monthly units sold and sales revenue per dish
SELECT m.item_id, m.item_name, m.category,
       SUM(oi.quantity) AS units_sold,
       SUM(oi.quantity * oi.unit_price) AS total_sales
FROM order_items oi
JOIN orders o ON o.order_id = oi.order_id
JOIN menu_items m ON m.item_id = oi.item_id
WHERE o.restaurant_id = 217
  AND o.status = 'DELIVERED'
  AND o.placed_at >= '2026-05-01'
  AND o.placed_at < '2026-06-01'
GROUP BY m.item_id, m.item_name, m.category
ORDER BY units_sold DESC;

-- @R16
-- READ: Restaurant partner app: Bestseller dishes ranking across Pune restaurants
SELECT *
FROM (
    SELECT o.restaurant_id, r.name AS restaurant_name, oi.item_id, m.item_name,
           SUM(oi.quantity) AS units,
           RANK() OVER (PARTITION BY o.restaurant_id ORDER BY SUM(oi.quantity) DESC) AS rnk
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.order_id
    JOIN menu_items m ON m.item_id = oi.item_id
    JOIN restaurants r ON r.restaurant_id = o.restaurant_id
    JOIN localities l ON l.locality_id = r.locality_id
    WHERE l.city_id = 6
      AND o.status = 'DELIVERED'
      AND o.placed_at >= '2026-06-01'
    GROUP BY o.restaurant_id, r.name, oi.item_id, m.item_name
) ranked_items
WHERE rnk <= 3
ORDER BY restaurant_id, rnk;

-- @R17
-- READ: Restaurant partner app: Performance metrics and customer satisfaction breakdown
SELECT r.restaurant_id, r.name AS restaurant_name, r.rating, r.rating_count,
       COUNT(rv.review_id) AS total_reviews,
       ROUND(AVG(rv.food_rating), 2) AS avg_food_rating,
       ROUND(AVG(rv.delivery_rating), 2) AS avg_delivery_rating
FROM restaurants r
LEFT JOIN reviews rv ON rv.restaurant_id = r.restaurant_id
WHERE r.restaurant_id = 217
GROUP BY r.restaurant_id, r.name, r.rating, r.rating_count;

-- @R18
-- READ: Delivery partner app: Available unassigned orders in city for pickup
SELECT o.order_id, o.restaurant_id, r.name AS restaurant_name,
       l.locality_name AS restaurant_locality, o.status, o.placed_at,
       o.distance_km, o.delivery_fee
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
JOIN localities l ON l.locality_id = r.locality_id
WHERE l.city_id = 1
  AND o.partner_id IS NULL
  AND o.status IN ('PLACED', 'ACCEPTED')
ORDER BY o.placed_at ASC
LIMIT 20;

-- @R19
-- READ: Delivery partner app: Active delivery route and order destination
SELECT o.order_id, o.status, o.placed_at, o.accepted_at, o.picked_up_at,
       r.name AS restaurant_name, rl.locality_name AS pickup_locality,
       c.full_name AS customer_name, c.phone AS customer_phone,
       o.distance_km, o.delivery_fee
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
JOIN localities rl ON rl.locality_id = r.locality_id
JOIN customers c ON c.customer_id = o.customer_id
WHERE o.partner_id = 150
  AND o.status IN ('ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY')
ORDER BY o.placed_at DESC
LIMIT 1;

-- @R20
-- READ: Delivery partner app: Weekly earnings and completed delivery count
SELECT count(*) AS total_deliveries,
       COALESCE(SUM(delivery_fee), 0.00) AS total_fees_earned,
       ROUND(AVG(delivery_fee), 2) AS avg_fee_per_delivery
FROM orders
WHERE partner_id = 150
  AND status = 'DELIVERED'
  AND placed_at >= '2026-06-22'
  AND placed_at < '2026-06-29';

-- @R21
-- READ: Dispatch operations: Unassigned orders waiting for partner pickup, oldest first
SELECT o.order_id, o.restaurant_id, r.name AS restaurant_name,
       l.locality_name, o.status, o.placed_at
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
JOIN localities l ON l.locality_id = r.locality_id
WHERE o.partner_id IS NULL
  AND o.status IN ('PLACED', 'ACCEPTED')
ORDER BY o.placed_at ASC
LIMIT 50;

-- @R22
-- READ: Kitchen delay alert: Orders in PREPARING for over 40 minutes SLA
SELECT o.order_id, o.restaurant_id, r.name AS restaurant_name,
       o.accepted_at, o.placed_at,
       ROUND(EXTRACT(EPOCH FROM (TIMESTAMPTZ '2026-06-30 23:59:00+05:30' - o.accepted_at)) / 60) AS minutes_in_kitchen
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
WHERE o.status = 'PREPARING'
  AND o.accepted_at < TIMESTAMPTZ '2026-06-30 23:59:00+05:30' - interval '40 minutes'
ORDER BY o.accepted_at ASC;

-- @R23
-- READ: Fleet operations: Active Bengaluru delivery partners with no recent assignments
SELECT p.partner_id, p.full_name, p.phone, p.vehicle_type, p.rating, ci.city_name
FROM delivery_partners p
JOIN cities ci ON ci.city_id = p.city_id
WHERE p.city_id = 1
  AND p.status = 'ACTIVE'
  AND NOT EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.partner_id = p.partner_id
        AND o.placed_at >= '2026-06-25'
  );

-- @R24
-- READ: Customer support: Orders where delivery exceeded 60 minutes SLA
SELECT o.order_id, o.customer_id, c.full_name AS customer_name,
       o.restaurant_id, r.name AS restaurant_name,
       o.placed_at, o.delivered_at,
       ROUND(EXTRACT(EPOCH FROM (o.delivered_at - o.placed_at)) / 60) AS duration_minutes
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
WHERE o.status = 'DELIVERED'
  AND o.delivered_at - o.placed_at > interval '60 minutes'
  AND o.placed_at >= '2026-06-01'
  AND o.placed_at < '2026-07-01'
ORDER BY (o.delivered_at - o.placed_at) DESC
LIMIT 100;

-- @R25
-- READ: Risk team: Customers with multiple failed payment attempts
SELECT o.customer_id, c.full_name, c.phone, c.email,
       COUNT(*) AS failed_attempts
FROM payments p
JOIN orders o ON o.order_id = p.order_id
JOIN customers c ON c.customer_id = o.customer_id
WHERE p.payment_status = 'FAILED'
GROUP BY o.customer_id, c.full_name, c.phone, c.email
HAVING COUNT(*) >= 2
ORDER BY failed_attempts DESC, o.customer_id ASC;

-- @R26
-- READ: Payments team: Failed payment attempts breakdown by method in last 7 days
SELECT method, count(*) AS failed_attempts
FROM payments
WHERE payment_status = 'FAILED'
  AND attempted_at >= '2026-06-24'
GROUP BY method
ORDER BY failed_attempts DESC;

-- @R27
-- READ: Gold retention: Expiring Gold members who placed recent orders
SELECT c.customer_id, c.full_name, c.email, c.phone, c.gold_expires_on, ci.city_name
FROM customers c
JOIN cities ci ON ci.city_id = c.city_id
WHERE c.is_gold_member = true
  AND c.gold_expires_on < '2026-07-01'
  AND EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.customer_id = c.customer_id
        AND o.placed_at >= '2026-06-01'
        AND o.placed_at < '2026-07-01'
  );

-- @R28
-- READ: Ops dashboard: Average delivery duration in minutes per city per month
SELECT l.city_id, ci.city_name,
       date_trunc('month', o.placed_at) AS month,
       ROUND(AVG(EXTRACT(EPOCH FROM (o.delivered_at - o.placed_at)) / 60), 1) AS avg_delivery_minutes,
       COUNT(*) AS total_delivered_orders
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
JOIN localities l ON l.locality_id = r.locality_id
JOIN cities ci ON ci.city_id = l.city_id
WHERE o.status = 'DELIVERED'
  AND EXTRACT(YEAR FROM o.placed_at) = 2026
GROUP BY l.city_id, ci.city_name, date_trunc('month', o.placed_at)
ORDER BY l.city_id, month;


-- =====================================================================
-- PART 3: APPLICATION WRITE & TRANSACTIONAL WORKLOAD (WRITE W1 - W13)
-- =====================================================================

-- @W1
-- WRITE: Customer checkout: Place a new order header row
INSERT INTO orders (
    order_id, customer_id, restaurant_id, coupon_code, placed_at,
    distance_km, item_total, delivery_fee, discount, total_amount, status
) VALUES (
    90000001, 1042, 217, NULL, '2026-07-01 13:05:00+05:30',
    3.20, 540.00, 25.00, 0.00, 565.00, 'PLACED'
);

-- @W2
-- WRITE: Customer checkout: Insert line items for placed order
INSERT INTO order_items (order_id, item_id, quantity, unit_price)
VALUES
    (90000001, 22241, 2, 110.00),
    (90000001, 22242, 1, 320.00);

-- @W3
-- WRITE: Payment gateway: Record initial payment attempt
INSERT INTO payments (
    payment_id, order_id, amount, method, payment_status, attempted_at
) VALUES (
    90000001, 90000001, 565.00, 'UPI', 'SUCCESS', '2026-07-01 13:06:12+05:30'
);

-- @W4
-- WRITE: Payment gateway webhook: Update payment status to SUCCESS
UPDATE payments
SET payment_status = 'SUCCESS'
WHERE order_id = 90000001
  AND method = 'UPI';

-- @W5
-- WRITE: Restaurant partner app: Accept incoming order
UPDATE orders
SET status = 'ACCEPTED',
    accepted_at = '2026-07-01 13:08:00+05:30'
WHERE order_id = 90000001
  AND status = 'PLACED';

-- @W6
-- WRITE: Restaurant partner app: Start food preparation
UPDATE orders
SET status = 'PREPARING'
WHERE order_id = 90000001
  AND status = 'ACCEPTED';

-- @W7
-- WRITE: Dispatch system: Assign nearest delivery partner to order
UPDATE orders
SET partner_id = 150
WHERE order_id = 90000001
  AND partner_id IS NULL
  AND status IN ('ACCEPTED', 'PREPARING');

-- @W8
-- WRITE: Delivery partner app: Pick up order from restaurant
UPDATE orders
SET status = 'OUT_FOR_DELIVERY',
    picked_up_at = '2026-07-01 13:25:00+05:30'
WHERE order_id = 90000001
  AND partner_id = 150
  AND status = 'PREPARING';

-- @W9
-- WRITE: Delivery partner app: Mark order as successfully delivered
UPDATE orders
SET status = 'DELIVERED',
    delivered_at = '2026-07-01 13:48:00+05:30'
WHERE order_id = 90000001
  AND partner_id = 150
  AND status = 'OUT_FOR_DELIVERY';

-- @W10
-- WRITE: Customer app: Submit rating and feedback review for delivered order
INSERT INTO reviews (
    review_id, order_id, customer_id, restaurant_id,
    food_rating, delivery_rating, review_text, created_at
) VALUES (
    90000001, 90000001, 1042, 217,
    5, 5, 'Food arrived hot and fresh, excellent packaging and quick delivery!',
    '2026-07-01 14:10:00+05:30'
);

-- @W11
-- WRITE: Restaurant partner app: Toggle menu item availability (sold out)
UPDATE menu_items
SET is_available = false
WHERE restaurant_id = 217
  AND category = 'Desserts';

-- @W12
-- WRITE: Nightly batch job: Recompute restaurant average ratings and rating count
UPDATE restaurants r
SET rating = agg.avg_rating,
    rating_count = agg.review_count
FROM (
    SELECT restaurant_id,
           ROUND(AVG(food_rating), 1) AS avg_rating,
           COUNT(*) AS review_count
    FROM reviews
    GROUP BY restaurant_id
) agg
WHERE agg.restaurant_id = r.restaurant_id;

-- @W13
-- WRITE: Nightly batch job: Expire Gold memberships past validity date
UPDATE customers
SET is_gold_member = false
WHERE is_gold_member = true
  AND gold_expires_on < '2026-07-01';
