import type { SourceStatus } from '../engineTypes'

export function apiFootballSource(): SourceStatus {
  return {
    id: 'api-football',
    label: 'API-Football',
    category: '技术统计',
    status: 'not_configured',
    updatedAt: '',
    ageMinutes: null,
    weight: 0,
    participated: false,
    detail: '未检测到 API 密钥，不生成或伪造射门、xG 与首发数据。',
  }
}
