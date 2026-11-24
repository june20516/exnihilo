# 문장 던전 Plan 8: 표시와 조작 정돈 Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 날것의 줄글을 엔진 구조값 + 아이콘·칩·툴팁으로 바꾸고, 단어 하나씩 빼기·손패 겹침·폰트 토큰·모바일 가로 레이아웃을 넣는다.

**Architecture:** 엔진(rally, run, ui/describe)이 구조화된 값(종류, 수치, 출처 이름)을 내고 화면은 그것만 그린다. 구조값은 vitest 단위 테스트로, 화면은 Playwright e2e로 검증한다(vitest는 node 환경이라 DOM이 없다). 툴팁은 컴포넌트 하나(`ui/Tooltip.tsx`)를 모든 곳이 쓰고, 레이아웃은 하나를 화면 높이에 비례해 줄인다.

**Tech Stack:** React 19, Tailwind v4, dnd-kit(Pointer + Touch 센서), Vitest, Playwright(뷰포트·터치 에뮬레이션)

**Spec:** `docs/suberpowers/specs/2026-11-24-pilot-was-spoken-v3-display-design.md` (규칙은 `…-v3-rules-design.md`, Plan 7로 구현 완료)

## Global Constraints

- 규칙을 바꾸지 않는다. 기본 랠리 게이트와 런 게이트 수치가 Plan 7 결과와 같아야 한다(`npx vitest run src/game/sim/balanceGate.test.ts` 통과).
- `any`와 `Math.random` 금지. 엔진 디렉터리는 React를 import하지 않는다. kit은 game을 import하지 않는다.
- 화면 이름(서고, 망각, 낭독 등)은 바꾸지 않는다. 화면 문구, 주석, 테스트 이름은 한국어로 쓴다.
- **시트·서랍·모달 금지**: 추가 정보는 `ui/Tooltip.tsx` 툴팁으로만 보인다. 상점·결과·덱 편집만 화면 단위로 둔다.
- **툴팁 열기**: 마우스를 올리면 열린다. 터치는 탭으로 열고 바깥 탭으로 닫는다. 탭이 선택에 쓰이는 카드는 길게 누르면(500ms) 열린다.
- **폰트 토큰**: `--font-card` Song Myung, `--font-prose` Hahmlet, `--font-ui` Pretendard, `--font-number` Do Hyeon. 컴포넌트는 토큰 클래스(`font-card`, `font-prose`, `font-ui`, `font-number`)만 쓴다. Noto Serif KR과 Space Grotesk는 지운다.
- **아이콘**: Material Symbols Outlined. 상태·행동 종류별 아이콘은 `ui/icons.ts` 표 하나에서만 정한다.
- **한 화면**: 1440×900, 1280×720, 844×390에서 스크롤이 없다. 390×844(세로)에서는 "가로로 돌려 주세요" 안내만 보인다.
- **확장 가능한 구조(사용자 규칙)**: 아이콘·색·문구 표는 종류(kind)로 찾는다. 특정 단어·유물·적 id로 분기하지 않는다. 수치는 규칙 값(`content/balance.ts`)에서 읽는다.
- 명령(모두 `pilot-was-spoken/`에서): `npx tsc -b`, `npx oxlint`, `npx vitest run`, `npx playwright test`
- Minor도 그 자리에서 고친다(사용자 규칙).

## Review Focus

