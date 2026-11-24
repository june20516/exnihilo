import type { FinalHp, IntentAction } from '@/game/rally/summary'
import { intentActionText } from './intentText'
import { ICONS, TONES } from './icons'
import { Tooltip } from './Tooltip'
import { blockText } from './describe'
import type { Entity, StatusKind } from '@/kit/core/entity'
import { Icon } from './Icon'

/** 상태 배지: 이름과, 툴팁으로 보일 뜻(지속 포함). 아이콘·색은 ui/icons.ts. */
const STATUS_BADGES: { kind: StatusKind; label: string; meaning: string }[] = [
  { kind: 'block', label: '보호', meaning: '받는 피해를 먼저 막는다. 덩어리마다 남은 턴이 지나면 자기 차례 시작에 사라진다.' },
  { kind: 'strength', label: '힘', meaning: '주는 피해에 힘만큼 더한다. 전투 내내 유지된다.' },
  { kind: 'poison', label: '독', meaning: '차례가 끝날 때 독만큼 HP를 잃고(보호 무시) 독이 1 준다.' },
  { kind: 'weak', label: '약화', meaning: '주는 피해 ×0.75. 차례가 끝날 때마다 1 준다.' },
  { kind: 'vulnerable', label: '취약', meaning: '받는 피해 ×1.5. 차례가 끝날 때마다 1 준다.' },
  { kind: 'freeze', label: '빙결', meaning: '다음 행동 하나를 하지 못한다(기어이로 무시).' },
]

interface EntityCardProps {
  entity: Entity
  portrait: string | null
  /** 고를 수 있으면 클릭 핸들러가 주어진다(적: 대상 지정). */
  onPick?: () => void
  /** 지금 내 문장의 대상인 적. */
  targeted?: boolean
  /** 적이 이번 턴에 실행할 예고: 문장과 행동(엔진이 계산한 수치). */
  intent?: { readonly text: string; readonly actions: readonly IntentAction[] }
  /** 낭독하면(또는 이미) 이 개체에 남는 형용사 상태. text 예: '눈멂 · 적 차례까지', detail은 그 형용사의 효과. */
  states?: readonly { readonly text: string; readonly detail: string }[]
  /** 낭독과 이어지는 적의 차례를 거친 예상 HP. 변화가 없으면 없다. */
  projection?: FinalHp
}

/** 오른쪽 열에 놓일 칸(낮은 화면에서 초상화 옆으로 간다). */
const SIDE = 'short:col-start-2 min-w-0'

/**
 * 개체 카드. 데스크탑은 예고 → 큰 초상화 → HP 막대 → HP 줄 → 상태의 세로 카드,
 * 낮은 화면(모바일 가로)은 초상화를 왼쪽에 두고 나머지를 오른쪽에 쌓는 가로 카드다(같은 DOM, grid 배치만 바뀐다).
 */
