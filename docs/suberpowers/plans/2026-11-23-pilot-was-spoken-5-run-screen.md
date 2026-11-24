# 문장 던전 런 화면 (단계 B) Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 브라우저에서 런 전체(7층 전투 → 상점 → 결과)를 한 화면으로 플레이할 수 있게 해 사람 플레이테스트를 준비한다.

**Architecture:**
- 런 상태는 새 `useRunStore`가 들고 `reduceRun`으로 진행하며, 전투 이벤트는 지금처럼 연출 큐로 재생한다.
- `CombatScreen`은 상태를 직접 들지 않고 props로 받는다. 런 화면과, 기존 "조우 선택 + 덱 편집" 화면이 함께 쓴다. 기존 화면은 `?mode=rally` 샌드박스로 남긴다.
- 상점과 런 결과는 새 컴포넌트로 만든다. 보상 문구는 텍스트 플레이와 같은 모듈을 쓴다.

**Tech Stack:** Vite 8, React 19, TypeScript strict, Tailwind v4, dnd-kit, Vitest(node 환경), Playwright

**Spec:** `docs/suberpowers/specs/2026-11-23-pilot-was-spoken-v2-run-build-design.md` §8~§9 (§9가 이 plan의 범위)

## Global Constraints

- 한 화면, 스크롤 없음(1440×900). 전투 화면과 상점 화면 모두 해당한다.
- 엔진 디렉터리(grammar, content, sentence, resolve, combat, rally, build, run, play)는 React를 import하지 않는다. `any`와 `Math.random`은 쓰지 않는다.
- 모든 화면 문구는 한국어다.
- 기본 진입(`/`)은 런 모드다. `?mode=rally`는 기존 샌드박스(조우 선택, 덱 편집, 단일 전투)다.
- `?debugEnemyHp=<n>`은 `import.meta.env.DEV`일 때만 동작한다. 새 전투가 시작될 때마다 적 HP를 n으로 만든다. e2e 전용이다.
- 시드: `?seed=<n>`. 없으면 지금처럼 `Date.now() % 1_000_000_000`이다.

## Review Focus

1. 낭독으로 전투가 끝나는 순간 연출이 재생되는 중에 화면이 상점이나 결과로 바로 바뀌어, 마지막 피해 연출이 잘림 → 연출이 끝난 뒤(`busy === false`) 전환해야 한다. Task 4 e2e에서 낭독 직후 전투 화면(`end-turn`)이 아직 보이고, 그 뒤 상점이 열리는지로 고정한다.
2. 상점에서 화폐가 모자란 보상을 누름 → 아무것도 사지 않고 이유 문구가 보여야 한다. Task 4 e2e에서 고정한다.
3. 연결어를 놓은 뒤 "문장 비우기" → 연결어와 둘째 절의 카드까지 손패로 돌아가야 한다. 지금 버튼 활성 조건은 첫 절만 본다. Task 3에서 고정한다.
4. 둘째 절이 열린 상태에서 한 화면 높이를 넘김 → 1440×900에서 스크롤이 생기지 않아야 한다. Task 3 e2e에서 고정한다.
5. `?mode=rally`에서 덱 편집 후 저장 → 샌드박스는 기존처럼 동작하고, 런 모드에는 저장된 덱이 섞이지 않아야 한다(런은 늘 시작 덱). Task 2·4에서 고정한다.

---

### Task 1: 보상 문구 공용 모듈

**Files:**
- Create: `pilot-was-spoken/src/game/run/labels.ts`, `pilot-was-spoken/src/game/run/labels.test.ts`
- Modify: `pilot-was-spoken/src/game/play/textPlay.ts`(자체 정의를 지우고 labels를 쓴다)

**Interfaces:**
- Produces:
  - `STRUCTURE_NAMES: Record<StructureId, string>`
  - `KIND_NAMES: Record<WordKind, string>`
  - `offerName(offer: Offer, build: BuildState, withLevel?: boolean): string`
  - `offerDetail(offer: Offer, build: BuildState): string`
  - `upgradeSummary(build: BuildState): string[]` — 예: `['격렬하게 1단계']`
  - 모두 textPlay에 있던 문구와 같다.

