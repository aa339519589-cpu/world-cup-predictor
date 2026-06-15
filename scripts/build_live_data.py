#!/usr/bin/env python3

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
WORLD_DATA_PATH = ROOT / "public" / "world-cup-data.json"
OUTPUT_PATH = ROOT / "public" / "live-data.json"
SCOREBOARD_API = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"
NEWS_API = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news?limit=10"


def fetch_json(url: str) -> dict[str, Any]:
    request = Request(url, headers={"User-Agent": "world-cup-predictor/1.0"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def date_range() -> str:
    return "20260611-20260719"


def translate(text: str) -> str:
    if not text:
        return ""
    query = urlencode({"q": text[:480], "langpair": "en|zh-CN"})
    try:
        payload = fetch_json(f"https://api.mymemory.translated.net/get?{query}")
        return payload.get("responseData", {}).get("translatedText", "")
    except Exception:
        return ""


def normalize_matches(payload: dict[str, Any], team_names: dict[str, str]) -> list[dict[str, Any]]:
    matches = []
    for event in payload.get("events", []):
        competition = (event.get("competitions") or [{}])[0]
        competitors = competition.get("competitors") or []
        home = next((item for item in competitors if item.get("homeAway") == "home"), None)
        away = next((item for item in competitors if item.get("homeAway") == "away"), None)
        if not home or not away:
            continue
        home_team = home.get("team", {})
        away_team = away.get("team", {})
        status = competition.get("status", {})
        status_type = status.get("type", {})
        venue = competition.get("venue", {})
        home_code = home_team.get("abbreviation", "")
        away_code = away_team.get("abbreviation", "")
        matches.append({
            "id": str(event.get("id", "")),
            "date_utc": event.get("date", ""),
            "state": status_type.get("state", "pre"),
            "status": status_type.get("shortDetail") or status_type.get("description", ""),
            "clock": status.get("displayClock", ""),
            "completed": bool(status_type.get("completed")),
            "venue": venue.get("fullName", ""),
            "city": venue.get("address", {}).get("city", ""),
            "home": {
                "code": home_code,
                "name_zh": team_names.get(home_code, home_team.get("displayName", "")),
                "name_en": home_team.get("displayName", ""),
                "logo": home_team.get("logo", ""),
                "score": int(home.get("score") or 0),
            },
            "away": {
                "code": away_code,
                "name_zh": team_names.get(away_code, away_team.get("displayName", "")),
                "name_en": away_team.get("displayName", ""),
                "logo": away_team.get("logo", ""),
                "score": int(away.get("score") or 0),
            },
        })
    return sorted(matches, key=lambda item: item["date_utc"])


def normalize_articles(payload: dict[str, Any], english_to_chinese: dict[str, str]) -> list[dict[str, Any]]:
    articles = []
    for article in payload.get("articles", [])[:8]:
        images = article.get("images") or []
        header_image = next((image for image in images if image.get("type") == "header"), images[0] if images else {})
        related = []
        for category in article.get("categories") or []:
            if category.get("type") == "team" and category.get("description"):
                name = category["description"]
                related.append(english_to_chinese.get(name.lower(), name))
        articles.append({
            "id": str(article.get("id", "")),
            "headline": article.get("headline", ""),
            "headline_zh": translate(article.get("headline", "")),
            "description": article.get("description", ""),
            "published": article.get("published", ""),
            "image": header_image.get("url", ""),
            "url": article.get("links", {}).get("web", {}).get("href", ""),
            "teams": related,
            "source": "ESPN",
        })
    return articles


def main() -> None:
    world_data = json.loads(WORLD_DATA_PATH.read_text())
    team_names = {team["code"]: team["name_zh"] for team in world_data["teams"]}
    english_to_chinese = {team["name_en"].lower(): team["name_zh"] for team in world_data["teams"]}
    scoreboard = fetch_json(f"{SCOREBOARD_API}?limit=200&dates={date_range()}")
    news = fetch_json(NEWS_API)
    output = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "snapshot",
        "matches": normalize_matches(scoreboard, team_names),
        "articles": normalize_articles(news, english_to_chinese),
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    print(f"Wrote {OUTPUT_PATH} with {len(output['matches'])} matches and {len(output['articles'])} articles")


if __name__ == "__main__":
    main()
