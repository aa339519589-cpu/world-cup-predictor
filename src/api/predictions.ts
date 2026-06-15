import type {
  MarketComparisonRow,
  Prediction,
  PredictionContext,
  PredictionFactor,
  RiskFlag,
  ScoreCell,
} from '../engineTypes'
import { apiFootballSource } from '../dataSources/apiFootball'
import { fifaSource } from '../dataSources/fifa'
import { newsSource } from '../dataSources/news'
import { oddsSource } from '../dataSources/oddsApi'
import { sportradarSource } from '../dataSources/sportradar'
import { sportmonksSource } from '../dataSources/sportmonks'
import { weatherSource } from '../dataSources/weather'
import { runEloModel } from '../models/eloModel'
import { runEnsemble } from '../models/ensembleModel'
import { runLineupModel } from '../models/lineupModel'
import { runMarketModel } from '../models/marketModel'
import { runPoissonModel } from '../models/poissonModel'
import { adjustWeights } from '../models/weightAdjuster'
import { runXgModel } from '../models/xgModel'
import { calculateConfidence } from '../utils/confidence'
import { calibrateMatrix, clamp } from '../utils/probability'

function rawFactors(context: PredictionContext): PredictionFactor[] {
  const { home, away } = context
  const values = [
    ['FIFA 排名', '排名差进入 Elo 子模型。', home.ranking, away.ranking, 1.2, true, 'number'],
    ['世界杯历史 PPG', '长期大赛底盘。', home.history.ppg, away.history.ppg, 9, false, 'number'],
    ['近期状态', '最近样本加权场均积分。', home.recent_form.weighted_ppg, away.recent_form.weighted_ppg, 12, false, 'number'],
    ['进攻产出', '近期加权场均进球。', home.recent_form.weighted_gf_per_match, away.recent_form.weighted_gf_per_match, 10, false, 'number'],
    ['防守失球', '近期加权场均失球，越低越好。', home.recent_form.weighted_ga_per_match, away.recent_form.weighted_ga_per_match, 10, true, 'number'],
    ['名单厚度', '高水平联赛球员占比。', home.squad.elite_share, away.squad.elite_share, 24, false, 'percent'],
    ['大赛经验', '高国家队出场球员占比。', home.squad.veteran_share, away.squad.veteran_share, 18, false, 'percent'],
    ['伤停影响', '已确认重点伤停扣分，越低越好。', home.model.injury_penalty, away.model.injury_penalty, 1.6, true, 'number'],
  ] as const
  return values.map(([label, note, homeValue, awayValue, weight, inverse, format]) => ({
    label,
    note,
    homeValue,
    awayValue,
    delta: (inverse ? awayValue - homeValue : homeValue - awayValue) * weight,
    format,
  })).sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
}

function sumCells(matrix: ScoreCell[], predicate: (cell: ScoreCell) => boolean) {
  return matrix.filter(predicate).reduce((sum, cell) => sum + cell.probability, 0)
}

function marketRows(probability: Prediction): MarketComparisonRow[] {
  const market = probability.models.find((model) => model.id === 'market_odds' && model.available)
  if (!market) return []
  return [
    ['主胜', probability.homeWin, market.homeWin],
    ['平局', probability.draw, market.draw],
    ['客胜', probability.awayWin, market.awayWin],
  ].map(([label, model, marketValue]) => {
    const edge = Number(model) - Number(marketValue)
    return {
      label: String(label),
      model: Number(model),
      market: Number(marketValue),
      edge,
      value: edge >= 0.04,
    }
  })
}

