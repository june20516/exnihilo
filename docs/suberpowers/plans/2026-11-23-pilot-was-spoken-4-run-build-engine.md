# 문장 던전 v2 런·빌드 엔진과 sim 게이트 (단계 A) Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 기본 랠리 위에 빌드 상태(구조·강화·유물), 연결어(둘째 절), 런(7층·화폐·상점·회복), 정예·보스(봉인)를 엔진으로 만든다. 학습·유형·무작위·안 삼 상점 봇으로 sim 게이트를 측정한다.

**Architecture:**
- `rally/`는 `BuildState`와 런이 넘기는 전투 옵션을 받는다. 옵션이 비어 있으면 기본 랠리와 완전히 같게 동작한다.
- 해석기는 `ResolveContext`로 단어 조회 함수와 절별 훅을 받는다. 강화는 조회 함수로, 유물·연결어·층 배율은 훅으로만 해석에 끼어든다.
- 새 `run/` 모듈이 층 진행, 화폐, 상점, 회복을 맡는다.
- 게이트는 시간이 오래 걸린다. 그래서 vitest가 아니라 종료 코드를 내는 스크립트(`npm run gate`)로 둔다. vitest에는 빠른 스모크만 둔다.

**Tech Stack:** TypeScript 7(strict), Vitest, tsx(스크립트), oxlint

**Spec:** `docs/suberpowers/specs/2026-11-23-pilot-was-spoken-v2-run-build-design.md`(이 plan은 단계 A: §1~§7). 기본 규칙은 `docs/suberpowers/specs/2026-11-23-pilot-was-spoken-v2-base-rally-design.md`를 따른다.

## Global Constraints

- 명령은 모두 `pilot-was-spoken/` 안에서 실행한다.
- `any` 금지, `Math.random` 금지. `src/kit/**`는 game·app·React를 import하지 않는다. `src/game/run/**`도 엔진 목록(React 금지)에 추가한다(Task 5).
- 빈 빌드 상태(`EMPTY_BUILD`)와 기본 옵션이면 `rally/`의 모든 기존 테스트와 기본 랠리 게이트(`balanceGate.test.ts`)가 수정 없이 통과해야 한다.
- 엔진 테스트는 실제 콘텐츠가 아니라 `rally/testFixtures.ts`의 테스트 전용 단어·조우에 기댄다. 콘텐츠 수치를 튜닝해도 엔진 테스트가 깨지지 않아야 한다.
- spec 값
  - 층: 일반, 일반, 정예, 일반, 일반, 정예, 보스. 4·5층은 적 HP ×1.3, 적 피해 ×1.2(반올림)
  - 승리 시 최대 HP 20% 회복. 화폐: 일반 10, 정예 20
  - 상점: 종류가 다른 보상 3개. 기본값 단어 6, 강화 8, 구조 12, 유물 15, 희귀도 −3·0·+3. 구매마다 남은 값 ×1.5(올림)
  - 칸은 슬롯당 최대 4. 강화는 최대 2단계
  - 단어 보상 희귀도 가중치: 보통 60, 비범 30, 희귀 10
