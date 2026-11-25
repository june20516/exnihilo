# 방송망쳐야돼 Plan 1: 방송 한 회 수직 슬라이스 Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 토크쇼 한 회(3분)를 고정 라인업과 도형 그래픽으로 브라우저에서 끝까지 플레이할 수 있게 만든다. 물리 + 현상 규칙 연쇄, 송출과 시청률, 수위 4게이지와 방송 중단, 개입 슬로모션, 자동 슬로모션, 광고가 모두 동작해야 한다.

**Architecture:** `src/sim`은 렌더링과 분리된 순수 TS 시뮬레이션이다. Rapier 결정론 물리 월드를 60Hz 고정 스텝으로 돌리고, 현상 이벤트는 한 스텝에 한 단계씩 전파한다. `src/render`(PixiJS)는 매 프레임 sim 상태를 읽어 그리기만 하고, `src/app`(React)은 HUD와 입력을 맡는다. 입력은 모두 `BroadcastInput`으로 sim에 들어가서 결정론을 지킨다.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind 4, PixiJS v8, `@dimforge/rapier2d-deterministic-compat`, Vitest, Playwright, oxlint

**Spec:** `docs/suberpowers/specs/2026-11-25-pilot-showmustgowrong-design.md`

## 전체 로드맵 (이 문서는 Plan 1)

| Plan | 내용 | spec 장 |
|---|---|---|
| **1. 방송 한 회 수직 슬라이스** | sim 코어 전체, 토크쇼, 고정 라인업(출연자 4 + 대기 1, 스태프 1, 장비 2, 관객), 도형 그래픽, HUD | 1~5, 9.2~9.3, 9.6~9.7 일부 |
| 2. 캐릭터 애셋 | 애셋 검증 워크플로 스크립트, 15명 포즈 스프라이트, 포즈 교체와 트윈, UI 톤(8.1) | 8.1, 9.5, 10 |
| 3. 런 구조와 콘텐츠 전체 | 출연자 선택, 계약과 미션, 배치·큐시트 UI, 조건부 지시, 정산·보상·명성치, 방송 종류 4, 출연자 12, 특수 현상 | 5.1, 6, 7 |
| 4. 검증과 배포 | 현상 연결 그래프, 지배 조합 sim, 리플레이와 클립, 개발 패널, 플레이 기록, Cloudflare 배포 | 0.2, 9.4, 9.7, 11 |

Plan 1이 끝나면 설계자가 직접 한 회를 플레이해 "연쇄의 쾌감, 사후 납득, 개입의 긴장"이 싹이라도 있는지 본다. 그 판단을 받은 뒤 Plan 2를 쓴다.

## Global Constraints

- 위치: `pilot-showmustgowrong/`. 패키지 이름 `pilot-showmustgowrong`. `"type": "module"`.
- 도구 설정(tsconfig 3종, vite, vitest, oxlint, playwright)은 `pilot-was-spoken`의 파일을 복사해 시작한다. 경로 별칭 `@` → `src`.
- 공용 패키지를 만들지 않는다. `pilot-was-spoken/src/kit/core/rng.ts`와 그 테스트만 `src/kit/rng.ts`로 복사한다(spec 9.2). 기존 sim 하니스는 턴제 전용이라 가져오지 않는다.
- `any` 금지. 콘텐츠는 타입이 있는 데이터 파일로 정의하고, 수치는 모두 `src/content/balance.ts`에 둔다.
- 화면 문구는 한국어. 코드 식별자는 영어. 출연자 `name`은 한글 표기 전체(예: `렉스 캘러웨이`), `shortName`은 로그용 한글 짧은 이름(예: `렉스`). 영어 이름으로는 조사를 정할 수 없어서 로그는 `shortName`을 쓴다.
- 결정론: 무작위는 `src/kit/rng.ts` 하나로만 뽑는다. `Math.random`, `Date.now`, `performance.now`를 `src/sim`에서 쓰지 않는다. 실제 시간은 `src/sim/clock.ts`의 입력으로만 들어온다.
- 단위: 물리는 미터와 초. 스튜디오는 가로 16m × 세로 9m, 바닥 y=0, 위가 +y. 렌더 배율 80px/m.
- 고정 스텝 60Hz(`STEP_SECONDS = 1/60`). 방송 길이 3분 = 10800 스텝. 코너 3개, 각 3600 스텝.
- 슬로모션은 dt를 바꾸지 않고 실제 1초에 도는 스텝 수만 줄인다(spec 9.3).
- 게임 화면은 1280×720에서 스크롤이 없어야 한다.

## Review Focus

1. 탭을 백그라운드로 보냈다가 돌아오거나 프레임이 크게 끊김 → 게임 시간이 한꺼번에 뛰지 않는다. 한 프레임에 도는 스텝은 `MAX_STEPS_PER_FRAME`까지다(Task 8).
2. 이탈한 출연자 → 개입 대상 목록에서 사라지고, 반응·지시 대상 선택에서 제외되며, 그를 원인으로 한 대기 이벤트가 있어도 오류가 나지 않는다(Task 7).
3. 같은 스텝에 두 게이지가 동시에 상한을 넘거나, 개입 중에 상한을 넘음 → 즉시 방송 중단, 열려 있던 개입은 닫히고, 결과에는 처음 넘은 게이지 하나(동시면 정의 순서상 앞의 것)가 원인으로 남는다(Task 6, 8).
4. A가 B에게, B가 다시 A에게 반응하는 순환 → 같은 스텝 안에서 무한히 돌지 않는다. 이벤트는 다음 스텝에 전달되고, 같은 (요소, 현상) 반응은 1초 쿨다운이다(Task 5).
5. 날아간 출연자가 스튜디오 밖으로 나가거나 세트 벽에 끼임 → 벽과 천장이 막고, 넘어진 뒤 1.5초 정지하면 반드시 일어선다(Task 3).

---

### Task 1: 프로젝트 뼈대