function riskFlags(
  context: PredictionContext,
  draw: number,
  upset: number,
  marketAnomaly: boolean,
  modelDisagreement: number,
): RiskFlag[] {
  const flags: RiskFlag[] = [{
    id: 'lineup',
    level: 'medium',
    label: '官方首发未公布',
    detail: '当前采用报名名单和伤停信息；官方首发接入后应重新计算。',
  }]
  if (draw >= 0.29) flags.push({
    id: 'draw',
    level: 'high',
    label: '平局风险偏高',
    detail: `90 分钟平局概率达到 ${(draw * 100).toFixed(1)}%。`,
  })
  if (upset >= 0.28) flags.push({
    id: 'upset',
    level: upset >= 0.36 ? 'high' : 'medium',
    label: '爆冷窗口存在',
    detail: `排名较低一方取胜概率为 ${(upset * 100).toFixed(1)}%。`,
  })
  if (marketAnomaly) flags.push({
    id: 'market',
    level: 'high',
    label: '市场赔率异常',
    detail: '至少一个来源偏离市场中位数，市场权重已自动降低。',
  })
  if (modelDisagreement >= 0.22) flags.push({
    id: 'disagreement',
    level: 'high',
    label: '模型分歧较大',
    detail: '子模型对最可能结果的判断差距较大，应降低结论确定性。',
  })
  if (context.weather?.status === 'success' &&
    ((context.weather.precipitationProbability ?? 0) >= 70 || (context.weather.windKph ?? 0) >= 32)) {
    flags.push({
      id: 'weather',
      level: 'medium',
      label: '天气压低进球',
      detail: '高降水概率或强风已经降低双方进球期望。',
    })
  }
  return flags
}

export function buildPrediction(context: PredictionContext): Prediction {
  const now = context.now ?? new Date()
  const elo = runEloModel(context)
  const poisson = runPoissonModel(context)
  const technical = runXgModel(context)
  const lineup = runLineupModel(context)
  const market = runMarketModel(context)
  const models = [elo, poisson.model, technical, lineup, market.model]
  const modelWeights = adjustWeights(context, models, market.anomaly)
  const finalProbability = runEnsemble(models, modelWeights)
  const scoreMatrix = calibrateMatrix(poisson.matrix, finalProbability)
  const scorelines = [...scoreMatrix].sort((left, right) => right.probability - left.probability).slice(0, 10)

  const over25 = sumCells(scoreMatrix, (cell) => cell.homeGoals + cell.awayGoals >= 3)
  const over35 = sumCells(scoreMatrix, (cell) => cell.homeGoals + cell.awayGoals >= 4)
  const bttsYes = sumCells(scoreMatrix, (cell) => cell.homeGoals > 0 && cell.awayGoals > 0)
  const line = -1
  const homeCover = sumCells(scoreMatrix, (cell) => cell.homeGoals - cell.awayGoals > 1)
  const push = sumCells(scoreMatrix, (cell) => cell.homeGoals - cell.awayGoals === 1)
  const awayCover = 1 - homeCover - push

  const favorite = finalProbability.homeWin >= finalProbability.awayWin ? context.home : context.away
  const upsetProbability = context.home.ranking < context.away.ranking ? finalProbability.awayWin : finalProbability.homeWin
  const modelFavorites = models.filter((model) => model.available).map((model) => Math.max(model.homeWin, model.draw, model.awayWin))
  const modelDisagreement = Math.max(...modelFavorites) - Math.min(...modelFavorites)

  const sources = [
    fifaSource(context.data, modelWeights.elo + modelWeights.lineup_injury, now),
    {
      id: 'espn-live',
      label: 'ESPN 实时赛程与比分',
      category: '实时赛事',
      status: context.live.source === 'live' ? 'success' as const : 'stale' as const,
      updatedAt: context.live.generated_at_utc,
      ageMinutes: Math.max(0, (now.getTime() - new Date(context.live.generated_at_utc).getTime()) / 60_000),
      weight: modelWeights.poisson_xg * 0.25,
      participated: true,
      detail: context.live.source === 'live' ? '实时比分和比赛状态已同步。' : '实时接口失败，正在使用最近快照。',
    },
    apiFootballSource(),
    sportmonksSource(),
    sportradarSource(),
    oddsSource(context.odds, modelWeights.market_odds, now),
    weatherSource(context.weather, context.weather?.status === 'success' ? 0.03 : 0),
    newsSource(context.live, now),
    {
      id: 'lineups',
      label: '官方首发',
      category: '阵容',
      status: 'projected' as const,
      updatedAt: '',
      ageMinutes: null,
      weight: modelWeights.lineup_injury,
      participated: true,
      detail: '官方首发尚未公布或未接入，使用报名名单与伤停进行预测。',
    },
  ]

  const provisional = {
    ...finalProbability,
    models,
  } as Prediction
  const comparison = marketRows(provisional)
  const risks = riskFlags(context, finalProbability.draw, upsetProbability, market.anomaly, modelDisagreement)
  const confidence = calculateConfidence(finalProbability, models, sources) *
    (market.model.available ? 1 : 0.94) *
    (context.weather?.status === 'failed' ? 0.97 : 1)
  const top = scorelines[0]
  const safeRange = favorite.code === context.home.code
    ? `${context.home.name_zh}不败 / 小于 3.5 球 ${(1 - over35) >= 0.62 ? '更稳健' : '需谨慎'}`
    : `${context.away.name_zh}不败 / 小于 3.5 球 ${(1 - over35) >= 0.62 ? '更稳健' : '需谨慎'}`
  const label = Math.max(finalProbability.homeWin, finalProbability.awayWin) >= 0.6 ? '优势较清晰' : '概率领先'

  return {
    home: context.home,
    away: context.away,
    stage: context.stage,
    match: context.match,
    updatedAt: now.toISOString(),
    factors: rawFactors(context),
    homeExpectedGoals: poisson.homeLambda,
    awayExpectedGoals: poisson.awayLambda,
    ...finalProbability,
    scoreMatrix,
    scorelines,
    handicap: { line, homeCover, push, awayCover },
    goalMarkets: {
      over25,
      under25: 1 - over25,
      over35,
      under35: 1 - over35,
      bttsYes,
      bttsNo: 1 - bttsYes,
    },
    upsetProbability,
    drawRisk: finalProbability.draw >= 0.29 ? 'high' : finalProbability.draw >= 0.24 ? 'medium' : 'low',
    headline: `${favorite.name_zh} ${label}`,
    detail: `最可能比分 ${top.homeGoals}-${top.awayGoals}，但它的概率只有 ${(top.probability * 100).toFixed(1)}%。这是分布，不是确定比分。`,
    confidence: clamp(0.3, 0.86, confidence),
    models,
    modelWeights,
    sourceStatuses: sources,
    marketComparison: comparison,
    riskFlags: risks,
    finalVerdict: {
      mostLikelyResult: `${favorite.name_zh}胜 ${(Math.max(finalProbability.homeWin, finalProbability.awayWin) * 100).toFixed(1)}%`,
      mostLikelyScore: `${top.homeGoals}-${top.awayGoals} ${(top.probability * 100).toFixed(1)}%`,
      safeRange,
    },
  }
}

