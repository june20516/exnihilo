# Pilot Sentence — Plan 1: 수직 슬라이스 Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 거미 조우 한 판(타동 문형, 시작 덱 10장, 잉크 건조, 개입 루프, 승패)을 브라우저에서 클릭/드래그로 플레이할 수 있게 만든다.

**Architecture:** 게임 규칙은 React를 모르는 순수 TS 엔진이다. `reduce(state, action) → { state, events }`가 새 상태와 이벤트 목록을 돌려주고, UI는 새 상태를 즉시 그리면서 이벤트를 연출 큐로 재생한다(재생 중에는 입력을 막는다). 코드는 `src/kit/`(장르 무관)과 `src/game/`(문장 던전 고유)으로 나누고, `kit`은 `game`을 import하지 않는다.

**Tech Stack:** Vite, React, TypeScript(strict), Tailwind CSS v4(`@tailwindcss/vite`), Vitest, ESLint(flat config), `@dnd-kit/core`, `motion`, Playwright. 버전은 설치 시점의 최신 안정판을 쓴다.

**Spec:** `docs/suberpowers/specs/2026-11-23-pilot-was-spoken-design.md`

## 로드맵 (이 plan은 1/4)

| Plan | 내용 | 끝났을 때의 상태 |
|---|---|---|
| **1. 수직 슬라이스 (이 문서)** | 엔진 코어, 타동 문형, 시작 덱, 잉크 건조, 개입(revert/attach/replace/seal/pollute), 거미 조우, 전투 UI, 기본 연출 | 거미전 한 판을 플레이할 수 있다 |
| 2. 전투 규칙 완성 | 문형 4종과 그리고/스스로, 명사구, 진형, 상태 이상 8종, 턴 위상, 나머지 개입 단계, 조우 13종, 단어 약 70개 | 개발 패널에서 고른 아무 조우나 플레이할 수 있다 |
| 3. 런 레이어 | 지도, 보상, 상점, 휴식, 이벤트, 상속, 유물, Stitch 화면 시안과 일러스트 | 2막 런을 처음부터 끝까지 플레이할 수 있다 |
| 4. 완성도 | spec 6장의 연출 전체, 개발 패널, 플레이 기록과 설문, e2e 스모크, 평가 기준 문서, 회고 준비 | spec 8장 완료 기준 충족 |

Plan 2~4는 이 plan의 플레이 결과를 반영해 따로 작성한다.

## Global Constraints

- 작업 위치는 `pilot-was-spoken/`이고, 경로 별칭은 `@/` = `pilot-was-spoken/src/`다.
- TypeScript는 `strict: true`이며, `any`는 쓰지 않는다(ESLint `@typescript-eslint/no-explicit-any: error`).
- `src/kit/**`은 `src/game/**`과 `src/app/**`을 import할 수 없다(ESLint `no-restricted-imports`).
- `src/kit/**`과 `src/game/**` 중 `ui/`, `fx/`를 뺀 곳에서는 React와 DOM API를 import하지 않는다(엔진의 순수성).
- 엔진 함수는 입력 상태를 변경하지 않고 새 객체를 돌려준다.
- 엔진은 규칙 위반에 예외를 던지지 않고 `rejected` 이벤트를 돌려준다. 예외는 콘텐츠 데이터 오류에만 쓴다.
- 모든 무작위는 `RngState`를 거친다. `Math.random` 사용을 금지한다(ESLint `no-restricted-properties`).
- UI 텍스트는 한국어다. 수치는 `src/game/content/balance.ts`에만 둔다.
- 각 task의 commit 직전에 `docs/lab/worklog/pilot-was-spoken.md`에 한 줄을 추가한다: `| 날짜 시각 | Task N | 단계 분류 | 막힌 점 | 재작업(원인) |`. 단계 분류는 기획 / 애셋 / kit / game 엔진 / UI / 연출 / 밸런싱 / 디버깅 중 하나다.
- 커밋 메시지는 한국어로 쓰고, 끝에 세션의 attribution 줄을 붙인다.

## Review Focus

1. **덱과 버림 더미가 모두 비었거나 오염 카드만 남았을 때의 드로우**: 가능한 만큼만 뽑고 멈춘다. 무한 루프나 크래시가 없어야 한다. → Task 3 테스트
2. **같은 턴에 같은 슬롯을 여러 번 덮어쓰기**: 매번 행동력을 차감하고, 앞서 놓은 플레이어 단어는 버림 더미로 간다. 원문은 바뀌지 않는다. → Task 6, Task 8 테스트
3. **이미 원문 상태인 슬롯을 revert하거나, 봉인된 슬롯에 개입하기**: 상태 변화 없이 이벤트만 남기고 크래시가 없어야 한다. 봉인은 적 개입을 막지 않는다. → Task 6 테스트
4. **`[두 번]`이나 다중 실행 중에 목적어가 죽는 경우**: 죽은 개체에게는 이후 효과가 가지 않는다. 적이 전멸하고 플레이어도 HP 0이면 패배로 판정한다. → Task 7, Task 8 테스트
5. **조사 처리에서 비한글로 끝나는 단어나 빈 문자열**: 받침 없음으로 처리하고 예외가 없어야 한다. → Task 4 테스트

---

## File Structure

```
pilot-was-spoken/
├─ index.html                         # 폰트 링크(Noto Serif KR, Noto Serif, Space Grotesk, Material Symbols)
├─ vite.config.ts / vitest.config.ts / eslint.config.js / tsconfig*.json
├─ playwright.config.ts
├─ public/assets/                     # bg-cavern.jpg, explorer.jpg, spider.jpg (기존 assets/에서 이동)
├─ src/
│  ├─ kit/
│  │  ├─ core/rng.ts                  # 시드 RNG
│  │  ├─ core/entity.ts               # Entity, 피해·보호·회복·상태
│  │  ├─ core/reduced.ts              # Reduced<S, E>
│  │  ├─ deck/deck.ts                 # DeckState, draw/discard/add
│  │  └─ fx/effectPlayer.ts           # 이벤트 → 연출 Promise 큐
│  ├─ game/
│  │  ├─ grammar/josa.ts              # 받침 판정, 조사 붙이기
│  │  ├─ grammar/frames.ts            # Frame, SlotDef (이번엔 transitive만)
│  │  ├─ grammar/render.ts            # Clause → 표시 토큰 목록
│  │  ├─ content/words.ts             # WordDef, WordEffect, WORDS
│  │  ├─ content/tokens.ts            # 토큰 정의 (허수아비)
│  │  ├─ content/encounters.ts        # EncounterDef, InterventionStep, 거미 조우
│  │  ├─ content/balance.ts           # BALANCE
│  │  ├─ sentence/board.ts            # Board, SlotState, 배치·건조·개입 연산
│  │  ├─ resolve/resolve.ts           # resolveClause
│  │  ├─ combat/events.ts             # CombatEvent, RejectReason
│  │  ├─ combat/combat.ts             # CombatState, startCombat, reduceCombat
│  │  ├─ fx/inkEffects.ts             # 잉크 번짐 등 game 고유 연출 핸들러
│  │  └─ ui/                          # CombatScreen, Battlefield, SentenceBoard, Hand, WordTile, …
│  └─ app/
│     ├─ main.tsx, App.tsx, theme.css # Stitch 토큰 → Tailwind @theme
│     └─ useCombatStore.ts            # useReducer + EffectPlayer 연결
├─ tests/e2e/combat-slice.spec.ts
docs/lab/worklog/pilot-was-spoken.md
```

엔진 단위 테스트는 대상 파일 옆에 `*.test.ts`로 둔다.

---

### Task 1: 스캐폴딩과 경계 규칙

**Files:**
- Create: `pilot-was-spoken/` 아래 Vite React TS 프로젝트, `eslint.config.js`, `src/app/theme.css`, `src/app/App.tsx`, `docs/lab/worklog/pilot-was-spoken.md`
- Move: `pilot-was-spoken/assets/*.jpg` → `pilot-was-spoken/public/assets/`
- Test: `src/app/smoke.test.ts`

