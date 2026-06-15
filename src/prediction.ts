import type { TeamData, WorldCupData } from './types'

export type Stage = 'group' | 'knockout'

export type PredictionFactor = {
  label: string
  note: string
  homeValue: number
  awayValue: number
  delta: number
  format: 'number' | 'percent'
}

export type ScorelineRow = {
  homeGoals: number
  awayGoals: number
  probability: number
}

export type Prediction = {
  home: TeamData
  away: TeamData
  stage: Stage
  factors: PredictionFactor[]
  homeExpectedGoals: number
  awayExpectedGoals: number
  homeWin: number
  draw: number
  awayWin: number
  scorelines: ScorelineRow[]
  headline: string
  detail: string
  confidence: number
}

const percent = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 1,
})

function clamp(min: number, max: number, value: number) {
  return Math.max(min, Math.min(max, value))
}

function poisson(mean: number, goals: number) {
  let factorial = 1
  for (let index = 2; index <= goals; index += 1) factorial *= index
  return (Math.exp(-mean) * mean ** goals) / factorial
}

export function buildPrediction(
  data: WorldCupData,
  homeCode: string,
  awayCode: string,
  stage: Stage,
): Prediction | null {
  const home = data.teams.find((team) => team.code === homeCode)
  const away = data.teams.find((team) => team.code === awayCode)
  if (!home || !away || home.code === away.code) return null

  const rawFactors = [
    ['综合逻辑分', '历史、近况、名单与伤停的综合强度。', home.model.logic_score, away.model.logic_score, 0.35, false, 'number'],
    ['世界杯底盘', '世界杯历史场均积分，反映长期稳定性。', home.history.ppg, away.history.ppg, 8, false, 'number'],
    ['近期状态', '近两年加权场均积分。', home.recent_form.weighted_ppg, away.recent_form.weighted_ppg, 10, false, 'number'],
    ['进攻效率', '近两年加权场均进球。', home.recent_form.weighted_gf_per_match, away.recent_form.weighted_gf_per_match, 8, false, 'number'],
    ['防守稳定', '近两年加权场均失球，越低越好。', home.recent_form.weighted_ga_per_match, away.recent_form.weighted_ga_per_match, 8, true, 'number'],
    ['名单厚度', '高水平联赛球员覆盖比例。', home.squad.elite_share, away.squad.elite_share, 22, false, 'percent'],
    ['大赛经验', '50 场以上国脚占比。', home.squad.veteran_share, away.squad.veteran_share, 18, false, 'percent'],
    ['伤停影响', '重点伤停扣分，越低越好。', home.model.injury_penalty, away.model.injury_penalty, 1.4, true, 'number'],
    ['本届走势', '本届世界杯已赛场均积分。', home.current_tournament.ppg, away.current_tournament.ppg, 8.5, false, 'number'],
    ['主场环境', '东道主环境与旅行优势。', home.model.host_bonus, away.model.host_bonus, 1, false, 'number'],
  ] as const

  const factors = rawFactors
    .map(([label, note, homeValue, awayValue, weight, inverse, format]) => ({
      label,
      note,
      homeValue,
      awayValue,
      delta: (inverse ? awayValue - homeValue : homeValue - awayValue) * weight,
      format,
    }))
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))

  const edge = factors.reduce((sum, factor) => sum + factor.delta, 0)
  const stageFactor = stage === 'knockout' ? 0.93 : 1
  const totalGoals = clamp(
    1.75,
    3.2,
    2.1 +
      (home.recent_form.weighted_gf_per_match + away.recent_form.weighted_gf_per_match - 3.2) * 0.16 -
      (home.recent_form.weighted_ga_per_match + away.recent_form.weighted_ga_per_match - 2.4) * 0.12,
  ) * stageFactor
  const shift = clamp(-0.2, 0.2, edge / 115)
  const homeExpectedGoals = clamp(0.3, 3.4, totalGoals * (0.5 + shift))
  const awayExpectedGoals = clamp(0.3, 3.4, totalGoals * (0.5 - shift))

  const grid: ScorelineRow[] = []
  let mass = 0
  for (let homeGoals = 0; homeGoals <= 7; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 7; awayGoals += 1) {
      const probability = poisson(homeExpectedGoals, homeGoals) * poisson(awayExpectedGoals, awayGoals)
      mass += probability
      grid.push({ homeGoals, awayGoals, probability })
    }
  }

  const scorelines = grid
    .map((row) => ({ ...row, probability: row.probability / mass }))
    .sort((left, right) => right.probability - left.probability)

  let homeWin = 0
  let draw = 0
  let awayWin = 0
  scorelines.forEach((row) => {
    if (row.homeGoals > row.awayGoals) homeWin += row.probability
    else if (row.homeGoals === row.awayGoals) draw += row.probability
    else awayWin += row.probability
  })

  const favorite = homeWin >= awayWin ? home : away
  const favoriteProbability = Math.max(homeWin, awayWin)
  const label = favoriteProbability >= 0.62 ? '优势明确' : favoriteProbability >= 0.48 ? '稍占上风' : '胜负开放'
  const likely = scorelines
    .slice(0, 3)
    .map((row) => `${row.homeGoals}-${row.awayGoals} ${percent.format(row.probability)}`)
    .join('、')

  return {
    home,
    away,
    stage,
    factors,
    homeExpectedGoals,
    awayExpectedGoals,
    homeWin,
    draw,
    awayWin,
    scorelines: scorelines.slice(0, 8),
    headline: `${favorite.name_zh} ${label}`,
    detail: `最集中的比分是 ${likely}。模型总进球预期 ${(homeExpectedGoals + awayExpectedGoals).toFixed(1)}。`,
    confidence: clamp(0.48, 0.86, 0.5 + Math.abs(homeWin - awayWin) * 0.55),
  }
}
