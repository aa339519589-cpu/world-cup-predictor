import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from 'react'
import './PredictionApp.css'
import type { TeamData, TeamMatch, WorldCupData } from './types'

type Slot = 'home' | 'away'
type Stage = 'group' | 'knockout'

type SubmittedMatch = {
  homeCode: string
  awayCode: string
  stage: Stage
}

type FactorRow = {
  label: string
  note: string
  homeValue: number
  awayValue: number
  weight: number
  inverse?: boolean
  format?: 'number' | 'percent'
}

type ScorelineRow = {
  homeGoals: number
  awayGoals: number
  probability: number
}

type Prediction = {
  home: TeamData
  away: TeamData
  stage: Stage
  factors: Array<FactorRow & { delta: number }>
  homeExpectedGoals: number
  awayExpectedGoals: number
  homeWin: number
  draw: number
  awayWin: number
  scorelines: ScorelineRow[]
  headline: string
  detail: string
}

const percentFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 0,
})

const finePercentFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 1,
})

const numberFormatter = new Intl.NumberFormat('zh-CN', {
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

function formatNumber(input: number) {
  return numberFormatter.format(input)
}

function formatPercent(input: number) {
  return percentFormatter.format(input)
}

function formatFinePercent(input: number) {
  return finePercentFormatter.format(input)
}

function normalizeToken(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, '')
}

// Keep the call shape readable at the call site: clamp(min, max, value).
function clamp(min: number, max: number, value: number) {
  return Math.max(min, Math.min(max, value))
}

function poissonProbability(mean: number, goals: number) {
  let factorial = 1
  for (let index = 2; index <= goals; index += 1) {
    factorial *= index
  }
  return (Math.exp(-mean) * mean ** goals) / factorial
}

function topReasons(team: TeamData) {
  return Object.entries(team.model.breakdown)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([key]) => key)
    .join(' + ')
}

function matchLabel(match: TeamMatch) {
  if (match.scoreline) {
    return `${match.opponent_name_zh} ${match.scoreline}`
  }
  return `${match.opponent_name_zh} 未开球`
}

function resolveTeam(data: WorldCupData, rawValue: string) {
  const token = normalizeToken(rawValue)
  if (!token) {
    return null
  }

  const exactMatch = data.teams.find((team) => {
    const candidates = [team.name_zh, team.name_en, team.code]
    return candidates.some((candidate) => normalizeToken(candidate) === token)
  })
  if (exactMatch) {
    return exactMatch
  }

  return (
    data.teams.find((team) => {
      const candidates = [team.name_zh, team.name_en, team.code, team.group_name_zh, team.model.tier]
      return candidates.some((candidate) => normalizeToken(candidate).includes(token))
    }) ?? null
  )
}

function formatScoreline(homeGoals: number, awayGoals: number) {
  return `${homeGoals}-${awayGoals}`
}

