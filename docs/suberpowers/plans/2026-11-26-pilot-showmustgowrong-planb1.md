# 방송망쳐야돼 Plan B1 Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 수치 조정 패널, 무입력 검증용 자동 PD, 지시로 연쇄 이어받기, 렉스 수치, 카메라 자리 고정을 넣고 자동 PD 기준 무입력 검증을 통과시킨다.

**Architecture:** 조정 패널은 게임을 모르는 일반 모듈(`src/kit/tuning/`)과 게임 쪽 조정 목록(`src/content/tuning.ts`)으로 나눈다. 조정값은 페이지(또는 sim 프로세스)를 불러올 때 한 번 풀리고 `balance.ts` 상수와 mind 속도가 그 값에서 만들어진다. 자동 PD는 엔진 밖에서 `BroadcastView`를 보고 플레이어와 같은 `BroadcastInput`을 낸다. 이어받기는 엔진이 출연자별 마지막 연루 사고를 기억해 출연자 지시의 원인으로 넘긴다.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Playwright, oxlint, tsx(sim 스크립트)

**Spec:** `docs/suberpowers/specs/2026-11-26-pilot-showmustgowrong-planb1-design.md` (상위: `docs/suberpowers/specs/2026-11-26-pilot-showmustgowrong-living-studio-design.md`)

작업 디렉터리: `pilot-showmustgowrong/`(아래 경로는 모두 여기 기준). 작업 로그: `docs/lab/worklog/pilot-showmustgowrong.md`(저장소 루트 기준).

## Global Constraints

- `any` 금지. 외부 입력(localStorage, JSON 파일)은 `unknown`으로 받아 좁힌다.
- 시간 수치는 이름과 설명에 기준을 밝힌다: 몸 초(`_BODY_SECONDS`, 스텝 기반), 극 중 초(`_SHOW_SECONDS`), 실제 초(`_REAL_SECONDS`), 극 중 분당(`PER_SHOW_MINUTE`). 평소 몸 1초 = 실제 1초, 극 중 1분 = 실제 6초.
- 조정값은 새로고침 뒤 새 방송부터 반영된다. 방송 도중에는 바뀌지 않는다.
- 같은 시드, 같은 조정값, 같은 입력이면 같은 결과(자동 PD 방송 포함). 자동 PD는 난수를 쓰지 않는다.
- 확률 결과(특정 시드에서 몇 초 안에 터진다)를 정답으로 박는 테스트를 새로 만들지 않는다. 규칙은 출력·사건을 직접 넣어 확인한다.
- 기척(강도 0)은 점수, 게이지, 슬로모션, 최근 현상, 깊이 통계, 이어받기에 들어가지 않는다.
- 사용자 대면 문구와 코드 주석은 한국어. UI 문구에 내부 용어(게이트, Ruling, 라인업 코드명)를 쓰지 않는다.
- 커밋 메시지 끝에 두 줄:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01KrC1eUjZ1r7MBm9CqMfZxH`
- 각 task 끝 검증: `npx vitest run <해당 파일>`, `npx tsc -b`, `npm run lint`. UI task는 `npm run e2e`도.

## Review Focus

1. localStorage에 예전 키·문자열 값·범위 밖 값이 남아 있음 → 그 항목만 버리고 기본값을 쓰며, 패널에 경고가 보인다. 페이지가 죽지 않는다(Task 2, 4).
2. localStorage 자체가 막힌 환경(접근 시 throw) → 기본값으로 돌고 패널은 저장 실패를 알린다(Task 2).
3. 자동 PD가 이탈한 출연자를 클로즈업 대상으로 고르거나, 클로즈업 순서에서 모든 출연자가 이탈 → 이탈자는 건너뛰고, 남은 출연자가 없으면 클로즈업 차례를 건너뛴다(Task 7).
4. 광고 직전 사고가 광고 뒤 지시로 이어받아짐 → 광고가 연루 기억을 지우므로 이어받지 않는다(Task 6).
5. 같은 스텝에 여러 사고가 연루됨 → id가 가장 큰(가장 나중) 사고를 원인으로 쓴다(Task 6).

---

### Task 1: 확률 결과에 기대는 엔진 테스트 정리

규칙이 바뀌면(Task 4~8) 난수 흐름이 달라져 깨질 테스트를 먼저 고친다.

**Files:**
- Modify: `src/sim/engine.life.test.ts`
- Modify(필요 시): `src/sim/lifeActions.test.ts`, `src/sim/life.test.ts`
- Modify: `docs/lab/worklog/pilot-showmustgowrong.md`

**Interfaces:**
- Consumes: `LifeActions`(`src/sim/lifeActions.ts`, deps는 `Pick`으로 좁혀져 있어 가짜 deps로 출력을 직접 넣을 수 있다), `StudioLife`
- Produces: 없음

- [ ] **Step 1:** `engine.life.test.ts`에서 "특정 시드에서 특정 시점까지 터짐·버릇·단계 진입이 일어난다"를 정답으로 쓰는 테스트를 모두 찾는다(작업 로그 기준 대략 319, 343, 370, 502, 552, 585, 900행 근처). 각 테스트마다 확인하려는 **규칙**을 한 줄로 적는다.
- [ ] **Step 2:** 각 테스트를 다음 중 하나로 바꾼다.
  - 규칙이 `LifeActions`/`StudioLife`/narration 단위에서 확인되면 그 단위 테스트로 옮기고 출력·사건을 직접 넣는다(`lifeActions.test.ts`의 burst 깊이 테스트 방식).
  - 엔진 통합으로만 확인되면, 결과를 보장하는 조건(예: 감정 값을 문턱 위로 직접 올린 뒤 재촉 창 안에서 확인, 지시로 사건을 직접 만들기)으로 바꾼다. 시드를 바꿔도 통과해야 한다.
- [ ] **Step 3:** 바꾼 테스트마다 규칙을 일부러 깨뜨려(예: 깊이 +1 제거) 실패하는지 확인하고 되돌린다.
- [ ] **Step 4:** 남는 통합 테스트가 시드에 독립적인지 확인: 해당 테스트들을 시드 3개(기존 시드, 기존+1, 기존+2)로 돌려 모두 통과(확인 후 원래 시드로 되돌린다).

Run: `npx vitest run src/sim` → PASS

- [ ] **Step 5:** 작업 로그 "Plan A 뒤 사용자 결정과 수정"의 테스트 원칙 줄 아래에 "B1 Task 1: 확률 결과 테스트 N개 정리(옮긴 곳 목록)"를 적는다.
- [ ] **Step 6:** Commit `test(sim): 확률 결과에 기대는 엔진 테스트를 규칙 테스트로 바꾼다`

---

### Task 2: 조정 모듈 핵심 (`src/kit/tuning/`)

**Files:**
- Create: `src/kit/tuning/tuning.ts`
- Create: `src/kit/tuning/tuning.test.ts`
- Create: `src/kit/tuning/index.ts` (공개 export만)

**Interfaces:**
- Produces(이 task 이후 모두 `@/kit/tuning`에서 import):

```ts
export interface TunableDef {
  key: string            // 고유. 예 'SMALL_BURST_MTB_SHOW_SECONDS', 'mind.rex.attention.offScreen.perShowMinute'
  group: string          // 패널 묶음 이름(한국어)
  label: string          // 쉬운 이름(한국어)
  unit: string           // 예 '몸 초', '극 중 초', '실제 초', '극 중 분당', '배', '비율'
  defaultValue: number
  min: number
  max: number
  step: number
  description: string    // 한 줄. 무엇이 빨라지거나 느려지는지
}
export type TuningValues = Readonly<Record<string, number>>
export type RejectReason = 'unknownKey' | 'notNumber' | 'outOfRange' | 'notObject'
export interface RejectedOverride { key: string; value: unknown; reason: RejectReason }
export interface ResolvedTuning { values: TuningValues; rejected: readonly RejectedOverride[] }

