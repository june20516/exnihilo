/**
 * 엔진 테스트 전용 단어와 조우. 실제 콘텐츠는 밸런스 튜닝으로 바뀌므로 엔진 테스트는 여기에만 기댄다.
 * 테스트 파일에서만 import한다.
 */
import { RALLY_ENCOUNTERS } from '@/game/content/enemies'
import type { ClauseSpec } from '@/game/content/encounters'
import { WORDS, type WordDef, type WordId } from '@/game/content/words'

const testVerb = (id: WordId, text: string, kind: WordDef['kind'], effect: WordDef['effect']): WordDef => ({
  id, text, kind, effect, cost: 1, ink: 2, enemyOnly: true, rarity: 'common',
})

WORDS['testBite'] = testVerb('testBite', '물어뜯는다', 'verbTransitive', { type: 'verb', range: 'melee', actions: [{ kind: 'damage', amount: 7 }] })
WORDS['testNibble'] = testVerb('testNibble', '깨문다', 'verbTransitive', { type: 'verb', range: 'melee', actions: [{ kind: 'damage', amount: 3 }] })
WORDS['testCurl'] = testVerb('testCurl', '웅크린다', 'verbIntransitive', {
  type: 'verb', range: 'support', actions: [{ kind: 'block', amount: 8, to: 'subject' }],
})

export function intentClause(subject: WordId, verb: WordId): ClauseSpec {
  return {
    frameId: 'transitive',
    slots: [{ role: 'subject', head: subject }, { role: 'object', head: 'you' }, { role: 'verb', head: verb }],
  }
}

/** 거미(HP 30), 매 턴 물어뜯는다 7. */
RALLY_ENCOUNTERS['test-dummy'] = {
  id: 'test-dummy',
  name: '시험 거미',
  enemies: [{ defId: 'spider', name: '거미', hp: 30, row: 'front', portrait: '', intents: [intentClause('spider', 'testBite')] }],
}
/** 웅크린다(보호 8) → 물어뜯는다 7. */
RALLY_ENCOUNTERS['test-curl'] = {
  id: 'test-curl',
  name: '웅크리는 거미',
  enemies: [{
    defId: 'spider', name: '거미', hp: 30, row: 'front', portrait: '',
    intents: [intentClause('spider', 'testCurl'), intentClause('spider', 'testBite')],
  }],
}
/** 새끼 거미 둘(각 HP 10), 매 턴 깨문다 3. */
RALLY_ENCOUNTERS['test-pair'] = {
  id: 'test-pair',
  name: '새끼 거미 둘',
  enemies: [1, 2].map((n) => ({
    defId: 'spiderling', name: `새끼 거미 ${n}`, hp: 10, row: 'front' as const, portrait: '', intents: [intentClause('spiderling', 'testNibble')],
  })),
}
