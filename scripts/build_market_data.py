#!/usr/bin/env python3
"""Build a deployable odds snapshot without inventing missing market data."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "odds-data.json"
TEAMS_FILE = ROOT / "public" / "world-cup-data.json"
API_URL = "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize(value: str) -> str:
    return "".join(character for character in value.casefold() if character.isalnum())


def write(payload: dict) -> None:
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT}: {payload['status']} / {len(payload['matches'])} matches")


def main() -> None:
    api_key = os.environ.get("THE_ODDS_API_KEY", "").strip()
    if not api_key:
        write({
            "generated_at_utc": utc_now(),
            "status": "not_configured",
            "message": "THE_ODDS_API_KEY 未配置；市场模型权重为 0。",
            "matches": [],
        })
        return

    teams = json.loads(TEAMS_FILE.read_text(encoding="utf-8"))["teams"]
    lookup = {}
    for team in teams:
        for label in (team["name_en"], team["name_zh"], team["code"]):
            lookup[normalize(label)] = team["code"]

    query = urllib.parse.urlencode({
        "apiKey": api_key,
        "regions": "us,uk,eu",
        "markets": "h2h",
        "oddsFormat": "decimal",
        "dateFormat": "iso",
    })
    try:
        with urllib.request.urlopen(f"{API_URL}?{query}", timeout=30) as response:
            events = json.load(response)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
        write({
            "generated_at_utc": utc_now(),
            "status": "failed",
            "message": f"The Odds API 请求失败：{error}",
            "matches": [],
        })
        return

    matches = []
    for event in events:
        home_code = lookup.get(normalize(event.get("home_team", "")))
        away_code = lookup.get(normalize(event.get("away_team", "")))
        if not home_code or not away_code:
            continue
        bookmakers = []
        for bookmaker in event.get("bookmakers", []):
            h2h = next((market for market in bookmaker.get("markets", []) if market.get("key") == "h2h"), None)
            if not h2h:
                continue
            prices = {normalize(outcome.get("name", "")): outcome.get("price") for outcome in h2h.get("outcomes", [])}
            home = prices.get(normalize(event["home_team"]))
            away = prices.get(normalize(event["away_team"]))
            draw = prices.get("draw")
            if not all(isinstance(value, (int, float)) and value > 1 for value in (home, draw, away)):
                continue
            bookmakers.append({
                "key": bookmaker.get("key", ""),
                "title": bookmaker.get("title", bookmaker.get("key", "")),
                "updatedAt": bookmaker.get("last_update", ""),
                "home": home,
                "draw": draw,
                "away": away,
            })
        if bookmakers:
            matches.append({
                "id": event.get("id", ""),
                "commenceTime": event.get("commence_time", ""),
                "homeCode": home_code,
                "awayCode": away_code,
                "bookmakers": bookmakers,
            })

    write({
        "generated_at_utc": utc_now(),
        "status": "success" if matches else "failed",
        "message": "多公司胜平负赔率快照；前端逐公司去水后融合。" if matches else "赔率接口成功，但没有匹配到世界杯对阵。",
        "matches": matches,
    })


if __name__ == "__main__":
    main()