**Interfaces:**
- Produces: `npm run dev | build | test | lint | e2e` 스크립트, `@/` 별칭, Tailwind 테마 토큰(Stitch `battle-v1`의 colors, fontFamily, fontSize를 `@theme`로 옮긴 것: 예 `--color-primary: #ffb3ae`, `--color-surface-container-lowest: #0b0e14`, `--font-headline: "Noto Serif KR", "Noto Serif", serif`, `--font-label: "Space Grotesk", sans-serif`)

- [ ] **Step 1:** `pilot-was-spoken/`에서 `npm create vite@latest . -- --template react-ts`로 생성한다(기존 `assets/`, `stitch/`는 유지). 이어서 `tailwindcss @tailwindcss/vite @dnd-kit/core motion`과 개발 의존성 `vitest @playwright/test eslint typescript-eslint eslint-plugin-react-hooks`를 설치한다.
- [ ] **Step 2:** `tsconfig.app.json`에 `strict`와 `paths: { "@/*": ["src/*"] }`를, `vite.config.ts`에 tailwind 플러그인과 alias를 넣는다. `vitest.config.ts`는 `environment: 'node'`, `include: ['src/**/*.test.ts']`로 설정한다. `package.json` 스크립트: `test`는 `vitest run`, `lint`는 `eslint .`, `e2e`는 `playwright test`.
- [ ] **Step 3:** `eslint.config.js`에 다음 규칙을 넣는다.
  - `src/kit/**`: `no-restricted-imports`로 `@/game/*`, `@/app/*`, 상대 경로 `**/game/**`, `**/app/**` 금지
  - `src/kit/**`, `src/game/{grammar,content,sentence,resolve,combat}/**`: `react`, `react-dom` import 금지
  - 전체: `@typescript-eslint/no-explicit-any: error`, `no-restricted-properties`로 `Math.random` 금지
- [ ] **Step 4:** 경계 규칙을 검증한다. 임시 파일 `src/kit/_probe.ts`에 `import '@/game/x'`를 쓰고 `npm run lint`를 실행한다. Expected: `no-restricted-imports` 에러. 확인 후 파일을 삭제한다.
- [ ] **Step 5:** `src/app/theme.css`에 `@import "tailwindcss";`와 `@theme` 토큰을 쓰고, `index.html`에 Stitch 시안과 같은 Google Fonts 링크를 넣는다. `App.tsx`는 배경색과 "문장 던전" 제목만 렌더한다. 이미지는 `public/assets/`로 옮긴다.
- [ ] **Step 6:** `src/app/smoke.test.ts`에 `expect(1 + 1).toBe(2)`를 쓰고, `npm test && npm run lint && npm run build`를 실행한다. Expected: 모두 통과.
- [ ] **Step 7:** `docs/lab/worklog/pilot-was-spoken.md`를 만든다. 표 헤더 `| 일시 | Task | 단계 | 막힌 점 | 재작업(원인) |`를 쓰고 첫 줄을 기록한다. 그다음 커밋한다: `chore(pilot-was-spoken): Vite/React/Tailwind 스캐폴딩과 kit 경계 규칙`

---

### Task 2: kit/core — 시드 RNG와 개체

**Files:**
- Create: `src/kit/core/rng.ts`, `src/kit/core/entity.ts`, `src/kit/core/reduced.ts`
- Test: `src/kit/core/rng.test.ts`, `src/kit/core/entity.test.ts`

**Interfaces:**
- Produces:
  - `interface RngState { readonly seed: number; readonly cursor: number }`
  - `createRng(seed: number): RngState`
  - `nextFloat(rng: RngState): [number, RngState]`: mulberry32 계열, `[0,1)`
  - `nextInt(rng: RngState, min: number, max: number): [number, RngState]`: 양끝 포함
  - `shuffle<T>(rng: RngState, items: readonly T[]): [T[], RngState]`: Fisher–Yates
  - `type Side = 'ally' | 'enemy'`, `type Row = 'front' | 'back'`
  - `type StatusKind = 'block' | 'poison' | 'freeze'` (Plan 2에서 확장)
  - `interface Entity { readonly id: string; readonly defId: string; readonly name: string; readonly side: Side; readonly row: Row; readonly hp: number; readonly maxHp: number; readonly statuses: Readonly<Record<StatusKind, number>> }`
  - `createEntity(p: { id; defId; name; side; hp; row?: Row }): Entity`: row 기본값 `'front'`, 상태 모두 0
  - `isAlive(e: Entity): boolean`
  - `applyDamage(e: Entity, amount: number): { entity: Entity; dealt: number; blocked: number }`
  - `heal(e: Entity, amount: number): { entity: Entity; healed: number }`
  - `addStatus(e: Entity, kind: StatusKind, amount: number): Entity`
  - `tickEndOfTurn(e: Entity): { entity: Entity; poisonDamage: number }`: 독 피해(보호 무시) 후 독 -1, 보호 0으로
  - `interface Reduced<S, E> { readonly state: S; readonly events: readonly E[] }`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// rng.test.ts
test('같은 시드는 같은 수열', () => {
  const [a1, r1] = nextFloat(createRng(42)); const [a2] = nextFloat(r1);
  const [b1, s1] = nextFloat(createRng(42)); const [b2] = nextFloat(s1);
  expect([a1, a2]).toEqual([b1, b2]); expect(a1).not.toBe(a2);
});
test('nextInt는 양끝 포함 범위', () => {
  let rng = createRng(7); const seen = new Set<number>();
  for (let i = 0; i < 200; i++) { const [n, r] = nextInt(rng, 1, 3); seen.add(n); rng = r; }
  expect([...seen].sort()).toEqual([1, 2, 3]);
});
test('shuffle은 원소를 보존하고 원본을 바꾸지 않는다', () => {
  const src = [1, 2, 3, 4, 5]; const [out] = shuffle(createRng(1), src);
  expect([...out].sort()).toEqual(src); expect(src).toEqual([1, 2, 3, 4, 5]);
});
// entity.test.ts
const spider = () => createEntity({ id: 'e1', defId: 'spider', name: '거미', side: 'enemy', hp: 30 });
test('보호가 피해를 먼저 흡수', () => {
  const r = applyDamage(addStatus(spider(), 'block', 4), 6);
  expect(r).toMatchObject({ dealt: 2, blocked: 4 }); expect(r.entity.hp).toBe(28); expect(r.entity.statuses.block).toBe(0);
});
test('HP는 0 아래로 내려가지 않는다', () => { expect(applyDamage(spider(), 99).entity.hp).toBe(0); });
test('회복은 최대 HP를 넘지 않는다', () => {
  const hurt = applyDamage(spider(), 3).entity; expect(heal(hurt, 10)).toMatchObject({ healed: 3 });
});
test('턴 종료: 독 피해는 보호를 무시하고 1 감소, 보호는 사라짐', () => {
  const e = addStatus(addStatus(spider(), 'poison', 3), 'block', 5);
  const r = tickEndOfTurn(e);
  expect(r.poisonDamage).toBe(3); expect(r.entity.hp).toBe(27);
  expect(r.entity.statuses).toMatchObject({ poison: 2, block: 0 });
});
```

- [ ] **Step 2:** `npm test -- src/kit/core` 실행. Expected: FAIL(모듈 없음)
- [ ] **Step 3:** Interfaces 블록대로 구현한다.
- [ ] **Step 4:** `npm test -- src/kit/core` 실행. Expected: PASS
- [ ] **Step 5:** worklog를 기록하고 커밋한다: `feat(kit): 시드 RNG와 개체 피해·회복·상태`

---

### Task 3: kit/deck — 덱 기계

**Files:**
- Create: `src/kit/deck/deck.ts`
- Test: `src/kit/deck/deck.test.ts`

**Interfaces:**
- Consumes: `RngState`, `shuffle` (Task 2)
- Produces:
  - `interface CardInstance { readonly instanceId: string }` (제네릭 제약용)
  - `interface DeckState<C extends CardInstance> { readonly drawPile: readonly C[]; readonly hand: readonly C[]; readonly discardPile: readonly C[] }`
  - `createDeck<C extends CardInstance>(cards: readonly C[], rng: RngState): { deck: DeckState<C>; rng: RngState }`: 섞어서 drawPile에 둔다
  - `draw<C>(deck, count: number, rng): { deck; rng; drawn: C[]; reshuffled: boolean }`: drawPile이 비면 버림 더미를 섞어 한 번 보충한다. 그래도 부족하면 있는 만큼만 뽑는다.
  - `takeFromHand<C>(deck, instanceId: string): { deck; card: C } | null`
  - `discardHand<C>(deck): DeckState<C>`
  - `addToDiscard<C>(deck, cards: readonly C[]): DeckState<C>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ instanceId: `c${i}` }));