**Files:**
- Create: `pilot-showmustgowrong/package.json`, `index.html`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.scripts.json`, `.oxlintrc.json`, `.gitignore`
- Create: `src/main.tsx`, `src/app/App.tsx`, `src/index.css`
- Create: `src/kit/rng.ts`, `src/kit/rng.test.ts` (`pilot-was-spoken/src/kit/core/rng*.ts` 복사, import 경로만 수정)
- Create: `docs/lab/worklog/pilot-showmustgowrong.md`

**Interfaces:**
- Produces: `createRng(seed: number): RngState`, `nextFloat(rng): [number, RngState]`, `nextInt(rng, min, max): [number, RngState]` (기존 시그니처 그대로)

- [ ] **Step 1:** `pilot-was-spoken`에서 설정 파일을 복사하고 이름을 바꾼다. scripts: `dev`, `build`(`tsc -b && vite build`), `lint`(`oxlint`), `test`(`vitest run`), `e2e`(`playwright test`), `sim`(`tsx --tsconfig tsconfig.app.json scripts/sim-broadcast.ts`). wrangler 설정은 Plan 4에서 만든다.
- [ ] **Step 2:** 의존성 설치.

Run: `cd pilot-showmustgowrong && npm install react react-dom pixi.js@^8 @dimforge/rapier2d-deterministic-compat tailwindcss @tailwindcss/vite && npm install -D typescript vite @vitejs/plugin-react vitest @playwright/test oxlint tsx @types/react @types/react-dom @types/node`

- [ ] **Step 3:** rng 파일 두 개를 복사하고 `App.tsx`는 제목 "방송망쳐야돼"만 그린다.
- [ ] **Step 4:** 확인.

Run: `npm test && npm run lint && npm run build`
Expected: rng 테스트 통과, lint 오류 0, 빌드 성공

- [ ] **Step 5:** 작업 로그 파일에 "Plan 1 시작, spec 경로, 로드맵 표"를 적는다.
- [ ] **Step 6:** Commit `chore(showmustgowrong): 프로젝트 뼈대`

---

### Task 2: 콘텐츠 타입, 수치, 검증

**Files:**
- Create: `src/content/types.ts`, `src/content/balance.ts`, `src/content/validate.ts`, `src/content/validate.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type PhenomenonKind = 'gaze' | 'noise' | 'impact' | 'laughter' | 'anger' | 'darkness' | 'exposure' | 'silence'`
  - `type Intensity = 1 | 2 | 3`
  - `type GaugeKind = 'sexual' | 'violence' | 'drugs' | 'language'` (정의 순서가 동시 초과 때의 우선순위)
  - `type Pose = 'idle' | 'laugh' | 'angry' | 'panic' | 'flying' | 'fallen'`
  - `type TargetSelector = 'cause' | 'self' | 'none' | 'onAirCamera' | 'nearestPerformer' | { tag: string }`
  - `type Trigger = { kind: Exclude<PhenomenonKind, 'gaze'>; min: Intensity; scope: 'perceived' | 'targetsSelf' } | { kind: 'gaze'; when: 'enter' } | { kind: 'gaze'; when: 'absentFor'; seconds: number } | { kind: 'corner'; tag: string }`
  - `interface EmitDef { kind: Exclude<PhenomenonKind, 'gaze' | 'silence'>; intensity: Intensity | 'causePlusOne'; target: TargetSelector }`
  - `interface MoveDef { type: 'dash' | 'leap' | 'flee' | 'home'; toward: TargetSelector; speed: number }`
  - `interface ActionDef { pose: Pose; move?: MoveDef; emits: EmitDef[] }`
  - `interface ReactionDef { trigger: Trigger; chance?: number; action: ActionDef }`
  - `interface DirectiveDef { id: string; label: string; action: ActionDef }`
  - `type Weight = 'light' | 'normal' | 'heavy'`, `type Tolerance = 'low' | 'normal' | 'high' | 'max'`
  - `interface PerformerDef { id: string; name: string; shortName: string; presence: 1 | 2 | 3; tolerance: Tolerance; weight: Weight; tags: string[]; reactions: ReactionDef[]; directives: DirectiveDef[]; misfire: 'overdo' | 'awkward' | 'never'; onAirGaugePerSecond?: Partial<Record<GaugeKind, number>>; hitViolenceMultiplier?: number }`
  - `interface StaffDef { id: string; name: string; shortName: string; cameraId: string; reactions: ReactionDef[]; directives: StaffDirectiveDef[] }`, `interface StaffDirectiveDef { id: string; label: string; aim: 'default' | 'audience' | 'nearestPerformer' }`
  - `interface EquipmentDef { id: string; name: string; kind: 'hangingLight' | 'setWall'; position: { x: number; y: number }; breakAt: Intensity; onBreak: EmitDef[]; darknessZone?: { minX: number; maxX: number } }`
  - `interface CameraDef { id: string; label: string; position: { x: number; y: number }; defaultAngle: number; fovDegrees: number; range: number; shotIntensity: Intensity }`
  - `interface CornerDef { label: string; startTag: string }`
  - `interface ShowDef { id: string; name: string; rating: 'TV-PG' | 'TV-14' | 'TV-MA'; corners: [CornerDef, CornerDef, CornerDef]; cameras: CameraDef[]; homeSpots: { x: number }[]; benchSpot: { x: number }; exitX: number; audienceZone: { minX: number; maxX: number } }`
- Produces (`balance.ts`): 아래 값을 `export const`로 둔다.
  - `STEP_SECONDS = 1/60`, `BROADCAST_STEPS = 10800`, `CORNER_STEPS = 3600`, `MAX_STEPS_PER_FRAME = 4`
  - `REACTION_COOLDOWN_SECONDS = 1`
  - `NOISE_RADIUS = { 1: 3, 2: 6, 3: 12 }`(m), `SIGHT_RADIUS = 6`(웃음, 노출)
  - `IMPACT_SPEED = { 1: 3, 2: 6, 3: 9 }`(상대 속도 m/s 이상)
  - `MASS_DENSITY = { light: 0.6, normal: 1, heavy: 1.8 }`, `CAPSULE = { halfHeight: 0.5, radius: 0.35 }`
  - `STAND_UP_SECONDS = 1.5`, `SETTLED_SPEED = 0.5`
  - `INTENSITY_POINTS = { 1: 1, 2: 3, 3: 9 }`, `NOVELTY = [1, 0.5, 0.25]`(이후 0.25 유지), `CHAIN_BONUS_PER_DEPTH = 0.5`, `PRESENCE_MULTIPLIER = { 1: 1, 2: 1.25, 3: 1.5 }`
  - `VIEWERS_START = 500`(천 명), `VIEWERS_PER_POINT = 4`, `SILENCE_LOSS_PER_SECOND = { 1: 0.005, 2: 0.01, 3: 0.02 }`(비율)
  - `SILENCE_SECONDS = { 1: 5, 2: 10, 3: 15 }`
  - `GAUGE_RISK`: impact → violence 3×강도, anger → violence 1×강도, anger 강도 3 → language 10, exposure → sexual 6×강도
  - `RATING_LIMITS = { 'TV-PG': { sexual: 30, violence: 40, drugs: 20, language: 25 }, 'TV-14': { sexual: 70, violence: 70, drugs: 60, language: 50 }, 'TV-MA': { sexual: 100, violence: 100, drugs: 100, language: 100 } }`
  - `TOLERANCE_COUNT = { low: 2, normal: 3, high: 5, max: 8 }`
  - `FATIGUE_MISFIRE_PER_POINT = 0.1`, `STAFF_FATIGUE_MISFIRE_PER_POINT = 0.15`, `MISFIRE_CAP = 0.6`
  - `INTERVENTION_SPEED = 0.2`, `INTERVENTION_REAL_SECONDS = 4`, `AUTO_SLOWMO_REAL_SECONDS = 1.5`, `AUTO_SLOWMO_GAUGE_RATIO = 0.8`
  - `AD_BREAK_REAL_SECONDS = 3`, `AD_VIEWER_LOSS = 0.1`, `AD_GAUGE_RELIEF = 25`, `AD_EFFECT_PICKS = 2`
- Produces (`validate.ts`): `validateShow(show: ShowDef, performers: PerformerDef[], staff: StaffDef[], equipment: EquipmentDef[]): string[]` — 오류 메시지 목록(빈 배열이면 통과)

- [ ] **Step 1: 실패하는 테스트 작성** — 고정 픽스처로:
  - `validateShow`가 유효한 픽스처에 `[]`를 돌려준다
  - `{ tag: 'nope' }` 대상이 어떤 출연자 태그에도 없으면 `"알 수 없는 태그: nope"`를 포함한다
  - `StaffDef.cameraId`가 쇼 카메라에 없으면 `"알 수 없는 카메라: cam9"`를 포함한다
  - `chance`가 0 이하이거나 1 초과면 `"확률 범위 오류"`를 포함한다
  - 출연자 id가 겹치면 `"중복 id"`를 포함한다
- [ ] **Step 2:** `npm test -- validate` → FAIL
- [ ] **Step 3:** 타입, 수치, `validateShow` 구현
- [ ] **Step 4:** `npm test -- validate` → PASS
- [ ] **Step 5:** Commit `feat(showmustgowrong): 콘텐츠 타입과 수치, 검증`

---

### Task 3: 물리 월드 래퍼

**Files:**
- Create: `src/sim/physics.ts`, `src/sim/physics.test.ts`

**Interfaces:**
- Consumes: `balance.ts`의 `CAPSULE`, `MASS_DENSITY`, `IMPACT_SPEED`, `STEP_SECONDS`, `STAND_UP_SECONDS`, `SETTLED_SPEED`
- Produces:
  - `initPhysics(): Promise<void>` — Rapier compat `init()`를 한 번만 부른다
  - `interface Contact { a: string; b: string | 'floor'; intensity: Intensity; fasterId: string }`
  - `class PhysicsWorld`
    - `constructor()` — 중력 (0, -9.81), 바닥(y=0), 좌우 벽(x=0, x=16), 천장(y=9)을 고정 collider로 만든다
    - `addActor(id: string, x: number, weight: Weight): void` — 캡슐을 바닥 위에 세우고 회전을 잠근다
    - `addEquipment(def: EquipmentDef): void` — 조명은 kinematic(공중 고정), 세트 벽은 dynamic 직육면체
    - `releaseEquipment(id: string): void` — 조명을 dynamic으로 바꿔 떨어뜨리고, 세트 벽은 앞으로 쓰러지게 토크를 준다
    - `removeActor(id: string): void`
    - `impulse(id: string, vx: number, vy: number): void` — 속도를 직접 설정한다(질량 무관하게 이동이 예측 가능하도록). `vy > 0`이면 회전 잠금을 푼다(날아감)
    - `teleport(id: string, x: number): void` — 세워서 옮기고 회전을 잠근다
    - `step(): Contact[]` — 한 스텝 진행. 직전 스텝 속도로 상대 속도를 계산해 `IMPACT_SPEED` 이상인 시작 접촉만 돌려준다. 강도 2 이상 접촉에 걸린 actor는 회전 잠금을 푼다
    - `actorState(id: string): { x: number; y: number; angle: number; vx: number; vy: number; tumbling: boolean; grounded: boolean } | undefined`
    - `equipmentState(id: string): { x: number; y: number; angle: number; released: boolean } | undefined`
  - 일어서기 규칙: 회전이 풀린 actor가 바닥에 닿아 있고 속력이 `SETTLED_SPEED` 미만인 상태가 `STAND_UP_SECONDS` 이어지면 `teleport`와 같은 방식으로 세운다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - 결정론: 같은 actor 3개와 같은 impulse 순서로 600 스텝 돌린 월드 두 개의 모든 `actorState`가 정확히 같다(`toEqual`)
  - 마주 보고 각각 4m/s로 달리게 한 두 actor가 충돌하면 `step()`이 강도 2(상대 속도 8) `Contact` 하나를 돌려준다
  - 1m/s로 부딪히면 `Contact`가 없다
  - (0, 20) 속도로 날린 actor의 y가 9 미만으로 유지되고 x가 0~16 안에 있다(Review Focus 5)
  - 날아간 뒤 굴러 멈춘 actor가 `STAND_UP_SECONDS` 뒤 `tumbling === false`, `angle === 0`이다(Review Focus 5)
  - `releaseEquipment`한 조명이 300 스텝 뒤 `y < 1`이다
- [ ] **Step 2:** `npm test -- physics` → FAIL
- [ ] **Step 3:** 구현. 각 테스트 파일의 `beforeAll`에서 `await initPhysics()`.
- [ ] **Step 4:** `npm test -- physics` → PASS
- [ ] **Step 5:** Commit `feat(showmustgowrong): Rapier 결정론 물리 래퍼`

---

### Task 4: 현상 이벤트와 지각 규칙

**Files:**
- Create: `src/sim/phenomena.ts`, `src/sim/phenomena.test.ts`

**Interfaces:**
- Produces:
  - `interface PhenomenonEvent { id: number; kind: PhenomenonKind; intensity: Intensity; sourceId: string; targetId: string | null; x: number; y: number; step: number; causeId: number | null; depth: number }` — `sourceId`는 actor, 장비 id, 또는 `'broadcast'`(정적), `'audience'`
  - `interface Perceiver { id: string; x: number; y: number; inDarkness: boolean }`
  - `perceives(event: PhenomenonEvent, perceiver: Perceiver): boolean`
    - noise: 거리 ≤ `NOISE_RADIUS[강도]`
    - laughter, exposure: 거리 ≤ `SIGHT_RADIUS`이고 `inDarkness`가 아님
    - impact: `sourceId` 또는 `targetId`가 자신
    - anger: `targetId`가 자신이거나, `targetId === null`이고 거리 ≤ `SIGHT_RADIUS`
    - darkness: `inDarkness`
    - silence: 항상
    - 자기 자신이 `sourceId`인 이벤트는 impact를 빼고 지각하지 않는다
  - `targetsSelf(event, perceiverId): boolean` — `event.targetId === perceiverId`
  - `class EventLog` — `emit(partial: Omit<PhenomenonEvent, 'id' | 'depth'>): PhenomenonEvent`(depth = 원인의 depth + 1, 원인 없으면 1), `get(id): PhenomenonEvent | undefined`, `since(step): PhenomenonEvent[]`, `breakChains(): void`(이후 emit은 원인이 있어도 depth를 1부터 다시 센다. 광고용), `chain(id): PhenomenonEvent[]`(원인을 따라 뿌리까지)

- [ ] **Step 1: 실패하는 테스트 작성** — 위 규칙마다 한 개씩(소음 강도 1은 3m 안에서만, 어둠 속에서는 웃음을 못 봄, 분노는 대상에게만, 자기 이벤트 무시 등). `EventLog`: 원인 있는 emit은 depth 2, `breakChains()` 뒤에는 원인이 있어도 depth 1, `chain()`은 [뿌리, …, 자신] 순서.
- [ ] **Step 2:** `npm test -- phenomena` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test -- phenomena` → PASS
- [ ] **Step 5:** Commit `feat(showmustgowrong): 현상 이벤트와 지각 규칙`

