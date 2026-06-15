import type { ScoreCell, ThreeWayProbability } from '../engineTypes'

export function clamp(min: number, max: number, value: number) {
  return Math.max(min, Math.min(max, value))
}

export function normalizeThreeWay(values: ThreeWayProbability): ThreeWayProbability {
  const total = values.homeWin + values.draw + values.awayWin
  if (!Number.isFinite(total) || total <= 0) return { homeWin: 1 / 3, draw: 1 / 3, awayWin: 1 / 3 }
  return {
    homeWin: values.homeWin / total,
    draw: values.draw / total,
    awayWin: values.awayWin / total,
  }
}

export function poissonProbability(mean: number, goals: number) {
  let factorial = 1
  for (let index = 2; index <= goals; index += 1) factorial *= index
  return (Math.exp(-mean) * mean ** goals) / factorial
}

function marginalWithTail(mean: number, goals: number, maxGoals: number) {
  if (goals < maxGoals) return poissonProbability(mean, goals)
  let knownMass = 0
  for (let index = 0; index < maxGoals; index += 1) knownMass += poissonProbability(mean, index)
  return Math.max(0, 1 - knownMass)
}

export function createScoreMatrix(homeLambda: number, awayLambda: number, maxGoals = 6): ScoreCell[] {
  const cells: ScoreCell[] = []
  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      cells.push({
        homeGoals,
        awayGoals,
        probability:
          marginalWithTail(homeLambda, homeGoals, maxGoals) *
          marginalWithTail(awayLambda, awayGoals, maxGoals),
      })
    }
  }
  const mass = cells.reduce((sum, cell) => sum + cell.probability, 0)
  return cells.map((cell) => ({ ...cell, probability: cell.probability / mass }))
}

export function aggregateThreeWay(matrix: ScoreCell[]): ThreeWayProbability {
  return normalizeThreeWay(matrix.reduce((result, cell) => {
    if (cell.homeGoals > cell.awayGoals) result.homeWin += cell.probability
    else if (cell.homeGoals === cell.awayGoals) result.draw += cell.probability
    else result.awayWin += cell.probability
    return result
  }, { homeWin: 0, draw: 0, awayWin: 0 }))
}

export function calibrateMatrix(matrix: ScoreCell[], target: ThreeWayProbability) {
  const current = aggregateThreeWay(matrix)
  const factors = {
    home: target.homeWin / Math.max(current.homeWin, 0.0001),
    draw: target.draw / Math.max(current.draw, 0.0001),
    away: target.awayWin / Math.max(current.awayWin, 0.0001),
  }
  const calibrated = matrix.map((cell) => ({
    ...cell,
    probability: cell.probability * (
      cell.homeGoals > cell.awayGoals ? factors.home :
      cell.homeGoals === cell.awayGoals ? factors.draw :
      factors.away
    ),
  }))
  const total = calibrated.reduce((sum, cell) => sum + cell.probability, 0)
  return calibrated.map((cell) => ({ ...cell, probability: cell.probability / total }))
}

export function weightedThreeWay(
  models: { probability: ThreeWayProbability; weight: number }[],
): ThreeWayProbability {
  return normalizeThreeWay(models.reduce((result, model) => ({
    homeWin: result.homeWin + model.probability.homeWin * model.weight,
    draw: result.draw + model.probability.draw * model.weight,
    awayWin: result.awayWin + model.probability.awayWin * model.weight,
  }), { homeWin: 0, draw: 0, awayWin: 0 }))
}