/** defs 오류 목록(키 중복, min>max, step<=0, 기본값 범위 밖). 비어 있으면 정상 */
export function validateTunables(defs: readonly TunableDef[]): string[]
/** 기본값 위에 overrides를 덮는다. overrides가 객체가 아니면 전부 기본값 + rejected 1개(key '*', 'notObject'). undefined/null이면 rejected 없음 */
export function resolveTuning(defs: readonly TunableDef[], overrides: unknown): ResolvedTuning
/** 기본값과 다른 값만 */
export function changedValues(defs: readonly TunableDef[], values: TuningValues): Record<string, number>
export interface TuningStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
/** JSON을 읽는다. 없으면 undefined. JSON이 깨졌거나 storage가 throw하면 undefined와 error 메시지 */
export function readOverrides(storage: TuningStorage | null, storageKey: string): { overrides: unknown; error: string | null }
/** 바뀐 값만 저장한다. 비어 있으면 키를 지운다. 실패하면 오류 메시지, 성공하면 null */
export function writeOverrides(storage: TuningStorage, storageKey: string, changed: Record<string, number>): string | null
```

- [ ] **Step 1: 실패하는 테스트 작성** (`tuning.test.ts`)
  - `validateTunables`: 정상 defs → `[]`; 키 중복, `min > max`, `step <= 0`, 기본값 범위 밖 각각 → 오류 1개 이상.
  - `resolveTuning(defs, undefined)` → 모든 값이 기본값, `rejected` 빈 배열.
  - `resolveTuning(defs, { A: 3 })`(범위 안) → `values.A === 3`.
  - `{ A: 999 }`(범위 밖) → `values.A`는 기본값, rejected `[{ key: 'A', value: 999, reason: 'outOfRange' }]`.
  - `{ A: '3' }` → reason `'notNumber'`; `{ A: NaN }` → `'notNumber'`; `{ Z: 1 }` → `'unknownKey'`.
  - `resolveTuning(defs, 'x')`와 `[1]` → 모든 값 기본값, rejected `[{ key: '*', value: <입력>, reason: 'notObject' }]`.
  - 경계값: `min`, `max` 정확히는 받아들인다.
  - `changedValues`: 기본값과 같은 값은 빠진다.
  - `readOverrides`: 키 없음 → `{ overrides: undefined, error: null }`; 깨진 JSON → `error` 문자열; `getItem`이 throw → `error` 문자열; storage `null` → `{ undefined, null }`.
  - `writeOverrides`: 비어 있으면 `removeItem` 호출; 값이 있으면 JSON 저장; `setItem`이 throw → 오류 문자열.
- [ ] **Step 2:** `npx vitest run src/kit/tuning` → FAIL(모듈 없음)
- [ ] **Step 3:** 구현. 순수 함수만, React·DOM 의존 없음.
- [ ] **Step 4:** `npx vitest run src/kit/tuning` → PASS
- [ ] **Step 5:** Commit `feat(kit): 조정 항목 정의·풀기·저장 모듈`

---

### Task 3: 조정 패널 컴포넌트 (`src/kit/tuning/TuningPanel.tsx`)

**Files:**
- Create: `src/kit/tuning/TuningPanel.tsx`
- Create: `src/kit/tuning/useTuningHotkey.ts`
- Create: `src/kit/tuning/TuningPanel.test.tsx`
- Modify: `src/kit/tuning/index.ts`

**Interfaces:**
- Consumes: Task 2 전부
- Produces:

```ts
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
export function TuningPanel(props: TuningPanelProps): JSX.Element
/** 백틱(`)으로 열고 닫는다. 입력창에 포커스가 있으면 무시한다 */
export function useTuningHotkey(): [open: boolean, setOpen: (open: boolean) => void]
```

동작:
- 처음 열 때 편집값 = `applied` 위에 저장된 바뀐 값(`readOverrides` → `resolveTuning`)을 덮은 것.
- `group`별 접는 묶음. 항목마다 이름, 단위, 설명, 슬라이더(`min`·`max`·`step`), 숫자 입력. 숫자 입력이 범위 밖이면 저장하지 않고 그 칸에 경고.
- 값을 바꿀 때마다 `writeOverrides(changedValues(...))`. 실패하면 패널 위에 오류 문구.
- 항목 표시: 기본값과 다르면 "바뀜", 편집값이 `applied`와 다르면 "다음 방송부터". 패널 위에 "바뀐 값은 새로고침 뒤 새 방송부터 반영됩니다" 안내.
- 버튼: 항목별 "기본값", 전체 "모두 기본값", "바뀐 값 복사"(`navigator.clipboard.writeText(JSON.stringify(changed, null, 2))`, 실패 시 오류 문구), "닫기".
- `rejected`가 있으면 위에 "저장값 N개를 쓰지 않았습니다"와 키·이유 목록.
- 화면 오른쪽 위에 겹쳐 뜨는 고정 패널(`role="dialog"`, `aria-label="수치 조정"`), 세로 스크롤.

- [ ] **Step 1: 실패하는 테스트 작성** (Testing Library, 가짜 storage)
  - 열면 묶음 이름과 항목 이름이 보인다.
  - 슬라이더를 바꾸면 storage에 `{ key: 값 }`이 저장되고 그 항목에 "다음 방송부터"가 보인다.
  - 기본값으로 되돌리면 storage 키가 지워진다(`removeItem`).
  - 숫자 입력에 범위 밖 값 → 저장하지 않고 경고가 보인다.
  - `rejected` 1개 → "저장값 1개를 쓰지 않았습니다"가 보인다.
  - `setItem`이 throw → 오류 문구가 보인다.
  - `useTuningHotkey`: 백틱 keydown으로 열리고 다시 누르면 닫힌다. `input`에 포커스가 있을 때는 바뀌지 않는다.
- [ ] **Step 2:** `npx vitest run src/kit/tuning` → FAIL
- [ ] **Step 3:** 구현(Tailwind, 기존 앱의 slate 계열 어두운 톤).
- [ ] **Step 4:** `npx vitest run src/kit/tuning` → PASS
- [ ] **Step 5:** Commit `feat(kit): 수치 조정 패널`

---

### Task 4: 게임 조정 목록 연결 (balance·mind·sim·App)

**Files:**
- Create: `src/content/tuning.ts`, `src/content/tuningSource.ts`, `src/content/tuning.test.ts`
- Modify: `src/content/balance.ts`, `src/content/commonMind.ts`, `src/content/minds/{rex,priya,okafor,mo,june}.ts`, `src/content/validate.ts`, `src/content/validate.test.ts`
- Modify: `scripts/sim-broadcast.ts`
- Modify: `src/app/App.tsx`
- Modify: `tests/e2e/broadcast.spec.ts`

**Interfaces:**
- Consumes: Task 2·3
- Produces:

```ts
// src/content/tuningSource.ts — balance·mind를 import하지 않는다
declare global { var __EXNIHILO_TUNING__: unknown }
/** 노드(sim)는 globalThis.__EXNIHILO_TUNING__, 브라우저는 localStorage. 둘 다 없으면 undefined */
export function initialOverrides(storageKey: string): { overrides: unknown; error: string | null }
export function browserStorage(): TuningStorage | null  // 접근이 throw하면 null

