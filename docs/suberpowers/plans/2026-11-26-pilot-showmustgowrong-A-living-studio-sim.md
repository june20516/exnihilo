# 방송망쳐야돼 Plan A: 살아 있는 스튜디오 (sim과 콘텐츠) Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 플레이어가 입력하지 않아도 출연자들이 버릇을 보이고, 감정이 쌓여 가끔 터지며, 로그가 앞뒤로 이어지는 이야기로 읽히는 토크쇼 sim을 만든다. 무입력 sim(spec 7.1)과 무입력 로그 읽기로 끝낸다.

**Architecture:** 감정(`sim/emotion.ts`), 버릇·터짐 판정(`sim/life.ts`), 로그 문장(`sim/narration.ts`)을 엔진 밖의 순수 모듈로 만들고, `engine.ts`는 이들을 스텝마다 호출해 결과(버릇, 단계 진입, 터짐)를 실행만 한다. 기척은 `PhenomenonEvent`의 강도 0으로 표현하되 타입(`EventIntensity`)을 갈라 강도별 표가 0을 키로 받지 못하게 한다. 극 중 시간은 스텝에서 쇼별 배율로 환산하는 파생 시계라, 슬로모션과 광고가 몸 시간과 극 중 시간을 함께 늦추고 멈춘다.

**Tech Stack:** React 19, Vite 8, TypeScript, PixiJS v8, `@dimforge/rapier3d-deterministic-compat` 0.21, Vitest, Playwright, oxlint, tsx

**Spec:** `docs/suberpowers/specs/2026-11-26-pilot-showmustgowrong-living-studio-design.md`(이하 "living spec"). 상위 spec은 `docs/suberpowers/specs/2026-11-25-pilot-showmustgowrong-design.md`(이하 "본 spec"). 둘이 겹치면 living spec이 앞선다.

**기반 코드:** 브랜치 `feat/showmustgowrong-slice`(worktree `~/.claude/suberpowers/worktrees/exnihilo/feat/showmustgowrong-slice`)의 `pilot-showmustgowrong/`, 커밋 3f2ecb5. 작업 로그 `docs/lab/worklog/pilot-showmustgowrong.md`의 Ruling과 결정 1~64는 이 plan이 바꾸지 않는 한 유효하다.

## 이 plan이 spec 위에 정한 것

living spec이 열어 둔 부분을 아래처럼 정한다. 작업 로그에 결정 65~73으로 옮겨 적는다(Task 10).

| # | 결정 | 이유 |
|---|---|---|
| L1 | 코너는 극 중 방송 길이를 3등분한다. `CORNER_STEPS`(= `BROADCAST_STEPS / 3`)는 그대로 둔다 | 극 중 길이에 비례하므로 "코너 길이를 극 중 시간으로"와 같은 뜻이다 |
| L2 | **재촉:** 로그에 극 중 40초(토크쇼 실제 4초) 동안 줄이 없으면, 다음 버릇 시각이 가장 이른 출연자가 지금 버릇을 한다 | 출연자 4명이 각자 실제 10~20초마다 버릇을 해도 실제 5초 넘는 공백이 자주 생긴다(4명이 모두 5초 창을 비켜 갈 확률 약 20%). spec 1.1 하한을 구조로 보장한다 |
| L3 | 버릇과 터짐은 자기 줄 하나만 남긴다. 그때 내뿜은 현상은 따로 줄을 찍지 않고, 그 줄이 첫 현상의 `eventId`를 가진다 | spec 4.1(버릇은 한 줄)을 터짐에도 적용해 "누가 왜 무엇을"이 한 줄에 담긴다 |
| L4 | `PerformerDef.mind`는 선택 필드다. mind가 없는 출연자는 감정·버릇·터짐이 없다. 라인업 출연자 5명은 모두 mind를 가진다(콘텐츠 테스트) | 기존 엔진 테스트의 fixture 출연자를 그대로 두어 반사 반응 테스트가 흔들리지 않는다 |
| L5 | 넘어짐·날아감·walk 이동 중, 또는 마지막 행동 뒤 몸 2초 안에는 버릇과 터짐 판정을 미룬다. 감정의 쌓임과 사라짐은 계속된다 | spec 3.4는 버릇만 말한다. 날아가는 중의 터짐은 동작이 어색하다 |
| L6 | 7.1의 범위 기준(큰 터짐 수, 출연자당 큰 터짐, 작은 터짐 수, 정적 줄 비율)은 **시드의 80% 이상**이 범위 안이면 통과로 본다. 그 밖의 기준(로그 공백, 경고 창 3초, 중단 비율, 깊이 90%, 결정론)은 spec 문구 그대로다 | 확률 시스템에서 "방송 한 회에 1~3회"를 시드 50개 전부에 요구하면 꼬리 하나로 실패한다. 사용자에게 이 해석을 확인받는다(handoff) |
| L7 | 무입력 = 입력 0개(카메라 스위처도 쓰지 않는다). 준 라인업은 모 대신 준을 무대에 올리고 모를 대기석에 둔다 | 플레이어가 가만히 둔 상태 그대로다. home spot은 4곳이다 |
| L8 | 지시의 감정 변화(`DirectiveDef.moodShifts`)는 지시받은 출연자 자신에게만 적용한다 | 이번 라인업의 지시 예시가 모두 자기 감정이다 |
| L9 | 응답 버릇은 나를 향한 현상을 인지한 뒤 다음 감정 틱(몸 0.5초 안)에 판정한다 | spec 4.3의 "몸 시간 짧은 창"을 틱 간격으로 정한다 |

## Global Constraints

- 위치는 `pilot-showmustgowrong/`. 명령은 그 폴더에서 실행한다. `any` 금지. 화면과 로그 문구는 한국어.
- 수치는 모두 `src/content/balance.ts`에 둔다. **시간 상수는 이름에 시계를 붙인다:** `_BODY_SECONDS`(몸 시간), `_SHOW_SECONDS`/`_PER_SHOW_MINUTE`(극 중 시간), `_REAL_SECONDS`(실제 시간). 주석에 토크쇼(배율 10)의 실제 초 환산과 근거(living spec 1.1의 어느 체감 목표에서 나왔는지)를 적는다.
- 시계(living spec 1절): 스텝 하나는 몸 1/60초다. 극 중 초 = 몸 초 × 쇼 배율, 쇼 배율 = 극 중 방송 길이(초) ÷ 실제 방송 길이 180초. 토크쇼는 극 중 30분 → 배율 10, 시작 21:00. 슬로모션과 광고는 기존 `Clock`과 광고 스텝(Ruling 36)이 그대로 처리한다. sim에는 실제 시간이 들어오지 않는다.
- 결정론: 같은 시드와 같은 입력이면 같은 결과(리플레이). 감정과 버릇은 기존 `rng`와 **분리된** 난수 흐름을 쓴다. 기존 반응·엇나감·카메라 난수의 소비 순서를 바꾸지 않는다.
- `src/sim`은 `src/render`와 `src/app`에 의존하지 않는다. 감정·버릇·문장 모듈은 물리(`physics.ts`)에 의존하지 않는다.
- 기척(강도 0)은 반사 반응, 관객, 스태프, 시청률, 수위 게이지, 자동 슬로모션, 정적 깨기, 최근 현상 표시, 연쇄 깊이 통계에 들어가지 않는다(living spec 2절).
- 연쇄 깊이: 강도 1 이상 = 원인 깊이 + 1(원인이 없거나 광고 전이면 1). 기척 = 원인 깊이 그대로(원인이 없거나 광고 전이면 0).
- 체감 목표(living spec 1.1)는 Task 4·5의 테스트로 고정한다. Task 10에서 수치를 조정할 때도 이 테스트가 통과하는 범위 안에서만 바꾼다.
- 화면은 기존 것을 유지하되 새 데이터로 깨지지 않게만 한다. 이 plan의 화면 변경은 극 중 시계 표시, 로그 줄 종류 색과 묶음 표시, 긴장도 막대를 대표 감정 막대로 바꾸는 것뿐이다. 머리 위 감정 아이콘, 정보 카드, 판단 카드의 감정 변화 표기, 정산 뿌리 한 줄 표시는 Plan B다.

## Review Focus

1. 응답 버릇이나 터짐의 대상(원인 출연자, 가장 크게 기여한 출연자)이 그 사이에 이탈하거나 광고로 대기석에서 바뀜 → 대상 없이 실행하고 오류가 나지 않는다(Task 5, Task 7).
2. 큰 터짐 유예 중에 재정비 광고 → 단계와 이유가 초기화돼 광고 뒤 그 감정으로 바로 터지지 않는다. 재정비 없는 광고 → 감정은 남고, 광고 뒤 터짐의 연쇄 깊이는 1부터 다시 센다(Task 7).
3. 감정 값이 내려가는 문턱 근처에서 오르내림 → 단계 진입 줄이 반복해서 찍히지 않고 유예가 다시 시작되지 않는다(Task 4, Task 5).
4. mind가 없는 출연자와 mind가 있는 출연자가 한 방송에 섞임 → mind가 없으면 `mood`가 null이고 버릇이 없으며 view와 리플레이가 정상이다(Task 7).
5. 감정 변화가 있는 지시가 엇나감(overdo·awkward)과 함께 들어간 방송을 입력 기록으로 리플레이 → 같은 결과다(Task 8).

---

### Task 1: 극 중 시계

**Files:**
- Create: `src/sim/showClock.ts`, `src/sim/showClock.test.ts`
- Modify: `src/content/types.ts`(`ShowDef`), `src/content/talkShow.ts`, `src/content/balance.ts`, `src/content/validate.ts`, `src/content/validate.test.ts`, `src/sim/engine.ts`(정적), `src/app/labels.ts`, `src/app/Hud.tsx`, `src/app/ResultScreen.tsx`, ShowDef를 직접 만드는 테스트 fixture 전부(`grep -rln "audienceZone" src tests`로 찾는다)