---

### Task 5: 반응 판정

**Files:**
- Create: `src/sim/reactions.ts`, `src/sim/reactions.test.ts`

**Interfaces:**
- Consumes: `PhenomenonEvent`, `perceives`, `targetsSelf`(Task 4), `ReactionDef`, `ActionDef`(Task 2), `RngState`
- Produces:
  - `interface ReactorView { id: string; x: number; y: number; inDarkness: boolean; reactions: ReactionDef[]; walkedOut: boolean }`
  - `interface PlannedAction { actorId: string; action: ActionDef; cause: PhenomenonEvent | null; reason: string }` — `reason`은 사고 로그용 한국어 원인(예: `"Priya의 웃음"`)
  - `class CooldownTable { ready(actorId: string, key: string, step: number): boolean; mark(actorId: string, key: string, step: number): void; clear(): void }` — key는 trigger 종류 문자열
  - `resolveReactions(events: PhenomenonEvent[], reactors: ReactorView[], cooldowns: CooldownTable, step: number, rng: RngState, describe: (e: PhenomenonEvent) => string): [PlannedAction[], RngState]`
    - 이벤트마다, 지각하고 trigger(종류, 최소 강도, scope)가 맞는 반응을 찾는다. 한 actor는 한 스텝에 반응 하나만 한다(가장 강한 이벤트 우선, 같으면 먼저 정의된 반응)
    - `chance`가 있으면 rng로 뽑는다
    - 쿨다운 중이면 건너뛴다. 반응하면 `mark`
    - `walkedOut`인 actor는 반응하지 않는다(Review Focus 2)
  - `resolveTimedTriggers(...)`는 만들지 않는다. gaze와 corner trigger는 Task 8 엔진이 `PlannedAction`을 직접 만든다

