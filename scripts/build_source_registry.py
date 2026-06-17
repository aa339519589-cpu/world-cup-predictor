#!/usr/bin/env python3
"""Build backend data source registry for the World Cup prediction pipeline.

Backend only: this file creates a machine-readable source map for data jobs.
The front-end does not import it directly.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
OUTPUT_PATH = PUBLIC_DIR / "data-source-registry.json"

SOURCES: list[dict[str, Any]] = [
    {
        "id": "fifa_official",
        "name": "FIFA 官方世界杯页面 / API",
        "category": "official",
        "url": "https://www.fifa.com",
        "access": "official_api_or_scrape",
        "backend_target": "base_master",
        "integration_state": "active",
        "priority": "P0",
        "enabled_by_default": True,
        "notes": "赛程、比分、场地、球队、官方结果；主数据最高权威。",
    },
    {
        "id": "fifa_ranking_men",
        "name": "FIFA/Coca-Cola 男足世界排名",
        "category": "official",
        "url": "https://inside.fifa.com/fifa-world-ranking/men",
        "access": "html",
        "backend_target": "rating_baseline",
        "integration_state": "candidate",
        "priority": "P0",
        "enabled_by_default": False,
        "notes": "国家队排名、积分、排名变化；用于实力基准和 Elo 初值。",
    },
    {
        "id": "openfootball_worldcup",
        "name": "OpenFootball WorldCup",
        "category": "open_data",
        "url": "https://github.com/openfootball/worldcup",
        "access": "github_text_json",
        "backend_target": "worldcup_schedule_history",
        "integration_state": "active",
        "priority": "P0",
        "enabled_by_default": True,
        "notes": "免费、干净的世界杯赛程与历史库；当前基础历史源之一。",
    },
    {
        "id": "espn_site_api",
        "name": "ESPN Site API",
        "category": "live_api",
        "url": "https://site.api.espn.com",
        "access": "public_rest_api",
        "backend_target": "live_score_news",
        "integration_state": "active",
        "priority": "P0",
        "enabled_by_default": True,
        "notes": "当前用于实时比分与新闻快照；失败时回退 public/live-data.json。",
    },
    {
        "id": "the_odds_api",
        "name": "The Odds API",
        "category": "odds",
        "url": "https://the-odds-api.com",
        "access": "rest_api",
        "backend_target": "multi_bookmaker_odds",
        "integration_state": "active_optional",
        "priority": "P0",
        "enabled_by_default": True,
        "notes": "多家博彩公司实时赔率；当前 build_market_data.py 已支持，需 THE_ODDS_API_KEY。",
    },
    {
        "id": "open_meteo",
        "name": "Open-Meteo",
        "category": "weather",
        "url": "https://open-meteo.com",
        "access": "free_api",
        "backend_target": "match_weather_forecast",
        "integration_state": "active",
        "priority": "P0",
        "enabled_by_default": True,
        "notes": "比赛地天气预测；当前天气模型已接入。",
    },
    {
        "id": "fbref_world_cup",
        "name": "FBref World Cup",
        "category": "stats",
        "url": "https://fbref.com/en/comps/1/World-Cup-Stats",
        "access": "html_tables",
        "backend_target": "team_player_stats_xg",
        "integration_state": "scrape_candidate",
        "priority": "P1",
        "enabled_by_default": False,
        "notes": "球队、球员、xG、射门、传球、防守；预测核心补充源。",
    },
    {
        "id": "football_data_uk",
        "name": "Football-Data.co.uk",
        "category": "odds_history",
        "url": "https://www.football-data.co.uk/data.php",
        "access": "csv_excel",
        "backend_target": "market_calibration_history",
        "integration_state": "candidate",
        "priority": "P1",
        "enabled_by_default": False,
        "notes": "历史赛果、赔率、盘口；适合赔率校准和历史结果建模。",
    },
    {
        "id": "fjelstul_worldcup",
        "name": "Fjelstul World Cup Database",
        "category": "open_data",
        "url": "https://github.com/jfjelstul/worldcup",
        "access": "github_csv_r",
        "backend_target": "worldcup_history_deep",
        "integration_state": "candidate",
        "priority": "P1",
        "enabled_by_default": False,
        "notes": "世界杯历史比赛、球员、教练、裁判、进球、红黄牌、换人。",
    },
    {
        "id": "statsbomb_open_data",
        "name": "StatsBomb Open Data",
        "category": "open_data",
        "url": "https://github.com/statsbomb/open-data",
        "access": "github_json",
        "backend_target": "event_model_training",
        "integration_state": "candidate",
        "priority": "P1",
        "enabled_by_default": False,
        "notes": "事件级数据；适合训练特征工程，不作为 2026 实时主源。",
    },
    {
        "id": "api_football",
        "name": "API-Football / API-Sports",
        "category": "api",
        "url": "https://www.api-football.com",
        "access": "rest_api",
        "backend_target": "fixtures_lineups_events_odds",
        "integration_state": "candidate",
        "priority": "P1",
        "enabled_by_default": False,
        "notes": "赛程、阵容、事件、球员、统计、赔率、预测；工程接入方便。",
    },
    {
        "id": "transfermarkt",
        "name": "Transfermarkt",
        "category": "squad_market",
        "url": "https://www.transfermarkt.com",
        "access": "html",
        "backend_target": "market_value_squad_depth_injuries",
        "integration_state": "scrape_candidate",
        "priority": "P1",
        "enabled_by_default": False,
        "notes": "阵容、市值、年龄、俱乐部、伤病、身价；适合阵容深度变量。",
    },
    {
        "id": "fotmob_worldcup",
        "name": "FotMob World Cup",
        "category": "ratings",
        "url": "https://www.fotmob.com",
        "access": "scrape_or_unofficial_api",
        "backend_target": "xg_ratings_recent_form",
        "integration_state": "scrape_candidate",
        "priority": "P1",
        "enabled_by_default": False,
        "notes": "xG、xPts、球员评分、射门；预测价值高但稳定性需验证。",
    },
    {
        "id": "sofascore_worldcup",
        "name": "Sofascore World Cup",
        "category": "ratings",
        "url": "https://www.sofascore.com",
        "access": "scrape_or_unofficial_api",
        "backend_target": "live_stats_ratings_heatmaps",
        "integration_state": "scrape_candidate",
        "priority": "P1",
        "enabled_by_default": False,
        "notes": "实时比分、比赛统计、球员评分、热图；临场状态补充。",
    },
    {
        "id": "sporttery_jc",
        "name": "中国竞彩网 / 中国体育彩票竞彩",
        "category": "odds_cn",
        "url": "https://www.sporttery.cn/jc/jsq/zqspf/",
        "access": "html",
        "backend_target": "cn_official_lottery_odds",
        "integration_state": "scrape_candidate",
        "priority": "P1",
        "enabled_by_default": False,
        "notes": "竞彩胜平负官方赔率；适合国内赔率校准。",
    },
    {
        "id": "soccerdata_python",
        "name": "SoccerData Python 包",
        "category": "tooling",
        "url": "https://soccerdata.readthedocs.io",
        "access": "python_package",
        "backend_target": "multi_source_ingestion",
        "integration_state": "tool_candidate",
        "priority": "P1",
        "enabled_by_default": False,
        "notes": "统一抓 FBref、ESPN、Football-Data、Sofascore、WhoScored 等；工程价值高。",
    },
    {
        "id": "kaggle_international_results",
        "name": "Kaggle International Football Results",
        "category": "open_data",
        "url": "https://www.kaggle.com/datasets/martj42/international-football-results-from-1872-to-2017",
        "access": "csv",
        "backend_target": "long_term_national_history",
        "integration_state": "manual_candidate",
        "priority": "P2",
        "enabled_by_default": False,
        "notes": "1872 年以来国家队比赛结果；适合长期胜率、Elo、交锋数据。",
    },
    {
        "id": "meteostat",
        "name": "Meteostat",
        "category": "weather_history",
        "url": "https://meteostat.net",
        "access": "api_python_bulk",
        "backend_target": "historical_weather",
        "integration_state": "candidate",
        "priority": "P2",
        "enabled_by_default": False,
        "notes": "历史气象站数据和长期天气时间序列；补天气历史库。",
    },
    {
        "id": "fivethirtyeight_spi",
        "name": "FiveThirtyEight Soccer SPI / World Cup Archive",
        "category": "model_reference",
        "url": "https://github.com/fivethirtyeight/data/tree/master/soccer-spi",
        "access": "github_csv",
        "backend_target": "model_reference_archive",
        "integration_state": "archive_reference",
        "priority": "P2",
        "enabled_by_default": False,
        "notes": "历史预测概率、SPI、比赛预测；适合参考模型思路。",
    },
    {
        "id": "stats_perform_opta",
        "name": "Stats Perform / Opta / RunningBall",
        "category": "commercial",
        "url": "https://www.statsperform.com",
        "access": "commercial_api",
        "backend_target": "premium_event_data",
        "integration_state": "paid_candidate",
        "priority": "P3",
        "enabled_by_default": False,
        "notes": "官方级事件、球员统计、投注与直播事件；质量高但需商业授权。",
    },
]

ACTIVE_PIPELINE = [
    "fifa_official",
    "openfootball_worldcup",
    "espn_site_api",
    "the_odds_api",
    "open_meteo",
]

ACTIVATION_PLAN = [
    {
        "phase": "P0 保持稳定",
        "goal": "只保留当前已经接入或可安全接入的主数据源，避免前端展示虚构数据。",
        "source_ids": ACTIVE_PIPELINE,
    },
    {
        "phase": "P1 扩充预测变量",
        "goal": "补充排名、xG/技术统计、阵容深度、赔率历史、事件样本和国内赔率。",
        "source_ids": [
            "fifa_ranking_men",
            "fbref_world_cup",
            "football_data_uk",
            "fjelstul_worldcup",
            "statsbomb_open_data",
            "api_football",
            "transfermarkt",
            "fotmob_worldcup",
            "sofascore_worldcup",
            "sporttery_jc",
            "soccerdata_python",
        ],
    },
    {
        "phase": "P2/P3 备份与参考",
        "goal": "补长期历史、天气历史、历史模型参考和商业授权备选。",
        "source_ids": [
            "kaggle_international_results",
            "meteostat",
            "fivethirtyeight_spi",
            "stats_perform_opta",
        ],
    },
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def validate_sources() -> None:
    ids = [source["id"] for source in SOURCES]
    duplicates = sorted({source_id for source_id in ids if ids.count(source_id) > 1})
    if duplicates:
        raise SystemExit(f"Duplicate source ids: {', '.join(duplicates)}")

    known = set(ids)
    missing = sorted(
        source_id
        for phase in ACTIVATION_PLAN
        for source_id in phase["source_ids"]
        if source_id not in known
    )
    if missing:
        raise SystemExit(f"Activation plan references unknown sources: {', '.join(missing)}")


def build_registry() -> dict[str, Any]:
    validate_sources()
    return {
        "schema_version": 1,
        "generated_at_utc": utc_now(),
        "front_end_scope": "none",
        "policy": {
            "principle": "后端只接入可验证来源；未授权、未配置或抓取不稳定的数据源只能标记候选，不伪造数据。",
            "no_frontend_change": True,
            "commercial_sources_require_keys": True,
            "scrape_sources_require_rate_limit": True,
        },
        "active_pipeline": ACTIVE_PIPELINE,
        "activation_plan": ACTIVATION_PLAN,
        "sources": SOURCES,
    }


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    registry = build_registry()
    OUTPUT_PATH.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} with {len(SOURCES)} sources")


if __name__ == "__main__":
    main()