// src/content/tuning.ts — kit과 tuningSource만 import한다
export const TUNING_STORAGE_KEY = 'exnihilo.showmustgowrong.tuning'
export const TUNABLES: readonly TunableDef[]
export const TUNING: ResolvedTuning & { storageError: string | null }  // 모듈 로드 때 한 번 풀린다
/** 조정 항목 값. 모르는 키면 throw */
export function tuned(key: string): number
```

조정 항목(키 = 지금 `balance.ts` 상수 이름. 기본값은 지금 값 그대로 옮긴다. 범위 규칙: 비율·확률 `0~1`, 간격 0.01; 그 밖은 `0 ~ 기본값×4`, 간격은 기본값의 1/20을 1·2·5×10ⁿ 중 가까운 값으로; 문턱은 `0~100`, 간격 1):

| 묶음 | 키 |
|---|---|
| 방송 | `BROADCAST_REAL_SECONDS` |
| 감정 | `SITUATION_REFERENCE_PER_SHOW_MINUTE`, `SITUATION_FADE_PER_SHOW_MINUTE`, `SITUATION_CAP`, `EVENT_REASON_SHOW_SECONDS`, `RELIEF_AMOUNT`, `RELIEF_SHOW_SECONDS`, `threshold.rise1`, `threshold.rise2`, `threshold.fall1`, `threshold.fall2`, `threshold.intense` |
| 터짐 | `SMALL_BURST_KEEP`, `SMALL_BURST_MTB_SHOW_SECONDS`, `SMALL_BURST_COOLDOWN_SHOW_SECONDS`, `BIG_BURST_GRACE_BODY_SECONDS`, `BIG_BURST_MTB_BODY_SECONDS`, `STAGE_LINE_COOLDOWN_SHOW_SECONDS` |
| 버릇 | `HABIT_INTERVAL_SHOW_SECONDS`, `HABIT_BOREDOM_SHORTEN`, `HABIT_COOLDOWN_SHOW_SECONDS`, `HABIT_REST_AFTER_ACTION_BODY_SECONDS`, `RESPONSE_COOLDOWN_SHOW_SECONDS`, `RECALL_SHOW_SECONDS`, `LOG_NUDGE_BODY_SECONDS`, `NEAR_RADIUS` |
| 연쇄 | `MOTION_CAUSE_SECONDS`, `REACTION_COOLDOWN_SECONDS`, `CHAIN_BONUS_PER_DEPTH`, `TAKEOVER_BODY_SECONDS`(새 항목, 기본 5, 범위 0~20, 간격 0.5. 상수는 Task 6에서 쓴다) |
| 시청률 | `VIEWERS_START`, `VIEWERS_PER_POINT` |
| 개입 | `INTERVENTION_SPEED`, `INTERVENTION_REAL_SECONDS`, `AUTO_SLOWMO_REAL_SECONDS`, `AUTO_SLOWMO_GAUGE_RATIO`, `FATIGUE_MISFIRE_PER_POINT`, `STAFF_FATIGUE_MISFIRE_PER_POINT`, `MISFIRE_CAP`, `OVERDO_MULTIPLIER` |
| 광고 | `AD_BREAK_REAL_SECONDS`, `AD_VIEWER_LOSS` |
| 자동 PD | `AUTO_SHOT_BODY_SECONDS`(새, 기본 5), `AUTO_MIN_HOLD_BODY_SECONDS`(새, 기본 1.5). 상수는 Task 7에서 쓴다 |
| 출연자 | `mind.common.boredom.silence.perShowMinute`(4.5), `mind.rex.attention.offScreen.perShowMinute`(7), `mind.rex.attention.offScreen.fadePerShowMinute`(40), `mind.rex.boredom.silence.perShowMinute`(4), `mind.priya.boredom.silence.perShowMinute`(6), `mind.okafor.boredom.silence.perShowMinute`(5.5), `mind.mo.excitement.studioAudience.perShowMinute`(2), `mind.june.chatter.silence.perShowMinute`(9), `mind.june.chatter.silence.fadePerShowMinute`(20), `mind.june.anxiety.nearTag.perShowMinute`(2), `mind.june.boredom.silence.perShowMinute`(3) |

위 표에 없는 `balance.ts` 상수는 상수 그대로 둔다. 이 중 이름 끝이 시간 단위가 아닌 항목(`MOTION_CAUSE_SECONDS`, `REACTION_COOLDOWN_SECONDS`는 몸 초, `NEAR_RADIUS`는 m 등)은 `unit`에 기준을 적는다.

- [ ] **Step 1: 실패하는 테스트 작성** (`src/content/tuning.test.ts`)
  - `validateTunables(TUNABLES)`가 `[]`.
  - 표의 모든 키가 `TUNABLES`에 있다.
  - `balance.ts`의 표 속 상수가 `tuned(같은 키)`와 같다(예: `SMALL_BURST_MTB_SHOW_SECONDS === tuned('SMALL_BURST_MTB_SHOW_SECONDS')`, `DEFAULT_THRESHOLDS.rise[0] === tuned('threshold.rise1')`).
  - `REX_MIND`의 주목 욕구 offScreen 민감도 `perShowMinute === tuned('mind.rex.attention.offScreen.perShowMinute')`(다른 mind 항목도 같은 방식으로 전부).
  - `tuned('없는키')`가 throw.
  - 로드 순서: `vi.resetModules()` 뒤 `globalThis.__EXNIHILO_TUNING__ = { SMALL_BURST_MTB_SHOW_SECONDS: 60 }`를 두고 `await import('@/content/balance')` → 그 상수가 60. `{ SMALL_BURST_MTB_SHOW_SECONDS: 99999 }`이면 기본값이고 `TUNING.rejected` 길이 1. 테스트 끝에 global을 지운다.
- [ ] **Step 2:** `npx vitest run src/content/tuning.test.ts` → FAIL
- [ ] **Step 3:** 구현
  - `balance.ts`: 표의 상수를 `export const X = tuned('X')`로 바꾼다. 그 상수에서 계산되는 값(`BROADCAST_STEPS`, `CORNER_STEPS` 등)은 그대로 계산식을 유지한다. `DEFAULT_THRESHOLDS`는 `threshold.*`로 만든다. 기존 설명 주석은 `TUNABLES`의 `description`으로 옮기고 balance에는 "값은 tuning.ts" 한 줄을 남긴다.
  - mind: 리터럴을 `tuned('mind....')`로 바꾼다(`commonMind.ts`의 공용 정적 지루함 포함). 기존 근거 주석은 `TUNABLES` 쪽 `description`으로 옮긴다.
  - `validate.ts`: `validateTunables(TUNABLES)` 오류를 콘텐츠 검증 오류에 더한다(+ `validate.test.ts`에 "조정 항목 검증 오류가 콘텐츠 검증에 실린다" 테스트: 잘못된 defs를 주입할 수 있게 검증 함수가 defs를 인자로 받거나, `validateTunables` 결과를 합치는 지점을 단위 테스트한다).
- [ ] **Step 4:** sim 스크립트: `npm run sim -- --tune <파일.json>`
  - 파일 JSON을 읽어 `globalThis.__EXNIHILO_TUNING__`에 두고, 그 뒤에 `@/content/*`·`@/sim/*`를 **동적 import**한다(정적 import는 global을 두기 전에 평가되므로 스크립트 상단의 앱 모듈 import를 모두 동적으로 바꾼다).
  - `TUNING.rejected`가 비어 있지 않으면 목록을 출력하고 종료 코드 2로 끝난다(오타로 기본값이 조용히 쓰이는 일을 막는다).
  - 실행 첫 줄에 기본값과 다른 조정값 목록을 출력한다(없으면 "조정값: 기본").
- [ ] **Step 5:** App: `useTuningHotkey()`로 열고, `TuningPanel`에 `defs=TUNABLES`, `applied=TUNING.values`, `rejected=TUNING.rejected`, `storage=browserStorage()`, `storageKey=TUNING_STORAGE_KEY`. `TUNING.storageError`가 있으면 패널 위 오류로 보인다(패널 props에 `loadError?: string | null` 추가).
- [ ] **Step 6: e2e** (`tests/e2e/broadcast.spec.ts`)
  - `page.addInitScript`로 localStorage에 `{"SMALL_BURST_MTB_SHOW_SECONDS": 60}` 저장 → 페이지 열기 → 백틱 → "수치 조정" 대화상자에 그 항목의 지금 값 60과 "바뀜"이 보인다.
  - 저장값 `{"SMALL_BURST_MTB_SHOW_SECONDS": 99999}` → "저장값 1개를 쓰지 않았습니다"가 보이고 게임은 정상 시작한다.
  - 패널에서 값을 바꾸면 "다음 방송부터"가 보이고, 새로고침 뒤 다시 열면 그 값이 지금 값이다.
- [ ] **Step 7:** `npx vitest run`, `npx tsc -b`, `npm run lint`, `npm run e2e`, `npm run sim` → 모두 통과. sim 결과(게이트 표)가 Task 4 전과 같다(값을 옮기기만 했으므로). 다르면 옮긴 값이 틀린 것이다.
- [ ] **Step 8:** Commit `feat: 게임 수치를 조정 목록으로 옮기고 조정 패널을 연결한다`

---

### Task 5: 카메라 자리 고정

**Files:**
- Modify: `src/app/OnAirColumn.tsx`, (키 처리 위치가 다르면) `src/app/BroadcastScreen.tsx`
- Modify: `src/app/screens.test.tsx` 또는 새 `src/app/OnAirColumn.test.tsx`
- Modify: `tests/e2e/broadcast.spec.ts`

**Interfaces:**
- Consumes: `BroadcastView.onAirCameraId`, `ShowDef.cameras`, `SWITCHER_KEYS`
- Produces: 칸마다 `data-testid="switcher-slot-<cameraId>"`, `data-slot-index="<0|1|2>"`, `data-on-air="true|false"`. 위쪽 송출 모니터는 `data-testid="program-monitor"`(기존 `switcher-<id>` testid를 쓰던 테스트는 새 이름으로 고친다).

- [ ] **Step 1: 실패하는 테스트 작성**
  - 컴포넌트 테스트: `onAirCameraId`를 `wide`, `close`, `audienceCam`으로 바꿔 그릴 때마다 칸 순서가 `['wide','close','audienceCam']`(`show.cameras` 순서)로 같다.
  - 송출 중인 칸은 `data-on-air="true"`이고 누르면 `onSwitch`가 불리지 않는다. 다른 칸을 누르면 `onSwitch(그 id)`.
  - 추적 카메라 칸은 송출 중이든 아니든 pointerdown에 `onAimDragStart('close', …)`가 불린다.
  - 칸 아래 키 표시가 1·2·3 순서(`SWITCHER_KEYS`)와 같다.
- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현: 위에 송출 모니터(지금 크기 유지), 아래에 `show.cameras` 순서의 세 칸. 칸 폭은 열(300px) 안에 셋이 들어가게(예 88×50). 송출 칸은 빨간 테두리 + "ON AIR". 칸 라벨은 짧은 카메라 이름과 키 번호.
- [ ] **Step 4:** e2e: 키 2로 클로즈업 송출 → 클로즈업 칸의 `data-slot-index`가 1 그대로이고 `data-on-air="true"`. 키 3 → 관객석 칸 index 2, 클로즈업 칸 여전히 index 1.
- [ ] **Step 5:** `npx vitest run src/app`, `npm run e2e` → PASS
- [ ] **Step 6:** Commit `feat(app): 카메라 미리보기 칸을 고정 순서로 둔다`

---

### Task 6: 지시로 연쇄 이어받기

**Files:**
- Modify: `src/sim/engine.ts`, `src/sim/engineTypes.ts`, `src/sim/lifeActions.ts`(`ActionOptions`가 여기 있다), `src/content/balance.ts`(`TAKEOVER_BODY_SECONDS = tuned('TAKEOVER_BODY_SECONDS')`)
- Create: `src/sim/engine.takeover.test.ts`

**Interfaces:**
- Consumes: `TAKEOVER_BODY_SECONDS`(Task 4 항목), `perceives`(`src/sim/phenomena.ts`), `eventNoun`(`src/sim/narration.ts`), `describeEvent`
- Produces:

```ts
// engineTypes.ts
export interface TakeoverView {
  /** 이어받을 사고 id */
  eventId: number
  /** 사고 로그와 같은 문구(describeEvent) */
  text: string
  /** 남은 몸 초(0 초과) */
  remainingBodySeconds: number
}
// ActorView에 추가
takeover: TakeoverView | null