- UI(`src/game/ui`, `src/app`)는 단계 B 범위다. 이 plan에서는 컴파일과 기존 e2e가 깨지지 않을 만큼만 고친다.
- 커밋 메시지 끝에 다음 두 줄을 붙인다.
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01KrC1eSUtuuKFiCBTazNF3b`

## Review Focus

1. 강화나 유물이 있는 상태에서 계산식 값이 실제 첫 피해와 어긋나는 경우: 속성 테스트에 무작위 빌드를 섞어 고정한다(Task 3).
2. 연결어를 놓았다 빼거나, 둘째 절에 카드가 있는 채로 비우기·턴 종료·낭독할 때: 카드가 사라지거나 복제되지 않는다(Task 3 카드 보존 속성 테스트).
3. 봉인된 슬롯이 있는 턴에 배치하거나 비우기를 할 때: 봉인 슬롯에는 놓을 수 없다. 생략 기본값은 작동한다. 봉인은 다음 적 턴 시작에 풀린다.
4. 상점에서 화폐가 모자라거나 이미 산 보상을 다시 사려 할 때: 거부되고 상태가 바뀌지 않는다.
5. 런 도중 덱이 12장 미만이 되거나 20장을 넘을 때: 상점 구매는 덱 장수 제한(12~20)을 적용하지 않는다(덱 편집기 전용 규칙). 덱이 커져도 오류 없이 진행된다.

---

### Task 1: 빌드 상태, 강화, 해석 컨텍스트의 단어 조회

**Files:**
- Create: `src/game/build/build.ts`(빌드 상태와 `effectiveWord`)
- Modify
  - `src/game/resolve/resolve.ts`: `ResolveContext`에 `lookup`, `hooks` 추가. 모든 `getWord`를 `context.lookup`으로 교체한다. `resolveTargets`, `collectSlotMods`, `collectAdverbs`는 조회 함수를 인자로 받는다.
  - `src/game/rally/combat.ts`, `src/game/rally/sentence.ts`, `src/game/rally/formula.ts`, `src/game/rally/preview.ts`: 빌드 상태를 받는다.
- Test: `src/game/build/build.test.ts`, `src/game/rally/combat.test.ts`(빌드 관련 추가)

**Interfaces:**
- Produces
  - `build/build.ts`
    - `StructureId = 'subjectSlot' | 'objectSlot' | 'verbSlot' | 'handSize' | 'discard'`
    - `RelicId = 'longSentence' | 'adjectiveChain' | 'stress' | 'ellipsis' | 'scarecrowSpeaker' | 'poisonGrammar' | 'resonance' | 'echo'`
    - `BuildState { readonly slots: Readonly<Record<SlotRole, number>>; readonly handMax: number; readonly discardsPerTurn: number; readonly upgrades: Readonly<Record<WordId, 1 | 2>>; readonly relics: readonly RelicId[] }`
    - `EMPTY_BUILD: BuildState`: 칸 2/2/2, 손패 8, 버리기 1, 강화·유물 없음
    - `MAX_SLOTS = 4`
    - `applyStructure(build, id): BuildState`: 칸은 4에서 멈춘다.
    - `effectiveWord(wordId: WordId, build: BuildState): WordDef`: 강화 단계를 반영한 정의를 돌려준다.
      - 동사: 모든 수치 동작의 amount에 ×1.5^단계(각 단계 반올림)
      - `powerMul`·`outgoingDamageMul`·`incomingMul`: 1.5 → 2 → 2.5. 일반식은 `value + 0.5×단계`. 1보다 작은 값(예: 눈먼 0.5)은 강화하지 않는다.
      - `outgoingFlat` +3/단계, `onHitPoison` +1/단계
      - 그 외 수식은 그대로 둔다.
      - 강화하지 않은 단어는 원래 정의 객체를 그대로 돌려준다.
    - `wordLookup(build): (id: WordId) => WordDef`
  - `resolve/resolve.ts`
    - `ResolveContext { executions: number; lookup?: (id: WordId) => WordDef; hooks?: ClauseHooks }`. 둘 다 없으면 지금과 같다.
    - `ClauseHooks`: 모두 선택 필드, 기본값은 0 또는 false. 사용처는 Task 2·3·4다.
      - `damageBonus`: 피해 동작 amount 가산
      - `supportBonus`: 보호·회복 amount 가산
      - `chainBoost`: 수식의 사슬
      - `adverbTwice`: 강세
      - `poisonBonus`: 독 가산
      - `repeatBonus`: 반복 가산
      - `damageScale`: 피해 amount 배율, 기본 1
  - `rally/combat.ts`
    - `RallyOptions { build?: BuildState; playerHp?: number; playerMaxHp?: number; enemyScale?: { hp: number; damage: number } }`
    - `startRally(encounterId, deck, seed, balance, options?: RallyOptions)`
    - `RallyState`에 `build: BuildState`, `enemyScale` 필드를 추가한다.
    - 손패 상한과 버리기 횟수는 `state.build`에서 읽는다. 내 문장의 칸 수는 `build.slots`에서 읽는다.
  - `rally/sentence.ts`: `blankSentence(slots: Readonly<Record<SlotRole, number>>): Board`. 기존 `blankSentence(n)` 호출부는 `{subject:n, object:n, verb:n}`로 바꾼다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// build.test.ts
test('EMPTY_BUILD는 기본 랠리 값', () => expect(EMPTY_BUILD).toEqual({ slots: { subject: 2, object: 2, verb: 2 }, handMax: 8, discardsPerTurn: 1, upgrades: {}, relics: [] }))
test('칸은 4에서 멈춘다', () => { let b = EMPTY_BUILD; for (let i = 0; i < 5; i++) b = applyStructure(b, 'verbSlot'); expect(b.slots.verb).toBe(4) })
test('강화: 물어뜯는다 6 → 9 → 14', ...)            // effectiveWord('bite', {..., upgrades:{bite:1}}) damage 9; 2단계 14 (round(9×1.5)=14)
test('강화: 격렬하게 ×1.5 → ×2 → ×2.5, 굶주린 +4 → +7 → +10, 독을 뿜는 2 → 3 → 4', ...)
test('강화: 눈먼 ×0.5는 강화되지 않는다', ...)
test('강화하지 않은 단어는 원래 정의 객체', () => expect(effectiveWord('bite', EMPTY_BUILD)).toBe(getWord('bite')))
// rally/combat.test.ts에 추가
test('빌드: 동사 칸 +1이면 동사 수식어 칸이 3개', ...)
test('빌드: 손패 상한 9, 버리기 2회', ...)
test('빌드: 강화한 물어뜯는다로 낭독하면 피해 9', ...)  // test-dummy, upgrades {bite:1}
test('옵션: playerHp 30/60으로 시작', ...)
test('옵션: enemyScale hp 1.3 → 적 HP 39(30×1.3), damage 1.2 → testBite 7이 8로', ...)
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/build src/game/rally`
Expected: FAIL. `build` 모듈과 옵션이 없다.

