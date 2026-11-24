import { blockText } from './describe'
import type { Entity, StatusKind } from '@/kit/core/entity'
import { Icon } from './Icon'

const STATUS_BADGES: { kind: StatusKind; icon: string; label: string; tone: string }[] = [
  { kind: 'block', icon: 'shield', label: '보호', tone: 'text-tertiary' },
  { kind: 'strength', icon: 'fitness_center', label: '힘', tone: 'text-secondary' },
  { kind: 'poison', icon: 'science', label: '독', tone: 'text-tertiary' },
  { kind: 'weak', icon: 'trending_down', label: '약화', tone: 'text-error' },
  { kind: 'vulnerable', icon: 'heart_broken', label: '취약', tone: 'text-error' },
  { kind: 'freeze', icon: 'bedtime', label: '빙결', tone: 'text-secondary' },
]

interface EntityCardProps {
  entity: Entity
  portrait: string | null
  /** 고를 수 있으면 클릭 핸들러가 주어진다(적: 대상 지정). */
  onPick?: () => void
  /** 지금 내 문장의 대상인 적. */
  targeted?: boolean
  /** 적이 이번 턴에 실행할 예고 문장. */
  intent?: string
  /** 낭독하면(또는 이미) 이 개체에 남는 형용사 상태. 예: '눈멂 · 적 차례까지'. */
  states?: readonly string[]
}

export function EntityCard({ entity, portrait, onPick, targeted = false, intent, states = [] }: EntityCardProps) {
  const dead = entity.hp <= 0
  const hpRatio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 0
  return (
    <button
      type="button"
      data-entity-id={entity.id}
      disabled={!onPick}
      onClick={onPick}
      className={`flex w-40 flex-col gap-1 rounded-xl p-1 text-left transition ${dead ? 'opacity-30 grayscale' : ''} ${
        targeted ? 'ring-2 ring-secondary shadow-[0_0_16px_rgba(252,186,91,0.6)]' : ''
      } ${onPick ? 'cursor-pointer hover:ring-2 hover:ring-secondary/60' : 'cursor-default'}`}
    >
      {intent !== undefined && !dead && (
        <span
          data-testid={`intent-${entity.id}`}
          className="rounded-md bg-error-container/70 px-2 py-1 text-center text-xs font-semibold leading-tight text-on-error-container shadow"
        >
          {intent}
        </span>
      )}
      <div
        data-portrait={entity.id}
        className="relative h-28 w-full overflow-hidden rounded-lg bg-surface-container shadow-xl"
      >
        {portrait ? (
          <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${portrait})` }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-outline">
            <Icon name="person_apron" className="text-5xl" />
          </div>
        )}
        <span className="absolute bottom-1 left-2 font-prose text-sm font-bold drop-shadow">{entity.name}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
        <div
          className={`h-full rounded-full transition-all duration-500 ${entity.side === 'enemy' ? 'bg-error' : 'bg-primary'}`}
          style={{ width: `${hpRatio * 100}%` }}
        />
      </div>
      <span data-testid={`hp-${entity.id}`} className="font-number text-sm">
        HP {entity.hp} / {entity.maxHp}
      </span>
      <div className="flex min-h-4 flex-wrap gap-x-2 font-ui text-[11px]">
        {STATUS_BADGES.filter((b) => entity.statuses[b.kind] > 0).map((b) => (
          <span
            key={b.kind}
            data-testid={b.kind === 'block' ? `block-${entity.id}` : undefined}
            className={`flex items-center gap-0.5 ${b.tone}`}
            title={b.label}
          >
            <Icon name={b.icon} className="text-[12px]" />
            {b.kind === 'block' ? blockText(entity.blockChunks) : `${b.label} ${entity.statuses[b.kind]}`}
          </span>
        ))}
      </div>
      {states.length > 0 && (
        <div data-testid={`states-${entity.id}`} className="flex flex-wrap gap-1 font-ui text-[11px]">
          {states.map((text) => (
            <span key={text} className="rounded bg-tertiary/20 px-1 text-tertiary">
              {text}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
