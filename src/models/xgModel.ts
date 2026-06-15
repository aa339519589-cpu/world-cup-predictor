import type { ModelResult, PredictionContext } from '../engineTypes'
import { clamp, normalizeThreeWay } from '../utils/probability'

function technicalScore(context: PredictionContext, side: 'home' | 'away') {
  const team = context[side]
  return (
    team.recent_form.weighted_gd_per_match * 16 +
    team.recent_form.clean_sheet_rate * 18 +
    team.squad.elite_share * 20 +
    team.squad.forward_avg_goals * 0.18
  )
}

export function runXgModel(context: PredictionContext): ModelResult {
  const difference = technicalScore(context, 'home') - technicalScore(context, 'away')
  const homeBase = 1 / (1 + Math.exp(-difference / 16))
  const draw = clamp(0.2, 0.3, 0.26 - Math.abs(difference) / 500)
  const probability = normalizeThreeWay({
    homeWin: homeBase * (1 - draw),
    draw,
    awayWin: (1 - homeBase) * (1 - draw),
  })
  return {
    id: 'technical_stats',
    label: '技术统计代理',
    ...probability,
    confidence: 0.5,
    available: true,
    detail: '当前没有授权的逐场 xG/射门源，仅使用进失球、零封率和名单质量代理，权重受限。',
  }
}