- [ ] **Step 1: 실패하는 테스트 작성** (고정 픽스처 출연자 A, B)
  - B의 웃음 2(대상 A)를 A가 지각하면 A의 `{ laughter, min 2, targetsSelf }` 반응이 계획된다
  - 같은 반응이 1초(60 스텝) 안에 다시 오면 계획되지 않고, 60 스텝 뒤에는 계획된다(Review Focus 4)
  - A→B, B→A 순환 픽스처를 엔진 없이 120 스텝 흉내 내면, 반응 횟수가 스텝 수를 넘지 않는다(Review Focus 4)
  - `chance: 0.5` 반응은 같은 시드에서 항상 같은 결과다
  - `walkedOut: true`면 아무것도 계획하지 않는다
- [ ] **Step 2:** `npm test -- reactions` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test -- reactions` → PASS
- [ ] **Step 5:** Commit `feat(showmustgowrong): 반응 판정과 쿨다운`

---

### Task 6: 송출, 시청률, 수위

**Files:**
- Create: `src/sim/broadcast.ts`, `src/sim/broadcast.test.ts`

**Interfaces:**
- Consumes: `CameraDef`, `ShowDef`, `PhenomenonEvent`, `GaugeKind`, balance 수치
- Produces:
  - `inFrame(camera: CameraDef, angle: number, x: number, y: number): boolean` — 카메라 위치에서 `angle` 방향, `fovDegrees` 부채꼴, `range` 안
  - `class BroadcastScore`
    - `constructor(show: ShowDef)`
    - `viewers: number`, `peakViewers: number`, `gauges: Record<GaugeKind, number>`, `haltedBy: GaugeKind | null`
    - `scoreEvent(event: PhenomenonEvent, sourcePresence: 1 | 2 | 3, hitViolenceMultiplier: number): number` — 송출된 이벤트로 호출한다. gaze와 silence는 점수 0. 점수 = `INTENSITY_POINTS × novelty × (1 + CHAIN_BONUS_PER_DEPTH × (depth − 1)) × PRESENCE_MULTIPLIER`, novelty는 같은 (sourceId, kind) 송출 횟수로 `NOVELTY`에서 고른다. `viewers += 점수 × VIEWERS_PER_POINT`. `GAUGE_RISK`로 게이지를 올리고, impact의 대상이 `hitViolenceMultiplier`를 가진 출연자면 폭력성 증가에 곱한다. 반환값은 점수
    - `addGauge(kind: GaugeKind, amount: number): void`
    - `tickSecond(silenceIntensity: 0 | 1 | 2 | 3): void` — 정적 이탈 적용, 평균 계산용 표본 기록
    - `checkHalt(): GaugeKind | null` — 상한(`RATING_LIMITS[show.rating]`) 이상인 게이지 중 `GaugeKind` 정의 순서상 첫 번째. 한 번 정해지면 바뀌지 않는다(Review Focus 3)
    - `nearLimit(): GaugeKind | null` — 상한의 `AUTO_SLOWMO_GAUGE_RATIO` 이상인 첫 게이지
    - `relieveGauges(amount: number): void`, `applyAdLoss(): void`
    - `averageViewers(): number`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `inFrame`: 오른쪽(0도)을 보는 fov 60, range 10 카메라에서 (5, 0) 상대 위치는 true, (5, 5)는 false, (11, 0)은 false
  - depth 3, 강도 2, 존재감 2 첫 송출 → 점수 `3 × 1 × 2 × 1.25 = 7.5`, viewers `500 + 30`
  - 같은 (source, kind) 세 번째 송출의 novelty는 0.25
  - 분노 강도 3 송출 → language +10, violence +3
  - TV-14에서 같은 스텝에 sexual과 violence가 동시에 상한을 넘으면 `checkHalt()`는 `'sexual'`이고, 그 뒤 language가 넘어도 `'sexual'`로 유지된다(Review Focus 3)
  - violence 56(TV-14 상한 70의 80%)이면 `nearLimit()`은 `'violence'`
  - `tickSecond(2)`가 viewers를 1% 줄인다
- [ ] **Step 2:** `npm test -- broadcast` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test -- broadcast` → PASS
- [ ] **Step 5:** Commit `feat(showmustgowrong): 송출, 시청률, 수위`

