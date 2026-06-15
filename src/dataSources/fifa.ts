import type { SourceStatus } from '../engineTypes'
import type { WorldCupData } from '../types'
import { ageMinutes, freshnessState } from '../utils/dataFreshness'

export function fifaSource(data: WorldCupData, weight: number, now = new Date()): SourceStatus {
  const status = freshnessState(data.generated_at_utc, 12 * 60, now)
  return {
    id: 'fifa',
    label: 'FIFA 官方赛程与名单',
    category: '官方基础数据',
    status,
    updatedAt: data.generated_at_utc,
    ageMinutes: ageMinutes(data.generated_at_utc, now),
    weight,
    participated: true,
    detail: status === 'success' ? '赛程、名单和赛事结构已参与计算。' : '基础快照已超过 12 小时，继续使用但降低信心。',
  }
}
