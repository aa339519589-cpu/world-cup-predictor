import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import './PredictionApp.css'
import { findMatch } from './api/matches'
import { refreshInterval } from './api/refresh'
import { DataSourcePanel } from './components/DataSourcePanel'
import { MatchCard } from './components/MatchCard'
import { OddsComparison } from './components/OddsComparison'
import { ProbabilityBars } from './components/ProbabilityBars'
import { RiskFlags } from './components/RiskFlags'
import { ScoreMatrix } from './components/ScoreMatrix'
import { loadOddsData } from './dataSources/oddsApi'
import { loadWeather } from './dataSources/weather'
import { loadLiveData } from './live'
import { buildPrediction, predictionToJson, type Prediction, type Stage } from './prediction'
import type { OddsData, WeatherData } from './engineTypes'
import type { LiveArticle, LiveData, LiveMatch, TeamData, WorldCupData } from './types'

type Route = 'home' | 'predict' | 'matches' | 'teams' | `team/${string}`

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 0 })
const chinaTime = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Shanghai',
})
const shortTime = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Shanghai',
})

function getRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  if (raw === 'rankings') return 'teams'
  if (raw === 'predict' || raw === 'matches' || raw === 'teams' || raw.startsWith('team/')) return raw as Route
  return 'home'
}