// lifeActions.ts ActionOptions에 추가
/** 주면 이 행동이 남기는 첫 사고 줄 앞에 붙인다 */
linePrefix?: string
```

규칙(spec 3.2):
- 엔진은 출연자 id → `{ event, step }`(마지막 연루 사고)를 기억한다. 매 스텝 그 스텝에 새로 생긴 강도 1 이상 사고마다, 사고의 `sourceId`·`targetId`인 활동 출연자와 `perceives(event, perceiverOf(member))`가 참인 활동 출연자를 갱신한다. 같은 스텝 여러 사고면 id가 큰 사고가 남는다. 인지 갱신은 `runLife`의 인지와 같은 시점(`pendingEvents`)에 한다.
- 출연자 지시(`directPerformer`)의 원인 = 기억한 사고가 `stepCount - step <= secondsToSteps(TAKEOVER_BODY_SECONDS)`면 그 사고, 아니면 null. walkout 결과에는 쓰지 않는다. 스태프 지시는 바뀌지 않는다.
- 원인이 있으면 `executeAction(member, action, cause, { linePrefix: \`${원인 출처 shortName}의 ${eventNoun(cause)}에 이어 \` })`. 원인 출처가 출연자가 아니면 출처 이름은 `entityName`.
- 광고(`takeAd`)는 기억을 모두 지운다.
- `ActorView.takeover`: 위 조건이 참이면 `{ eventId, text: describeEvent(cause, names), remainingBodySeconds }`, 아니면 null. 이탈한 출연자는 null.

- [ ] **Step 1: 실패하는 테스트 작성** (`engine.takeover.test.ts`, 실제 라인업 `Broadcast`, 사건은 지시로 직접 만든다. 지시는 첫 사용 때 피로 0이라 엇나감 난수를 쓰지 않는다)
  - `'출연자가 몸 5초 안에 연루된 사고를 지시가 이어받아 깊이가 +1이 된다'`: 출연자 A 지시로 강도 1 이상 사고 → 1초 뒤 A에게 다른 지시 → 두 번째 지시 사고의 depth가 첫 사고 depth + 1, 그 줄 text가 `A이름의 `로 시작하고 `에 이어 `를 포함.
  - `'대상이 된 출연자도 이어받는다'`: 대상이 있는 지시(예 렉스 `pressGuest`)로 B가 target → B 지시가 이어받는다.
  - `'5초를 넘기면 이어받지 않는다'`: 첫 사고 뒤 `secondsToSteps(5) + 1` 스텝 뒤 지시 → depth 1, 접두 없음. 정확히 `secondsToSteps(5)` 스텝 뒤는 이어받는다.
  - `'광고 뒤에는 이어받지 않는다'`: 사고 → 광고 → 광고가 끝나 live가 된 직후 지시 → depth 1, 접두 없음, `takeover`가 null.
  - `'view의 takeover가 남은 몸 초를 보인다'`: 사고 직후 `remainingBodySeconds`가 5 근처(±1스텝), 2초 뒤 3 근처, 5초 넘으면 null.
  - `'기척은 연루가 아니다'`: 버릇 기척(강도 0) 사건만 있을 때 `takeover`가 null(가짜 이벤트 주입이 어려우면 `pendingEvents` 갱신 함수를 엔진에서 분리한 순수 함수로 테스트해도 된다: `updateInvolvement(map, events, step, perceivers)`).
  - `'같은 스텝 사고 여러 개면 id가 큰 사고'`: 위 순수 함수로 확인.
- [ ] **Step 2:** `npx vitest run src/sim/engine.takeover.test.ts` → FAIL
- [ ] **Step 3:** 구현. 연루 갱신은 순수 함수 `updateInvolvement`(`src/sim/takeover.ts`로 분리 가능, engine.ts가 이미 크다)로 둔다.
- [ ] **Step 4:** `npx vitest run src/sim` → PASS. `npm run sim` 게이트가 Task 4 결과와 같다(무입력에는 지시가 없으므로 바뀌면 안 된다).
- [ ] **Step 5:** Commit `feat(sim): 출연자 지시가 최근 연루 사고에서 연쇄를 이어받는다`

---

### Task 7: 자동 PD

**Files:**
- Create: `src/sim/autoDirector.ts`, `src/sim/autoDirector.test.ts`
- Modify: `src/content/types.ts`(`ShowDef.autoCut`), `src/content/talkShow.ts`, `src/content/validate.ts`(+ test), `src/content/balance.ts`(`AUTO_SHOT_BODY_SECONDS`, `AUTO_MIN_HOLD_BODY_SECONDS` = `tuned(...)`)

**Interfaces:**
- Consumes: `BroadcastView`, `BroadcastInput`, `RecentPhenomenon`
- Produces:

```ts
// types.ts
export interface AutoCutDef {
  /** 평소 컷 순서(카메라 id). 추적 카메라 차례마다 대상을 다음 출연자로 넘긴다 */
  rotation: string[]
  /** 출연자 사고 때 쓰는 추적 카메라 id */
  incidentCamera: string
  /** 장비·관객 사고 때 쓰는 카메라 id */
  fallbackCamera: string
}
// ShowDef에 추가
autoCut: AutoCutDef
// talkShow: { rotation: ['wide','close','wide','audienceCam'], incidentCamera: 'close', fallbackCamera: 'wide' }

// autoDirector.ts
export interface AutoDirectorTiming { shotSteps: number; minHoldSteps: number }
export class AutoDirector {
  /** performerOrder: 무대 출연자 순서(클로즈업 차례 순서) */
  constructor(show: ShowDef, performerOrder: readonly string[], timing?: AutoDirectorTiming)  // 기본 timing은 AUTO_* 상수에서
  /** 매 스텝 부른다. 낼 입력이 없으면 빈 배열 */
  decide(view: BroadcastView): BroadcastInput[]
}
```

규칙(spec 2.3):
- `view.phase !== 'live'`면 `[]`.
- 처음 부를 때 `rotation[0]`으로 시작한다(지금 송출과 같으면 switch를 내지 않는다).
- 평소: 지금 컷을 `shotSteps` 잡았으면 다음 rotation 칸으로. 다음 칸이 추적 카메라면 `track(다음 출연자)`를 먼저 내고 `switch`. 이탈한 출연자(`view.actors[].walkedOut`)는 건너뛰고, 남은 출연자가 없으면 그 칸을 건너뛴다.
- 사고: `view.recentPhenomena` 중 아직 본 적 없는 id이고 `intensity >= 1`인 것. 출처가 활동 출연자면 사고 컷(`incidentCamera`, 그 출연자 track). 출처가 그 밖이면 `fallbackCamera`.
  - 지금 사고 컷이 같은 출연자면 컷 유지, 잡는 시간을 0부터 다시 센다.
  - 다른 대상이면 지금 컷을 `minHoldSteps` 이상 잡았을 때 옮기고, 아니면 그 사고를 기억해 두었다가 `minHoldSteps`가 차면 옮긴다(그사이 더 새 사고가 오면 더 새 것).
  - 사고 컷이 `shotSteps` 지나면 rotation의 다음 칸으로 돌아간다(rotation 위치는 사고 전 위치에서 이어간다).
- 같은 view로 두 번 불러도 같은 결과를 낸다(난수 없음, 상태는 스텝 기준).

- [ ] **Step 1: 실패하는 테스트 작성** (`autoDirector.test.ts`, `BroadcastView`를 테스트 헬퍼로 직접 만든다. 엔진을 돌리지 않는다)
  - `'평소에는 몸 5초마다 와이드→클로즈업(첫 출연자)→와이드→관객석 순서로 넘긴다'`: step 0, 300, 600, 900에서 낸 입력을 확인(60Hz, 5초 = 300스텝). 클로즈업 차례에 `track` 다음 `switch`.
  - `'클로즈업 차례마다 다음 출연자, 이탈한 출연자는 건너뛴다'`
  - `'모든 출연자가 이탈하면 클로즈업 차례를 건너뛴다'`
  - `'출연자 사고가 나면 그 출연자를 잡는 클로즈업으로 넘긴다'`
  - `'같은 출연자가 또 사고를 내면 컷을 유지하고 시간을 다시 센다'`
  - `'다른 출연자 사고는 1.5초를 잡은 뒤에 옮긴다'`: 사고 컷 0.5초 뒤 다른 출연자 사고 → 그 스텝엔 입력 없음, 1.5초 시점에 track+switch.
  - `'장비 사고는 와이드로 넘긴다'`
  - `'기척(강도 0)은 무시한다'`
  - `'광고 중에는 아무것도 내지 않는다'`
- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현. `validate.ts`: `autoCut`의 카메라 id가 `cameras`에 있고 `incidentCamera`가 `tracking: true`인지 확인(+ 테스트).
- [ ] **Step 4:** 결정론 통합 테스트(같은 파일): 실제 라인업 시드 3 방송을 자동 PD로 끝까지 두 번 돌려 `measureBroadcast` 결과가 같다(timeout 30_000).
- [ ] **Step 5:** `npx vitest run src/sim/autoDirector.test.ts src/content` → PASS
- [ ] **Step 6:** Commit `feat(sim): 일어난 일을 따라가는 자동 PD`

---

### Task 8: 무입력 검증을 자동 PD 기준으로 바꾸고 렉스 수치를 맞춘다

**Files:**
- Modify: `scripts/sim-broadcast.ts`, `src/sim/livingMetrics.ts`, `src/sim/livingMetrics.test.ts`
- Modify: `src/content/tuning.ts`(기본값 변경만)
- Modify: `docs/lab/worklog/pilot-showmustgowrong.md`

**Interfaces:**
- Consumes: `AutoDirector`(Task 7), `--tune`(Task 4)
- Produces:

```ts
// livingMetrics.ts
// BroadcastMetrics에 추가
/** 렉스 주목 욕구가 1단계에 한 번이라도 닿았나. 렉스가 없는 방송이면 null */
rexAttentionReached: boolean | null
// measureBroadcast는 로그의 stage 줄(kind 'stage', emotion 'attention', 렉스)로 센다
// evaluateGates에 게이트 '렉스 주목 욕구' 추가: rexAttentionReached가 null이 아닌 판 중 true 비율이 0.4~0.6이면 통과
```

- [ ] **Step 1: 실패하는 테스트 작성** (`livingMetrics.test.ts`)
  - `measureBroadcast`: 렉스 attention stage 줄이 있으면 `true`, 없으면 `false`. (렉스 판별에 필요한 값—예: stage 줄의 actorId—이 `LogLine`에 없으면 `measureBroadcast`에 렉스 id 인자를 더하고, `LogLine`에 이미 있는 필드로 판별한다. 둘 다 안 되면 `burstRecords`처럼 엔진이 stage 진입 기록을 내보내도록 더하고 그것으로 센다.)
  - 게이트 이름 목록에 `'렉스 주목 욕구'`가 9번째로 붙는다(기존 테스트의 이름 목록 갱신).
  - 50판 중 20판 true → 통과, 30판 → 통과, 19판 → 실패, 31판 → 실패. null 판은 분모에서 빠진다.
- [ ] **Step 2:** FAIL 확인 → 구현 → PASS
- [ ] **Step 3:** sim 스크립트
  - 기본 실행: 라인업마다 시드 1~50을 `AutoDirector`로 돌려(매 스텝 `broadcast.step(director.decide(broadcast.view()))`) 게이트를 건다. 렉스 게이트는 기본 라인업에만 걸고 준 라인업은 비율만 출력한다.
  - 이어서 "참고: 고정 와이드" 표를 출력한다(게이트 없음, 종료 코드에 영향 없음). `--fixed`면 고정 와이드만 돌리고 기존처럼 게이트를 건다.
  - `--log <seed> [june]`은 자동 PD 방송 로그를 출력한다(`--fixed`와 함께 쓰면 고정 와이드).
  - 실행 시간이 길면 view 생성 비용을 재고, 필요하면 `decide`를 6스텝(몸 0.1초)마다 부르도록 바꾼다(그때 Task 7 테스트의 스텝 기준과 어긋나지 않게 `AutoDirector`가 받은 view의 `step`으로 시간을 잰다).
- [ ] **Step 4:** 렉스 수치: `mind.rex.attention.offScreen.perShowMinute` 기본값을 7 → 12로 바꾼다(spec 4: 문턱 50 ÷ 화면 밖 누적 실제 25초 = 실제 초당 2 = 극 중 분당 12). `npm run sim`을 돌려 렉스 비율을 본다.
- [ ] **Step 5:** 렉스 비율이 0.4~0.6 밖이면 `mind.rex.attention.offScreen.fadePerShowMinute`만 `--tune` 파일로 바꿔 가며 맞춘 뒤 기본값에 반영한다. 시도한 값과 결과 비율을 작업 로그에 표로 남긴다.
- [ ] **Step 6:** 다른 게이트가 깨지면(관객석 컷으로 송출이 줄어 정적 줄·터짐 수가 바뀌는 등): 원인을 측정해 작업 로그에 적고, **조정 항목의 기본값만** 바꿔 맞춘다(규칙·게이트 기준은 바꾸지 않는다). 바꾼 항목마다 이전 값, 새 값, 근거(실제 시간 체감 기준), 결과를 작업 로그에 남긴다. 조정 항목 안에서 맞출 수 없으면 바꾸지 말고 BLOCKED로 보고한다(사용자 결정 사항).
- [ ] **Step 7:** 최종 검증: `npx vitest run`, `npx tsc -b`, `npm run lint`, `npm run e2e`, `npm run sim`(종료 코드 0). 작업 로그에 "B1 무입력 검증(자동 PD)" 절을 만들어 라인업별 게이트 결과, 렉스 비율(기본·준), 고정 와이드 참고 결과, 바꾼 기본값을 적는다.
- [ ] **Step 8:** Commit `feat(sim): 무입력 검증을 자동 PD 기준으로 하고 렉스 주목 욕구 수치를 맞춘다`