- [ ] **Step 3: 구현.** 적 HP 배율은 `Math.round(hp × scale.hp)`로 계산한다. 적 피해 배율은 적 절을 실행할 때 훅 `damageScale`로 넘긴다. 해석기는 `Math.round(amount × damageScale)`를 피해 기본값으로 쓴다.

- [ ] **Step 4: 통과와 회귀 확인**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 모두 통과. 기본 랠리 게이트도 그대로 통과한다.

- [ ] **Step 5: Commit**: `feat(build): 빌드 상태와 강화, 해석 컨텍스트의 단어 조회·훅`

### Task 2: 유물 8종

**Files:**
- Create: `src/game/build/relics.ts`(유물 정의: id, 이름, 희귀도, 설명)
- Modify: `src/game/resolve/resolve.ts`(훅 적용), `src/game/rally/combat.ts`, `src/game/rally/sentence.ts`, `src/game/rally/formula.ts`
- Test: `src/game/build/relics.test.ts`

**Interfaces:**
- Consumes: Task 1의 `BuildState`, `ClauseHooks`
- Produces
  - `RELICS: Record<RelicId, { id; name; rarity: 'common' | 'rare'; text: string }>`: 이름과 희귀도는 spec §4.4 그대로
  - `clauseHooks(state: RallyState, clause: number): ClauseHooks`(`rally/combat.ts`): 낭독 시점의 보드와 빌드에서 훅을 계산한다. 미리보기와 계산식도 같은 함수를 쓴다.

유물별 구현 위치
| 유물 | 위치 | 규칙 |
|---|---|---|
| 긴 문장 | 훅 `damageBonus`·`supportBonus` | 보드 위 내 단어 수(모든 절) × 2 |
| 생략의 미학 | 훅 `damageBonus` | 그 절의 주어가 빈칸이면 +4 |
| 수식의 사슬 | 훅 `chainBoost` | 해석기에서 형용사 2개 이상인 슬롯의 `outgoingMul`(주어)·`incomingMul`(목적어)에 ×2 |
| 강세 | 훅 `adverbTwice` | 해석기에서 `power`를 제곱 |
| 독의 문법 | 훅 `poisonBonus` | 독을 거는 모든 효과(`onHitPoison`, status poison)에 +2 |
| 메아리 | 훅 `repeatBonus` | 연결어가 없는 낭독이면 절 1의 반복 +1 |
| 허수아비 화자 | `materialize` | 빈 주어를 `you` 대신 `scarecrow`로 채운다 |
| 울림 | `rally/combat.ts` cast | 이번 턴 처음 낭독한 동사 카드는 버림 더미 대신 손패로 돌아온다. `RallyState.resonanceUsed`는 턴 시작에 false |

