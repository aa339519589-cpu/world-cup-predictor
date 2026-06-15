import type { LiveMatch } from '../types'

const chinaTime = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Shanghai',
})

function statusText(match: LiveMatch) {
  if (match.state === 'in') return match.clock ? `进行中 ${match.clock}` : '正在直播'
  if (match.state === 'post') return '已结束'
  return chinaTime.format(new Date(match.date_utc)).replace(',', '')
}

export function MatchCard(props: {
  match: LiveMatch
  featured?: boolean
  onPredict: (home: string, away: string) => void
}) {
  const score = props.match.state === 'pre' ? 'VS' : `${props.match.home.score} : ${props.match.away.score}`
  return (
    <article className={`match-card ${props.featured ? 'match-card--featured' : ''} ${props.match.state === 'in' ? 'is-live' : ''}`}>
      <div className="match-card__meta">
        <span className={props.match.state === 'in' ? 'live-label' : ''}>{statusText(props.match)}</span>
        <span>{props.match.city || '世界杯赛场'}</span>
      </div>
      <div className="match-card__teams">
        <div><img src={props.match.home.logo} alt="" /><strong>{props.match.home.name_zh}</strong></div>
        <b>{score}</b>
        <div><img src={props.match.away.logo} alt="" /><strong>{props.match.away.name_zh}</strong></div>
      </div>
      <div className="match-card__footer">
        <span>{props.match.venue || '场地待确认'}</span>
        <button type="button" onClick={() => props.onPredict(props.match.home.code, props.match.away.code)}>分析这场</button>
      </div>
    </article>
  )
}
