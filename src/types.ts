export type InjuryEntry = {
  team_code: string
  team_name_zh?: string
  team_flag_url?: string
  player: string
  status: string
  detail: string
  impact_points: number
  source: {
    label: string
    url: string
  }
}

export type TeamMatch = {
  date_utc: string
  competition?: string
  stage?: string
  is_friendly?: boolean
  venue?: string
  opponent_name_zh: string
  opponent_code: string
  scoreline: string | null
  points?: number
  group_name_zh?: string
  stadium?: string
  city?: string
  status?: string
}

export type SquadPlayer = {
  number: number
  position: string
  position_zh: string
  player_name: string
  first_names: string
  last_names: string
  shirt_name: string
  dob: string
  age: number
  club: string
  club_country: string | null
  height_cm: number
  caps: number
  goals: number
}

export type TeamData = {
  ranking: number
  code: string
  id: string
  name_en: string
  name_zh: string
  group: string
  group_name_zh: string
  flag_url: string
  coach_name: string
  coach_nationality: string
  history: {
    appearances: number
    matches: number
    wins: number
    draws: number
    losses: number
    goals_for: number
    goals_against: number
    goal_difference: number
    points: number
    ppg: number
  }
  recent_form: {
    matches: TeamMatch[]
    matches_used: number
    weighted_ppg: number
    weighted_gf_per_match: number
    weighted_ga_per_match: number
    weighted_gd_per_match: number
    clean_sheet_rate: number
  }
  current_tournament: {
    matches_played: number
    points: number
    wins: number
    draws: number
    losses: number
    goals_for: number
    goals_against: number
    goal_difference: number
    ppg: number
    completed_matches: TeamMatch[]
    upcoming_matches: TeamMatch[]
  }
  squad: {
    size: number
    avg_age: number
    avg_caps: number
    avg_height_cm: number
    veteran_share: number
    elite_share: number
    forward_avg_goals: number
    key_players: SquadPlayer[]
    players: SquadPlayer[]
  }
  injuries: InjuryEntry[]
  model: {
    logic_score: number
    tier: string
    host_bonus: number
    injury_penalty: number
    breakdown: Record<string, number>
  }
  projection: {
    projected_group_position: number
    projected_group_points: number
    projected_group_difficulty: number
    advancement_label: string
  }
}

export type GroupData = {
  group: string
  group_name_zh: string
  matches: {
    id: string
    date_utc: string
    status: string
    stadium: string
    city: string
    home: {
      code: string
      name_zh: string
      score: number | null
      flag_url: string
    }
    away: {
      code: string
      name_zh: string
      score: number | null
      flag_url: string
    }
  }[]
  teams: {
    code: string
    name_zh: string
    flag_url: string
    logic_score: number
    actual_points: number
    actual_gd: number
    projected_points: number
    projected_gd: number
    projected_position: number
    group_difficulty: number
    advancement_label: string
  }[]
}

export type WorldCupData = {
  generated_at_utc: string
  as_of_china: string
  tournament: {
    season_id: string
    name_zh: string
    date_range_zh: string
    matches_completed: number
    matches_total: number
    group_format_zh: string
  }
  methodology: {
    headline: string
    weights: {
      name: string
      weight: number
    }[]
    notes: string[]
  }
  sources: {
    label: string
    type: string
    url: string
  }[]
  overview: {
    top_contenders: {
      rank: number
      code: string
      name_zh: string
      group_name_zh: string
      logic_score: number
      tier: string
      advancement_label: string
    }[]
  }
  groups: GroupData[]
  injuries: InjuryEntry[]
  teams: TeamData[]
}
