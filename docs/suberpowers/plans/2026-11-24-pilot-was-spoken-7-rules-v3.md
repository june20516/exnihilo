# 문장 던전 Plan 7: 규칙 v3 Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 손패 6·기본 동사·망각 비순환과 서고 바닥 대가·보호 덩어리(카드 속성 이월)·되받아친다·떠올린다·상점 새로고침을 넣고, "때리기만 하는 봇"으로 결정 구조를 판정한다.

**Architecture:** 보호 덩어리는 kit(`entity.ts`)의 범용 규칙으로 두고, `statuses.block`은 덩어리 합으로 유지해 읽는 쪽을 바꾸지 않는다. 덱 이동(떠올린다, 서고 바닥)은 해석기가 아니라 `combat.ts`가 맡고, 해석기는 떠올릴 장수만 돌려준다. 기본 동사는 손패 밖의 고정 instanceId(`BASIC_VERB_INSTANCE`)로 같은 `place` 행동을 탄다.

**Tech Stack:** TypeScript strict, Vitest, React 19 + Tailwind v4(최소 화면), Playwright, tsx 스크립트

**Spec:** `docs/suberpowers/specs/2026-11-24-pilot-was-spoken-v3-rules-design.md`

## Global Constraints

- `any`와 `Math.random` 금지. 엔진 디렉터리(grammar, content, sentence, resolve, combat, rally, build, run, play, sim)는 React를 import하지 않는다. kit은 game을 import하지 않는다.
- 주석, 화면 문구, 테스트 이름은 한국어로 쓴다. 화면 이름 서고·망각·낭독은 바꾸지 않는다.
- 규칙 손잡이 값: 탐험가 `handMax` 6, `RALLY_RULES.emptyDrawHpLoss` 2, 떠올린다 4장, 새로고침 3에서 시작해 +1.
- 보호 처음 값: 막는다 6/holds 1, 숨는다 10/0, 버틴다 4/3, 거미 웅크린다 8/0, 여왕 웅크린다 10/1, 문지기 버틴다 20/0.
- 기본 동사: 탐험가의 기본 동사는 id `strike`, 문구 "때린다", 타동사, 공격, 피해 3. 강화 불가, 상점 불가.
- 테스트 명령: `npx vitest run <경로>`, 전체 `npx vitest run`, 타입 `npx tsc -b`, 린트 `npx oxlint`, e2e `npx playwright test`. 모두 `pilot-was-spoken/`에서 실행한다.
- Minor도 그 자리에서 고친다(사용자 규칙).
- **확장 가능한 구조(사용자 규칙)**
  - 카드, 유물, 캐릭터, 적, 층은 데이터 정의 표에 두고 엔진은 id로 읽는다. 특정 단어·적 id를 로직에서 분기하지 않는다.
  - 캐릭터마다 달라질 값(최대 HP, 손패 최대치, 버리기, 기본 동사, 시작 덱)은 캐릭터 정의(`content/characters.ts`)에서 읽는다.
  - 모든 수치는 데이터 필드나 이름 있는 상수(손잡이)에 둔다. 로직 안에 숫자 리터럴을 쓰지 않는다. 규칙 손잡이는 `content/balance.ts`에, 콘텐츠 수치는 각 콘텐츠 표에 둔다(Task 1).

## Review Focus

1. 서고와 망각이 둘 다 비었는데 손패를 채워야 할 때. 모자란 장수만큼 HP가 줄어야 하고, 무한 루프나 음수 HP가 나오면 안 된다. 그 대가로 플레이어가 쓰러지면 즉시 패배해야 한다.
2. 버리기를 서고가 빈 상태에서 할 때. 버린 장수만큼 HP를 잃어야 한다. 버린 카드가 같은 버리기에서 바로 다시 뽑히면 안 된다.
3. 기본 동사가 판에 놓인 채 턴 종료, 문장 비우기, 연결어 빼기, 낭독을 할 때. 손패·서고·망각 어디에도 들어가면 안 되고, 다음 턴에 다시 놓을 수 있어야 한다.
4. 미리보기와 실제 결과가 같아야 한다. 되받아친다의 위력(보호 합), 적 보호의 이월, 서고 바닥 HP 손실이 미리보기와 실제 낭독에서 같아야 한다.
5. 구버전 저장(텍스트 플레이 JSON)을 불러올 때. 개체에 `blockChunks`가 없고 `freshBlock`만 있거나, 상점에 `rerolls`가 없어도 깨지지 않아야 한다.

---

### Task 1: 확장 구조 리팩터링 (동작 불변)

**Files:**
- Modify: `src/game/build/relics.ts`, `src/game/build/build.ts`, `src/game/rally/combat.ts`, `src/game/resolve/resolve.ts`, `src/game/content/words.ts`, `src/game/content/balance.ts`, `src/game/run/shop.ts`, `src/game/run/floors.ts`, `src/game/run/run.ts`, 그리고 `Balance`를 받는 모든 호출부(`grep -rln "Balance\|balance" src scripts tests`)
- Create: `src/game/rally/hooks.ts`, `src/game/rally/deckFlow.ts`, `src/game/rally/enemyTurn.ts`
- Test: `src/game/build/relics.test.ts`(생성), 기존 전체 테스트

**목표**: 새 유물, 단어, 적, 층, 수치를 데이터만 고쳐서 넣을 수 있게 한다. 동작은 한 군데도 바꾸지 않는다. 판정 기준은 기존 테스트 전체, 기본 랠리 게이트, `npm run ceiling`의 엔진 교차 검증이 리팩터링 전과 같은 값을 내는 것이다.

