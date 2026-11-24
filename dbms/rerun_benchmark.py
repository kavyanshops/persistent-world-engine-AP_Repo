#!/usr/bin/env python3
"""Re-run every query in dbms/04_queries.sql with EXPLAIN (ANALYZE, BUFFERS), 3 runs each.
Writes genuine plans to dbms/plans/<ID>.txt and a timing table to dbms/05_query_timings_generated.md.
Usage: python3 dbms/rerun_benchmark.py <database>      (needs psql on PATH)"""
import re, subprocess, sys, pathlib
db = sys.argv[1] if len(sys.argv) > 1 else "zomato_ap"
root = pathlib.Path(__file__).parent
src = (root / "04_queries.sql").read_text()
parts = re.split(r"^-- @(\w+)\s*$", src, flags=re.M)
rows, out = [], root / "plans"; out.mkdir(exist_ok=True)
def psql(sql):
    return subprocess.run(["psql", "-X", "-q", "-d", db, "-v", "ON_ERROR_STOP=1", "-c", sql],
                          capture_output=True, text=True)
for qid, body in zip(parts[1::2], parts[2::2]):
    sql = "\n".join(l for l in body.splitlines() if not l.strip().startswith("--")).strip().rstrip(";")
    if not sql or sql.upper().startswith("SET "): continue
    kind = "WRITE" if qid.startswith("W") else "READ"
    times, plans = [], []
    for run in range(1, 4):
        stmt = f"SET search_path TO zomato; BEGIN; EXPLAIN (ANALYZE, BUFFERS) {sql}; ROLLBACK;"
        r = subprocess.run(["psql", "-X", "-q", "-d", db, "-c", stmt], capture_output=True, text=True)
        txt = r.stdout + r.stderr
        m = re.search(r"Execution Time: ([\d.]+) ms", txt)
        times.append(float(m.group(1)) if m else float("nan"))
        plans.append(f"=== {qid} run {run} ===\n{txt}")
    (out / f"{qid}.txt").write_text("\n".join(plans))
    scan = ("Index Only Scan" if "Index Only Scan" in plans[0] else "Index Scan" if "Index Scan" in plans[0]
            else "Bitmap Scan" if "Bitmap" in plans[0] else "Seq Scan" if "Seq Scan" in plans[0] else "-")
    rows.append((qid, kind, *times, sum(times) / 3, scan))
    print(qid, [round(t, 3) for t in times])
md = ["| Query | Type | Run 1 (ms) | Run 2 (ms) | Run 3 (ms) | Average (ms) | Scan type |", "|---|---|--:|--:|--:|--:|---|"]
md += [f"| {q} | {k} | {a:.3f} | {b:.3f} | {c:.3f} | {v:.3f} | {s} |" for q, k, a, b, c, v, s in rows]
(root / "05_query_timings_generated.md").write_text("\n".join(md) + "\n")
