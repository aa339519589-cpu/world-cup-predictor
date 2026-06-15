import type { LiveMatch } from '../types'

export function refreshInterval(matches: LiveMatch[], now = Date.now()) {
  const next = matches
    .filter((match) => match.state !== 'post')
    .map((match) => new Date(match.date_utc).getTime())
    .filter((time) => time >= now)
    .sort((left, right) => left - right)[0]
  if (matches.some((match) => match.state === 'in')) return 60_000
  if (next && next - now <= 3 * 60 * 60_000) return 3 * 60_000
  return 10 * 60_000
}