**Interfaces:**
- Produces:
  - **유물 효과의 데이터화**
    - `RelicDef.effect: RelicEffect`. 종류는 다음과 같다.
      - `{ kind: 'perWordBonus'; amount: number }`: 긴 문장, 2
      - `{ kind: 'blankSubjectBonus'; amount: number }`: 생략의 미학, 4
      - `{ kind: 'chainBoost'; factor: number; minAdjectives: number }`: 수식의 사슬, 2와 2
      - `{ kind: 'adverbTwice' }`: 강세
      - `{ kind: 'poisonBonus'; amount: number }`: 독의 문법, 2
      - `{ kind: 'impliedSubject'; token: TokenId }`: 허수아비 화자, scarecrow
      - `{ kind: 'returnFirstVerb' }`: 울림
      - `{ kind: 'soloRepeat'; amount: number }`: 메아리, 1
    - `clauseHooks`, `materializeFor`, 울림 처리는 유물 id가 아니라 **가진 유물들의 effect.kind**를 접어서 훅을 만든다.
    - `CHAIN_FACTOR` 상수와 resolve의 하드코딩된 `>= 2`는 지우고, 훅 `chainBoost: { factor, minAdjectives } | undefined`로 넘긴다.
    - rally·resolve 코드에는 유물 id 문자열이 남지 않는다.
  - **강화 규칙**: `build.ts`에 `UPGRADE_RULES = { amountMul: 1.5, mulStep: 0.5, flatStep: 3, poisonStep: 1, maxLevel: 2 } as const`를 둔다. `type UpgradeLevel`과 run.ts의 `1 | 2` 계산은 `maxLevel`에서 나온다.
  - **상점 제외**: `WordDef.inShop: boolean`(기본 true, slowly만 false)을 두고 `SHOP_EXCLUDED`를 지운다.
  - **규칙 손잡이 모음**
    - `content/balance.ts`를 규칙 수치(손잡이)의 집으로 삼는다. 이름 있는 상수를 묶음별로 export한다.
      - `RALLY_RULES`: 기존 손패·드로우 값, `soRatio: 0.5`, `enemyModifierSlots: 2`, `maxSlots: 4`
      - `RUN_RULES`: `healRatio`, `rewardGold`, 층 배율 `BASE`·`HARD`
      - `SHOP_RULES`: `basePrice`, `rarityAdjust`, `rarityWeight`, `materialWeight`, `priceGrowth`, `shopSize`
    - 콘텐츠 고유 값(단어 수치, 유물 수치, 적 HP)은 각 콘텐츠 표에 그대로 둔다.
    - `Balance` 타입과 `balance` 인자를 엔진·sim·UI·스크립트의 모든 signature에서 지운다. `playerMaxHp`는 Task 5의 캐릭터 정의로 옮기기 전까지 `RALLY_RULES.playerMaxHp`에 임시로 둔다.
    - **이후 task의 signature에 적힌 `balance` 인자는 없는 것으로 읽는다.**
  - **`PLAYER_DEF_ID = 'player'`** 상수를 `combat.ts`에 두고, `resolve.ts`와 `RunTopBar.tsx`의 문자열 비교를 이것으로 바꾼다.
  - **combat.ts 나누기**(re-export하지 않고 import를 직접 고친다)
    - `rally/hooks.ts`: `clauseHooks`, `countedWords`, `connectiveMode`, `materializeFor`, `soBonusFrom`
    - `rally/deckFlow.ts`: `drawCards`, `cardsFrom`, 손패 넘침 처리
    - `rally/enemyTurn.ts`: `enemyPhase`, `addSeal`, `clearSeals`, `nextSealRole`

- [ ] **Step 1: 기준값 기록**
  - `npx vitest run`, `npx vitest run src/game/sim/balanceGate.test.ts`, `npm run ceiling`을 실행한다. 출력은 작업 공간 파일에 저장한다.
  - Expected: 모두 통과. ceiling의 엔진 교차 검증이 모두 일치한다.
- [ ] **Step 2: 실패하는 테스트 작성** (`relics.test.ts`)
  - '모든 유물 정의는 effect를 갖고, 효과 문구에 effect의 수치가 들어 있다'
  - '같은 종류의 유물 정의를 하나 더 만들면(테스트 안 가짜 정의) clauseHooks가 같은 훅을 낸다': 유물 id가 아니라 effect로 동작함을 고정한다.
- [ ] **Step 3: 실패 확인**: `npx vitest run src/game/build/relics.test.ts`
  - Expected: FAIL. `effect` 필드가 없다.
- [ ] **Step 4: 위 Interfaces대로 리팩터링.** 하위 묶음마다 `npx tsc -b && npx vitest run`을 통과시키고 커밋한다(유물 → 강화 → 상점 제외 → 손잡이와 Balance 제거 → combat 나누기).
- [ ] **Step 5: 동작 불변 확인**
  - Step 1의 세 명령을 다시 실행해 기준값 파일과 비교한다. 게이트 수치와 ceiling 출력이 같아야 한다.
  - 이어서 `npx oxlint && npx playwright test`
  - Expected: 기준값과 동일, 모두 PASS
- [ ] **Step 6: Commit**(마지막 묶음): `git commit -m "refactor(pilot-was-spoken): 유물 효과·손잡이 데이터화, Balance 인자 제거, combat 나누기"`

### Task 2: 보호 덩어리 (kit)

**Files:**
- Modify: `src/kit/core/entity.ts`
- Test: `src/kit/core/entity.test.ts`