---

### Task 7: PD 개입과 광고

**Files:**
- Create: `src/sim/director.ts`, `src/sim/director.test.ts`

**Interfaces:**
- Consumes: `PerformerDef`, `StaffDef`, `DirectiveDef`, `ActionDef`, `RngState`, balance 수치
- Produces:
  - `type DirectiveOutcome = { kind: 'executed'; action: ActionDef; misfired: boolean } | { kind: 'walkout' }`
  - `class Director`
    - `constructor(performers: PerformerDef[], staff: StaffDef[])`
    - `fatigue: number`, `staffFatigue: number`, `adsLeft: number`(1로 시작)
    - `directivesUsed(performerId: string): number`
    - `directPerformer(performerId: string, directiveId: string, rng: RngState): [DirectiveOutcome, RngState]`
      - 사용 횟수 +1, `fatigue` +1
      - 사용 횟수가 `TOLERANCE_COUNT[tolerance]`를 넘으면 `walkout`
      - 아니면 엇나감 확률 `min(MISFIRE_CAP, fatigue × FATIGUE_MISFIRE_PER_POINT)`(misfire가 `'never'`면 0)로 뽑는다. 엇나가면 `overdo`는 모든 emit 강도 +1(최대 3)과 move 속도 ×1.5, `awkward`는 모든 emit 강도 −1(0이 되면 그 emit 제거)
    - `directStaff(staffId: string, directiveId: string, rng: RngState): [{ aim: StaffDirectiveDef['aim'] | 'random'; misfired: boolean }, RngState]` — `staffFatigue` +1, 엇나감 확률 `min(MISFIRE_CAP, staffFatigue × STAFF_FATIGUE_MISFIRE_PER_POINT)`, 엇나가면 aim `'random'`. 출연자 내성과 `fatigue`는 건드리지 않는다
    - `isWalkedOut(performerId: string): boolean`
    - `takeAd(): boolean` — 남았으면 차감하고 true
    - `resetFatigue(): void` — 광고 재정비용
  - `type AdEffect = 'relief' | 'reset' | 'setup'`

- [ ] **Step 1: 실패하는 테스트 작성**
  - 내성 low(2회) 출연자에게 세 번째 지시를 내리면 `walkout`, 이후 `isWalkedOut` true
  - fatigue 0에서는 엇나가지 않는다. fatigue 5에서 misfire `'overdo'` 출연자의 엇나간 결과는 emit 강도 2 → 3, move 속도 4 → 6
  - `'awkward'` 엇나감에서 강도 1 emit은 제거된다
  - `'never'` 출연자는 fatigue 10에서도 엇나가지 않는다
  - `directStaff`는 `fatigue`와 출연자 사용 횟수를 바꾸지 않는다
  - `takeAd()`는 처음 true, 두 번째 false
