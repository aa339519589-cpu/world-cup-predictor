import type { Prediction } from '../engineTypes'

const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })

function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="probability-row">
      <div><span>{label}</span><strong>{percent.format(value)}</strong></div>
      <div className="probability-track"><i className={tone} style={{ width: `${value * 100}%` }} /></div>
    </div>
  )
}

export function ProbabilityBars({ prediction }: { prediction: Prediction }) {
  return (
    <section className="analysis-card probability-card">
      <div className="analysis-card__heading"><span>01</span><div><strong>胜平负概率</strong><small>90 分钟，不含加时与点球</small></div></div>
      <Bar label={`${prediction.home.name_zh} 胜`} value={prediction.homeWin} tone="tone-home" />
      <Bar label="平局" value={prediction.draw} tone="tone-draw" />
      <Bar label={`${prediction.away.name_zh} 胜`} value={prediction.awayWin} tone="tone-away" />
    </section>
  )
}