**Interfaces:**
- Produces:
  - `interface BlockChunk { readonly amount: number; readonly turnsLeft: number }`
  - `Entity.blockChunks: readonly BlockChunk[]`(`freshBlock` 삭제). 불변식: `statuses.block === 덩어리 amount 합`
  - `addBlock(entity: Entity, amount: number, holds: number): Entity`
  - `expireBlock(entity: Entity): Entity`: 주인의 차례 시작에 호출한다. turnsLeft 0인 덩어리를 지우고 나머지는 1씩 줄인다.
  - `removeAllBlock(entity: Entity): { entity: Entity; removed: number }`
  - `addStatus(entity, kind: Exclude<StatusKind, 'block'>, amount)`: block은 받지 않는다.
  - `applyDamage`는 turnsLeft 오름차순으로, 같으면 먼저 생긴 순서로 깎는다.
  - `tickEndOfTurn`은 보호를 건드리지 않는다. `clearBlock`은 삭제한다.

- [ ] **Step 1: 실패하는 테스트 작성** (`entity.test.ts`. 기존 freshBlock 테스트는 아래로 대체)

```ts
test('보호 덩어리: holds 0은 다음 자기 차례 시작에 사라지고 holds 1은 한 번 더 남는다', () => {
  let e = addBlock(addBlock(createEntity(base), 6, 0), 4, 1)
  expect(e.statuses.block).toBe(10)
  e = expireBlock(e)
  expect(e.statuses.block).toBe(4)
  expect(e.blockChunks).toEqual([{ amount: 4, turnsLeft: 0 }])
  expect(expireBlock(e).statuses.block).toBe(0)
})
test('피해는 곧 사라질 덩어리부터 깎는다', () => {
  const e = addBlock(addBlock(createEntity(base), 4, 2), 6, 0)
  const r = applyDamage(e, 7)
  expect(r.blocked).toBe(7)
  expect(r.entity.blockChunks).toEqual([{ amount: 3, turnsLeft: 2 }])
})
test('같은 남은 턴이면 먼저 생긴 덩어리부터 깎는다', () => {
  const e = addBlock(addBlock(createEntity(base), 3, 1), 5, 1)
  expect(applyDamage(e, 4).entity.blockChunks).toEqual([{ amount: 4, turnsLeft: 1 }])
})
test('removeAllBlock은 보호를 모두 없애고 없앤 양을 돌려준다', () => {
  const r = removeAllBlock(addBlock(addBlock(createEntity(base), 3, 0), 5, 2))
  expect(r.removed).toBe(8)
  expect(r.entity.statuses.block).toBe(0)
  expect(r.entity.blockChunks).toEqual([])
})
test('턴 종료 처리는 보호를 건드리지 않는다', () => {
  expect(tickEndOfTurn(addBlock(createEntity(base), 5, 0)).entity.statuses.block).toBe(5)
})
```

- [ ] **Step 2: 실패 확인**: `npx vitest run src/kit/core/entity.test.ts`
  - Expected: FAIL. `addBlock`, `expireBlock`, `removeAllBlock`이 export되지 않았다.

- [ ] **Step 3: `entity.ts` 구현**
  - `createEntity`는 `blockChunks: []`로 만든다.
  - 덩어리를 바꾸는 모든 함수는 `statuses.block`을 합으로 다시 계산한다. 이 계산은 내부 함수 `withChunks(entity, chunks)` 하나에 둔다.
  - amount가 0인 덩어리는 남기지 않는다.

- [ ] **Step 4: 통과 확인**: `npx vitest run src/kit/core/entity.test.ts`
  - Expected: PASS. `npx tsc -b`는 아직 `clearBlock`·`freshBlock`·`addStatus(..., 'block')` 호출부에서 실패한다. 커밋 전에 Step 5에서 호출부를 같은 동작으로 옮겨 타입 오류를 없앤다.

- [ ] **Step 5: 호출부를 같은 동작으로 옮기기**
  - `startPlayerTurn`(combat.ts)과 `enemyPhase`(enemyTurn.ts)의 `clearBlock`을 `expireBlock`으로 바꾼다(holds 0이면 같은 동작).
  - resolve.ts block 동작의 `addStatus(e, 'block', amount)`를 `addBlock(e, amount, 0)`으로 바꾼다(holds는 Task 3에서 카드 속성으로 바꾼다).
  - `cleanse`의 `addStatus` 연쇄는 그대로 둔다(block이 아님).
  - `npx tsc -b && npx vitest run`
  - Expected: 모두 PASS. 기존 freshBlock 동작을 고정하던 테스트가 실패하면, 그 테스트를 덩어리 규칙 기준으로 고친다. 고친 테스트 이름은 ledger에 적는다.

- [ ] **Step 6: Commit**: `git commit -m "feat(kit): 보호를 남은 턴을 가진 덩어리로 바꾼다"`

### Task 3: 단어 정의와 해석기 (보호 이월, 되받아친다, 떠올린다, 공격/지원)

**Files:**
- Modify: `src/game/content/words.ts`, `src/game/content/enemies.ts`(시작 덱), `src/game/resolve/resolve.ts`, `src/game/rally/sentence.ts`, `src/game/rally/formula.ts`, `src/game/rally/formulaText.ts`, `src/game/ui/describe.ts`, `src/game/build/build.ts`(필요 시), `src/game/run/shop.ts`(`SHOP_EXCLUDED`)
- Test: `src/game/content/words.test.ts`, `src/game/resolve/resolve.test.ts`(없으면 생성), `src/game/rally/formula*.test.ts`, `src/game/ui/describe.test.ts`

