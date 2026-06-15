import type { Prediction } from '../engineTypes'

export function RiskFlags({ prediction }: { prediction: Prediction }) {
  return (
    <section className="analysis-card risks-card">
      <div className="analysis-card__heading"><span>06</span><div><strong>风险雷达</strong><small>告诉你这次预测可能错在哪里</small></div></div>
      <div className="risk-list">
        {prediction.riskFlags.map((flag) => (
          <article className={`risk-${flag.level}`} key={flag.id}>
            <span>{flag.level === 'high' ? '高' : flag.level === 'medium' ? '中' : '低'}</span>
            <div><strong>{flag.label}</strong><p>{flag.detail}</p></div>
          </article>
        ))}
      </div>
    </section>
  )
}
