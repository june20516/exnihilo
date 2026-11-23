import { CombatScreen } from '@/game/ui/CombatScreen'

function readSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed')
  const parsed = param === null ? Number.NaN : Number.parseInt(param, 10)
  return Number.isFinite(parsed) ? parsed : Date.now() % 1_000_000_000
}

export default function App() {
  return (
    <main className="min-h-screen bg-surface-container-lowest">
      <CombatScreen encounterId="spider" seed={readSeed()} />
    </main>
  )
}