**Interfaces:**
- Produces (`types.ts`): `ShowDef`에 `showMinutes: number`(극 중 방송 길이, 분), `startTime: { hour: number; minute: number }`, `traits: string[]`(쇼 속성 태그, living spec 3.6) 추가
- Produces (`balance.ts`): `BROADCAST_REAL_SECONDS = 180`(그리고 `BROADCAST_STEPS = BROADCAST_REAL_SECONDS / STEP_SECONDS`로 정의를 바꾼다. 값은 10800 그대로), `SILENCE_SHOW_SECONDS: Record<Intensity, number> = { 1: 50, 2: 100, 3: 150 }`(기존 `SILENCE_SECONDS` 대체. 토크쇼 실제 5/10/15초)
- Produces (`showClock.ts`):
  - `showTimeScale(show: ShowDef): number` — `show.showMinutes * 60 / BROADCAST_REAL_SECONDS`
  - `showSecondsToSteps(showSeconds: number, show: ShowDef): number` — `Math.max(1, Math.round(showSeconds / showTimeScale(show) / STEP_SECONDS))`
  - `stepsToShowSeconds(steps: number, show: ShowDef): number`
  - `showClockMinutes(step: number, show: ShowDef): number` — 자정부터의 극 중 분(소수)
- Produces (`labels.ts`): `formatShowClock(step: number, show: ShowDef): string` — "21:07"(분 내림, 시는 24로 나눈 나머지, 두 자리), `formatShowEnd(show: ShowDef): string` — "21:30"

- [ ] **Step 1: 실패하는 테스트 작성** (`showClock.test.ts`, `validate.test.ts`)

```ts
it('토크쇼(극 중 30분)의 배율은 10이다', () => expect(showTimeScale(TALK_SHOW)).toBe(10))
it('극 중 50초는 토크쇼에서 300스텝(실제 5초), 극 중 60분 쇼에서 150스텝이다', () => {
  expect(showSecondsToSteps(50, TALK_SHOW)).toBe(300)
  expect(showSecondsToSteps(50, { ...TALK_SHOW, showMinutes: 60 })).toBe(150)
})
it('스텝 0은 21:00, 마지막 스텝은 21:30이다', () => {
  expect(showClockMinutes(0, TALK_SHOW)).toBe(21 * 60)
  expect(showClockMinutes(BROADCAST_STEPS, TALK_SHOW)).toBe(21 * 60 + 30)
})
// validate.test.ts
it('극 중 길이가 0 이하이거나 시작 시각이 범위 밖이면 오류', ...)  // '극 중 길이 오류: 0분', '시작 시각 오류: 24:00'
```

`labels` 테스트(기존 labels 테스트 파일이 없으면 `src/app/labels.test.ts` 생성): `formatShowClock(3600, TALK_SHOW) === '21:10'`, `formatShowClock(BROADCAST_STEPS, TALK_SHOW) === '21:30'`, 23:50 시작 30분 쇼의 끝은 `'00:20'`.

엔진 테스트(`engine.test.ts`의 정적 describe): 기존 "5초 뒤 silence 강도 1" 테스트는 fixture 쇼가 배율 10이라 그대로 통과해야 한다. 추가: `showMinutes: 60`인 쇼에서는 150스텝 뒤 silence 강도 1이 생긴다.

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/sim/showClock.test.ts src/content/validate.test.ts` → FAIL(모듈 없음)

- [ ] **Step 3: 구현**
  - `ShowDef` 필드 추가, `TALK_SHOW`에 `showMinutes: 30, startTime: { hour: 21, minute: 0 }, traits: ['talk', 'studioAudience']`.
  - 모든 ShowDef fixture에 같은 세 필드(traits는 `[]`)를 넣는다.
  - `validateShow`: `showMinutes > 0`, `0 ≤ hour ≤ 23`, `0 ≤ minute ≤ 59`, traits에 빈 문자열 없음.
  - 엔진의 정적 단계 비교를 `showSecondsToSteps(SILENCE_SHOW_SECONDS[i], show)`로 바꾸고 `SILENCE_SECONDS`를 지운다. `CORNER_STEPS` 주석에 L1을 적는다.
  - `Hud`의 "남은 시간"을 "방송 시각"으로 바꾸고 `21:07 / 21:30`(`formatShowClock` / `formatShowEnd`)을 보여 준다(`data-testid="broadcast-time"` 유지). 로그 시각 열과 `ResultScreen`의 연쇄 시각도 `formatShowClock`으로 바꾼다. 로그 시각 열 폭은 다섯 글자가 들어가게 넓힌다. 쓰는 곳이 없어진 `formatStepTime`, `formatRemaining`은 지운다.

- [ ] **Step 4: 통과 확인** — `npx vitest run && npx tsc -b && npm run lint && npm run e2e` → 모두 PASS, 경고 0(e2e가 시각 형식 때문에 깨지면 기대만 고친다)

- [ ] **Step 5: Commit** — `git commit -m "feat(sim): 극 중 시계와 쇼 속성, 정적 단계를 극 중 시간으로"`

---

### Task 2: 기척(강도 0)과 연쇄 깊이

**Files:**
- Modify: `src/content/types.ts`, `src/content/balance.ts`, `src/sim/phenomena.ts`, `src/sim/phenomena.test.ts`, `src/sim/describe.ts`, `src/sim/broadcast.ts`, `src/sim/engine.ts`, `src/sim/engine.test.ts`, `src/sim/engineTypes.ts`

**Interfaces:**
- Produces (`types.ts`): `type StirKind = 'noise' | 'laughter' | 'anger' | 'exposure'`, `type EventIntensity = 0 | Intensity`
- Produces (`balance.ts`): `STIR_NOISE_RADIUS = 2`(m, 소음 1의 3m보다 좁게), `STIR_SIGHT_RADIUS = 4`(m, 시야 6m보다 좁게)
- Produces (`phenomena.ts`):
  - `PhenomenonEvent.intensity: EventIntensity`, `PhenomenonEvent.label?: string`(버릇이 낸 기척의 이름 명사, 예: '킥킥거림'. narration이 쓴다)
  - `isStir(event: PhenomenonEvent): boolean`
  - `EventLog.emit`이 깊이 규칙(Global Constraints)을 따른다. `emit`의 입력 타입에 `kind`가 `StirKind`가 아닌데 강도 0이면 `throw`
  - `EventLog.rootOf(id: number): PhenomenonEvent | undefined` — 원인을 따라 원인 없는 사건까지 거슬러 간다. 광고(`breakChains`)를 넘는 연결(원인 id ≤ 끊긴 지점 < 사건 id)은 넘지 않는다. 기척도 거친다
  - `EventLog.chain`은 그대로 둔다
- Produces (`engineTypes.ts`): `BroadcastSummary.rootLine: { step: number; text: string } | null` — 가장 깊은 연쇄(강도 1 이상)의 뿌리 사건이 남긴 로그 줄. 뿌리 사건에 줄이 없으면(묵음 emit) 그 사건의 `describeEvent` 문장

- [ ] **Step 1: 실패하는 테스트 작성**

`phenomena.test.ts`:
```ts
it('원인 없는 기척의 깊이는 0, 깊이 2 사건이 원인인 기척은 2, 기척(깊이 0)이 원인인 강도 1은 1이다', ...)
it('광고 전 사건이 원인인 기척은 0, 강도 1은 1이다', ...)
it('기척 소음은 2m 안에서만, 기척 웃음은 4m 안이고 어둡지 않을 때만 인지한다', ...)
it('대상이 있는 기척 분노는 대상만 인지한다', ...)
it('rootOf는 기척을 거쳐 원인 없는 사건까지 가고, 광고로 끊긴 연결은 넘지 않는다', ...)
it('강도 0인 충격이나 어둠은 emit이 throw한다', ...)
```
`broadcast.test.ts`:
```ts
it('기척은 점수 0이고 게이지를 올리지 않는다', () => expect(score.scoreEvent(event({ kind: 'laughter', intensity: 0 }), 1, 1)).toBe(0))
```
`engine.test.ts`(기존 fixture 반응 연쇄로): `it('summary.rootLine은 가장 깊은 연쇄의 원인 없는 첫 사건 줄이다', ...)`, `it('longestChain은 광고 뒤 사건만 담는다', ...)`. 콘텐츠가 기척을 낼 길(버릇)은 Task 7에서 생기므로, 엔진 안의 기척 동작(줄 없음, 정적·점수 제외)은 Task 7 테스트가 본다.
`reactions.test.ts`: `it('기척은 min 1 반응을 일으키지 않는다(관객·스태프 포함)', ...)` — `resolveReactions`에 강도 0 웃음 이벤트와 관객 반응자를 넣으면 계획이 비어 있다.

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/sim/phenomena.test.ts src/sim/broadcast.test.ts src/sim/reactions.test.ts` → FAIL

- [ ] **Step 3: 구현**
  - `perceives`: 강도 0이면 반경을 `STIR_NOISE_RADIUS`/`STIR_SIGHT_RADIUS`로 쓴다. 강도별 표(`NOISE_RADIUS` 등)는 `Intensity` 키만 받으므로 강도 0을 먼저 분기한다(타입 오류가 분기를 강제한다).
  - `BroadcastScore.scoreEvent`: 기척이면 0을 돌려준다.
  - `describeEvent`: 기척은 문장을 만들지 않는다(엔진이 부르지 않는다). 타입상 필요하면 `throw new Error('기척은 문장이 없습니다')`.
  - 엔진: `emit`이 기척이면 로그 줄을 남기지 않고 `deepestEvent`를 갱신하지 않는다. 정적 깨기(`updateSilence`), 자동 슬로모션, `recentPhenomena`에서 기척을 뺀다(`isPhenomenonShown`이 기척이면 false). `longestChain`은 `chain`에서 강도 1 이상이고 광고 경계 뒤인 사건만 남긴다. `summary().rootLine`을 채운다(사건 id → 로그 줄은 `LogLine.eventId`로 찾는다).
  - `RecentPhenomenon.intensity`는 `Intensity` 그대로 둔다(기척은 싣지 않는다).

- [ ] **Step 4: 통과 확인** — `npx vitest run && npx tsc -b && npm run lint`

- [ ] **Step 5: Commit** — `git commit -m "feat(sim): 기척(강도 0)과 깊이 규칙, 정산 뿌리 사건"`

---

### Task 3: 감정·버릇 콘텐츠 타입과 검증

**Files:**
- Modify: `src/content/types.ts`, `src/content/validate.ts`, `src/content/validate.test.ts`
- Create: `src/content/emotions.ts`(공용 감정 4개 정의)

