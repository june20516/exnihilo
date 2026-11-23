import type { Entity } from '@/kit/core/entity'
import { Icon } from './Icon'

interface EntityCardProps {
  entity: Entity
  portrait: string | null
  align: 'left' | 'right'
}

export function EntityCard({ entity, portrait, align }: EntityCardProps) {
  const hpRatio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 0
  const dead = entity.hp <= 0
  const isEnemy = entity.side === 'enemy'
  return (
    <div
      data-entity-id={entity.id}
      className={`flex items-end gap-4 ${align === 'right' ? 'flex-row-reverse text-right' : ''} ${dead ? 'opacity-40 grayscale' : ''}`}
    >
      <div
        data-portrait={entity.id}
        className="relative h-56 w-44 overflow-hidden rounded-xl bg-surface-container shadow-2xl"
      >
        {portrait ? (
          <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${portrait})` }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-6xl text-outline">
            <Icon name="person_apron" className="text-6xl" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/90 via-transparent to-transparent" />
      </div>
      <div className={`flex w-56 flex-col gap-1.5 pb-2 ${align === 'right' ? 'items-end' : ''}`}>
        <span className="font-headline text-lg font-bold">{entity.name}</span>
        <div className="w-full rounded-full bg-surface-container-lowest p-1 shadow-inner">
          <div className="h-3 overflow-hidden rounded-full bg-surface-container-high">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isEnemy
                  ? 'bg-gradient-to-r from-error to-primary-container'
                  : 'bg-gradient-to-r from-primary-container to-primary'
              }`}
              style={{ width: `${hpRatio * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-3 font-label text-sm">
          <span data-testid={`hp-${entity.id}`} className="flex items-center gap-1">
            <Icon name="favorite" className="text-[14px] text-primary" />
            {entity.hp} / {entity.maxHp}
          </span>
          {entity.statuses.block > 0 && (
            <span className="flex items-center gap-1 text-tertiary">
              <Icon name="shield" className="text-[14px]" />
              보호 {entity.statuses.block}
            </span>
          )}
          {entity.statuses.poison > 0 && (
            <span className="flex items-center gap-1 text-tertiary">
              <Icon name="science" className="text-[14px]" />독 {entity.statuses.poison}
            </span>
          )}
          {entity.statuses.freeze > 0 && (
            <span className="flex items-center gap-1 text-secondary">
              <Icon name="bedtime" className="text-[14px]" />
              잠듦
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
