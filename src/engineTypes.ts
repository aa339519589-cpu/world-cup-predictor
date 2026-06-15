import type { LiveData, LiveMatch, TeamData, WorldCupData } from './types'

export type Stage = 'group' | 'knockout'
export type SourceState = 'success' | 'stale' | 'failed' | 'not_configured' | 'projected'

export type ThreeWayProbability = {
  homeWin: number
  draw: number
  awayWin: number
}

export type ModelResult = ThreeWayProbability & {
  id: 'elo' | 'poisson_xg' | 'technical_stats' | 'lineup_injury' | 'market_odds'
  label: string
  confidence: number
  available: boolean
  detail: string
}

export type ScoreCell = {
  homeGoals: number
  awayGoals: number
  probability: number
}

export type OddsBookmaker = {
  key: string
  title: string
  updatedAt: string
  home: number
  draw: number
  away: number
  weight?: number
}

export type OddsMatch = {
  id: string
  commenceTime: string
  homeCode: string
  awayCode: string
  bookmakers: OddsBookmaker[]
}

export type OddsData = {
  generated_at_utc: string
  status: 'success' | 'not_configured' | 'failed'
  message: string
  matches: OddsMatch[]
}

export type WeatherData = {
  status: 'success' | 'failed' | 'not_available' | 'loading'
  updatedAt: string
  temperatureC?: number
  precipitationProbability?: number
  windKph?: number
  weatherCode?: number
  detail: string
}

export type SourceStatus = {
  id: string
  label: string
  category: string
  status: SourceState
  updatedAt: string
  ageMinutes: number | null
  weight: number
  participated: boolean
  detail: string
}

export type PredictionFactor = {
  label: string
  note: string
  homeValue: number
  awayValue: number
  delta: number
  format: 'number' | 'percent'
}

export type MarketComparisonRow = {
  label: string
  model: number
  market: number
  edge: number
  value: boolean
}

export type RiskFlag = {
  id: string
  level: 'low' | 'medium' | 'high'
  label: string
  detail: string
}

export type PredictionContext = {
  data: WorldCupData
  live: LiveData
  home: TeamData
  away: TeamData
  stage: Stage
  match?: LiveMatch
  odds?: OddsData
  weather?: WeatherData
  now?: Date
}

export type Prediction = ThreeWayProbability & {
  home: TeamData
  away: TeamData
  stage: Stage
  match?: LiveMatch
  updatedAt: string
  factors: PredictionFactor[]
  homeExpectedGoals: number
  awayExpectedGoals: number
  scoreMatrix: ScoreCell[]
  scorelines: ScoreCell[]
  handicap: {
    line: number
    homeCover: number
    push: number
    awayCover: number
  }
  goalMarkets: {
    over25: number
    under25: number
    over35: number
    under35: number
    bttsYes: number
    bttsNo: number
  }
  upsetProbability: number
  drawRisk: 'low' | 'medium' | 'high'
  headline: string
  detail: string
  confidence: number
  models: ModelResult[]
  modelWeights: Record<ModelResult['id'], number>
  sourceStatuses: SourceStatus[]
  marketComparison: MarketComparisonRow[]
  riskFlags: RiskFlag[]
  finalVerdict: {
    mostLikelyResult: string
    mostLikelyScore: string
    safeRange: string
  }
}
