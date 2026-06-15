import type { SourceState } from '../engineTypes'

export function ageMinutes(value: string, now = new Date()) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return Math.max(0, (now.getTime() - time) / 60_000)
}

export function freshnessState(value: string, freshForMinutes: number, now = new Date()): SourceState {
  const age = ageMinutes(value, now)
  if (age === null) return 'failed'
  return age <= freshForMinutes ? 'success' : 'stale'
}

export function freshnessLabel(state: SourceState) {
  return {
    success: '新鲜',
    stale: '过旧',
    failed: '失败',
    not_configured: '未配置',
    projected: '预测状态',
  }[state]
}