**Interfaces:**
- Consumes: Task 2의 `addBlock`, `removeAllBlock`
- Produces:
  - `type VerbRange = 'attack' | 'support'`. 기존 melee·ranged는 모두 attack으로 바꾼다.
  - `VerbAction`의 `block`에 `readonly holds: number`(필수)를 둔다. 새 동작 `{ kind: 'counter' }`, `{ kind: 'recall'; amount: number }`를 추가한다.
  - 새 단어
    - `strike`: 때린다, verbTransitive, attack, 피해 3, `enemyOnly: true`. 덱과 상점에 들어가지 않게 하려는 것이다. 놓을 수 있게 하는 것은 Task 5가 맡는다.
    - `endure`: 버틴다, verbIntransitive, support, block 4 holds 3, common
    - `counter`: 되받아친다, verbTransitive, attack, counter, uncommon
    - `recall`: 떠올린다, verbIntransitive, support, recall 4, common
  - `ResolvedClause.recalls: number`: 이 절에서 실행된 recall amount의 합(반복 포함)
  - `ClauseCalc.baseLabel: 'block' | null`: 되받아친다면 'block'
- 시작 덱에서 `bite` 1장을 `counter`로 바꾼다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - words.test
    - `getWord('guard').effect`의 block 동작이 `{ amount: 6, holds: 1 }`이다.
    - `hide`는 `{ amount: 10, holds: 0 }`, `endure`는 `{ amount: 4, holds: 3 }`이다.
    - 적 `curl`은 holds 0, `queenCurl`은 holds 1, `gateCurl`은 holds 0이다.
    - 모든 동사의 range가 `'attack' | 'support'` 중 하나다.
    - `RALLY_STARTER_DECK`에 `counter`가 1장, `bite`가 2장 있다.
  - resolve.test
    - '막는다는 holds 1 덩어리를 만든다': 해석 후 주어 `blockChunks`가 `[{amount:6, turnsLeft:1}]`이다.
    - '되받아친다는 주어의 보호 합을 위력으로 쓰고 보호를 비운다': 주어 보호 8에 격렬하게(×1.5)를 붙이면 목적어 피해가 12이고, 주어 보호는 0이다.
    - '되받아친다는 보호가 0이면 피해 0': 무효(fizzle)가 아니라 실행되고 피해가 0이다.
    - '떠올린다는 recalls 4를 돌려주고 두 번이면 8': `resolveClause(...).recalls`
  - formula.test: '되받아친다 계산식의 기본값은 보호 합이고 baseLabel은 block'. `sentenceCalc(state)[0]`의 `base`가 8, `baseLabel`이 'block'이고, `value`가 실제 낭독 피해와 같다.
  - describe.test
    - `describeWord(guard)`가 '보호 6 · 1턴 유지'를 포함하고 '(근접)', '(원거리)'를 포함하지 않는다.
    - counter는 '주어의 보호만큼 피해, 보호를 모두 씀', recall은 '망각에서 4장을 서고로'

- [ ] **Step 2: 실패 확인**: `npx vitest run src/game/content src/game/resolve src/game/rally/formula src/game/ui/describe.test.ts`
  - Expected: FAIL. 새 단어가 없고, `holds` 필드와 `recalls` 필드가 없다.

- [ ] **Step 3: 구현**
  - **words.ts**: 위 값으로 정의를 바꾸고 새 단어를 추가한다. `VerbRange`를 줄인다.
  - **sentence.ts**: 지원 판정은 지금처럼 `range === 'support'`를 쓴다.
  - **resolve.ts**
    - block은 `addBlock(e, amount, action.holds)`로 만든다. 이벤트 `statusApplied`는 그대로 둔다.
    - counter: 목적어마다 `dealDamage(subjectId, subjectMods, objectId, objectMods, damageBase(현재 주어 보호 합))`를 실행한 뒤 `removeAllBlock(주어)`을 한다. 보호 합은 동작을 시작할 때 한 번 읽는다(목적어가 여럿이면 같은 값을 쓴다).
    - recall: 카운터에 `action.amount`를 더한다. 개체는 건드리지 않는다.
    - `needsObject`는 counter를 피해 동작처럼 다룬다.
  - **formula.ts**: `pickAction`에서 counter를 피해 동작으로 고른다. 기본값은 `source.statuses.block`이고 `baseLabel: 'block'`이다. 다른 동작은 `baseLabel: null`이다.
  - **formulaText.ts**: baseLabel이 'block'이면 식 앞에 "보호 "를 붙인다(예: "보호 8 × 1.5 = 12").
  - **describe.ts**
    - `RANGE_NAMES`와 range 접미사를 지운다.
    - block 문구: holds가 0이면 '{역할}에게 보호 n', 아니면 '{역할}에게 보호 n · {holds}턴 유지'
    - counter, recall 문구는 위 테스트대로 쓴다.
  - **build.ts**: `recall.amount`는 기존 `'amount' in action` 경로로 강화된다(4→6). counter는 강화되지 않으므로 `isUpgradable(counter)`가 false다. 별도 코드는 필요 없다. 강화 테스트를 하나 추가한다: `effectiveWord('recall', {upgrades:{recall:1}})`의 amount가 6이다.
  - **shop.ts**: strike는 enemyOnly라 풀에서 자동으로 빠진다. 확인 테스트 '상점 풀에 strike가 없다'를 추가한다.

- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx vitest run`
  - Expected: 모두 PASS. 시작 덱이 바뀌어 기존 sim·게이트 수치 테스트가 흔들릴 수 있다. `balanceGate.test.ts`가 실패하면 이 task에서는 실패 내용만 ledger에 적고, 튜닝은 Task 9이 맡는다. 다른 테스트 실패는 이 task에서 고친다.

- [ ] **Step 5: Commit**: `git commit -m "feat(pilot-was-spoken): 보호 이월 카드 속성, 되받아친다·떠올린다·버틴다, 공격/지원 분류"`

### Task 4: 전투 흐름 (손패 채우기, 망각 비순환, 서고 바닥 대가, 떠올리기, 보호 만료)

**Files:**
- Modify: `src/game/rally/combat.ts`, `src/game/rally/deckFlow.ts`, `src/game/rally/enemyTurn.ts`, `src/game/content/balance.ts`, `src/game/build/build.ts`(`EMPTY_BUILD.handMax` 6, Task 5에서 캐릭터 정의로 옮김), `src/game/combat/events.ts`, `src/game/rally/text.ts`(이벤트 문구), `src/game/fx/registry.ts`(새 이벤트 무시 또는 숫자 팝업), `src/game/sim/metrics.ts`
- Test: `src/game/rally/combat.test.ts`, `src/game/rally/preview.test.ts`

**Interfaces:**
- Consumes: Task 2 `expireBlock`, Task 3 `ResolvedClause.recalls`
- Produces:
  - `RALLY_RULES`에 `emptyDrawHpLoss: 2`를 추가하고 `startHand`, `drawPerTurn`을 지운다(`content/balance.ts`)
  - 새 이벤트
    - `{ type: 'emptyDraw'; missing: number; hpLost: number }`
    - `{ type: 'recalled'; count: number }`
  - `drawn` 이벤트의 `reshuffled` 필드를 지운다. 항상 false가 되기 때문이다.

- [ ] **Step 1: 실패하는 테스트 작성** (combat.test)
  - '턴 시작에 손패를 손패 최대치(6)까지 채운다': 첫 턴 손패 6장. 2장을 낭독하고 적 차례가 지나면 다시 6장이다.
  - '서고가 비어도 망각은 자동으로 서고로 돌아오지 않는다': 망각 n장, 서고 0장에서 턴을 넘기면 망각 장수가 그대로다.
  - '서고가 비면 모자란 장수 × 2만큼 HP를 잃고, 보호가 있어도 줄어든다': 보호 10을 두고 모자란 장수 3이면 HP −6, 보호는 그대로. 이벤트 `emptyDraw { missing: 3, hpLost: 6 }`
  - '서고 바닥으로 HP가 0이 되면 전투에서 진다': phase 'lost', `combatEnded` 이벤트
  - '서고가 빈 상태에서 버리면 버린 장수만큼 대가를 치르고, 버린 카드는 망각으로 간다'
  - '떠올린다는 망각에서 4장을 서고로 옮긴다(망각이 2장이면 2장)': `recalled` 이벤트의 count. 손패 + 서고 + 망각 + 판의 합이 보존된다.
  - '적의 holds 1 보호는 내 차례를 두 번 넘긴다': 여왕 웅크린다 뒤 적 보호가 다음 적 차례 시작에 남는다.
  - preview.test: '서고 바닥 HP 손실이 미리보기(이어서 적의 차례)에 실제와 같은 수치로 보인다'

- [ ] **Step 2: 실패 확인**: `npx vitest run src/game/rally`
  - Expected: FAIL. 손패가 5장씩 뽑히고, 망각이 다시 섞이고, `emptyDraw`와 `recalled`가 없다.

- [ ] **Step 3: 구현**
  - **drawCards(state, count)**
    - 서고에서만 뽑는다. 서고가 바닥나면 모자란 장수를 세서 플레이어에게 `loseHp(missing × emptyDrawHpLoss)`를 주고 `emptyDraw` 이벤트를 낸다.
    - 손패 넘침 소각(`burned`)은 그대로 둔다.
  - **startPlayerTurn(state)**
    - 플레이어 `expireBlock` → 버리기 회복 → `handMax − 손패 장수`만큼 drawCards
    - 뽑은 뒤 `outcomeOf`로 패배를 확인한다. 진 경우 `combatEnded`를 낸다.
    - `startRally`와 `enemyPhase` 끝에서 쓰던 장수 인자를 없앤다.
  - **enemyPhase**: 적 차례 시작에 적 `expireBlock`을 한다.
  - **discard**: 지금의 순서(먼저 뽑고, 그다음 버린 카드를 망각에 넣음)를 유지한다. 대가는 drawCards가 처리한다.
  - **cast**: `runSentence` 결과의 recall 합(runSentence가 절마다 `recalls`를 모아 반환하도록 확장)이 있으면, 망각에서 그 장수만큼 rng로 고른 카드를 서고에 섞어 넣고 `recalled`를 낸다. 이 낭독에 쓴 카드는 그 다음에 망각으로 간다.
  - **log**: `deadTurns`를 `basicVerbCasts`로 바꾸는 일은 Task 5가 한다. 이 task에서는 `emptyDrawHpLost`(누계)와 `recalledCards`(누계)를 `RallyLog`에 추가한다.
  - **text.ts**: `emptyDraw`는 "서고가 비어 HP {hpLost} 잃음", `recalled`는 "망각에서 {count}장을 떠올림"
  - **registry.ts**: `emptyDraw`는 플레이어 위에 `-n` 팝업(damage 톤), `recalled`는 팝업 없음

- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx vitest run`
  - Expected: 모두 PASS. 단 balanceGate는 Task 9이 다루므로, 실패하면 ledger에 기록만 한다.

- [ ] **Step 5: Commit**: `git commit -m "feat(pilot-was-spoken): 손패 채우기, 망각 비순환, 서고 바닥 대가, 떠올리기"`

### Task 5: 캐릭터 정의와 기본 동사

**Files:**
- Create: `src/game/content/characters.ts`
- Modify: `src/game/rally/combat.ts`, `src/game/build/build.ts`, `src/game/content/balance.ts`, `src/game/content/enemies.ts`, `src/game/run/run.ts`, `src/game/sim/combatGame.ts`, `src/game/sim/metrics.ts`, `src/game/sim/targets.ts`, `src/game/sim/balanceGate.test.ts`, `scripts/ceiling.ts`, `src/game/ui/deck.ts`
- Test: `src/game/content/characters.test.ts`, `src/game/rally/combat.test.ts`, 카드 보존 속성 테스트 파일(`grep -rln "보존" src/game`로 찾는다)

