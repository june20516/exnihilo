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
  /** 대상 선택 모드에서 고를 수 있으면 클릭 핸들러가 주어진다. */
  onPick?: () => void
}

export function EntityCard({ entity, portrait, onPick }: EntityCardProps) {
  const dead = entity.hp <= 0
  const hpRatio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 0
  return (
    <button
      type="button"
      data-entity-id={entity.id}
      disabled={!onPick}
      onClick={onPick}
      className={`flex w-40 flex-col gap-1 rounded-xl p-1 text-left transition ${dead ? 'opacity-30 grayscale' : ''} ${
        onPick ? 'cursor-pointer ring-2 ring-secondary shadow-[0_0_16px_rgba(252,186,91,0.6)]' : 'cursor-default'
      }`}
    >
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
        <span className="absolute bottom-1 left-2 font-headline text-sm font-bold drop-shadow">{entity.name}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
        <div
          className={`h-full rounded-full transition-all duration-500 ${entity.side === 'enemy' ? 'bg-error' : 'bg-primary'}`}
          style={{ width: `${hpRatio * 100}%` }}
        />
      </div>
      <span data-testid={`hp-${entity.id}`} className="font-label text-xs">
        HP {entity.hp} / {entity.maxHp}
      </span>
      <div className="flex min-h-4 flex-wrap gap-x-2 font-label text-[11px]">
        {STATUS_BADGES.filter((b) => entity.statuses[b.kind] > 0).map((b) => (
          <span key={b.kind} className={`flex items-center gap-0.5 ${b.tone}`} title={b.label}>
            <Icon name={b.icon} className="text-[12px]" />
            {b.label} {entity.statuses[b.kind]}
          </span>
        ))}
      </div>
    </button>
  )
}
