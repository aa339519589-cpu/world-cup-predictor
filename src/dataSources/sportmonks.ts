import type { SourceStatus } from '../engineTypes'

export function sportmonksSource(): SourceStatus {
  return {
    id: 'sportmonks',
    label: 'Sportmonks',
    category: '阵容与技术统计',
    status: 'not_configured',
    updatedAt: '',
    ageMinutes: null,
    weight: 0,
    participated: false,
    detail: '未配置授权令牌；不会用虚构数据补齐。',
  }
}
