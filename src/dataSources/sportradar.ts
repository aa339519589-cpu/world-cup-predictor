import type { SourceStatus } from '../engineTypes'

export function sportradarSource(): SourceStatus {
  return {
    id: 'sportradar',
    label: 'Sportradar',
    category: '比赛事件',
    status: 'not_configured',
    updatedAt: '',
    ageMinutes: null,
    weight: 0,
    participated: false,
    detail: '商业数据源未配置，当前不参与融合。',
  }
}