- [ ] **Step 2:** `npm test -- director` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test -- director` → PASS
- [ ] **Step 5:** Commit `feat(showmustgowrong): 개입 내성, 피로, 광고`

---

### Task 8: 방송 엔진과 시계

**Files:**
- Create: `src/sim/clock.ts`, `src/sim/clock.test.ts`, `src/sim/engine.ts`, `src/sim/engine.test.ts`, `src/sim/describe.ts`

**Interfaces:**
- Consumes: Task 3~7의 모든 Produces
- Produces:
  - `clock.ts`: `class Clock { speed: number; constructor(); advance(realSeconds: number): number }` — 누적기로 `realSeconds × 60 × speed`만큼의 정수 스텝 수를 돌려주되 `MAX_STEPS_PER_FRAME`을 넘지 않고, 넘친 나머지는 버린다(Review Focus 1)
  - `describe.ts`: `describeEvent(event: PhenomenonEvent, shortNames: Record<string, string>): string` — 사고 로그 문구. 예: impact `"렉스가 모와 부딪혔다!"`, laughter `"프리야가 렉스를 보고 웃는다"`, anger 강도 3 `"렉스가 욕설을 했다! (삐—)"`, silence `"방송에 정적이 흐른다…"`. 조사는 마지막 글자의 받침으로 이/가, 을/를, 와/과를 고른다
  - `engine.ts`:
    - `type BroadcastInput = { type: 'switch'; cameraId: string } | { type: 'direct'; actorId: string; directiveId: string } | { type: 'directStaff'; staffId: string; directiveId: string } | { type: 'ad'; effects: AdEffect[] }`
    - `type Phase = 'live' | 'adBreak' | 'ended'`
    - `interface BroadcastSetup { show: ShowDef; performers: PerformerDef[]; bench: PerformerDef[]; staff: StaffDef[]; equipment: EquipmentDef[]; seed: number }`
    - `interface ActorView { id: string; name: string; x: number; y: number; angle: number; pose: Pose; onAir: boolean; walkedOut: boolean; directivesLeft: number }`
    - `interface BroadcastView { step: number; phase: Phase; cornerIndex: 0 | 1 | 2; onAirCameraId: string; cameraAngles: Record<string, number>; actors: ActorView[]; equipment: { id: string; x: number; y: number; angle: number; released: boolean }[]; viewers: number; gauges: Record<GaugeKind, number>; limits: Record<GaugeKind, number>; haltedBy: GaugeKind | null; log: { step: number; text: string; depth: number }[]; autoSlowmo: { gauge: GaugeKind | null; eventId: number | null } | null; adsLeft: number; fatigue: number }`
    - `class Broadcast`
      - `static async create(setup: BroadcastSetup): Promise<Broadcast>` — `validateShow`가 오류를 내면 그 목록으로 throw한다(spec 9.6). `initPhysics`, actor를 `homeSpots`에 배치, 장비 추가. 스태프는 물리 몸이 없고, 지각 위치는 담당 카메라 위치다
      - `step(inputs: BroadcastInput[]): void` — 한 스텝. 순서:
        1. 입력 적용(스위처, 지시는 Director 결과의 `ActionDef`를 실행, 스태프 지시는 담당 카메라 각도 변경, 광고는 phase를 `adBreak`로)
        2. 코너 경계 스텝이면 그 코너 `startTag`를 가진 출연자의 `{ kind: 'corner' }` 반응을 실행
        3. 물리 `step()` → `Contact`를 impact 이벤트로 emit(원인: 접촉한 actor가 직전에 실행한 행동의 원인 이벤트, 없으면 null). 장비가 `breakAt` 이상 접촉하면 `releaseEquipment`와 `onBreak` emit. 조명이면 `darknessZone`을 활성하고 그 구역 중앙에서 darkness 강도 2를 emit한다. 구역 안 actor의 `inDarkness`는 true가 된다
        4. 직전 스텝에 생긴 이벤트를 `resolveReactions`로 판정해 행동 실행(한 스텝에 한 단계, Review Focus 4)
        5. gaze: on-air 프레임에 새로 들어온 actor에게 `{ gaze, enter }` 반응, `absentFor` 반응은 프레임 밖에 있던 시간으로 판정
        6. 이번 스텝 이벤트 중 송출 프레임 안(이벤트 위치 또는 source/target actor가 프레임 안)의 것을 `scoreEvent`. 출연자의 `onAirGaugePerSecond`는 송출 중일 때 스텝마다 /60씩 더한다
        7. 정적 타이머: 송출된 점수 이벤트가 없으면 증가, `SILENCE_SECONDS`를 넘을 때마다 silence 이벤트 emit
        8. 매 60 스텝마다 `tickSecond`
        9. `checkHalt()`가 있으면 phase `ended`(Review Focus 3). `BROADCAST_STEPS`에 이르면 phase `ended`
        10. `autoSlowmo` 갱신: `nearLimit()`이 새로 생기거나 강도 3 이벤트가 송출되면 설정(같은 게이지로는 한 번만)
      - 행동 실행 규칙: `pose` 설정, `move`는 대상 위치 방향으로 `impulse`(dash: 수평 speed, leap: 수평 speed와 수직 speed×0.6, flee: 대상 반대 방향, home: 자기 home spot으로 teleport). emit의 `'causePlusOne'`은 원인 강도 +1(최대 3), target `'cause'`는 원인 이벤트의 sourceId
      - 이탈: `walkout`이면 그 출연자가 분노 2와 소음 2를 emit하고 `exitX`로 flee, 2초 뒤 `removeActor`. 이탈한 출연자를 가리키는 대상 선택은 `'none'`처럼 처리한다(Review Focus 2)
      - 광고: `endAdBreak(effects: AdEffect[]): void`를 따로 둔다. 효과 개수는 `AD_EFFECT_PICKS`와 같아야 하고 아니면 throw. relief → `relieveGauges(AD_GAUGE_RELIEF)`, reset → 모든 출연자 home 위치로 teleport, pose idle, 쿨다운 초기화, `resetFatigue`, setup → bench 첫 출연자를 빈 home spot에 추가. 공통 대가: `applyAdLoss`, `breakChains`
      - `view(): BroadcastView`
      - `inputLog(): { step: number; input: BroadcastInput }[]`
    - `replay(setup: BroadcastSetup, log: { step: number; input: BroadcastInput }[], steps: number): Promise<BroadcastView>` — 결정론 확인용

- [ ] **Step 1: 실패하는 테스트 작성** (고정 픽스처 쇼와 출연자 2명)
  - `Clock`: speed 1에서 `advance(1/60)`은 1, speed 0.2에서 5번 호출하면 합이 1, `advance(10)`은 `MAX_STEPS_PER_FRAME`(Review Focus 1)
  - 결정론: 같은 setup과 같은 입력 로그로 3000 스텝 돌린 `view()` 두 개가 같고, `replay`도 같다
  - 코너 1 시작 스텝에 `startTag` 출연자의 corner 반응이 실행되어 로그가 한 줄 생긴다
  - 정적: 아무 일도 없는 픽스처에서 5초 뒤 silence 강도 1 이벤트가 로그에 있다
  - 개입 중에 게이지가 상한을 넘는 입력을 주면 같은 스텝에 phase `ended`, `haltedBy` 설정(Review Focus 3)
  - 내성 2 출연자에게 지시 3회 → 2초 뒤 `actors`에서 `walkedOut: true`, 그 뒤 그를 원인으로 한 이벤트가 있어도 `step()`이 throw하지 않는다(Review Focus 2)
  - `endAdBreak(['relief'])`는 effects 개수 오류로 throw, `endAdBreak(['relief','setup'])`은 게이지 −25, 출연자 1명 추가, viewers −10%, 이후 emit depth가 1부터
  - `describeEvent`: source 렉스, target 모인 impact는 `"렉스가 모와 부딪혔다!"`, source 준, target 렉스인 impact는 `"준이 렉스와 부딪혔다!"`, source 렉스, target 준이면 `"렉스가 준과 부딪혔다!"`
- [ ] **Step 2:** `npm test -- clock engine` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm test -- clock engine` → PASS
- [ ] **Step 5:** Commit `feat(showmustgowrong): 방송 엔진과 시계`