1. 손패가 8장 이상(손패 구조를 샀을 때)일 때 1280×720과 844×390에서 겹친 손패가 화면 밖으로 나가지 않고, 마우스를 올린 카드나 고른 카드가 이웃에 가리지 않아야 한다.
2. 놓은 단어를 빼는 동안 연출이 재생 중(busy)이면 아무 일도 일어나지 않아야 한다. 봉인된 칸의 단어는 뺄 수 없어야 한다(봉인 칸에는 놓을 수도 없으므로 해당 없음을 확인).
3. 툴팁이 화면 가장자리(맨 오른쪽 적, 맨 아래 손패)에서 열릴 때 화면 밖으로 잘리지 않아야 한다.
4. 둘째 절이 열린 상태(연결어)에서 둘째 절의 단어를 빼도 첫째 절과 연결어가 그대로여야 하고, 계산식·미리보기가 즉시 갱신돼야 한다.
5. 터치 기기에서 길게 누르기(툴팁)와 탭(선택), 드래그(배치)가 서로를 잘못 일으키지 않아야 한다.

---

### Task 1: 엔진 — 단어 빼기(`unplace`)와 막는다 문구

**Files:**
- Modify: `src/game/rally/combat.ts`, `src/game/combat/events.ts`, `src/game/rally/text.ts`(`sentenceText`), `src/game/play/textPlay.ts`, `src/game/sim/combatGame.ts`(합법 행동은 그대로: 봇은 빼기를 쓰지 않음)
- Test: `src/game/rally/combat.test.ts`, `src/game/rally/text.test.ts`, `src/game/play/textPlay.test.ts`

**Interfaces:**
- Produces:
  - `RallyAction`에 `{ type: 'unplace'; at: SlotAddress; modifierIndex?: number }`
  - `CombatEvent`에 `{ type: 'unplaced'; at: SlotAddress; wordId: WordId; modifierIndex: number | null }`
  - 거절 사유: 빈칸·빈 수식어 칸 → `'unplayable'`, 봉인 칸 → `'slotSealed'`
  - 텍스트 플레이 명령 `take <절#> <주어|목적어|동사> [칸#]`

- [ ] **Step 1: 실패하는 테스트 작성**
  - combat.test
    - 'unplace: head를 빼면 손패로 돌아오고 같은 칸의 수식어는 남는다'
    - 'unplace: 수식어를 빼면 손패로 돌아온다'
    - 'unplace: 기본 동사를 빼면 손패에 들어가지 않고 다시 놓을 수 있다'
    - 'unplace: 빈칸을 빼려 하면 unplayable로 거절된다'
    - 'unplace: 둘째 절 단어를 빼도 첫째 절과 연결어는 그대로다'
  - 카드 보존 속성 테스트(test-pair, test-seal): 무작위 행동 목록에 `unplace`(무작위 절·역할·칸)를 더한다.
  - text.test
    - '지원 동사의 빈 목적어가 주어와 같으면 목적어를 생략한다: "당신이 막는다"'
    - '목적어를 직접 놓으면 쓴다: "당신이 허수아비를 막는다"'
  - textPlay.test: 'take 1 동사로 놓은 동사를 손패로 되돌린다'
- [ ] **Step 2: 실패 확인**: `npx vitest run src/game/rally src/game/play`
  - Expected: FAIL. `unplace` 액션과 `take` 명령이 없다.
- [ ] **Step 3: 구현**
  - `sentence/board.ts`의 기존 `revertAll` 계열 함수를 참고해, 한 칸(head 또는 수식어 하나)을 빈칸으로 되돌리는 순수 함수 `revertOne(board, at, modifierIndex?)`를 추가한다. 반환은 `{ board, removed: PlacedWord | null }`.
  - 돌려받은 카드는 `cardsFrom`으로 손패에 넣는다. 기본 동사는 `cardsFrom`이 걸러 낸다.
  - 막는다 문구: `sentenceText`가 materialize한 보드를 렌더할 때, 지원 동사 절의 목적어가 빈칸(owner blank)이고 해석 대상이 주어와 같으면 목적어 토큰을 뺀다.
- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx vitest run`
  - Expected: PASS
- [ ] **Step 5: Commit**: `feat(pilot-was-spoken): 놓은 단어 하나씩 빼기, 막는다 문구`

### Task 2: 엔진 — 카드·계산식 구조값

**Files:**
- Modify: `src/game/ui/describe.ts`(구조값 함수는 여기에 두고 기존 `describeWord`는 구조값을 글로 바꾸는 래퍼로 남긴다), `src/game/rally/formula.ts`, `src/game/rally/formulaText.ts`, `src/game/run/labels.ts`
- Test: `src/game/ui/describe.test.ts`, `src/game/rally/preview.test.ts`(계산식 묶음), `src/game/run/labels.test.ts`

**Interfaces:**
- Produces:
  - `type FactKind = 'damage' | 'block' | 'heal' | 'poison' | 'weak' | 'vulnerable' | 'strength' | 'freeze' | 'hpLoss' | 'grow' | 'cleanse' | 'recall' | 'counter' | 'outMul' | 'outFlat' | 'inMul' | 'inFlat' | 'selfDamage' | 'power' | 'repeat' | 'again' | 'persist' | 'target' | 'summon' | 'connective' | 'junk'`
  - `interface CardFact { readonly kind: FactKind; readonly text: string; readonly value: number | null; readonly base: number | null; readonly to: 'subject' | 'object' | null }`. base는 강화 전 값이다. 강화하지 않았으면 null이다.
  - `interface CardFacts { readonly facts: readonly CardFact[]; readonly tone: 'attack' | 'support' | 'modifier' | 'target' | 'other'; readonly badges: readonly string[] }`. 배지 예: '적 차례까지', '1턴 유지', '자동사'.
  - `export function cardFacts(wordId: WordId, build: BuildState): CardFacts`
  - `describeWord(def)`의 기존 출력은 그대로 유지한다(텍스트 플레이·기존 테스트 호환).
  - `FormulaTerm`에 `readonly sources: readonly string[]`(출처 이름). `ClauseCalc`에 `readonly baseSource: string`(동사 문구, 되받아친다면 '보호')
    - 출처 규칙
      - 부사 배율: 그 동사 칸의 부사 문구(빌려 온 것 포함)
      - 유물 가산: 그 가산을 낸 유물 이름
      - 그래서: '그래서'
      - 사슬: 수식의 사슬 효과를 가진 유물 이름
      - 슬롯 배율·가산: 그 칸 형용사 문구
      - 힘·약화·취약: 상태 이름
  - `cardText`(labels)와 상점 강화 상품 설명은 '피해 10→13'처럼 base→value를 쓴다.
- [ ] **Step 1: 실패하는 테스트 작성**
  - describe.test
    - "cardFacts('slash', 강화 1단계): damage 15, base 10, tone attack"
    - "cardFacts('guard'): block 6, to subject, 배지 '1턴 유지', tone support"
    - "cardFacts('cracked'): inMul 1.5, 배지 '적 차례까지', tone modifier"
    - "cardFacts('counter'): counter 사실 하나, tone attack"
  - preview.test(계산식): "[격렬하게] 물어뜯는다의 계산식 항 출처: 동사 '물어뜯는다', 배율 항 sources ['격렬하게']"
  - "긴 문장 유물이 있으면 가산 항 sources에 '긴 문장'"
  - labels.test: "강화한 벤다의 cardText는 '피해 10→15'를 포함"
- [ ] **Step 2: 실패 확인**: `npx vitest run src/game/ui src/game/rally/preview.test.ts src/game/run/labels.test.ts`
  - Expected: FAIL. `cardFacts`와 `sources`가 없다.
- [ ] **Step 3: 구현**: 위 인터페이스대로. 사실 문구(text)는 기존 `describeAction`·`describeAdjective`·`describeAdverb` 문구를 재사용한다.
- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx vitest run`
  - Expected: PASS
- [ ] **Step 5: Commit**: `feat(pilot-was-spoken): 카드 설명·계산식 구조값(강화 전후, 출처)`

### Task 3: 엔진 — 미리보기·예고·증폭 요소·서고 구조값