test('4장 드로우', () => {
  const { deck, rng } = createDeck(cards(10), createRng(1));
  const r = draw(deck, 4, rng);
  expect(r.deck.hand).toHaveLength(4); expect(r.deck.drawPile).toHaveLength(6); expect(r.reshuffled).toBe(false);
});
test('덱이 모자라면 버림 더미를 섞어 보충', () => {
  const { deck, rng } = createDeck(cards(5), createRng(1));
  const a = draw(deck, 4, rng); const b = draw(discardHand(a.deck), 4, a.rng);
  expect(b.reshuffled).toBe(true); expect(b.deck.hand).toHaveLength(4); expect(b.deck.drawPile).toHaveLength(1);
});
test('덱과 버림 더미가 모두 비면 있는 만큼만 뽑는다', () => {
  const { deck, rng } = createDeck(cards(2), createRng(1));
  const r = draw(deck, 4, rng);
  expect(r.drawn).toHaveLength(2); expect(r.deck.hand).toHaveLength(2);
});
test('takeFromHand는 없는 카드면 null', () => {
  const { deck } = createDeck(cards(1), createRng(1)); expect(takeFromHand(deck, 'nope')).toBeNull();
});
```

- [ ] **Step 2:** `npm test -- src/kit/deck` 실행. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npm test -- src/kit/deck` 실행. Expected: PASS
- [ ] **Step 5:** worklog를 기록하고 커밋한다: `feat(kit): 덱 드로우·버림·보충`

---

### Task 4: game/grammar — 조사, 문형, 표시 토큰

**Files:**
- Create: `src/game/grammar/josa.ts`, `src/game/grammar/frames.ts`, `src/game/grammar/render.ts`
- Test: `src/game/grammar/josa.test.ts`, `src/game/grammar/render.test.ts`

**Interfaces:**
- Produces:
  - `type ParticleKind = 'subject' | 'object' | 'topic' | 'and' | 'dative' | 'dativeFrom'`
  - `hasFinalConsonant(word: string): boolean`: 마지막 글자가 한글 음절(U+AC00–U+D7A3)이고 `(code - 0xAC00) % 28 !== 0`일 때만 true
  - `attachParticle(word: string, kind: ParticleKind): string`: 받침이 있으면 이/을/은/과, 없으면 가/를/는/와. dative는 에게, dativeFrom은 에게서(받침 무관).
  - `type SlotRole = 'subject' | 'object' | 'verb'` (Plan 2에서 recipient, item, place 추가)
  - `type FrameId = 'transitive'` (Plan 2에서 확장)
  - `interface SlotDef { readonly role: SlotRole; readonly accepts: readonly WordKind[]; readonly particle: ParticleKind | null }`
  - `interface Frame { readonly id: FrameId; readonly slots: readonly SlotDef[] }`
  - `FRAMES: Record<FrameId, Frame>`. transitive = `[{subject, ['target'], 'subject'}, {object, ['target'], 'object'}, {verb, ['verbTransitive'], null}]`
  - `type RenderToken = { kind: 'modifier' | 'head'; text: string; address: SlotAddress; modifierIndex?: number } | { kind: 'particle'; text: string }`
  - `renderClause(board: Board, clauseIndex: number, nameOf: (w: PlacedWord) => string): RenderToken[]`: 수식어 → head → 조사 순서. 조사는 head에 표시되는 이름(`nameOf`) 기준이다(지목된 적의 이름 등).
- `WordKind`는 Task 5, `Board`, `SlotAddress`, `PlacedWord`는 Task 6에서 정의한다. `render.ts`는 Task 6 이후에 테스트가 통과한다(Step 순서 참조).

- [ ] **Step 1: josa 실패 테스트 작성**

```ts
test.each([
  ['거미', 'subject', '거미가'], ['당신', 'subject', '당신이'],
  ['거미', 'object', '거미를'], ['당신', 'object', '당신을'],
  ['거미', 'and', '거미와'], ['당신', 'and', '당신과'],
  ['허수아비', 'topic', '허수아비는'], ['마녀', 'dativeFrom', '마녀에게서'],
  ['HP', 'subject', 'HP가'], ['', 'object', '를'],
])('%s + %s → %s', (w, k, out) => expect(attachParticle(w, k as ParticleKind)).toBe(out));
```

- [ ] **Step 2:** `npm test -- josa` 실행. Expected: FAIL
- [ ] **Step 3:** `josa.ts`와 `frames.ts`를 구현한다.
- [ ] **Step 4:** `npm test -- josa` 실행. Expected: PASS. 커밋한다: `feat(game): 조사 자동 처리와 타동 문형`
- [ ] **Step 5:** `render.test.ts`와 `render.ts`는 **Task 6 Step 5에서** 작성한다(Board 타입에 의존).

---

### Task 5: game/content — 슬라이스 콘텐츠와 수치

**Files:**
- Create: `src/game/content/words.ts`, `tokens.ts`, `encounters.ts`, `balance.ts`
- Test: `src/game/content/content.test.ts`

**Interfaces:**
- Consumes: `FrameId`, `SlotRole` (Task 4)
- Produces:
  - `type WordId = string`, `type TokenId = 'scarecrow'` (Plan 2에서 확장)
  - `type WordKind = 'target' | 'verbTransitive' | 'verbIntransitive' | 'adjective' | 'adverb' | 'junk'`
  - `type Rarity = 'starter' | 'common' | 'uncommon' | 'rare'`
  - `type VerbRange = 'melee' | 'ranged' | 'support'`
  - `type ActionTarget = 'subject' | 'object'`
  - `type VerbAction = { kind: 'damage'; amount: number } | { kind: 'block'; amount: number; to: ActionTarget } | { kind: 'heal'; amount: number; to: ActionTarget } | { kind: 'freeze'; to: ActionTarget }`
  - `type TargetRef = { kind: 'player' } | { kind: 'chosenEnemy' } | { kind: 'token'; tokenId: TokenId } | { kind: 'enemyDef'; defId: string }`
  - `type AdjectiveMod = { kind: 'outgoingDamageMul'; value: number } | { kind: 'onHitPoison'; amount: number }`
  - `type AdverbMod = { kind: 'powerMul'; value: number }`
  - `type WordEffect = { type: 'target'; ref: TargetRef } | { type: 'verb'; range: VerbRange; actions: readonly VerbAction[] } | { type: 'adjective'; mods: readonly AdjectiveMod[] } | { type: 'adverb'; mods: readonly AdverbMod[] } | { type: 'junk' }`
  - `interface WordDef { readonly id: WordId; readonly text: string; readonly kind: WordKind; readonly cost: number | null; readonly ink: number; readonly rarity: Rarity; readonly effect: WordEffect; readonly enemyOnly: boolean }`. `cost: null`은 사용 불가(오염)를 뜻한다.
  - `WORDS: Record<WordId, WordDef>`, `getWord(id: WordId): WordDef`(없으면 throw)
  - `TOKENS: Record<TokenId, { name: string; hp: number }>`. `scarecrow`: 허수아비, hp 8
  - `type SlotAddress = { readonly clause: number; readonly role: SlotRole }` (여기서 정의하고 board가 재사용)
  - `type InterventionStep = { kind: 'revert'; at: SlotAddress } | { kind: 'attach'; at: SlotAddress; word: WordId } | { kind: 'replace'; at: SlotAddress; word: WordId } | { kind: 'seal'; at: SlotAddress } | { kind: 'pollute'; word: WordId; count: number }`
  - `interface ClauseSpec { readonly frameId: FrameId; readonly slots: readonly { role: SlotRole; head: WordId; modifiers?: readonly WordId[] }[] }`
  - `interface EncounterDef { readonly id: string; readonly enemies: readonly { defId: string; name: string; hp: number; row: Row; portrait: string }[]; readonly initialSentence: readonly ClauseSpec[]; readonly interventionLoop: readonly InterventionStep[] }`
  - `ENCOUNTERS: Record<string, EncounterDef>`, `STARTER_DECK: readonly WordId[]`
  - `BALANCE = { playerMaxHp: 60, apPerTurn: 3, drawPerTurn: 4, maxModifiers: 2, sealExtraCost: 1 } as const`, `type Balance = typeof BALANCE`

