import type { LiveMatch } from '../types'
import type { SourceStatus, WeatherData } from '../engineTypes'
import { ageMinutes } from '../utils/dataFreshness'
import { readCache, writeCache } from '../utils/cache'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {}
}

function list(value: unknown) {
  return Array.isArray(value) ? value : []
}

export async function loadWeather(match: LiveMatch): Promise<WeatherData> {
  if (!match.city || match.state === 'post') {
    return { status: 'not_available', updatedAt: '', detail: '没有可用的未来比赛地点。' }
  }
  const cacheKey = `weather:${match.city}:${match.date_utc.slice(0, 13)}`
  const cached = readCache<WeatherData>(cacheKey)
  if (cached && Date.now() - new Date(cached.updatedAt).getTime() < 30 * 60_000) return cached

  try {
    const cityQuery = match.city.split(',')[0].trim()
    const geocode = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=zh&name=${encodeURIComponent(cityQuery)}`)
    if (!geocode.ok) throw new Error(`geocode ${geocode.status}`)
    const place = record(list(record(await geocode.json()).results)[0])
    const latitude = Number(place.latitude)
    const longitude = Number(place.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('location missing')

    const day = match.date_utc.slice(0, 10)
    const endpoint = new URL('https://api.open-meteo.com/v1/forecast')
    endpoint.searchParams.set('latitude', String(latitude))
    endpoint.searchParams.set('longitude', String(longitude))
    endpoint.searchParams.set('hourly', 'temperature_2m,precipitation_probability,wind_speed_10m,weather_code')
    endpoint.searchParams.set('start_date', day)
    endpoint.searchParams.set('end_date', day)
    endpoint.searchParams.set('timezone', 'UTC')
    const response = await fetch(endpoint)
    if (!response.ok) throw new Error(`forecast ${response.status}`)
    const hourly = record(record(await response.json()).hourly)
    const times = list(hourly.time).map(String)
    const target = match.date_utc.slice(0, 13)
    const index = Math.max(0, times.findIndex((value) => value.startsWith(target)))
    const result: WeatherData = {
      status: 'success',
      updatedAt: new Date().toISOString(),
      temperatureC: Number(list(hourly.temperature_2m)[index]),
      precipitationProbability: Number(list(hourly.precipitation_probability)[index]),
      windKph: Number(list(hourly.wind_speed_10m)[index]),
      weatherCode: Number(list(hourly.weather_code)[index]),
      detail: `${match.city} 比赛时段公开预报`,
    }
    writeCache(cacheKey, result)
    return result
  } catch {
    return {
      status: 'failed',
      updatedAt: new Date().toISOString(),
      detail: 'Open-Meteo 当前未返回有效预报，天气不参与计算。',
    }
  }
}

export function weatherSource(weather: WeatherData | undefined, weight: number): SourceStatus {
  return {
    id: 'open-meteo',
    label: 'Open-Meteo',
    category: '天气',
    status: weather?.status === 'success' ? 'success' : weather?.status === 'failed' ? 'failed' : weather?.status === 'loading' ? 'projected' : 'not_configured',
    updatedAt: weather?.updatedAt ?? '',
    ageMinutes: weather?.updatedAt ? ageMinutes(weather.updatedAt) : null,
    weight,
    participated: weather?.status === 'success',
    detail: weather?.detail || '自定义对阵没有具体球场和时间，天气不可用。',
  }
}