function buildPrediction(data: WorldCupData, submitted: SubmittedMatch): Prediction | null {
  const home = data.teams.find((team) => team.code === submitted.homeCode)
  const away = data.teams.find((team) => team.code === submitted.awayCode)

  if (!home || !away) {
    return null
  }

  const stageFactor = submitted.stage === 'knockout' ? 0.93 : 1
  const factors: FactorRow[] = [
    {
      label: '逻辑总分',
      note: '把历史、近况、名单和伤停压成一个总分。',
      homeValue: home.model.logic_score,
      awayValue: away.model.logic_score,
      weight: 0.35,
      format: 'number',
    },
    {
      label: '历史底盘',
      note: '世界杯历史场均积分，底线强弱最直观。',
      homeValue: home.history.ppg,
      awayValue: away.history.ppg,
      weight: 8,
      format: 'number',
    },
    {
      label: '近期状态',
      note: '近两年加权场均积分，权重更高。',
      homeValue: home.recent_form.weighted_ppg,
      awayValue: away.recent_form.weighted_ppg,
      weight: 10,
      format: 'number',
    },
    {
      label: '进攻效率',
      note: '近两年加权场均进球，直接影响进球预期。',
      homeValue: home.recent_form.weighted_gf_per_match,
      awayValue: away.recent_form.weighted_gf_per_match,
      weight: 8,
      format: 'number',
    },
    {
      label: '防守稳定',
      note: '近两年加权场均失球，越低越好。',
      homeValue: home.recent_form.weighted_ga_per_match,
      awayValue: away.recent_form.weighted_ga_per_match,
      weight: 8,
      inverse: true,
      format: 'number',
    },
    {
      label: '名单厚度',
      note: '五大 + 葡荷联赛占比，反映高质量对抗覆盖。',
      homeValue: home.squad.elite_share,
      awayValue: away.squad.elite_share,
      weight: 22,
      format: 'percent',
    },
    {
      label: '老将经验',
      note: '50场以上国脚占比，淘汰赛尤其重要。',
      homeValue: home.squad.veteran_share,
      awayValue: away.squad.veteran_share,
      weight: 18,
      format: 'percent',
    },
    {
      label: '伤停负担',
      note: '关键伤停扣分，越低越好。',
      homeValue: home.model.injury_penalty,
      awayValue: away.model.injury_penalty,
      weight: 1.4,
      inverse: true,
      format: 'number',
    },
    {
      label: '赛会走势',
      note: '本届已赛场均积分，反映真实开局。',
      homeValue: home.current_tournament.ppg,
      awayValue: away.current_tournament.ppg,
      weight: 8.5,
      format: 'number',
    },
    {
      label: '东道主加成',
      note: '世界杯主办方只有极少数球队有额外环境优势。',
      homeValue: home.model.host_bonus,
      awayValue: away.model.host_bonus,
      weight: 1,
      format: 'number',
    },
  ]

  const weightedFactors = factors
    .map((factor) => {
      const deltaBase = factor.inverse
        ? factor.awayValue - factor.homeValue
        : factor.homeValue - factor.awayValue
      const delta = deltaBase * factor.weight
      return { ...factor, delta }
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))

  const edgeScore = weightedFactors.reduce((sum, factor) => sum + factor.delta, 0)
  const totalGoalsBase = clamp(
    1.8,
    3,
    2.05 +
      (home.recent_form.weighted_gf_per_match + away.recent_form.weighted_gf_per_match - 4) * 0.14 +
      (home.current_tournament.ppg + away.current_tournament.ppg - 4) * 0.05 -
      (home.recent_form.weighted_ga_per_match + away.recent_form.weighted_ga_per_match - 2.6) * 0.16,
  )
  const totalGoals = totalGoalsBase * stageFactor
  const shareShift = clamp(-0.18, 0.18, edgeScore / 120)
  const homeExpectedGoals = clamp(0.35, 3.4, totalGoals * (0.5 + shareShift))
  const awayExpectedGoals = clamp(0.35, 3.4, totalGoals * (0.5 - shareShift))

  const scoreGrid: ScorelineRow[] = []
  let gridMass = 0

  for (let homeGoals = 0; homeGoals <= 6; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 6; awayGoals += 1) {
      const probability =
        poissonProbability(homeExpectedGoals, homeGoals) *
        poissonProbability(awayExpectedGoals, awayGoals)
      gridMass += probability
      scoreGrid.push({ homeGoals, awayGoals, probability })
    }
  }

  const normalizedGrid = scoreGrid
    .map((entry) => ({ ...entry, probability: entry.probability / gridMass }))
    .sort((left, right) => right.probability - left.probability)

  let homeWin = 0
  let draw = 0
  let awayWin = 0
  for (const entry of normalizedGrid) {
    if (entry.homeGoals > entry.awayGoals) {
      homeWin += entry.probability
    } else if (entry.homeGoals === entry.awayGoals) {
      draw += entry.probability
    } else {
      awayWin += entry.probability
    }
  }

  const topScorelines = normalizedGrid.slice(0, 8)
  const favorite = homeWin >= awayWin ? home : away
  const favoriteProbability = Math.max(homeWin, awayWin)
  const favoriteLabel =
    favoriteProbability > 0.58 ? '明显优势' : favoriteProbability > 0.48 ? '轻微优势' : '接近五五开'
  const likelyScoreText = topScorelines
    .slice(0, 3)
    .map((scoreline) => `${formatScoreline(scoreline.homeGoals, scoreline.awayGoals)} ${formatFinePercent(scoreline.probability)}`)
    .join('、')

  return {
    home,
    away,
    stage: submitted.stage,
    factors: weightedFactors,
    homeExpectedGoals,
    awayExpectedGoals,
    homeWin,
    draw,
    awayWin,
    scorelines: topScorelines,
    headline: `${favorite.name_zh} ${favoriteLabel}`,
    detail: `90分钟内更常见的比分集中在 ${likelyScoreText}。总进球预期 ${formatNumber(
      homeExpectedGoals + awayExpectedGoals,
    )} 球。`,
  }
}

