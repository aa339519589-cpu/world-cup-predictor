import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from 'react'
import './App.css'
import type { GroupData, TeamData, TeamMatch, WorldCupData } from './types'

const breakdownLabels: Record<string, string> = {
  history: '历史底子',
  recent: '近期状态',
  defense: '防守稳定',
  experience: '名单经验',
  attack: '进攻产量',
  elite: '高竞争联赛覆盖',
  momentum: '本届势头',
}

const percentFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 0,
})

const shortNumberFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 1,
})

const chinaDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Shanghai',
})

function formatChinaTime(input: string) {
  return chinaDateFormatter.format(new Date(input)).replace(',', '')
}

function formatPercent(input: number) {
  return percentFormatter.format(input)
}

function formatMetric(input: number) {
  return shortNumberFormatter.format(input)
}

function matchLabel(match: TeamMatch) {
  return match.scoreline ? `${match.opponent_name_zh} ${match.scoreline}` : `${match.opponent_name_zh} 未开球`
}

function topReasons(team: TeamData) {
  return Object.entries(team.model.breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => breakdownLabels[key] ?? key)
    .join(' + ')
}

function MetricCard(props: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <article className="metric-card rise-in">
      <span className="eyebrow">{props.label}</span>
      <strong>{props.value}</strong>
      {props.hint ? <p>{props.hint}</p> : null}
    </article>
  )
}

function BreakdownBar(props: {
  label: string
  value: number
}) {
  return (
    <div className="breakdown-bar">
      <div className="breakdown-bar__head">
        <span>{props.label}</span>
        <strong>{formatMetric(props.value)}</strong>
      </div>
      <div className="breakdown-bar__track">
        <div
          className="breakdown-bar__fill"
          style={{ width: `${Math.max(6, Math.min(100, props.value))}%` }}
        />
      </div>
    </div>
  )
}

function FixtureLine(props: {
  match: TeamMatch
}) {
  return (
    <li>
      <span>{formatChinaTime(props.match.date_utc)}</span>
      <strong>{matchLabel(props.match)}</strong>
      {props.match.competition ? <em>{props.match.competition}</em> : null}
    </li>
  )
}

