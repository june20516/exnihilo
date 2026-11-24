# 문장 던전 형용사 상태 Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 형용사를 꾸민 명사의 상태로 만든다. 지속 시간이 "적 차례까지"인 형용사는 낭독 뒤 그 개체에 남아 이어지는 적 차례의 피해 계산에 들어간다.

**Architecture:**
- 지속 시간과 상태 이름은 형용사 효과(`WordEffect`의 adjective 분기)에 둔다.
- 남은 상태는 `RallyState.lingering`(개체 id → 형용사 단어 id 목록)으로 들고 다닌다.
  - 낭독(`runSentence`)이 실행된 절의 주어·목적어 형용사를 기록한다.
  - 적 절을 해석할 때 `ResolveContext.lingering`으로 넘겨 칸의 효과와 합친다.
  - 적 차례가 끝나면 비운다.
- kit의 `Entity`는 바꾸지 않는다.

**Tech Stack:** TypeScript strict, Vitest, React 19, Playwright

**Spec:** `docs/suberpowers/specs/2026-11-24-pilot-was-spoken-adjective-states-design.md`

## Global Constraints

- 지속 시간 값은 `'cast' | 'enemyTurn'` 둘뿐이다. 화면 이름은 "이번 낭독" / "적 차례까지"(임시 이름)다.
- 형용사 6장의 효과·지속·상태 이름은 spec §4 표 그대로다.
  - 거대한: cast
  - 굶주린: cast
  - 금이 간: enemyTurn, 금이 감
  - 눈먼: enemyTurn, 눈멂
  - 단단한: enemyTurn, 단단함
  - 독을 뿜는: enemyTurn, 독을 뿜음
- 낭독 중 계산(계산식, `sentencePower`, 내 절 피해)은 바뀌지 않는다.
- 남은 상태는 내 절 해석에는 쓰지 않고 적 절 해석에만 쓴다. 남은 상태에는 수식의 사슬 배율을 붙이지 않는다.
- 엔진 디렉터리는 React를 쓰지 않는다. `any`와 `Math.random`은 쓰지 않는다.

## Review Focus

1. 적이 둘인 조우에서 한 적에게만 눈먼을 붙임 → 다른 적의 피해는 그대로여야 한다(Task 2 테스트).
2. 상태가 남은 적이 내 낭독으로 쓰러짐 → 오류 없이 무시되고 다음 턴에 남지 않아야 한다(Task 2 테스트).
3. 텍스트 플레이 저장 파일(JSON)을 저장했다 읽어도 남은 상태가 같아야 한다(Task 3: 기존 JSON 왕복 테스트에 상태가 남은 상태를 넣는다).
4. 같은 적에게 눈먼 두 장 → ×0.25로 곱해진다(Task 2 테스트).
5. 미리보기는 남은 상태를 반영한 적 차례 숫자를 보여야 한다(Task 2 미리보기 테스트).

---

### Task 1: 형용사 지속 시간·상태 이름, 카드 설명, 상점 제외

**Files:**
- Modify: `pilot-was-spoken/src/game/content/words.ts`, `pilot-was-spoken/src/game/ui/describe.ts`, `pilot-was-spoken/src/game/run/shop.ts`
- Test: `pilot-was-spoken/src/game/ui/describe.test.ts`, `pilot-was-spoken/src/game/run/shop.test.ts`, 새 `pilot-was-spoken/src/game/content/words.test.ts`

**Interfaces:**
- Produces:
  - `export type Lasts = 'cast' | 'enemyTurn'`
  - adjective 효과: `{ readonly type: 'adjective'; readonly mods: readonly AdjectiveMod[]; readonly lasts: Lasts; readonly stateName: string | null }`. `stateName`은 enemyTurn일 때 문자열, cast일 때 null.
  - `export const LASTS_TEXT: Record<Lasts, string> = { cast: '이번 낭독', enemyTurn: '적 차례까지' }` (describe.ts)

