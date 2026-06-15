import type { LiveMatch } from '../types'

export function findMatch(matches: LiveMatch[], homeCode: string, awayCode: string) {
  return matches.find((match) =>
    match.state !== 'post' &&
    match.home.code === homeCode &&
    match.away.code === awayCode
  )
}