- [ ] **Step 1: 실패하는 테스트 작성** (`labels.test.ts`)
  - `offerName({kind:'upgrade', wordId:'fiercely'}, EMPTY_BUILD, true)` → `'[강화] 격렬하게 0→1단계'`. withLevel 없이 → `'[강화] 격렬하게'`.
  - `offerName({kind:'relic', id:'stress'}, EMPTY_BUILD)` → `'[유물] 강세'`. `offerName({kind:'structure', id:'handSize'}, EMPTY_BUILD)` → `'[구조] 손패 상한 +1'`.
  - `offerDetail({kind:'upgrade', wordId:'fiercely'}, EMPTY_BUILD)`에 `'×1.5'`와 `'×2'`가 모두 들어 있다.
  - `upgradeSummary({...EMPTY_BUILD, upgrades:{fiercely:2}})` → `['격렬하게 2단계']`.
- [ ] **Step 2: 실행해 실패 확인.** Run: `cd pilot-was-spoken && npx vitest run src/game/run/labels.test.ts` / Expected: FAIL, `./labels` 모듈 없음
- [ ] **Step 3: textPlay의 정의를 labels.ts로 옮긴다.** textPlay는 import해서 쓴다.
- [ ] **Step 4: 실행해 통과 확인.** Run: `npx vitest run src/game/run src/game/play` / Expected: PASS(textPlay 15개 포함)
- [ ] **Step 5: Commit** `refactor(pilot-was-spoken): 보상 문구를 run/labels로 옮김`

### Task 2: 런 store와 샌드박스 분리

**Files:**
- Create: `pilot-was-spoken/src/game/run/debug.ts`, `pilot-was-spoken/src/game/run/debug.test.ts`, `pilot-was-spoken/src/app/useRunStore.ts`, `pilot-was-spoken/src/app/RallySandbox.tsx`
- Modify: `pilot-was-spoken/src/game/ui/CombatScreen.tsx`, `pilot-was-spoken/src/app/useCombatStore.ts`, `pilot-was-spoken/src/app/App.tsx`, `pilot-was-spoken/tests/e2e/combat-slice.spec.ts`

**Interfaces:**
- Produces:
  - `weakenNewCombat(before: RunState | null, after: RunState, hp: number): RunState` (debug.ts)
    - `after`에 전투가 있고, 그 전투가 `before`와 다른 새 전투이면 적 HP와 최대 HP를 `hp`로 만든다.
    - 새 전투란 `before`가 null이거나, 층이 바뀌었거나, `before.combat`이 null인 경우다.
    - 그 밖에는 `after`를 그대로 돌려준다.
  - `useRunStore(seed: number, debugEnemyHp: number | null): RunStore`
    - `RunStore = { state: RunState; busy: boolean; lastEvents: readonly RunEvent[]; dispatch(action: RunAction): void; restart(seed: number): void }`
    - 연출은 전투 이벤트만 재생한다. 런 전용 이벤트(floorCleared, bought, runEnded)는 큐에 넣지 않는다.
  - `CombatScreen` props: `{ state: RallyState; busy: boolean; lastEvents: readonly CombatEvent[]; dispatch(action: RallyAction): void; portraits: Record<string, string>; onRestart?: () => void }`
    - `onRestart`가 있을 때만 전투 종료 오버레이(`CombatResult`)를 띄운다(샌드박스 전용).
  - `RallySandbox`: 지금 App의 내용(TopBar 조우 선택·덱 편집, `useCombatStore`, CombatScreen)을 그대로 옮긴 컴포넌트

- [ ] **Step 1: 실패하는 테스트 작성** (`debug.test.ts`)
  - `startRun(1, BALANCE)` 직후: `weakenNewCombat(null, run, 1)`의 적 HP가 모두 1이다.
  - 같은 전투 안의 행동 뒤(before와 after 층이 같고 둘 다 전투 중): 적 HP가 바뀌지 않는다.
  - 상점에서 leave 뒤(before.phase 'shop', after는 2층 전투): 적 HP가 1이다.
