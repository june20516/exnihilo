# Pilot Sentence — Plan 1.5: 기계 검증 Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: suberpower:executing-plans. Step은 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 사람 플레이테스트 전에 시뮬레이터로 지배 전략과 난이도 이탈을 걸러낸다. 그리고 이미 발견한 두 신호(보호가 쓸모없음, 거미가 너무 쉬움)를 고친다.

**Architecture:** `kit/sim`은 게임 어댑터와 정책을 받는 장르 무관 하니스다. `game/sim`은 전투 reducer용 어댑터, 봇, 목표 범위를 둔다. 엔진이 순수 함수이므로 탐욕 봇은 "행동 → 턴 종료"를 미리 돌려 본 결과로 수를 고른다.

**Tech Stack:** 기존 + `tsx`(CLI 실행)

**Spec:** `docs/suberpowers/specs/2026-11-23-pilot-sentence-design.md` (1.6 보호 소멸, 1.8 enrage, 9.3 기계 검증)

## Global Constraints
- Plan 1의 Global Constraints를 그대로 따른다(경계 규칙, 순수성, worklog, 커밋 형식).
- `kit/sim`은 `game`을 import하지 않는다.

## Review Focus
1. 시뮬레이션이 끝나지 않는 게임(무행동 봇이 영원히 살아남는 경우): `maxTurns` 초과 시 `timeout`으로 집계하고 멈춘다. → Task 2 테스트
2. 합법 행동 목록이 비는 경우: 언제나 `endTurn`이 포함된다. → Task 3 테스트
3. 같은 시드면 같은 리포트(재현성). → Task 2 테스트

---

### Task 1: 보호는 다음 턴 종료까지 유지

**Files:** Modify `src/kit/core/entity.ts`, `src/kit/core/entity.test.ts`

**Interfaces:**
- Produces: `Entity.freshBlock: number`(이번 턴에 얻은 보호). `addStatus(e, 'block', n)`은 `block`과 `freshBlock`을 함께 올린다. `applyDamage`는 묵은 보호(`block - freshBlock`)를 먼저 소모한다. `tickEndOfTurn`은 `block = min(block, freshBlock)`, `freshBlock = 0`으로 만든다.

- [ ] **Step 1:** 기존 테스트 '턴 종료 … 보호는 사라짐'을 다음 두 테스트로 바꾼다. 그리고 실패를 확인한다.
```ts
test('이번 턴에 얻은 보호는 첫 턴 종료 뒤에도 남고, 두 번째 턴 종료에 사라진다', () => {
  const t1 = tickEndOfTurn(addStatus(spider(), 'block', 5)).entity
  expect(t1.statuses.block).toBe(5)
  expect(tickEndOfTurn(t1).entity.statuses.block).toBe(0)
})
test('피해는 묵은 보호부터 소모한다', () => {
  const old = tickEndOfTurn(addStatus(spider(), 'block', 3)).entity   // 묵은 보호 3
  const both = addStatus(old, 'block', 4)                                 // 새 보호 4
  const hit = applyDamage(both, 5).entity                                 // 묵은 3 + 새 2 소모
  expect(hit.statuses.block).toBe(2)
  expect(tickEndOfTurn(hit).entity.statuses.block).toBe(2)               // 새 보호 잔량만 남음
})
```
- [ ] **Step 2:** 구현 후 `npm test` 통과를 확인한다. worklog를 기록하고 커밋한다: `feat(kit): 보호는 다음 턴 종료까지 유지`

### Task 2: kit/sim 하니스

**Files:** Create `src/kit/sim/simulate.ts`, `src/kit/sim/simulate.test.ts`

**Interfaces:**
- Produces:
  - `interface SimGame<S, A> { start(seed: number): S; apply(state: S, action: A): S; legalActions(state: S): A[]; outcome(state: S): 'won' | 'lost' | null; turn(state: S): number; actionKey(action: A): string }`
  - `type Policy<S, A> = (game: SimGame<S, A>, state: S, rng: RngState) => [A, RngState]`
  - `interface RunResult { seed: number; outcome: 'won' | 'lost' | 'timeout'; turns: number; metrics: Record<string, number> }`
  - `interface SimReport { runs: number; winRate: number; lossRate: number; timeoutRate: number; avgTurns: number; avgMetrics: Record<string, number>; avgMetricsOnWin: Record<string, number>; actionCounts: Record<string, number> }`
  - `simulate<S, A>(game, policy, options: { seeds: readonly number[]; maxTurns: number; metrics: (state: S) => Record<string, number> }): { report: SimReport; runs: RunResult[] }`. 정책의 rng는 시드에서 만든다(`createRng(seed ^ 0x5eed)`).

- [ ] **Step 1:** 가짜 게임(카운터: 행동 'inc'는 값 +1, 'end'는 턴 +1, 값이 3이면 승리)으로 실패 테스트를 작성한다. 검증 항목: 승률 1, 평균 턴, actionCounts, maxTurns 초과 시 timeout(무행동 정책), 같은 시드면 같은 리포트.
- [ ] **Step 2:** 구현 후 통과를 확인하고 커밋한다: `feat(kit): 시뮬레이션 하니스`

