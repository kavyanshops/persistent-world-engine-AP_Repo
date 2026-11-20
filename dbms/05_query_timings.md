# Query Timings and Execution Plan Analysis (Checkpoint 4)

**Repository:** `persistent-world-engine-AP_Repo` (AP Repository)  
**Deliverable:** `dbms/05_query_timings.md` & `dbms/plans/`  
**Database:** PostgreSQL 16 (x86_64/arm64) · **Dataset:** 150,000 orders baseline (`seed_data`)  
**Benchmark Method:** `EXPLAIN (ANALYZE, BUFFERS)` with 3 runs per query; reported values reflect actual `Execution Time` in milliseconds. Write queries were wrapped in `BEGIN ... ROLLBACK;` blocks to prevent database mutation across runs.

---

## 1. Complete Query Timing Table

| Query | Type | What it does | Run 1 (ms) | Run 2 (ms) | Run 3 (ms) | Average (ms) | Scan type |
|-------|------|--------------|-----------:|-----------:|-----------:|-------------:|-----------|
| R1 | READ | Login by email with city details | 0.045 | 0.041 | 0.040 | 0.042 | Index Scan |
| R2 | READ | Customer profile and active delivery address lookup | 0.098 | 0.092 | 0.095 | 0.095 | Index Scan |
| R3 | READ | Home feed: Open restaurants in Koramangala, best rated first | 1.054 | 1.871 | 1.101 | 1.342 | Seq Scan |
| R4 | READ | Restaurant search by cuisine and city with locality info | 0.456 | 0.468 | 0.403 | 0.442 | Seq Scan |
| R5 | READ | Dish search: Available paneer dishes in Bengaluru | 38.099 | 24.403 | 19.575 | 27.359 | Seq Scan |
| R6 | READ | Restaurant page: Complete menu of restaurant 217 categorized | 1.936 | 1.882 | 1.856 | 1.891 | Seq Scan |
| R7 | READ | Coupon verification: Check validity, min order value & discount | 0.038 | 0.035 | 0.036 | 0.036 | Index Scan |
| R8 | READ | Cart checkout verification: Item availability & subtotal check | 0.085 | 0.078 | 0.082 | 0.082 | Index Scan |
| R9 | READ | Order live tracking: Status, ETA checkpoints, restaurant & partner | 0.128 | 0.122 | 0.125 | 0.125 | Index Scan |
| R10 | READ | Customer order history: Customer 1042 last 10 orders | 4.753 | 4.698 | 4.831 | 4.761 | Seq Scan |
| R11 | READ | Bill page / Receipt: Order 123457 items, restaurant & payment | 5.057 | 5.154 | 5.180 | 5.130 | Seq Scan |
| R12 | READ | Customer reviews: Feedback and ratings for restaurant 217 | 2.150 | 2.080 | 2.115 | 2.115 | Seq Scan |
| R13 | READ | Restaurant partner app: Active pending kitchen orders | 5.380 | 5.290 | 5.320 | 5.330 | Seq Scan |
| R14 | READ | Restaurant partner app: Daily orders received on 15 June 2026 | 6.085 | 5.670 | 6.227 | 5.994 | Seq Scan |
| R15 | READ | Restaurant partner app: Units sold per dish in May 2026 | 6.893 | 6.562 | 7.535 | 6.997 | Seq Scan |
| R16 | READ | Bestseller badges: Top 3 dishes of Pune restaurants in 30 days | 7.164 | 8.305 | 8.165 | 7.878 | Seq Scan |
| R17 | READ | Restaurant partner app: Performance metrics and review ratings | 2.480 | 2.410 | 2.450 | 2.447 | Seq Scan |
| R18 | READ | Delivery partner app: Available unassigned orders in city for pickup | 7.250 | 7.180 | 7.210 | 7.213 | Seq Scan |
| R19 | READ | Delivery partner app: Active delivery route and order destination | 5.210 | 5.120 | 5.150 | 5.160 | Seq Scan |
| R20 | READ | Delivery partner app: Partner 150 weekly deliveries & earnings | 5.598 | 5.556 | 5.710 | 5.621 | Seq Scan |
| R21 | READ | Dispatch operations: Unassigned orders waiting for partner pickup | 7.629 | 8.063 | 7.726 | 7.806 | Seq Scan |
| R22 | READ | Kitchen delay alert: Orders in PREPARING for over 40 minutes SLA | 8.186 | 8.096 | 6.933 | 7.738 | Seq Scan |
| R23 | READ | Fleet operations: Active Bengaluru partners with no recent orders | 6.285 | 6.321 | 6.273 | 6.293 | Seq Scan |
| R24 | READ | Customer support: Deliveries in June 2026 taking over 60 minutes | 4.812 | 4.931 | 4.892 | 4.878 | Seq Scan |
| R25 | READ | Risk team: Customers with 2 or more failed payment attempts | 15.724 | 14.980 | 14.981 | 15.228 | Seq Scan |
| R26 | READ | Payments team: Failed payment attempts per method in last 7 days | 3.932 | 3.883 | 3.854 | 3.890 | Seq Scan |
| R27 | READ | Gold retention: Expiring Gold members who ordered in June 2026 | 7.577 | 7.161 | 7.332 | 7.357 | Seq Scan |
| R28 | READ | Ops dashboard: Average delivery time per city per month in 2026 | 28.671 | 24.183 | 22.427 | 25.094 | Seq Scan |
| W1 | WRITE | Customer checkout: Place a new order header row | 0.575 | 0.465 | 0.507 | 0.516 | — |
| W2 | WRITE | Customer checkout: Insert line items for placed order | 0.435 | 0.395 | 0.406 | 0.412 | — |
| W3 | WRITE | Payment gateway: Record initial payment attempt | 0.462 | 0.431 | 0.442 | 0.445 | — |
| W4 | WRITE | Payment gateway webhook: Update payment status to SUCCESS | 3.720 | 3.610 | 3.620 | 3.650 | Seq Scan |
| W5 | WRITE | Restaurant partner app: Accept incoming order | 0.255 | 0.238 | 0.242 | 0.245 | Index Scan |
| W6 | WRITE | Restaurant partner app: Start food preparation | 0.248 | 0.231 | 0.235 | 0.238 | Index Scan |
| W7 | WRITE | Dispatch system: Assign nearest delivery partner to order | 11.478 | 10.008 | 10.075 | 10.520 | Seq Scan |
| W8 | WRITE | Delivery partner app: Pick up order from restaurant | 0.260 | 0.245 | 0.251 | 0.252 | Index Scan |
| W9 | WRITE | Delivery partner app: Mark order as successfully delivered | 0.272 | 0.258 | 0.262 | 0.264 | Index Scan |
| W10 | WRITE | Customer app: Submit review & rating for delivered order | 0.395 | 0.375 | 0.385 | 0.385 | — |
| W11 | WRITE | Restaurant partner app: Toggle menu item availability (sold out) | 1.883 | 1.936 | 1.512 | 1.777 | Seq Scan |
| W12 | WRITE | Nightly batch job: Recompute restaurant ratings from reviews | 14.114 | 13.457 | 11.829 | 13.133 | Seq Scan |
| W13 | WRITE | Nightly batch job: Expire Gold memberships past validity date | 32.989 | 9.019 | 7.997 | 16.668 | Seq Scan |
| **Total** | | **All 41 Workload Queries (Sum)** | **249.861** | **205.303** | **195.387** | **216.849** | — |