**이번 슬라이스 단어** (spec 3.1, 3.2의 수치. `ink` 기본 2, `cost` 기본 1):

| id | text | kind | effect |
|---|---|---|---|
| you | 당신 | target | player |
| mark | 지목 | target | chosenEnemy |
| scarecrow | 허수아비 | target | token scarecrow |
| bite | 물어뜯는다 | verbTransitive | melee, damage 6 |
| guard | 막는다 | verbTransitive | support, block 6 → subject |
| mend | 치유한다 | verbTransitive | support, heal 5 → object |
| sleep | 잠든다 | verbIntransitive | support, freeze → subject |
| blind | 눈먼 | adjective | outgoingDamageMul 0.5 |
| venomous | 독을 뿜는 | adjective | onHitPoison 2 |
| fiercely | 격렬하게 | adverb | powerMul 1.5 |
| spider | 거미 | target (enemyOnly) | enemyDef spider |
| web | 거미줄 | junk (cost null) | junk |

`STARTER_DECK = ['you','you','mark','scarecrow','bite','guard','mend','sleep','blind','fiercely']`

거미 조우 `spider`: 적 `{ defId:'spider', name:'거미', hp:30, row:'front', portrait:'/assets/spider.jpg' }`, 초기 문장 `[독을 뿜는] 거미가 당신을 물어뜯는다`. 개입 루프는 `revert(0:subject) → attach(0:verb, fiercely) → pollute(web, 1)`이다.

- [ ] **Step 1: 콘텐츠 검증 실패 테스트 작성**

```ts
test('시작 덱 단어가 모두 존재하고 플레이어용이다', () => {
  for (const id of STARTER_DECK) expect(getWord(id).enemyOnly).toBe(false);
  expect(STARTER_DECK).toHaveLength(10);
});
test('모든 조우의 초기 문장이 문형 슬롯과 허용 품사에 맞는다', () => {
  for (const enc of Object.values(ENCOUNTERS)) for (const clause of enc.initialSentence) {
    const frame = FRAMES[clause.frameId];
    expect(clause.slots.map(s => s.role).sort()).toEqual(frame.slots.map(s => s.role).sort());
    for (const s of clause.slots) {
      const def = frame.slots.find(d => d.role === s.role)!;
      expect(def.accepts).toContain(getWord(s.head).kind);
      for (const m of s.modifiers ?? []) expect(['adjective', 'adverb']).toContain(getWord(m).kind);
    }
  }
});
test('개입 루프가 참조하는 단어가 존재한다', () => {
  for (const enc of Object.values(ENCOUNTERS)) for (const st of enc.interventionLoop)
    if ('word' in st) expect(() => getWord(st.word)).not.toThrow();
});
```

- [ ] **Step 2:** `npm test -- content` 실행. Expected: FAIL
- [ ] **Step 3:** 표와 Interfaces대로 데이터를 작성한다.
- [ ] **Step 4:** `npm test -- content` 실행. Expected: PASS
- [ ] **Step 5:** worklog를 기록하고 커밋한다: `feat(game): 슬라이스 단어·거미 조우·수치 데이터`

---

### Task 6: game/sentence — 보드 연산

**Files:**
- Create: `src/game/sentence/board.ts`, `src/game/grammar/render.ts`(Task 4에서 미룬 것)
- Test: `src/game/sentence/board.test.ts`, `src/game/grammar/render.test.ts`

**Interfaces:**
- Consumes: `WordDef`, `getWord`, `SlotAddress`, `ClauseSpec`, `FRAMES` (Task 4, 5)
- Produces:
  - `interface PlacedWord { readonly wordId: WordId; readonly owner: 'player' | 'enemy'; readonly inkLeft: number | null; readonly instanceId: string | null; readonly targetEntityId: string | null }`. 적 단어는 `inkLeft: null`, `instanceId: null`이다.
  - `interface SlotState { readonly role: SlotRole; readonly head: PlacedWord; readonly modifiers: readonly (PlacedWord | null)[]; readonly originalHead: PlacedWord; readonly originalModifiers: readonly (PlacedWord | null)[]; readonly sealed: boolean }`. `modifiers` 길이는 `maxModifiers`로 고정한다.
  - `interface Clause { readonly frameId: FrameId; readonly slots: readonly SlotState[] }`, `interface Board { readonly clauses: readonly Clause[] }`
  - `buildBoard(spec: readonly ClauseSpec[], maxModifiers: number): Board`: 원문을 현재값에도 그대로 복사한다.
  - `getSlot(board: Board, at: SlotAddress): SlotState`
  - `type PlaceResult = { ok: true; board: Board; displaced: PlacedWord[] } | { ok: false; reason: 'kindMismatch' | 'modifiersFull' }`
  - `placeWord(board, at: SlotAddress, word: PlacedWord, modifierIndex?: number): PlaceResult`
    - head 단어(target, verb류): 슬롯 `accepts`에 kind가 없으면 `kindMismatch`. 맞으면 head를 교체하고 기존 head를 displaced로 돌려준다.
    - 수식어(adjective는 subject/object 슬롯, adverb는 verb 슬롯만 허용, 그 밖에는 `kindMismatch`): `modifierIndex`가 있으면 그 위치를 교체하고, 없으면 첫 빈 위치에 넣는다. 빈 위치가 없으면 `modifiersFull`.
    - 원문(`original*`)은 바꾸지 않는다.
  - `dryInk(board): { board: Board; dried: { at: SlotAddress; modifierIndex: number | null; word: PlacedWord }[] }`: 플레이어 단어의 `inkLeft`를 1 줄인다. 0이 되면 head는 `originalHead`로, 수식어는 `originalModifiers[i]`(없으면 null)로 되돌린다.
  - `revertSlot(board, at): { board; displaced: PlacedWord[] }`: head와 수식어를 원문으로 되돌린다.
  - `enemyAttach(board, at, word: PlacedWord): { board; displaced: PlacedWord[] }`: 첫 빈 위치(없으면 index 0)에 넣고, **원문의 같은 위치도 갱신**한다.
  - `enemyReplace(board, at, word: PlacedWord): { board; displaced: PlacedWord[] }`: head와 `originalHead`를 모두 교체한다.
  - `sealSlot(board, at): Board`
  - `playerWordsOnBoard(board): PlacedWord[]`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const spiderBoard = () => buildBoard(ENCOUNTERS.spider.initialSentence, 2);
const S = { clause: 0, role: 'subject' } as const, V = { clause: 0, role: 'verb' } as const;
const pw = (wordId: WordId, ink = 2, id = 'i1'): PlacedWord => ({ wordId, owner: 'player', inkLeft: ink, instanceId: id, targetEntityId: null });

