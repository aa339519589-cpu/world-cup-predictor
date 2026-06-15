import type { ModelResult, PredictionContext } from '../engineTypes'
import { findOddsMatch } from '../dataSources/oddsApi'
import { aggregateBookmakers } from '../utils/normalizeOdds'

export type MarketResult = {
  model: ModelResult
  anomaly: boolean
  bookmakerCount: number
}

export function runMarketModel(context: PredictionContext): MarketResult {
  const match = findOddsMatch(context.odds, context.home.code, context.away.code)
  const aggregate = match ? aggregateBookmakers(match.bookmakers) : null
  if (!aggregate) {
    return {
      anomaly: false,
      bookmakerCount: 0,
      model: {
        id: 'market_odds',
        label: '市场赔率校准',
        homeWin: 0,
        draw: 0,
        awayWin: 0,
        confidence: 0,
        available: false,
        detail: '没有可验证的多公司赔率，市场模型不参与最终概率。',
      },
    }
  }
  return {
    anomaly: aggregate.anomaly,
    bookmakerCount: aggregate.used.length,
    model: {
      id: 'market_odds',
      label: '市场赔率校准',
      ...aggregate.probability,
      confidence: aggregate.used.length >= 5 ? 0.82 : 0.65,
      available: true,
      detail: `${aggregate.used.length} 家来源已分别去水、异常值过滤后加权。`,
    },
  }
}