function navigate(route: Route) {
  window.location.hash = route
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function eventPriority(match: LiveMatch, teams: TeamData[]) {
  const home = teams.find((team) => team.code === match.home.code)?.model.logic_score ?? 35
  const away = teams.find((team) => team.code === match.away.code)?.model.logic_score ?? 35
  const balance = 18 - Math.min(18, Math.abs(home - away))
  return home + away + balance + (match.state === 'in' ? 50 : 0)
}

function nextMatches(matches: LiveMatch[], teams: TeamData[]) {
  const now = Date.now()
  const horizon = now + 18 * 60 * 60 * 1000
  const tonight = matches.filter((match) => {
    const time = new Date(match.date_utc).getTime()
    return match.state === 'in' || (match.state === 'pre' && time >= now - 30 * 60 * 1000 && time <= horizon)
  })
  const pool = tonight.length ? tonight : matches.filter((match) => match.state !== 'post' && new Date(match.date_utc).getTime() >= now)
  return [...pool].sort((left, right) => eventPriority(right, teams) - eventPriority(left, teams)).slice(0, 3)
}

function TeamSelect(props: {
  label: string
  value: string
  teams: TeamData[]
  onChange: (code: string) => void
}) {
  const selected = props.teams.find((team) => team.code === props.value)
  return (
    <label className="team-select">
      <span>{props.label}</span>
      <div>
        {selected ? <img src={selected.flag_url} alt="" /> : null}
        <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
          {props.teams.map((team) => (
            <option key={team.code} value={team.code}>{team.name_zh}</option>
          ))}
        </select>
      </div>
    </label>
  )
}

function FootballScene() {
  return (
    <div className="football-scene" aria-hidden="true">
      <div className="stadium-light stadium-light--left" />
      <div className="stadium-light stadium-light--right" />
      <div className="pitch-orbit pitch-orbit--one" />
      <div className="pitch-orbit pitch-orbit--two" />
      <div className="football">
        <span>◆</span>
      </div>
      <div className="speed-line speed-line--one" />
      <div className="speed-line speed-line--two" />
    </div>
  )
}

function NewsCard({ article, large = false }: { article: LiveArticle; large?: boolean }) {
  return (
    <a className={`news-card ${large ? 'news-card--large' : ''}`} href={article.url} target="_blank" rel="noreferrer">
      {article.image ? <img src={article.image} alt="" loading="lazy" /> : null}
      <div>
        <span>{article.source} · {chinaTime.format(new Date(article.published)).replace(',', '')}</span>
        <h3>{article.headline_zh || article.headline}</h3>
        {article.headline_zh ? <p>{article.headline}</p> : <p>原始英文标题 · 点击查看来源</p>}
      </div>
    </a>
  )
}

function LiveTicker({ matches }: { matches: LiveMatch[] }) {
  const items = matches.filter((match) => match.state !== 'pre').slice(0, 8)
  if (!items.length) return null
  return (
    <div className="ticker" aria-label="实时比分">
      <strong><i /> 实时</strong>
      <div className="ticker__window">
        <div className="ticker__track">
          {[...items, ...items].map((match, index) => (
            <span key={`${match.id}-${index}`}>
              {match.home.name_zh} {match.home.score}-{match.away.score} {match.away.name_zh}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function HomePage(props: {
  data: WorldCupData
  live: LiveData
  homeCode: string
  awayCode: string
  setHomeCode: (code: string) => void
  setAwayCode: (code: string) => void
  onPredict: (home?: string, away?: string) => void
}) {
  const recommendations = nextMatches(props.live.matches, props.data.teams)
  return (
    <div className="page page--home">
      <section className="home-hero">
        <FootballScene />
        <div className="home-hero__copy">
          <span className="overline"><i /> WORLD CUP LIVE LOGIC</span>
          <h1>今晚看什么，<br />这场谁更可能赢。</h1>
          <p>实时赛程、最新比分和球队状态持续进入模型。选择两支队伍，马上得到胜平负和精确比分概率。</p>
          <div className="hero-composer">
            <TeamSelect label="主队" value={props.homeCode} teams={props.data.teams} onChange={props.setHomeCode} />
            <button className="swap-button" type="button" aria-label="交换球队" onClick={() => {
              props.setHomeCode(props.awayCode)
              props.setAwayCode(props.homeCode)
            }}>⇄</button>
            <TeamSelect label="客队" value={props.awayCode} teams={props.data.teams} onChange={props.setAwayCode} />
            <button className="primary-button" type="button" onClick={() => props.onPredict()}>立即预测 <span>→</span></button>
          </div>
        </div>
        <div className="hero-scoreboard">
          <span>数据状态</span>
          <strong>{props.live.source === 'live' ? 'LIVE' : '快照'}</strong>
          <p>{props.live.matches.filter((match) => match.state === 'post').length} 场已完成</p>
          <small>最近同步 {shortTime.format(new Date(props.live.generated_at_utc))}</small>
        </div>
      </section>

      <section className="home-section">
        <div className="section-title">
          <div><span className="overline">TONIGHT</span><h2>今晚与明晨，优先看这几场</h2></div>
          <button type="button" onClick={() => navigate('matches')}>完整赛程 →</button>
        </div>
        <div className="recommendation-grid">
          {recommendations.map((match, index) => (
            <MatchCard key={match.id} match={match} featured={index === 0} onPredict={props.onPredict} />
          ))}
        </div>
      </section>

      <section className="home-section home-section--news">
        <div className="section-title">
          <div><span className="overline">LATEST SIGNALS</span><h2>世界杯正在发生</h2></div>
          <span className="refresh-note">60 秒自动刷新</span>
        </div>
        <div className="news-grid">
          {props.live.articles.slice(0, 4).map((article, index) => <NewsCard key={article.id} article={article} large={index === 0} />)}
        </div>
      </section>
    </div>
  )
}

function PredictionResult({ prediction }: { prediction: Prediction }) {
  const [jsonOpen, setJsonOpen] = useState(false)
  const json = JSON.stringify(predictionToJson(prediction), null, 2)
  const matchMeta = prediction.match
  return (
    <div className="prediction-result intelligence-board">
      <section className="prediction-result__headline intel-hero">
        <div>
          <span className="overline">LIVE PROBABILITY INTELLIGENCE</span>
          <h2>{prediction.headline}</h2>
          <p>{prediction.detail}</p>
          <div className="intel-meta">
            <span>{matchMeta ? chinaTime.format(new Date(matchMeta.date_utc)).replace(',', '') : '自定义对阵'}</span>
            <span>{prediction.stage === 'knockout' ? '淘汰赛模型' : '小组赛模型'}</span>
            <span>{matchMeta?.venue || '中立场 / 场地未绑定'}</span>
            <span>更新 {shortTime.format(new Date(prediction.updatedAt))}</span>
          </div>
        </div>
        <div className="confidence-ring" style={{ '--confidence': `${prediction.confidence * 360}deg` } as React.CSSProperties}>
          <strong>{percent.format(prediction.confidence)}</strong><span>模型信心</span>
        </div>
      </section>

      <div className="versus-board">
        <div><img src={prediction.home.flag_url} alt="" /><strong>{prediction.home.name_zh}</strong></div>
        <div><span>进球期望代理 λ</span><b>{number.format(prediction.homeExpectedGoals)} <em>:</em> {number.format(prediction.awayExpectedGoals)}</b><small>非授权 xG 数据</small></div>
        <div><img src={prediction.away.flag_url} alt="" /><strong>{prediction.away.name_zh}</strong></div>
      </div>

      <div className="analysis-grid analysis-grid--markets">
        <ProbabilityBars prediction={prediction} />
        <section className="analysis-card mini-markets">
          <div className="analysis-card__heading"><span>02</span><div><strong>让球胜平负</strong><small>{prediction.home.name_zh} -1</small></div></div>
          <div className="market-triple">
            <article><span>主队赢盘</span><strong>{percent.format(prediction.handicap.homeCover)}</strong></article>
            <article><span>走盘</span><strong>{percent.format(prediction.handicap.push)}</strong></article>
            <article><span>客队赢盘</span><strong>{percent.format(prediction.handicap.awayCover)}</strong></article>
          </div>
        </section>
        <section className="analysis-card mini-markets">
          <div className="analysis-card__heading"><span>03</span><div><strong>进球市场</strong><small>由完整比分矩阵汇总</small></div></div>
          <div className="market-dual">
            <article><span>大 2.5</span><strong>{percent.format(prediction.goalMarkets.over25)}</strong></article>
            <article><span>小 2.5</span><strong>{percent.format(prediction.goalMarkets.under25)}</strong></article>
            <article><span>双方进球 是</span><strong>{percent.format(prediction.goalMarkets.bttsYes)}</strong></article>
            <article><span>双方进球 否</span><strong>{percent.format(prediction.goalMarkets.bttsNo)}</strong></article>
          </div>
        </section>
        <section className="analysis-card risk-summary">
          <div className="analysis-card__heading"><span>04</span><div><strong>不确定性</strong><small>不要把最高概率理解成必然</small></div></div>
          <div><span>爆冷概率</span><strong>{percent.format(prediction.upsetProbability)}</strong></div>
          <div><span>平局风险</span><strong>{prediction.drawRisk === 'high' ? '高' : prediction.drawRisk === 'medium' ? '中' : '低'}</strong></div>
          <div><span>Top 比分概率</span><strong>{percent.format(prediction.scorelines[0].probability)}</strong></div>
        </section>
      </div>

      <div className="analysis-grid analysis-grid--deep">
        <ScoreMatrix prediction={prediction} />
        <section className="analysis-card top-scores-card">
          <div className="analysis-card__heading"><span>TOP 10</span><div><strong>最可能比分</strong><small>单个比分通常只有一成左右</small></div></div>
          <div className="top-score-list">
            {prediction.scorelines.map((row, index) => (
              <article key={`${row.homeGoals}-${row.awayGoals}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{row.homeGoals}-{row.awayGoals}</strong>
                <div><i style={{ width: `${row.probability / prediction.scorelines[0].probability * 100}%` }} /></div>
                <b>{percent.format(row.probability)}</b>
                <small>{row.homeGoals === row.awayGoals ? '平局路径' : row.homeGoals > row.awayGoals ? `${prediction.home.name_zh}取胜路径` : `${prediction.away.name_zh}取胜路径`}</small>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="analysis-grid analysis-grid--deep">
        <OddsComparison prediction={prediction} />
        <RiskFlags prediction={prediction} />
      </div>

      <section className="analysis-card model-card">
        <div className="analysis-card__heading"><span>09</span><div><strong>五模型融合</strong><small>权重随数据质量和赛前时间动态变化</small></div></div>
        <div className="model-grid">
          {prediction.models.map((model) => (
            <article className={!model.available ? 'is-disabled' : ''} key={model.id}>
              <div><strong>{model.label}</strong><span>{model.available ? percent.format(prediction.modelWeights[model.id]) : '未参与'}</span></div>
              <p>{model.detail}</p>
              {model.available ? <small>主 {percent.format(model.homeWin)} · 平 {percent.format(model.draw)} · 客 {percent.format(model.awayWin)}</small> : null}
            </article>
          ))}
        </div>
      </section>

      <DataSourcePanel prediction={prediction} />

      <section className="reason-section">
        <div className="section-title"><div><span className="overline">EVIDENCE</span><h2>关键证据差</h2></div></div>
        <div className="reason-grid">
          {prediction.factors.slice(0, 6).map((factor) => {
            const homeEdge = factor.delta >= 0
            const formatValue = (value: number) => factor.format === 'percent'
              ? percent.format(value)
              : number.format(value)
            return (
              <article key={factor.label}>
                <span>{homeEdge ? prediction.home.name_zh : prediction.away.name_zh} 占优</span>
                <h3>{factor.label}</h3>
                <p>{factor.note}</p>
                <div><strong>{formatValue(factor.homeValue)}</strong><i /><strong>{formatValue(factor.awayValue)}</strong></div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="analysis-card verdict-card">
        <div><span className="overline">FINAL DISTRIBUTION</span><h3>{prediction.finalVerdict.mostLikelyResult}</h3><p>最可能比分 {prediction.finalVerdict.mostLikelyScore}</p></div>
        <strong>{prediction.finalVerdict.safeRange}</strong>
        <button type="button" onClick={() => setJsonOpen((open) => !open)}>{jsonOpen ? '收起 JSON' : '查看 JSON API 输出'}</button>
      </section>
      {jsonOpen ? <pre className="prediction-json">{json}</pre> : null}
    </div>
  )
}

function PredictPage(props: {
  data: WorldCupData
  homeCode: string
  awayCode: string
  stage: Stage
  prediction: Prediction | null
  setHomeCode: (code: string) => void
  setAwayCode: (code: string) => void
  setStage: (stage: Stage) => void
  onSubmit: () => void
}) {
  return (
    <div className="page">
      <header className="page-heading"><span className="overline">MATCH LAB</span><h1>对阵预测</h1><p>每次点击都会按当前球队状态重新计算。</p></header>
      <section className="prediction-composer">
        <TeamSelect label="主队" value={props.homeCode} teams={props.data.teams} onChange={props.setHomeCode} />
        <button className="swap-button" type="button" onClick={() => {
          props.setHomeCode(props.awayCode)
          props.setAwayCode(props.homeCode)
        }}>⇄</button>
        <TeamSelect label="客队" value={props.awayCode} teams={props.data.teams} onChange={props.setAwayCode} />
        <label className="stage-select"><span>比赛阶段</span><select value={props.stage} onChange={(event) => props.setStage(event.target.value as Stage)}><option value="group">小组赛</option><option value="knockout">淘汰赛</option></select></label>
        <button className="primary-button" type="button" onClick={props.onSubmit}>开始计算 <span>→</span></button>
      </section>
      {props.prediction ? <PredictionResult prediction={props.prediction} /> : null}
    </div>
  )
}

function MatchesPage(props: { live: LiveData; onPredict: (home: string, away: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'live' | 'upcoming' | 'finished'>('all')
  const filtered = props.live.matches.filter((match) => {
    if (filter === 'live') return match.state === 'in'
    if (filter === 'upcoming') return match.state === 'pre'
    if (filter === 'finished') return match.state === 'post'
    return true
  })
  return (
    <div className="page">
      <header className="page-heading"><span className="overline">LIVE FIXTURES</span><h1>实时赛程</h1><p>北京时间显示，比分每 60 秒同步。</p></header>
      <div className="filter-tabs">
        {([['all', '全部'], ['live', '进行中'], ['upcoming', '未开球'], ['finished', '已结束']] as const).map(([value, label]) => (
          <button key={value} className={filter === value ? 'is-active' : ''} type="button" onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      <div className="fixtures-list">
        {filtered.map((match) => <MatchCard key={match.id} match={match} onPredict={props.onPredict} />)}
      </div>
    </div>
  )
}

function TeamDetail({ team }: { team: TeamData }) {
  return (
    <div className="page">
      <button className="back-button" type="button" onClick={() => navigate('teams')}>← 返回球队库</button>
      <section className="team-hero">
        <img src={team.flag_url} alt="" />
        <div><span className="overline">{team.group_name_zh}</span><h1>{team.name_zh}</h1><p>{team.model.tier} · 主教练 {team.coach_name}</p></div>
        <div className="team-logic"><strong>{number.format(team.model.logic_score)}</strong><span>逻辑分</span></div>
      </section>
      <div className="team-metrics">
        <article><span>世界杯历史 PPG</span><strong>{number.format(team.history.ppg)}</strong><p>{team.history.appearances} 次参赛</p></article>
        <article><span>近期 PPG</span><strong>{number.format(team.recent_form.weighted_ppg)}</strong><p>{team.recent_form.matches_used} 场样本</p></article>
        <article><span>本届积分</span><strong>{team.current_tournament.points}</strong><p>{team.current_tournament.matches_played} 场比赛</p></article>
        <article><span>伤停扣分</span><strong>{number.format(team.model.injury_penalty)}</strong><p>{team.injuries.length} 条重点动态</p></article>
      </div>
      <div className="team-detail-grid">
        <section className="detail-panel"><h2>关键球员</h2><div className="player-list">{team.squad.key_players.map((player) => <article key={player.number}><b>{player.number}</b><div><strong>{player.shirt_name}</strong><span>{player.position_zh} · {player.club}</span></div><em>{player.caps} 场 / {player.goals} 球</em></article>)}</div></section>
        <section className="detail-panel"><h2>伤停与负荷</h2>{team.injuries.length ? <div className="injury-list">{team.injuries.map((injury) => <article key={injury.player}><span>{injury.status}</span><strong>{injury.player}</strong><p>{injury.detail}</p></article>)}</div> : <p className="empty-copy">暂无公开确认的重点伤停。</p>}</section>
        <section className="detail-panel detail-panel--wide"><details><summary><div><h2>完整 26 人名单</h2><p>展开查看号码、俱乐部、年龄、场次与进球。</p></div><span>展开 +</span></summary><div className="roster-grid">{team.squad.players.map((player) => <article key={player.number}><b>{player.number}</b><div><strong>{player.shirt_name}</strong><span>{player.position_zh} · {player.club}</span></div><em>{player.age} 岁</em></article>)}</div></details></section>
      </div>
    </div>
  )
}

function TeamsPage({ data }: { data: WorldCupData }) {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query.trim().toLowerCase())
  const teams = data.teams.filter((team) => !deferred || `${team.name_zh} ${team.name_en} ${team.code}`.toLowerCase().includes(deferred))
  return (
    <div className="page">
      <header className="page-heading page-heading--with-search"><div><span className="overline">48 TEAMS</span><h1>球队资料库</h1><p>深度资料放在独立页面，首页不再承载全部数据。</p></div><input type="search" value={query} onChange={(event) => startTransition(() => setQuery(event.target.value))} placeholder="搜索球队" /></header>
      <div className="team-library">{teams.map((team) => <button key={team.code} type="button" onClick={() => navigate(`team/${team.code}`)}><img src={team.flag_url} alt="" /><div><span>#{team.ranking} · {team.group_name_zh}</span><strong>{team.name_zh}</strong><p>{team.model.tier}</p></div><b>{number.format(team.model.logic_score)}</b></button>)}</div>
    </div>
  )
}

function AppShell(props: { route: Route; live: LiveData; children: React.ReactNode }) {
  const current = props.route.startsWith('team/') ? 'teams' : props.route
  const nav = [['home', '首页'], ['predict', '预测'], ['matches', '赛程'], ['teams', '球队']] as const
  return (
    <main className="world-cup-app">
      <header className="site-header">
        <button className="brand" type="button" onClick={() => navigate('home')}><span className="brand-ball">◆</span><div><strong>球局</strong><small>WORLD CUP LOGIC</small></div></button>
        <nav>{nav.map(([route, label]) => <button className={current === route ? 'is-active' : ''} type="button" key={route} onClick={() => navigate(route)}>{label}</button>)}</nav>
        <div className="data-status"><i className={props.live.source === 'live' ? 'is-live' : ''} /><span>{props.live.source === 'live' ? '实时连接' : '快照模式'}</span><small>{shortTime.format(new Date(props.live.generated_at_utc))}</small></div>
      </header>
      <LiveTicker matches={props.live.matches} />
      <div key={props.route} className="route-stage">{props.children}</div>
      <nav className="mobile-nav">{nav.map(([route, label]) => <button className={current === route ? 'is-active' : ''} type="button" key={route} onClick={() => navigate(route)}><i />{label}</button>)}</nav>
    </main>
  )
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute)
  const [data, setData] = useState<WorldCupData | null>(null)
  const [live, setLive] = useState<LiveData | null>(null)
  const [error, setError] = useState('')
  const [homeCode, setHomeCode] = useState('ARG')
  const [awayCode, setAwayCode] = useState('FRA')
  const [stage, setStage] = useState<Stage>('group')
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [odds, setOdds] = useState<OddsData | null>(null)
  const [weather, setWeather] = useState<WeatherData | undefined>()

  useEffect(() => {
    const handleHash = () => setRoute(getRoute())
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  useEffect(() => {
    fetch('./world-cup-data.json')
      .then((response) => {
        if (!response.ok) throw new Error(`核心数据载入失败：${response.status}`)
        return response.json() as Promise<WorldCupData>
      })
      .then((payload) => {
        setData(payload)
        const first = payload.overview.top_contenders[0]?.code ?? payload.teams[0].code
        const second = payload.overview.top_contenders[1]?.code ?? payload.teams[1].code
        setHomeCode(first)
        setAwayCode(second)
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '核心数据载入失败'))
  }, [])

  useEffect(() => {
    if (!data) return
    let active = true
    let timer = 0
    const refresh = () => loadLiveData(data.teams).then((payload) => {
      if (!active) return
      setLive(payload)
      timer = window.setTimeout(refresh, refreshInterval(payload.matches))
    }).catch(() => {
      if (active) timer = window.setTimeout(refresh, 60_000)
    })
    void refresh()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [data])

  useEffect(() => {
    let active = true
    let timer = 0
    const refresh = () => loadOddsData().then((payload) => {
      if (!active) return
      setOdds(payload)
      const next = live?.matches.find((match) => match.state !== 'post')
      const hours = next ? (new Date(next.date_utc).getTime() - Date.now()) / 3_600_000 : 24
      timer = window.setTimeout(refresh, hours <= 3 ? 5 * 60_000 : 15 * 60_000)
    })
    void refresh()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [live?.matches])

  function createPrediction(home: string, away: string, nextWeather = weather) {
    if (!data || !live) return null
    const homeTeam = data.teams.find((team) => team.code === home)
    const awayTeam = data.teams.find((team) => team.code === away)
    if (!homeTeam || !awayTeam || home === away) return null
    return buildPrediction({
      data,
      live,
      home: homeTeam,
      away: awayTeam,
      stage,
      match: findMatch(live.matches, home, away),
      odds: odds ?? undefined,
      weather: nextWeather,
    })
  }

  function runPrediction(home = homeCode, away = awayCode) {
    if (!data || !live) return
    const match = findMatch(live.matches, home, away)
    const pendingWeather: WeatherData | undefined = match
      ? { status: 'loading', updatedAt: '', detail: '正在获取比赛地天气预报。' }
      : undefined
    setHomeCode(home)
    setAwayCode(away)
    setWeather(pendingWeather)
    setPrediction(createPrediction(home, away, pendingWeather))
    navigate('predict')
    if (match) {
      void loadWeather(match).then((payload) => {
        setWeather(payload)
        setPrediction(createPrediction(home, away, payload))
      })
    }
  }

  if (error) return <main className="loading-screen"><span>数据连接失败</span><h1>页面没有拿到世界杯数据。</h1><p>{error}</p></main>
  if (!data || !live) return <main className="loading-screen"><div className="loading-ball">◆</div><span>正在连接世界杯现场</span><h1>同步赛程、比分与球队状态。</h1></main>

  const teamCode = route.startsWith('team/') ? route.split('/')[1] : ''
  const team = data.teams.find((item) => item.code === teamCode)
  let content: React.ReactNode
  if (route === 'predict') content = <PredictPage data={data} homeCode={homeCode} awayCode={awayCode} stage={stage} prediction={prediction} setHomeCode={setHomeCode} setAwayCode={setAwayCode} setStage={setStage} onSubmit={() => runPrediction()} />
  else if (route === 'matches') content = <MatchesPage live={live} onPredict={runPrediction} />
  else if (route === 'teams') content = <TeamsPage data={data} />
  else if (team) content = <TeamDetail team={team} />
  else content = <HomePage data={data} live={live} homeCode={homeCode} awayCode={awayCode} setHomeCode={setHomeCode} setAwayCode={setAwayCode} onPredict={runPrediction} />

  return <AppShell route={route} live={live}>{content}</AppShell>
}
