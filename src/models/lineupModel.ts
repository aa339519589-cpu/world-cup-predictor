import type { ModelResult, PredictionContext } from '../engineTypes'
import { clamp, normalizeThreeWay } from '../utils/probability'

function lineupScore(context: PredictionContext, side: 'home' | 'away') {
  const team = context[side]
  return team.squad.elite_share * 42 + team.squad.veteran_share * 20 - team.model.injury_penalty * 1.8
}

export function runLineupModel(context: PredictionContext): ModelResult {
  const difference = lineupScore(context, 'home') - lineupScore(context, 'away')
  const homeBase = 1 / (1 + Math.exp(-difference / 18))
  const draw = clamp(0.21, 0.3, 0.27 - Math.abs(difference) / 450)
  const probability = normalizeThreeWay({
    homeWin: homeBase * (1 - draw),
    draw,
    awayWin: (1 - homeBase) * (1 - draw),
  })
  return {
    id: 'lineup_injury',
    label: '阵容与伤停',
    ...probability,
    confidence: 0.46,
    available: true,
    detail: '官方首发尚未接入，使用报名名单、经验、联赛层级和已确认伤停；状态为 projected。',
  }
}