test('주어에 당신을 놓으면 거미가 밀려나고 원문은 유지', () => {
  const r = placeWord(spiderBoard(), S, pw('you'));
  if (!r.ok) throw new Error();
  expect(getSlot(r.board, S).head.wordId).toBe('you');
  expect(getSlot(r.board, S).originalHead.wordId).toBe('spider');
  expect(r.displaced.map(d => d.wordId)).toEqual(['spider']);
});
test('동사 슬롯에 명사를 놓으면 kindMismatch', () => {
  expect(placeWord(spiderBoard(), V, pw('you'))).toEqual({ ok: false, reason: 'kindMismatch' });
});
test('형용사는 주어 수식어의 빈 위치로, 꽉 차면 modifiersFull', () => {
  const a = placeWord(spiderBoard(), S, pw('blind', 2, 'a')); if (!a.ok) throw new Error();
  expect(getSlot(a.board, S).modifiers.map(m => m?.wordId ?? null)).toEqual(['venomous', 'blind']);
  expect(placeWord(a.board, S, pw('blind', 2, 'b'))).toEqual({ ok: false, reason: 'modifiersFull' });
});
test('같은 슬롯을 두 번 덮으면 앞서 놓은 플레이어 단어가 displaced', () => {
  const a = placeWord(spiderBoard(), S, pw('you', 2, 'a')); if (!a.ok) throw new Error();
  const b = placeWord(a.board, S, pw('scarecrow', 2, 'b')); if (!b.ok) throw new Error();
  expect(b.displaced).toEqual([expect.objectContaining({ instanceId: 'a' })]);
  expect(getSlot(b.board, S).originalHead.wordId).toBe('spider');
});
test('잉크 2인 단어는 두 번째 건조 때 원문으로 복귀', () => {
  const a = placeWord(spiderBoard(), S, pw('you')); if (!a.ok) throw new Error();
  const d1 = dryInk(a.board); expect(getSlot(d1.board, S).head.wordId).toBe('you'); expect(d1.dried).toHaveLength(0);
  const d2 = dryInk(d1.board); expect(getSlot(d2.board, S).head.wordId).toBe('spider');
  expect(d2.dried[0].word.wordId).toBe('you');
});
test('이미 원문인 슬롯을 revert해도 변화 없음', () => {
  const b = spiderBoard(); const r = revertSlot(b, S);
  expect(r.board).toEqual(b); expect(r.displaced).toEqual([]);
});
test('적 attach는 원문도 바꿔서 건조 후에도 남는다', () => {
  const e: PlacedWord = { wordId: 'fiercely', owner: 'enemy', inkLeft: null, instanceId: null, targetEntityId: null };
  const r = enemyAttach(spiderBoard(), V, e);
  expect(getSlot(r.board, V).originalModifiers[0]?.wordId).toBe('fiercely');
});
test('봉인된 슬롯에도 적 개입은 적용된다', () => {
  const sealed = sealSlot(spiderBoard(), S);
  const a = placeWord(sealed, S, pw('you')); if (!a.ok) throw new Error();
  expect(getSlot(revertSlot(a.board, S).board, S).head.wordId).toBe('spider');
});
```

- [ ] **Step 2:** `npm test -- board` 실행. Expected: FAIL
- [ ] **Step 3:** `board.ts`를 구현한다.
- [ ] **Step 4:** `npm test -- board` 실행. Expected: PASS
- [ ] **Step 5: render 테스트 작성 후 구현**

```ts
test('초기 거미 문장의 표시 토큰', () => {
  const nameOf = (w: PlacedWord) => getWord(w.wordId).text;
  const text = renderClause(buildBoard(ENCOUNTERS.spider.initialSentence, 2), 0, nameOf).map(t => t.text).join(' ');
  expect(text).toBe('독을 뿜는 거미 가 당신 을 물어뜯는다');
});
test('주어가 당신이면 조사가 이로 바뀐다', () => {
  const r = placeWord(buildBoard(ENCOUNTERS.spider.initialSentence, 2), { clause: 0, role: 'subject' }, pw('you'));
  if (!r.ok) throw new Error();
  const toks = renderClause(r.board, 0, w => getWord(w.wordId).text);
  expect(toks.find(t => t.kind === 'particle')?.text).toBe('이');
});
```

`renderClause`는 조사 토큰에 조사 부분만 담는다(`attachParticle(name, kind).slice(name.length)`). 수식어 → head → 조사 순서로 내보내고, 슬롯 순서는 문형 정의의 순서를 따른다.

- [ ] **Step 6:** `npm test -- board render` 실행. Expected: PASS
- [ ] **Step 7:** worklog를 기록하고 커밋한다: `feat(game): 문장 보드 배치·건조·개입 연산과 표시 토큰`

---

### Task 7: game/resolve — 타동 절 실행

**Files:**
- Create: `src/game/resolve/resolve.ts`, `src/game/combat/events.ts`
- Test: `src/game/resolve/resolve.test.ts`

**Interfaces:**
- Consumes: `Board`, `getSlot`, `Entity` 연산, `getWord`, `TOKENS`
- Produces:
  - `events.ts`:
    - `type RejectReason = 'kindMismatch' | 'modifiersFull' | 'notEnoughAp' | 'unplayable' | 'noTarget' | 'notPlayerTurn'`
    - `type FizzleReason = 'noSubject' | 'noObject' | 'frozen'`
    - `type CombatEvent =`
      - `{ type: 'placed'; at: SlotAddress; wordId: WordId; modifierIndex: number | null }`
      - `{ type: 'rejected'; reason: RejectReason; at: SlotAddress | null }`
      - `{ type: 'apSpent'; amount: number }`
      - `{ type: 'intervention'; step: InterventionStep }`
      - `{ type: 'clauseExecuted'; clause: number }`
      - `{ type: 'fizzled'; clause: number; reason: FizzleReason }`
      - `{ type: 'damaged'; entityId: string; amount: number; blocked: number; sourceId: string }`
      - `{ type: 'healed'; entityId: string; amount: number }`
      - `{ type: 'statusApplied'; entityId: string; status: StatusKind; amount: number }`
      - `{ type: 'poisonTick'; entityId: string; amount: number }`
      - `{ type: 'summoned'; entityId: string; tokenId: TokenId }`
      - `{ type: 'died'; entityId: string }`
      - `{ type: 'dried'; at: SlotAddress; wordId: WordId; modifierIndex: number | null }`
      - `{ type: 'polluted'; wordId: WordId; count: number }`
      - `{ type: 'drawn'; count: number; reshuffled: boolean }`
      - `{ type: 'intentRevealed'; step: InterventionStep }`
      - `{ type: 'combatEnded'; outcome: 'won' | 'lost' }`
  - `resolve.ts`:
    - `resolveTargets(word: PlacedWord, entities: readonly Entity[]): { ids: string[]; summon: TokenId | null }`: player는 `side==='ally' && defId==='player'`, chosenEnemy는 `targetEntityId`, enemyDef는 해당 defId의 살아 있는 적 전원, token은 해당 토큰이 있으면 그것, 없으면 `summon` 반환
    - `resolveClause(board: Board, clause: number, entities: readonly Entity[], newId: () => string): { entities: Entity[]; events: CombatEvent[] }`

**실행 규칙** (spec 1.3~1.6 중 이번 슬라이스 범위):
1. 주어와 목적어의 대상을 구한다. 토큰 소환이 필요하면 전열에 소환하고 `summoned` 이벤트를 낸다.
2. 살아 있는 주어가 없으면 `fizzled(noSubject)`, 목적어가 필요한 동작(damage, `to:'object'`)이 있는데 살아 있는 목적어가 없으면 `fizzled(noObject)`를 내고 끝낸다.
3. 주어가 빙결이면 빙결을 1 소모하고 `fizzled(frozen)`을 내고 끝낸다.
4. 배율 = 동사 슬롯 부사의 `powerMul` 곱. 피해에는 주어 슬롯 형용사의 `outgoingDamageMul` 곱도 곱한다. 모든 곱셈이 끝난 뒤 `Math.floor`.
5. 동작을 순서대로 적용한다. damage는 살아 있는 목적어 각자에게 적용하고, 주어 슬롯 형용사의 `onHitPoison`이 있으면 실제 피해(`dealt > 0`)를 입은 목적어에게 독을 건다. block/heal은 `to` 대상에게 배율을 적용한다. freeze는 `to` 대상에 빙결 1.
6. HP가 0이 된 개체마다 `died` 이벤트를 한 번 낸다. 이미 죽은 개체에게는 이후 효과를 적용하지 않는다.
7. 시작 시 `clauseExecuted`를 낸다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const player = () => createEntity({ id: 'p', defId: 'player', name: '탐험가', side: 'ally', hp: 60 });
const spider = () => createEntity({ id: 'e1', defId: 'spider', name: '거미', side: 'enemy', hp: 30 });
const board0 = () => buildBoard(ENCOUNTERS.spider.initialSentence, 2);
const S = { clause: 0, role: 'subject' } as const, O = { clause: 0, role: 'object' } as const, V = { clause: 0, role: 'verb' } as const;
const put = (b: Board, at: SlotAddress, wordId: WordId, extra: Partial<PlacedWord> = {}) => {
  const r = placeWord(b, at, { wordId, owner: 'player', inkLeft: 2, instanceId: wordId, targetEntityId: null, ...extra }); if (!r.ok) throw new Error(); return r.board;
};
let n = 0; const newId = () => `t${n++}`;
const hpOf = (es: Entity[], id: string) => es.find(e => e.id === id)!.hp;

test('초기 문장: 거미가 당신에게 피해 6 + 독 2', () => {
  const r = resolveClause(board0(), 0, [player(), spider()], newId);
  expect(hpOf(r.entities, 'p')).toBe(54);
  expect(r.entities.find(e => e.id === 'p')!.statuses.poison).toBe(2);
});
test('주어를 당신, 목적어를 지목(거미)으로: 거미가 6 피해, 독을 뿜는은 이제 내 공격에 붙는다', () => {
  let b = put(board0(), S, 'you'); b = put(b, O, 'mark', { targetEntityId: 'e1' });
  const r = resolveClause(b, 0, [player(), spider()], newId);
  expect(hpOf(r.entities, 'e1')).toBe(24); expect(r.entities.find(e => e.id === 'e1')!.statuses.poison).toBe(2);
  expect(hpOf(r.entities, 'p')).toBe(60);
});
test('격렬하게 + 눈먼 → floor(6 × 1.5 × 0.5) = 4', () => {
  let b = put(board0(), V, 'fiercely'); b = put(b, S, 'blind');
  const r = resolveClause(b, 0, [player(), spider()], newId);
  expect(hpOf(r.entities, 'p')).toBe(56);
});
test('목적어 허수아비는 없으면 소환되어 대신 맞는다', () => {
  const r = resolveClause(put(board0(), O, 'scarecrow'), 0, [player(), spider()], newId);
  expect(r.events).toContainEqual(expect.objectContaining({ type: 'summoned', tokenId: 'scarecrow' }));
  expect(r.entities.find(e => e.defId === 'scarecrow')!.hp).toBe(2); expect(hpOf(r.entities, 'p')).toBe(60);
});
test('막는다: 주어에게 보호 6', () => {
  const r = resolveClause(put(board0(), V, 'guard'), 0, [player(), spider()], newId);
  expect(r.entities.find(e => e.id === 'e1')!.statuses.block).toBe(6);
});
test('빙결된 주어는 불발하고 빙결을 소모', () => {
  const frozen = addStatus(spider(), 'freeze', 1);
  const r = resolveClause(board0(), 0, [player(), frozen], newId);
  expect(r.events).toContainEqual({ type: 'fizzled', clause: 0, reason: 'frozen' });
  expect(r.entities.find(e => e.id === 'e1')!.statuses.freeze).toBe(0);
});
test('목적어가 죽으면 died 한 번, 살아있는 목적어 없으면 불발', () => {
  let b = put(board0(), S, 'you'); b = put(b, O, 'mark', { targetEntityId: 'e1' });
  const weak = { ...spider(), hp: 3 };
  const r = resolveClause(b, 0, [player(), weak], newId);
  expect(r.events.filter(e => e.type === 'died')).toEqual([{ type: 'died', entityId: 'e1' }]);
  const again = resolveClause(b, 0, r.entities, newId);
  expect(again.events).toContainEqual({ type: 'fizzled', clause: 0, reason: 'noObject' });
});
```