- 훅은 내 문장에만 적용한다. 적 절에는 `damageScale`만 넘긴다.
- 계산식은 같은 훅 값을 쓴다.
  - 피해 가산은 `+ 유물 N` 항으로 보인다.
  - 강세는 부사 항에 제곱을 반영한다.
  - 사슬은 `× 2 (사슬)` 항으로 보인다.

- [ ] **Step 1: 실패하는 테스트 작성**: 유물마다 테스트 하나씩. 모두 test-dummy, 손패 지정, 빌드에 그 유물만 넣는다.

```ts
test('긴 문장: 물어뜯는다 + 격렬하게 + 굶주린(3장) → 기본값 6+6=12', ...) // ((12×1.5)+4)=22
test('생략의 미학: 주어를 비우면 피해 10, 당신을 놓으면 6', ...)
test('수식의 사슬: 목적어에 금이 간 2장 → ×1.5×1.5×2', ...)
test('강세: 격렬하게 → ×2.25 (6 → 13)', ...)
test('독의 문법: 독을 뿜는 주어로 물면 독 4', ...)
test('메아리: 연결어 없이 낭독하면 두 번 실행(damaged 이벤트 2개)', ...)
test('허수아비 화자: 동사만 놓고 낭독하면 허수아비가 소환되어 행동', ...)
test('울림: 첫 낭독의 동사 카드는 손패로 돌아오고, 다음 턴에 다시 적용된다', ...)
test('유물 없음: 훅이 모두 기본값', () => expect(clauseHooks(start(), 0)).toEqual({}))  // 또는 모든 필드 기본값
```

- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/game/build src/game/rally`. Expected: FAIL.
- [ ] **Step 3: 구현**
- [ ] **Step 4: 확인.** Run: `npm test && npx tsc -b && npm run lint`. Expected: 통과. 계산식 속성 테스트는 아직 빌드 없이 통과한다.
- [ ] **Step 5: Commit**: `feat(build): 문법 유물 8종`

### Task 3: 연결어와 둘째 절

**Files:**
- Modify
  - `src/game/grammar/frames.ts`(`WordKind`에 `'connective'` 추가)
  - `src/game/content/words.ts`: `WordEffect`에 `{ type: 'connective'; mode: 'and' | 'so' | 'while' }` 추가. 단어 `and`(그리고, 보통), `so`(그래서, 비범), `while`(그러면서, 희귀) 추가
  - `src/game/rally/combat.ts`, `src/game/rally/sentence.ts`, `src/game/rally/formula.ts`, `src/game/rally/preview.ts`
  - `src/game/ui/wordStyle.ts`, `src/game/ui/describe.ts`(새 품사 문구. 컴파일 유지용)
- Test: `src/game/rally/connective.test.ts`, `src/game/rally/preview.test.ts`(속성 테스트 확장)

**Interfaces:**
- Consumes: Task 1·2
- Produces
  - `RallyState.connective: PlacedWord | null`. 보드는 연결어가 있으면 절 2개, 없으면 1개다.
  - 새 행동
    - `{ type: 'connect'; instanceId: string }`: 연결어 카드를 연결어 칸에 놓는다. 이미 있으면 기존 카드는 손패로 돌아가고 둘째 절은 유지된다. 처음이면 빈 둘째 절(칸 수는 빌드 그대로)을 붙인다. 연결어가 아닌 카드는 `kindMismatch`로 거부한다.
    - `{ type: 'disconnect' }`: 연결어와 둘째 절의 내 카드를 모두 손패로 돌려보내고 절을 하나로 줄인다.
  - `clear`, `endTurn`, `cast` 뒤에는 연결어도 손패나 버림 더미로 가고, 문장은 한 절로 돌아간다. 낭독하면 버림 더미로 가고, 비우기와 턴 종료면 손패로 간다.
  - `hasVerb(board)`는 모든 절에 동사가 있을 때 true다.
  - `materialize`는 절마다 빈칸을 채운다. 그러면서이면 절 1의 슬롯별 수식어를 절 2의 같은 슬롯 수식어 뒤에 덧붙인다.
  - 낭독은 절 1을 실행하고, 이어서 절 2를 실행한다. 그래서이면 절 1에서 적이 받은 피해 합의 절반(내림)을 절 2 훅 `damageBonus`에 더한다.
  - `sentenceFormula(state)`: 반환형을 `{ clause: number; text: string; value: number }[]`로 바꾼다. 절마다 하나이고, 동사가 없는 절은 빠진다. 그래서 보너스는 `+ 그래서 N` 항이다. 이 값은 미리보기와 같은 방식으로 절 1을 상태 사본에서 실행해 얻는다. UI 호출부는 첫 원소만 보여 주도록 최소 수정한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `connective.test.ts`

```ts
test('연결어를 놓으면 절이 둘, 빼면 하나이고 둘째 절의 카드는 손패로', ...)
test('연결어가 아닌 카드를 connect하면 kindMismatch', ...)
test('둘째 절에 동사가 없으면 낭독은 noVerb', ...)
test('그리고: 물어뜯는다 그리고 막는다 → 적 피해 6, 내 보호 6', ...)
test('그래서: 물어뜯는다(6) 그래서 물어뜯는다 → 둘째 피해 6+3=9', ...)
test('그러면서: [격렬하게] 물어뜯는다 그러면서 물어뜯는다 → 둘째도 9', ...)
test('낭독하면 연결어와 두 절의 카드가 모두 버림 더미, 문장은 한 절', ...)
test('카드 보존: connect/disconnect를 섞은 무작위 200회', ...)   // 기존 카드 보존 테스트에 두 행동 추가
```

`preview.test.ts`의 "계산식 값 = 실제 첫 피해" 속성 테스트를 확장한다.
- 무작위 상태 생성기가 빌드를 무작위로 고른다(유물 0~3개, 강화 0~2개).
- 연결어 카드를 덱에 섞는다.
- 절마다 계산식 값과 그 절의 첫 피해를 비교한다.

- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/game/rally`. Expected: FAIL.
- [ ] **Step 3: 구현**
- [ ] **Step 4: 확인.** Run: `npm test && npx tsc -b && npm run lint && npm run e2e`. Expected: 통과. 기존 e2e 8개도 통과한다.
- [ ] **Step 5: Commit**: `feat(rally): 연결어(그리고·그래서·그러면서)와 둘째 절`

