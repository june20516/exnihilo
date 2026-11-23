import { useDraggable } from '@dnd-kit/core'
import type { WordDef } from '@/game/content/words'
import { describeWord } from './describe'
import { KIND_LABELS, KIND_STYLES } from './wordStyle'

interface WordTileProps {
  def: WordDef
  instanceId: string
  selected: boolean
  disabled: boolean
  /** 현재 문장 어디에도 놓을 수 없으면 false (문형 불일치 등). */
  playable: boolean
  onSelect: () => void
}

export function WordTile({ def, instanceId, selected, disabled, playable, onSelect }: WordTileProps) {
  const style = KIND_STYLES[def.kind]
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: instanceId,
    disabled: disabled || !playable,
  })
  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(-4deg)`, zIndex: 60 }
    : undefined
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`tile-${def.id}`}
      data-instance-id={instanceId}
      onClick={onSelect}
      disabled={disabled}
      style={dragStyle}
      {...attributes}
      {...listeners}
      className={`flex h-40 w-32 flex-col justify-between rounded-xl bg-surface-container p-2 text-left shadow-lg
        ${isDragging ? 'shadow-2xl ring-2 ring-secondary' : 'transition-all duration-200'}
        ${selected && !isDragging ? '-translate-y-2 ring-2 ring-secondary shadow-2xl' : 'hover:-translate-y-1'}
        ${playable ? '' : 'opacity-50'} disabled:cursor-not-allowed`}
    >
      <div className="flex items-center justify-between">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary-container/60 font-label text-xs font-bold text-secondary">
          {def.cost ?? '✕'}
        </span>
        <span className={`rounded px-1.5 py-0.5 font-label text-[10px] font-bold ${style.tag}`}>
          {KIND_LABELS[def.kind]}
        </span>
      </div>
      <span className={`text-center font-headline text-lg font-black leading-tight tracking-tight ${style.text}`}>
        {def.text}
      </span>
      <p className="rounded bg-surface-container-lowest/60 p-1 text-[11px] leading-tight text-on-surface-variant">
        {describeWord(def)}
        {!playable && def.cost !== null && (
          <span className="mt-1 block text-error" data-testid="unplayable-note">
            이 문장에서는 쓸 수 없다
          </span>
        )}
      </p>
    </button>
  )
}
