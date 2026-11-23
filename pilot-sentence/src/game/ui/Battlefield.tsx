import type { Entity } from '@/kit/core/entity'
import { EntityCard } from './EntityCard'

interface BattlefieldProps {
  entities: readonly Entity[]
  portraits: Readonly<Record<string, string>>
  /** 대상 선택 모드면 고를 수 있는 적을 누를 때 호출된다. */
  onPickEnemy: ((entityId: string) => void) | null
}

export function Battlefield({ entities, portraits, onPickEnemy }: BattlefieldProps) {
  const allies = entities.filter((e) => e.side === 'ally')
  const enemies = entities.filter((e) => e.side === 'enemy')
  return (
    <section className="relative flex items-end justify-between overflow-hidden rounded-xl px-6 pb-2 pt-3 shadow-2xl">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-luminosity"
        style={{ backgroundImage: 'url(/assets/bg-cavern.jpg)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/40 to-transparent" />
      <div className="relative z-10 flex items-end gap-3">
        {allies.map((e) => (
          <EntityCard key={e.id} entity={e} portrait={portraits[e.defId] ?? null} />
        ))}
      </div>
      {onPickEnemy && (
        <span className="relative z-10 self-center rounded-lg bg-secondary px-3 py-1 font-label text-sm font-bold text-on-secondary">
          지목할 적을 고르세요
        </span>
      )}
      <div className="relative z-10 flex items-end gap-3">
        {enemies.map((e) => (
          <EntityCard
            key={e.id}
            entity={e}
            portrait={portraits[e.defId] ?? null}
            onPick={onPickEnemy && e.hp > 0 ? () => onPickEnemy(e.id) : undefined}
          />
        ))}
      </div>
    </section>
  )
}
