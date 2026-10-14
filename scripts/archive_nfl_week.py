#!/usr/bin/env python3
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FEED_ID = "18BN00MtCX4iSMBtkPdbS2LVBOE3BnMdppQnPQY1fUJM"
OUT = Path(__file__).resolve().parents[1] / "nfl-weekly-history.json"

def gviz(sheet):
    url = (
        f"https://docs.google.com/spreadsheets/d/{FEED_ID}/gviz/tq"
        f"?tqx=out:json&sheet={urllib.parse.quote(sheet)}"
    )
    with urllib.request.urlopen(url, timeout=20) as r:
        text = r.read().decode("utf-8")
    start = text.find("{")
    end = text.rfind("}") + 1
    data = json.loads(text[start:end])
    cols = [c.get("label", "") for c in data["table"]["cols"]]
    rows = []
    for row in data["table"].get("rows", []):
        vals = []
        for cell in row.get("c", []):
            vals.append("" if cell is None or cell.get("v") is None else cell.get("v"))
        vals += [""] * (len(cols) - len(vals))
        rows.append(dict(zip(cols, vals)))
    return rows

def as_int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0

meta_rows = gviz("meta")
record_rows = gviz("weekly_records")
if not meta_rows:
    raise SystemExit("No meta row available.")

meta = meta_rows[0]
week = as_int(meta.get("week"))
total = as_int(meta.get("games_total"))
final = as_int(meta.get("games_final"))

if week < 1 or total < 1:
    raise SystemExit("No active NFL week to archive.")

# Archive only after every scheduled game is final. A tied game still counts
# as final; if it is not scored, it becomes a push instead of a W/L.
if final < total:
    print(f"Week {week} is not complete yet ({final}/{total} final).")
    raise SystemExit(0)

history = {"updated_at": None, "weeks": []}
if OUT.exists():
    history = json.loads(OUT.read_text(encoding="utf-8"))

records = {}
for row in record_rows:
    player = str(row.get("player", "")).strip()
    if not player:
        continue
    correct = as_int(row.get("correct"))
    wrong = as_int(row.get("wrong"))
    no_pick = as_int(row.get("no_pick"))
    scored = as_int(row.get("scored"))
    push = max(0, total - scored - no_pick)
    rec = {"correct": correct, "wrong": wrong}
    if no_pick:
        rec["no_pick"] = no_pick
    if push:
        rec["push"] = push
    records[player] = rec

if not records:
    raise SystemExit("No weekly records available.")

entry = {"week": week, "records": records}
weeks = [w for w in history.get("weeks", []) if as_int(w.get("week")) != week]
weeks.append(entry)
weeks.sort(key=lambda w: as_int(w.get("week")))

history["weeks"] = weeks
history["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
OUT.write_text(json.dumps(history, indent=2, sort_keys=False) + "\n", encoding="utf-8")
print(f"Archived Week {week} with {len(records)} players.")