- [ ] **Step 1: 실패하는 테스트**
  - `words.test.ts`: 형용사 6장이 spec 표의 `lasts`와 `stateName`을 가진다. 예: `getWord('blind').effect`가 `{ lasts: 'enemyTurn', stateName: '눈멂' }`를 포함하고, `giant`는 `{ lasts: 'cast', stateName: null }`를 포함한다.
  - `describe.test.ts`: `describeWord(getWord('blind'))`가 `'주는 피해 ×0.5 · 적 차례까지'`로 끝나고, `giant`는 `' · 이번 낭독'`으로 끝난다. 기존 형용사 기대 문자열도 이 형식으로 고친다.
  - `shop.test.ts`: `WORD_POOL`에 `'slowly'`가 없고 `'blind'`, `'sturdy'`는 있다.
- [ ] **Step 2: 실행해 실패 확인.** Run: `cd pilot-was-spoken && npx vitest run src/game/content src/game/ui/describe.test.ts src/game/run/shop.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현**
  - `adjective(lasts, stateName, ...mods)` 헬퍼로 6장을 정의한다.
  - describe는 효과 문구 뒤에 `· ${LASTS_TEXT[lasts]}`를 붙인다.
  - shop은 `SHOP_EXCLUDED: readonly WordId[] = ['slowly']`를 둬 풀에서 뺀다.
  - 강화(`effectiveWord`)가 adjective의 `lasts`·`stateName`을 보존하는지 tsc로 확인한다.
- [ ] **Step 4: 통과 확인.** Run: `npx vitest run && npx tsc -b` / Expected: PASS, tsc 0
- [ ] **Step 5: Commit** `feat(pilot-was-spoken): 형용사 지속 시간·상태 이름, 천천히 상점 제외`

### Task 2: 남은 상태(엔진)

**Files:**
- Modify: `pilot-was-spoken/src/game/resolve/resolve.ts`, `pilot-was-spoken/src/game/rally/combat.ts`
- Test: 새 `pilot-was-spoken/src/game/rally/lingering.test.ts`, `pilot-was-spoken/src/game/rally/preview.test.ts`

**Interfaces:**
- Consumes: Task 1의 adjective 효과 `lasts`
- Produces:
  - `RallyState.lingering: Readonly<Record<string, readonly WordId[]>>` (startRally는 `{}`)
  - `ResolveContext.lingering?: (entityId: string) => readonly WordId[]`: 해석기가 dealDamage에서 그 개체의 남은 형용사 mods를 칸 mods와 합친다. 주는 쪽은 outgoingMul·outgoingFlat·onHitPoison, 받는 쪽은 incomingMul·incomingFlat이다. 사슬은 붙이지 않는다.
  - `runSentence`의 반환에 `lingering: Record<string, WordId[]>`를 추가한다. 실행된(무효가 아닌) 절마다 주어·목적어 칸(빌려 온 형용사 포함, 실제 대상 전부)에 놓인 enemyTurn 형용사를 기록한다. 내 단어만 센다.
  - cast가 그 결과를 `state.lingering`에 합친다. 적 차례의 적 절 해석(`runClause` side enemy)에 넘긴다. 적 차례 끝(tickEndOfTurn과 같은 곳)에 `{}`로 비운다.

- [ ] **Step 1: 실패하는 테스트** (`lingering.test.ts`, 픽스처 `test-dummy`(물어뜯는다 7)·`test-pair`(깨문다 3 ×2), 손패를 직접 지정)
  - `눈먼을 적에게 놓고 낭독하면 그 적 차례 피해가 ×0.5`: 물어뜯는다 + 목적어 눈먼 → 적 차례 damaged(e0→player) amount+blocked = floor(7×0.5)=3
  - `단단한을 나에게 놓으면 적 차례에 받는 피해 −3`: 4
  - `금이 간을 나에게 놓으면 적 차례에 받는 피해 ×1.5`: 10
  - `독을 뿜는을 적에게 놓으면 그 적의 공격에 독 2가 붙는다`: statusApplied(player, poison, 2)
  - `거대한·굶주린은 남지 않는다`: lingering이 빈다. 적 피해 7
  - `적 차례가 끝나면 남은 상태가 사라진다`: endTurn 뒤 `lingering`이 `{}`
  - `무효가 된 절의 형용사는 남지 않는다`: 주어 빙결 + 목적어 눈먼 → lingering 없음
  - `모두를 꾸미면 전원에게 남는다`: test-pair, 목적어 "모두" + 눈먼 → e0·e1 둘 다. 깨문다 3 → 1씩
  - `그러면서로 빌려 온 형용사도 둘째 절 대상에게 남는다`
  - `한 적에게만 붙이면 다른 적은 그대로`(Review Focus 1): test-pair, e0에만 눈먼 → e0 1, e1 3
  - `상태가 남은 적이 쓰러져도 오류 없다`(Review Focus 2)
  - `눈먼 두 장은 곱해진다`(Review Focus 4): 7 × 0.25 → 1
  - preview.test에 추가: `미리보기의 적 차례 피해에 남은 상태가 반영된다`(Review Focus 5)
- [ ] **Step 2: 실행해 실패 확인.** Run: `npx vitest run src/game/rally/lingering.test.ts src/game/rally/preview.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현**: 위 Interfaces대로 구현한다.
- [ ] **Step 4: 통과와 회귀 확인.** Run: `npx vitest run && npx tsc -b && npx oxlint src` / Expected: 모두 통과. 기존 계산식·카드 보존 속성 테스트도 그대로 통과해야 한다.
- [ ] **Step 5: Commit** `feat(pilot-was-spoken): 형용사 상태가 적 차례까지 남는다`