- [ ] **Step 2: 실행해 실패 확인.** Run: `npx vitest run src/game/run/debug.test.ts` / Expected: FAIL, 모듈 없음
- [ ] **Step 3: debug.ts 구현.** 이어서 `useRunStore`, `RallySandbox`를 만들고 CombatScreen을 props 방식으로 바꾼다. App은 `?mode=rally`이면 RallySandbox, 아니면 아직 빈 런 자리(`<div data-testid="run-screen" />`)를 그린다. 런 화면은 Task 4에서 채운다.
- [ ] **Step 4: e2e 경로 변경.** `combat-slice.spec.ts`의 `page.goto`를 `/?mode=rally&seed=${SEED}`로 바꾼다.
- [ ] **Step 5: 검증.** Run: `npx vitest run && npx tsc -b && npx oxlint src && npx playwright test` / Expected: 모두 통과(e2e 8개)
- [ ] **Step 6: Commit** `refactor(pilot-was-spoken): 런 store, 샌드박스(?mode=rally) 분리`

### Task 3: 연결어 칸, 둘째 절, 절마다 계산식

**Files:**
- Modify: `pilot-was-spoken/src/game/ui/placement.ts`, `pilot-was-spoken/src/game/ui/placement.test.ts`, `pilot-was-spoken/src/game/ui/SentenceBoard.tsx`, `pilot-was-spoken/src/game/ui/CombatScreen.tsx`
- Create: `pilot-was-spoken/tests/e2e/connective.spec.ts`

**Interfaces:**
- Consumes: Task 2의 CombatScreen props
- Produces:
  - `CONNECTIVE_DROP_ID = 'connective'`
  - `isConnectiveWord(wordId: WordId): boolean`
  - `SentenceBoard`에 추가하는 props: `connective: PlacedWord | null`, `connectivePlaceable: boolean`, `onConnectiveClick(): void`
- 동작
  - 연결어 칸은 첫 절 끝에 있고, `data-testid="connective-slot"`이다.
    - 빈 칸에 연결어 카드를 끌어다 놓거나, 선택한 뒤 누르면 `connect`가 된다.
    - 차 있는 칸을 누르면 `disconnect`가 된다.
  - 계산식은 `sentenceFormula(state)` 전체를 절마다 한 줄씩(`data-testid="formula"` 안에 `data-clause`) 보여 준다.
  - "문장 비우기"는 어느 절에든 놓인 카드가 있거나 연결어가 있으면 활성이다.

- [ ] **Step 1: 실패하는 단위 테스트** (`placement.test.ts`): `isConnectiveWord('and') === true`, `isConnectiveWord('bite') === false`, `parseDropId(CONNECTIVE_DROP_ID) === null`
- [ ] **Step 2: 실행해 실패 확인.** Run: `npx vitest run src/game/ui/placement.test.ts` / Expected: FAIL
- [ ] **Step 3: 실패하는 e2e 작성** (`connective.spec.ts`, `/?mode=rally&seed=5`, 1440×900)
  - 덱 편집으로 `and`를 넣고 저장한다. 손패에 `and`가 올 때까지 턴 종료를 반복하되 최대 6번까지만 한다.
  - 연결어를 연결어 칸에 놓으면 `[data-clause="1"]` 줄이 보인다.
  - 이 상태에서 `scrollHeight <= innerHeight`이다.
  - "문장 비우기"를 누르면 둘째 절 줄이 사라지고 손패 수가 원래대로 돌아온다.
- [ ] **Step 4: 실행해 실패 확인.** Run: `npx playwright test connective` / Expected: FAIL, connective-slot 없음
- [ ] **Step 5: 구현** (placement, SentenceBoard, CombatScreen의 드래그·클릭 처리, 계산식 목록, 비우기 조건)
- [ ] **Step 6: 검증.** Run: `npx vitest run && npx tsc -b && npx oxlint src && npx playwright test` / Expected: 모두 통과
- [ ] **Step 7: Commit** `feat(pilot-was-spoken): 연결어 칸과 둘째 절, 절마다 계산식`

