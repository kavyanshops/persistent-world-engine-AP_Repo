# Baseline Query Timings (Phase 3)

Database: PostgreSQL 16/18 · Dataset: 150,000 orders (seed data) · Date: 17 Nov 2026

Each query was executed 3 times using `EXPLAIN (ANALYZE, BUFFERS)` via `./benchmarks/run_benchmark.sh zomato baseline 3`. Write queries (`W01`–`W05`) were executed inside `BEGIN ... ROLLBACK;` transactions to prevent database state modification across iterations. All times reflect PostgreSQL execution time in milliseconds recorded directly in `benchmarks/results/baseline/`.

## Timing Table

| SQL Query | Type | Run 1 (ms) | Run 2 (ms) | Run 3 (ms) | Average (ms) |
|---|---|---:|---:|---:|---:|
| R01: Home feed: open restaurants in Koramangala, best rated first | READ | 1.054 | 1.871 | 1.101 | 1.342 |
| R02: Dish search: available "paneer" dishes in Bengaluru | READ | 38.099 | 24.403 | 19.575 | 27.359 |
| R03: Restaurant page: the menu of one restaurant, grouped by category | READ | 1.936 | 1.882 | 1.856 | 1.891 |
| R04: "Your orders": a customer's last 10 orders with restaurant names | READ | 4.753 | 4.698 | 4.831 | 4.761 |
| R05: Kitchen-delay alert: orders stuck in PREPARING for over 40 minutes (checked at 23:59 on 30 Jun 2026) | READ | 8.186 | 8.096 | 6.933 | 7.738 |
| R06: Restaurant partner app: all orders received by restaurant 217 on 15 June 2026 | READ | 6.085 | 5.670 | 6.227 | 5.994 |
| R07: Restaurant partner app: units sold per dish in May 2026 | READ | 6.893 | 6.562 | 7.535 | 6.997 |
| R08: Bestseller badges: top 3 dishes of every Pune restaurant in the last 30 days | READ | 7.164 | 8.305 | 8.165 | 7.878 |
| R09: Ops dashboard: average delivery time (minutes) per city per month in 2026 | READ | 28.671 | 24.183 | 22.427 | 25.094 |
| R10: Customer support: deliveries in June 2026 that took more than 60 minutes | READ | 4.812 | 4.931 | 4.892 | 4.878 |
| R11: Delivery partner app: this week's earnings (delivery fees) for partner 150 | READ | 5.598 | 5.556 | 5.710 | 5.621 |
| R12: Dispatch: orders still waiting for a delivery partner, oldest first | READ | 7.629 | 8.063 | 7.726 | 7.806 |
| R13: Fleet team: active Bengaluru partners who have not been assigned any order since 25 June 2026 | READ | 6.285 | 6.321 | 6.273 | 6.293 |
| R14: Gold team: Gold members whose membership expires before July 2026 but who ordered in June 2026 | READ | 7.577 | 7.161 | 7.332 | 7.357 |
| R15: Marketing: coupon effectiveness (orders, total discount, average bill) | READ | 13.880 | 13.150 | 13.077 | 13.369 |
| R16: Payments team: failed payment attempts per method in the last 7 days | READ | 3.932 | 3.883 | 3.854 | 3.890 |
| R17: Risk team: customers with 2 or more failed payment attempts (all time) | READ | 15.724 | 14.980 | 14.981 | 15.228 |
| R18: Review moderation: newest reviews that complain about cold food or late delivery | READ | 12.591 | 12.140 | 12.286 | 12.339 |
| R19: Restaurant health report for Bengaluru: last order time, delivered orders and average food rating | READ | 4204.752 | 4196.076 | 4225.618 | 4208.815 |
| R20: Growth: top 20 customers in Mumbai by total spend on delivered orders | READ | 20.510 | 18.467 | 18.094 | 19.024 |
| R21: Growth: share of customers in each city who ordered at least twice in May 2026 | READ | 9.648 | 9.621 | 9.356 | 9.542 |
| R22: Ops heatmap: Bengaluru orders by weekday and hour, last 8 weeks | READ | 13.324 | 12.958 | 12.917 | 13.066 |
| R23: Admin panel: "All orders", newest first, page 4,001 (25 rows per page) | READ | 32.137 | 33.190 | 32.431 | 32.586 |
| R24: Bill page: one order with its items, restaurant and successful payment | READ | 5.057 | 5.154 | 5.180 | 5.130 |
| R25: Cuisine filter: open Chinese restaurants in Pune | READ | 0.456 | 0.468 | 0.403 | 0.442 |
| W01: Customer app: place a new order (header row) | WRITE | 0.575 | 0.465 | 0.507 | 0.516 |
| W02: Dispatch: assign partner 150 to the oldest accepted order that has no partner | WRITE | 11.478 | 10.008 | 10.075 | 10.520 |
| W03: Restaurant partner app: desserts sold out, so hide them | WRITE | 1.883 | 1.936 | 1.512 | 1.777 |
| W04: Nightly job: recompute every restaurant's rating from its reviews | WRITE | 14.114 | 13.457 | 11.829 | 13.133 |
| W05: Nightly job: end Gold membership for customers whose plan has expired | WRITE | 32.989 | 9.019 | 7.997 | 16.668 |
| **Total (sum of all 30)** | | **4527.792** | **4472.674** | **4490.700** | **4497.055** |

