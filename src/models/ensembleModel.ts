import type { ModelResult, ThreeWayProbability } from '../engineTypes'
import { weightedThreeWay } from '../utils/probability'

export function runEnsemble(
  models: ModelResult[],
  weights: Record<ModelResult['id'], number>,
): ThreeWayProbability {
  return weightedThreeWay(models
    .filter((model) => model.available && weights[model.id] > 0)
    .map((model) => ({
      probability: model,
      weight: weights[model.id],
    })))
}