**Interfaces:**
- Produces (`types.ts`):

```ts
export const COMMON_EMOTIONS = ['irritation', 'excitement', 'anxiety', 'boredom'] as const
export type CommonEmotionId = (typeof COMMON_EMOTIONS)[number]
/** 공용 감정 id 또는 출연자 개인 감정 id */
export type EmotionId = string

export interface EmotionDef {
  id: EmotionId
  name: string                       // '짜증'
  stageNames: [string, string]       // ['짜증 남', '폭발 직전']
  /** 단계 진입 줄의 술어. 주어 다음에 붙는다. ['슬슬 짜증이 난다', '폭발 직전이다'] */
  stageLines: [string, string]
  /** 터짐 줄의 쌓임 문형. {reasons:을}·{reasons:에}·{reasons} 중 하나를 쓴다. 예: '{reasons:을} 참던' */
  accumulate: string
}
export interface EmotionThresholds { rise: [number, number]; fall: [number, number]; intense: number }

export type Situation =
  | { kind: 'offScreen' } | { kind: 'onScreen' } | { kind: 'silence' }
  | { kind: 'nearTag'; tag: string; present: boolean }
  | { kind: 'showTrait'; trait: string }
/** 상황 이유를 로그에 적는 말. noun: 쌓임 줄의 명사('무시'), clause: 그 상황이 가장 클 때 주어 앞 관형절('한참 화면에 안 잡힌') */
export interface ReasonLabel { noun: string; clause: string }

export type SensitivityDef =
  | { emotion: EmotionId; on: 'event'; kind: Exclude<PhenomenonKind, 'gaze' | 'silence'>;
      scope: 'perceived' | 'targetsSelf'; amount: number }
  | { emotion: EmotionId; on: 'situation'; situation: Situation; perShowMinute: number;
      fadePerShowMinute?: number; label: ReasonLabel }

/** 터짐 행동. line·targetLine은 주어 뒤 술어, targetLine은 {target}·{target:을}·{target:와}·{target:에게} 토큰을 쓴다 */
export interface BurstAction { action: ActionDef; line: string; targetLine?: string; intenseLine?: string }
export interface BurstDef { small: BurstAction; big: BurstAction }

export type HabitTarget = 'none' | 'nearestPerformer' | 'cause' | 'topContributor' | { tag: string }
export type HabitCondition =
  | { kind: 'onScreen' } | { kind: 'offScreen' }
  | { kind: 'nearTag'; tag: string; present: boolean }
  | { kind: 'showTrait'; trait: string }
  | { kind: 'stage'; emotion: EmotionId; atLeast: 1 | 2 }
export interface HabitDef {
  id: string
  line: string          // 주어 뒤 술어: '코를 판다'
  targetLine?: string   // '{target:을} 보며 킥킥댄다'
  recall: string        // '코를 파던'
  noun: string          // '코 파기' — 기척의 label, 쌓임·원인 받기 줄의 명사
  pose: Pose
  move?: MoveDef
  stir?: { kind: StirKind; target: HabitTarget }
  weight: number
  boost?: { emotion: EmotionId; factor: number }   // 가중치 × (1 + factor × 값/100)
  when?: HabitCondition[]                            // 모두 만족해야 뽑힌다
  /** 있으면 응답 버릇: 버릇 시계로는 뽑히지 않고, 나를 향한 이 종류 현상(기척 포함)을 받으면 chance로 응수한다 */
  respondsTo?: { kinds: StirKind[]; chance: number }
}
export interface MoodShift { emotion: EmotionId; amount: number }
export interface MindDef {
  /** 공용 4개 + 개인 0~2개. 공용은 emotions.ts의 COMMON_EMOTION_DEFS를 펼쳐 넣는다 */
  emotions: EmotionDef[]
  baseline?: Partial<Record<EmotionId, number>>
  thresholds?: Partial<Record<EmotionId, EmotionThresholds>>
  sensitivities: SensitivityDef[]
  bursts: Record<EmotionId, BurstDef>
  habits: HabitDef[]
}
// PerformerDef.mind?: MindDef     DirectiveDef.moodShifts?: MoodShift[]
```

- Produces (`emotions.ts`): `COMMON_EMOTION_DEFS: readonly EmotionDef[]`(아래 표), `DEFAULT_THRESHOLDS: EmotionThresholds`는 balance에 둔다(Task 4)

| id | name | stageNames | stageLines | accumulate |
|---|---|---|---|---|
| irritation | 짜증 | 짜증 남 / 폭발 직전 | 슬슬 짜증이 난다 / 폭발 직전이다 | `{reasons:을} 참던` |
| excitement | 흥분 | 들뜸 / 주체 못 함 | 들썩이기 시작한다 / 주체를 못 한다 | `{reasons:에} 들뜬` |
| anxiety | 불안 | 불안함 / 패닉 직전 | 불안한 눈치다 / 패닉 직전이다 | `{reasons:에} 겁먹은` |
| boredom | 지루함 | 지루함 / 딴짓 직전 | 지루한 기색이다 / 딴짓 직전이다 | `{reasons:에} 지친` |

- Produces (`validate.ts`): `validateShow`가 mind가 있는 출연자마다 아래를 검사한다. 오류 문구 형식은 `<무엇> 오류: <값> (<출연자 id>)`.
  1. 공용 감정 4개가 모두 있고 개인 감정은 0~2개, id 중복 없음
  2. 모든 감정에 `bursts` 항목이 있고, 없는 감정을 가리키는 `bursts`·`sensitivities`·`baseline`·`thresholds`·`boost`·`stage` 조건·`moodShifts`가 없음
  3. 문턱: `0 < fall[i] < rise[i] ≤ 100`, `rise[0] < rise[1]`, `fall[0] < fall[1]`, `rise[1] ≤ intense ≤ 100`
  4. 민감도: event의 `amount ≠ 0`, situation의 `perShowMinute > 0`, `fadePerShowMinute`(있으면) `> 0`, label 두 필드 비지 않음
  5. 버릇: 1개 이상, `line`·`recall`·`noun` 비지 않음, `weight > 0`, `respondsTo.chance ∈ (0, 1]`, `respondsTo.kinds` 비지 않음, `{ tag }` 대상·`nearTag` 조건의 태그는 출연자 태그 중에 있음, 버릇 id 중복 없음, 응답이 아닌 버릇이 1개 이상(버릇 시계가 뽑을 것이 있어야 한다)
  6. 문형: `targetLine`에 `{target`이 있음, `accumulate`에 `{reasons`가 있음, 알 수 없는 토큰(`{` 다음이 `target`·`reasons`가 아님) 없음
  7. 지시의 `moodShifts.amount ≠ 0`

- [ ] **Step 1: 실패하는 테스트 작성** — `validate.test.ts`에 위 1~7 각각을 깨는 fixture로 테스트 하나씩(`it('개인 감정이 3개면 오류', ...)` 등). 정상 fixture(공용 4 + 개인 1, 버릇 2개)는 오류가 없다.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/content/validate.test.ts` → FAIL
- [ ] **Step 3: 구현** — 위 타입과 검사. 토큰 파서는 Task 6의 narration과 같은 규칙(`/\{(target|reasons)(?::(을|에|와|에게))?\}/g`)을 쓰므로 정규식을 `src/content/templateTokens.ts`에 `TEMPLATE_TOKEN`으로 두고 둘이 공유한다.
- [ ] **Step 4: 통과 확인** — `npx vitest run && npx tsc -b && npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "feat(content): 감정·버릇·지시 감정 변화 타입과 로드 검증"`

---

### Task 4: 감정 엔진 (`sim/emotion.ts`)

출연자 한 명의 감정 상태. 난수를 쓰지 않는다. 시간은 스텝으로 받고 쇼 배율로 극 중 시간을 계산한다.

**Files:**
- Create: `src/sim/emotion.ts`, `src/sim/emotion.test.ts`
- Modify: `src/content/balance.ts`

**Interfaces:**
- Consumes: Task 1 `showTimeScale`, `stepsToShowSeconds`; Task 2 `PhenomenonEvent`, `EventIntensity`; Task 3 타입
- Produces (`balance.ts`, 근거 주석 필수):

| 상수 | 값 | 근거(토크쇼 배율 10) |
|---|---|---|
| `DEFAULT_THRESHOLDS` | rise [50, 80], fall [40, 70], intense 95 | 히스테리시스 10 |
| `SITUATION_REFERENCE_PER_SHOW_MINUTE` | 6 | 0→50이 극 중 8.3분 = 실제 50초(목표 40~60초), 50→80이 극 중 5분 = 실제 30초(목표 20~40초) |
| `SITUATION_FADE_PER_SHOW_MINUTE` | 12 | 조건이 끝나면 쌓인 속도의 2배로 빠진다(50이 실제 25초에 0) |
| `SITUATION_CAP` | 100 | |
| `EVENT_REASON_SHOW_SECONDS` | 180 | 사건 이유가 실제 18초에 걸쳐 0으로 줄어든다(버릇 간격 10~20초와 겹쳐 쌓일 수 있게) |
| `INTENSITY_EMOTION_FACTOR` | {0: 0.4, 1: 1, 2: 2, 3: 3} | 기척은 강도 1의 0.4배 |
| `REPEAT_MULTIPLIERS` | [1, 0.6, 0.35, 0.2] | 같은 이유가 살아 있는 개수별 배율, 넘으면 마지막 값(림월드 중첩) |
| `SMALL_BURST_KEEP` | 0.6 | 작은 터짐은 그 감정의 양수 이유를 0.6배로 줄인다(55 → 33, 1단계 아래로) |
| `RELIEF_AMOUNT` | −40 | 후련함 |
| `RELIEF_SHOW_SECONDS` | 600 | 실제 60초에 걸쳐 0으로 |

- Produces (`emotion.ts`):

```ts
export type ReasonSource =
  | { type: 'event'; event: PhenomenonEvent }
  | { type: 'situation'; key: string; label: ReasonLabel }
  | { type: 'directive'; label: string }
  | { type: 'relief' }