export function predictionToJson(prediction: Prediction) {
  return {
    match: `${prediction.home.name_en} vs ${prediction.away.name_en}`,
    updated_at: prediction.updatedAt,
    data_freshness: Object.fromEntries(prediction.sourceStatuses.map((source) => [source.id, source.status])),
    win_draw_loss: {
      home_win: prediction.homeWin,
      draw: prediction.draw,
      away_win: prediction.awayWin,
    },
    handicap_home_minus_1: {
      home_cover: prediction.handicap.homeCover,
      push: prediction.handicap.push,
      away_cover: prediction.handicap.awayCover,
    },
    expected_goals: {
      home_xg_proxy: prediction.homeExpectedGoals,
      away_xg_proxy: prediction.awayExpectedGoals,
    },
    most_likely_scores: prediction.scorelines.map((cell) => ({
      score: `${cell.homeGoals}-${cell.awayGoals}`,
      probability: cell.probability,
    })),
    goal_markets: {
      over_2_5: prediction.goalMarkets.over25,
      under_2_5: prediction.goalMarkets.under25,
      both_teams_to_score_yes: prediction.goalMarkets.bttsYes,
      both_teams_to_score_no: prediction.goalMarkets.bttsNo,
    },
    risk_flags: {
      upset_probability: prediction.upsetProbability,
      draw_risk: prediction.drawRisk,
      flags: prediction.riskFlags,
    },
    model_weights: prediction.modelWeights,
    source_statuses: prediction.sourceStatuses,
    final_verdict: prediction.finalVerdict,
    confidence: prediction.confidence,
  }
}