- [ ] **Step 2:** `npm test -- resolve` 실행. Expected: FAIL
- [ ] **Step 3:** 실행 규칙대로 구현한다.
- [ ] **Step 4:** `npm test -- resolve` 실행. Expected: PASS
- [ ] **Step 5:** worklog를 기록하고 커밋한다: `feat(game): 타동 절 실행과 전투 이벤트 타입`

---

### Task 8: game/combat — 전투 reducer

**Files:**
- Create: `src/game/combat/combat.ts`
- Test: `src/game/combat/combat.test.ts`

**Interfaces:**
- Consumes: Task 2~7 전부
- Produces:
  - `interface CardInst extends CardInstance { readonly wordId: WordId }`
  - `interface CombatState { readonly encounterId: string; readonly turn: number; readonly phase: 'player' | 'won' | 'lost'; readonly entities: readonly Entity[]; readonly board: Board; readonly deck: DeckState<CardInst>; readonly ap: number; readonly loopIndex: number; readonly rng: RngState; readonly nextId: number }`
  - `type CombatAction = { type: 'place'; instanceId: string; at: SlotAddress; modifierIndex?: number; targetEntityId?: string } | { type: 'endTurn' }`
  - `startCombat(encounterId: string, deckWordIds: readonly WordId[], seed: number, balance: Balance): Reduced<CombatState, CombatEvent>`: 플레이어(`id 'p'`, defId `player`, name `탐험가`, hp `balance.playerMaxHp`)와 적을 만들고, 보드를 구성하고, 덱을 섞고, 첫 드로우와 첫 개입 예고(`intentRevealed`, loopIndex 0)를 수행한다.
  - `reduceCombat(state: CombatState, action: CombatAction, balance: Balance): Reduced<CombatState, CombatEvent>`
  - `currentIntent(state: CombatState): InterventionStep`

**place 처리**: phase가 `player`가 아니면 `rejected(notPlayerTurn)`, 손패에 없으면 `rejected(unplayable)`, cost가 null이면 `unplayable`이다. 비용은 `cost + (slot.sealed ? sealExtraCost : 0)`이고, 부족하면 `notEnoughAp`다. `chosenEnemy` 단어는 `targetEntityId`가 없을 때 살아 있는 적이 정확히 1이면 자동 지정하고, 아니면 `noTarget`이다. 성공하면 `placeWord` 결과를 반영하고 손패에서 빼며, displaced 중 플레이어 단어는 `instanceId`로 카드를 복원해 버림 더미로 보낸다. 그다음 `placed`, `apSpent` 이벤트를 낸다.

**endTurn 처리** (spec 1.7 중 이번 범위):
1. 손패 버림 → 2. 개입 `interventionLoop[loopIndex]` 적용(`intervention` 이벤트, displaced 플레이어 단어는 버림 더미로, pollute는 새 `CardInst`를 버림 더미에 추가) → 3. 모든 절을 순서대로 `resolveClause` → 4. `dryInk`(dried 단어는 카드로 복원해 버림 더미로, `dried` 이벤트) → 5. 모든 개체 `tickEndOfTurn`(`poisonTick`, 사망 시 `died`) → 6. 승패 판정: 플레이어 HP 0이면 `lost`(적 전멸과 동시여도 lost), 적이 전멸하면 `won`, `combatEnded` 후 종료 → 7. loopIndex를 루프 길이로 나머지 연산해 +1, `intentRevealed` → 8. turn +1, ap 충전, 드로우(`drawn`).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const start = () => startCombat('spider', STARTER_DECK, 123, BALANCE).state;
const handCard = (s: CombatState, wordId: WordId) => s.deck.hand.find(c => c.wordId === wordId);
const S = { clause: 0, role: 'subject' } as const;