---

### Task 9: 토크쇼 콘텐츠와 헤드리스 실행

**Files:**
- Create: `src/content/talkShow.ts`, `src/content/lineup.ts`, `src/content/content.test.ts`, `scripts/sim-broadcast.ts`

**Interfaces:**
- Consumes: Task 2 타입, Task 8 `Broadcast`
- Produces: `TALK_SHOW: ShowDef`, `LINEUP: { performers: PerformerDef[]; bench: PerformerDef[]; staff: StaffDef[]; equipment: EquipmentDef[] }`

콘텐츠(spec 7.1~7.4를 이 DSL로 옮긴다):
- 쇼: TV-14. 코너 `오프닝`(startTag `host`), `게스트 토크`(`guest`), `게임 코너`(`athlete`). 카메라 3대: `wide`(무대 와이드, 강도 1), `close`(클로즈업, 강도 2, 담당 스태프 있음), `audience`(관객석, 강도 1). home spot 4곳(x = 4, 6.5, 9.5, 12), bench x = 15, exit x = 15.8, 관객 구역 x 0~3
- 출연자(무대): 렉스 캘러웨이/렉스(tags host), 프리야 네어/프리야(panel), 제럴드 오카포 박사/오카포(guest), "마운틴" 모 타비타/모(athlete). 대기: 준 휘태커 할머니/준. 스탯과 반응은 spec 7.1 표를 따른다. 예:
  - Rex: `{ gaze, absentFor 8 }` → dash toward onAirCamera 6, emit anger 2 none. `{ laughter, min 2, targetsSelf }` → pose angry, emit anger 3 target cause. corner → pose idle, emit noise 1 none
  - Priya: `{ laughter, min 1, perceived }` → pose laugh, emit laughter causePlusOne target cause. `{ noise, min 3, perceived }` → emit laughter 2 target cause
  - Okafor: `{ anger, min 1, targetsSelf }`와 `{ laughter, min 1, targetsSelf }` → pose angry, emit anger 2 target cause. corner → emit anger 1 target `{ tag: 'host' }`
  - Mo: `{ anger, min 2, perceived }`와 `{ impact, min 1, targetsSelf }` → leap toward cause 8. corner → emit noise 2 none
  - June: `{ silence, min 1 }` → emit laughter 1 none. `{ noise, min 3, perceived }` → pose fallen, leap toward none 2. `hitViolenceMultiplier: 2`
  - 지시는 출연자마다 2개(spec 5.2 예시 문구 사용: "크게 웃어 주세요", "MC 한 번 끊어 주세요", "카메라 앞으로 나오세요", "반박하세요", "MC한테 가 보세요" 등)
- 스태프: 겁쟁이 카메라 감독(cameraId `close`). `{ noise, min 2, perceived }` → 담당 카메라 각도 무작위(반응 action은 pose panic, emits 없음, 엔진이 staff 반응을 카메라 무작위로 처리). 지시 "관객석 비춰 주세요"(audience), "침착하세요"(default)
- 장비: 과열된 조명(hangingLight, x 8, y 6, breakAt 2, onBreak impact 3 + noise 3, darknessZone x 6~10), 무너지는 세트 벽(setWall, x 13.5, breakAt 2, onBreak impact 3 + exposure 1)
- 관객: 엔진이 `'audience'` source로 처리. audience 카메라가 송출 중이면 3초마다 noise 1, 관객 구역에서 SIGHT_RADIUS 안의 웃음을 보면 laughter 1

- [ ] **Step 1: 실패하는 테스트 작성** — `validateShow(TALK_SHOW, ...)`가 `[]`. 모든 출연자가 지시를 2개 이상 가진다. 모든 reaction이 spec의 기본 현상 8개만 쓴다.
- [ ] **Step 2:** `npm test -- content` → FAIL
- [ ] **Step 3:** 콘텐츠 작성
- [ ] **Step 4:** `npm test -- content` → PASS
- [ ] **Step 5:** `scripts/sim-broadcast.ts` 작성: 시드 1~50으로 입력 없이(스위처는 매 10초 wide→close→audience 순환) 끝까지 돌리고 시드별 `peakViewers`, 최대 연쇄 깊이, 이벤트 수, `haltedBy`를 표로, 마지막에 평균을 출력한다. 이것은 "연쇄가 아예 안 일어나거나 매번 폭주하는" 고장만 잡는 확인이고 재미 지표가 아니다.

Run: `npm run sim`
Expected: 오류 없이 50줄과 평균 출력. 최대 연쇄 깊이 평균이 2 이상, 모든 시드가 즉시(30초 안) 중단되지는 않는다. 둘 중 하나라도 어긋나면 `balance.ts`나 콘텐츠를 조정하고 조정 내용을 작업 로그에 적는다.

