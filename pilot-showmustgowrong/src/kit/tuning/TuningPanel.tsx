import { useEffect, useState, type ReactElement } from 'react'
import {
  changedValues,
  enforceConstraints,
  readOverrides,
  resolveTuning,
  violatedConstraints,
  writeOverrides,
  type RejectedOverride,
  type TunableDef,
  type TuningConstraint,
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
  /** 페이지를 불러올 때 저장값을 읽지 못한 오류(깨진 JSON 등). 없으면 null */
  loadError?: string | null
  /** 항목 사이의 관계. 페이지를 불러올 때와 같은 관계를 넘겨야 편집값이 다음 방송 값과 맞는다 */
  constraints?: readonly TuningConstraint[]
  onClose(): void
}

const NO_CONSTRAINTS: readonly TuningConstraint[] = []

const REJECT_REASON_TEXT: Record<RejectedOverride['reason'], string> = {
  unknownKey: '모르는 항목',
  notNumber: '숫자가 아님',
  outOfRange: '범위 밖',
  notObject: '저장 형식이 잘못됨',
  conflict: '다른 값과 맞지 않음',
}

function rejectText(item: RejectedOverride): string {
  const reason = REJECT_REASON_TEXT[item.reason]
  return item.detail === undefined ? `${item.key}: ${reason}` : `${item.key}: ${reason} (${item.detail})`
}

/** 처음 열 때의 편집값: 기본값 위에 저장된 값을 덮고 관계를 어긴 값은 되돌린 것, 즉 다음 방송에 쓰일 값 */
function initialValues(
  defs: readonly TunableDef[],
  storage: TuningStorage | null,
  storageKey: string,
  constraints: readonly TuningConstraint[],
): TuningValues {
  const { overrides } = readOverrides(storage, storageKey)
  return enforceConstraints(defs, resolveTuning(defs, overrides), constraints).values
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
  loadError = null,
  constraints = NO_CONSTRAINTS,
  onClose,
}: TuningPanelProps): ReactElement {
  const [values, setValues] = useState<TuningValues>(() =>
    initialValues(defs, storage, storageKey, constraints),
  )
  /** 저장소에 있는 값: 처음에는 저장값에서 푼 편집값, 그 뒤로는 마지막으로 저장에 성공한 편집값. 관계를 어긴 값은 다음 방송에서 기본값으로 돌아간다 */
  const [savedValues, setSavedValues] = useState<TuningValues>(values)
  /** 숫자 입력 칸에 사용자가 치고 있는 글자 */
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({})
  /** 항목별 숫자 입력 경고(범위 밖이라 저장하지 않음) */
  const [warnings, setWarnings] = useState<Readonly<Record<string, string>>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  /** 저장소가 없는지. 없으면 바꾼 값이 저장되지 않으므로 열 때부터 계속 알린다 */
  const storageMissing = storage === null

  // 패널이 열려 있는 동안만 window에서 Esc를 받는다(포커스가 패널 밖이어도 닫힌다)
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function commit(next: TuningValues): void {
    setValues(next)
    if (storage === null) return
    const error = writeOverrides(storage, storageKey, changedValues(defs, next))
    setSaveError(error)
    if (error === null) setSavedValues(next)
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
      setCopyError(null)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setCopyError(`복사하지 못했습니다: ${reason}`)
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

      {[
        loadError,
        storageMissing ? '저장소를 쓸 수 없어 바꾼 값이 저장되지 않습니다.' : null,
        saveError,
        copyError,
        ...violatedConstraints(values, constraints).map(
          (constraint) => `관계가 맞지 않아 다음 방송에서 기본값으로 돌아갑니다: ${constraint.description}`,
        ),
      ].map(
        (text) =>
          text !== null && (
            <p key={text} role="alert" className="mb-2 rounded bg-red-950 p-2 text-xs text-red-300">
              {text}
            </p>
          ),
      )}

      {rejected.length > 0 && (
        <div className="mb-2 rounded bg-amber-950 p-2 text-xs text-amber-300">
          <p>저장값 {rejected.length}개를 쓰지 않았습니다</p>
          <ul className="mt-1 list-disc pl-4">
            {rejected.map((item) => (
              <li key={`${item.key}-${item.reason}`}>{rejectText(item)}</li>
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
            // 저장소의 값이 지금 방송 값과 다르면 다음 방송부터 바뀐다. 저장소가 없으면 저장되지 않으니 보이지 않는다
            const isPending = !storageMissing && savedValues[def.key] !== applied[def.key]
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
                    aria-invalid={warning !== undefined}
                    aria-describedby={warning !== undefined ? `${def.key}-warning` : undefined}
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={drafts[def.key] ?? String(value)}
                    onChange={(event) => onNumberInput(def, event.target.value)}
                    className="w-16 rounded border border-slate-600 bg-slate-800 px-1 text-right"
                  />
                  <span className="text-xs text-slate-400">{def.unit}</span>
                </div>
                {warning !== undefined && (
                  <p id={`${def.key}-warning`} role="alert" className="mt-1 text-xs text-red-300">
                    {warning}
                  </p>
                )}
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
