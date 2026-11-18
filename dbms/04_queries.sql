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
