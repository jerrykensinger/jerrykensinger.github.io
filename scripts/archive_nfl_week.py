#!/usr/bin/env python3
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FEED_ID = "18BN00MtCX4iSMBtkPdbS2LVBOE3BnMdppQnPQY1fUJM"
OUT = Path(__file__).resolve().parents[1] / "nfl-weekly-history.json"

# Only actual NFL matchups count as games. The Google Sheet feed has previously
# included dashboard standings rows with numeric IDs, which are not games.
NFL_TEAMS = {
    "Arizona Cardinals", "Atlanta Falcons", "Baltimore Ravens", "Buffalo Bills",
    "Carolina Panthers", "Chicago Bears", "Cincinnati Bengals", "Cleveland Browns",
    "Dallas Cowboys", "Denver Broncos", "Detroit Lions", "Green Bay Packers",
    "Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Kansas City Chiefs",
    "Las Vegas Raiders", "Los Angeles Chargers", "Los Angeles Rams", "Miami Dolphins",
    "Minnesota Vikings", "New England Patriots", "New Orleans Saints", "New York Giants",
    "New York Jets", "Philadelphia Eagles", "Pittsburgh Steelers", "San Francisco 49ers",
    "Seattle Seahawks", "Tampa Bay Buccaneers", "Tennessee Titans", "Washington Commanders",
}

def valid_game(row):
    away = str(row.get("away", "")).strip()
    home = str(row.get("home", "")).strip()
    number = as_int(row.get("game"))
    return away in NFL_TEAMS and home in NFL_TEAMS and away != home and 1 <= number <= 16


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
feed_games = gviz("games")
if not meta_rows:
    raise SystemExit("No meta row available.")

meta = meta_rows[0]
week = as_int(meta.get("week"))
game_rows = [row for row in feed_games if valid_game(row)]
total = len(game_rows)
final = sum(str(row.get("state", "")).strip().lower() == "final" for row in game_rows)

if week < 1 or total < 1:
    raise SystemExit("No active NFL week or valid games to archive.")
if len({as_int(row.get("game")) for row in game_rows}) != total:
    raise SystemExit("Duplicate game numbers in feed; refusing to archive.")

# Archive only when all REAL NFL matchups are final. Ignore standings rows.
if final < total:
    print(f"Week {week} is not complete yet ({final}/{total} real games final).")
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

# Game-level records enable automatically refreshed historical surprises and
# lone correct picks; they are made public only after the entire week is final.
games = []
for row in sorted(game_rows, key=lambda r: as_int(r.get("game"))):
    away = str(row.get("away", "")).strip()
    home = str(row.get("home", "")).strip()
    winner = str(row.get("winner", "")).strip()
    away_score, home_score = row.get("away_score"), row.get("home_score")
    tie = winner.upper() in {"TIE", "DRAW"}
    if winner not in {away, home} and not tie:
        try:
            if away_score == "" or home_score == "":
                raise ValueError("missing score")
            a, h = int(float(away_score)), int(float(home_score))
            if a == h:
                tie = True
            else:
                winner = away if a > h else home
        except (TypeError, ValueError):
            winner = ""

    valid_picks = {}
    for player in records:
        pick = str(row.get(f"{player}_pick", "")).strip()
        if pick in {away, home}:
            valid_picks[player] = pick
    # A hidden or incomplete feed must not manufacture 'no one got it' claims.
    fully_revealed = len(valid_picks) == as_int(row.get("n_picked")) and len(valid_picks) > 0
    matched = [p for p, pick in valid_picks.items() if pick == winner] if fully_revealed and not tie and winner else []
    games.append({
        "game": as_int(row.get("game")),
        "away": away, "home": home,
        "winner": "TIE" if tie else winner,
        "correct": len(matched) if fully_revealed and not tie and winner else None,
        "picked": len(valid_picks) if fully_revealed else 0,
        "lone_correct": matched[0] if len(matched) == 1 else None,
        "push": tie,
    })

entry = {"week": week, "records": records, "games": games}
weeks = [w for w in history.get("weeks", []) if as_int(w.get("week")) != week]
weeks.append(entry)
weeks.sort(key=lambda w: as_int(w.get("week")))

history["weeks"] = weeks
history["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
OUT.write_text(json.dumps(history, indent=2, sort_keys=False) + "\n", encoding="utf-8")
print(f"Archived Week {week} with {len(records)} players.")