function GroupCard(props: {
  group: GroupData
}) {
  return (
    <article className="group-card rise-in">
      <div className="section-head section-head--compact">
        <div>
          <span className="eyebrow">小组推演</span>
          <h3>{props.group.group_name_zh}</h3>
        </div>
        <p>按已赛积分 + 剩余赛程预期积分排序</p>
      </div>

      <div className="table-scroll">
        <table className="table table--compact">
          <thead>
            <tr>
              <th>顺位</th>
              <th>球队</th>
              <th>现分</th>
              <th>预测分</th>
              <th>难度</th>
            </tr>
          </thead>
          <tbody>
            {props.group.teams.map((team) => (
              <tr key={team.code}>
                <td>#{team.projected_position}</td>
                <td>
                  <div className="team-inline">
                    <img src={team.flag_url} alt="" />
                    <div>
                      <strong>{team.name_zh}</strong>
                      <span>{team.advancement_label}</span>
                    </div>
                  </div>
                </td>
                <td>{team.actual_points}</td>
                <td>{formatMetric(team.projected_points)}</td>
                <td>{formatMetric(team.group_difficulty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="fixture-list fixture-list--tight">
        {props.group.matches.slice(0, 3).map((match) => (
          <li key={match.id}>
            <span>{formatChinaTime(match.date_utc)}</span>
            <strong>
              {match.home.name_zh}
              {match.home.score !== null ? ` ${match.home.score}` : ''} :{' '}
              {match.away.score !== null ? match.away.score : ''}
              {match.away.score !== null ? ` ${match.away.name_zh}` : ` ${match.away.name_zh}`}
            </strong>
          </li>
        ))}
      </ul>
    </article>
  )
}

function TeamSheet(props: {
  team: TeamData
}) {
  const { team } = props
  const breakdownEntries = Object.entries(team.model.breakdown)
  return (
    <details className="team-sheet rise-in">
      <summary>
        <div className="team-sheet__summary">
          <div className="team-sheet__identity">
            <img src={team.flag_url} alt="" />
            <div>
              <span className="team-sheet__rank">#{team.ranking}</span>
              <h3>{team.name_zh}</h3>
              <p>
                {team.group_name_zh} · {team.model.tier} · {topReasons(team)}
              </p>
            </div>
          </div>
          <div className="team-sheet__score">
            <strong>{formatMetric(team.model.logic_score)}</strong>
            <span>{team.projection.advancement_label}</span>
          </div>
        </div>
      </summary>

      <div className="team-sheet__body">
        <div className="fact-grid">
          <MetricCard
            label="历史场均积分"
            value={formatMetric(team.history.ppg)}
            hint={`${team.history.appearances}次参赛，${team.history.matches}场世界杯`}
          />
          <MetricCard
            label="近两年加权场均积分"
            value={formatMetric(team.recent_form.weighted_ppg)}
            hint={`${team.recent_form.matches_used}场样本，友谊赛已折权`}
          />
          <MetricCard
            label="阵容平均年龄"
            value={`${formatMetric(team.squad.avg_age)}岁`}
            hint={`平均${formatMetric(team.squad.avg_caps)}场国家队经验`}
          />
          <MetricCard
            label="关键伤停减分"
            value={`-${formatMetric(team.model.injury_penalty)}`}
            hint={
              team.injuries.length
                ? `${team.injuries.length}条已核伤停`
                : '暂无公开确认的关键伤停'
            }
          />
        </div>

        <div className="team-columns">
          <article className="paper-card paper-card--soft">
            <div className="section-head section-head--compact">
              <div>
                <span className="eyebrow">逻辑拆分</span>
                <h4>七项打分</h4>
              </div>
              <p>全部可追溯，不用黑盒概率。</p>
            </div>
            <div className="breakdown-list">
              {breakdownEntries.map(([key, value]) => (
                <BreakdownBar
                  key={key}
                  label={breakdownLabels[key] ?? key}
                  value={value}
                />
              ))}
            </div>
            <ul className="chip-row">
              <li>预测小组名次 #{team.projection.projected_group_position}</li>
              <li>预测积分 {formatMetric(team.projection.projected_group_points)}</li>
              <li>小组难度 {formatMetric(team.projection.projected_group_difficulty)}</li>
              {team.model.host_bonus > 0 ? <li>东道主加成 +{team.model.host_bonus}</li> : null}
            </ul>
          </article>

          <article className="paper-card paper-card--soft">
            <div className="section-head section-head--compact">
              <div>
                <span className="eyebrow">球队底账</span>
                <h4>历史与近况</h4>
              </div>
              <p>所有历史积分统一回算到3分制。</p>
            </div>
            <dl className="stat-list">
              <div>
                <dt>历史胜平负</dt>
                <dd>
                  {team.history.wins}-{team.history.draws}-{team.history.losses}
                </dd>
              </div>
              <div>
                <dt>历史净胜球</dt>
                <dd>{team.history.goal_difference}</dd>
              </div>
              <div>
                <dt>近两年场均进球</dt>
                <dd>{formatMetric(team.recent_form.weighted_gf_per_match)}</dd>
              </div>
              <div>
                <dt>近两年场均失球</dt>
                <dd>{formatMetric(team.recent_form.weighted_ga_per_match)}</dd>
              </div>
              <div>
                <dt>近两年零封率</dt>
                <dd>{formatPercent(team.recent_form.clean_sheet_rate)}</dd>
              </div>
              <div>
                <dt>本届已赛积分</dt>
                <dd>{team.current_tournament.points}</dd>
              </div>
            </dl>
          </article>

          <article className="paper-card paper-card--soft">
            <div className="section-head section-head--compact">
              <div>
                <span className="eyebrow">名单结构</span>
                <h4>球员层细节</h4>
              </div>
              <p>
                主帅 {team.coach_name || '待补'} · {team.coach_nationality || '未知'}
              </p>
            </div>
            <dl className="stat-list">
              <div>
                <dt>五大+葡荷联赛占比</dt>
                <dd>{formatPercent(team.squad.elite_share)}</dd>
              </div>
              <div>
                <dt>50场以上国脚占比</dt>
                <dd>{formatPercent(team.squad.veteran_share)}</dd>
              </div>
              <div>
                <dt>前锋平均国家队进球</dt>
                <dd>{formatMetric(team.squad.forward_avg_goals)}</dd>
              </div>
              <div>
                <dt>平均身高</dt>
                <dd>{formatMetric(team.squad.avg_height_cm)} cm</dd>
              </div>
            </dl>
            <div className="key-player-list">
              {team.squad.key_players.map((player) => (
                <article key={`${team.code}-${player.number}`}>
                  <strong>{player.shirt_name}</strong>
                  <span>
                    {player.position_zh} · {player.club}
                  </span>
                  <em>
                    {player.caps}场 / {player.goals}球
                  </em>
                </article>
              ))}
            </div>
          </article>
        </div>

        <div className="team-columns team-columns--secondary">
          <article className="paper-card paper-card--soft">
            <div className="section-head section-head--compact">
              <div>
                <span className="eyebrow">最近六场</span>
                <h4>状态样本</h4>
              </div>
              <p>北京时间显示。</p>
            </div>
            <ul className="fixture-list">
              {team.recent_form.matches.map((match) => (
                <FixtureLine key={`${team.code}-${match.date_utc}-${match.opponent_code}`} match={match} />
              ))}
            </ul>
          </article>

          <article className="paper-card paper-card--soft">
            <div className="section-head section-head--compact">
              <div>
                <span className="eyebrow">本届世界杯</span>
                <h4>已赛与待赛</h4>
              </div>
              <p>{team.current_tournament.matches_played ? '已纳入当前实际结果。' : '尚未出赛。'}</p>
            </div>
            <ul className="fixture-list">
              {team.current_tournament.completed_matches.map((match) => (
                <FixtureLine key={`${team.code}-done-${match.date_utc}-${match.opponent_code}`} match={match} />
              ))}
              {team.current_tournament.upcoming_matches.map((match) => (
                <FixtureLine key={`${team.code}-next-${match.date_utc}-${match.opponent_code}`} match={match} />
              ))}
            </ul>
          </article>

          <article className="paper-card paper-card--soft">
            <div className="section-head section-head--compact">
              <div>
                <span className="eyebrow">伤停雷达</span>
                <h4>关键可用性</h4>
              </div>
              <p>只列公开可核的重点条目。</p>
            </div>
            {team.injuries.length ? (
              <ul className="injury-list">
                {team.injuries.map((injury) => (
                  <li key={`${team.code}-${injury.player}`}>
                    <div>
                      <strong>{injury.player}</strong>
                      <span>{injury.status}</span>
                    </div>
                    <p>{injury.detail}</p>
                    <a href={injury.source.url} target="_blank" rel="noreferrer">
                      {injury.source.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">暂无公开确认的关键伤停，模型不做额外扣分。</p>
            )}
          </article>
        </div>

        <article className="paper-card paper-card--soft">
          <div className="section-head section-head--compact">
            <div>
              <span className="eyebrow">26人大名单</span>
              <h4>完整球员册</h4>
            </div>
            <p>号码、俱乐部、年龄、出场、进球全部展开。</p>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>号</th>
                  <th>位置</th>
                  <th>球员</th>
                  <th>俱乐部</th>
                  <th>年龄</th>
                  <th>身高</th>
                  <th>国家队场次</th>
                  <th>国家队进球</th>
                </tr>
              </thead>
              <tbody>
                {team.squad.players.map((player) => (
                  <tr key={`${team.code}-${player.number}`}>
                    <td>{player.number}</td>
                    <td>{player.position_zh}</td>
                    <td>
                      <div className="player-cell">
                        <strong>{player.shirt_name}</strong>
                        <span>{player.player_name}</span>
                      </div>
                    </td>
                    <td>{player.club}</td>
                    <td>{player.age}</td>
                    <td>{player.height_cm}</td>
                    <td>{player.caps}</td>
                    <td>{player.goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </details>
  )
}

function App() {
  const [data, setData] = useState<WorldCupData | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState('全部')
  const deferredQuery = useDeferredValue(query)
  const dataUrl = `${import.meta.env.BASE_URL}world-cup-data.json`

  useEffect(() => {
    let active = true

    fetch(dataUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`数据载入失败：${response.status}`)
        }
        return response.json() as Promise<WorldCupData>
      })
      .then((payload) => {
        if (active) {
          setData(payload)
        }
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : '数据载入失败')
        }
      })

    return () => {
      active = false
    }
  }, [dataUrl])

  if (error) {
    return (
      <main className="page-shell page-shell--center">
        <section className="paper-card paper-card--error">
          <span className="eyebrow">载入失败</span>
          <h1>世界杯数据没有成功读出来。</h1>
          <p>{error}</p>
        </section>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="page-shell page-shell--center">
        <section className="paper-card paper-card--loading">
          <span className="eyebrow">正在铺开纸面</span>
          <h1>正在整理 48 支球队、完整名单与伤停雷达。</h1>
          <p>首次加载会把整份静态数据一次性读入。</p>
        </section>
      </main>
    )
  }

  const normalizedQuery = deferredQuery.trim().toLowerCase()
  const groupOptions = ['全部', ...data.groups.map((group) => group.group_name_zh)]
  const filteredTeams = data.teams.filter((team) => {
    const matchesGroup = groupFilter === '全部' || team.group_name_zh === groupFilter
    if (!matchesGroup) {
      return false
    }
    if (!normalizedQuery) {
      return true
    }
    const haystack = [
      team.name_zh,
      team.name_en,
      team.code,
      team.coach_name,
      team.group_name_zh,
      team.model.tier,
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalizedQuery)
  })

  const visibleInjuries = data.injuries.slice(0, 14)
  const totalPlayers = data.teams.reduce((sum, team) => sum + team.squad.size, 0)

  return (
    <main className="page-shell">
      <header className="hero-panel rise-in">
        <div className="hero-panel__topline">
          <span className="eyebrow">纸面推演 · 2026 世界杯</span>
          <nav>
            <a href="#rankings">总榜</a>
            <a href="#groups">小组</a>
            <a href="#teams">球队册</a>
            <a href="#injuries">伤停</a>
            <a href="#method">方法</a>
          </nav>
        </div>

        <div className="hero-panel__content">
          <div>
            <h1>全中文、全展开、只讲逻辑的世界杯预测纸面。</h1>
            <p className="hero-panel__copy">
              核心数据来自 FIFA 官方赛程接口、FIFA 官方 26 人名单和公开可核的伤停报道。每支球队都给出历史世界杯场均积分、
              近两年状态、完整球员册、关键伤停和透明逻辑分。
            </p>
            <p className="hero-panel__note">
              数据截点：{data.as_of_china}（北京时间）
              <br />
              {data.tournament.group_format_zh}
            </p>
          </div>

          <div className="hero-panel__aside">
            <div className="hero-rankings">
              <div className="section-head section-head--compact">
                <div>
                  <span className="eyebrow">当前逻辑榜前六</span>
                  <h2>争冠层级</h2>
                </div>
              </div>
              <ol>
                {data.overview.top_contenders.slice(0, 6).map((team) => (
                  <li key={team.code}>
                    <strong>
                      #{team.rank} {team.name_zh}
                    </strong>
                    <span>{team.logic_score}</span>
                    <em>
                      {team.group_name_zh} · {team.tier}
                    </em>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </header>

      <section className="metric-grid">
        <MetricCard
          label="已完赛小组赛"
          value={`${data.tournament.matches_completed} / ${data.tournament.matches_total}`}
          hint="按 FIFA 官方赛程接口实时切到 2026 赛季。"
        />
        <MetricCard
          label="已纳入球员"
          value={`${totalPlayers}`}
          hint="48支球队完整 26 人名单已全部展开。"
        />
        <MetricCard
          label="关键伤停条目"
          value={`${data.injuries.length}`}
          hint="只列公开可核、会改变可用性的重点信息。"
        />
        <MetricCard
          label="预测口径"
          value="纯逻辑"
          hint="历史、近况、名单、伤停、小组路径全部可追。"
        />
      </section>

      <section id="rankings" className="paper-card rise-in">
        <div className="section-head">
          <div>
            <span className="eyebrow">逻辑总榜</span>
            <h2>48队横向比较</h2>
          </div>
          <p>先看谁的纸面最完整，再看他所在小组到底多难。</p>
        </div>

        <div className="toolbar">
          <label>
            <span>搜索球队 / 教练 / 档位</span>
            <input
              type="search"
              placeholder="例如：巴西、阿根廷、四强主流"
              value={query}
              onChange={(event) => {
                const nextValue = event.target.value
                startTransition(() => {
                  setQuery(nextValue)
                })
              }}
            />
          </label>

          <label>
            <span>按小组筛选</span>
            <select
              value={groupFilter}
              onChange={(event) => {
                startTransition(() => {
                  setGroupFilter(event.target.value)
                })
              }}
            >
              {groupOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="table-scroll">
          <table className="table table--ranking">
            <thead>
              <tr>
                <th>排名</th>
                <th>球队</th>
                <th>逻辑分</th>
                <th>历史 PPG</th>
                <th>近况 PPG</th>
                <th>伤停</th>
                <th>预测定位</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((team) => (
                <tr key={team.code}>
                  <td>#{team.ranking}</td>
                  <td>
                    <div className="team-inline">
                      <img src={team.flag_url} alt="" />
                      <div>
                        <strong>{team.name_zh}</strong>
                        <span>
                          {team.group_name_zh} · {team.code}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{formatMetric(team.model.logic_score)}</td>
                  <td>{formatMetric(team.history.ppg)}</td>
                  <td>{formatMetric(team.recent_form.weighted_ppg)}</td>
                  <td>{team.injuries.length ? `${team.injuries.length}条` : '清爽'}</td>
                  <td>{team.projection.advancement_label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="groups" className="paper-card rise-in">
        <div className="section-head">
          <div>
            <span className="eyebrow">小组局势</span>
            <h2>12组同步推演</h2>
          </div>
          <p>已赛部分完全按真实结果记账，未赛部分按双方逻辑分差计算预期积分。</p>
        </div>
        <div className="group-grid">
          {data.groups.map((group) => (
            <GroupCard key={group.group} group={group} />
          ))}
        </div>
      </section>

      <section id="teams" className="paper-card rise-in">
        <div className="section-head">
          <div>
            <span className="eyebrow">球队总册</span>
            <h2>每队都给完整名单与分项逻辑</h2>
          </div>
          <p>展开任意球队，就能看到历史账、近况、关键人和 26 人完整球员表。</p>
        </div>
        <div className="team-sheet-list">
          {filteredTeams.map((team) => (
            <TeamSheet key={team.code} team={team} />
          ))}
        </div>
      </section>

      <section id="injuries" className="paper-card rise-in">
        <div className="section-head">
          <div>
            <span className="eyebrow">伤停雷达</span>
            <h2>当前最影响纸面的可用性变量</h2>
          </div>
          <p>这部分不追求八卦，只收会改变预测逻辑的关键伤停。</p>
        </div>
        <div className="injury-card-grid">
          {visibleInjuries.map((injury) => (
            <article key={`${injury.team_code}-${injury.player}`} className="injury-card">
              <div className="team-inline">
                {injury.team_flag_url ? <img src={injury.team_flag_url} alt="" /> : null}
                <div>
                  <strong>{injury.team_name_zh}</strong>
                  <span>影响分 {injury.impact_points}</span>
                </div>
              </div>
              <h3>{injury.player}</h3>
              <p className="injury-card__status">{injury.status}</p>
              <p>{injury.detail}</p>
              <a href={injury.source.url} target="_blank" rel="noreferrer">
                {injury.source.label}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section id="method" className="paper-card rise-in">
        <div className="section-head">
          <div>
            <span className="eyebrow">方法与来源</span>
            <h2>为什么这个预测站是可追责的</h2>
          </div>
          <p>{data.methodology.headline}</p>
        </div>

        <div className="method-grid">
          <article className="paper-card paper-card--soft">
            <h3>权重配置</h3>
            <div className="breakdown-list">
              {data.methodology.weights.map((item) => (
                <BreakdownBar key={item.name} label={item.name} value={item.weight} />
              ))}
            </div>
          </article>

          <article className="paper-card paper-card--soft">
            <h3>口径说明</h3>
            <ul className="note-list">
              {data.methodology.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </article>
        </div>

        <div className="source-list">
          {data.sources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              <strong>{source.label}</strong>
              <span>{source.type}</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
