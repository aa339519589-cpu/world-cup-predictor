import type { LiveArticle, LiveData, LiveMatch, TeamData } from './types'

const SCOREBOARD_API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
const NEWS_API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news?limit=10'
const SNAPSHOT_URL = './live-data.json'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '')
}

function dateRange() {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - 1)
  const end = new Date()
  end.setUTCDate(end.getUTCDate() + 4)
  return `${dateKey(start)}-${dateKey(end)}`
}

function teamName(code: string, fallback: string, teams: TeamData[]) {
  return teams.find((team) => team.code === code)?.name_zh ?? fallback
}

function parseMatches(payload: unknown, teams: TeamData[]): LiveMatch[] {
  return array(record(payload).events).flatMap((rawEvent) => {
    const event = record(rawEvent)
    const competition = record(array(event.competitions)[0])
    const competitors = array(competition.competitors).map(record)
    const home = competitors.find((entry) => entry.homeAway === 'home')
    const away = competitors.find((entry) => entry.homeAway === 'away')
    if (!home || !away) return []

    const homeTeam = record(home.team)
    const awayTeam = record(away.team)
    const status = record(record(competition.status).type)
    const venue = record(competition.venue)
    const address = record(venue.address)
    const homeCode = text(homeTeam.abbreviation)
    const awayCode = text(awayTeam.abbreviation)
    const state = text(status.state) as LiveMatch['state']

    return [{
      id: text(event.id),
      date_utc: text(event.date),
      state: state || 'pre',
      status: text(status.shortDetail) || text(status.description),
      clock: text(record(competition.status).displayClock),
      completed: Boolean(status.completed),
      venue: text(venue.fullName),
      city: text(address.city),
      home: {
        code: homeCode,
        name_zh: teamName(homeCode, text(homeTeam.displayName), teams),
        name_en: text(homeTeam.displayName),
        logo: text(homeTeam.logo),
        score: Number(home.score ?? 0),
      },
      away: {
        code: awayCode,
        name_zh: teamName(awayCode, text(awayTeam.displayName), teams),
        name_en: text(awayTeam.displayName),
        logo: text(awayTeam.logo),
        score: Number(away.score ?? 0),
      },
    }]
  }).sort((left, right) => left.date_utc.localeCompare(right.date_utc))
}

function parseArticles(payload: unknown, teams: TeamData[]): LiveArticle[] {
  return array(record(payload).articles).slice(0, 8).map((rawArticle) => {
    const article = record(rawArticle)
    const images = array(article.images).map(record)
    const categories = array(article.categories).map(record)
    const relatedTeams = categories
      .filter((category) => category.type === 'team')
      .map((category) => text(category.description))
      .filter(Boolean)
    const teamNamesZh = relatedTeams.map((name) => {
      const normalized = name.toLowerCase()
      return teams.find((team) => team.name_en.toLowerCase() === normalized)?.name_zh ?? name
    })
    const links = record(article.links)
    const web = record(links.web)

    return {
      id: String(article.id ?? ''),
      headline: text(article.headline),
      headline_zh: text(article.headline_zh),
      description: text(article.description),
      published: text(article.published),
      image: text(images.find((image) => image.type === 'header')?.url ?? images[0]?.url),
      url: text(web.href),
      teams: teamNamesZh,
      source: 'ESPN',
    }
  })
}

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<unknown>
}

async function translateArticles(articles: LiveArticle[]) {
  let cachedTranslations: [string, string][] = []
  try {
    cachedTranslations = JSON.parse(localStorage.getItem('wc-news-translations') || '[]') as [string, string][]
  } catch {
    localStorage.removeItem('wc-news-translations')
  }
  const cache = new Map<string, string>(cachedTranslations)
  const targets = articles.filter((article) => !article.headline_zh && !cache.has(article.headline)).slice(0, 5)
  await Promise.all(targets.map(async (article) => {
    try {
      const endpoint = new URL('https://api.mymemory.translated.net/get')
      endpoint.searchParams.set('q', article.headline)
      endpoint.searchParams.set('langpair', 'en|zh-CN')
      const result = record(await fetchJson(endpoint.toString()))
      const translated = text(record(result.responseData).translatedText)
      if (translated) cache.set(article.headline, translated)
    } catch {
      // The original headline remains visible when translation is unavailable.
    }
  }))
  try {
    localStorage.setItem('wc-news-translations', JSON.stringify([...cache.entries()].slice(-30)))
  } catch {
    // Live data should still render when storage is unavailable.
  }
  return articles.map((article) => ({ ...article, headline_zh: article.headline_zh || cache.get(article.headline) || '' }))
}

export async function loadLiveData(teams: TeamData[]): Promise<LiveData> {
  try {
    const [scoreboard, news] = await Promise.all([
      fetchJson(`${SCOREBOARD_API}?limit=100&dates=${dateRange()}`),
      fetchJson(NEWS_API),
    ])
    return {
      generated_at_utc: new Date().toISOString(),
      source: 'live',
      matches: parseMatches(scoreboard, teams),
      articles: await translateArticles(parseArticles(news, teams)),
    }
  } catch {
    const snapshot = await fetchJson(SNAPSHOT_URL) as LiveData
    return {
      ...snapshot,
      source: 'snapshot',
      articles: await translateArticles(snapshot.articles),
    }
  }
}
