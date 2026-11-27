import { isStir, perceives, type Perceiver, type PhenomenonEvent } from './phenomena'

/** 출연자가 마지막으로 연루된 사고와 그 사고가 생긴 스텝(spec Plan B1 3.2) */
export interface Involvement {
  event: PhenomenonEvent
  step: number
}

/** 출연자 id → 마지막 연루 */
export type InvolvementMap = Map<string, Involvement>

/**
 * 연루로 치는 사고. 기척(강도 0)은 연쇄 깊이 통계에 들어가지 않아 빼고,
 * 방송 정적과 시선은 출연자가 낸 사고가 아니라 뺀다(정적은 모두가 인지해 누구에게나 붙는다).
 */
function isInvolvingIncident(event: PhenomenonEvent): boolean {
  return !isStir(event) && event.kind !== 'silence' && event.kind !== 'gaze'
}

/**
 * 사고를 낸(source), 당한(target), 인지한(perceives) 활동 출연자의 마지막 연루를 갱신한다.
 * perceivers는 활동 출연자다. 같은 스텝에 여러 사고면 id가 큰 사고가 남는다.
 */
export function updateInvolvement(
  map: InvolvementMap,
  events: readonly PhenomenonEvent[],
  perceivers: readonly Perceiver[],
): void {
  for (const event of events) {
    if (!isInvolvingIncident(event)) continue
    for (const perceiver of perceivers) {
      const involved =
        event.sourceId === perceiver.id ||
        event.targetId === perceiver.id ||
        perceives(event, perceiver)
      if (!involved) continue
      const previous = map.get(perceiver.id)
      if (previous !== undefined && previous.event.id > event.id) continue
      map.set(perceiver.id, { event, step: event.step })
    }
  }
}

/** 조정값(몸 초)을 이어받기 창 스텝으로 바꾼다. 0 이하면 0(이어받기 꺼짐)이다. */
export function takeoverWindowSteps(bodySeconds: number, stepsPerSecond: number): number {
  if (bodySeconds <= 0) return 0
  return Math.max(1, Math.round(bodySeconds * stepsPerSecond))
}

/** 지금 스텝에 지시하면 이어받을 연루. 창이 0이거나 창을 넘겼으면 null */
export function activeInvolvement(
  entry: Involvement | undefined,
  step: number,
  windowSteps: number,
): Involvement | null {
  if (entry === undefined || windowSteps <= 0) return null
  return step - entry.step <= windowSteps ? entry : null
}

/** 이어받을 수 있는 남은 스텝. 지금 스텝을 포함해 세므로 창 안이면 1 이상이다. */
export function remainingTakeoverSteps(entry: Involvement, step: number, windowSteps: number): number {
  return windowSteps - (step - entry.step) + 1
}