test('시작: 손패 4, 행동력 3, 첫 예고는 주어 되돌림', () => {
  const s = start();
  expect(s.deck.hand).toHaveLength(4); expect(s.ap).toBe(3);
  expect(currentIntent(s)).toEqual({ kind: 'revert', at: S });
});
test('행동력이 부족하면 rejected(notEnoughAp)이고 상태 불변', () => {
  const s = { ...start(), ap: 0 }; const c = s.deck.hand[0];
  const r = reduceCombat(s, { type: 'place', instanceId: c.instanceId, at: S }, BALANCE);
  expect(r.state).toBe(s); expect(r.events).toEqual([{ type: 'rejected', reason: 'notEnoughAp', at: S }]);
});
test('같은 슬롯을 두 번 덮으면 행동력 2 소모, 첫 카드는 버림 더미로', () => {
  const s0 = { ...start(), deck: { drawPile: [], discardPile: [], hand: [
    { instanceId: 'a', wordId: 'you' }, { instanceId: 'b', wordId: 'scarecrow' }] } };
  const s1 = reduceCombat(s0, { type: 'place', instanceId: 'a', at: S }, BALANCE).state;
  const s2 = reduceCombat(s1, { type: 'place', instanceId: 'b', at: S }, BALANCE).state;
  expect(s2.ap).toBe(1); expect(s2.deck.discardPile.map(c => c.instanceId)).toEqual(['a']);
});
test('턴 종료: 예고된 주어 되돌림이 내 편집을 무효화한다', () => {
  const s0 = { ...start(), deck: { drawPile: [], discardPile: [], hand: [{ instanceId: 'a', wordId: 'you' }] } };
  const s1 = reduceCombat(s0, { type: 'place', instanceId: 'a', at: S }, BALANCE).state;
  const r = reduceCombat(s1, { type: 'endTurn' }, BALANCE);
  // 피해 6(물어뜯는다) 후 턴 종료 독 틱 2 → 52
  expect(r.state.entities.find(e => e.id === 'p')!.hp).toBe(52);
  expect(r.events.findIndex(e => e.type === 'intervention')).toBeLessThan(r.events.findIndex(e => e.type === 'clauseExecuted'));
});
test('3번째 개입은 오염: 버림 더미에 거미줄', () => {
  let s = start();
  for (let i = 0; i < 3; i++) s = reduceCombat(s, { type: 'endTurn' }, BALANCE).state;
  const all = [...s.deck.hand, ...s.deck.drawPile, ...s.deck.discardPile].map(c => c.wordId);
  expect(all.filter(w => w === 'web')).toHaveLength(1);
});
test('거미 HP를 0으로 만들면 won, 이후 행동은 notPlayerTurn', () => {
  const s0 = { ...start(), entities: start().entities.map(e => e.side === 'enemy' ? { ...e, hp: 1 } : e),
    deck: { drawPile: [], discardPile: [], hand: [{ instanceId: 'a', wordId: 'you' }, { instanceId: 'b', wordId: 'mark' }] }, ap: 3 };
  // 주어 되돌림을 피하려고 목적어만 지목으로 바꾸면 거미가 자기 자신을 문다
  const s1 = reduceCombat(s0, { type: 'place', instanceId: 'b', at: { clause: 0, role: 'object' } }, BALANCE).state;
  const r = reduceCombat(s1, { type: 'endTurn' }, BALANCE);
  expect(r.state.phase).toBe('won'); expect(r.events).toContainEqual({ type: 'combatEnded', outcome: 'won' });
  expect(reduceCombat(r.state, { type: 'endTurn' }, BALANCE).events[0]).toMatchObject({ type: 'rejected', reason: 'notPlayerTurn' });
});
test('플레이어와 적이 동시에 0이 되면 lost', () => {
  const base = start();
  const s0 = { ...base, entities: base.entities.map(e => ({ ...e, hp: e.side === 'enemy' ? 1 : 1,
    statuses: { ...e.statuses, poison: e.side === 'enemy' ? 5 : 0 } })) };
  const r = reduceCombat(s0, { type: 'endTurn' }, BALANCE);
  expect(r.state.phase).toBe('lost');
});
test('같은 시드와 행동이면 같은 결과', () => {
  const a = reduceCombat(start(), { type: 'endTurn' }, BALANCE).state;
  const b = reduceCombat(start(), { type: 'endTurn' }, BALANCE).state;
  expect(a).toEqual(b);
});
```

- [ ] **Step 2:** `npm test -- combat` 실행. Expected: FAIL
- [ ] **Step 3:** 구현한다. 카드 `instanceId`와 토큰 id는 `state.nextId`를 증가시키며 발급한다(`c{n}`, `t{n}`).
- [ ] **Step 4:** `npm test` 전체 실행. Expected: PASS
- [ ] **Step 5:** worklog를 기록하고 커밋한다: `feat(game): 전투 reducer(배치, 턴 종료, 개입, 승패)`

---

### Task 9: kit/fx와 app store — 이벤트 재생 연결

**Files:**
- Create: `src/kit/fx/effectPlayer.ts`, `src/app/useCombatStore.ts`
- Test: `src/kit/fx/effectPlayer.test.ts`

**Interfaces:**
- Consumes: `reduceCombat`, `startCombat`, `CombatEvent`
- Produces:
  - `type EffectHandler<E> = (event: E, speed: number) => Promise<void>`
  - `createEffectPlayer<E extends { type: string }>(handlers: Partial<Record<E['type'], EffectHandler<E>>>, options: { speed: number }): { play(events: readonly E[]): Promise<void>; isPlaying(): boolean; setSpeed(speed: number): void }`: 순서대로 await한다. 핸들러가 없는 이벤트는 건너뛴다. 핸들러가 throw해도 다음 이벤트를 계속 재생한다(console.error).
  - `useCombatStore(encounterId: string, seed: number): { state: CombatState; busy: boolean; dispatch(action: CombatAction): void; restart(seed?: number): void; lastEvents: readonly CombatEvent[] }`: `busy`가 true일 때 `dispatch`는 무시한다. 상태는 즉시 갱신하고, 이벤트는 `fxRegistry`(Task 11에서 채움)로 재생한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('이벤트를 순서대로 재생하고 핸들러 없는 이벤트는 건너뛴다', async () => {
  const log: string[] = [];
  const p = createEffectPlayer<{ type: 'a' | 'b' | 'c' }>({
    a: async () => { log.push('a'); }, c: async () => { log.push('c'); } }, { speed: 1 });
  await p.play([{ type: 'a' }, { type: 'b' }, { type: 'c' }]);
  expect(log).toEqual(['a', 'c']); expect(p.isPlaying()).toBe(false);
});
test('핸들러가 실패해도 다음 이벤트를 재생', async () => {
  const log: string[] = [];
  const p = createEffectPlayer<{ type: 'a' | 'b' }>({ a: async () => { throw new Error('x'); }, b: async () => { log.push('b'); } }, { speed: 1 });
  await p.play([{ type: 'a' }, { type: 'b' }]); expect(log).toEqual(['b']);
});
```

- [ ] **Step 2:** `npm test -- effectPlayer` 실행. Expected: FAIL
- [ ] **Step 3:** `effectPlayer.ts`와 `useCombatStore.ts`를 구현한다(store는 `useReducer` 대신 `useState`와 `useRef(player)` 조합으로 충분하다).
- [ ] **Step 4:** `npm test` 실행. Expected: PASS
- [ ] **Step 5:** worklog를 기록하고 커밋한다: `feat(kit): 연출 이벤트 큐와 전투 store`

---

### Task 10: 전투 화면 — 렌더와 클릭 배치

**Files:**
- Create: `src/game/ui/CombatScreen.tsx`, `Battlefield.tsx`, `SentenceBoard.tsx`, `SlotView.tsx`, `Hand.tsx`, `WordTile.tsx`, `IntentBadge.tsx`, `ApMeter.tsx`, `CombatResult.tsx`, `src/game/ui/describe.ts`
- Modify: `src/app/App.tsx`
- Test: `src/game/ui/describe.test.ts`

**Interfaces:**
- Consumes: `useCombatStore`, `renderClause`, `currentIntent`, `getWord`
- Produces:
  - `describeWord(def: WordDef): string`: 타일 하단 설명문. 예: `bite` → `"피해 6 (근접)"`, `fiercely` → `"동사 위력 ×1.5"`, `blind` → `"주는 피해 ×0.5"`, `web` → `"사용할 수 없다"`
  - `describeIntent(step: InterventionStep, nameOfRole: (r: SlotRole) => string): string`. 예: `revert(subject)` → `"↺ 주어를 원문으로 되돌림"`, `attach(verb, fiercely)` → `"＋ 동사에 [격렬하게]를 붙임"`, `pollute(web,1)` → `"☠ 덱에 [거미줄] 1장"`
  - DOM 테스트 훅: 슬롯 `data-testid="slot-{clause}-{role}"`, 손패 타일 `data-testid="tile-{wordId}"`, 턴 종료 버튼 `data-testid="end-turn"`, HP 표시 `data-testid="hp-{entityId}"`

