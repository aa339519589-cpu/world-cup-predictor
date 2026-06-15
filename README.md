# 世界杯实时概率情报台

React + TypeScript 的世界杯多模型概率引擎。它输出概率分布，不输出确定比分。

## 数据策略

- FIFA 数据：赛程、参赛队、报名名单、历史世界杯成绩。
- ESPN：整届 104 场赛程、实时比分和新闻。
- Open-Meteo：绑定到具体赛程时的公开天气预报。
- The Odds API：可选。没有 `THE_ODDS_API_KEY` 时明确标记 `not_configured`，市场模型权重为 0。
- API-Football、Sportmonks、Sportradar：预留适配器；未授权时不参与计算。

## 模型

- Elo / 排名强度
- Poisson 0-6+ 比分分布
- 技术统计代理模型
- 阵容与伤停模型
- 市场赔率去水模型
- 动态权重 ensemble

所有比分市场均由同一份校准后的比分矩阵汇总，保证胜平负、让球、大小球和双方进球概率一致。

## 本地运行

```bash
npm install
npm run data:all
npm run dev
```

构建与检查：

```bash
npm run build
npm run lint
```

## JSON API

构建后可直接访问：

- `/api/predictions.json`
- `/api/matches.json`
- `/api/odds.json`

GitHub Actions 每 10 分钟刷新数据、重建 API 并部署 GitHub Pages。