export function EntityCard({ entity, portrait, onPick, targeted = false, intent, states = [], projection }: EntityCardProps) {
  const dead = entity.hp <= 0
  const ally = entity.side === 'ally'
  const ratio = (hp: number) => (entity.maxHp > 0 ? Math.max(0, Math.min(hp, entity.maxHp)) / entity.maxHp : 0)
  const now = ratio(entity.hp)
  const after = projection ? ratio(projection.after) : now
  const barColor = ally ? 'bg-primary' : 'bg-error'
  const ghostColor = ally ? '#ffb3ae' : '#ffb4ab'
  const changes = projection !== undefined && projection.after !== entity.hp
  return (
    <button
      type="button"
      data-entity-id={entity.id}
      disabled={!onPick}
      onClick={onPick}
      className={`grid min-w-0 grid-cols-1 content-end gap-1.5 rounded-xl p-1.5 text-left transition short:grid-cols-[96px_minmax(0,1fr)] short:items-center short:gap-x-2 short:gap-y-1 short:bg-surface-container-low/85 ${
        ally ? 'w-56 short:w-72' : 'w-52 short:w-auto short:max-w-[300px] short:flex-1'
      } ${dead ? 'opacity-30 grayscale' : ''} ${targeted ? 'ring-[3px] ring-secondary shadow-[0_0_18px_rgba(252,186,91,0.55)]' : ''} ${
        onPick ? 'cursor-pointer hover:ring-2 hover:ring-secondary/60' : 'cursor-default'
      }`}
    >
      {intent !== undefined && !dead && (
        <span
          data-testid={`intent-${entity.id}`}
          className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg bg-error-container/85 px-2 py-1 text-on-error-container shadow ${SIDE}`}
        >
          <span className="font-prose text-sm font-semibold leading-tight [word-break:keep-all]">{intent.text}</span>
          {intent.actions.map((a, i) => (
            <span key={i} className="flex items-center gap-0.5 whitespace-nowrap font-ui text-[13px] font-bold text-error">
              <Icon name={ICONS[a.kind]} className="text-[15px]" />
              {intentActionText(a)}
            </span>
          ))}
        </span>
      )}
      <div
        data-portrait={entity.id}
        className={`relative w-full overflow-hidden rounded-lg bg-surface-container shadow-xl short:col-start-1 short:row-span-5 short:row-start-1 short:h-24 short:w-24 ${
          ally ? 'h-32' : 'h-28'
        }`}
      >
        {portrait ? (
          <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${portrait})` }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-outline">
            <Icon name="person_apron" className="text-5xl" />
          </div>
        )}
        <span className="absolute bottom-1 left-2 font-prose text-base font-bold drop-shadow-[0_2px_4px_#000] short:hidden">{entity.name}</span>
        {targeted && (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 font-ui text-xs font-bold text-on-secondary">
            <Icon name={ICONS.target} className="text-[14px]" />
            대상
          </span>
        )}
      </div>
      <span className={`hidden font-prose text-sm font-bold short:block ${SIDE}`}>{entity.name}</span>
      <div className={`flex h-2 overflow-hidden rounded-full bg-surface-container-high ${SIDE}`}>
        <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.min(now, after) * 100}%` }} />
        <div
          className="h-full"
          style={{
            width: `${Math.abs(now - after) * 100}%`,
            background: `repeating-linear-gradient(45deg, ${ghostColor}99, ${ghostColor}99 4px, transparent 4px, transparent 8px)`,
          }}
        />
      </div>
      <span className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${SIDE}`}>
        <Icon name="favorite" className={`text-[16px] ${ally ? 'text-primary' : 'text-error'}`} />
        <span data-testid={`hp-${entity.id}`} className="font-number text-base">
          {entity.hp} / {entity.maxHp}
        </span>
        {changes && projection && (
          <span data-testid={`hp-after-${entity.id}`} className="font-number text-base text-secondary">
            → {projection.after}
          </span>
        )}
        {projection?.died && !dead && (
          <span className="flex items-center gap-0.5 rounded bg-error-container px-1 font-ui text-[11px] text-on-error-container">
            <Icon name="skull" className="text-[13px]" />
            처치
          </span>
        )}
      </span>
      {(STATUS_BADGES.some((b) => entity.statuses[b.kind] > 0) || states.length > 0) && (
        <div className={`flex flex-wrap gap-1 font-ui text-xs ${SIDE}`}>
          {STATUS_BADGES.filter((b) => entity.statuses[b.kind] > 0).map((b) => (
            <Tooltip key={b.kind} testId={`status-${entity.id}-${b.kind}`} content={<><b>{b.label}</b> — {b.meaning}</>}>
              <span
                data-testid={b.kind === 'block' ? `block-${entity.id}` : undefined}
                className={`flex items-center gap-0.5 rounded bg-surface-container-highest/80 px-1 ${TONES[b.kind] ?? ''}`}
              >
                <Icon name={ICONS[b.kind]} className="text-[13px]" />
                {b.kind === 'block' ? blockText(entity.blockChunks) : `${b.label} ${entity.statuses[b.kind]}`}
              </span>
            </Tooltip>
          ))}
          {states.length > 0 && (
            <span data-testid={`states-${entity.id}`} className="flex flex-wrap gap-1">
              {states.map((s) => (
                <Tooltip key={s.text} content={<><b>{s.text}</b> — {s.detail}</>}>
                  <span data-state className="flex items-center gap-0.5 rounded bg-tertiary/20 px-1 text-tertiary">
                    <Icon name="schedule" className="text-[13px]" />
                    {s.text}
                  </span>
                </Tooltip>
              ))}
            </span>
          )}
        </div>
      )}
    </button>
  )
}