**레이아웃** (Stitch `stitch/battle-v1.png`를 따름, 사이드바와 헤더 메뉴는 제외):
- 상단 전장: 동굴 배경(`/assets/bg-cavern.jpg`, 어둡게 처리), 왼쪽에 탐험가 초상화와 HP·보호·독, 오른쪽에 거미 초상화와 HP·상태, 거미 위에 `IntentBadge`
- 중단 "통사 제단": `renderClause` 토큰을 슬롯 카드와 조사 원형 배지로 표시한다. 슬롯 위에 역할 라벨(주어/목적어/술어)을 달고, 품사 색(형용사 teal = tertiary, 명사 ivory = on-surface, 동사 crimson = primary-container, 부사 amber = secondary)을 쓴다. 봉인된 슬롯에는 자물쇠 아이콘을, 플레이어 단어에는 남은 잉크 점(●)을 표시한다.
- 하단: `ApMeter`(잉크 방울 3개), 손패 `WordTile`(비용, 품사 태그, 단어, 설명), 덱/버림 수, "턴 종료" 버튼
- **클릭 배치**: 타일을 클릭하면 선택(위로 들림)되고, 놓을 수 있는 슬롯이 강조된다. 슬롯 head를 클릭하면 head에, 수식어 칸을 클릭하면 그 `modifierIndex`에 `place`를 dispatch한다. `지목`은 적이 둘 이상일 때 적 초상화를 클릭해 대상을 고른다(슬라이스에서는 자동 지정).
- 끝나면 `CombatResult` 오버레이를 띄운다("승리"/"패배", "다시 하기" → `restart()`)

- [ ] **Step 1:** `describe.test.ts`에 위 예시 6개를 그대로 assertion으로 작성한다. `npm test -- describe` 실행. Expected: FAIL
- [ ] **Step 2:** `describe.ts`를 구현한다. Expected: PASS
- [ ] **Step 3:** 컴포넌트를 구현하고 `App.tsx`에서 `CombatScreen encounterId="spider" seed={Date.now() % 1e9}`를 렌더한다(시드 표시를 화면 구석에 둔다).
- [ ] **Step 4:** `npm run dev`로 실행하고 Playwright MCP 또는 브라우저에서 확인한다. 초기 문장이 `독을 뿜는 거미 가 당신 을 물어뜯는다`로 보여야 한다. 당신 타일 → 주어 슬롯 클릭 시 조사가 "이"로 바뀌고 행동력이 2가 되어야 한다. 턴 종료 후 HP가 52가 되어야 한다(주어 되돌림 예고로 피해 6, 독 틱 2). 스크린샷을 `pilot-was-spoken/stitch/impl-task10.png`로 저장한다.
- [ ] **Step 5:** `npm run lint && npm test && npm run build`. Expected: 통과. worklog를 기록하고 커밋한다: `feat(game): 전투 화면 렌더와 클릭 배치`

---

### Task 11: 드래그 앤 드롭과 기본 연출, e2e

**Files:**
- Create: `src/kit/fx/primitives.ts`, `src/game/fx/inkEffects.ts`, `src/game/fx/registry.ts`, `tests/e2e/combat-slice.spec.ts`, `playwright.config.ts`
- Modify: `src/game/ui/Hand.tsx`, `SlotView.tsx`, `src/app/useCombatStore.ts`

**Interfaces:**
- Consumes: `createEffectPlayer`, `CombatEvent`
- Produces:
  - `kit/fx/primitives.ts`: `shake(el: HTMLElement, intensity: number, speed: number): Promise<void>`, `popNumber(anchor: HTMLElement, text: string, tone: 'damage' | 'heal' | 'block' | 'poison', speed: number): Promise<void>`, `flash(el: HTMLElement, color: string, speed: number): Promise<void>`. 모두 Web Animations API를 쓰고, `prefers-reduced-motion`이면 shake와 pop의 이동을 생략한다.
  - `game/fx/registry.ts`: `fxRegistry: Partial<Record<CombatEvent['type'], EffectHandler<CombatEvent>>>`. 요소는 `data-testid`/`data-entity-id`로 찾는다.

**이번에 넣을 연출** (spec 6장 중 슬라이스 범위, 나머지는 Plan 4):
| 이벤트 | 연출 |
|---|---|
| placed | 슬롯에 잉크 번짐(원형 clip-path 확장, 300ms). 단어는 `motion`으로 한 글자씩 나타난다. |
| rejected | 슬롯(또는 손패) shake 강도 4, 빨간 테두리 flash |
| intervention | 대상 슬롯에 붉은 테두리 flash와 펜 획 SVG 선(적 초상화 → 슬롯, stroke-dashoffset 400ms) |
| clauseExecuted | 문장 토큰을 왼쪽부터 순서대로 하이라이트(토큰당 80ms) |
| damaged | 대상 초상화 flash(흰색) + shake(강도 = min(12, 2 + amount/2)) + popNumber(`-n`, damage) |
| healed / statusApplied(block, poison) | popNumber(`+n` heal / `🛡n` block / `☠n` poison) |
| dried | 단어가 옅어지며 흩어지는 fade(300ms) |
| died | 초상화 grayscale + 아래로 녹아내리는 mask(600ms) |
| combatEnded | 결과 오버레이 페이드 인 |

- **드래그**: `@dnd-kit/core`의 `DndContext`를 쓴다. 타일은 `useDraggable`(드래그 중 `rotate(-4deg)`와 그림자), 슬롯 head와 수식어 칸은 `useDroppable`(id 형식 `{clause}:{role}:head` / `{clause}:{role}:m{index}`)이다. 드래그를 시작하면 kind가 맞는 슬롯만 강조한다. 놓으면 클릭 배치와 같은 `place`를 dispatch한다. 클릭 배치도 계속 지원한다.

- [ ] **Step 1: e2e 실패 테스트 작성** (`playwright.config.ts`의 `webServer`는 `npm run dev`, baseURL은 dev 서버. 시드를 고정하기 위해 `?seed=123` 쿼리를 `App.tsx`가 읽도록 한다)

```ts
test('당신을 주어에 놓고 턴을 끝내면 예고대로 되돌려져 내가 맞는다', async ({ page }) => {
  await page.goto('/?seed=123');
  await expect(page.getByTestId('slot-0-subject')).toContainText('거미');
  const you = page.getByTestId('tile-you').first();
  if (await you.count()) {
    await you.click(); await page.getByTestId('slot-0-subject').click();
    await expect(page.getByTestId('slot-0-subject')).toContainText('당신');
  }
  await page.getByTestId('end-turn').click();
  await expect(page.getByTestId('hp-p')).toContainText('52');
});
```

- [ ] **Step 2:** `npx playwright install chromium && npm run e2e` 실행. Expected: `?seed` 미지원이면 FAIL, 이미 통과하면 그대로 다음 단계로 간다.
- [ ] **Step 3:** `?seed` 처리, 드래그 앤 드롭, `primitives.ts`, `inkEffects.ts`, `registry.ts`를 구현하고 store에 연결한다.
- [ ] **Step 4:** `npm run e2e && npm test && npm run lint && npm run build` 실행. Expected: 모두 통과
- [ ] **Step 5:** 브라우저에서 드래그로 한 판을 끝까지 플레이해 연출이 순서대로 재생되는지, 재생 중 입력이 막히는지 확인한다. 스크린샷을 `pilot-was-spoken/stitch/impl-task11.png`로 저장한다.
- [ ] **Step 6:** worklog를 기록하고 커밋한다: `feat: 드래그 배치, 기본 전투 연출, 슬라이스 e2e`

---

### Task 12: 플레이 체크포인트

**Files:**
- Modify: `docs/lab/worklog/pilot-was-spoken.md`

- [ ] **Step 1:** `npm test && npm run lint && npm run e2e && npm run build` 전체 실행. Expected: 모두 통과
- [ ] **Step 2:** 사용자에게 `npm run dev`(포트 표시) 실행법과 함께 플레이를 요청한다. 다음 세 가지 질문에 대한 의견을 받는다.
  1. 문장을 고치는 손맛이 있었는가?
  2. 개입 예고를 피하는 퍼즐이 성립하는가?
  3. 잉크 건조 속도는 적당한가?
- [ ] **Step 3:** 받은 의견을 worklog 아래 "Plan 1 체크포인트" 절에 기록하고, Plan 2 작성에 반영할 항목을 목록으로 남긴다. 커밋 후 `git push -u origin main`.