export interface Reason { emotion: EmotionId; source: ReasonSource; amount: number }  // amount: 지금 기여(양수·음수)
export interface StageChange { emotion: EmotionId; from: 0 | 1 | 2; to: 0 | 1 | 2 }
export interface ActiveSituations { onAir: boolean; silence: boolean; nearTags: readonly string[]; showTraits: readonly string[] }

export class Mind {
  constructor(def: MindDef, show: ShowDef, step: number)
  /** 인지한 사건 하나. targetsSelf는 event.targetId === 자신 id. 맞는 민감도마다 사건 이유를 더한다 */
  perceive(event: PhenomenonEvent, targetsSelf: boolean, step: number): void
  addDirective(shifts: readonly MoodShift[], label: string, step: number): void
  /** 마지막 advance부터 step까지 이유를 갱신하고 단계를 다시 정한다. 바뀐 단계만 돌려준다 */
  advance(situations: ActiveSituations, step: number): StageChange[]
  value(emotion: EmotionId): number            // clamp(baseline + Σ amount, 0, 100)
  stage(emotion: EmotionId): 0 | 1 | 2
  stage2Since(emotion: EmotionId): number | null   // 2단계에 들어선 스텝
  /** 그 감정에서 amount가 양수인 이유를 큰 순서로(같으면 먼저 생긴 순서) n개 */
  topReasons(emotion: EmotionId, n: number): Reason[]
  relieveSmall(emotion: EmotionId): void        // 양수 이유 × SMALL_BURST_KEEP
  catharsis(emotion: EmotionId, step: number): void   // 양수 이유 제거 + relief 이유
  reset(step: number): void                     // 모든 이유 제거, 단계 0
  readonly emotions: readonly EmotionDef[]
}
```

규칙(signature가 정하지 못하는 것):
- 사건 이유: 처음 양 = `amount × INTENSITY_EMOTION_FACTOR[intensity] × REPEAT_MULTIPLIERS[같은 이유가 살아 있는 개수]`. 같은 이유 = 같은 감정 + 같은 `event.sourceId` + 같은 `event.kind`. `EVENT_REASON_SHOW_SECONDS` 동안 선형으로 0까지 줄고 0이 되면 지운다.
- 지시 이유: 사건 이유와 같은 수명, 반복 배율은 같은 감정 + 같은 지시 label 기준.
- 상황 이유: (감정, 상황 키) 하나에 누적기 하나. 조건이 참인 동안 `perShowMinute × 극 중 분`만큼 늘고(`SITUATION_CAP`까지), 거짓이면 `fadePerShowMinute ?? SITUATION_FADE_PER_SHOW_MINUTE`로 줄며 0 이하면 지운다. 상황 키는 `offScreen`, `onScreen`, `silence`, `nearTag:<tag>:<present>`, `showTrait:<trait>`. `nearTag`는 `present`가 true면 그 태그가 `nearTags`에 있을 때 참, false면 없을 때 참.
- relief 이유: `RELIEF_AMOUNT`에서 `RELIEF_SHOW_SECONDS` 동안 선형으로 0까지.
- 단계(히스테리시스): 올라갈 때 `value ≥ rise[0]` → 1, `≥ rise[1]` → 2(0에서 2로 바로 갈 수 있다). 내려갈 때 2는 `value < fall[1]`이면 1, 1은 `value < fall[0]`이면 0(2에서 0으로 바로 갈 수 있다). 2에 새로 들어선 스텝을 `stage2Since`에 적고, 2를 벗어나면 null.
- 감정의 문턱은 `def.thresholds?.[id] ?? DEFAULT_THRESHOLDS`.

- [ ] **Step 1: 실패하는 테스트 작성** (`emotion.test.ts`, 쇼는 `TALK_SHOW`, 1초 = 60스텝)

```ts
describe('체감 목표(living spec 1.1)', () => {
  // 기준 상황(offScreen, SITUATION_REFERENCE_PER_SHOW_MINUTE)이 계속 참이면
  it('평온에서 1단계까지 실제 40~60초', ...)   // 0.5초 간격 advance, 1단계가 된 실제 초 t: 40 ≤ t ≤ 60
  it('1단계에서 2단계까지 실제 20~40초', ...)
})
it('사건 이유는 실제 18초 동안 선형으로 줄어 사라진다', ...)          // 9초 뒤 절반
it('같은 사람의 같은 종류 사건이 겹치면 1, 0.6, 0.35, 0.2배로 쌓인다', ...)
it('기척 사건은 강도 1의 0.4배다', ...)
it('scope targetsSelf 민감도는 나를 향한 사건에만 맞는다', ...)
it('상황이 끝나면 초당 실제 2배 속도로 빠지고 0이 되면 이유가 사라진다', ...)
it('fadePerShowMinute가 있으면 그 속도로 빠진다', ...)
it('nearTag present:false는 그 태그가 근처에 없을 때만 쌓인다', ...)
it('1단계에서 값이 42와 48을 오가면 1단계를 유지하고 단계 변화가 없다', ...)  // Review Focus 3
it('0단계에서 값이 41과 49를 오가면 오르지 않고, 1단계에서 39가 되면 내려간다', ...)
it('2단계 진입 스텝을 기록하고, 72와 68을 오가면 69 아래로 내려갈 때만 null이 된다', ...)
it('relieveSmall은 양수 이유를 0.6배로, catharsis는 양수 이유를 지우고 -40 후련함을 붙인다', ...)
it('topReasons는 기여가 큰 순서이고 음수(후련함)는 빼고 출처를 기억한다', ...)
it('reset은 이유와 단계를 모두 지운다', ...)
it('baseline과 문턱 덮어쓰기를 쓴다', ...)
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/sim/emotion.test.ts` → FAIL
- [ ] **Step 3: 구현** — 위 규칙. 이유 목록은 배열, 갱신은 `advance`에서만 한다(`perceive`·`addDirective`는 추가만).
- [ ] **Step 4: 통과 확인** — `npx vitest run src/sim/emotion.test.ts && npx tsc -b && npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "feat(sim): 감정 엔진(이유, 반복 배율, 상황, 히스테리시스 단계, 후련함)"`

---

### Task 5: 스튜디오 생활 (`sim/life.ts`): 터짐, 버릇, 응답, 재촉

모든 출연자의 `Mind`, 감정·버릇 난수, 버릇 시계를 가진다. 엔진은 매 스텝 `perceive`, 틱 스텝마다 `tick`을 부르고 돌려받은 출력을 실행한다.

**Files:**
- Create: `src/sim/life.ts`, `src/sim/life.test.ts`
- Modify: `src/content/balance.ts`, `src/kit/rng.ts`, `src/kit/rng.test.ts`

**Interfaces:**
- Consumes: Task 4 `Mind`, Task 1 시계 함수, Task 2 `perceives`·`isStir`
- Produces (`rng.ts`): `forkSeed(seed: number, salt: number): number` — 같은 입력이면 같은 값, salt가 다르면 다른 흐름(테스트: 첫 값 10개가 원래 흐름과 다르다)
- Produces (`balance.ts`):

| 상수 | 값 | 근거 |
|---|---|---|
| `LIFE_TICK_BODY_SECONDS` | 0.5 | 확률 판정 주기(living spec 3.3) |
| `SMALL_BURST_MTB_SHOW_SECONDS` | 120 | 1단계 이상에서 평균 실제 12초에 한 번 |
| `SMALL_BURST_COOLDOWN_SHOW_SECONDS` | 120 | |
| `BIG_BURST_GRACE_BODY_SECONDS` | 3 | living spec 1.1 |
| `BIG_BURST_MTB_BODY_SECONDS` | 8 | 틱 확률 p = 1 − e^(−0.5/8) ≈ 0.061 → 유예 뒤 평균 0.5/p ≈ 8.25초(목표 8초 이상) |
| `STAGE_LINE_COOLDOWN_SHOW_SECONDS` | 120 | 같은 감정·같은 단계 진입 줄은 실제 12초에 한 번 |
| `NEAR_RADIUS` | 3.5 | m. 이웃 home spot(2.5~3m)만 근처 |
| `HABIT_INTERVAL_SHOW_SECONDS` | { min: 100, max: 200 } | 실제 10~20초(목표 그대로) |
| `HABIT_BOREDOM_SHORTEN` | 0.4 | 간격 × (1 − 0.4 × 지루함/100) |
| `HABIT_COOLDOWN_SHOW_SECONDS` | 300 | 같은 버릇은 실제 30초 안에 다시 안 나온다 |
| `HABIT_REST_AFTER_ACTION_BODY_SECONDS` | 2 | L5 |
| `RESPONSE_COOLDOWN_SHOW_SECONDS` | 60 | 응답 뒤 실제 6초는 다시 응답하지 않는다 |
| `LOG_NUDGE_SHOW_SECONDS` | 40 | L2. 틱 0.5초를 더해도 공백이 실제 5초를 넘지 않는다 |
| `RECALL_SHOW_SECONDS` | 120 | 회상(living spec 5.2-2)이 붙는 범위, 실제 12초 |
| `LIFE_RNG_SALT` | 0x6c696665 | |

- Produces (`life.ts`):

```ts
export interface LifeMember {        // 엔진이 틱마다 넘기는 출연자 상태(활동 중인 무대 출연자만)
  id: string; x: number; y: number; z: number
  onAir: boolean
  resting: boolean                   // L5
  nearTags: readonly string[]        // NEAR_RADIUS 안 다른 활동 출연자의 태그
}
export interface LifeContext { step: number; silence: boolean; members: readonly LifeMember[]; lastLineStep: number }
export type HabitTargetResolved =
  | { kind: 'actor'; id: string }                                    // cause·topContributor
  | { kind: 'selector'; selector: 'nearestPerformer' | { tag: string } }
  | null
export type LifeOutput =
  | { type: 'stage'; actorId: string; emotion: EmotionDef; stage: 1 | 2 }
  | { type: 'burst'; actorId: string; emotion: EmotionDef; size: 'small' | 'big';
      burst: BurstAction; intense: boolean; cause: PhenomenonEvent | null; top: Reason[] }
  | { type: 'habit'; actorId: string; habit: HabitDef; target: HabitTargetResolved;
      cause: PhenomenonEvent | null }