**Files:**
- Create: `src/game/rally/summary.ts`
- Test: `src/game/rally/summary.test.ts`

**Interfaces:**
- Consumes: `previewEvents`(preview.ts), `CardFacts`(Task 2)
- Produces (`summary.ts`)
  - `interface EntityChange { readonly id: string; readonly name: string; readonly side: Side; readonly hpBefore: number; readonly hpAfter: number; readonly maxHp: number; readonly chips: readonly ChangeChip[]; readonly died: boolean }`
  - `type ChangeChip = { readonly kind: 'damage' | 'blocked' | 'heal' | 'hpLoss' | 'grow' | 'block' | 'poison' | 'weak' | 'vulnerable' | 'strength' | 'freeze' | 'cleanse' | 'emptyDraw' | 'summoned'; readonly amount: number; readonly holds?: number }`
  - `export function previewSummary(state: RallyState): { mine: EntityChange[]; enemy: EntityChange[] }`: 변화가 있는 개체만 넣는다. 둘 다 비면 화면은 "변화 없음"을 보인다.
  - `type IntentAction = { readonly kind: 'attack'; readonly amount: number; readonly target: string } | { readonly kind: 'block'; readonly amount: number; readonly holds: number } | { readonly kind: 'seal'; readonly role: SlotRole; readonly fizzled: boolean } | { readonly kind: 'status'; readonly status: AppliedStatus; readonly amount: number } | { readonly kind: 'grow'; readonly amount: number } | { readonly kind: 'fizzled' }`
  - `export function intentActions(state: RallyState): Record<string, IntentAction[]>`: 수치는 `previewEvents(state).enemy`에서 그 적이 낸 이벤트로 계산한다. 그래서 미리보기와 같다.
  - `interface Amplifier { readonly kind: 'relic' | 'structure' | 'upgrade' | 'status'; readonly name: string; readonly text: string }`
  - `export function amplifiers(state: RallyState): Amplifier[]`: 유물, 구조(칸·손패·버리기), 강화 단어(단계), 내 상태(힘·약화·취약)
  - `export function pileContents(state: RallyState): { draw: { wordId: WordId; count: number }[]; discard: WordId[]; emptyDrawHpLoss: number }`: 서고는 단어별로 묶어 정렬하고, 망각은 들어간 순서대로 둔다.
- [ ] **Step 1: 실패하는 테스트 작성** (`summary.test.ts`, testFixtures 사용)
  - 'previewSummary: 물어뜯는다 → 적 34→28, damage 6 칩'
  - 'previewSummary: 막는다 → 내 block 6 holds 1 칩, 적 차례 damage 7 / blocked 6'
  - 'previewSummary: 처치면 died true'
  - 'previewSummary: 동사가 없으면 mine은 비어 있다'
  - 'intentActions: test-dummy는 attack 7, test-curl 첫 턴은 block 8 holds 0, test-seal은 seal subject'
  - 'intentActions 수치는 previewEvents 적 차례 피해와 같다(막는다를 놓은 뒤 attack 7, 실제 HP 손실 1)': 공격 수치는 막기 전 값이다. 막은 양은 미리보기 칩이 보인다.
  - 'amplifiers: 유물 2개와 강화 1개, 구조 기본값은 넣지 않는다(바뀐 것만)'
  - 'pileContents: 서고는 단어별 장수, 망각은 순서, emptyDrawHpLoss는 규칙 값'
- [ ] **Step 2: 실패 확인**: `npx vitest run src/game/rally/summary.test.ts`
  - Expected: FAIL(모듈 없음)