---

## 2. Workload Metrics Summary

- **Total Queries Analyzed:** 41 queries (28 `READ`, 13 `WRITE`)
- **Cumulative Workload Average Runtime:** **216.849 ms**
  - **Read Queries (R1 – R28) Average Runtime:** **168.344 ms**
  - **Write Queries (W1 – W13) Average Runtime:** **48.505 ms**
- **Fastest Query:** `R7` (Coupon verification, Index Scan) at **0.036 ms**
- **Slowest Query:** `R5` (Dish substring search with `ILIKE '%paneer%'`, Sequential Scan) at **27.359 ms**, followed by `R28` (City monthly order aggregation) at **25.094 ms**
- **Buffer Cache Hit Ratio:** > 99.8% across warm runs (shared hit buffers dominated; zero shared read physical disk I/O on cached buffers).

---

## 3. Plan Analysis & Access Method Breakdown

### 3.1 Index Scans & Primary Key Lookups (Ultra-Fast: < 0.2 ms)
- **`R1` (Login by email, 0.042 ms):** Employs `Index Scan using customers_email_key on customers` driven by the `UNIQUE (email)` candidate key constraint, followed by a nested loop `Index Scan using cities_pkey on cities`. Only 6 buffer pages touched.
- **`R2` (Profile & address, 0.095 ms) & `R9` (Live order tracking, 0.125 ms):** Benefit from point-lookups on synthetic integer primary keys (`customers_pkey`, `orders_pkey`, `restaurants_pkey`, `localities_pkey`).
- **`R7` (Coupon verification, 0.036 ms):** Instant single-block B-Tree traversal on `coupons_pkey`.
- **`W5`, `W6`, `W8`, `W9` (State transition updates, ~0.24 ms):** Update target rows retrieved in sub-millisecond time via `Index Scan using orders_pkey`.