- [ ] **Step 6:** Commit `feat(showmustgowrong): 토크쇼 콘텐츠와 헤드리스 실행`

---

### Task 10: 스튜디오 렌더링

**Files:**
- Create: `src/render/StudioRenderer.ts`, `src/render/colors.ts`

**Interfaces:**
- Consumes: `BroadcastView`, `TALK_SHOW`
- Produces: `class StudioRenderer { static async create(host: HTMLElement, show: ShowDef): Promise<StudioRenderer>; draw(view: BroadcastView, slowmo: boolean): void; actorAt(px: number, py: number): string | null; destroy(): void }`

- 스튜디오 16m × 9m를 1280×720으로 그린다(80px/m, y축 뒤집기). 바닥, 관객 구역, 출구, home spot 표시.
- actor는 캡슐 도형 + 이름 + pose 표시(포즈별 색과 머리 위 기호: laugh `ㅋ`, angry `#`, panic `!`, flying `~`, fallen `@`). Plan 2에서 스프라이트로 바뀐다.
- 카메라 3대의 부채꼴을 반투명으로 그리고 송출 카메라는 빨간 테두리.
- 사고 로그 최신 3줄을 이벤트 위치에 말풍선으로 1.5초 띄운다.
- `slowmo`이면 화면 가장자리를 어둡게 하고 채도를 낮춘다(ColorMatrixFilter).
- 검증은 Task 11의 Playwright 스크린샷으로 한다(렌더러 단위 테스트는 두지 않는다).

- [ ] **Step 1:** 구현
- [ ] **Step 2:** `npm run build` → 성공
- [ ] **Step 3:** Commit `feat(showmustgowrong): 도형 스튜디오 렌더링`

---

### Task 11: 방송 화면과 HUD

**Files:**
- Create: `src/app/BroadcastScreen.tsx`, `src/app/Hud.tsx`, `src/app/InterventionPanel.tsx`, `src/app/AdPanel.tsx`, `src/app/ResultScreen.tsx`, `src/app/useBroadcastLoop.ts`
- Modify: `src/app/App.tsx`
- Test: `tests/broadcast.spec.ts`

**Interfaces:**
- Consumes: `Broadcast`, `Clock`, `StudioRenderer`, `TALK_SHOW`, `LINEUP`, balance 수치
- Produces: `useBroadcastLoop(setup: BroadcastSetup): { view: BroadcastView | null; send(input: BroadcastInput): void; slowmo: 'none' | 'auto' | 'intervention'; openIntervention(): void; closeIntervention(): void; interventionSecondsLeft: number; startAd(): void; endAd(effects: AdEffect[]): void }`

- 루프: `requestAnimationFrame`마다 실제 경과 시간을 `Clock.advance`에 넣고, 나온 스텝 수만큼 `broadcast.step(입력)`을 돈다. 입력은 다음 스텝에 한 번만 들어간다.
- 속도: 평상시 1, 자동 슬로모션 중 `INTERVENTION_SPEED`(실제 `AUTO_SLOWMO_REAL_SECONDS` 동안), 개입 중 `INTERVENTION_SPEED`(실제 `INTERVENTION_REAL_SECONDS` 동안, 남은 시간 표시). 개입 시간이 다 되면 지시 없이 닫히고 개입으로 세지 않는다. 광고 phase에서는 스텝을 돌리지 않고 `AD_BREAK_REAL_SECONDS` 동안 "COMMERCIAL BREAK" 화면을 띄운다.
- HUD(한 화면, 스크롤 없음): 시청자 수, 수위 4게이지(상한 눈금), 남은 방송 시간과 현재 코너, 카메라 스위처 3개(키 1, 2, 3), 개입 버튼(키 Space), 광고 버튼(남은 횟수), 사고 로그 최근 8줄(연쇄 깊이만큼 들여쓰기).
- 개입 패널: 스튜디오의 actor를 클릭하거나 목록에서 고르면 그 대상의 지시 버튼. 이탈한 출연자는 목록에 없다. 각 출연자 옆에 남은 내성 표시. 스태프도 대상에 포함.
- 광고 패널: 효과 3개 중 `AD_EFFECT_PICKS`개를 고르면 확정. 개입 중에도 열 수 있고, 열면 개입은 개입으로 세지 않고 닫힌다.
- `Broadcast.create`가 실패하면(wasm 로드 실패, 콘텐츠 검증 오류) 오류 화면에 메시지와 "새로고침해 주세요"를 띄운다(spec 9.6).
- 결과 화면: 방송 완료 또는 "방송 중단(원인 게이지)", 최고·평균 시청자 수, 최대 연쇄 깊이와 그 연쇄(`chain`) 문장들, 다시 하기 버튼.
- 화면 문구는 한국어. 스타일은 Tailwind로 최소한만(UI 톤은 Plan 2).

- [ ] **Step 1: 실패하는 Playwright 테스트 작성** — `tests/broadcast.spec.ts`:
  - 1280×720에서 페이지를 열면 시청자 수, 게이지 4개, 스위처 3개가 보이고 `document.documentElement.scrollHeight <= 720`
  - 키 `2`를 누르면 클로즈업 스위처가 송출 상태(`aria-pressed="true"`)
  - Space를 누르면 개입 패널이 열리고 4초 뒤 닫힌다
  - 광고 버튼 → 효과 2개 선택 → 확정하면 광고 버튼의 남은 횟수가 0
  - 스크린샷 `tests/screens/broadcast-1280x720.png` 저장
- [ ] **Step 2:** `npm run e2e` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `npm run e2e` → PASS. 스크린샷을 열어 화면이 한 화면에 들어오는지 눈으로 확인한다.
- [ ] **Step 5:** 전체 확인

Run: `npm test && npm run lint && npm run build && npm run e2e`
Expected: 모두 통과

- [ ] **Step 6:** 작업 로그에 Plan 1에서 내린 결정과 balance 조정 내용을 적는다.
- [ ] **Step 7:** Commit `feat(showmustgowrong): 방송 화면과 HUD`