---

## Plan Analysis: Scan Types and Baseline Performance Drivers

Per the Phase 2 specification, only `PRIMARY KEY` and `UNIQUE` constraints exist in the baseline database, with zero secondary or covering indexes created. Consequently, the query planner must rely heavily on sequential scans across large tables (`orders`: 150,000 rows, `payments`: 137,378 rows, `menu_items`: 50,000 rows, `reviews`: 39,186 rows). Foreign key lookups (`orders.customer_id`, `orders.restaurant_id`, `orders.partner_id`, `payments.order_id`) have no supporting indexes.

### R01: Home feed: open restaurants in Koramangala, best rated first
- **Scan Type(s):** `Seq Scan on restaurants | Seq Scan on localities`
- **Why it is slow / fast:** Fast (~1.0 ms) because localities (100 rows) and restaurants (2,500 rows) are small and cached in memory, but lacks composite index on (locality_id, rating) for scalable sorting.

### R02: Dish search: available "paneer" dishes in Bengaluru
- **Scan Type(s):** `Seq Scan on menu_items | Seq Scan on restaurants | Seq Scan on localities`
- **Why it is slow / fast:** Moderate (~26.4 ms) due to full sequential scan over 50,000 menu items evaluating an unindexed ILIKE pattern without a GIN trigram index.

### R03: Restaurant page: the menu of one restaurant, grouped by category
- **Scan Type(s):** `Seq Scan on menu_items`
- **Why it is slow / fast:** Fast (~2.0 ms) for 50k rows in memory, but performs an unnecessary full table scan on menu_items instead of an index lookup on restaurant_id (<0.05 ms).

### R04: "Your orders": a customer's last 10 orders with restaurant names
- **Scan Type(s):** `Seq Scan on orders | Index Scan using restaurants_pkey on restaurants`
- **Why it is slow / fast:** Moderate (~5.5 ms) because it sequentially scans all 150,000 orders to find the few orders belonging to customer_id 1042 due to missing index on customer_id.

### R05: Kitchen-delay alert: orders stuck in PREPARING for over 40 minutes (checked at 23:59 on 30 Jun 2026)
- **Scan Type(s):** `Seq Scan on orders`
- **Why it is slow / fast:** Takes ~6.9 ms because it scans all 150,000 orders to filter for a rare status ('PREPARING') and timestamp predicate without a partial index.

### R06: Restaurant partner app: all orders received by restaurant 217 on 15 June 2026
- **Scan Type(s):** `Seq Scan on orders`
- **Why it is slow / fast:** Takes ~5.5 ms because all 150,000 orders are scanned sequentially, further aggravated by wrapping placed_at inside DATE(placed_at) preventing standard B-tree range scans.

