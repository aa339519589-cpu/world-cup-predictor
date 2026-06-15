import type { SourceStatus } from '../engineTypes'
import type { LiveData } from '../types'
import { ageMinutes, freshnessState } from '../utils/dataFreshness'

export function newsSource(live: LiveData, now = new Date()): SourceStatus {
  const newest = live.articles[0]?.published || live.generated_at_utc
  const status = freshnessState(newest, 180, now)
  return {
    id: 'espn-news',
    label: 'ESPN 实时新闻',
    category: '新闻与临场信号',
    status,
    updatedAt: newest,
    ageMinutes: ageMinutes(newest, now),
    weight: 0,
    participated: false,
    detail: '新闻只作为风险提示展示，未经过结构化确认前不直接改变赛果。',
  }
}