- [ ] **Step 3: 구현**: 이벤트 → 칩 변환은 `lines.ts`의 이벤트 해석과 같은 규칙을 따른다. 기존 `lines.ts`·`intentTexts`는 텍스트 플레이용으로 유지한다.
- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx vitest run`
  - Expected: PASS
- [ ] **Step 5: Commit**: `feat(pilot-was-spoken): 미리보기·예고·증폭 요소·서고 구조값`

### Task 4: 폰트 토큰, 아이콘 표, 툴팁 컴포넌트

**Files:**
- Modify: `index.html`, `src/app/theme.css`, `font-headline`·`font-body`·`font-label`을 쓰는 모든 컴포넌트(`grep -rln "font-headline\|font-body\|font-label" src`)
- Create: `src/game/ui/icons.ts`, `src/game/ui/Tooltip.tsx`
- Test: `tests/e2e/display.spec.ts`(생성)

**Interfaces:**
- Produces
  - Tailwind 토큰 `--font-card`, `--font-prose`, `--font-ui`, `--font-number`. 클래스 `font-card`, `font-prose`, `font-ui`, `font-number`. body 기본 글꼴은 `font-ui`다.
  - `ICONS: Record<FactKind | ChangeChip['kind'] | IntentAction['kind'] | Amplifier['kind'], string>`(Material Symbols 이름)
  - `<Tooltip content={ReactNode} testId?: string longPress?: boolean>{children}</Tooltip>`
    - 마우스 올림, 탭, 길게 누르기(`longPress`)로 연다.
    - 바깥 탭이나 Esc로 닫는다.
    - 화면 가장자리에서는 반대쪽으로 뒤집어 화면 안에 둔다.
    - 툴팁 본체 testid는 `tooltip`이다.
- [ ] **Step 1: 실패하는 e2e 작성** (`display.spec.ts`, 1440×900, `?mode=rally&seed=5`)
  - '폰트 토큰: 카드 단어는 Song Myung, 버튼은 Pretendard, 계산식 결과는 Do Hyeon': `getComputedStyle(...).fontFamily`에 이름이 포함된다.
  - '툴팁: 서고 숫자에 마우스를 올리면 tooltip이 화면 안에 뜬다'. 서고 툴팁 내용은 Task 5에서 채우고, 여기서는 열림만 본다.
- [ ] **Step 2: 실패 확인**: `npx playwright test tests/e2e/display.spec.ts`
  - Expected: FAIL
- [ ] **Step 3: 구현**
  - `index.html`의 폰트 링크를 Song Myung, Hahmlet, Do Hyeon(Google Fonts), Pretendard(jsdelivr `pretendard@v1.3.9 static`)로 바꾼다.
  - 옛 토큰 클래스를 새 토큰으로 옮긴다: 카드 단어·슬롯 단어는 card, 제목·예고·결과 문구는 prose, 숫자(HP·계산식 결과·가격)는 number, 나머지는 ui.
- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx oxlint && npx playwright test`
  - Expected: 모두 PASS(기존 e2e 포함)
- [ ] **Step 5: Commit**: `feat(pilot-was-spoken): 폰트 토큰 네 개, 아이콘 표, 툴팁 컴포넌트`

### Task 5: 전투 화면 — 손패 겹침, 단어 빼기, 툴팁(서고·망각·상태·카드)

**Files:**
- Modify: `src/game/ui/Hand.tsx`, `src/game/ui/WordTile.tsx`, `src/game/ui/SlotView.tsx`, `src/game/ui/SentenceBoard.tsx`, `src/game/ui/CombatScreen.tsx`, `src/game/ui/ControlPanel.tsx`, `src/game/ui/EntityCard.tsx`
- Test: `tests/e2e/display.spec.ts`, `tests/e2e/combat-slice.spec.ts`

**Interfaces:**
- Consumes: Task 1 `unplace`, Task 2 `cardFacts`, Task 3 `pileContents`, Task 4 `Tooltip`·`ICONS`
- Produces: testid `pile-draw`, `pile-discard`(툴팁 앵커), `status-<entityId>-<kind>`(상태 배지)

