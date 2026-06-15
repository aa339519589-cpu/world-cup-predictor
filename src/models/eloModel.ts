import type { ModelResult, PredictionContext } from '../engineTypes'
import { liveTournamentStats } from '../utils/liveTournament'
import { clamp, normalizeThreeWay } from '../utils/probability'

function teamRating(context: PredictionContext, side: 'home' | 'away') {
  const team = context[side]
  const rankingRating = 2050 - Math.log2(Math.max(1, team.ranking)) * 115
  const form = (team.recent_form.weighted_ppg - 1.5) * 95
  const liveStats = liveTournamentStats(context, team.code)
  const tournament = liveStats.matches
    ? (liveStats.points / liveStats.matches - 1.5) * Math.min(55, liveStats.matches * 18)
    : 0
  const venue = context.match ? 0 : side === 'home' ? 12 : 0
  return rankingRating + form + tournament + team.model.host_bonus + venue
}

export function runEloModel(context: PredictionContext): ModelResult {
  const difference = teamRating(context, 'home') - teamRating(context, 'away')
  const decisive = 1 / (1 + 10 ** (-difference / 400))
  const draw = clamp(0.18, 0.3, 0.265 - Math.abs(difference) / 2200 + (context.stage === 'knockout' ? 0.025 : 0))
  const result = normalizeThreeWay({
    homeWin: decisive * (1 - draw),
    draw,
    awayWin: (1 - decisive) * (1 - draw),
  })
  return {
    id: 'elo',
    label: 'Elo / 排名强度',
    ...result,
    confidence: clamp(0.55, 0.82, 0.58 + Math.min(0.2, Math.abs(difference) / 900)),
    available: true,
    detail: `排名、近期状态与赛事表现形成 ${Math.round(difference)} 点相对强度差。`,
  }
}
