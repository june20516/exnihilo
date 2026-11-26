import { useState, type ReactElement } from 'react'
import {
  changedValues,
  readOverrides,
  resolveTuning,
  writeOverrides,
  type RejectedOverride,
  type TunableDef,
  type TuningStorage,
  type TuningValues,
} from './tuning'

export interface TuningPanelProps {
  defs: readonly TunableDef[]
  /** 지금 방송(페이지를 불러올 때)에 쓰인 값 */
  applied: TuningValues
  /** 페이지를 불러올 때 버려진 저장값 */
  rejected: readonly RejectedOverride[]
  storage: TuningStorage | null
  storageKey: string
  onClose(): void
}

const REJECT_REASON_TEXT: Record<RejectedOverride['reason'], string> = {
  unknownKey: '모르는 항목',
  notNumber: '숫자가 아님',
  outOfRange: '범위 밖',
  notObject: '저장 형식이 잘못됨',
}

/** 처음 열 때의 편집값: applied 위에 저장된 바뀐 값을 덮는다 */
function initialValues(
  defs: readonly TunableDef[],
  applied: TuningValues,
  storage: TuningStorage | null,
  storageKey: string,
): TuningValues {
  const { overrides } = readOverrides(storage, storageKey)
  const saved = resolveTuning(defs, overrides).values
  const changedKeys = Object.keys(changedValues(defs, saved))
  const values: Record<string, number> = { ...applied }
  for (const key of changedKeys) values[key] = saved[key]
  return values
}

function groupDefs(defs: readonly TunableDef[]): [group: string, items: TunableDef[]][] {
  const groups = new Map<string, TunableDef[]>()
  for (const def of defs) groups.set(def.group, [...(groups.get(def.group) ?? []), def])
  return [...groups.entries()]
}

export function TuningPanel({
  defs,
  applied,
  rejected,
  storage,
  storageKey,
  onClose,
}: TuningPanelProps): ReactElement {
  const [values, setValues] = useState<TuningValues>(() =>
    initialValues(defs, applied, storage, storageKey),
  )
  /** 숫자 입력 칸에 사용자가 치고 있는 글자 */
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({})
  const [warnings, setWarnings] = useState<Readonly<Record<string, string>>>({})
  const [errorText, setErrorText] = useState<string | null>(null)

  function commit(next: TuningValues): void {
    setValues(next)
    if (storage === null) return
    setErrorText(writeOverrides(storage, storageKey, changedValues(defs, next)))
  }

  function clearInputState(keys: readonly string[]): void {
    setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([k]) => !keys.includes(k))))
    setWarnings((current) => Object.fromEntries(Object.entries(current).filter(([k]) => !keys.includes(k))))
  }

  function setValue(def: TunableDef, value: number): void {
    clearInputState([def.key])
    commit({ ...values, [def.key]: value })
  }

  function onNumberInput(def: TunableDef, text: string): void {
    setDrafts((current) => ({ ...current, [def.key]: text }))
    const value = Number(text)
    if (text.trim() === '' || !Number.isFinite(value) || value < def.min || value > def.max) {
      setWarnings((current) => ({
        ...current,
        [def.key]: `${def.min} ~ ${def.max} 범위의 숫자만 쓸 수 있습니다. 저장하지 않았습니다.`,
      }))
      return
    }
    setWarnings((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== def.key)))
    commit({ ...values, [def.key]: value })
  }

  function resetAll(): void {
    clearInputState(defs.map((def) => def.key))
    commit(Object.fromEntries(defs.map((def) => [def.key, def.defaultValue])))
  }

  async function copyChanged(): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(changedValues(defs, values), null, 2))
      setErrorText(null)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setErrorText(`복사하지 못했습니다: ${reason}`)
    }
  }

  const buttonClass =
    'rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700'

  return (
    <div
      role="dialog"
      aria-label="수치 조정"
      className="fixed top-2 right-2 z-50 max-h-[calc(100vh-1rem)] w-80 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-sm text-slate-200 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">수치 조정</h2>
        <button type="button" className={buttonClass} onClick={onClose}>
          닫기
        </button>
      </div>
      <p className="mb-2 text-xs text-slate-400">
        바뀐 값은 새로고침 뒤 새 방송부터 반영됩니다.
      </p>

      {errorText !== null && (
        <p role="alert" className="mb-2 rounded bg-red-950 p-2 text-xs text-red-300">
          {errorText}
        </p>
      )}

      {rejected.length > 0 && (
        <div className="mb-2 rounded bg-amber-950 p-2 text-xs text-amber-300">
          <p>저장값 {rejected.length}개를 쓰지 않았습니다</p>
          <ul className="mt-1 list-disc pl-4">
            {rejected.map((item) => (
              <li key={`${item.key}-${item.reason}`}>
                {item.key}: {REJECT_REASON_TEXT[item.reason]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-2 flex gap-2">
        <button type="button" className={buttonClass} onClick={resetAll}>
          모두 기본값
        </button>
        <button type="button" className={buttonClass} onClick={() => void copyChanged()}>
          바뀐 값 복사
        </button>
      </div>

      {groupDefs(defs).map(([group, items]) => (
        <details key={group} open className="mb-2 border-t border-slate-700 pt-2">
          <summary className="cursor-pointer font-medium text-slate-100">{group}</summary>
          {items.map((def) => {
            const value = values[def.key] ?? def.defaultValue
            const isChanged = value !== def.defaultValue
            const isPending = value !== applied[def.key]
            const warning = warnings[def.key]
            return (
              <div key={def.key} className="mt-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="font-medium">{def.label}</span>
                  {isChanged && (
                    <span className="rounded bg-sky-900 px-1 text-xs text-sky-200">바뀜</span>
                  )}
                  {isPending && (
                    <span className="rounded bg-amber-900 px-1 text-xs text-amber-200">
                      다음 방송부터
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{def.description}</p>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="range"
                    aria-label={`${def.label} 슬라이더`}
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={value}
                    onChange={(event) => setValue(def, Number(event.target.value))}
                    className="min-w-0 flex-1"
                  />
                  <input
                    type="number"
                    aria-label={`${def.label} 숫자`}
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={drafts[def.key] ?? String(value)}
                    onChange={(event) => onNumberInput(def, event.target.value)}
                    className="w-16 rounded border border-slate-600 bg-slate-800 px-1 text-right"
                  />
                  <span className="text-xs text-slate-400">{def.unit}</span>
                </div>
                {warning !== undefined && <p className="mt-1 text-xs text-red-300">{warning}</p>}
                <button
                  type="button"
                  className={`${buttonClass} mt-1`}
                  aria-label={`${def.label} 기본값`}
                  onClick={() => setValue(def, def.defaultValue)}
                >
                  기본값
                </button>
              </div>
            )
          })}
        </details>
      ))}
    </div>
  )
}
