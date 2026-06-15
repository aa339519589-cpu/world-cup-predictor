import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildPrediction, predictionToJson } from '../src/api/predictions'
import type { OddsData } from '../src/engineTypes'
import type { LiveData, WorldCupData } from '../src/types'

const root = resolve(import.meta.dirname, '..')
const publicDir = resolve(root, 'public')
const apiDir = resolve(publicDir, 'api')

const data = JSON.parse(await readFile(resolve(publicDir, 'world-cup-data.json'), 'utf8')) as WorldCupData
const live = JSON.parse(await readFile(resolve(publicDir, 'live-data.json'), 'utf8')) as LiveData
const odds = JSON.parse(await readFile(resolve(publicDir, 'odds-data.json'), 'utf8')) as OddsData

const predictions = live.matches.flatMap((match) => {
  if (match.state === 'post') return []
  const home = data.teams.find((team) => team.code === match.home.code)
  const away = data.teams.find((team) => team.code === match.away.code)
  if (!home || !away) return []
  return [predictionToJson(buildPrediction({
    data,
    live,
    odds,
    home,
    away,
    match,
    stage: 'group',
    now: new Date(live.generated_at_utc),
  }))]
})

await mkdir(apiDir, { recursive: true })
await Promise.all([
  writeFile(resolve(apiDir, 'predictions.json'), JSON.stringify({
    generated_at_utc: live.generated_at_utc,
    count: predictions.length,
    predictions,
  }, null, 2)),
  writeFile(resolve(apiDir, 'matches.json'), JSON.stringify(live, null, 2)),
  writeFile(resolve(apiDir, 'odds.json'), JSON.stringify(odds, null, 2)),
])
console.log(`Wrote static API with ${predictions.length} active predictions`)