### Task 4: 런 화면(상단, 상점, 결과)과 런 e2e

**Files:**
- Create: `pilot-was-spoken/src/game/ui/RunTopBar.tsx`, `pilot-was-spoken/src/game/ui/ShopScreen.tsx`, `pilot-was-spoken/src/game/ui/RunResult.tsx`, `pilot-was-spoken/src/app/RunScreen.tsx`, `pilot-was-spoken/tests/e2e/run.spec.ts`
- Modify: `pilot-was-spoken/src/app/App.tsx`

**Interfaces:**
- Consumes: Task 1 labels, Task 2 `useRunStore`·`weakenNewCombat`·CombatScreen props
- Produces(화면 계약, e2e가 기대는 testid)
  - `RunTopBar`: 층 `3/7 · 정예`(`data-testid="run-floor"`), HP `data-testid="run-hp"`, 화폐 `data-testid="run-gold"`, 시드, 새 런 버튼(`data-testid="new-run"`)
  - `ShopScreen`
    - 보상 카드 `data-testid="offer"`: 종류, 이름, 설명, 값(`data-testid="offer-price"`)
    - 산 카드는 "팔림"이고 비활성이다. 화폐가 모자라면 누를 수 없고 "화폐 부족"이라고 표시한다.
    - 넘어가기 버튼 `data-testid="leave-shop"`
    - 보유 유물(이름과 설명), 칸 수, 손패 상한, 버리기, 강화, 덱 목록
  - `RunResult`: "완주" 또는 "패배", 도달 층, 최대 한 방(`data-testid="best-burst"`), 산 것 목록, 새 런 버튼
  - `RunScreen`
    - 연출이 재생 중(`busy`)이면 전투 화면을 유지한다.
    - 재생이 끝나면 `state.phase`에 따라 전투, 상점, 결과를 그린다.
    - 새 런의 시드는 지금 시드 + 1이다.
  - App: `?debugEnemyHp`를 `import.meta.env.DEV`일 때만 읽어 `useRunStore`에 넘긴다.

- [ ] **Step 1: 실패하는 e2e 작성** (`run.spec.ts`, `/?seed=5&debugEnemyHp=1`, 1440×900)
  - 상단에 `1/7`, `화폐 0`이 보이고 스크롤이 없다.
  - 동사를 놓고 낭독하면 상점이 열리고 `run-gold`가 25다. 상점에서도 스크롤이 없다.
  - 화폐가 모자란 보상은 누를 수 없다(필요하면 사고 남은 것으로 확인한다).
  - 가장 싼 보상을 사면 화폐가 그 값만큼 줄고, 남은 보상의 값이 `ceil(원래 값 × 1.5)`가 된다.
  - 낭독 직후에는 전투 화면(`end-turn`)이 아직 보이고, 연출이 끝난 뒤 상점이 열린다.
  - 넘어가기를 누르면 `2/7`이 보인다.
  - localStorage의 샌드박스 덱(`pilot-was-spoken.deck.v2`)에 다른 덱을 저장해 두어도, 런의 덱은 시작 덱 15장이다. 상점의 덱 목록으로 확인한다.
- [ ] **Step 2: 실행해 실패 확인.** Run: `npx playwright test run.spec` / Expected: FAIL, run-floor 없음
- [ ] **Step 3: 구현** (RunTopBar, ShopScreen, RunResult, RunScreen, App 연결). 스타일은 기존 컴포넌트의 토큰(`bg-surface-container-*`, `font-headline` 등)을 따른다.
- [ ] **Step 4: 검증.** Run: `npx vitest run && npx tsc -b && npx oxlint src && npx playwright test` / Expected: 모두 통과
- [ ] **Step 5: 스크린샷.** 전투(두 절), 상점, 결과 화면을 `pilot-was-spoken/stitch/run-*.png`로 남긴다(Playwright MCP 또는 e2e의 `page.screenshot`).
- [ ] **Step 6: Commit** `feat(pilot-was-spoken): 런 화면(상단·상점·결과)`
