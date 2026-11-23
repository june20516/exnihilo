import type { WordDef } from '@/game/content/words'
import { describeWord } from './describe'
import { KIND_LABELS, KIND_STYLES } from './wordStyle'

interface WordTileProps {
  def: WordDef
  instanceId: string
  selected: boolean
  disabled: boolean
  onSelect: () => void
}

export function WordTile({ def, instanceId, selected, disabled, onSelect }: WordTileProps) {
  const style = KIND_STYLES[def.kind]
  return (
    <button
      type="button"
      data-testid={`tile-${def.id}`}
      data-instance-id={instanceId}
      onClick={onSelect}
      disabled={disabled}
      className={`flex h-52 w-40 flex-col justify-between rounded-xl bg-surface-container p-3 text-left shadow-lg transition-all duration-200
        ${selected ? '-translate-y-4 ring-2 ring-secondary shadow-2xl' : 'hover:-translate-y-2'}
        ${def.cost === null ? 'opacity-50' : ''} disabled:cursor-not-allowed`}
    >
      <div className="flex items-center justify-between">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary-container/60 font-label text-xs font-bold text-secondary">
          {def.cost ?? '✕'}
        </span>
        <span className={`rounded px-1.5 py-0.5 font-label text-[10px] font-bold ${style.tag}`}>{KIND_LABELS[def.kind]}</span>
      </div>
      <span className={`text-center font-headline text-2xl font-black tracking-tight ${style.text}`}>{def.text}</span>
      <p className="rounded bg-surface-container-lowest/60 p-1.5 text-xs leading-tight text-on-surface-variant">
        {describeWord(def)}
      </p>
    </button>
  )
}
