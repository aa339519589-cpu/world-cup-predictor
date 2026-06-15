import type { Prediction } from '../engineTypes'
import { freshnessLabel } from '../utils/dataFreshness'

const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })

export function DataSourcePanel({ prediction }: { prediction: Prediction }) {
  return (
    <section className="analysis-card sources-card">
      <div className="analysis-card__heading"><span>08</span><div><strong>数据源状态</strong><small>失败与过期来源不会被隐藏</small></div></div>
      <div className="source-list">
        {prediction.sourceStatuses.map((source) => (
          <article key={source.id}>
            <i className={`source-dot source-dot--${source.status}`} />
            <div><strong>{source.label}</strong><span>{source.category} · {source.detail}</span></div>
            <b>{freshnessLabel(source.status)}</b>
            <em>{source.participated ? percent.format(source.weight) : '未参与'}</em>
          </article>
        ))}
      </div>
    </section>
  )
}