### R07: Restaurant partner app: units sold per dish in May 2026
- **Scan Type(s):** `Seq Scan on orders | Index Scan using order_items_pkey on order_items | Index Scan using menu_items_pkey on menu_items`
- **Why it is slow / fast:** Takes ~6.2 ms because orders table requires a full sequential scan to filter for restaurant 217, DELIVERED status, and date range.

### R08: Bestseller badges: top 3 dishes of every Pune restaurant in the last 30 days
- **Scan Type(s):** `Seq Scan on orders | Seq Scan on restaurants | Seq Scan on localities | Index Scan using order_items_pkey on order_items`
- **Why it is slow / fast:** Takes ~7.0 ms because all orders in June 2026 are filtered via sequential scan and joined across 4 tables before window partitioning and ranking.

### R09: Ops dashboard: average delivery time (minutes) per city per month in 2026
- **Scan Type(s):** `Seq Scan on orders | Seq Scan on restaurants | Seq Scan on localities`
- **Why it is slow / fast:** Slow (~24.5 ms) because it reads the bulk of orders in 2026 (>100k rows) via sequential scan and performs multi-table hash joins and date_trunc groupings.

### R10: Customer support: deliveries in June 2026 that took more than 60 minutes
- **Scan Type(s):** `Seq Scan on orders`
- **Why it is slow / fast:** Takes ~4.8 ms due to full sequential scan over 150,000 orders evaluating expression (delivered_at - placed_at > interval '60 minutes').

### R11: Delivery partner app: this week's earnings (delivery fees) for partner 150
- **Scan Type(s):** `Seq Scan on orders`
- **Why it is slow / fast:** Takes ~5.3 ms because it sequentially scans all 150,000 orders to filter partner_id = 150 and date range due to lack of index on partner_id.

### R12: Dispatch: orders still waiting for a delivery partner, oldest first
- **Scan Type(s):** `Seq Scan on orders`
- **Why it is slow / fast:** Takes ~7.6 ms because it sequentially scans 150,000 orders looking for rare unassigned orders (partner_id IS NULL AND status IN ('PLACED', 'ACCEPTED')).

### R13: Fleet team: active Bengaluru partners who have not been assigned any order since 25 June 2026
- **Scan Type(s):** `Seq Scan on delivery_partners | Seq Scan on orders`
- **Why it is slow / fast:** Takes ~6.0 ms because subquery scans 150,000 orders without placed_at index, and NOT IN construct forces full materialization and null-safety overhead.

### R14: Gold team: Gold members whose membership expires before July 2026 but who ordered in June 2026
- **Scan Type(s):** `Seq Scan on orders | Seq Scan on customers`
- **Why it is slow / fast:** Takes ~7.1 ms because it scans customers sequentially and repeatedly checks orders via correlated EXISTS subquery scanning orders.

### R15: Marketing: coupon effectiveness (orders, total discount, average bill)
- **Scan Type(s):** `Seq Scan on orders | Seq Scan on coupons`
- **Why it is slow / fast:** Takes ~13.5 ms because it sequentially scans 150,000 orders and hash joins against all coupons with GROUP BY aggregation.

### R16: Payments team: failed payment attempts per method in the last 7 days
- **Scan Type(s):** `Seq Scan on payments`
- **Why it is slow / fast:** Takes ~3.8 ms because 137,378 payments are scanned sequentially to filter for recent FAILED status without a partial index.

### R17: Risk team: customers with 2 or more failed payment attempts (all time)
- **Scan Type(s):** `Seq Scan on orders | Seq Scan on payments`
- **Why it is slow / fast:** Takes ~15.0 ms because all payments (137k rows) and orders (150k rows) are sequentially scanned and hash-joined across the entire database history.

### R18: Review moderation: newest reviews that complain about cold food or late delivery
- **Scan Type(s):** `Seq Scan on reviews`
- **Why it is slow / fast:** Takes ~12.3 ms because 39,186 reviews are scanned sequentially evaluating two wildcard ILIKE filters without a GIN trigram index, followed by sorting.

