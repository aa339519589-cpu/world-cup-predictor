import type { PredictionContext } from '../engineTypes'

export function liveTournamentStats(context: PredictionContext, code: string) {
  const completed = context.live.matches.filter((match) =>
    match.state === 'post' && (match.home.code === code || match.away.code === code)
  )
  return completed.reduce((stats, match) => {
    const isHome = match.home.code === code
    const goalsFor = isHome ? match.home.score : match.away.score
    const goalsAgainst = isHome ? match.away.score : match.home.score
    stats.matches += 1
    stats.goalsFor += goalsFor
    stats.goalsAgainst += goalsAgainst
    stats.points += goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0
    return stats
  }, { matches: 0, points: 0, goalsFor: 0, goalsAgainst: 0 })
}
