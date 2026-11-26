/** 조정 항목 하나의 정의. 게임 내용은 모르고, 이름·범위·기본값만 안다. */
export interface TunableDef {
  /** 고유 키 */
  key: string
  /** 패널 묶음 이름 */
  group: string
  /** 쉬운 이름 */
  label: string
  /** 단위 (예 '몸 초', '배') */
  unit: string
  defaultValue: number
  min: number
  max: number
  step: number
  /** 한 줄 설명. 무엇이 빨라지거나 느려지는지 */
  description: string
}

export type TuningValues = Readonly<Record<string, number>>
export type RejectReason = 'unknownKey' | 'notNumber' | 'outOfRange' | 'notObject' | 'conflict'
export interface RejectedOverride {
  key: string
  value: unknown
  reason: RejectReason
  /** 사람이 읽는 설명. conflict면 어긋난 관계 */
  detail?: string
}
export interface ResolvedTuning {
  values: TuningValues
  rejected: readonly RejectedOverride[]
}

/** 항목 사이의 관계(예: 내림 문턱 < 진입 문턱). 범위 검사만으로 막지 못하는 조합을 막는다 */
export interface TuningConstraint {
  /** 관계에 걸린 키 */
  keys: readonly string[]
  /** 한국어 한 줄 설명. 패널 경고에 보인다 */
  description: string
  holds(values: TuningValues): boolean
}

export interface TuningStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** defs 오류 목록(키 중복, min>max, step<=0, 기본값 범위 밖). 비어 있으면 정상 */
export function validateTunables(defs: readonly TunableDef[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const def of defs) {
    if (seen.has(def.key)) errors.push(`키가 중복됩니다: ${def.key}`)
    seen.add(def.key)
    const numbers = {
      최솟값: def.min,
      최댓값: def.max,
      기본값: def.defaultValue,
      간격: def.step,
    }
    const nonFinite = Object.entries(numbers).filter(([, value]) => !Number.isFinite(value))
    for (const [name] of nonFinite) errors.push(`${name}은 유한한 수여야 합니다: ${def.key}`)
    // 유한하지 않은 값이 있으면 범위 비교가 무의미하므로 건너뛴다
    if (nonFinite.length > 0) continue
    if (def.min > def.max) errors.push(`최솟값이 최댓값보다 큽니다: ${def.key}`)
    if (def.step <= 0) errors.push(`간격은 0보다 커야 합니다: ${def.key}`)
    if (def.defaultValue < def.min || def.defaultValue > def.max) {
      errors.push(`기본값이 범위 밖입니다: ${def.key}`)
    }
  }
  return errors
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

/** 기본값 위에 overrides를 덮는다. 잘못된 값은 버리고 rejected에 이유를 남긴다. */
export function resolveTuning(defs: readonly TunableDef[], overrides: unknown): ResolvedTuning {
  const values: Record<string, number> = {}
  for (const def of defs) values[def.key] = def.defaultValue

  if (overrides === undefined || overrides === null) return { values, rejected: [] }
  if (!isPlainObject(overrides)) {
    return { values, rejected: [{ key: '*', value: overrides, reason: 'notObject' }] }
  }

  const defByKey = new Map(defs.map((def) => [def.key, def]))
  const rejected: RejectedOverride[] = []
  for (const [key, value] of Object.entries(overrides)) {
    const def = defByKey.get(key)
    if (def === undefined) {
      rejected.push({ key, value, reason: 'unknownKey' })
    } else if (typeof value !== 'number' || !Number.isFinite(value)) {
      rejected.push({ key, value, reason: 'notNumber' })
    } else if (value < def.min || value > def.max) {
      rejected.push({ key, value, reason: 'outOfRange' })
    } else {
      values[key] = value
    }
  }
  return { values, rejected }
}

/** values에서 지켜지지 않는 관계 */
export function violatedConstraints(
  values: TuningValues,
  constraints: readonly TuningConstraint[],
): TuningConstraint[] {
  return constraints.filter((constraint) => !constraint.holds(values))
}

/**
 * 어긋난 관계에 걸린 바뀐 값을 기본값으로 되돌리고 rejected에 conflict로 남긴다.
 * 되돌린 값 때문에 다른 관계가 어긋날 수 있으므로 모두 지켜질 때까지 되풀이한다.
 * 기본값끼리 어긋나는 관계는 정의 오류라 throw한다.
 */
export function enforceConstraints(
  defs: readonly TunableDef[],
  resolved: ResolvedTuning,
  constraints: readonly TuningConstraint[],
): ResolvedTuning {
  const defaults = Object.fromEntries(defs.map((def) => [def.key, def.defaultValue]))
  const brokenByDefaults = violatedConstraints(defaults, constraints)[0]
  if (brokenByDefaults !== undefined) {
    throw new Error(`기본값이 관계를 어깁니다: ${brokenByDefaults.description}`)
  }

  const values: Record<string, number> = { ...resolved.values }
  const rejected: RejectedOverride[] = [...resolved.rejected]
  let violated = violatedConstraints(values, constraints)
  while (violated.length > 0) {
    for (const constraint of violated) {
      for (const key of constraint.keys) {
        if (values[key] === defaults[key]) continue
        rejected.push({ key, value: values[key], reason: 'conflict', detail: constraint.description })
        values[key] = defaults[key]
      }
    }
    violated = violatedConstraints(values, constraints)
  }
  return { values, rejected }
}

/** 기본값과 다른 값만 */
export function changedValues(
  defs: readonly TunableDef[],
  values: TuningValues,
): Record<string, number> {
  const changed: Record<string, number> = {}
  for (const def of defs) {
    const value = values[def.key]
    if (value !== undefined && value !== def.defaultValue) changed[def.key] = value
  }
  return changed
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** JSON을 읽는다. 없으면 undefined. JSON이 깨졌거나 storage가 throw하면 undefined와 error 메시지 */
export function readOverrides(
  storage: TuningStorage | null,
  storageKey: string,
): { overrides: unknown; error: string | null } {
  if (storage === null) return { overrides: undefined, error: null }
  try {
    const raw = storage.getItem(storageKey)
    if (raw === null) return { overrides: undefined, error: null }
    return { overrides: JSON.parse(raw) as unknown, error: null }
  } catch (error) {
    return { overrides: undefined, error: `조정값을 읽지 못했습니다: ${errorMessage(error)}` }
  }
}

/** 바뀐 값만 저장한다. 비어 있으면 키를 지운다. 실패하면 오류 메시지, 성공하면 null */
export function writeOverrides(
  storage: TuningStorage,
  storageKey: string,
  changed: Record<string, number>,
): string | null {
  try {
    if (Object.keys(changed).length === 0) storage.removeItem(storageKey)
    else storage.setItem(storageKey, JSON.stringify(changed))
    return null
  } catch (error) {
    return `조정값을 저장하지 못했습니다: ${errorMessage(error)}`
  }
}