### Task 3: enrage와 거미 루프 보강

**Files:** Modify `src/game/content/encounters.ts`, `src/game/combat/combat.ts`, `src/game/combat/combat.test.ts`, `src/game/ui/describe.ts`(+test), `src/game/ui/IntentBadge.tsx`, `src/game/ui/CombatScreen.tsx`

**Interfaces:**
- Produces: `InterventionStep`에 `{ kind: 'enrage' }` 추가. `CombatState.enraged: boolean`. `upcomingIntents(state): InterventionStep[]`(격앙이면 2개). 턴 종료 시 예고된 단계를 모두 순서대로 적용하고 loopIndex를 그 수만큼 올린다. `describeIntent(enrage)` = `'🔥 격앙: 이후 매 턴 두 번 개입'`.
- 거미 루프: `revert(subject) → revert(object) → attach(verb, fiercely) → pollute(web, 1) → enrage`

- [ ] **Step 1:** combat 테스트를 추가하고 실패를 확인한다. 검증 항목: 5번째 턴 종료 후 `enraged === true`이고 `upcomingIntents`가 2개다. 격앙 후 턴 종료에서 `intervention` 이벤트가 2개 나온다. describe 테스트도 추가한다.
- [ ] **Step 2:** 구현한다. 기존 테스트 중 루프 순서에 의존하는 것('3번째 개입은 오염' → 4번째, '턴 종료 후 다음 예고' → revert(object))은 새 루프에 맞게 고치고 ledger에 기록한다.
- [ ] **Step 3:** UI 예고 배지가 여러 개를 표시하게 하고, `npm test && npm run e2e`로 확인한 뒤 커밋한다: `feat(game): 격앙 개입과 거미 루프 보강`

### Task 4: 전투 어댑터, 봇 3종, 리포트 CLI

**Files:** Create `src/game/sim/combatGame.ts`, `src/game/sim/bots.ts`, `src/game/sim/sim.test.ts`, `scripts/sim.ts`. Modify `package.json`(`"sim": "tsx --tsconfig tsconfig.app.json scripts/sim.ts"`)

**Interfaces:**
- Consumes: `simulate`, `reduceCombat`, `startCombat`
- Produces:
  - `combatGame(encounterId: string, balance: Balance): SimGame<CombatState, CombatAction>`. `legalActions`는 손패 카드 × (모든 슬롯 head, 각 수식어 칸) × (지목이면 살아 있는 적마다) 중 `rejected`가 나지 않는 것과 `endTurn`이다.
  - `passiveBot`(항상 endTurn), `randomBot`(합법 행동 중 균등 선택), `greedyBot`(각 후보 a에 대해 `apply(a)` 후 `endTurn`을 적용한 상태의 점수 = `플레이어 HP − 1.5 × 적 HP 합 + (승리 ? 1000 : 0) − (패배 ? 1000 : 0)`. 후보 중 최고 점수가 "지금 endTurn"의 점수보다 높으면 그 행동을, 아니면 endTurn을 고른다).
  - 지표: `hpLost`(최대 HP − 현재 HP), `turns`
  - `npm run sim -- spider 200` → 봇별 리포트 표를 출력한다.
- [ ] **Step 1:** `sim.test.ts`: 무행동 봇이 합법 행동으로 항상 endTurn을 고르는지, 합법 행동 목록에 항상 endTurn이 있는지, 탐욕 봇이 첫 턴에 아무것도 안 할 때보다 나은 결과를 내는지(같은 시드에서 1턴 후 HP 비교) 검증한다.
- [ ] **Step 2:** 구현 후 `npm run sim -- spider 200`을 실행하고 결과를 worklog에 붙인다. 커밋한다: `feat(game): 전투 시뮬레이션 어댑터·봇·CLI`

### Task 5: 밸런스 게이트와 튜닝

**Files:** Create `src/game/sim/balanceGate.test.ts`, `src/game/sim/targets.ts`. Modify `src/game/content/encounters.ts`, `balance.ts`(필요 시)

**Interfaces:**
- Produces: `BALANCE_TARGETS = { greedyWinRate: [0.6, 0.85], greedyHpLostOnWin: [15, 35], passiveWinRate: [0, 0] }`
- [ ] **Step 1:** 게이트 테스트를 작성한다(시드 1..100, maxTurns 30). 처음에는 실패할 수 있으며, 그 결과가 튜닝의 출발점이다.
- [ ] **Step 2:** 거미 HP, 개입 루프, 단어 수치를 조정해 게이트를 통과시킨다. 조정마다 sim 결과를 worklog에 남긴다. 조정은 데이터(`content/`)만 바꾸고 규칙 코드는 바꾸지 않는다. 데이터만으로 불가능하면 ledger에 Ruling을 남기고 멈춘다.
- [ ] **Step 3:** 전체 검증(`npm test && npm run lint && npm run e2e && npm run build`) 후 커밋한다: `balance: 거미 조우 기계 검증 통과`