### 3.2 Sequential Scans on Large Fact & Transaction Tables (Bottlenecks)
Because Phase 2 (`dbms/03_schema.sql`) explicitly mandates **zero secondary indexes** (only PK, UNIQUE, and FK constraints without explicit auxiliary B-Trees), the PostgreSQL query planner must resort to full sequential scans for unindexed filters:
1. **`orders` Table Scans (150,000 rows / 3,655 blocks):**
   - `R10` (Customer order history), `R13` (Kitchen live orders), `R14` (Daily restaurant orders), `R18`, `R20`, `R21`, `R22`, and `R24` must read all 3,655 pages of `orders` to evaluate non-indexed attributes such as `customer_id`, `restaurant_id`, `placed_at`, `partner_id`, and `status`.
   - Each sequential scan incurs a baseline execution overhead of **4.5 ms to 7.8 ms**.
2. **`menu_items` Substring Text Search (`R5`, 27.359 ms):**
   - `m.item_name ILIKE '%paneer%'` performs a sequential scan over 50,000 menu items. Because standard B-Tree indexes cannot accelerate leading-wildcard patterns (`%...`), a GIN trigram index (`pg_trgm`) is required for Phase 4 optimization.
3. **`order_items` Join Overhead (`R11`, `R15`, `R16`, 5.1 ms to 7.8 ms):**
   - `order_items` contains 375,000 rows across 1,834 pages. Joining `orders` and `order_items` without a foreign key index on `order_items(order_id)` forces hash joins and full table scans.
4. **`payments` and `reviews` Aggregations (`R25`, `R26`, `W12`):**
   - `R25` (Risk team failed payments, 15.228 ms) requires scanning 137,378 payment records, joining with 150,000 orders and 25,000 customers, and executing a memory-heavy `HashAggregate`.

---

## 4. Join and Aggregation Execution Strategies

| Query Category | Predominant Join Type | Aggregation / Windowing Method | Primary Bottleneck |
|---|---|---|---|
| Point Queries (`R1`, `R2`, `R8`, `R9`) | **Nested Loop** | None | None (optimized via PK/Unique B-Tree) |
| Entity Search (`R3`, `R4`, `R5`, `R10`) | **Hash Join** | Top-N Heapsort / Quicksort | Seq Scan on dimension/fact tables |
| Analytics & Grouping (`R15`, `R16`, `R28`) | **Hash Join** | **HashAggregate / GroupAggregate / WindowAgg** | Absence of composite `(restaurant_id, placed_at)` indexes |
| Anti-Joins & Correlated Tests (`R23`, `R27`) | **Hash Anti Join / Nested Loop Semi Join** | Materialize Subplan | Repeated sequential scanning of orders |

---

## 5. Write Query Overhead Analysis (`W1` – `W13`)

- **Single-Row Direct Inserts (`W1`, `W2`, `W3`, `W10`):** Fast execution between **0.38 ms and 0.51 ms**. Buffer overhead is limited to leaf page insertions and WAL logging.
- **Indexed PK Updates (`W5`, `W6`, `W8`, `W9`):** Extremely efficient at **0.23 ms – 0.26 ms**, confirming that row-level locking and MVCC tuple versioning have minimal impact on single-row indexed updates.
- **Filtered Non-Indexed Updates (`W4`, `W7`, `W11`):** Substantially slower (3.6 ms to 10.5 ms) because the engine must sequentially evaluate the entire table to locate candidate rows before writing changes.
- **Heavy Batch Updates (`W12`, `W13`):**
  - `W12` (Rating recomputation, 13.133 ms): Scans all 39,186 reviews, aggregates by `restaurant_id`, and updates 2,500 restaurant records.
  - `W13` (Gold expiry batch, 16.668 ms): Scans all 25,000 customer records to update expiring accounts.

---

## 6. Recommendations for Phase 4 Indexing

To transition from baseline execution to sub-millisecond production SLAs, the following indexes are targeted:
1. `CREATE INDEX idx_orders_customer_placed ON orders(customer_id, placed_at DESC);` (Optimizes `R10`)
2. `CREATE INDEX idx_orders_restaurant_placed ON orders(restaurant_id, placed_at);` (Optimizes `R14`, `R15`)
3. `CREATE INDEX idx_orders_status_partner ON orders(status, partner_id) WHERE partner_id IS NULL;` (Partial index for `R18`, `R21`, `W7`)
4. `CREATE INDEX idx_order_items_order_id ON order_items(order_id);` (FK index for `R11`, `R15`)
5. `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX idx_menu_items_trgm ON menu_items USING gin (item_name gin_trgm_ops);` (Accelerates `R5`)
6. `CREATE INDEX idx_payments_status_attempt ON payments(payment_status, attempted_at);` (Optimizes `R25`, `R26`)
