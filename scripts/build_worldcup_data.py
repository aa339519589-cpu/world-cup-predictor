#!/usr/bin/env python3

from __future__ import annotations

import json
import math
import re
import subprocess
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, date, datetime
from http.client import IncompleteRead
from pathlib import Path
from statistics import mean
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

try:
    import pdfplumber
except ImportError as exc:  # pragma: no cover - runtime guard
    raise SystemExit(
        "Missing dependency: pdfplumber. "
        "Run this script inside the bundled Codex Python runtime or install pdfplumber."
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
WORK_DIR = ROOT / "work"
PUBLIC_DIR = ROOT / "public"
OUTPUT_PATH = PUBLIC_DIR / "world-cup-data.json"
SQUAD_PDF_PATH = WORK_DIR / "SquadLists-English.pdf"
HISTORY_REPO_PATH = WORK_DIR / "worldcup.json"

SQUAD_PDF_URL = "https://fdp.fifa.org/assetspublic/ce281/pdf/SquadLists-English.pdf"
WORLD_CUP_HISTORY_REPO = "https://github.com/openfootball/worldcup.json.git"
CURRENT_SEASON_ID = "285023"
CURRENT_WORLD_CUP_FROM = "2026-06-11T00:00:00Z"
CURRENT_WORLD_CUP_TO = "2026-07-20T23:59:59Z"
RECENT_FORM_FROM = "2024-01-01T00:00:00Z"
RECENT_FORM_TO = "2026-06-15T23:59:59Z"
AS_OF_CHINA = "2026-06-15 23:59"
AS_OF_DATE = date(2026, 6, 15)

ELITE_LEAGUE_COUNTRIES = {"ENG", "ESP", "GER", "ITA", "FRA", "NED", "POR"}
HOST_CODES = {"CAN", "MEX", "USA"}
POSITION_ZH = {"GK": "门将", "DF": "后卫", "MF": "中场", "FW": "前锋"}

CURRENT_TEAM_ALIASES = {
    "ALG": ["Algeria"],
    "ARG": ["Argentina"],
    "AUS": ["Australia"],
    "AUT": ["Austria"],
    "BEL": ["Belgium"],
    "BIH": ["Bosnia and Herzegovina"],
    "BRA": ["Brazil"],
    "CAN": ["Canada"],
    "COD": ["Congo DR", "DR Congo", "Zaire"],
    "COL": ["Colombia"],
    "CIV": ["Côte d'Ivoire", "Ivory Coast"],
    "CPV": ["Cabo Verde", "Cape Verde"],
    "CRO": ["Croatia"],
    "CUW": ["Curaçao", "Curacao"],
    "CZE": ["Czechia", "Czech Republic", "Czechoslovakia"],
    "ECU": ["Ecuador"],
    "EGY": ["Egypt"],
    "ENG": ["England"],
    "ESP": ["Spain"],
    "FRA": ["France"],
    "GER": ["Germany", "West Germany"],
    "GHA": ["Ghana"],
    "HAI": ["Haiti"],
    "IRQ": ["Iraq"],
    "IRN": ["IR Iran", "Iran"],
    "JOR": ["Jordan"],
    "JPN": ["Japan"],
    "KOR": ["Korea Republic", "South Korea"],
    "KSA": ["Saudi Arabia"],
    "MAR": ["Morocco"],
    "MEX": ["Mexico"],
    "NED": ["Netherlands"],
    "NOR": ["Norway"],
    "NZL": ["New Zealand"],
    "PAN": ["Panama"],
    "PAR": ["Paraguay"],
    "POR": ["Portugal"],
    "QAT": ["Qatar"],
    "RSA": ["South Africa"],
    "SCO": ["Scotland"],
    "SEN": ["Senegal"],
    "SUI": ["Switzerland"],
    "SWE": ["Sweden"],
    "TUN": ["Tunisia"],
    "TUR": ["Türkiye", "Turkey"],
    "URU": ["Uruguay"],
    "USA": ["USA", "United States"],
    "UZB": ["Uzbekistan"],
}

HISTORY_NAME_TO_CODE = {
    alias: code
    for code, aliases in CURRENT_TEAM_ALIASES.items()
    for alias in aliases
}

INJURY_NOTES = [
    {
        "team_code": "BRA",
        "player": "Rodrygo",
        "status": "缺席本届",
        "detail": "右膝前十字韧带和外侧半月板重伤，已确认无缘世界杯。",
        "impact_points": 10,
        "source": {
            "label": "FIFA 官方",
            "url": "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/rodrygo-brazil-injured",
        },
    },
    {
        "team_code": "BRA",
        "player": "Neymar",
        "status": "小组前段存疑",
        "detail": "右小腿肌肉拉伤，赛前被预计缺席揭幕战，世界杯初段出场时间需要严格管理。",
        "impact_points": 5,
        "source": {
            "label": "ESPN",
            "url": "https://www.espn.com/soccer/story/_/id/48900253/neymar-calf-injury-three-weeks-miss-world-cup-opener",
        },
    },
    {
        "team_code": "BRA",
        "player": "Wesley",
        "status": "缺席本届",
        "detail": "左大腿受伤后退出巴西名单，埃德森被补招入队。",
        "impact_points": 4,
        "source": {
            "label": "ESPN",
            "url": "https://www.espn.com/soccer/story/_/id/48992759/man-united-transfer-target-ederson-brazil-world-cup-squad",
        },
    },
    {
        "team_code": "CAN",
        "player": "Alphonso Davies",
        "status": "带伤入队",
        "detail": "腿筋伤势未完全消除，入选最终名单，但赛前报道显示揭幕战出场时间并不确定。",
        "impact_points": 5,
        "source": {
            "label": "ESPN / AP",
            "url": "https://www.espn.com/soccer/story/_/id/48914937/alphonso-davies-named-canada-world-cup-squad-injury-concerns",
        },
    },
    {
        "team_code": "ENG",
        "player": "Bukayo Saka",
        "status": "负荷受控",
        "detail": "英格兰公开表示需要继续管理他的跟腱问题，比赛负荷不会完全放开。",
        "impact_points": 3,
        "source": {
            "label": "ESPN",
            "url": "https://www.espn.com/soccer/story/_/id/49011304/thomas-tuchel-england-world-cup-take-care-bukayo-saka-arsenal-fitness",
        },
    },
    {
        "team_code": "ESP",
        "player": "Lamine Yamal",
        "status": "可出场但限量",
        "detail": "左腿筋伤后恢复合练，西班牙队医已放行，但赛前仍被规划为受控分钟数使用。",
        "impact_points": 2,
        "source": {
            "label": "ESPN",
            "url": "https://www.espn.com/soccer/story/_/id/48957472/spain-lamine-yamal-injury-2026-world-cup-cape-verde-de-la-fuente",
        },
    },
    {
        "team_code": "USA",
        "player": "Christian Pulisic",
        "status": "赛后观察",
        "detail": "对巴拉圭的揭幕战半场被换下，原因是被踢到小腿后的保护性处理。",
        "impact_points": 2,
        "source": {
            "label": "ESPN",
            "url": "https://www.espn.com/soccer/story/_/id/49045997/christian-pulisic-subbed-half-usmnt-rolling",
        },
    },
    {
        "team_code": "JPN",
        "player": "Kaoru Mitoma",
        "status": "缺席本届",
        "detail": "腿筋伤势导致无缘日本最终名单，是日本边路推进能力的直接损失。",
        "impact_points": 7,
        "source": {
            "label": "ESPN",
            "url": "https://www.espn.com/soccer/story/_/id/48775615/kaoru-mitoma-ruled-world-cup-injury-takehiro-tomiyasu-recalled-japan-squad",
        },
    },
    {
        "team_code": "JPN",
        "player": "Wataru Endo",
        "status": "缺席本届",
        "detail": "左脚伤势未能痊愈，赛前三天退出名单并宣布国家队退役。",
        "impact_points": 8,
        "source": {
            "label": "ESPN",
            "url": "https://www.espn.com/soccer/story/_/id/49032127/japan-captain-wataru-endo-world-cup-injury-announces-retirement",
        },
    },
    {
        "team_code": "NED",
        "player": "Jurriën Timber",
        "status": "缺席本届",
        "detail": "腹股沟伤势未愈，荷兰官方确认他将缺席本届世界杯。",
        "impact_points": 6,
        "source": {
            "label": "ESPN",
            "url": "https://www.espn.com/soccer/story/_/id/49001511/netherlands-arsenal-defender-jurrien-timber-miss-world-cup-injury",
        },
    },
    {
        "team_code": "MAR",
        "player": "Nayef Aguerd",
        "status": "缺席本届",
        "detail": "腹股沟问题导致他在报名截止前被摩洛哥换下，球队后防核心直接减员。",
        "impact_points": 7,
        "source": {
            "label": "ESPN",
            "url": "https://www.espn.com/soccer/story/_/id/49027277/morocco-cut-injured-aguerd-ezzalzouli-last-minute-world-cup-reshuffle",
        },
    },
    {
        "team_code": "MAR",
        "player": "Abde Ezzalzouli",
        "status": "缺席本届",
        "detail": "赛前最后一次热身后因伤被撤换，摩洛哥边路爆点损失明显。",
        "impact_points": 6,
        "source": {
            "label": "ESPN",
            "url": "https://www.espn.com/soccer/story/_/id/49027277/morocco-cut-injured-aguerd-ezzalzouli-last-minute-world-cup-reshuffle",
        },
    },
    {
        "team_code": "GER",
        "player": "Serge Gnabry",
        "status": "缺席本届",
        "detail": "大腿伤势使他无缘德国世界杯名单，边路终结能力受到影响。",
        "impact_points": 6,
        "source": {
            "label": "FIFA 官方",
            "url": "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/serge-gnabry-miss-world-cup",
        },
    },
    {
        "team_code": "GER",
        "player": "Lennart Karl",
        "status": "缺席本届",
        "detail": "训练中肌肉受伤退出德国名单，年轻轮换深度受损。",
        "impact_points": 3,
        "source": {
            "label": "ESPN",
            "url": "https://www.espn.com/soccer/story/_/id/48977173/lennart-karl-injured-germany-training-miss-world-cup",
        },
    },
]

SOURCE_CATALOG = [
    {
        "label": "FIFA 官方赛程与比赛数据 API",
        "type": "official",
        "url": f"https://api.fifa.com/api/v3/calendar/matches?from={CURRENT_WORLD_CUP_FROM}&to={CURRENT_WORLD_CUP_TO}&language=zh&count=200&idSeason={CURRENT_SEASON_ID}",
    },
    {
        "label": "FIFA 官方 2026 世界杯名单 PDF",
        "type": "official",
        "url": SQUAD_PDF_URL,
    },
    {
        "label": "openfootball 世界杯历史赛果库",
        "type": "open-source",
        "url": WORLD_CUP_HISTORY_REPO,
    },
]


@dataclass
class TeamStatAccumulator:
    appearances: set[int]
    matches: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    goals_for: int = 0
    goals_against: int = 0
    points: int = 0


def clean_text(value: str | None) -> str:
    if value is None:
        return ""
    value = value.replace("\x00", "")
    value = value.replace("  ", " ")
    return " ".join(value.split()).strip()


def fetch_json(url: str) -> Any:
    last_error: Exception | None = None
    for _ in range(4):
        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json,text/plain,*/*",
                "Connection": "close",
            },
        )
        try:
            with urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except (IncompleteRead, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            continue
    if last_error is not None:  # pragma: no cover - network guard
        raise last_error
    raise RuntimeError(f"Unable to fetch {url}")


def ensure_world_cup_history_repo() -> None:
    if HISTORY_REPO_PATH.exists():
        return
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "clone", "--depth", "1", WORLD_CUP_HISTORY_REPO, str(HISTORY_REPO_PATH)],
        check=True,
        cwd=ROOT,
    )


def ensure_squad_pdf() -> None:
    if SQUAD_PDF_PATH.exists():
        return
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    request = Request(SQUAD_PDF_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request) as response:
        SQUAD_PDF_PATH.write_bytes(response.read())


def parse_int(value: str) -> int:
    return int(clean_text(value))


def parse_dob(value: str) -> date:
    return datetime.strptime(clean_text(value), "%d/%m/%Y").date()


def age_on(dob: date, ref: date) -> int:
    years = ref.year - dob.year
    if (ref.month, ref.day) < (dob.month, dob.day):
        years -= 1
    return years


def club_country_code(club_name: str) -> str | None:
    match = re.search(r"\(([A-Z]{3})\)$", club_name)
    return match.group(1) if match else None


def build_flag_url(raw_url: str | None) -> str | None:
    if not raw_url:
        return None
    return raw_url.replace("{format}", "sq").replace("{size}", "4")


def parse_squads() -> dict[str, dict[str, Any]]:
    squads: dict[str, dict[str, Any]] = {}
    with pdfplumber.open(SQUAD_PDF_PATH) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            text = page.extract_text() or ""
            lines = [clean_text(line) for line in text.splitlines() if clean_text(line)]
            if not lines:
                continue
            team_heading = next(
                (line for line in lines if re.match(r"(.+?) \(([A-Z]{3})\)$", line)),
                "",
            )
            team_match = re.match(r"(.+?) \(([A-Z]{3})\)$", team_heading)
            if not team_match or not table:
                continue

            team_name = clean_text(team_match.group(1))
            code = team_match.group(2)
            players: list[dict[str, Any]] = []
            coach_name = ""
            coach_nationality = ""

            for row in table[1:]:
                cells = [clean_text(cell) for cell in row]
                compact = [cell for cell in cells if cell]
                if not compact:
                    continue
                first = compact[0]
                if first.isdigit():
                    if len(compact) < 11:
                        continue
                    player = {
                        "number": int(first),
                        "position": compact[1],
                        "position_zh": POSITION_ZH.get(compact[1], compact[1]),
                        "player_name": compact[2],
                        "first_names": compact[3],
                        "last_names": compact[4],
                        "shirt_name": compact[5],
                        "dob": compact[6],
                        "age": age_on(parse_dob(compact[6]), AS_OF_DATE),
                        "club": compact[7],
                        "club_country": club_country_code(compact[7]),
                        "height_cm": parse_int(compact[8]),
                        "caps": parse_int(compact[9]),
                        "goals": parse_int(compact[10]),
                    }
                    players.append(player)
                elif first == "Head coach":
                    if len(compact) < 5:
                        continue
                    coach_name = compact[1]
                    coach_nationality = compact[4]

            squads[code] = {
                "team_name_en": team_name,
                "coach_name": coach_name,
                "coach_nationality": coach_nationality,
                "players": players,
            }
    return squads


def fetch_current_world_cup_matches(language: str) -> list[dict[str, Any]]:
    url = (
        "https://api.fifa.com/api/v3/calendar/matches"
        f"?from={CURRENT_WORLD_CUP_FROM}&to={CURRENT_WORLD_CUP_TO}"
        f"&language={language}&count=200&idSeason={CURRENT_SEASON_ID}"
    )
    payload = fetch_json(url)
    return payload["Results"]


def simplify_match(match_en: dict[str, Any], match_zh: dict[str, Any]) -> dict[str, Any]:
    status = "completed" if match_en.get("MatchStatus") == 0 else "scheduled"
    group_name_en = clean_text(match_en["GroupName"][0]["Description"]) if match_en.get("GroupName") else ""
    group_name_zh = clean_text(match_zh["GroupName"][0]["Description"]) if match_zh.get("GroupName") else ""
    stage_name_zh = clean_text(match_zh["StageName"][0]["Description"]) if match_zh.get("StageName") else ""
    return {
        "id": match_en["IdMatch"],
        "date_utc": match_en["Date"],
        "local_date_utc": match_en["LocalDate"],
        "status": status,
        "group_code": group_name_en.replace("Group ", "") if group_name_en else None,
        "group_name_zh": group_name_zh,
        "stage_name_zh": stage_name_zh,
        "stadium": clean_text(match_en["Stadium"]["Name"][0]["Description"]),
        "city": clean_text(match_en["Stadium"]["CityName"][0]["Description"]),
        "attendance": int(match_en["Attendance"]) if match_en.get("Attendance") else None,
        "match_number": match_en.get("MatchNumber"),
        "home": {
            "id": match_en["Home"]["IdTeam"],
            "code": match_en["Home"]["Abbreviation"],
            "name_en": clean_text(match_en["Home"]["TeamName"][0]["Description"]),
            "name_zh": clean_text(match_zh["Home"]["TeamName"][0]["Description"]),
            "score": match_en.get("HomeTeamScore"),
            "tactics": clean_text(match_en["Home"].get("Tactics")),
            "flag_url": build_flag_url(match_en["Home"].get("PictureUrl")),
        },
        "away": {
            "id": match_en["Away"]["IdTeam"],
            "code": match_en["Away"]["Abbreviation"],
            "name_en": clean_text(match_en["Away"]["TeamName"][0]["Description"]),
            "name_zh": clean_text(match_zh["Away"]["TeamName"][0]["Description"]),
            "score": match_en.get("AwayTeamScore"),
            "tactics": clean_text(match_en["Away"].get("Tactics")),
            "flag_url": build_flag_url(match_en["Away"].get("PictureUrl")),
        },
    }


def build_team_master(current_matches: list[dict[str, Any]], squads: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    master: dict[str, dict[str, Any]] = {}
    for match in current_matches:
        for side in ("home", "away"):
            team = match[side]
            code = team["code"]
            if code not in master:
                squad_data = squads.get(code, {})
                master[code] = {
                    "code": code,
                    "id": team["id"],
                    "name_en": squad_data.get("team_name_en", team["name_en"]),
                    "name_zh": team["name_zh"],
                    "group": match["group_code"],
                    "group_name_zh": match["group_name_zh"],
                    "flag_url": team["flag_url"],
                    "coach_name": squad_data.get("coach_name", ""),
                    "coach_nationality": squad_data.get("coach_nationality", ""),
                }
    return master


def parse_openfootball_score(match: dict[str, Any]) -> tuple[int, int] | None:
    score = match.get("score") or {}
    full_time = score.get("ft")
    if isinstance(full_time, list) and len(full_time) == 2:
        return int(full_time[0]), int(full_time[1])
    return None


def compute_history(team_codes: set[str]) -> dict[str, dict[str, Any]]:
    accumulators = {code: TeamStatAccumulator(appearances=set()) for code in team_codes}
    for worldcup_file in sorted(HISTORY_REPO_PATH.glob("*/worldcup.json")):
        year = int(worldcup_file.parent.name)
        payload = json.loads(worldcup_file.read_text())
        for match in payload.get("matches", []):
            score = parse_openfootball_score(match)
            if score is None:
                continue
            team1 = clean_text(match.get("team1"))
            team2 = clean_text(match.get("team2"))
            code1 = HISTORY_NAME_TO_CODE.get(team1)
            code2 = HISTORY_NAME_TO_CODE.get(team2)
            gf1, gf2 = score
            if code1:
                update_history_accumulator(accumulators[code1], gf1, gf2, year)
            if code2:
                update_history_accumulator(accumulators[code2], gf2, gf1, year)

    history = {}
    for code, acc in accumulators.items():
        matches = acc.matches or 1
        history[code] = {
            "appearances": len(acc.appearances),
            "matches": acc.matches,
            "wins": acc.wins,
            "draws": acc.draws,
            "losses": acc.losses,
            "goals_for": acc.goals_for,
            "goals_against": acc.goals_against,
            "goal_difference": acc.goals_for - acc.goals_against,
            "points": acc.points,
            "ppg": round(acc.points / matches, 3),
        }
    return history


def update_history_accumulator(acc: TeamStatAccumulator, goals_for: int, goals_against: int, year: int) -> None:
    acc.appearances.add(year)
    acc.matches += 1
    acc.goals_for += goals_for
    acc.goals_against += goals_against
    if goals_for > goals_against:
        acc.wins += 1
        acc.points += 3
    elif goals_for == goals_against:
        acc.draws += 1
        acc.points += 1
    else:
        acc.losses += 1


def is_friendly(competition_name: str) -> bool:
    return "Friendlies" in competition_name


def team_points(goals_for: int, goals_against: int) -> int:
    if goals_for > goals_against:
        return 3
    if goals_for == goals_against:
        return 1
    return 0


def fetch_recent_matches(team_id: str) -> list[dict[str, Any]]:
    url = (
        "https://api.fifa.com/api/v3/calendar/matches"
        f"?from={RECENT_FORM_FROM}&to={RECENT_FORM_TO}"
        f"&language=zh&count=40&idTeam={team_id}"
    )
    results = fetch_json(url)["Results"]
    completed = [item for item in results if item.get("MatchStatus") == 0]
    completed.sort(key=lambda item: item["Date"], reverse=True)
    return completed[:12]


def simplify_recent_match(match: dict[str, Any], team_id: str) -> dict[str, Any]:
    is_home = match["Home"]["IdTeam"] == team_id
    side = match["Home"] if is_home else match["Away"]
    opponent = match["Away"] if is_home else match["Home"]
    goals_for = int(match["HomeTeamScore"] if is_home else match["AwayTeamScore"])
    goals_against = int(match["AwayTeamScore"] if is_home else match["HomeTeamScore"])
    competition_name = clean_text(match["CompetitionName"][0]["Description"])
    return {
        "date_utc": match["Date"],
        "competition": competition_name,
        "stage": clean_text(match["StageName"][0]["Description"]),
        "is_friendly": is_friendly(competition_name),
        "venue": "主" if is_home else "客",
        "opponent_name_zh": clean_text(opponent["TeamName"][0]["Description"]),
        "opponent_code": opponent["Abbreviation"],
        "team_name_zh": clean_text(side["TeamName"][0]["Description"]),
        "scoreline": f"{goals_for}-{goals_against}",
        "goals_for": goals_for,
        "goals_against": goals_against,
        "points": team_points(goals_for, goals_against),
        "weight": 0.75 if is_friendly(competition_name) else 1.0,
    }


def compute_recent_form(team_id: str) -> dict[str, Any]:
    matches = [simplify_recent_match(match, team_id) for match in fetch_recent_matches(team_id)]
    if not matches:
        return {
            "matches": [],
            "matches_used": 0,
            "weighted_ppg": 0,
            "weighted_gf_per_match": 0,
            "weighted_ga_per_match": 0,
            "weighted_gd_per_match": 0,
            "clean_sheet_rate": 0,
        }

    total_weight = sum(match["weight"] for match in matches) or 1
    weighted_points = sum(match["points"] * match["weight"] for match in matches)
    weighted_gf = sum(match["goals_for"] * match["weight"] for match in matches)
    weighted_ga = sum(match["goals_against"] * match["weight"] for match in matches)
    weighted_clean = sum(match["weight"] for match in matches if match["goals_against"] == 0)
    return {
        "matches": matches[:6],
        "matches_used": len(matches),
        "weighted_ppg": round(weighted_points / total_weight, 3),
        "weighted_gf_per_match": round(weighted_gf / total_weight, 3),
        "weighted_ga_per_match": round(weighted_ga / total_weight, 3),
        "weighted_gd_per_match": round((weighted_gf - weighted_ga) / total_weight, 3),
        "clean_sheet_rate": round(weighted_clean / total_weight, 3),
    }


def compute_current_tournament(team_code: str, current_matches: list[dict[str, Any]]) -> dict[str, Any]:
    completed = []
    upcoming = []
    points = wins = draws = losses = goals_for = goals_against = 0
    for match in current_matches:
        if team_code not in {match["home"]["code"], match["away"]["code"]}:
            continue
        is_home = match["home"]["code"] == team_code
        team_side = match["home"] if is_home else match["away"]
        opponent = match["away"] if is_home else match["home"]
        entry = {
            "date_utc": match["date_utc"],
            "group_name_zh": match["group_name_zh"],
            "stadium": match["stadium"],
            "city": match["city"],
            "opponent_name_zh": opponent["name_zh"],
            "opponent_code": opponent["code"],
            "scoreline": None,
            "status": match["status"],
        }
        if match["status"] == "completed":
            gf = int(team_side["score"])
            ga = int(opponent["score"])
            entry["scoreline"] = f"{gf}-{ga}"
            completed.append(entry)
            points += team_points(gf, ga)
            goals_for += gf
            goals_against += ga
            if gf > ga:
                wins += 1
            elif gf == ga:
                draws += 1
            else:
                losses += 1
        else:
            upcoming.append(entry)

    matches_played = len(completed)
    return {
        "matches_played": matches_played,
        "points": points,
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "goals_for": goals_for,
        "goals_against": goals_against,
        "goal_difference": goals_for - goals_against,
        "ppg": round(points / matches_played, 3) if matches_played else 0,
        "completed_matches": completed,
        "upcoming_matches": upcoming,
    }


def compute_squad_metrics(players: list[dict[str, Any]]) -> dict[str, Any]:
    if not players:
        return {
            "size": 0,
            "avg_age": 0,
            "avg_caps": 0,
            "avg_height_cm": 0,
            "veteran_share": 0,
            "elite_share": 0,
            "forward_avg_goals": 0,
            "key_players": [],
            "players": [],
        }
    forwards = [player for player in players if player["position"] == "FW"] or players
    veterans = [player for player in players if player["caps"] >= 50]
    elite_players = [
        player for player in players if player.get("club_country") in ELITE_LEAGUE_COUNTRIES
    ]
    key_players = sorted(
        players,
        key=lambda player: (
            player["caps"] * 0.7 + player["goals"] * 1.4 + (15 if player["position"] == "FW" else 0)
        ),
        reverse=True,
    )[:5]
    return {
        "size": len(players),
        "avg_age": round(mean(player["age"] for player in players), 1),
        "avg_caps": round(mean(player["caps"] for player in players), 1),
        "avg_height_cm": round(mean(player["height_cm"] for player in players), 1),
        "veteran_share": round(len(veterans) / len(players), 3),
        "elite_share": round(len(elite_players) / len(players), 3),
        "forward_avg_goals": round(mean(player["goals"] for player in forwards), 2),
        "key_players": key_players,
        "players": players,
    }


def minmax_scores(raw_values: dict[str, float], neutral: float = 50.0) -> dict[str, float]:
    if not raw_values:
        return {}
    values = list(raw_values.values())
    low = min(values)
    high = max(values)
    if math.isclose(low, high):
        return {code: neutral for code in raw_values}
    return {
        code: round(((value - low) / (high - low)) * 100, 1)
        for code, value in raw_values.items()
    }


def build_model_inputs(team_data: dict[str, dict[str, Any]]) -> dict[str, dict[str, float]]:
    history_raw = {code: data["history"]["ppg"] for code, data in team_data.items()}
    recent_raw = {code: data["recent_form"]["weighted_ppg"] for code, data in team_data.items()}
    attack_recent = {
        code: data["recent_form"]["weighted_gf_per_match"] for code, data in team_data.items()
    }
    attack_squad = {code: data["squad"]["forward_avg_goals"] for code, data in team_data.items()}
    defense_raw = {
        code: (-data["recent_form"]["weighted_ga_per_match"]) + (data["recent_form"]["clean_sheet_rate"] * 1.4)
        for code, data in team_data.items()
    }
    experience_raw = {
        code: data["squad"]["avg_caps"] + (data["squad"]["veteran_share"] * 50)
        for code, data in team_data.items()
    }
    elite_raw = {code: data["squad"]["elite_share"] for code, data in team_data.items()}
    played_momentum_raw = {
        code: data["current_tournament"]["ppg"] + (data["current_tournament"]["goal_difference"] * 0.25)
        for code, data in team_data.items()
        if data["current_tournament"]["matches_played"] > 0
    }

    attack_recent_score = minmax_scores(attack_recent)
    attack_squad_score = minmax_scores(attack_squad)
    momentum_partial = minmax_scores(played_momentum_raw)
    momentum_scores = {}
    for code, data in team_data.items():
        if data["current_tournament"]["matches_played"] > 0:
            momentum_scores[code] = momentum_partial[code]
        else:
            momentum_scores[code] = 50.0

    return {
        "history": minmax_scores(history_raw),
        "recent": minmax_scores(recent_raw),
        "attack": {
            code: round((attack_recent_score[code] * 0.6) + (attack_squad_score[code] * 0.4), 1)
            for code in team_data
        },
        "defense": minmax_scores(defense_raw),
        "experience": minmax_scores(experience_raw),
        "elite": minmax_scores(elite_raw),
        "momentum": momentum_scores,
    }


def team_injury_entries(team_code: str) -> list[dict[str, Any]]:
    return [note for note in INJURY_NOTES if note["team_code"] == team_code]


def build_logic_scores(team_data: dict[str, dict[str, Any]]) -> None:
    components = build_model_inputs(team_data)
    for code, data in team_data.items():
        injuries = team_injury_entries(code)
        injury_penalty = round(sum(note["impact_points"] for note in injuries) * 0.55, 1)
        host_bonus = 2.5 if code in HOST_CODES else 0.0
        score = (
            components["history"][code] * 0.24
            + components["recent"][code] * 0.22
            + components["defense"][code] * 0.12
            + components["experience"][code] * 0.12
            + components["attack"][code] * 0.10
            + components["elite"][code] * 0.08
            + components["momentum"][code] * 0.07
            + host_bonus
            - injury_penalty
        )
        score = max(0.0, min(100.0, round(score, 1)))
        data["injuries"] = injuries
        data["model"] = {
            "logic_score": score,
            "tier": score_to_tier(score),
            "host_bonus": host_bonus,
            "injury_penalty": injury_penalty,
            "breakdown": {
                "history": components["history"][code],
                "recent": components["recent"][code],
                "defense": components["defense"][code],
                "experience": components["experience"][code],
                "attack": components["attack"][code],
                "elite": components["elite"][code],
                "momentum": components["momentum"][code],
            },
        }


def score_to_tier(score: float) -> str:
    if score >= 78:
        return "争冠第一梯队"
    if score >= 72:
        return "四强主流"
    if score >= 66:
        return "八强主流"
    if score >= 60:
        return "16强主流"
    if score >= 54:
        return "出线混战区"
    return "爆冷才有戏"


def project_group_tables(team_data: dict[str, dict[str, Any]], current_matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for code, data in team_data.items():
        group = data["group"]
        group_name_zh = data["group_name_zh"]
        groups.setdefault(group, {"group": group, "group_name_zh": group_name_zh, "teams": {}, "matches": []})
        groups[group]["teams"][code] = {
            "code": code,
            "name_zh": data["name_zh"],
            "flag_url": data["flag_url"],
            "logic_score": data["model"]["logic_score"],
            "actual_points": 0.0,
            "actual_gd": 0.0,
            "actual_gf": 0.0,
            "actual_ga": 0.0,
            "projected_points": 0.0,
            "projected_gd": 0.0,
            "projected_gf": 0.0,
            "projected_ga": 0.0,
        }

    for match in current_matches:
        group = match["group_code"]
        groups[group]["matches"].append(match)
        home_code = match["home"]["code"]
        away_code = match["away"]["code"]
        home = groups[group]["teams"][home_code]
        away = groups[group]["teams"][away_code]
        if match["status"] == "completed":
            home_gf = int(match["home"]["score"])
            away_gf = int(match["away"]["score"])
            home["actual_points"] += team_points(home_gf, away_gf)
            away["actual_points"] += team_points(away_gf, home_gf)
            home["actual_gd"] += home_gf - away_gf
            away["actual_gd"] += away_gf - home_gf
            home["actual_gf"] += home_gf
            away["actual_gf"] += away_gf
            home["actual_ga"] += away_gf
            away["actual_ga"] += home_gf
            home["projected_points"] += team_points(home_gf, away_gf)
            away["projected_points"] += team_points(away_gf, home_gf)
            home["projected_gd"] += home_gf - away_gf
            away["projected_gd"] += away_gf - home_gf
            home["projected_gf"] += home_gf
            away["projected_gf"] += away_gf
            home["projected_ga"] += away_gf
            away["projected_ga"] += home_gf
        else:
            gap = team_data[home_code]["model"]["logic_score"] - team_data[away_code]["model"]["logic_score"]
            expected_home_points = 1.5 + (1.15 * math.tanh(gap / 15))
            expected_away_points = 3 - expected_home_points
            expected_gd = 1.25 * math.tanh(gap / 13)
            home["projected_points"] += expected_home_points
            away["projected_points"] += expected_away_points
            home["projected_gd"] += expected_gd
            away["projected_gd"] -= expected_gd
            home["projected_gf"] += max(0.4, 1.3 + (expected_gd * 0.45))
            away["projected_gf"] += max(0.3, 1.3 - (expected_gd * 0.45))
            home["projected_ga"] += max(0.3, 1.3 - (expected_gd * 0.45))
            away["projected_ga"] += max(0.4, 1.3 + (expected_gd * 0.45))

    ranked_groups: list[dict[str, Any]] = []
    for group_key in sorted(groups):
        group = groups[group_key]
        table = list(group["teams"].values())
        table.sort(
            key=lambda item: (
                round(item["projected_points"], 3),
                round(item["projected_gd"], 3),
                round(item["projected_gf"], 3),
                item["logic_score"],
            ),
            reverse=True,
        )
        for index, row in enumerate(table, start=1):
            row["projected_position"] = index
            row["projected_points"] = round(row["projected_points"], 2)
            row["projected_gd"] = round(row["projected_gd"], 2)
            row["projected_gf"] = round(row["projected_gf"], 2)
            row["projected_ga"] = round(row["projected_ga"], 2)
        ranked_groups.append(
            {
                "group": group["group"],
                "group_name_zh": group["group_name_zh"],
                "teams": table,
                "matches": group["matches"],
            }
        )

    third_place_pool = []
    for group in ranked_groups:
        third = next(team for team in group["teams"] if team["projected_position"] == 3)
        third_place_pool.append(third)
    third_place_pool.sort(
        key=lambda item: (
            item["projected_points"],
            item["projected_gd"],
            item["logic_score"],
        ),
        reverse=True,
    )
    best_thirds = {team["code"] for team in third_place_pool[:8]}

    for group in ranked_groups:
        opponent_score_lookup = {team["code"]: team["logic_score"] for team in group["teams"]}
        for row in group["teams"]:
            difficulty = mean(
                score for code, score in opponent_score_lookup.items() if code != row["code"]
            )
            row["group_difficulty"] = round(difficulty, 1)
            if row["projected_position"] <= 2:
                row["advancement_label"] = "预计直接出线"
            elif row["projected_position"] == 3 and row["code"] in best_thirds:
                row["advancement_label"] = "预计第三名出线"
            else:
                row["advancement_label"] = "预计止步小组"
            team_data[row["code"]]["projection"] = {
                "projected_group_position": row["projected_position"],
                "projected_group_points": row["projected_points"],
                "projected_group_difficulty": row["group_difficulty"],
                "advancement_label": row["advancement_label"],
            }
    return ranked_groups


def build_output() -> dict[str, Any]:
    ensure_world_cup_history_repo()
    ensure_squad_pdf()

    squads = parse_squads()
    matches_en = fetch_current_world_cup_matches("en")
    matches_zh = fetch_current_world_cup_matches("zh")
    current_matches = [
        simplify_match(match_en, match_zh)
        for match_en, match_zh in zip(matches_en, matches_zh, strict=True)
        if match_en.get("IdStage") == "289273"
    ]
    team_master = build_team_master(current_matches, squads)
    history = compute_history(set(team_master))

    with ThreadPoolExecutor(max_workers=8) as executor:
        recent_forms = {
            code: future.result()
            for code, future in {
                code: executor.submit(compute_recent_form, team["id"])
                for code, team in team_master.items()
            }.items()
        }

    team_data: dict[str, dict[str, Any]] = {}
    for code, team in team_master.items():
        squad_entry = squads.get(code, {})
        team_data[code] = {
            **team,
            "history": history.get(code, {}),
            "recent_form": recent_forms[code],
            "current_tournament": compute_current_tournament(code, current_matches),
            "squad": compute_squad_metrics(squad_entry.get("players", [])),
        }

    build_logic_scores(team_data)
    groups = project_group_tables(team_data, current_matches)

    ordered_teams = sorted(
        team_data.values(),
        key=lambda item: (
            item["model"]["logic_score"],
            item["history"]["ppg"],
            item["recent_form"]["weighted_ppg"],
        ),
        reverse=True,
    )
    for index, team in enumerate(ordered_teams, start=1):
        team["ranking"] = index

    all_injuries = []
    for team in ordered_teams:
        for note in team["injuries"]:
            all_injuries.append(
                {
                    **note,
                    "team_name_zh": team["name_zh"],
                    "team_flag_url": team["flag_url"],
                    "logic_score": team["model"]["logic_score"],
                }
            )
    all_injuries.sort(key=lambda item: item["impact_points"], reverse=True)

    completed_matches = sum(1 for match in current_matches if match["status"] == "completed")
    return {
        "generated_at_utc": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "as_of_china": AS_OF_CHINA,
        "tournament": {
            "season_id": CURRENT_SEASON_ID,
            "name_zh": "2026 国际足联世界杯",
            "date_range_zh": "2026年6月11日 - 2026年7月19日",
            "matches_completed": completed_matches,
            "matches_total": len(current_matches),
            "group_format_zh": "12个小组、前二直接出线，8个成绩最好的第三名晋级32强。",
        },
        "methodology": {
            "headline": "完全透明的逻辑评分，不用黑盒模型。",
            "weights": [
                {"name": "世界杯历史场均积分", "weight": 24},
                {"name": "近两年国家队加权场均积分", "weight": 22},
                {"name": "近两年防守稳定性", "weight": 12},
                {"name": "名单经验值", "weight": 12},
                {"name": "进攻产量", "weight": 10},
                {"name": "高竞争联赛覆盖", "weight": 8},
                {"name": "本届开局势头", "weight": 7},
            ],
            "notes": [
                "历史积分统一按3分制回算，便于跨年代比较。",
                "近两年状态来自 FIFA 官方赛程接口，友谊赛按0.75权重折算。",
                "伤停只减分，不会凭空加分；仅纳入有公开来源可核的关键球员信息。",
                "东道主加拿大、墨西哥、美国获得固定主场环境加成。",
                "小组预测先锁定已打完比赛，再用队伍逻辑分差估算剩余场次的预期积分。",
            ],
        },
        "sources": SOURCE_CATALOG,
        "overview": {
            "top_contenders": [
                {
                    "rank": team["ranking"],
                    "code": team["code"],
                    "name_zh": team["name_zh"],
                    "group_name_zh": team["group_name_zh"],
                    "logic_score": team["model"]["logic_score"],
                    "tier": team["model"]["tier"],
                    "advancement_label": team["projection"]["advancement_label"],
                }
                for team in ordered_teams[:12]
            ],
        },
        "groups": groups,
        "injuries": all_injuries,
        "teams": ordered_teams,
    }


def main() -> None:
    payload = build_output()
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    try:
        main()
    except HTTPError as error:  # pragma: no cover - network guard
        raise SystemExit(f"HTTP error while building data: {error}") from error
