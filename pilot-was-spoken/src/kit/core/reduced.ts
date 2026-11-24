/** 순수 reducer의 결과: 새 상태와 연출용 이벤트 목록. */
export interface Reduced<S, E> {
  readonly state: S
  readonly events: readonly E[]
}
