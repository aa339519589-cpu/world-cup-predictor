import type { OddsData, OddsMatch, SourceStatus } from '../engineTypes'
import { ageMinutes, freshnessState } from '../utils/dataFreshness'

const ODDS_SNAPSHOT = './odds-data.json'

export async function loadOddsData(): Promise<OddsData> {
  try {
    const response = await fetch(ODDS_SNAPSHOT, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<OddsData>
  } catch {
    return {
      generated_at_utc: new Date(0).toISOString(),
      status: 'failed',
      message: '赔率快照读取失败',
      matches: [],
    }
  }
}

export function findOddsMatch(data: OddsData | undefined, homeCode: string, awayCode: string): OddsMatch | undefined {
  return data?.matches.find((match) =>
    (match.homeCode === homeCode && match.awayCode === awayCode) ||
    (match.homeCode === awayCode && match.awayCode === homeCode)
  )
}

export function oddsSource(data: OddsData | undefined, weight: number, now = new Date()): SourceStatus {
  if (!data || data.status !== 'success') {
    return {
      id: 'odds-api',
      label: 'The Odds API / 多公司赔率',
      category: '市场赔率',
      status: data?.status === 'failed' ? 'failed' : 'not_configured',
      updatedAt: data?.generated_at_utc ?? '',
      ageMinutes: data ? ageMinutes(data.generated_at_utc, now) : null,
      weight: 0,
      participated: false,
      detail: data?.message || '未配置 THE_ODDS_API_KEY，市场模型权重自动归零。',
    }
  }
  const status = freshnessState(data.generated_at_utc, 15, now)
  return {
    id: 'odds-api',
    label: 'The Odds API / 多公司赔率',
    category: '市场赔率',
    status,
    updatedAt: data.generated_at_utc,
    ageMinutes: ageMinutes(data.generated_at_utc, now),
    weight,
    participated: weight > 0,
    detail: status === 'success' ? '已逐公司去水并剔除异常值。' : '赔率超过 15 分钟，市场权重已降低。',
  }
}
