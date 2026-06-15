import type { ThreeWayProbability } from '../engineTypes'
import { normalizeThreeWay } from './probability'

export function removeOverround(home: number, draw: number, away: number): ThreeWayProbability | null {
  if ([home, draw, away].some((value) => !Number.isFinite(value) || value <= 1)) return null
  return normalizeThreeWay({
    homeWin: 1 / home,
    draw: 1 / draw,
    awayWin: 1 / away,
  })
}