### Task 4: 정예·보스와 봉인

**Files:**
- Modify: `src/game/content/enemies.ts`, `src/game/content/words.ts`(적 전용 단어), `src/game/rally/combat.ts`, `src/game/combat/events.ts`(`slotSealed` 거부 사유, `sealed` 이벤트), `src/game/ui/CombatScreen.tsx`(예고 문구 컴파일 유지)
- Test: `src/game/rally/seal.test.ts`, `src/game/content/content.test.ts`

**Interfaces:**
- Produces
  - `RallyIntent = { readonly kind: 'clause'; readonly clause: ClauseSpec } | { readonly kind: 'seal' }`
  - `RallyEnemySpec.intents: readonly RallyIntent[]`. 기존 조우는 `{kind:'clause'}`로 감싼다.
  - `enemyIntent(state, index): RallyIntent`
  - `describeSeal(state): SlotRole`: 다음 봉인 대상. `RallyState.sealCount`로 주어 → 목적어 → 동사를 순환한다.
  - 새 조우(spec §5 값): `queen`(거미 여왕, 정예), `gatekeeper`(문지기, 정예), `scribe`(필경사, 보스)
  - `RallyEncounterDef.tier: 'normal' | 'elite' | 'boss'`
  - 봉인
    - 적 턴에 실행하면 내 첫 절의 대상 슬롯을 `sealed: true`로 만든다(`sealed` 이벤트).
    - 다음 적 턴 시작에 모든 봉인을 푼다.
    - 봉인된 슬롯에 놓으면 `slotSealed`로 거부한다. 수식어 칸도 같다.
    - 생략된 기본값은 그대로 작동한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// seal.test.ts: 테스트 전용 조우 test-seal(예고 [seal, testBite])
