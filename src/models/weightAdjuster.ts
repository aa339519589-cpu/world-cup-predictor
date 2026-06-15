import type { ModelResult, PredictionContext } from '../engineTypes'

const BASE: Record<ModelResult['id'], number> = {
  elo: 0.25,
  poisson_xg: 0.25,
  technical_stats: 0.2,
  lineup_injury: 0.15,
  market_odds: 0.15,
}

export function adjustWeights(
  context: PredictionContext,
  models: ModelResult[],
  marketAnomaly: boolean,
) {
  const weights = { ...BASE }
  const modelMap = new Map(models.map((model) => [model.id, model]))
  if (!modelMap.get('market_odds')?.available) weights.market_odds = 0
  if (marketAnomaly) weights.market_odds *= 0.35

  // Real xG is unavailable, so the technical proxy cannot retain the full nominal weight.
  weights.technical_stats *= 0.65
  // Official XI is not announced in the current source set.
  weights.lineup_injury *= 0.72

  const hoursToKickoff = context.match
    ? (new Date(context.match.date_utc).getTime() - (context.now ?? new Date()).getTime()) / 3_600_000
    : null
  if (hoursToKickoff !== null && hoursToKickoff >= 0 && hoursToKickoff <= 3 && weights.market_odds > 0) {
    weights.market_odds *= 1.45
  }
  if (context.stage === 'knockout') weights.poisson_xg *= 1.18
  if (Math.abs(context.home.ranking - context.away.ranking) >= 25) weights.poisson_xg *= 1.12
  if (context.home.recent_form.matches_used < 6 || context.away.recent_form.matches_used < 6) {
    weights.elo *= 0.86
    weights.technical_stats *= 0.72
  }

  const total = Object.values(weights).reduce((sum, value) => sum + value, 0)
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total]),
  ) as Record<ModelResult['id'], number>
}