function MiniMetric(props: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <article className="mini-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.hint ? <p>{props.hint}</p> : null}
    </article>
  )
}

function FactorBar(props: {
  label: string
  note: string
  homeValue: number
  awayValue: number
  delta: number
  format?: 'number' | 'percent'
}) {
  const formatValue = props.format === 'percent' ? formatPercent : formatNumber
  const directionClass = props.delta >= 0 ? 'is-home' : 'is-away'

  return (
    <div className={`factor-bar ${directionClass}`}>
      <div className="factor-bar__head">
        <div>
          <strong>{props.label}</strong>
          <p>{props.note}</p>
        </div>
        <span>{props.delta >= 0 ? '主队占优' : '客队占优'}</span>
      </div>
      <div className="factor-bar__numbers">
        <strong>{formatValue(props.homeValue)}</strong>
        <span>{formatValue(props.awayValue)}</span>
      </div>
      <div className="factor-bar__track">
        <div
          className="factor-bar__fill"
          style={{
            width: `${Math.min(100, Math.max(12, 50 + Math.abs(props.delta) * 1.5))}%`,
          }}
        />
      </div>
    </div>
  )
}

function TeamChip(props: {
  team: TeamData
  active: boolean
  onPick: (team: TeamData) => void
}) {
  return (
    <button
      type="button"
      className={`team-chip ${props.active ? 'is-active' : ''}`}
      onClick={() => props.onPick(props.team)}
    >
      <img src={props.team.flag_url} alt="" loading="lazy" />
      <div>
        <strong>
          #{props.team.ranking} {props.team.name_zh}
        </strong>
        <span>
          {props.team.group_name_zh} · {formatNumber(props.team.model.logic_score)}
        </span>
      </div>
    </button>
  )
}