**Interfaces:**
- Produces:
  - `content/characters.ts`
    - `interface CharacterDef { readonly id: CharacterId; readonly name: string; readonly maxHp: number; readonly handMax: number; readonly discardsPerTurn: number; readonly basicVerb: WordId; readonly starterDeck: readonly WordId[] }`
    - `type CharacterId = 'explorer'`
    - `CHARACTERS: Record<CharacterId, CharacterDef>`. 탐험가는 maxHp 60, handMax 6, 버리기 1, basicVerb 'strike', 시작 덱은 지금의 `RALLY_STARTER_DECK`(Task 3에서 바꾼 것)
    - `DEFAULT_CHARACTER: CharacterId = 'explorer'`
  - `RALLY_STARTER_DECK`, `RALLY_RULES.playerMaxHp`(Task 1의 임시 자리), `EMPTY_BUILD`의 손패·버리기 값은 캐릭터 정의에서 읽도록 옮긴다.
    - `BuildState.basicVerb: WordId`를 추가한다.
    - `export function buildFor(character: CharacterDef): BuildState`
    - `EMPTY_BUILD`는 `buildFor(CHARACTERS.explorer)`로 정의한다. 기본 랠리와 테스트가 지금처럼 쓸 수 있다.
  - `startRun(seed, balance, characterId = DEFAULT_CHARACTER)`: HP, 덱, 빌드를 캐릭터에서 만든다. `RunState.characterId`를 추가하고 마이그레이션 기본값은 'explorer'다.
  - `startRally(..., options)`는 HP 기본값을 `options.playerMaxHp ?? CHARACTERS[DEFAULT_CHARACTER].maxHp`로 쓴다. `RALLY_RULES.playerMaxHp`를 지운다. 텍스트 플레이와 스크립트의 참조도 함께 옮긴다.
  - `export const BASIC_VERB_INSTANCE = 'basic'`. 기본 동사 단어는 `state.build.basicVerb`에서 읽는다(상수로 박지 않음).
  - `export function basicVerbAvailable(state: RallyState): boolean`: 판(두 절 모두)에 기본 동사가 없으면 true
  - `place`는 `instanceId === BASIC_VERB_INSTANCE`를 받는다. 이때 손패에서 꺼내지 않고, 이미 판에 있으면 `'unplayable'`로 거절한다. enemyOnly 검사를 이 경우에만 건너뛴다.
  - `cardsFrom`은 `BASIC_VERB_INSTANCE`를 걸러 낸다. 그래서 낭독, 비우기, 연결어 빼기, 턴 종료, 밀려남 어디서도 손패나 망각으로 가지 않는다.
  - `RallyLog.basicVerbCasts`(`deadTurns` 대체): 첫 절이나 둘째 절에 기본 동사가 있는 낭독의 수
  - metrics: `deadTurnRate`를 `basicVerbRate = basicVerbCasts / casts`로 바꾼다(보고만). targets에서 `maxDeadTurnRate`를 지우고, 게이트 테스트 '동사 없는 턴'을 지운다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - '기본 동사는 손패 밖에서 동사 칸에 놓이고, 낭독 뒤 망각에 들어가지 않는다': 낭독 전후 망각 장수 차이가 쓴 카드 수와 같고, `strike`가 망각·손패·서고에 없다.
  - '기본 동사는 한 낭독에 한 번만 놓을 수 있다': 연결어로 둘째 절을 연 뒤 두 번째 place는 `rejected unplayable`
  - '기본 동사는 턴 종료·비우기·연결어 빼기 뒤 다시 놓을 수 있다'
  - '기본 동사를 놓은 낭독은 basicVerbCasts를 센다'
  - 카드 보존 속성 테스트: 무작위 행동에 기본 동사 place를 섞어도 손패 + 서고 + 망각 + 판의 카드(기본 동사 제외) 수가 덱 장수와 같다.
  - combatGame: '합법 행동에 기본 동사 배치가 들어 있다'. key는 `place:strike@0:verb`
  - characters.test
    - '탐험가 정의로 만든 빌드는 손패 6, 버리기 1, 기본 동사 strike다'
    - '빌드의 basicVerb를 바꾸면 기본 동사 타일이 그 단어로 놓인다'(가짜 캐릭터 정의로 확장 가능성을 고정)
    - 'startRun은 캐릭터의 HP와 시작 덱으로 시작한다'

- [ ] **Step 2: 실패 확인**: `npx vitest run src/game/rally src/game/sim/sim.test.ts`
  - Expected: FAIL. `BASIC_VERB_INSTANCE`가 없다.

- [ ] **Step 3: 구현**
  - `legalCombatActions`는 `basicVerbAvailable`일 때 `placementsFor(state, BASIC_VERB_INSTANCE, state.build.basicVerb, balance)`를 더한다.
  - 판에 놓인 기본 동사 PlacedWord는 `owner: 'player'`, `instanceId: BASIC_VERB_INSTANCE`다.
  - 긴 문장 유물은 기본 동사도 한 단어로 센다(판에 놓인 내 단어이므로). 이 결정을 ledger에 적는다.

- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx vitest run`
  - Expected: PASS(balanceGate 수치는 Task 9)

- [ ] **Step 5: Commit**: `git commit -m "feat(pilot-was-spoken): 캐릭터 정의와 손패 밖 기본 동사"`

### Task 6: 상점 새로고침

**Files:**
- Modify: `src/game/run/shop.ts`, `src/game/run/run.ts`, `src/game/sim/shopBots.ts`, `src/game/sim/runSim.ts`
- Test: `src/game/run/shop.test.ts`, `src/game/run/run.test.ts`, `src/game/sim/runSim.test.ts`

**Interfaces:**
- Produces:
  - `ShopState.rerolls: number`
  - `SHOP_RULES.reroll = { base: 3, step: 1 }`(`content/balance.ts`)
  - `export function rerollPrice(shop: ShopState): number`(= base + step × rerolls)
  - `export function rerollShop(rng, shop, deck, build): [ShopState, RngState]`: 새로 `rollShop`한 상품으로 팔리지 않은 자리를 앞에서부터 채운다. 팔린 자리는 그대로 둔다. rerolls는 +1이다.
  - `RunAction`에 `{ type: 'reroll' }`, `RunEvent`에 `{ type: 'rerolled'; price: number }`를 추가한다.
  - 화폐가 모자라면 `notEnoughGold`로 거절한다.
  - `RunResult.rerolls: number`
  - `weightedShopBot`: 살 만한 것이 없고(`bestIndex < 0`) `gold ≥ rerollPrice(shop) + BASE_PRICE.word`이면 새로고침한다. 같은 상점에서는 최대 2번까지만 한다(`shop.rerolls < 2`, 무한 루프 방지).

- [ ] **Step 1: 실패하는 테스트 작성**
  - shop.test
    - '새로고침은 팔리지 않은 상품만 바꾸고 팔린 상품은 남긴다'
    - '새로고침 값은 3, 4, 5로 오른다'
  - run.test
    - '새로고침은 화폐를 깎고 rerolled 이벤트를 낸다'
    - '화폐가 모자라면 notEnoughGold로 거절된다'
    - '상점 단계가 아니면 거절된다'
  - runSim.test: '학습 봇은 같은 상점에서 새로고침을 2번 넘게 하지 않는다'(시드 몇 개로 RunResult.rerolls ≤ 2 × 상점 수)

- [ ] **Step 2: 실패 확인**: `npx vitest run src/game/run src/game/sim/runSim.test.ts`
  - Expected: FAIL. `rerollShop`이 없다.

- [ ] **Step 3: 구현**: 위 인터페이스대로 구현한다. `rollShop`은 `rerolls: 0`으로 만든다.

- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx vitest run`
  - Expected: PASS

- [ ] **Step 5: Commit**: `git commit -m "feat(pilot-was-spoken): 상점 새로고침"`

### Task 7: 텍스트 플레이와 저장 호환

**Files:**
- Modify: `src/game/play/textPlay.ts`, `scripts/play.ts`(필요 시)
- Test: `src/game/play/textPlay.test.ts`

**Interfaces:**
- Consumes: Task 5 `BASIC_VERB_INSTANCE`, Task 6 `{ type: 'reroll' }`
- Produces:
  - 명령: `0`은 기본 동사를 뜻한다(손패 번호와 겹치지 않음). `reroll`은 상점 새로고침이다.
  - `renderRun`
    - 손패 줄 앞에 "[0] 때린다 (기본)"
    - 개체 줄에 보호 덩어리를 보인다. 예: "보호 10 (6, 4·2턴)"
    - 상점에 "새로고침 n"
    - 이벤트 줄에 `emptyDraw`와 `recalled`
  - `migrateRunState`
    - 개체마다 `blockChunks`가 없으면 `statuses.block > 0`일 때 `[{amount: block, turnsLeft: 0}]`, 아니면 `[]`로 채운다. `freshBlock`은 지운다.
    - `shop.rerolls`가 없으면 0으로 채운다.
    - `log.deadTurns`가 있고 `basicVerbCasts`가 없으면 0으로 채운다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - '0으로 기본 동사를 동사 칸에 놓는다'
  - 'reroll 명령은 상점을 새로 뽑는다'
  - '구버전 저장(freshBlock, rerolls 없음)을 migrateRunState가 덩어리로 옮긴다': block 7이면 `blockChunks [{7,0}]`
  - 'renderRun은 보호 덩어리와 서고 바닥 대가를 보인다'

- [ ] **Step 2: 실패 확인**: `npx vitest run src/game/play`
  - Expected: FAIL

- [ ] **Step 3: 구현**: 마이그레이션은 기존 `Object.hasOwn` 방식으로 쓴다.

- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx vitest run`
  - Expected: PASS

- [ ] **Step 5: Commit**: `git commit -m "feat(pilot-was-spoken): 텍스트 플레이에 v3 규칙과 저장 호환"`

### Task 8: 최소 화면

**Files:**
- Modify: `src/game/ui/CombatScreen.tsx`, `src/game/ui/Hand.tsx`(기본 동사 타일 자리), `src/game/ui/EntityCard.tsx`(보호 덩어리 글자), `src/game/ui/ShopScreen.tsx`(새로고침 버튼), `src/app/useRunStore.ts`(필요 시), `src/game/ui/SidePanel.tsx`(새 이벤트 문구는 text.ts를 따름)
- Test: `tests/e2e/run.spec.ts`, `tests/e2e/combat-slice.spec.ts`

**Interfaces:**
- Consumes: Task 4 이벤트, Task 5 `BASIC_VERB_INSTANCE`·`basicVerbAvailable`, Task 6 `reroll`·`rerollPrice`
- Produces
  - testid `tile-basic`: 손패 왼쪽 고정 자리. 판에 놓이면 비활성으로 보인다.
  - testid `block-<entityId>`: 보호 합과 이월. 예: "보호 10 · 4는 2턴 유지"
  - testid `shop-reroll`: "새로고침 (n)"
  - 서고 바닥과 손패 넘침 알림: 기존 알림 줄에 text.ts 문구를 보인다.

- [ ] **Step 1: 실패하는 e2e 작성**
  - combat-slice: '기본 동사 타일을 동사 칸에 놓고 낭독하면 다음 턴에 다시 쓸 수 있다'
  - run: '상점에서 새로고침을 누르면 화폐가 3 줄고 버튼 값이 4가 된다'. 화폐가 필요하면 기존 `?debugEnemyHp`로 빠르게 이겨 화폐를 얻는다.

- [ ] **Step 2: 실패 확인**: `npx playwright test tests/e2e/combat-slice.spec.ts tests/e2e/run.spec.ts`
  - Expected: FAIL. testid가 없다.

- [ ] **Step 3: 구현**
  - 기본 동사 타일은 `WordTile`을 재사용한다(def는 `getWord(state.build.basicVerb)`, instanceId는 `BASIC_VERB_INSTANCE`).
  - 선택과 드래그는 손패 카드와 같은 경로로 처리한다. `placement.ts`의 `canPlayAnywhere`는 enemyOnly인 strike를 막는다. 그래서 `instanceId === BASIC_VERB_INSTANCE`이면 동사 칸만 허용하도록 한다.

- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx oxlint && npx vitest run && npx playwright test`
  - Expected: 모두 PASS. 1440×900에서 스크롤이 없다(기존 viewport 검사).

