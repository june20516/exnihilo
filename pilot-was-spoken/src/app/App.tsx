import { RallySandbox } from './RallySandbox'
import { RunScreen } from './RunScreen'
import { Stage } from './Stage'

const params = new URLSearchParams(window.location.search)

function readInitialSeed(): number {
  const param = params.get('seed')
  const parsed = param === null ? Number.NaN : Number.parseInt(param, 10)
  return Number.isFinite(parsed) ? parsed : Date.now() % 1_000_000_000
}

/** 개발 빌드에서만: 새 전투마다 적 HP를 이 값으로 만든다(e2e용). */
function readDebugEnemyHp(): number | null {
  if (!import.meta.env.DEV) return null
  const parsed = Number.parseInt(params.get('debugEnemyHp') ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export default function App() {
  const seed = readInitialSeed()
  return (
    <Stage>
      {params.get('mode') === 'rally' ? <RallySandbox initialSeed={seed} /> : <RunScreen seed={seed} debugEnemyHp={readDebugEnemyHp()} />}
    </Stage>
  )
}