- [ ] **Step 1: 실패하는 e2e 작성**
  - '손패 겹침: 이웃과 겹쳐 놓이고, 마우스를 올린 카드는 elementFromPoint로 중심이 자기 자신이다': 겹침은 bounding box 교차로 확인한다.
  - '손패 9장(손패 구조 3회)도 1280×720에서 화면 안에 있다': `?mode=rally`에 빌드를 주입할 수 없으면 덱 편집으로 15장을 넣고 손패 수를 확인한다. 불가능하면 Ruling으로 기록한다.
  - '놓은 단어를 누르면 손패로 돌아온다(고른 카드가 없을 때)'
  - '고른 카드가 있을 때 칸을 누르면 바꿔 놓는다(기존 동작 유지)'
  - '놓은 단어를 판 밖으로 끌면 손패로 돌아온다'
  - '서고 툴팁은 단어별 장수를, 망각 툴팁은 버린 순서를 보인다'
  - '상태 배지에 마우스를 올리면 이름·뜻·지속이 툴팁으로 뜬다(형용사 상태 포함)'
  - '카드에 마우스를 올리면 설명 툴팁이 뜨고, 강화 카드는 base→value를 보인다': 카드 본문은 아이콘과 수치로 짧게 보인다.
- [ ] **Step 2: 실패 확인**: `npx playwright test tests/e2e/display.spec.ts`
  - Expected: FAIL
- [ ] **Step 3: 구현**
  - **손패 겹침**
    - 카드 수에 따라 음수 margin을 둔다. 손패 영역 폭에서 계산하는 CSS `--overlap` 변수를 쓴다.
    - 마우스를 올리거나 고른 카드는 z-index를 올리고 위로 띄운다.
    - 기본 동사 타일은 손패 밖 고정 자리에 둔다.
  - **단어 빼기**: 놓인 단어 요소에 `useDraggable`을 둔다. 판 밖에 놓으면 `unplace`, 클릭하면(고른 카드가 없을 때) `unplace`다.
  - **카드 본문**: `cardFacts`를 아이콘·수치 칩으로 그리고, 배지를 단다. tone은 색으로 보인다.
- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx oxlint && npx playwright test`
  - Expected: PASS
- [ ] **Step 5: Commit**: `feat(pilot-was-spoken): 손패 겹침, 단어 빼기, 서고·망각·상태·카드 툴팁`

### Task 6: 전투 화면 — 미리보기·계산식·예고·증폭 요소 시각화와 배치, 적 초상화

**Files:**
- Modify: `src/game/ui/SidePanel.tsx`, `src/game/ui/CombatScreen.tsx`, `src/game/ui/Battlefield.tsx`, `src/game/ui/EntityCard.tsx`, `src/game/ui/ShopScreen.tsx`(강화 상품 base→value)
- Create: `src/game/ui/AmplifierPanel.tsx`, `src/game/ui/FormulaChips.tsx`, `src/game/ui/PreviewList.tsx`
- Assets: `public/assets/spider.jpg`(필요 시)
- Test: `tests/e2e/display.spec.ts`, `tests/e2e/combat-slice.spec.ts`, `tests/e2e/run.spec.ts`

**Interfaces:**
- Consumes: Task 2 `ClauseCalc.sources/baseSource`, Task 3 `previewSummary`·`intentActions`·`amplifiers`
- Produces: testid `preview-mine`, `preview-enemy`(유지), `formula`(유지), `formula-term`, `intent-<id>`(유지, 문장 + 행동 칩), `amplifiers`

- [ ] **Step 1: 실패하는 e2e 작성**
  - '미리보기는 개체별 HP "34 → 28"과 피해 칩을 보인다'
  - '계산식은 항마다 출처 칩을 보인다: 물어뜯는다 6 · 격렬하게 ×1.5 → 9'
  - '적 예고는 문장과 행동 칩(공격 14 등)을 함께 보인다'
  - '증폭 요소 패널이 늘 보이고, 유물이 없으면 "없음"'
  - '1440×900, 1280×720에서 스크롤 없음': 기존 `expectInViewport` 목록에 `amplifiers`, `pile-draw`를 더한다.
  - '적 초상화 위 이름에 이미지 글자가 겹치지 않는다': 이미지 crop이 적용된 `object-position`을 확인하거나, 교체한 이미지를 확인한다. 검증 방법은 Ruling으로 남긴다.
- [ ] **Step 2: 실패 확인**: `npx playwright test`
  - Expected: 새 테스트 FAIL
- [ ] **Step 3: 구현**
  - 배치: 문장판 위아래 여백을 줄인다. 계산식은 문장판 바로 아래, 미리보기는 오른쪽, 증폭 패널과 서고·망각은 왼쪽 아래에 둔다.
  - 초상화: 글자가 박힌 아래 띠가 보이지 않게 `object-position`과 높이로 자른다. 잘리지 않으면 이미지를 위쪽만 남기도록 다시 자른다(sips/ImageMagick 등). 원본은 `public/assets/originals/`에 보존한다.
- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx oxlint && npx vitest run && npx playwright test`
  - Expected: PASS
