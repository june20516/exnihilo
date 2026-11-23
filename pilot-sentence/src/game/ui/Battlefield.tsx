import type { Entity } from '@/kit/core/entity'
import type { InterventionStep } from '@/game/content/encounters'
import { EntityCard } from './EntityCard'
import { IntentBadge } from './IntentBadge'

interface BattlefieldProps {
  entities: readonly Entity[]
  portraits: Readonly<Record<string, string>>
  intent: InterventionStep | null
}

export function Battlefield({ entities, portraits, intent }: BattlefieldProps) {
  const allies = entities.filter((e) => e.side === 'ally')
  const enemies = entities.filter((e) => e.side === 'enemy')
  return (
    <section className="relative flex aspect-[16/6] w-full flex-col justify-between overflow-hidden rounded-xl p-6 shadow-2xl">
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center opacity-40 mix-blend-luminosity"
        style={{ backgroundImage: 'url(/assets/bg-cavern.jpg)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/50 to-transparent" />
      <div className="relative z-10 flex justify-end">{intent && <IntentBadge step={intent} />}</div>
      <div className="relative z-10 flex items-end justify-between">
        <div className="flex items-end gap-4">
          {allies.map((e) => (
            <EntityCard key={e.id} entity={e} portrait={portraits[e.defId] ?? null} align="left" />
          ))}
        </div>
        <div className="flex items-end gap-4">
          {enemies.map((e) => (
            <EntityCard key={e.id} entity={e} portrait={portraits[e.defId] ?? null} align="right" />
          ))}
        </div>
      </div>
    </section>
  )
}
