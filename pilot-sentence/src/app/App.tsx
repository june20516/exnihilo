import { RallySandbox } from './RallySandbox'

const params = new URLSearchParams(window.location.search)

function readInitialSeed(): number {
  const param = params.get('seed')
  const parsed = param === null ? Number.NaN : Number.parseInt(param, 10)
  return Number.isFinite(parsed) ? parsed : Date.now() % 1_000_000_000
}

export default function App() {
  const seed = readInitialSeed()
  if (params.get('mode') === 'rally') return <RallySandbox initialSeed={seed} />
  // 런 화면은 다음 단계에서 채운다.
  return <div data-testid="run-screen" />
}