test('봉인: 적 턴 뒤 내 주어 슬롯이 봉인되고, 주어에 놓으면 slotSealed', ...)
test('봉인: 봉인된 주어도 생략 기본값(당신)으로 낭독된다', ...)
test('봉인: 다음 적 턴 시작에 풀린다', ...)
test('봉인 대상은 주어 → 목적어 → 동사 순환', ...)
// content.test.ts
test('조우 6종: 일반 3, 정예 2, 보스 1', ...)
```

- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/game/rally src/game/content`. Expected: FAIL.
- [ ] **Step 3: 구현.** UI의 적 예고 문구는 seal이면 "필경사가 당신의 주어 칸을 봉인한다"를 보여 준다(최소 수정).
- [ ] **Step 4: 확인.** Run: `npm test && npx tsc -b && npm run lint`. Expected: 통과
- [ ] **Step 5: Commit**: `feat(rally): 정예·보스와 봉인 규칙`

### Task 5: 런 엔진과 상점

**Files:**
- Create: `src/game/run/run.ts`, `src/game/run/shop.ts`, `src/game/run/floors.ts`
- Modify: `.oxlintrc.json`(`src/game/run/**`를 React 금지 목록에 추가)
- Test: `src/game/run/run.test.ts`, `src/game/run/shop.test.ts`

**Interfaces:**
- Consumes: Task 1~4
- Produces
  - `floors.ts`
    - `FLOORS: readonly { tier: 'normal' | 'elite' | 'boss'; scale: { hp: number; damage: number } }[]`: 7개, spec §1 값
    - `REWARD_GOLD = { normal: 10, elite: 20, boss: 0 }`, `HEAL_RATIO = 0.2`
    - `goldFor(tier, bonuses: readonly GoldBonus[]): number`. `GoldBonus { id: string; amount: number }`이고, 이번에는 항상 빈 목록이다.
  - `shop.ts`
    - `Offer = { kind: 'word'; wordId } | { kind: 'upgrade'; wordId } | { kind: 'structure'; id: StructureId } | { kind: 'relic'; id: RelicId }`
    - `ShopItem { offer: Offer; price: number; sold: boolean }`, `ShopState { items: readonly ShopItem[] }`
    - `rollShop(rng, deck, build): [ShopState, RngState]`
      - 종류가 서로 다른 3개를 고른다. 4종류 중 무작위 3종류다.
      - 강화할 단어가 없으면(덱의 모든 단어가 2단계) 강화를 빼고 고른다. 유물이 다 팔렸으면 유물을 뺀다.
      - 단어는 희귀도 가중치로 고른다. 연결어 3종을 포함한 플레이어 풀에서 뽑는다.
      - 강화는 내 덱에서 2단계 미만인 단어 중에서 고른다.
      - 구조는 5종 중에서 고르되, 칸이 4인 슬롯은 뺀다.
      - 유물은 보유하지 않은 것 중에서 고른다.
    - `priceOf(offer): number`: 기본값 + 희귀도 보정. 강화는 대상 단어의 희귀도, 구조는 보정 0을 쓴다.
    - `buyFrom(shop, index): ShopState`: 산 것을 sold로 표시하고, 남은 것의 값을 `Math.ceil(price × 1.5)`로 올린다.
  - `run.ts`
    - `RunState { seed; floor: number /*1..7*/; phase: 'combat' | 'shop' | 'won' | 'lost'; hp; maxHp; gold; deck: readonly WordId[]; build: BuildState; combat: RallyState | null; shop: ShopState | null; rng: RngState; log: RunLog }`
    - `RunLog { bestBurst: number; purchases: readonly Offer[]; floorTurns: readonly { floor: number; tier; turns: number }[] }`
    - `RunAction = { type: 'combat'; action: RallyAction } | { type: 'buy'; index: number } | { type: 'leave' }`
    - `RunEvent = CombatEvent | { type: 'floorCleared'; floor; gold } | { type: 'bought'; offer; price } | { type: 'runEnded'; outcome: 'won' | 'lost' }`
    - `startRun(seed: number, balance: Balance, deck?: readonly WordId[]): Reduced<RunState, RunEvent>`
    - `reduceRun(state, action, balance): Reduced<RunState, RunEvent>`
      - 전투 승리 → HP 반영 + 20% 회복 → 화폐 → 상점(7층이면 `won`)
      - 전투 패배 → `lost`
      - `buy`: 화폐가 모자라거나 이미 산 것이면 거부(`rejected` + reason `notEnoughGold`/`soldOut`). 사면 효과를 적용한다. 단어는 덱에 추가, 강화는 `upgrades`, 구조는 `applyStructure`, 유물은 `relics`에 넣는다.
      - `leave` → 다음 층 전투 시작
    - 일반 층의 조우는 런 rng로 일반 3종 중 고른다. 정예는 3층 `queen`, 6층 `gatekeeper`, 보스는 7층 `scribe`로 고정한다. 전투 시드는 런 rng에서 뽑는다.
    - `combat.log.bestBurst`는 `RunLog.bestBurst`에 최대값으로 합친다.
    - `RejectReason`에 `notEnoughGold`, `soldOut`을 추가한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// shop.test.ts
