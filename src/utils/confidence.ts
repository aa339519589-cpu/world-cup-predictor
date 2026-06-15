import type { ModelResult, SourceStatus, ThreeWayProbability } from '../engineTypes'
import { clamp } from './probability'

export function calculateConfidence(
  probability: ThreeWayProbability,
  models: ModelResult[],
  sources: SourceStatus[],
) {
  const sorted = [probability.homeWin, probability.draw, probability.awayWin].sort((a, b) => b - a)
  const separation = sorted[0] - sorted[1]
  const activeModels = models.filter((model) => model.available)
  const modelQuality = activeModels.length
    ? activeModels.reduce((sum, model) => sum + model.confidence, 0) / activeModels.length
    : 0.35
  const sourceQuality = sources.reduce((sum, source) => {
    if (!source.participated) return sum
    const quality = source.status === 'success' ? 1 : source.status === 'projected' ? 0.55 : 0.3
    return sum + source.weight * quality
  }, 0)
  return clamp(0.32, 0.86, 0.36 + separation * 0.55 + modelQuality * 0.22 + sourceQuality * 0.18)
}
