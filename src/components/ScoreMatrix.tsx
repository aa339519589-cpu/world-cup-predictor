import type { Prediction } from '../engineTypes'

const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })

export function ScoreMatrix({ prediction }: { prediction: Prediction }) {
  const cells = prediction.scoreMatrix.filter((cell) => cell.homeGoals <= 5 && cell.awayGoals <= 5)
  const max = Math.max(...cells.map((cell) => cell.probability))
  return (
    <section className="analysis-card matrix-card">
      <div className="analysis-card__heading"><span>05</span><div><strong>比分概率矩阵</strong><small>横轴主队，纵轴客队；颜色越亮概率越高</small></div></div>
      <div className="score-matrix" role="table" aria-label="0 到 5 球比分概率矩阵">
        <i />
        {[0, 1, 2, 3, 4, 5].map((goal) => <b key={`h-${goal}`}>{goal}</b>)}
        {[0, 1, 2, 3, 4, 5].map((awayGoals) => (
          <div className="matrix-row" key={awayGoals}>
            <b>{awayGoals}</b>
            {[0, 1, 2, 3, 4, 5].map((homeGoals) => {
              const cell = cells.find((item) => item.homeGoals === homeGoals && item.awayGoals === awayGoals)
              const strength = (cell?.probability ?? 0) / max
              return (
                <span
                  key={`${homeGoals}-${awayGoals}`}
                  title={`${homeGoals}-${awayGoals}: ${percent.format(cell?.probability ?? 0)}`}
                  style={{ '--heat': strength } as React.CSSProperties}
                >
                  {percent.format(cell?.probability ?? 0)}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
