import type { FinalHp, IntentAction } from '@/game/rally/summary'
import type { Entity } from '@/kit/core/entity'
import { EntityCard } from './EntityCard'

interface BattlefieldProps {
  entities: readonly Entity[]
  portraits: Readonly<Record<string, string>>
  /** 내 문장의 빈 목적어가 가리키는 적. */
  targetId: string | null
  /** 적 id → 이번 턴 예고(문장과 행동). */
  intents: Readonly<Record<string, { readonly text: string; readonly actions: readonly IntentAction[] }>>
  /** 개체별 형용사 상태 표시(문구와 효과). */
  states: Readonly<Record<string, readonly { readonly text: string; readonly detail: string }[]>>
  /** 적을 눌러 대상을 바꾼다. 행동할 수 없을 때는 null. */
  onPickEnemy: ((entityId: string) => void) | null
  /** 개체 id → 낭독과 적의 차례를 거친 예상 HP. */
  projections: Readonly<Record<string, FinalHp>>
}

export function Battlefield({ entities, portraits, targetId, intents, states, onPickEnemy, projections }: BattlefieldProps) {
  const allies = entities.filter((e) => e.side === 'ally')
  const enemies = entities.filter((e) => e.side === 'enemy')
  return (
    <section
      data-testid="battlefield"
      className="relative flex items-end justify-between gap-4 overflow-hidden rounded-2xl px-5 pb-2 pt-2 shadow-2xl short:items-center short:gap-2 short:px-2 short:py-1.5"
    >
      <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: 'url(/assets/bg-cavern.jpg)' }} />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/50 to-surface-container-lowest/20" />
      <div className="relative z-10 flex items-end gap-3 short:items-center">
        {allies.map((e) => (
          <EntityCard key={e.id} entity={e} portrait={portraits[e.defId] ?? null} states={states[e.id]} projection={projections[e.id]} />
        ))}
      </div>
      <div className="relative z-10 flex min-w-0 items-end gap-3 short:flex-1 short:items-center short:justify-end short:gap-2">
        {enemies.map((e) => (
          <EntityCard
            key={e.id}
            entity={e}
            portrait={portraits[e.defId] ?? null}
            targeted={e.id === targetId && e.hp > 0}
            intent={intents[e.id]}
            states={states[e.id]}
            projection={projections[e.id]}
            onPick={onPickEnemy && e.hp > 0 ? () => onPickEnemy(e.id) : undefined}
          />
        ))}
      </div>
    </section>
  )
}
