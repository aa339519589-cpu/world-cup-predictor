import type { Prediction } from '../engineTypes'

const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const plainPercent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })

export function OddsComparison({ prediction }: { prediction: Prediction }) {
  return (
    <section className="analysis-card odds-card">
      <div className="analysis-card__heading"><span>07</span><div><strong>模型 vs 市场</strong><small>赔率先去水，再与融合概率比较</small></div></div>
      {prediction.marketComparison.length ? (
        <div className="odds-comparison">
          <div className="odds-comparison__head"><span>结果</span><span>模型</span><span>市场</span><span>差值</span></div>
          {prediction.marketComparison.map((row) => (
            <div key={row.label}>
              <strong>{row.label}</strong><span>{plainPercent.format(row.model)}</span><span>{plainPercent.format(row.market)}</span>
              <b className={row.value ? 'is-value' : ''}>{percent.format(row.edge)} {row.value ? 'VALUE' : ''}</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="source-empty">
          <strong>市场赔率未接入</strong>
          <p>没有可靠赔率时，市场模型权重为 0，不展示虚构的“市场概率”。</p>
        </div>
      )}
    </section>
  )
}