test('진열 3개는 종류가 서로 다르다(시드 50개)', ...)
test('구매마다 남은 값 ×1.5 올림: 8 → 12 → 18', ...)
test('강화할 단어가 없으면 강화는 나오지 않는다', ...)
test('보유 유물은 나오지 않는다, 칸 4인 슬롯 구조는 나오지 않는다', ...)
test('희귀도 가격 보정: 보통 −3, 희귀 +3', ...)
// run.test.ts
test('시작: 1층 전투, HP 60, 화폐 0', ...)
test('1층 승리 → 화폐 10, 회복 20%(최대 HP 초과 없음), 상점', ...)   // 테스트용으로 적 HP를 1로 낮춘 상태에서 낭독
test('구매: 화폐 차감, 덱/강화/구조/유물 반영, 모자라면 notEnoughGold, 두 번 사면 soldOut', ...)
test('leave → 2층 전투, 빌드와 HP가 이어진다', ...)
test('3층은 거미 여왕, 6층은 문지기, 7층은 필경사', ...)
test('4·5층은 적 HP ×1.3', ...)
test('7층 승리 → won, 상점 없음', ...)
test('패배 → lost, 이후 행동 거부', ...)
test('같은 시드는 같은 런(결정적)', ...)
```

- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/game/run`. Expected: FAIL. 모듈이 없다.
- [ ] **Step 3: 구현**
- [ ] **Step 4: 확인.** Run: `npm test && npx tsc -b && npm run lint`. Expected: 통과
- [ ] **Step 5: Commit**: `feat(run): 런 엔진(7층·화폐·회복)과 상점`

### Task 6: 런 sim 봇과 게이트 스크립트

**Files:**
- Create
  - `src/game/sim/combatBot.ts`: 두 수 앞 탐욕 전투 봇
  - `src/game/sim/shopBots.ts`: 학습, 유형 5, 무작위, 안 삼
  - `src/game/sim/runSim.ts`: 한 런을 끝까지 돌리고 지표를 반환
  - `src/game/sim/runTargets.ts`
  - `scripts/run-sim.ts`: 리포트와 게이트 판정
- Modify: `package.json`(`"gate": "tsx --tsconfig tsconfig.app.json scripts/run-sim.ts --gate"`, `"sim:run": "… scripts/run-sim.ts"`), `.gitignore`(없음)
- Test: `src/game/sim/runSim.test.ts`(빠른 스모크)

**Interfaces:**
- Consumes: Task 5의 `startRun`, `reduceRun`, `RunState`
- Produces
  - `twoPlyBot(state: RallyState, balance): RallyAction`
    - 한 수 앞 점수로 후보를 정렬해 상위 5개를 고른다. 여기에 모든 connect 후보를 더하고, 각 후보 뒤에 둘째 배치까지 본다.
    - 가장 좋은 마무리(낭독, 턴 종료)의 점수가 지금 마무리하는 것보다 높으면 그 첫 수를 둔다.
    - 점수식은 `scoreState`(기존)다.
  - `ShopPolicy = (run: RunState, rng: RngState) => [RunAction, RngState]`: 상점 단계에서 buy 또는 leave를 돌려준다.
  - `ShopWeights { kinds: Record<Offer['kind'], number>; relics: Record<RelicId, number>; structures: Record<StructureId, number>; connectiveBias: number; saveThreshold: number }`
    - 점수 = 종류 가중치 × 세부 가중치 ÷ 값. 점수가 `saveThreshold`보다 높은 것을 높은 순으로 산다.
    - 강화는 덱에서 가장 많은 동사를 우선한다.
  - `weightedShopBot(w: ShopWeights): ShopPolicy`, `randomShopBot`, `noShopBot`
  - `ARCHETYPES: Record<'poison' | 'connective' | 'structure' | 'relic' | 'focus', ShopWeights>`
  - `trainShopWeights(trainSeeds: readonly number[], iterations: number, rngSeed: number): ShopWeights`
    - 무작위 시작점 5개에서 언덕 오르기를 한다. 한 번에 가중치 하나를 ×0.5~×2로 바꾸고, 학습 시드 완주율(동률이면 평균 도달 층)이 오르면 채택한다.
  - `simulateRun(seed, shop: ShopPolicy, balance): RunResult`
    - `RunResult { outcome: 'won' | 'lost'; floorReached; bestBurst; purchases: Offer[]; floorTurns }`
  - `RUN_TARGETS`: spec §7.2
    - 학습 완주 [0.5, 0.8]
    - 무작위 ≤ 학습 − 0.2
    - 안 삼 ≤ 0.2
    - 학습과 15%p 안에 드는 유형 ≥ 3
    - 상위 25% 최대 한 방 ≥ 180
    - 정예·보스 평균 턴 ≤ 8