- [ ] **Step 5: Commit**: `git commit -m "feat(pilot-was-spoken): 기본 동사·보호 이월·새로고침 최소 화면"`

### Task 9: 판정 지표와 튜닝

**Files:**
- Modify: `src/game/sim/combatBot.ts`, `src/game/sim/runSim.ts`, `src/game/sim/bots.ts`, `src/game/sim/metrics.ts`, `src/game/sim/targets.ts`, `src/game/sim/runTargets.ts`, `src/game/sim/balanceGate.test.ts`, `scripts/run-sim.ts`, `scripts/sim.ts`
- Modify(튜닝 손잡이만): `src/game/content/words.ts` 보호 값, `src/game/build/build.ts` handMax, `RALLY_RULES.emptyDrawHpLoss`, `SHOP_RULES.reroll`, 적 HP·피해
- Docs: `docs/lab/worklog/pilot-was-spoken.md`
- Test: `src/game/sim/balanceGate.test.ts`, `src/game/sim/runSim.test.ts`

**Interfaces:**
- Produces
  - `export function isAttackOnlyAction(state: RallyState, action: RallyAction): boolean`(bots.ts)
    - 동사 칸에 놓는 단어가 피해 동작(damage, mutualDamage)만 가진 동사일 때 true. 단어 id가 아니라 정의의 동작 종류로 판정한다(기본 동사 포함, counter 제외).
    - 동사가 아닌 단어(대상·형용사·부사·연결어), target, cast, endTurn은 true
    - 지원 동사, status 동사, recall은 false
  - `attackOnlyGame(game: SimGame<RallyState, SimCombatAction>): SimGame<...>`: legalActions를 `isAttackOnlyAction`으로 거른다.
  - `twoPlyBot(state, balance, allow?: (state, action) => boolean)`
  - `simulateRun(seed, shop, balance, maxFightTurns?, combat?: 'full' | 'attackOnly')`
  - 게이트 목표
    - `BALANCE_TARGETS.minAttackOnlyHpGap = 8`(거미, 이겼을 때 잃은 HP: attackOnly − greedy ≥ 8)
    - `RUN_TARGETS.attackOnlyGap = 0.2`(학습 봇 완주율 − attackOnly 완주율 ≥ 0.2)
  - 보고 지표(metrics, run-sim 출력): `emptyDrawHpLost`, `basicVerbRate`, `recalledCards`, 되받아친다 피해 비율(`counterDamage / 적에게 준 피해`), `rerolls`

- [ ] **Step 1: 실패하는 테스트 작성**
  - bots.test(없으면 생성)
    - 'isAttackOnlyAction: 막는다 배치는 false, 물어뜯는다·때린다 배치는 true, 되받아친다는 false, 형용사 배치는 true'
  - balanceGate.test
    - '때리기만 하는 봇은 이겼을 때 잃은 HP가 탐욕 봇보다 8 이상 많다'
  - runSim.test
    - 'simulateRun attackOnly는 지원 동사를 한 번도 낭독하지 않는다'(시드 2개). 그러려면 RunResult에 `supportCasts`를 추가한다.

- [ ] **Step 2: 실패 확인**: `npx vitest run src/game/sim`
  - Expected: FAIL. `isAttackOnlyAction`이 없다.

- [ ] **Step 3: 구현.** `scripts/run-sim.ts --gate`가 attackOnly 런을 돌리고 `attackOnlyGap`을 판정하도록 넣는다. 런 게이트 결과 표에 새 보고 지표를 더한다.

- [ ] **Step 4: 게이트 실행과 튜닝**
  - `npx vitest run src/game/sim/balanceGate.test.ts`, `npm run gate`(출력은 작업 공간 파일로 리다이렉트하고 끝부분을 읽는다)
  - Expected: 기존 게이트와 새 게이트가 모두 통과한다.
  - 실패하면 Global Constraints의 손잡이 값과 적 수치만 조정해 다시 돌린다. 조정할 때마다 ledger에 `Ruling:`으로 값과 이유를 적는다.
  - 다섯 번 조정해도 통과하지 않으면, 멈추고 결과 표를 보고한다. 이것은 spec이 허락한 "맞지 않으면 보고"다.

- [ ] **Step 5: 작업 로그**
  - `docs/lab/worklog/pilot-was-spoken.md`에 "v3 규칙 게이트" 절을 추가한다.
  - 내용: 최종 손잡이 값, 기존·새 게이트 표, 보고 지표, attackOnly와 학습 봇의 완주율

- [ ] **Step 6: 통과 확인**: `npx tsc -b && npx oxlint && npx vitest run && npx playwright test`
  - Expected: 모두 PASS

- [ ] **Step 7: Commit**: `git commit -m "feat(pilot-was-spoken): 때리기만 봇 판정 지표와 v3 튜닝"`
