import { useMemo, useState } from 'react'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import type { BroadcastSetup } from '@/sim/engine'
import { BroadcastScreen } from './BroadcastScreen'

interface Run {
  id: number
  seed: number
}

/** URL의 ?seed=정수로 시드를 고정한다(테스트와 재현용). 없으면 null. */
function seedFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get('seed')
  if (raw === null) return null
  const seed = Number(raw)
  return Number.isInteger(seed) ? seed : null
}

function nextSeed(): number {
  return seedFromUrl() ?? Date.now()
}

export default function App() {
  const [run, setRun] = useState<Run>(() => ({ id: 0, seed: nextSeed() }))
  const setup = useMemo<BroadcastSetup>(
    () => ({ show: TALK_SHOW, ...LINEUP, seed: run.seed }),
    [run],
  )
  const restart = (): void => setRun((current) => ({ id: current.id + 1, seed: nextSeed() }))
  return <BroadcastScreen key={run.id} setup={setup} onRestart={restart} />
}
