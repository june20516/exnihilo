# 문장 던전 v2 기본 랠리 Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 공유 문장과 개입 루프를 걷어 낸다. 그 대신 "매 턴 내 문장 하나를 지어 낭독하고, 적은 예고한 문장을 실행한다"는 기본 랠리를 만들고, sim 게이트로 기본 규칙만으로 굴러가는지 검증한다.

**Architecture:**
- 새 전투 엔진은 `src/game/rally/`에 만든다. 기존 해석기(`resolveClause`), 보드 배치(`placeWord`), 조사, 렌더를 그대로 쓴다.
- 생략된 주어·목적어와 빈 동사는 owner `'blank'`인 빈칸 단어로 보드에 둔다. 낭독할 때 `materialize`가 빈칸을 실제 대상으로 채워 해석기에 넘긴다.
- 화면과 sim을 새 엔진으로 옮긴 뒤 v1 엔진을 지운다. v1은 git 태그로 보존한다.

**Tech Stack:** Vite 8, React 19, TypeScript 7(strict), Tailwind v4, Vitest, oxlint, Playwright, @dnd-kit/core, tsx

**Spec:** `docs/suberpowers/specs/2026-11-23-pilot-was-spoken-v2-base-rally-design.md`

## Global Constraints

- 작업 디렉터리는 `pilot-was-spoken/`다. 명령은 모두 그 안에서 실행한다.
- `any` 금지, `Math.random` 금지. `src/kit/**`는 `@/game`·`@/app`·React를 import하지 않는다. 엔진 디렉터리(`grammar`, `content`, `sentence`, `resolve`, `combat`, `rally`)는 React를 쓰지 않는다. `.oxlintrc.json`의 엔진 목록에 `src/game/rally/**`를 추가한다(Task 1).
- 규칙 값(spec §1·§4): 시작 손패 6, 턴당 5장, 손패 상한 8(넘치면 소각), 버리기 턴당 1회, 내 HP 60, 수식어 칸 슬롯당 2.
- 내 보호는 내 턴 시작에, 적 보호는 적 턴 시작에 0이 된다.
- 단어의 `cost`는 쓰지 않는다. `cost === null`(오염 단어)만 낼 수 없다.
- UI는 1440×900에서 스크롤 없이 한 화면이어야 한다.
- 커밋 메시지 끝에 다음 두 줄을 붙인다.
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01KrC1eSUtuuKFiCBTazNF3b`

## Review Focus

1. 문장에 놓은 단어가 있는 채로 내 카드가 손패·문장·더미 사이를 오갈 때(낭독, 턴 종료, 비우기, 버리기): 카드는 하나도 사라지거나 복제되지 않는다.
2. 지정한 적이 죽은 뒤에 동사만 놓고 낭독할 때: 목적어는 살아 있는 다음 적으로 바뀐다. 불발되거나 죽은 적을 때리지 않는다.
3. 적이 여럿일 때: 예고 문장은 적마다 그 적 하나만 행위자로 실행된다. 같은 종류의 적 전체가 한꺼번에 행동하지 않는다.
4. 계산식 줄의 결과 숫자는 미리보기·실제의 피해량(막힌 양 포함)과 언제나 같다.
5. 덱이 바닥난 상태에서 버리기를 할 때: 뽑을 카드가 없으면 버린 장수보다 적게 뽑을 수 있다. 오류 없이 진행된다.

---

### Task 1: v1 보존 태그, 빈칸 단어, 내 문장 모듈

**Files:**
- Modify: `src/game/content/words.ts`(빈칸 단어 3개, 적 전용 동사 3개 추가, `nibble` 피해 2→3, `crush` 피해 8→10)
- Modify: `src/game/sentence/board.ts:5-14`(`PlacedWord.owner`에 `'blank'` 추가)
- Modify: `src/kit/core/entity.ts`(`clearBlock` 추가)
- Modify: `.oxlintrc.json`(엔진 React 금지 목록에 `src/game/rally/**` 추가)
- Create: `src/game/rally/sentence.ts`
- Test: `src/game/rally/sentence.test.ts`, `src/kit/core/entity.test.ts`

**Interfaces:**
- Produces:
  - `clearBlock(entity: Entity): Entity`: `statuses.block = 0`, `freshBlock = 0`
  - 단어 id
    - 빈칸: `impliedSubject`(target, text '당신', ref player), `impliedObject`(target, text '대상', ref chosenEnemy), `blankVerb`(verbTransitive, text '___', `verb('support')`, 동작 없음)
    - 적 전용: `spiderBite`('물어뜯는다', melee damage 7), `spiderNip`('문다', melee damage 5), `curl`('웅크린다', verbIntransitive, support block 8 to subject)
    - 모두 `enemyOnly: true`
  - `rally/sentence.ts`
    - `blankSentence(maxModifiers: number): Board`: transitive 절 하나. head는 빈칸 단어 3개(owner `'blank'`)이고 원문(originalHead)도 같다. 수식어는 모두 null.
    - `hasVerb(board: Board): boolean`
    - `isDefensiveVerb(wordId: WordId): boolean`: 동작에 block이나 heal이 있으면 참
    - `materialize(board: Board, targetEnemyId: string | null): Board`
      - 빈 주어는 `you`로 채운다.
      - 빈 목적어는 동사의 `range`가 `support`이면 `you`, 아니면 `{ wordId: 'mark', targetEntityId: targetEnemyId }`로 채운다.
      - 채운 단어의 owner는 `'blank'`다.
    - `enemyBoard(spec: ClauseSpec, enemyId: string, maxModifiers: number): Board`: `buildBoard([spec])` 뒤 주어 head만 `{ wordId: 'mark', owner: 'enemy', targetEntityId: enemyId }`로 바꾼다. 주어 수식어는 유지한다.
    - `firstAliveEnemy(entities: readonly Entity[]): string | null`

- [ ] **Step 1: v1 보존 태그**

```bash
git tag pilot-sentence-v1 && git tag --list 'pilot-was-spoken-*'
```
Expected: `pilot-sentence-v1`

- [ ] **Step 2: 실패하는 테스트 작성** — `src/game/rally/sentence.test.ts`

```ts
const P = createEntity({ id: 'p', defId: 'player', name: '탐험가', side: 'ally', hp: 60 })
const E0 = createEntity({ id: 'e0', defId: 'spiderling', name: '새끼 거미 1', side: 'enemy', hp: 10 })
const E1 = createEntity({ id: 'e1', defId: 'spiderling', name: '새끼 거미 2', side: 'enemy', hp: 10 })
const V = { clause: 0, role: 'verb' } as const
const card = (wordId: string, id = wordId): PlacedWord => ({ wordId, owner: 'player', inkLeft: null, instanceId: id, targetEntityId: null })
const put = (board: Board, at: SlotAddress, word: PlacedWord) => { const r = placeWord(board, at, word); if (!r.ok) throw new Error(r.reason); return r.board }
const run = (board: Board, entities = [P, E0, E1]) => resolveClause(board, 0, entities, () => 'x', { executions: 0 })

test('빈 문장에는 동사가 없다', () => expect(hasVerb(blankSentence(2))).toBe(false))
test('동사 한 장만 놓으면: (당신이) (지정한 적을) 물어뜯는다', () => {
  const r = run(materialize(put(blankSentence(2), V, card('bite')), 'e1'))
  expect(r.events).toContainEqual({ type: 'damaged', entityId: 'e1', amount: 6, blocked: 0, sourceId: 'p' })
})
test('지원 동사의 빈 목적어는 당신이다', () => {
  const hurt = { ...P, hp: 50 }
  const r = run(materialize(put(blankSentence(2), V, card('mend')), 'e0'), [hurt, E0])
  expect(r.events).toContainEqual({ type: 'healed', entityId: 'p', amount: 6 })
})
test('적 예고 문장은 그 적 하나만 행위자로 실행된다', () => {
  const spec: ClauseSpec = { frameId: 'transitive', slots: [{ role: 'subject', head: 'spiderling' }, { role: 'object', head: 'you' }, { role: 'verb', head: 'nibble' }] }
  const damaged = run(enemyBoard(spec, 'e1', 2)).events.filter((e) => e.type === 'damaged')
  expect(damaged).toEqual([{ type: 'damaged', entityId: 'p', amount: 3, blocked: 0, sourceId: 'e1' }])
})
test('방어 계열 동사 판별', () => {
  expect(isDefensiveVerb('guard')).toBe(true)
  expect(isDefensiveVerb('mend')).toBe(true)
  expect(isDefensiveVerb('bite')).toBe(false)
})
test('firstAliveEnemy는 죽은 적을 건너뛴다', () => expect(firstAliveEnemy([P, { ...E0, hp: 0 }, E1])).toBe('e1'))
```

`src/kit/core/entity.test.ts`에 다음을 추가한다.

```ts
test('clearBlock은 보호와 이번 턴 보호를 0으로', () => {
  const e = addStatus(createEntity({ id: 'a', defId: 'a', name: 'a', side: 'ally', hp: 10 }), 'block', 5)
  expect(clearBlock(e)).toMatchObject({ statuses: { block: 0 }, freshBlock: 0 })
})
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/game/rally src/kit/core/entity.test.ts`
Expected: FAIL. `rally/sentence` 모듈과 `clearBlock`이 없다.

- [ ] **Step 4: 구현.** Files와 Interfaces대로 구현한다. `materialize`의 빈 목적어 판단은 `getWord(verb.head.wordId).effect.range`로 한다. 빈칸 판별은 `owner === 'blank'`로 한다.

- [ ] **Step 5: 통과와 회귀 확인**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 모두 통과. `owner` 유니온이 넓어져 생기는 타입 오류가 있으면 해당 switch와 비교만 고친다.

- [ ] **Step 6: Commit**

```bash
git add -A src .oxlintrc.json && git commit -m "feat(rally): 빈칸 단어와 내 문장 모듈 (생략된 주어·목적어)"
```

### Task 2: 라운드 엔진

**Files:**
- Create: `src/game/content/enemies.ts`, `src/game/rally/combat.ts`
- Modify: `src/game/combat/events.ts`(이벤트 `cast.by`를 `'player' | 'enemy'`로 유지; 추가 이벤트 `enemyTurn`, `discarded{count}`, `cleared`, `targetChanged{entityId}`; 추가 거부 사유 `noVerb`, `noDiscardLeft`)
- Test: `src/game/rally/combat.test.ts`

**Interfaces:**
- Consumes: Task 1의 `blankSentence`, `hasVerb`, `materialize`, `enemyBoard`, `isDefensiveVerb`, `firstAliveEnemy`, `clearBlock`
- Produces:
  - `content/enemies.ts`
    - `RallyEnemySpec { defId; name; hp; row; portrait; intents: readonly ClauseSpec[] }`
    - `RallyEncounterDef { id; name; enemies: readonly RallyEnemySpec[] }`
    - `RALLY_ENCOUNTERS: Record<string, RallyEncounterDef>`: 거미, 거미 떼, 슬라임. 값은 spec §3 그대로다.
      - 거미 HP 40: `spiderBite` → [독을 뿜는] `spiderNip` → `curl`
      - 새끼 거미 1·2·3 각 HP 10: `nibble`
      - 슬라임 HP 34: `swell` → `crush`
    - `RALLY_STARTER_DECK: readonly WordId[]`: spec §4 15장
  - `rally/combat.ts`
    - `CardInst { instanceId; wordId }`
    - `RallyLog { casts; defensiveCasts; deadTurns; bestBurst }`
    - `RallyState { encounterId; turn; phase: 'player'|'won'|'lost'; entities; board; deck: DeckState<CardInst>; targetId: string|null; discardsLeft; executions; rng; nextId; log: RallyLog }`
    - `RallyAction`: 아래 여섯 가지
      - `{type:'place'; instanceId; at; modifierIndex?; targetEntityId?}`
      - `{type:'target'; entityId}`
      - `{type:'discard'; instanceIds: readonly string[]}`
      - `{type:'clear'}`
      - `{type:'cast'}`
      - `{type:'endTurn'}`
    - `RALLY_RULES = { startHand: 6, drawPerTurn: 5, handMax: 8, discardsPerTurn: 1 } as const`
    - `startRally(encounterId: string, deck: readonly WordId[], seed: number, balance: Balance): Reduced<RallyState, CombatEvent>`
    - `reduceRally(state: RallyState, action: RallyAction, balance: Balance): Reduced<RallyState, CombatEvent>`
    - `enemyIntent(state: RallyState, enemyIndex: number): ClauseSpec`: `intents[(turn - 1) % intents.length]`
    - `PLAYER_ID = 'p'`. 적 id는 `e0`부터다.

**라운드 흐름**(spec §1, 이 순서를 지킨다)
- **cast**
  1. 동사가 없으면 `noVerb`로 거부한다.
  2. `cast{by:'player'}` 이벤트를 낸다.
  3. `materialize(board, targetId)`를 실행한다.
  4. 기록을 갱신한다: `casts`, `defensiveCasts`, `bestBurst`(이번 실행에서 적이 받은 `damaged`·`hpLost` 합).
  5. `revertAll`로 문장을 비운다. 밀려난 내 카드는 버림 더미로 간다.
  6. 승패를 판정한다. 끝났으면 적 턴 없이 종료한다.
  7. 적 턴으로 간다.
- **endTurn**: `revertAll`로 밀려난 내 카드를 손패로 돌려보낸 뒤 적 턴으로 간다.
- **적 턴**
  1. `enemyTurn` 이벤트를 낸다.
  2. 살아 있는 적 모두에게 `clearBlock`을 적용한다.
  3. 살아 있는 적마다 순서대로 `enemyBoard(enemyIntent)`를 실행하고, 매번 승패를 판정한다.
  4. 살아 있는 모든 개체에 `tickEndOfTurn`을 적용한다(`poisonTick`, `died` 이벤트). 그리고 승패를 판정한다.
  5. 다음 턴을 시작한다.
     - `turn + 1`, 플레이어 `clearBlock`, `discardsLeft = 1`
     - 5장을 뽑는다(상한 8, 넘치면 `burned`).
     - 손패에 동사가 없으면 `deadTurns + 1`
     - `targetId`가 죽은 적이면 `firstAliveEnemy`로 바꾼다.
- **place**
  - `targetEntityId`가 없으면 `state.targetId`를 쓴다.
  - 거부 사유는 기존과 같다: `kindMismatch`, `modifiersFull`, `slotInactive`, `unplayable`, `noTarget`.
- **discard**
  - 목록이 비었거나 손패에 없는 id가 있으면 `unplayable`로 거부한다.
  - `discardsLeft === 0`이면 `noDiscardLeft`로 거부한다.
  - 고른 카드를 버림 더미로 옮기고 같은 장수만큼 뽑는다. 덱이 비면 덜 뽑는다.
  - `discarded` 이벤트를 낸다.
- **clear**: `revertAll`로 밀려난 내 카드를 손패 끝으로 돌려보내고 `cleared` 이벤트를 낸다.
- **target**: 살아 있는 적이 아니면 `noTarget`으로 거부한다. 맞으면 `targetChanged` 이벤트를 낸다.
- **phase가 player가 아니면** 모든 행동을 `notPlayerTurn`으로 거부한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `src/game/rally/combat.test.ts`

엔진 테스트는 실제 콘텐츠 대신 테스트 전용 조우를 쓴다(v1 교훈: 콘텐츠를 튜닝하면 엔진 테스트가 깨졌다).
- `test-dummy`: 거미(HP 30), 예고 `[spider/you/spiderBite]`
- `test-curl`: 예고 `[curl, spiderBite]`
- `test-pair`: 새끼 거미 2마리(HP 10), 예고 `[spiderling/you/nibble]`

헬퍼 `withHand(state, words)`는 v1 테스트와 같은 모양이다. 손패 id는 `h0`부터이고, 뽑을 더미와 버림 더미는 비운다.

```ts
test('시작: 손패 6, 1턴, 버리기 1, 대상은 첫 적, 동사 없음', ...)            // hand 6, turn 1, discardsLeft 1, targetId 'e0', hasVerb false
test('동사 없이 낭독하면 거부되고 상태는 그대로', ...)                         // events[0] reason 'noVerb', state 동일 참조
test('동사 한 장 낭독 → 적 피해 6, 적 반격 7, 2턴, 카드는 버림 더미, 문장은 빈칸', ...) // e0 24, p 53, turn 2, discardPile에 h0
test('막는다 낭독 → 반격 7 중 6을 막고, 다음 내 턴 시작에 보호 0', ...)        // p 59, p.block 0
test('낭독 없이 턴 종료 → 놓았던 카드는 손패로 돌아온다', ...)
test('손패는 이월되고 5장을 뽑되 8장을 넘으면 소각', ...)                      // 손패 7 + 뽑을 더미 5장 준비 → 턴 종료 후 8장, burned 이벤트 4개
test('버리기: 같은 장수를 뽑고, 두 번째는 noDiscardLeft', ...)
test('버리기: 덱이 비어 있으면 덜 뽑고 오류 없음', ...)
test('대상 변경: 동사만 놓은 낭독이 바꾼 적을 때린다', ...)                    // test-pair, target e1 → damaged e1
test('지정한 적이 죽으면 다음 턴 대상은 살아 있는 적', ...)
test('적이 여럿이면 각자 따로 행동한다', ...)                                  // test-pair endTurn → damaged p 두 번, sourceId e0·e1
test('적 보호는 적 턴 시작에 사라진다', ...)                                   // test-curl: 1턴 끝 e0.block 8, 2턴 끝 0
test('적을 쓰러뜨리면 적 턴 없이 승리', ...)                                   // phase won, enemyTurn 이벤트 없음
test('내 HP가 0이 되면 패배', ...)
test('기록: 낭독 수, 방어 낭독 수, 최대 한 방, 동사 없는 턴', ...)
test('카드 보존: 무작위 행동 200회 동안 카드 instanceId 집합이 변하지 않는다', ...) // 손패+더미+문장 위 내 카드
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/rally/combat.test.ts`
Expected: FAIL. `rally/combat` 모듈이 없다.

- [ ] **Step 3: 위의 흐름대로 `content/enemies.ts`, `rally/combat.ts`, `combat/events.ts`를 구현한다.** 드로우는 v1 `drawCards`와 같은 규칙이다(빈 더미면 버림 더미를 섞는다, 상한을 넘으면 소각). 이 함수는 `rally/combat.ts` 안에 새로 쓴다.

- [ ] **Step 4: 통과 확인**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 모두 통과

- [ ] **Step 5: Commit**

```bash
git add -A src && git commit -m "feat(rally): 기본 랠리 라운드 엔진과 v2 조우"
```

### Task 3: 미리보기와 계산식

**Files:**
- Create: `src/game/rally/lines.ts`(v1 `combat/preview.ts`의 `PreviewLine`·`describeEvent`·`linesFromEvents`를 옮긴다. v1 preview는 이것을 import한다)
- Create: `src/game/rally/preview.ts`, `src/game/rally/formula.ts`
- Modify: `src/game/resolve/resolve.ts`(`collectSlotMods`, `collectAdverbs`, `SlotMods`, `AdverbSummary`를 export)
- Test: `src/game/rally/preview.test.ts`

**Interfaces:**
- Consumes: Task 2의 `reduceRally`, `RallyState`, `hasVerb`; Task 1의 `materialize`
- Produces:
  - `previewRound(state: RallyState): { mine: PreviewLine[]; enemy: PreviewLine[] }`
    - 동사가 있으면 `cast`, 없으면 `endTurn`을 상태 사본에 돌린다.
    - 이벤트를 `enemyTurn`에서 둘로 나눈다. `mine`은 `cast` 뒤부터 `enemyTurn` 전까지다. `enemy`는 `enemyTurn` 뒤부터 첫 `drawn`·`combatEnded` 전까지다.
  - `sentenceFormula(state: RallyState): { text: string; value: number } | null`
    - 동사가 없으면 null이다.
    - 동사의 첫 동작만 다룬다.
      - `damage`: 해석기와 같은 순서로 식을 만든다. 형식은 `((기본 × 세기 + 힘 s) × 0.75 + 주어가산) × 주어배율 × 1.5 × 목적어배율 − 목적어감산 = 값`이다.
      - `block`·`heal`·`grow`·`loseHp`: `기본 × 세기 = 값`
      - 그 외: null
    - 1이나 0인 항은 생략한다. 생략한 결과 바깥 괄호만 남으면 그 괄호도 생략한다.
    - 반복이 2 이상이면 끝에 ` (×N회)`를 붙인다. 값은 1회분이다.
    - 값은 `scaleOutgoing`·`scaleIncoming`과 해석기와 같은 `Math.floor` 위치로 계산한다.
    - 행위자는 materialize한 주어의 첫 개체, 대상은 목적어의 첫 개체다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('미리보기: 내 낭독과 적의 차례가 나뉜다', ...)          // test-dummy에 bite → mine '탐험가 → 거미: 피해 6', enemy '거미 → 탐험가: 피해 7'
test('미리보기: 막으면 적의 차례 피해가 줄어 보인다', ...)    // guard → enemy '거미 → 탐험가: 피해 1 (막음 6)'
test('미리보기: 동사가 없으면 mine은 비고 적의 차례만', ...)
test('계산식: 동사만 → "6 = 6"', ...)
test('계산식: [격렬하게] → "6 × 1.5 = 9"', ...)
test('계산식: [굶주린] 주어 + [금이 간] 목적어 + [격렬하게] → "(6 × 1.5 + 4) × 1.5 = 19"', ...)
test('계산식: 막는다 [격렬하게] → "6 × 1.5 = 9"', ...)
test('계산식의 값은 실제 첫 피해(막힌 양 포함)와 같다: sim 무작위 상태 전수', ...)
// 각 조우 × 시드 1~6 × 무작위 40수. 동작이 damage인 상태마다
// value === (previewRound.mine의 첫 damaged 이벤트의 amount + blocked)
```

속성 테스트에는 이벤트 수준 비교가 필요하다. 그래서 `previewRound`와 같은 분할 로직을 쓰는 `previewEvents(state): { mine: CombatEvent[]; enemy: CombatEvent[] }`를 함께 export한다. `previewRound`는 이것을 문장으로 바꿀 뿐이다.

무작위 상태는 Task 4의 sim 어댑터 없이 만든다. 손패의 첫 카드를 첫 합법 위치에 놓는 식으로 이 테스트 파일 안에서 생성한다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/rally/preview.test.ts`
Expected: FAIL. `rally/preview`·`rally/formula` 모듈이 없다.

- [ ] **Step 3: 구현**

- [ ] **Step 4: 통과 확인**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 모두 통과. v1 preview 테스트도 통과한다(`lines.ts`로 옮겨도 동작은 같다).

- [ ] **Step 5: Commit**

```bash
git add -A src && git commit -m "feat(rally): 라운드 미리보기와 계산식 줄"
```

### Task 4: sim 전환과 기본 규칙 게이트

**Files:**
- Modify: `src/game/sim/combatGame.ts`, `bots.ts`, `metrics.ts`, `targets.ts`, `balanceGate.test.ts`, `sim.test.ts`, `scripts/sim.ts`
- Delete: `src/game/combat/preview.test.ts`(v1 sim 어댑터에 의존한다. v1 엔진은 Task 6에서 지운다)
- Tune(필요할 때만): `src/game/content/enemies.ts`

**Interfaces:**
- Consumes: Task 2의 `startRally`, `reduceRally`, `RallyState`, `RallyAction`, `RALLY_STARTER_DECK`; Task 3의 `previewRound`
- Produces:
  - `combatGame(encounterId: string, balance: Balance, deck?: readonly WordId[]): SimGame<RallyState, SimCombatAction>`
    - 합법 행동은 다음과 같다.
      - 배치: 같은 단어는 한 장만, 수락되는 모든 위치
      - 대상 변경: 현재 대상이 아닌 살아 있는 적마다
      - 한 장 버리기: 같은 단어는 한 장만, `discardsLeft > 0`일 때
      - 낭독: 동사가 있을 때
      - 턴 종료
    - `SimCombatAction { action: RallyAction; key: string }`
    - `END_TURN`, `isFinisher`(cast·endTurn)
  - `scoreState(state: RallyState)`: v1과 같은 점수식이다.
  - `greedyBot`, `randomBot`, `passiveBot`: v1과 같은 정책이다.
  - `combatMetrics(state)`
    - `hpLost`, `turns`
    - `deadTurnRate = deadTurns / turn`
    - `defendRate = casts === 0 ? 0 : defensiveCasts / casts`
    - `bestBurst`
  - `combatTurnMetrics(game)`
    - `choiceDiversity`: 서로 다른 `previewRound` 결과 수
    - `obviousBest`
  - `BALANCE_TARGETS`: spec §7 값
    - `winRate [0.8, 0.95]`, `hpLostOnWin [10, 30]`, `avgTurns [4, 7]`
    - `deadTurnRate ≤ 0.05`, `defendRate [0.2, 0.6]`
    - 무행동 0, 무작위 ≤ 탐욕 − 0.2

- [ ] **Step 1: 실패하는 테스트 작성.** `sim.test.ts`를 새 어댑터 기준으로 다시 쓴다.
  - 합법 행동에 항상 턴 종료가 있고, 거부될 행동은 없다.
  - 동사가 없으면 낭독이 없다.
  - 버리기를 쓴 뒤에는 버리기 행동이 없다.
  - `combatMetrics`의 비율 계산(0으로 나누기 포함)

  `balanceGate.test.ts`는 거미, 시드 60, 위 목표 7개를 각각 단언한다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/sim`
Expected: FAIL. 어댑터가 아직 v1 상태를 받는다.

- [ ] **Step 3: 구현.** `scripts/sim.ts`는 조우마다 한 줄을 출력한다. 열은 승률, HP 손실(승), 평균 턴, 시간 초과, 동사 없는 턴, 방어율, 최대 한 방, 선택지 수, 뻔한 최선, 무작위, 무행동이다. 인자는 `[encounterId|all] [runs]`다.

- [ ] **Step 4: 측정과 튜닝**

Run: `npm run sim -- all 60`
그다음 `npx vitest run src/game/sim/balanceGate.test.ts`를 실행한다.
Expected: 게이트 통과

게이트가 통과하지 않으면 아래 손잡이만 조정한다. 바꾼 값마다 ledger에 `Ruling:`을 기록한다.
1. 거미 HP(30~60)
2. 예고 수치(`spiderBite`, `spiderNip`, `curl`)
3. 시작 덱 구성(동사는 9장 이상 유지)

규칙 값(Global Constraints)은 바꾸지 않는다. 손잡이 세 개로도 맞지 않으면 멈추고, 측정표를 붙여 보고한다.

- [ ] **Step 5: 회귀 확인**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 모두 통과

- [ ] **Step 6: Commit**

```bash
git add -A src scripts && git commit -m "feat(sim): 기본 랠리 sim 전환과 기본 규칙 게이트"
```

### Task 5: 화면 전환

**Files:**
- Modify
  - `src/app/App.tsx`, `src/app/useCombatStore.ts`
  - `src/game/ui/CombatScreen.tsx`, `SidePanel.tsx`, `ControlPanel.tsx`, `Hand.tsx`, `TopBar.tsx`, `Battlefield.tsx`, `EntityCard.tsx`, `SlotView.tsx`, `SentenceBoard.tsx`, `deck.ts`, `DeckEditor.tsx`
  - `src/game/fx/registry.ts`
- Modify: `tests/e2e/combat-slice.spec.ts`(새 흐름으로 다시 쓴다)

**Interfaces:**
- Consumes: Task 2의 `startRally`, `reduceRally`, `RallyState`, `RallyAction`, `enemyIntent`, `RALLY_ENCOUNTERS`, `RALLY_STARTER_DECK`; Task 3의 `previewRound`, `sentenceFormula`; Task 1의 `enemyBoard`, `materialize`
- Produces(e2e가 의존하는 testid)
  - 기존 것: `end-turn`, `cast`, `slot-0-{role}`, `particle-0-{role}`, `tile-{wordId}`, `hp-{entityId}`, `open-deck`, `deck-count`, `minus-{wordId}`, `deck-save`, `encounter`, `hand`, `sentence`
  - 새로 추가: `formula`, `preview-mine`, `preview-enemy`, `intent-{entityId}`, `discard`(버리기 모드 전환), `discard-confirm`, `clear`

화면 결정(spec §9)
- **상단 바**: 프리셋 버튼을 없앤다. 부제는 "기본 랠리"다. 조우 선택지는 `RALLY_ENCOUNTERS`에서 가져온다. URL `?preset=`은 무시한다.
- **전장**
  - 적 카드마다 예고 문장을 띄운다(`intent-{id}`). 내용은 `renderClause(enemyBoard(enemyIntent), …)`이다.
  - 적 카드를 클릭하면 대상 변경을 보낸다. 지정한 적은 테두리로 강조한다.
- **내 문장**: 빈칸 단어(owner `'blank'`)는 흐리게 그린다.
  - 빈 주어는 '당신'으로 보인다.
  - 빈 목적어는 동사에 따라 지정한 적의 이름이나 '당신'으로 보인다(`materialize` 결과의 이름).
  - 빈 동사는 '___'로 보인다.
  - 문장 아래에 `formula`를 둔다. 동사가 없으면 "동사를 놓으면 계산식이 보입니다"를 보여 준다.
- **곁 패널**: 두 목록을 둔다. `preview-mine`의 제목은 "낭독하면", `preview-enemy`의 제목은 "이어서 적의 차례"다.
- **아래쪽**
  - 왼쪽은 덱·버림 장수, 턴, 버리기 버튼이다. 버리기 버튼은 남은 횟수를 표시한다.
  - 버리기 모드에서는 손패를 클릭해 표시하고, `discard-confirm`("N장 버리기")으로 확정한다.
  - 오른쪽에는 낭독(동사가 없으면 비활성), 턴 종료, 문장 비우기 버튼을 둔다.
- **거부 메시지**: `noVerb`는 "동사가 있어야 낭독할 수 있습니다.", `noDiscardLeft`는 "이번 턴에는 더 버릴 수 없습니다."다.
- **연출**: `enemyTurn`에서 적 초상을 잠깐 흔든다. `discarded`·`cleared`·`targetChanged`는 연출하지 않는다.

- [ ] **Step 1: e2e 다시 작성** — `tests/e2e/combat-slice.spec.ts`

```ts
test('1440×900에서 스크롤 없이 한 화면, 예고·미리보기가 보인다', ...)
test('동사 한 장을 끌어다 놓고 낭독하면 적 HP가 줄고 2턴이 된다', ...)   // dragBySteps(tile-bite → slot-0-verb), cast, hp-e0 변화
test('빈 주어는 당신으로 보이고, 동사를 놓으면 계산식이 나온다', ...)
test('버리기: 카드 두 장을 표시하고 확정하면 손패 수는 같고 버리기는 비활성', ...)
test('대상 변경(거미 떼): 적을 누르면 목적어가 그 적 이름이 된다', ...)
test('연출 재생 중에는 턴 종료가 잠긴다', ...)
test('덱 편집: 카드를 빼고 저장하면 덱 장수가 바뀐다', ...)
```

시드는 `?seed=123`을 쓴다. 손패에 특정 단어가 필요한 테스트는 필요한 단어가 시작 손패에 있는 시드를 찾아 고정하고, 그 이유를 주석으로 남긴다.

- [ ] **Step 2: 실패 확인**

Run: `npm run e2e`
Expected: FAIL. 새 testid가 없다.

- [ ] **Step 3: 구현**

- [ ] **Step 4: 통과와 회귀 확인**

Run: `npm test && npx tsc -b && npm run lint && npm run build && npm run e2e`
Expected: 모두 통과

- [ ] **Step 5: 화면 확인.** Playwright MCP로 1440×900 스크린샷을 찍어 `stitch/rally-v1.png`로 저장한다. 스크롤이 없는지, 예고 문장이 적 위에 보이는지 눈으로 확인한다.

- [ ] **Step 6: Commit**

```bash
git add -A src tests stitch && git commit -m "feat(ui): 기본 랠리 화면 (예고 문장, 계산식, 버리기)"
```

### Task 6: v1 엔진 제거와 기록

**Files:**
- Delete
  - `src/game/combat/combat.ts`, `combat.test.ts`, `preview.ts`
  - `src/game/content/rules.ts`, `src/game/content/encounters.ts`
- Modify
  - `src/game/sentence/board.ts`(`enemyAttach`, `enemyReplace`, `sealSlot`, `swapNounPhrases`, `dryInk`, `DriedWord`와 그 테스트 제거. `revertSlot`·`revertAll`은 문장 비우기에 쓰므로 남긴다)
  - `src/game/combat/events.ts`
    - 쓰이지 않는 이벤트 제거: `apSpent`, `intervention`, `swapped`, `resourceGained`, `dried`, `polluted`, `intentRevealed`
    - 쓰이지 않는 거부 사유 제거: `notEnoughAp`, `noSwapLeft`, `slotSealed`, `noPaidDraw`, `cannotCast`
  - `src/game/ui/describe.ts`(`describeIntent` 제거), `src/game/content/balance.ts`(`sealExtraCost` 제거), `src/game/fx/registry.ts`(제거된 이벤트의 핸들러 제거)
- Move: `SlotAddress`, `ClauseSpec` 타입을 `content/encounters.ts`에서 `content/enemies.ts`로 옮기고 import를 고친다.
- Modify: `docs/lab/worklog/pilot-was-spoken.md`(v2 기본 랠리 sim 결과표와 게이트 결과 추가)

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 없음(정리)

- [ ] **Step 1: 지우기 전 확인**

Run: `grep -rn "combat/combat'\|combat/preview'\|content/rules'\|content/encounters'" src scripts tests`
Expected: 남은 참조가 v1 파일 자신과 타입 import뿐이다.

- [ ] **Step 2: 제거와 import 정리**

- [ ] **Step 3: 전체 검증**

Run: `npm test && npx tsc -b && npm run lint && npm run build && npm run e2e && npm run sim -- all 60`
Expected: 모두 통과하고, sim 표가 출력된다.

- [ ] **Step 4: 작업 로그에 결과표와 해석을 기록**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: v1 엔진(공유 문장·개입 루프·프리셋) 제거, 태그 pilot-sentence-v1로 보존"
```