export interface BurstRecord { step: number; actorId: string; emotion: EmotionId; size: 'small' | 'big'; stage2Step: number | null }
export interface MoodView { emotion: EmotionId; name: string; stage: 0 | 1 | 2; stageName: string | null; value: number }
export interface EmotionView { id: EmotionId; name: string; value: number; stage: 0 | 1 | 2; rise: [number, number]; reasons: Reason[] }

export class StudioLife {
  constructor(show: ShowDef, seed: number)
  join(def: PerformerDef, step: number): void      // mind가 없으면 아무것도 안 한다
  leave(id: string): void                           // 이탈·벤치: 감정·버릇 멈춤
  has(id: string): boolean
  /** 매 스텝: 직전 스텝 이벤트 중 각 출연자가 인지한 것을 Mind에 넣고, 나를 향한 응답 대상이면 대기열에 둔다 */
  perceive(events: readonly PhenomenonEvent[], perceivers: readonly Perceiver[], step: number): void
  isTickStep(step: number): boolean                 // step % 틱 스텝 수 === 0
  tick(context: LifeContext): LifeOutput[]
  addDirective(actorId: string, shifts: readonly MoodShift[], label: string, step: number): void
  resetAll(step: number): void                      // 재정비: 감정·후련함·단계·버릇 시계·응답 대기·쿨다운
  recentHabit(actorId: string, step: number): HabitDef | null   // RECALL_SHOW_SECONDS 안의 마지막 버릇
  mood(actorId: string): MoodView | null            // 대표 감정(living spec 6)
  emotions(actorId: string): EmotionView[]
  burstRecords(): BurstRecord[]
}
```

`tick` 순서(출연자는 `context.members` 순서):
1. 각 출연자 `mind.advance(situations, step)` → 0→1, 1→2, 0→2 변화마다(도착 단계 하나만) `STAGE_LINE_COOLDOWN` 밖이면 `stage` 출력.
2. resting이 아닌 출연자마다 터짐 판정, 한 틱에 출연자당 최대 1회. 감정 정의 순서로 먼저 **큰 터짐**: 2단계이고 `step − stage2Since ≥ 유예 스텝`이면 `p_big`으로 굴린다. 성공하면 `intense = value ≥ intense 문턱`, 행동은 intense면 강도 2인 emit을 3으로 올린 사본, `cause`는 `topReasons(1)`이 사건 이유면 그 사건 아니면 null, `catharsis`, 기록. 큰 터짐이 없으면 같은 순서로 **작은 터짐**: 1단계 이상이고 작은 터짐 쿨다운 밖이면 `p_small = 1 − e^(−Δ/MTB)`(Δ = 틱의 극 중 초)로 굴린다. 성공하면 `relieveSmall`, 기록.
3. 응답 대기열: resting이 아니고 응답 쿨다운 밖이며 그 현상 종류를 받는 응답 버릇이 있고 조건을 만족하면 `chance`로 굴린다(버릇이 여럿이면 가중치로 하나). 성공하면 `habit` 출력(`cause` = 받은 현상, `cause` 대상은 그 현상의 `sourceId`가 `has()`면 actor 아니면 null). 대기열은 틱마다 비운다. 출연자당 대기 현상은 마지막 것 하나.
4. 버릇 시계: `step ≥ nextHabitStep`이고 resting이 아니면 응답이 아닌 버릇 중 조건을 만족하고 쿨다운 밖인 것을 가중치(boost 반영)로 하나 뽑는다. 뽑을 것이 없으면 다음 틱에 다시 본다. 2·3에서 이번 틱에 이미 이 출연자의 출력이 있으면 버릇을 다음 틱으로 미룬다(시각은 그대로). 버릇을 뽑았을 때만 다음 시각을 `step + 균등(min, max) × 지루함 단축`(극 중 초 → 스텝)으로 정한다.
5. 재촉(L2): 이번 틱 출력이 없고 `step − lastLineStep ≥ 재촉 스텝`이면, resting이 아니고 뽑을 버릇이 있는 출연자 중 `nextHabitStep`이 가장 이른 출연자가 4를 지금 한다.

난수는 `createRng(forkSeed(seed, LIFE_RNG_SALT))` 하나만 쓰고, 굴리는 순서는 위 순서 그대로다. `join` 때 첫 버릇 시각도 이 난수로 정한다. 대상 해석: `cause` → 응답이면 받은 현상의 source, 아니면 null; `topContributor` → 지금 값이 가장 높은 감정의 `topReasons(1)`이 사건 이유이고 그 source가 `has()`면 actor, 아니면 null. 대표 감정: 단계가 가장 높은 감정, 같으면 다음 올라가는 문턱(2단계면 intense)까지 가장 가까운 것, 그것도 같으면 정의 순서.

- [ ] **Step 1: 실패하는 테스트 작성** (`life.test.ts`. 물리 없이 `LifeContext`를 직접 만든다. 출연자 fixture는 Task 3 타입으로 테스트 파일 안에 둔다)

```ts
describe('체감 목표', () => {
  it('2단계 진입 뒤 몸 3초 안에는 큰 터짐이 없다(시드 200개)', ...)
  it('유예 뒤 큰 터짐까지 평균이 몸 8초 이상이다(시드 200개, 2단계 유지)', ...)
  it('버릇 간격은 지루함 0이면 실제 10~20초, 지루함 100이면 6~12초다', ...)
})
it('재촉: 줄이 없으면 실제 4초(+틱) 안에 누군가 버릇을 한다', ...)
it('resting인 출연자는 버릇과 터짐을 미루고 감정은 계속 쌓인다', ...)
it('큰 터짐은 이유를 지우고 후련함을 붙여 곧바로 다시 터지지 않는다', ...)
it('큰 터짐 값이 95 이상이면 intense이고 강도 2 emit이 3이 된다', ...)
it('터짐의 cause는 가장 큰 이유가 사건이면 그 사건, 상황이면 null이다', ...)
it('단계 진입 줄은 같은 감정·단계에 실제 12초 안에 두 번 나오지 않는다', ...)   // Review Focus 3
it('응답 버릇: 나를 향한 기척 웃음을 받으면 다음 틱에 chance로 응수하고 대상은 웃은 사람이다', ...)
it('응답 쿨다운 안에는 다시 응답하지 않아 주고받기가 끝난다', ...)
it('응답 대상이 그 사이에 leave했으면 대상 없이(null) 응답한다', ...)   // Review Focus 1
it('조건(offScreen, nearTag, stage, showTrait)을 만족하지 않는 버릇은 뽑히지 않는다', ...)
it('같은 버릇은 실제 30초 안에 다시 뽑히지 않는다', ...)
it('resetAll 뒤에는 단계 0이고 2단계 유예 중이던 감정도 터지지 않는다', ...)   // Review Focus 2
it('mind가 없는 출연자는 join해도 has가 false이고 mood가 null이다', ...)
it('대표 감정은 높은 단계, 같으면 다음 문턱에 가까운 쪽이다', ...)
it('같은 시드와 같은 컨텍스트 열이면 같은 출력이다', ...)
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/sim/life.test.ts src/kit/rng.test.ts` → FAIL
- [ ] **Step 3: 구현** — 위 순서와 규칙.
- [ ] **Step 4: 통과 확인** — `npx vitest run src/sim && npx tsc -b && npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "feat(sim): 스튜디오 생활(터짐 확률, 버릇 시계, 응답, 재촉)"`

---

### Task 6: 로그 문장 (`sim/narration.ts`)

**Files:**
- Create: `src/sim/narration.ts`, `src/sim/narration.test.ts`
- Modify: `src/sim/describe.ts`(조사 함수 재사용, 필요한 조사 추가)

**Interfaces:**
- Consumes: Task 3 `TEMPLATE_TOKEN`, 타입; Task 4 `Reason`; `describe.ts`의 `withSubject`·`withObject`·`withPartner`
- Produces:

```ts
/** {target}·{target:을}·{target:와}·{target:에게}·{reasons}·{reasons:을}·{reasons:에}를 채운다. 을/와는 받침에 따라 바꾼다 */
export function fillTemplate(template: string, values: { target?: string; reasons?: string }): string
/** 출처 이름표: 사건 → '<source 이름>의 <label ?? KIND_NOUNS[kind]>', 상황 → label.noun, 지시 → "PD의 '<label>'" */
export function reasonNoun(reason: Reason, nameOf: (id: string) => string): string
/** '아까 코를 파던 렉스가' 또는 '렉스가' */
export function subjectPhrase(name: string, recall: HabitDef | null): string
export function habitLine(name: string, habit: HabitDef, targetName: string | null,
  received: { sourceName: string; noun: string } | null): string
export function stageLine(name: string, recall: HabitDef | null, emotion: EmotionDef, stage: 1 | 2): string
export function burstLine(name: string, recall: HabitDef | null, emotion: EmotionDef, burst: BurstAction,
  targetName: string | null, intense: boolean, top: readonly Reason[], nameOf: (id: string) => string): string