- [ ] **Step 5: 화면 캡처**: 1440×900, 1280×720 캡처를 `docs/lab/playtest/screens/v3-*.png`로 남긴다.
- [ ] **Step 6: Commit**: `feat(pilot-was-spoken): 미리보기·계산식·예고·증폭 요소 시각화와 배치`

### Task 7: 모바일 가로 레이아웃

**Files:**
- Modify: `src/app/theme.css`, `src/app/App.tsx`, `src/game/ui/*.tsx`(크기 단위), `src/game/ui/CombatScreen.tsx`(TouchSensor)
- Create: `src/game/ui/RotateNotice.tsx`
- Test: `tests/e2e/mobile.spec.ts`(생성)

**Interfaces:**
- Produces: testid `rotate-notice`. 크기 토큰(`--tile-h` 등)은 `clamp()`와 `dvh`로 둔다.

- [ ] **Step 1: 실패하는 e2e 작성** (`mobile.spec.ts`)
  - '390×844 세로: rotate-notice만 보이고 hand는 보이지 않는다'
  - '844×390 가로(hasTouch, isMobile): 늘 보이는 요소(cast, end-turn, hand, formula, preview-mine, preview-enemy, pile-draw, amplifiers, intent-e0)가 모두 화면 안에 있고 스크롤이 없다'
  - '844×390: 카드 탭 → 칸 탭으로 배치된다'
  - '844×390: 카드를 길게 누르면 설명 툴팁이 화면 안에 뜬다'
  - '844×390: 상점 화면도 스크롤 없이 보상 3개와 새로고침·다음 층 버튼이 보인다'
- [ ] **Step 2: 실패 확인**: `npx playwright test tests/e2e/mobile.spec.ts`
  - Expected: FAIL
- [ ] **Step 3: 구현**
  - `@media (orientation: portrait)`에서 게임 대신 안내를 보인다.
  - 루트 높이는 `100dvh`로 둔다.
  - 카드·슬롯·글자 크기는 `clamp(최소, vh 비례, 최대)`로 한 레이아웃을 줄인다.
  - dnd-kit에 `TouchSensor`(delay 150ms, tolerance 6)를 더한다. 길게 누르기(500ms)와 겹치지 않게, 움직임이 있으면 툴팁 타이머를 취소한다.
- [ ] **Step 4: 통과 확인**: `npx tsc -b && npx oxlint && npx vitest run && npx playwright test`
  - Expected: PASS(데스크탑 e2e 포함)
- [ ] **Step 5: 화면 캡처**: 844×390 캡처를 `docs/lab/playtest/screens/v3-mobile.png`로 남긴다.
- [ ] **Step 6: Commit**: `feat(pilot-was-spoken): 모바일 가로 레이아웃과 터치 입력`