**`scripts/run-sim.ts`**
1. 학습 시드 1~30으로 가중치를 학습한다(반복 40). 결과를 `src/game/sim/learnedWeights.json`에 저장한다.
2. 평가 시드 1001~1060으로 학습, 유형 5종, 무작위, 안 삼을 돌린다.
3. 표를 출력한다.
   - 완주율, 평균 도달 층, 최대 한 방(평균·상위 25%), 정예·보스 평균 턴
   - 종류별 구매 비율, 유물별 완주율, 연결어 사용률(낭독 중 두 절 비율)
4. `--gate`면 목표를 판정하고, 하나라도 실패하면 exit 1로 끝낸다.
5. 인자: `[--runs N] [--iterations N] [--gate] [--skip-train]`. `--skip-train`이면 저장된 가중치를 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성** — `runSim.test.ts`(빠른 것만)

```ts
test('두 수 앞 봇은 손패에 연결어와 동사 둘이 있으면 두 절로 낭독한다', ...)  // test-dummy, 손패 [bite, and, bite]
test('simulateRun은 끝까지 진행해 won 또는 lost를 낸다(시드 3개, 안 삼 봇)', ...)
test('weightedShopBot은 점수 높은 순으로 사고, 돈이 모자라면 leave', ...)
test('trainShopWeights는 결정적이다(같은 입력 → 같은 가중치)', ...)  // 시드 2개, 반복 2
```

- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/game/sim/runSim.test.ts`. Expected: FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 확인.** Run: `npm test && npx tsc -b && npm run lint && npm run sim:run -- --runs 10 --iterations 3`. Expected: 테스트 통과, 표 출력
- [ ] **Step 5: Commit**: `feat(sim): 런 sim 봇(학습·유형·무작위·안 삼)과 게이트 스크립트`

### Task 7: 측정, 튜닝, 기록

**Files:**
- Tune: `src/game/content/enemies.ts`, `src/game/content/words.ts`(적 전용 단어 수치만), `src/game/run/floors.ts`, `src/game/run/shop.ts`(가격)
- Modify: `docs/lab/worklog/pilot-was-spoken.md`, `src/game/sim/learnedWeights.json`

- [ ] **Step 1: 측정.** Run: `npm run gate`. 표를 작업 로그에 붙인다.
- [ ] **Step 2: 튜닝.** 게이트가 통과하지 않으면 spec §7.2의 손잡이만 조정한다: 적 HP·피해, 4·5층 배율, 화폐량, 가격, 회복률. 바꾼 값마다 ledger에 `Ruling:`을 남긴다. 기본 랠리 규칙과 빌드 요소의 효과는 바꾸지 않는다. 손잡이로 맞지 않으면 멈추고 측정표를 붙여 보고한다.
- [ ] **Step 3: 회귀.** Run: `npm test && npx tsc -b && npm run lint && npm run build && npm run e2e && npm run gate`. Expected: 모두 통과(exit 0)
- [ ] **Step 4: 작업 로그에 해석을 기록한다.** 성장 곡선, 지배적 종류, 유물 편차를 담는다.
- [ ] **Step 5: Commit**: `chore(balance): 런 게이트 튜닝과 측정 기록`
