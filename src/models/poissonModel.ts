import type { ModelResult, PredictionContext, ScoreCell } from '../engineTypes'
import { aggregateThreeWay, clamp, createScoreMatrix } from '../utils/probability'

export type PoissonResult = {
  model: ModelResult
  homeLambda: number
  awayLambda: number
  matrix: ScoreCell[]
}

function attackStrength(context: PredictionContext, side: 'home' | 'away') {
  const team = context[side]
  const historyRate = team.history.matches ? team.history.goals_for / team.history.matches : 1.2
  return team.recent_form.weighted_gf_per_match * 0.72 + historyRate * 0.28
}

function defenseWeakness(context: PredictionContext, side: 'home' | 'away') {
  const team = context[side]
  const historyRate = team.history.matches ? team.history.goals_against / team.history.matches : 1.2
  return team.recent_form.weighted_ga_per_match * 0.72 + historyRate * 0.28
}

function injuryAttackMultiplier(context: PredictionContext, side: 'home' | 'away') {
  const team = context[side]
  const forwardImpact = team.injuries
    .filter((injury) => /前锋|forward|striker|winger/i.test(injury.detail))
    .reduce((sum, injury) => sum + injury.impact_points, 0)
  return clamp(0.78, 1, 1 - forwardImpact / 70)
}

function injuryDefenseMultiplier(context: PredictionContext, side: 'home' | 'away') {
  const team = context[side]
  const defensiveImpact = team.injuries
    .filter((injury) => /门将|后卫|中卫|goalkeeper|defender/i.test(injury.detail))
    .reduce((sum, injury) => sum + injury.impact_points, 0)
  return clamp(1, 1.22, 1 + defensiveImpact / 80)
}

export function runPoissonModel(context: PredictionContext): PoissonResult {
  const neutralBaseline = 1.28
  const homeAttack = attackStrength(context, 'home')
  const awayAttack = attackStrength(context, 'away')
  const homeDefense = defenseWeakness(context, 'home')
  const awayDefense = defenseWeakness(context, 'away')
  let homeLambda = neutralBaseline * (homeAttack / 1.45) * (awayDefense / 1.2)
  let awayLambda = neutralBaseline * (awayAttack / 1.45) * (homeDefense / 1.2)

  homeLambda *= injuryAttackMultiplier(context, 'home') * injuryDefenseMultiplier(context, 'away')
  awayLambda *= injuryAttackMultiplier(context, 'away') * injuryDefenseMultiplier(context, 'home')

  if (context.stage === 'knockout') {
    homeLambda *= 0.92
    awayLambda *= 0.92
  }
  if (context.weather?.status === 'success') {
    const weatherPenalty =
      (context.weather.precipitationProbability ?? 0) >= 70 ||
      (context.weather.windKph ?? 0) >= 32
        ? 0.9
        : 1
    homeLambda *= weatherPenalty
    awayLambda *= weatherPenalty
  }
  homeLambda = clamp(0.25, 3.6, homeLambda)
  awayLambda = clamp(0.25, 3.6, awayLambda)
  const matrix = createScoreMatrix(homeLambda, awayLambda, 6)
  const probability = aggregateThreeWay(matrix)

  return {
    homeLambda,
    awayLambda,
    matrix,
    model: {
      id: 'poisson_xg',
      label: 'Poisson 进球分布',
      ...probability,
      confidence: context.home.recent_form.matches_used >= 8 && context.away.recent_form.matches_used >= 8 ? 0.72 : 0.58,
      available: true,
      detail: `基于可验证进失球率生成 λ ${homeLambda.toFixed(2)} / ${awayLambda.toFixed(2)}；没有真实 xG 时不冒充 xG。`,
    },
  }
}