### Task 3: 화면·텍스트 플레이 표시

**Files:**
- Modify: `pilot-was-spoken/src/game/ui/EntityCard.tsx`, `pilot-was-spoken/src/game/ui/Battlefield.tsx`, `pilot-was-spoken/src/game/ui/CombatScreen.tsx`, `pilot-was-spoken/src/game/play/textPlay.ts`
- Test: `pilot-was-spoken/src/game/play/textPlay.test.ts`, `pilot-was-spoken/tests/e2e/combat-slice.spec.ts`

**Interfaces:**
- Consumes: Task 2의 `RallyState.lingering`, Task 1의 `stateName`·`LASTS_TEXT`
- Produces:
  - `lingeringText(state: RallyState, entityId: string): string[]` (rally/text.ts): 예 `['눈멂 · 적 차례까지']`. 같은 단어 두 장이면 `'눈멂 ×2 · 적 차례까지'`.
  - EntityCard prop `states: readonly string[]`: 칩으로 표시한다. testid는 `states-${entity.id}`.

- [ ] **Step 1: 실패하는 테스트**
  - textPlay.test:
    - 눈먼을 적에게 놓고 낭독 → 적 차례가 끝나기 전 상태를 직접 만들어 렌더 → 적 줄에 `눈멂 · 적 차례까지`
    - JSON 왕복 테스트에 남은 상태가 있는 상태를 넣는다(Review Focus 3).
  - rally/text.test: `lingeringText` 두 경우
  - e2e(combat-slice, 샌드박스 seed 5): 덱 편집으로 눈먼을 넣는다. 손패에 올 때까지 턴 종료를 최대 6번 반복한다. 눈먼을 목적어 칸에, 동사를 놓고 낭독한다. 연출 중 `states-e0`에 `눈멂`이 보인다.
- [ ] **Step 2: 실행해 실패 확인.** Run: `npx vitest run src/game/play src/game/rally/text.test.ts && npx playwright test combat-slice` / Expected: FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 확인.** Run: `npx vitest run && npx tsc -b && npx oxlint src tests && npx playwright test` / Expected: 모두 통과
- [ ] **Step 5: Commit** `feat(pilot-was-spoken): 남은 형용사 상태 표시`

### Task 4: 기계 검증 재측정

**Files:**
- Modify: `docs/lab/worklog/pilot-was-spoken.md`
- 필요하면: `pilot-was-spoken/src/game/content/enemies.ts`(튜닝 손잡이)

- [ ] **Step 1: 실행** `npx vitest run src/game/sim/balanceGate.test.ts`, `npm run -s gate -- --skip-train`, `npm run -s ceiling -- --runs 200 --sim 60`
- [ ] **Step 2: 판정**
  - 기본 랠리 게이트가 깨졌으면 적 수치로만 맞춘다. 맞지 않으면 멈추고 측정표를 붙여 보고한다.
  - 런 게이트의 기존 실패 3항목은 알려진 설계 질문이라 이 task의 통과 조건이 아니다.
- [ ] **Step 3: 작업 로그에 결과를 남기고 Commit** `docs(lab): 형용사 상태 도입 후 재측정`
