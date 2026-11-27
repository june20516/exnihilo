import { useCallback, useMemo, useState } from 'react'
import { LINEUP } from '@/content/lineup'
import { TALK_SHOW } from '@/content/talkShow'
import { TUNABLES, TUNING, TUNING_CONSTRAINTS, TUNING_STORAGE_KEY } from '@/content/tuning'
import { browserStorage } from '@/content/tuningSource'
import {
  hasPendingValues,
  storedBroadcastValues,
  TuningPanel,
  useTuningHotkey,
  type TuningStorage,
} from '@/kit/tuning'
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

/** 불러올 때 버린 저장값이나 읽기 오류가 있으면 조용히 넘기지 않고 패널을 연 채로 시작한다 */
const TUNING_HAS_PROBLEM = TUNING.rejected.length > 0 || TUNING.storageError !== null

/**
 * 조정값은 모듈을 불러올 때 한 번 풀리므로(TUNING) 같은 페이지에서 다시 시작하면 지금 방송 값을 그대로 쓴다.
 * 저장된 다음 방송 값이 지금 방송 값과 다르면 페이지를 다시 불러와야 패널의 "다음 방송부터"가 사실이 된다.
 */
function tuningNeedsReload(storage: TuningStorage | null): boolean {
  const next = storedBroadcastValues(TUNABLES, storage, TUNING_STORAGE_KEY, TUNING_CONSTRAINTS)
  return hasPendingValues(TUNABLES, next, TUNING.values)
}

export default function App() {
  const [run, setRun] = useState<Run>(() => ({ id: 0, seed: nextSeed() }))
  const [tuningOpen, setTuningOpen] = useTuningHotkey(TUNING_HAS_PROBLEM)
  const tuningStorage = useMemo(() => browserStorage(), [])
  const closeTuning = useCallback(() => setTuningOpen(false), [setTuningOpen])
  const setup = useMemo<BroadcastSetup>(
    () => ({ show: TALK_SHOW, ...LINEUP, seed: run.seed }),
    [run],
  )
  const restart = (): void => {
    // 다시 불러와도 주소(?seed= 등)는 그대로라 같은 시드 규칙으로 시작한다
    if (tuningNeedsReload(tuningStorage)) {
      window.location.reload()
      return
    }
    setRun((current) => ({ id: current.id + 1, seed: nextSeed() }))
  }
  return (
    <>
      <BroadcastScreen key={run.id} setup={setup} onRestart={restart} />
      {tuningOpen && (
        <TuningPanel
          defs={TUNABLES}
          applied={TUNING.values}
          rejected={TUNING.rejected}
          storage={tuningStorage}
          storageKey={TUNING_STORAGE_KEY}
          loadError={TUNING.storageError}
          constraints={TUNING_CONSTRAINTS}
          onClose={closeTuning}
        />
      )}
    </>
  )
}