function TeamProfile(props: {
  team: TeamData
  role: string
}) {
  return (
    <article className="profile-card">
      <div className="profile-card__head">
        <div className="profile-card__identity">
          <img src={props.team.flag_url} alt="" loading="lazy" />
          <div>
            <span className="eyebrow">{props.role}</span>
            <h3>{props.team.name_zh}</h3>
            <p>
              {props.team.group_name_zh} · {props.team.model.tier} · {topReasons(props.team)}
            </p>
          </div>
        </div>
        <div className="profile-score">
          <strong>{formatNumber(props.team.model.logic_score)}</strong>
          <span>逻辑分</span>
        </div>
      </div>

      <div className="profile-metrics">
        <MiniMetric
          label="历史 PPG"
          value={formatNumber(props.team.history.ppg)}
          hint={`${props.team.history.appearances} 次参赛`}
        />
        <MiniMetric
          label="近况 PPG"
          value={formatNumber(props.team.recent_form.weighted_ppg)}
          hint={`${props.team.recent_form.matches_used} 场样本`}
        />
        <MiniMetric
          label="名单年龄"
          value={`${formatNumber(props.team.squad.avg_age)} 岁`}
          hint={`平均 ${formatNumber(props.team.squad.avg_caps)} 场国脚经验`}
        />
        <MiniMetric
          label="伤停负担"
          value={`-${formatNumber(props.team.model.injury_penalty)}`}
          hint={props.team.injuries.length ? `${props.team.injuries.length} 条关键伤停` : '暂无公开确认的关键伤停'}
        />
      </div>

      <div className="profile-grid">
        <section className="profile-box">
          <div className="profile-box__head">
            <h4>核心球员</h4>
            <p>最能代表这支队伍的 5 人。</p>
          </div>
          <div className="player-stack">
            {props.team.squad.key_players.map((player) => (
              <article key={`${props.team.code}-${player.number}`}>
                <strong>{player.shirt_name}</strong>
                <span>
                  {player.position_zh} · {player.club}
                </span>
                <em>
                  {player.caps} 场 / {player.goals} 球
                </em>
              </article>
            ))}
          </div>
        </section>

        <section className="profile-box">
          <div className="profile-box__head">
            <h4>最近 4 场</h4>
            <p>北京时间。</p>
          </div>
          <ul className="fixture-stack">
            {props.team.recent_form.matches.slice(0, 4).map((match) => (
              <li key={`${props.team.code}-${match.date_utc}-${match.opponent_code}`}>
                <span>{formatChinaTime(match.date_utc)}</span>
                <strong>{matchLabel(match)}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="profile-box">
          <div className="profile-box__head">
            <h4>伤停</h4>
            <p>只列可追踪的重点条目。</p>
          </div>
          {props.team.injuries.length ? (
            <ul className="injury-stack">
              {props.team.injuries.slice(0, 4).map((injury) => (
                <li key={`${props.team.code}-${injury.player}`}>
                  <strong>{injury.player}</strong>
                  <span>{injury.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">暂无公开确认的关键伤停。</p>
          )}
        </section>

        <section className="profile-box profile-box--roster">
          <details>
            <summary>
              <div>
                <h4>26 人完整名单</h4>
                <p>号码、俱乐部、年龄、场次和进球全部展开。</p>
              </div>
              <span>展开</span>
            </summary>
            <div className="table-scroll">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>号</th>
                    <th>位置</th>
                    <th>球员</th>
                    <th>俱乐部</th>
                    <th>年龄</th>
                    <th>场次</th>
                    <th>进球</th>
                  </tr>
                </thead>
                <tbody>
                  {props.team.squad.players.map((player) => (
                    <tr key={`${props.team.code}-${player.number}`}>
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
                      <td>{player.caps}</td>
                      <td>{player.goals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </div>
    </article>
  )
}

function PredictionApp() {
  const [data, setData] = useState<WorldCupData | null>(null)
  const [error, setError] = useState('')
  const [homeInput, setHomeInput] = useState('')
  const [awayInput, setAwayInput] = useState('')
  const [stage, setStage] = useState<Stage>('group')
  const [submitted, setSubmitted] = useState<SubmittedMatch | null>(null)
  const [slot, setSlot] = useState<Slot>('home')
  const [feedback, setFeedback] = useState('')
  const [groupFilter, setGroupFilter] = useState('全部')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

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
        if (!active) {
          return
        }

        setData(payload)
        const [first, second] = payload.overview.top_contenders
        setHomeInput((current) => current || first?.name_zh || '')
        setAwayInput((current) => current || second?.name_zh || '')
        setSubmitted((current) =>
          current ?? {
            homeCode: first?.code || payload.teams[0]?.code || '',
            awayCode: second?.code || payload.teams[1]?.code || '',
            stage: 'group',
          },
        )
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

  const groupOptions = data ? ['全部', ...data.groups.map((group) => group.group_name_zh)] : ['全部']

  const filteredTeams = data
    ? data.teams.filter((team) => {
        const matchesGroup = groupFilter === '全部' || team.group_name_zh === groupFilter
        if (!matchesGroup) {
          return false
        }

        const token = normalizeToken(deferredSearch)
        if (!token) {
          return true
        }

        return [
          team.name_zh,
          team.name_en,
          team.code,
          team.group_name_zh,
          team.model.tier,
        ]
          .join(' ')
          .toLowerCase()
          .includes(token)
      })
    : []

  const homeTeam = data ? resolveTeam(data, homeInput) : null
  const awayTeam = data ? resolveTeam(data, awayInput) : null
  const prediction =
    data && submitted
      ? buildPrediction(data, submitted)
      : null

  const selectedHome = homeTeam
  const selectedAway = awayTeam
  let selectedPairChanged = false
  if (submitted && homeTeam && awayTeam) {
    selectedPairChanged =
      submitted.homeCode !== homeTeam.code || submitted.awayCode !== awayTeam.code || submitted.stage !== stage
  }

  const allPlayers = data?.teams.reduce((sum, team) => sum + team.squad.size, 0) ?? 0

  function pickTeam(team: TeamData) {
    if (slot === 'home') {
      setHomeInput(team.name_zh)
    } else {
      setAwayInput(team.name_zh)
    }
  }

  function submitPrediction() {
    if (!data) {
      return
    }

    const nextHome = resolveTeam(data, homeInput)
    const nextAway = resolveTeam(data, awayInput)

    if (!nextHome || !nextAway) {
      setFeedback('请先把两支球队填成可识别的名称、英文名或代码。')
      return
    }

    if (nextHome.code === nextAway.code) {
      setFeedback('主队和客队不能是同一支球队。')
      return
    }

    setSubmitted({
      homeCode: nextHome.code,
      awayCode: nextAway.code,
      stage,
    })
    setFeedback('')
  }

  function fillHotPair(homeName: string, awayName: string) {
    setHomeInput(homeName)
    setAwayInput(awayName)
    setFeedback('')
  }

  if (error) {
    return (
      <main className="match-app match-app--center">
        <section className="error-card">
          <span className="eyebrow">载入失败</span>
          <h1>世界杯数据没有成功读出来。</h1>
          <p>{error}</p>
        </section>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="match-app match-app--center">
        <section className="loading-card">
          <span className="eyebrow">正在接入赛会数据</span>
          <h1>正在读取 48 支球队、名单和伤停。</h1>
          <p>第一次加载会把整份静态数据拉进来。</p>
        </section>
      </main>
    )
  }

  return (
    <main className="match-app">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <span className="eyebrow">世界杯对阵预测器</span>
          <h1>把两支队伍放上场，直接算出胜负和比分概率。</h1>
          <p>
            只用公开数据和可解释规则。历史、近况、名单、伤停、赛会走势都会进模型，结果会给出胜平负、最可能比分和原因。
          </p>
          <ul className="hero-tags">
            <li>纯逻辑</li>
            <li>90 分钟结果</li>
            <li>比分雷达</li>
            <li>48 支球队</li>
          </ul>
        </div>

        <div className="hero-panel__stats">
          <MiniMetric
            label="已纳入球员"
            value={`${allPlayers}`}
            hint="完整 26 人名单"
          />
          <MiniMetric
            label="当前伤停"
            value={`${data.injuries.length}`}
            hint="公开可核重点条目"
          />
          <MiniMetric
            label="已完赛"
            value={`${data.tournament.matches_completed}/${data.tournament.matches_total}`}
            hint={data.tournament.group_format_zh}
          />
        </div>
      </section>

      <section className="studio-grid">
        <article className="control-panel">
          <div className="section-head section-head--tight">
            <div>
              <span className="eyebrow">对阵输入</span>
              <h2>填队伍，然后点预测</h2>
            </div>
            <p>支持中文名、英文名或代码。也可以点击下面的球队卡片直接填入。</p>
          </div>

          <div className="slot-switch">
            <button
              type="button"
              className={slot === 'home' ? 'is-active' : ''}
              onClick={() => setSlot('home')}
            >
              当前填主队
            </button>
            <button
              type="button"
              className={slot === 'away' ? 'is-active' : ''}
              onClick={() => setSlot('away')}
            >
              当前填客队
            </button>
          </div>

          <div className="match-inputs">
            <label>
              <span>主队</span>
              <input
                list="team-names"
                value={homeInput}
                placeholder="例如：阿根廷 / ARG / Argentina"
                onChange={(event) => {
                  const nextValue = event.target.value
                  startTransition(() => {
                    setHomeInput(nextValue)
                  })
                }}
              />
            </label>
            <label>
              <span>客队</span>
              <input
                list="team-names"
                value={awayInput}
                placeholder="例如：法国 / FRA / France"
                onChange={(event) => {
                  const nextValue = event.target.value
                  startTransition(() => {
                    setAwayInput(nextValue)
                  })
                }}
              />
            </label>
          </div>

          <div className="match-controls">
            <label>
              <span>比赛阶段</span>
              <select
                value={stage}
                onChange={(event) => {
                  const nextStage = event.target.value as Stage
                  startTransition(() => {
                    setStage(nextStage)
                  })
                }}
              >
                <option value="group">小组赛 90 分钟</option>
                <option value="knockout">淘汰赛 90 分钟</option>
              </select>
            </label>

            <button type="button" className="predict-button" onClick={submitPrediction}>
              预测这场比赛
            </button>
          </div>

          {feedback ? <p className="feedback">{feedback}</p> : null}

          <div className="hot-pairs">
            <button type="button" onClick={() => fillHotPair('阿根廷', '法国')}>
              阿根廷 vs 法国
            </button>
            <button type="button" onClick={() => fillHotPair('巴西', '西班牙')}>
              巴西 vs 西班牙
            </button>
            <button type="button" onClick={() => fillHotPair('英格兰', '德国')}>
              英格兰 vs 德国
            </button>
            <button type="button" onClick={() => fillHotPair('葡萄牙', '荷兰')}>
              葡萄牙 vs 荷兰
            </button>
          </div>
        </article>

        <article className="prediction-panel">
          <div className="section-head section-head--tight">
            <div>
              <span className="eyebrow">预测结果</span>
              <h2>{prediction ? prediction.headline : '等待预测'}</h2>
            </div>
            <p>{prediction ? prediction.detail : '请先填入两支球队并点击预测。'}</p>
          </div>

          {prediction ? (
            <>
              <div className="result-board">
                <div className="result-board__scoreline">
                  <div>
                    <img src={prediction.home.flag_url} alt="" loading="lazy" />
                    <strong>{prediction.home.name_zh}</strong>
                    <span>{prediction.home.group_name_zh}</span>
                  </div>
                  <div className="result-board__middle">
                    <em>90 分钟</em>
                    <strong>
                      {formatNumber(prediction.homeExpectedGoals)} : {formatNumber(prediction.awayExpectedGoals)}
                    </strong>
                    <span>{prediction.stage === 'knockout' ? '淘汰赛模型' : '小组赛模型'}</span>
                  </div>
                  <div>
                    <img src={prediction.away.flag_url} alt="" loading="lazy" />
                    <strong>{prediction.away.name_zh}</strong>
                    <span>{prediction.away.group_name_zh}</span>
                  </div>
                </div>

                <div className="result-bars">
                  <div className="prob-row">
                    <span>主胜</span>
                    <strong>{formatPercent(prediction.homeWin)}</strong>
                  </div>
                  <div className="prob-track">
                    <div className="prob-fill prob-fill--home" style={{ width: `${prediction.homeWin * 100}%` }} />
                  </div>

                  <div className="prob-row">
                    <span>平局</span>
                    <strong>{formatPercent(prediction.draw)}</strong>
                  </div>
                  <div className="prob-track">
                    <div className="prob-fill prob-fill--draw" style={{ width: `${prediction.draw * 100}%` }} />
                  </div>

                  <div className="prob-row">
                    <span>客胜</span>
                    <strong>{formatPercent(prediction.awayWin)}</strong>
                  </div>
                  <div className="prob-track">
                    <div className="prob-fill prob-fill--away" style={{ width: `${prediction.awayWin * 100}%` }} />
                  </div>
                </div>
              </div>

              <div className="scoreline-panel">
                <div className="profile-box__head">
                  <h3>比分雷达</h3>
                  <p>最可能的 8 个精确比分。</p>
                </div>
                <div className="scoreline-grid">
                  {prediction.scorelines.map((scoreline, index) => (
                    <article
                      key={`${scoreline.homeGoals}-${scoreline.awayGoals}`}
                      className={`scoreline-chip ${index === 0 ? 'is-top' : ''}`}
                    >
                      <strong>{formatScoreline(scoreline.homeGoals, scoreline.awayGoals)}</strong>
                      <span>{formatFinePercent(scoreline.probability)}</span>
                    </article>
                  ))}
                </div>
              </div>

              <div className="factor-panel">
                <div className="profile-box__head">
                  <h3>为什么会这么判</h3>
                  <p>每一条都能追到原始数据。</p>
                </div>
                <div className="factor-list">
                  {prediction.factors.slice(0, 6).map((factor) => (
                    <FactorBar
                      key={factor.label}
                      label={factor.label}
                      note={factor.note}
                      homeValue={factor.homeValue}
                      awayValue={factor.awayValue}
                      delta={factor.delta}
                      format={factor.format}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </article>
      </section>

      <section className="catalog-panel">
        <div className="section-head section-head--tight">
          <div>
            <span className="eyebrow">球队库</span>
            <h2>48 支队伍，随便点一支就能塞进模型</h2>
          </div>
          <p>先筛选，再点卡片，主队/客队会按照当前按钮状态自动填入。</p>
        </div>

        <div className="catalog-toolbar">
          <label>
            <span>搜索球队 / 教练 / 档位</span>
            <input
              type="search"
              placeholder="例如：巴西、J 组、争冠第一梯队"
              value={search}
              onChange={(event) => {
                const nextValue = event.target.value
                startTransition(() => {
                  setSearch(nextValue)
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

        <div className="team-grid">
          {filteredTeams.map((team) => (
            <TeamChip
              key={team.code}
              team={team}
              active={homeTeam?.code === team.code || awayTeam?.code === team.code}
              onPick={pickTeam}
            />
          ))}
        </div>
      </section>

      <section className="profile-grid-section">
        <div className="section-head section-head--tight">
          <div>
            <span className="eyebrow">深度档案</span>
            <h2>你选的这两支队伍，详细信息都在这里</h2>
          </div>
          <p>
            {selectedPairChanged
              ? '输入已经改了，但结果还没重新跑。点一次“预测这场比赛”会更新右侧结果。'
              : '右侧结果和这两张卡片保持一致。'}
          </p>
        </div>

        <div className="profile-grid-section__content">
          {selectedHome ? <TeamProfile team={selectedHome} role="主队" /> : null}
          {selectedAway ? <TeamProfile team={selectedAway} role="客队" /> : null}
        </div>
      </section>

      <section className="source-panel">
        <div className="section-head section-head--tight">
          <div>
            <span className="eyebrow">方法与来源</span>
            <h2>公开数据，透明规则</h2>
          </div>
          <p>只保留会影响比赛判断的信息。</p>
        </div>

        <ul className="source-list">
          {data.sources.slice(0, 3).map((source) => (
            <li key={source.url}>
              <strong>{source.label}</strong>
              <span>{source.type}</span>
              <a href={source.url} target="_blank" rel="noreferrer">
                查看来源
              </a>
            </li>
          ))}
        </ul>
      </section>

      <datalist id="team-names">
        {data.teams.map((team) => (
          <option key={team.code} value={team.name_zh} />
        ))}
      </datalist>
    </main>
  )
}

export default PredictionApp