### R19: Restaurant health report for Bengaluru: last order time, delivered orders and average food rating
- **Scan Type(s):** `Seq Scan on restaurants | Seq Scan on localities | Seq Scan on orders | Seq Scan on reviews`
- **Why it is slow / fast:** Extremely slow (~4,158.8 ms / 4.2s) because it executes three correlated scalar subqueries for each Bengaluru restaurant (~250), scanning 150k orders twice and 39k reviews once per restaurant (>85 million row evaluations).

### R20: Growth: top 20 customers in Mumbai by total spend on delivered orders
- **Scan Type(s):** `Seq Scan on orders | Seq Scan on customers`
- **Why it is slow / fast:** Takes ~18.7 ms because all 150,000 orders and 25,000 customers are sequentially scanned and hash joined before grouping and sorting top spenders.

### R21: Growth: share of customers in each city who ordered at least twice in May 2026
- **Scan Type(s):** `Seq Scan on customers | Seq Scan on orders`
- **Why it is slow / fast:** Takes ~9.5 ms because the CTE sequentially scans all 150,000 orders for May 2026, aggregates by customer, and hash joins with customers table.

### R22: Ops heatmap: Bengaluru orders by weekday and hour, last 8 weeks
- **Scan Type(s):** `Seq Scan on orders | Seq Scan on restaurants | Seq Scan on localities`
- **Why it is slow / fast:** Takes ~13.3 ms because all 150,000 orders are scanned sequentially and joined with restaurants and localities to filter city_id = 1 and 8-week range.

### R23: Admin panel: "All orders", newest first, page 4,001 (25 rows per page)
- **Scan Type(s):** `Seq Scan on orders`
- **Why it is slow / fast:** Takes ~33.8 ms because it must sequentially scan and sort orders, walking through and discarding 100,000 rows (OFFSET 100000) to return 25 rows.

### R24: Bill page: one order with its items, restaurant and successful payment
- **Scan Type(s):** `Index Scan using orders_pkey on orders | Index Scan using restaurants_pkey on restaurants | Seq Scan on payments | Index Scan using order_items_pkey on order_items | Index Scan using menu_items_pkey on menu_items`
- **Why it is slow / fast:** Takes ~4.9 ms despite PK index scans on orders, order_items, and menu_items, because payments table lacks an index on foreign key order_id, forcing a full 137k-row sequential scan on payments.

### R25: Cuisine filter: open Chinese restaurants in Pune
- **Scan Type(s):** `Seq Scan on restaurants | Seq Scan on localities`
- **Why it is slow / fast:** Fast (~0.31 ms) because Pune restaurants is a small dataset in memory, but uses sequential scan on restaurants checking array membership without a GIN index.

### W01: Customer app: place a new order (header row)
- **Scan Type(s):** `(no scan)`
- **Why it is slow / fast:** Fast (~0.60 ms) as it is a single-row INSERT into orders validating table constraints.

### W02: Dispatch: assign partner 150 to the oldest accepted order that has no partner
- **Scan Type(s):** `Seq Scan on orders | Index Scan using orders_pkey on orders`
- **Why it is slow / fast:** Takes ~9.2 ms because the subquery performs a full sequential scan across 150,000 orders to find the oldest unassigned ACCEPTED order before updating via PK.

### W03: Restaurant partner app: desserts sold out, so hide them
- **Scan Type(s):** `Seq Scan on menu_items`
- **Why it is slow / fast:** Takes ~1.86 ms because it sequentially scans all 50,000 menu_items to find and update rows matching restaurant_id = 217 AND category = 'Desserts'.

### W04: Nightly job: recompute every restaurant's rating from its reviews
- **Scan Type(s):** `Seq Scan on restaurants | Seq Scan on reviews`
- **Why it is slow / fast:** Takes ~11.6 ms because it scans all 39,186 reviews, aggregates them by restaurant_id, and updates all 2,500 restaurants in batch.

### W05: Nightly job: end Gold membership for customers whose plan has expired
- **Scan Type(s):** `Seq Scan on customers`
- **Why it is slow / fast:** Takes ~9.6 ms because it sequentially scans all 25,000 customers to evaluate boolean and date expiration filters.