export const KIND_NOUNS: Record<Exclude<PhenomenonKind, 'gaze' | 'silence'>, string>
// { noise: '소란', laughter: '웃음', anger: '화', impact: '충돌', darkness: '어둠', exposure: '민망한 모습' }
```

문장 규칙(living spec 5.2):
- `habitLine`: 술어 = targetName이 있고 `targetLine`이 있으면 targetLine 채움, 아니면 `line`. `received`가 있으면 앞에 `'<sourceName>의 <noun>에 '`. 결과: `'프리야의 킥킥거림에 오카포가 헛기침을 한다'`.
- `stageLine`: `subjectPhrase + ' ' + stageLines[stage-1]` → `'아까 코를 파던 렉스가 카메라를 힐끔거린다'`.
- `burstLine`: 술어 = intense이고 `intenseLine`이 있으면 그것, 아니면 target 규칙(habitLine과 같다). 주어 앞:
  - `top[0]`이 상황: `'<clause> <name>이/가'` → `'한참 화면에 안 잡힌 렉스가 카메라로 돌진한다'`
  - `top[0]`이 지시: `"PD의 '<label>'에 <name>이/가"` → `"PD의 '반박하세요'에 오카포가 버럭 화를 낸다"`
  - `top[0]`이 사건: `fillTemplate(accumulate, { reasons })`, reasons = 상위 2개 이유의 `reasonNoun`을 `withPartner`로 잇는다 → `'프리야의 킥킥거림과 무시를 참던 오카포가 폭발한다'`
  - top이 비면 `subjectPhrase(name, recall)` → `'아까 코를 파던 렉스가 카메라로 돌진한다'`
- 터짐 줄은 쌓임이 회상보다 앞선다(living spec 5.2의 3이 2보다 구체적이다). 회상은 이유가 없을 때만 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성** — 위 예문 그대로를 기대값으로 쓴다. 추가:

```ts
it('받침 없는 대상은 를/와, 받침 있는 대상은 을/과', () => {
  expect(fillTemplate('{target:을} 본다', { target: '모' })).toBe('모를 본다')
  expect(fillTemplate('{target:와} 논다', { target: '렉스' })).toBe('렉스와 논다')
  expect(fillTemplate('{target:을} 본다', { target: '오카포' })).toBe('오카포를 본다')
  expect(fillTemplate('{reasons:을} 참던', { reasons: '정적' })).toBe('정적을 참던')
})
it('대상이 필요한 문형인데 대상이 없으면 line을 쓴다', ...)
it('지시 이유 명사는 PD의 지시 이름이다', ...)
it('기척 사건의 명사는 label이고, label이 없으면 종류 명사다', ...)
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/sim/narration.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — `npx vitest run src/sim/narration.test.ts && npx tsc -b && npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "feat(sim): 로그 문장(원인 받기, 회상, 쌓임, 문형 토큰)"`

---

### Task 7: 엔진에 생활 연결, 로그 줄 종류, 대표 감정 view, 긴장도 퇴역

**Files:**
- Modify: `src/sim/engine.ts`, `src/sim/engineTypes.ts`, `src/sim/cast.ts`(필요하면), `src/content/balance.ts`, `src/render/StudioRenderer.ts`, `src/app/screens.test.tsx` 등 `ActorView`·`LogLine` fixture를 만드는 테스트
- Create: `src/sim/engine.life.test.ts`
- Delete: `src/sim/tension.ts`, `src/sim/tension.test.ts`(`viewersTrendOf`와 그 테스트는 `src/sim/broadcast.ts`·`broadcast.test.ts`로 옮긴다)

**Interfaces:**
- Consumes: Task 5 `StudioLife`와 출력, Task 6 문장 함수, Task 2 `rootOf`
- Produces (`engineTypes.ts`):
  - `type LogKind = 'habit' | 'stage' | 'incident' | 'staff' | 'silence'`
  - `LogLine`에 `kind: LogKind`, `emotion: EmotionId | null`(stage·감정 터짐 줄의 감정), `repeat: number`(묶인 횟수, 1부터)
  - `ActorView`에서 `tension`, `aboutToBurst`를 지우고 `mood: MoodView | null`, `emotions: EmotionView[]`(mind 없으면 빈 배열) 추가
- Produces (`engine.ts`): `burstRecords(): BurstRecord[]`
- Produces (`balance.ts`): `TENSION_WINDOW_SECONDS`, `BURST_WARNING_TENSION` 제거

연결 규칙:
- 생성자에서 `new StudioLife(show, seed)`, 무대 출연자마다 `join`. 벤치 투입(`bringInBench`) 때 `join`, 이탈(`walkOut`) 때 `leave`. 재정비(`resetCast`)에서 `resetAll`.
- `step()`에서 반응 판정(4) 다음, `fadePoses` 다음에 `runLife()`: `life.perceive(pendingEvents, 활동 출연자 Perceiver, step)` 후 `isTickStep`이면 `tick` 출력을 순서대로 실행한다.
  - `stage` → `stageLine`(회상은 `recentHabit`), kind `'stage'`, emotion, depth 1, eventId null
  - `habit` → 포즈·`poseStep`, `move`가 있으면 기존 `move`, 대상 해석(selector면 `locator.resolveTarget`), `stir`가 있으면 강도 0 현상을 `label: habit.noun`, `causeId: cause?.id ?? null`로 emit. 줄은 `habitLine`(received는 cause가 있을 때 cause의 source 이름과 cause의 `label ?? KIND_NOUNS`), kind `'habit'`, depth = 기척 깊이(기척이 없으면 cause 깊이, cause도 없으면 0), eventId = 기척 id
  - `burst` → `executeAction(member, burst.action, cause, { silent: true })`가 emit한 사건들을 돌려받는다. 줄은 `burstLine`(대상 이름은 첫 emit의 targetId, 없으면 move 대상), kind `'incident'`, emotion, depth = 첫 사건 깊이(사건이 없으면 cause 깊이 + 1, cause가 없으면 1), eventId = 첫 사건 id(L3)
  - `resting` = 넘어짐 또는 `walkGoal !== null` 또는 `step − poseStep < HABIT_REST_AFTER_ACTION_BODY_SECONDS`의 스텝
  - `nearTags` = `NEAR_RADIUS` 안의 다른 활동 출연자 태그(바닥 거리)
  - `lastLineStep` = 마지막 로그 줄의 step(줄이 없으면 0)
- `executeAction`에 `options?: { silent?: boolean }`, 반환값 `PhenomenonEvent[]`. silent면 emit이 로그 줄을 남기지 않는다(현상, 점수, 연쇄는 그대로).
- 줄 종류: 이벤트 줄은 silence → `'silence'`, 그 밖 → `'incident'`. 스태프 놀람·자리 잡음 → `'staff'`. 이탈·시선·`action.line` → `'incident'`.
- 묶기: `addLine`이 직전 줄과 `text`와 `kind`가 같으면 새 줄 대신 직전 줄의 `repeat`를 1 올리고 `step`은 처음 것을 둔다.
- `actorView`: `mood: life.mood(id)`, `emotions: life.emotions(id)`. 렌더러는 긴장도 막대를 `mood.value / 100`으로 채우고, `mood.stage === 2`면 위험 색과 "곧 터짐!" 표시(Plan B가 아이콘으로 바꾼다).

- [ ] **Step 1: 실패하는 테스트 작성** (`engine.life.test.ts`. fixture 출연자에 작은 mind를 단다: 공용 감정 4개, 상황 `silence → boredom perShowMinute 60`(빨리 오르게), 버릇 2개, 응답 버릇 1개)

```ts
it('무입력 60초 동안 mind가 있는 출연자마다 버릇 줄(kind habit)이 남는다', ...)
it('버릇 줄은 한 줄이고 기척 사건의 eventId를 가지며, 기척은 따로 줄을 찍지 않는다', ...)
it('기척은 정적을 깨지 않고 시청률·게이지를 바꾸지 않는다', ...)
it('응답 버릇 줄은 "<이름>의 <명사>에 <이름>이 …" 꼴이고 원인 연결이 이어진다', ...)
it('지루함이 2단계에 이르면 stage 줄이 남고, 큰 터짐은 incident 줄 하나에 첫 사건 id를 가진다', ...)
it('터짐 줄의 사건은 점수와 연쇄에 들어간다', ...)
it('같은 문장이 연달아 나오면 한 줄로 묶이고 repeat가 오른다', ...)
it('재정비 광고 뒤 mood는 0단계이고, 재정비 없는 광고 뒤 터짐 사건의 깊이는 1이다', ...)   // Review Focus 2
it('이탈한 출연자를 향한 응답·터짐 대상은 없음으로 처리되고 오류가 없다', ...)   // Review Focus 1
it('mind 없는 출연자는 mood가 null, emotions가 빈 배열이고 버릇 줄이 없다', ...)   // Review Focus 4
it('mind가 섞인 방송을 입력 기록으로 replay하면 view가 같다', ...)
it('mind가 있어도 mind 없는 출연자의 반사 반응 난수 소비는 그대로다', ...)
// 한 출연자는 mind 없음+chance 반응, 다른 출연자를 mind 있음/없음으로 바꿔 돌려도 첫 출연자의 반응 스텝 목록이 같다
it('summary.rootLine은 가장 깊은 연쇄를 버릇 기척까지 거슬러 올라간 줄이다', ...)
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/sim/engine.life.test.ts` → FAIL
- [ ] **Step 3: 구현** — 위 규칙. 엔진에 들어가는 코드는 연결과 실행만 둔다(판정은 `life.ts`, 문장은 `narration.ts`). `tension.ts`를 지우고 `TENSION_WINDOW_STEPS`를 쓰던 `view()`의 `recentEvents` 계산도 지운다.
- [ ] **Step 4: 통과 확인** — `npx vitest run && npx tsc -b && npm run lint` (기존 엔진·화면 테스트가 깨지면 tension 관련 기대만 mood로 바꾼다. 반사 반응 기대를 바꿔야 한다면 멈추고 원인을 본다)
- [ ] **Step 5: Commit** — `git commit -m "feat(sim): 엔진에 감정·버릇 연결, 로그 줄 종류와 묶기, 긴장도를 대표 감정으로 대체"`

---

### Task 8: 지시의 감정 변화와 엇나감

**Files:**
- Modify: `src/sim/director.ts`, `src/sim/director.test.ts`, `src/sim/engine.ts`, `src/sim/engine.life.test.ts`

**Interfaces:**
- Consumes: Task 3 `DirectiveDef.moodShifts`, Task 5 `life.addDirective`
- Produces (`director.ts`): `DirectiveOutcome`의 `executed`에 `moodShifts: MoodShift[]` 추가. 엇나가지 않으면 정의 그대로, overdo면 `amount × OVERDO_MULTIPLIER`(`OVERDO_SPEED_MULTIPLIER`를 이 이름으로 바꾸고 move 속도도 이것을 쓴다. 값 1.5 그대로), awkward면 `−amount`. 엇나감 판정은 기존 것 하나를 공유하고 난수를 더 쓰지 않는다.
- 엔진: `directPerformer`가 `executed`면 `life.addDirective(actorId, outcome.moodShifts, directive.label, step)`.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// director.test.ts
it('감정 변화는 엇나가지 않으면 그대로, overdo면 1.5배, awkward면 부호가 반대다', ...)
it('감정 변화가 있어도 엇나감 난수 소비 횟수는 같다', ...)
// engine.life.test.ts
it('지시 뒤 그 출연자 감정에 지시 이유가 생기고 topReasons의 출처가 지시다', ...)
it('지시 이유가 가장 큰 터짐 줄은 "PD의 \'<지시>\'에 <이름>이 …" 꼴이고 깊이 1이다', ...)
it('감정 변화 지시와 엇나감이 섞인 방송을 replay하면 같은 결과다', ...)   // Review Focus 5
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/sim/director.test.ts src/sim/engine.life.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — `npx vitest run && npx tsc -b && npm run lint`
- [ ] **Step 5: Commit** — `git commit -m "feat(sim): 지시의 감정 변화와 엇나감"`

