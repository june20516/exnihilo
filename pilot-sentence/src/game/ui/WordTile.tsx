import { useDraggable } from '@dnd-kit/core'
import type { WordDef } from '@/game/content/words'
import type { CardFacts } from './describe'
import { Icon } from './Icon'
import { ICONS, TONES } from './icons'
import { KIND_LABELS, KIND_STYLES } from './wordStyle'

/** 카드 색 계열(공격·지원·수식어 등)을 본문 윗선 색으로 보인다. */
const TONE_BORDER: Readonly<Record<CardFacts['tone'], string>> = {
  attack: 'border-error', support: 'border-tertiary', modifier: 'border-secondary', target: 'border-primary', other: 'border-outline-variant',
}

interface WordTileProps {
  def: WordDef
  /** 카드 본문에 그릴 효과(강화 반영). */
  facts: CardFacts
  instanceId: string
  selected: boolean
  /** 버리기 모드에서 버릴 카드로 표시됨. */
  marked: boolean
  disabled: boolean
  /** 버리기 모드에서는 끌 수 없다(클릭으로 표시만). */
  draggable: boolean
  /** 현재 문장 어디에도 놓을 수 없으면 false (문형 불일치 등). */
  playable: boolean
  onSelect: () => void
  /** 기본값은 tile-{단어 id}. 기본 동사 타일처럼 따로 찾아야 하면 지정한다. */
  testId?: string
}

export function WordTile({ def, facts, instanceId, selected, marked, disabled, draggable, playable, onSelect, testId }: WordTileProps) {
  const style = KIND_STYLES[def.kind]
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: instanceId,
    disabled: disabled || !playable || !draggable,
  })
  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(-4deg)`, zIndex: 60 }
    : undefined
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={testId ?? `tile-${def.id}`}
      data-instance-id={instanceId}
      data-selected={selected}
      onClick={onSelect}
      disabled={disabled}
      style={dragStyle}
      {...attributes}
      {...listeners}
      // 드래그를 꺼도(버리기 모드) 클릭은 받는다: dnd-kit의 aria-disabled를 실제 비활성 여부로 덮어쓴다.
      aria-disabled={disabled}
      className={`flex h-40 w-32 flex-col justify-between rounded-xl bg-surface-container p-2 text-left shadow-lg
        ${isDragging ? 'shadow-2xl ring-2 ring-secondary' : 'transition-all duration-200'}
        ${selected && !isDragging ? '-translate-y-2 ring-2 ring-secondary shadow-2xl' : 'hover:-translate-y-1'}
        ${marked ? '-translate-y-2 ring-2 ring-error' : ''}
        ${playable ? '' : 'opacity-50'} disabled:cursor-not-allowed`}
    >
      <div className="flex items-center justify-between">
        <span className="font-ui text-[10px] text-error">{def.kind === 'junk' ? '낼 수 없음' : ''}</span>
        <span className={`rounded px-1.5 py-0.5 font-ui text-[10px] font-bold ${style.tag}`}>
          {KIND_LABELS[def.kind]}
        </span>
      </div>
      <span data-word-text className={`text-center font-card text-lg font-black leading-tight tracking-tight ${style.text}`}>
        {def.text}
      </span>
      <p className={`flex flex-col gap-0.5 rounded border-t-2 bg-surface-container-lowest/60 p-1 text-[11px] leading-tight text-on-surface-variant ${TONE_BORDER[facts.tone]}`}>
        {facts.facts.map((f, i) => (
          <span key={i} className={`flex items-center gap-0.5 ${TONES[f.kind] ?? ''}`}>
            <Icon name={ICONS[f.kind]} className="text-[12px]" />
            <span className="truncate">{f.text}</span>
          </span>
        ))}
        {facts.badges.length > 0 && (
          <span className="flex flex-wrap gap-0.5">
            {facts.badges.map((b) => (
              <span key={b} className="rounded bg-surface-container-high px-1 text-[10px] text-on-surface">{b}</span>
            ))}
          </span>
        )}
        {!playable && def.kind !== 'junk' && (
          <span className="mt-1 block text-error" data-testid="unplayable-note">
            이 문장에서는 쓸 수 없다
          </span>
        )}
      </p>
    </button>
  )
}
