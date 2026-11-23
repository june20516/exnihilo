import type { Entity } from '@/kit/core/entity'
import { EntityCard } from './EntityCard'

interface BattlefieldProps {
  entities: readonly Entity[]
  portraits: Readonly<Record<string, string>>
  /** 내 문장의 빈 목적어가 가리키는 적. */
  targetId: string | null
  /** 적 id → 이번 턴 예고 문장. */
  intents: Readonly<Record<string, string>>
  /** 개체별 형용사 상태 표시(rally/text의 lingeringTexts). */
  states: Readonly<Record<string, readonly string[]>>
  /** 적을 눌러 대상을 바꾼다. 행동할 수 없을 때는 null. */
  onPickEnemy: ((entityId: string) => void) | null
}

export function Battlefield({ entities, portraits, targetId, intents, states, onPickEnemy }: BattlefieldProps) {
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
          <EntityCard key={e.id} entity={e} portrait={portraits[e.defId] ?? null} states={states[e.id]} />
        ))}
      </div>
      <div className="relative z-10 flex items-end gap-3">
        {enemies.map((e) => (
          <EntityCard
            key={e.id}
            entity={e}
            portrait={portraits[e.defId] ?? null}
            targeted={e.id === targetId && e.hp > 0}
            intent={intents[e.id]}
            states={states[e.id]}
            onPick={onPickEnemy && e.hp > 0 ? () => onPickEnemy(e.id) : undefined}
          />
        ))}
      </div>
    </section>
  )
}