---

### Task 9: 라인업 콘텐츠(감정, 버릇, 반사 반응 옮기기)와 로그 화면

**Files:**
- Create: `src/content/commonMind.ts`(공용 민감도, 공용 터짐, 공용 버릇 풀)
- Modify: `src/content/lineup.ts`, `src/content/content.test.ts`, `src/app/Hud.tsx`(로그), `tests/e2e/broadcast.spec.ts`(필요한 곳만), `src/app/hoverTipContent.test.ts`(성향 문구가 바뀌면)

**Interfaces:**
- Consumes: Task 3 타입, Task 7 `LogLine.kind`·`emotion`·`repeat`
- Produces (`commonMind.ts`): `COMMON_SENSITIVITIES: SensitivityDef[]`, `COMMON_BURSTS: Record<CommonEmotionId, BurstDef>`, `COMMON_HABITS: HabitDef[]`. 출연자 mind는 이것을 펼친 뒤 덮어쓰거나 더한다(엔진은 합치지 않는다).

**반사 반응 옮기기(living spec 3.7 표 그대로):** 렉스의 웃음 2↑ 반응, 화면 밖 8초 반응, 화면에 잡힘 반응, 오카포의 분노·웃음 반응, 모의 분노 2↑ 반응, 준의 정적 반응을 지운다. 프리야의 두 반응, 모의 충돌 반응, 준의 소음 3 반응, 모든 코너 반응은 그대로 둔다.

**공용 데이터:**

| 민감도(공용) | 감정 | 양 |
|---|---|---|
| anger perceived | anxiety | 8 |
| anger targetsSelf | irritation | 15 |
| laughter targetsSelf | irritation | 10 |
| laughter perceived | excitement | 6 |
| noise perceived | anxiety 5, excitement 4 | |
| impact targetsSelf | anxiety 15, irritation 10 | |
| darkness perceived | anxiety | 20 |
| exposure perceived | excitement | 6 |
| 상황 silence | boredom | 6/극 중 분, label { noun: '정적', clause: '긴 정적에 지친' } |

| 공용 터짐 | 작은(강도 1) | 큰(강도 2) |
|---|---|---|
| irritation | angry, anger 1 → cause. line '투덜댄다', targetLine '{target:에게} 투덜댄다' | angry, anger 2 → cause. line '버럭 화를 낸다', targetLine '{target:에게} 버럭 화를 낸다', intenseLine '욕설을 퍼붓는다! (삐—)' |
| excitement | laugh, laughter 1 → none. '웃음을 터뜨린다' | laugh, leap none 3, noise 2 → none. '자리에서 펄쩍 뛰며 환호한다' |
| anxiety | panic, noise 1 → none. '"으악" 하고 움찔한다' | panic, flee cause 5, noise 2 → none. '비명을 지르며 물러난다' |
| boredom | idle, noise 1 → none. '혼자 딴소리를 한다' | idle, walk nearestPerformer 2, noise 2 → nearestPerformer. line '엉뚱한 얘기로 끼어든다', targetLine '{target:에게} 다가가 엉뚱한 얘기로 끼어든다' |

| 공용 버릇 | line / recall / noun | 기척 | 기타 |
|---|---|---|---|
| yawn | 하품을 꾹 참는다 / 하품을 참던 / 하품 | 없음 | boost boredom 2 |
| water | 물을 한 모금 마신다 / 물을 마시던 / 물 마시기 | 없음 | |
| script | 대본을 뒤적인다 / 대본을 뒤적이던 / 대본 넘기는 소리 | noise → none | |
| clock | 시계를 힐끔 본다 / 시계를 보던 / 시계 보기 | 없음 | when stage boredom ≥ 1, boost boredom 1 |

공용 버릇 weight는 모두 1, 출연자 버릇은 2~3(대표 버릇이 더 자주 보이게).

**출연자 데이터:**

| 출연자 | 개인 감정(stageNames / stageLines / accumulate) | 민감도(공용에 더하거나 바꿈) | 터짐(공용과 다른 것) |
|---|---|---|---|
| 렉스 | attention 주목 욕구(화면 갈증 / 카메라 집착, 카메라를 힐끔거린다 / 화면에 목말라 있다, `{reasons:에} 애가 탄`) | laughter targetsSelf → irritation 25. 상황 offScreen → attention 7/분, fade 40, label { 무시, 한참 화면에 안 잡힌 }. silence → boredom 4 | attention 작은: idle, noise 1. '카메라를 향해 크게 헛기침한다'. 큰: angry, dash onAirCamera 9, anger 2 → none. '카메라로 돌진한다', intense '카메라로 돌진하며 욕설을 퍼붓는다! (삐—)' |
| 프리야 | 없음 | laughter perceived → excitement 12, noise perceived → excitement 8, anger targetsSelf → irritation 8, silence → boredom 8 | 공용 |
| 오카포 | 없음. baseline irritation 10 | laughter targetsSelf → irritation 25, anger targetsSelf → irritation 20, impact targetsSelf → anxiety 20 | irritation 큰 targetLine '{target:에게} 학위를 들먹이며 버럭한다' |
| 모 | 없음 | anger perceived → excitement 15, noise perceived → excitement 10, impact targetsSelf → excitement 25, laughter targetsSelf → irritation 5. 상황 showTrait studioAudience → excitement 2/분, label { 관객의 함성, 관객 앞에서 달아오른 } | excitement 큰: angry, leap cause 8(기존 바디슬램), emit 없음. line '허공에 바디슬램을 날린다', targetLine '{target:에게} 바디슬램을 날린다' |
| 준 | chatter 수다 욕구(입이 근질 / 수다 폭발 직전, 입이 근질거린다 / 말을 참지 못할 것 같다, `{reasons:에} 입이 근질거리던`) | silence → chatter 9/분 fade 20, label { 정적, 한참 조용한 }. noise perceived → anxiety 12. 상황 nearTag athlete present → anxiety 2/분, label { 덩치 큰 옆자리, 덩치 큰 옆자리에 앉은 }. silence → boredom 3 | chatter 작은: laugh, laughter 1 → none. '옛날 얘기를 한 토막 꺼낸다'. 큰: laugh, laughter 2 → none. '"우리 때는 말이야" 하고 옛날이야기를 늘어놓는다' |

| 출연자 버릇 | line(targetLine) / recall / noun | 기척 → 대상 | 조건·기타 |
|---|---|---|---|
| 렉스 tie | 넥타이를 고쳐 맨다 / 넥타이를 매만지던 / 넥타이 매만지기 | 없음 | |
| 렉스 nose | 코를 판다 / 코를 파던 / 코 파기 | exposure → none | when offScreen |
| 렉스 smile | 카메라 쪽으로 미소를 연습한다 / 미소를 연습하던 / 미소 연습 | 없음 | when offScreen, boost attention 2 |
| 렉스 cough | 헛기침을 한다({target:을} 보며 헛기침을 한다) / 헛기침하던 / 헛기침 | noise → { tag: guest } | |
| 렉스 laughOff(응답) | "하하, 재밌네요" 하고 웃어넘긴다 / 웃어넘기던 / 억지웃음 | laughter → cause | respondsTo laughter 0.5 |
| 프리야 giggle | 킥킥댄다({target:을} 보며 킥킥댄다) / 킥킥대던 / 킥킥거림 | laughter → { tag: guest } | weight 3 |
| 프리야 hold | 웃음을 참느라 어깨를 들썩인다 / 웃음을 참던 / 웃음 참기 | laughter → none | boost excitement 2 |
| 프리야 phone | 휴대폰을 몰래 확인한다 / 휴대폰을 보던 / 휴대폰 보기 | 없음 | when offScreen |
| 프리야 whisper | 귓속말을 한다({target:에게} 귓속말을 한다) / 귓속말하던 / 귓속말 | laughter → nearestPerformer | |
| 프리야 kidding(응답) | "농담이에요~" 하며 손을 내젓는다 / 손을 내젓던 / 너스레 | laughter → cause | respondsTo anger 0.6 |
| 오카포 glasses | 안경을 치켜올린다 / 안경을 치켜올리던 / 안경 치켜올리기 | 없음 | |
| 오카포 mutter | 논문 얘기를 꺼내려다 만다 / 중얼거리던 / 중얼거림 | noise → none | |
| 오카포 glare | 노려본다({target:을} 노려본다) / 노려보던 / 노려보기 | anger → topContributor | when stage irritation ≥ 1, boost irritation 2 |
| 오카포 card | 명함을 만지작거린다 / 명함을 만지던 / 명함 만지기 | 없음 | |
| 오카포 tie(응답) | 헛기침을 하며 넥타이를 고쳐 맨다 / 넥타이를 고쳐 매던 / 헛기침 | anger → cause | respondsTo laughter·anger 0.7 |
| 모 neck | 목을 좌우로 꺾는다(우두둑) / 목을 꺾던 / 목 꺾는 소리 | noise → none | |
| 모 flex | 관객석을 향해 이두근을 자랑한다 / 근육 자랑하던 / 근육 자랑 | laughter → none | when showTrait studioAudience, boost excitement 2 |
| 모 pat | 어깨를 툭 친다({target}의 어깨를 툭 친다) / 어깨를 치던 / 어깨 툭 | noise → nearestPerformer | |
| 모 hum | 링 입장 테마를 흥얼거린다 / 흥얼거리던 / 흥얼거림 | noise → none | |
| 모 fist(응답) | 주먹을 쥐었다 편다({target:을} 보며 주먹을 쥐었다 편다) / 주먹을 쥐던 / 주먹 쥐기 | anger → cause | respondsTo anger 0.5 |
| 준 doze | 꾸벅 존다 / 졸던 / 졸음 | 없음 | boost boredom 2 |
| 준 candyBag | 사탕 봉지를 바스락거린다 / 사탕 봉지를 만지던 / 바스락 소리 | noise → none | |
| 준 candy | 사탕을 권한다({target:에게} 사탕을 권한다) / 사탕을 권하던 / 사탕 권하기 | laughter → nearestPerformer | |
| 준 story | "우리 때는 말이야…" 하고 운을 뗀다 / 운을 떼던 / 옛날 얘기 | noise → none | boost chatter 2 |
| 준 laughAlong(응답) | 따라 웃는다({target:와} 함께 웃는다) / 따라 웃던 / 맞장구 웃음 | laughter → cause | respondsTo laughter 0.6 |

