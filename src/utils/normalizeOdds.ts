import type { OddsBookmaker, ThreeWayProbability } from '../engineTypes'
import { normalizeThreeWay } from './probability'
import { removeOverround } from './removeOverround'

const TRUST_WEIGHTS: Record<string, number> = {
  betfair: 1.25,
  pinnacle: 1.2,
  bet365: 1.1,
  draftkings: 1,
  fanduel: 1,
  williamhill: 0.95,
  unibet: 0.95,
  '1xbet': 0.8,
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function aggregateBookmakers(bookmakers: OddsBookmaker[]): {
  probability: ThreeWayProbability
  used: OddsBookmaker[]
  anomaly: boolean
} | null {
  const fair = bookmakers.flatMap((bookmaker) => {
    const probability = removeOverround(bookmaker.home, bookmaker.draw, bookmaker.away)
    return probability ? [{ bookmaker, probability }] : []
  })
  if (!fair.length) return null

  const medians = {
    homeWin: median(fair.map((entry) => entry.probability.homeWin)),
    draw: median(fair.map((entry) => entry.probability.draw)),
    awayWin: median(fair.map((entry) => entry.probability.awayWin)),
  }
  const filtered = fair.filter(({ probability }) =>
    Math.abs(probability.homeWin - medians.homeWin) < 0.12 &&
    Math.abs(probability.draw - medians.draw) < 0.12 &&
    Math.abs(probability.awayWin - medians.awayWin) < 0.12
  )
  const pool = filtered.length >= 2 ? filtered : fair
  const weighted = pool.reduce((result, entry) => {
    const weight = entry.bookmaker.weight ?? TRUST_WEIGHTS[entry.bookmaker.key.toLowerCase()] ?? 0.75
    result.total += weight
    result.homeWin += entry.probability.homeWin * weight
    result.draw += entry.probability.draw * weight
    result.awayWin += entry.probability.awayWin * weight
    return result
  }, { homeWin: 0, draw: 0, awayWin: 0, total: 0 })

  return {
    probability: normalizeThreeWay({
      homeWin: weighted.homeWin / weighted.total,
      draw: weighted.draw / weighted.total,
      awayWin: weighted.awayWin / weighted.total,
    }),
    used: pool.map((entry) => entry.bookmaker),
    anomaly: filtered.length !== fair.length,
  }
}