`{target}의`처럼 조사가 없는 토큰은 이름 그대로 넣는다. 버릇 pose: giggle·hold·whisper·kidding·flex·candy·story·laughAlong은 laugh, glare·fist는 angry, 나머지는 idle.

**지시 감정 변화와 지시 추가:** 렉스 stepUp attention −40, pressGuest irritation −20 / 프리야 laughBig excitement +20, cutHost excitement +10 / 오카포 rebut irritation −25, approachHost irritation +15, **새 지시** `calmDown` '진정하세요'(pose idle, emits 없음, moodShifts irritation −40, expect '짜증 ▼ 크게') / 모 flex excitement −30, approachHost excitement +20 / 준 story chatter −50. 다른 지시의 expect 끝에 감정 변화를 `(짜증 ▼)`처럼 붙인다(Plan B가 표기를 바꾼다).

**성향 문구(`tendency`) 갱신:** 렉스 '화면 밖에 오래 있으면 주목 욕구가 쌓여 카메라로 돌진. 비웃음엔 짜증', 오카포 '자기를 향한 웃음·분노에 짜증이 쌓여 기여가 큰 사람에게 버럭', 모 '분노·소음·충돌에 흥분이 쌓여 바디슬램. 충돌을 받으면 바로 바디슬램', 준 '정적이면 수다 욕구가 쌓여 옛날이야기. 소음 3이면 놀라 넘어짐', 프리야는 그대로.

**로그 화면(Hud `EventLog`):** 줄 종류 색 — habit: `text-slate-500`, stage: 감정별 색(짜증 red-300, 흥분 amber-300, 불안 sky-300, 지루함 slate-400, 개인 감정 violet-300), incident: 지금 색에 `font-semibold`, staff·silence: 지금 색. `repeat > 1`이면 줄 끝에 `×N`. depth 0 줄의 들여쓰기는 0(`logIndent`가 음수를 내지 않게).

- [ ] **Step 1: 실패하는 테스트 작성** (`content.test.ts`)

```ts
it('라인업 출연자 5명이 모두 mind를 갖고 공용 감정 4개를 가진다', ...)
it('개인 감정은 렉스 attention, 준 chatter뿐이다', ...)
it('living spec 3.7 표대로 반사 반응이 남고 옮겨졌다', ...)
// 프리야 laughter perceived·noise 3, 모 impact targetsSelf, 준 noise 3, 코너 반응만 남고
// 렉스·오카포의 event 반응과 모 anger 반응, 준 silence 반응, gaze 반응이 없다
it('출연자마다 응답이 아닌 대표 버릇이 3~5개, 응답 버릇이 1개 있다', ...)
it('버릇 문장을 narration으로 만들면 빈 토큰이 남지 않는다', ...)   // 모든 버릇·터짐 문형을 대상 있음/없음으로 채워 '{'가 없음을 확인
it('오카포는 진정하세요 지시가 있고 짜증을 40 내린다', ...)
```
기존 '모든 출연자와 스태프가 지시를 2개 이상 가진다', '바디슬램이 조명을 깨뜨린다'는 그대로 통과해야 한다(야유꾼 fixture는 mind가 없다).

- [ ] **Step 2: 실패 확인** — `npx vitest run src/content` → FAIL
- [ ] **Step 3: 구현** — 위 표 그대로. 문구를 바꾸지 않는다(바꿀 이유가 있으면 report에 적는다).
- [ ] **Step 4: 통과 확인** — `npx vitest run && npx tsc -b && npm run lint && npm run e2e`. e2e가 로그 문구·시각 형식 때문에 깨지면 기대만 고친다. 브라우저에서 `npm run dev`로 띄워 60초 동안 로그에 버릇·단계 줄이 색으로 구분돼 쌓이는지 Playwright 스크린샷 한 장(`docs/lab/worklog/assets/pilot-showmustgowrong-living-log.png`)으로 남긴다.
- [ ] **Step 5: Commit** — `git commit -m "feat(content): 라인업 감정·버릇·응답, 반사 반응을 감정으로 옮김, 로그 줄 종류 색"`

---

### Task 10: 무입력 기계 검증, 수치 조정, 로그 읽기

**Files:**
- Create: `src/sim/livingMetrics.ts`, `src/sim/livingMetrics.test.ts`
- Modify: `scripts/sim-broadcast.ts`, `src/content/balance.ts`(조정), `src/content/lineup.ts`·`commonMind.ts`(수치만 조정), `docs/lab/worklog/pilot-showmustgowrong.md`

**Interfaces:**
- Consumes: `Broadcast.view().log`(전체 줄이 필요하므로 `Broadcast.logLines(): LogLine[]`를 엔진에 추가), `burstRecords()`, `summary()`, `view().haltedBy`
- Produces (`livingMetrics.ts`):

```ts
export interface BroadcastMetrics {
  maxGapRealSeconds: number        // 방송 시작·줄들·방송 끝 사이 가장 긴 공백(스텝/60). 묶인 줄은 1줄
  silenceLineRatio: number         // kind silence 줄 수 / 전체 줄 수
  bigBursts: number; maxBigBurstsPerActor: number; smallBursts: number
  warningDelaysBodySeconds: number[]   // 큰 터짐마다 step − stage2Step
  halted: boolean; maxChainDepth: number; lineCount: number
}
export function measureBroadcast(lines: readonly LogLine[], bursts: readonly BurstRecord[],
  summary: BroadcastSummary, halted: boolean, endStep: number): BroadcastMetrics
export interface GateResult { name: string; pass: boolean; detail: string }
export function evaluateGates(runs: readonly BroadcastMetrics[]): GateResult[]
```

`evaluateGates` 기준(living spec 7.1 + L6):

| 이름 | 통과 |
|---|---|
| 로그 공백 | 모든 시드 `maxGapRealSeconds ≤ 5` |
| 정적 줄 | 시드 80% 이상 `silenceLineRatio ≤ 0.2` |
| 큰 터짐 수 | 시드 80% 이상 `1 ≤ bigBursts ≤ 3` |
| 출연자당 큰 터짐 | 시드 80% 이상 `maxBigBurstsPerActor ≤ 1` |
| 작은 터짐 수 | 시드 80% 이상 `4 ≤ smallBursts ≤ 8` |
| 중단 | 중단 시드 ≤ 10% |
| 연쇄 깊이 | 시드 90% 이상 `maxChainDepth ≤ 3` |
| 경고 창 | 모든 지연 ≥ 3, 전체 평균 ≥ 8 |

- [ ] **Step 1: 실패하는 테스트 작성** (`livingMetrics.test.ts`) — 손으로 만든 줄·기록으로 각 지표와 각 게이트의 경계(80%에서 통과, 78%에서 실패, 공백 정확히 5초 통과)를 확인한다. 결정론: 실제 라인업 시드 3으로 무입력 방송을 두 번 돌린 `measureBroadcast` 결과가 같다.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/sim/livingMetrics.test.ts` → FAIL
- [ ] **Step 3: 구현과 스크립트** — `scripts/sim-broadcast.ts`를 다시 쓴다: 입력 없이(L7) 시드 1~50 × 라인업 2개(기본, 준 라인업)를 끝까지 돌려 라인업별 시드 표와 게이트 결과를 출력하고, 실패한 게이트가 있으면 `process.exitCode = 1`. `npm run sim -- --log <seed> [june]`이면 그 방송의 전체 로그를 `21:07 ` 극 중 시각, kind, `×N`과 함께 출력한다.
- [ ] **Step 4: 실행과 조정** — `npm run sim`. 실패한 게이트가 있으면 `balance.ts`와 콘텐츠 **수치만** 조정한다(구조·규칙·문구는 바꾸지 않는다). 조정 범위: Task 4·5의 체감 목표 테스트가 계속 통과해야 한다. 민감도 양, 상황 속도(기준 6/분의 0.3~1.5배), 작은 터짐 MTB, 후련함, 버릇 가중치가 주 손잡이다. 게이트를 바꾸지 않는다. 조정마다 무엇을 왜 바꿨는지와 sim 결과 요약을 작업 로그 초안에 적는다. 수치만으로 통과할 수 없다고 판단되면(예: 큰 터짐 수와 작은 터짐 수가 서로 반대로 움직여 함께 맞출 수 없다) 멈추고 결과표와 함께 보고한다.
- [ ] **Step 5: 무입력 로그 읽기(living spec 7.2)** — `npm run sim -- --log 1`, `--log 2 june`을 끝까지 읽고 작업 로그에 적는다: 이름을 가리고도 줄만으로 출연자 다섯을 구별할 수 있는가(출연자마다 근거 줄 하나), 앞뒤가 이어지는 대목(원인 받기, 회상, 쌓임) 예시 2개, 읽기 거슬리는 반복이나 어색한 문장. 어색한 문장은 콘텐츠 문구를 고쳐도 된다(고친 것을 기록).
- [ ] **Step 6: 작업 로그 정리** — `docs/lab/worklog/pilot-showmustgowrong.md`에 "Plan A" 절: 결정 65~73(L1~L9), 최종 수치 표(바꾼 것만, 원래 값 → 최종 값, 근거), 두 라인업 게이트 결과, 로그 읽기 결과, Plan B로 넘길 것.
- [ ] **Step 7: 전체 확인** — `npx vitest run && npx tsc -b && npm run lint && npm run e2e && npm run sim` 모두 통과(sim 종료 코드 0).
- [ ] **Step 8: Commit** — `git commit -m "test(sim): 무입력 살아 있는 스튜디오 기계 검증, 수치 조정, 로그 읽기 기록"`
