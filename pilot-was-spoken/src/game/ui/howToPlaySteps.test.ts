import { HOW_TO_PLAY_STEPS, HOW_TO_PLAY_STORAGE_KEY, hasSeenHowToPlay, markHowToPlaySeen } from './howToPlaySteps'

/** 브라우저 저장소 대신 쓰는 메모리 저장소. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('조작 안내', () => {
  it('처음 온 사람은 안내를 아직 보지 않았다', () => {
    expect(hasSeenHowToPlay(memoryStorage())).toBe(false)
  })

  it('한 번 닫으면 다음 방문부터는 본 것으로 기억한다', () => {
    const storage = memoryStorage()
    markHowToPlaySeen(storage)
    expect(hasSeenHowToPlay(storage)).toBe(true)
  })

  it('저장소를 쓸 수 없으면(사생활 보호 모드 등) 안내를 띄우고 오류를 내지 않는다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }
    expect(hasSeenHowToPlay(broken)).toBe(false)
    expect(() => markHowToPlaySeen(broken)).not.toThrow()
  })

  it('다른 값이 들어 있으면 본 것으로 치지 않는다', () => {
    expect(hasSeenHowToPlay(memoryStorage({ [HOW_TO_PLAY_STORAGE_KEY]: 'x' }))).toBe(false)
  })

  it('안내는 다섯 장이고, 장마다 제목과 설명이 있다', () => {
    expect(HOW_TO_PLAY_STEPS).toHaveLength(5)
    for (const step of HOW_TO_PLAY_STEPS) {
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.lines.length).toBeGreaterThan(0)
    }
  })

  it('화면에 보이는 버튼 이름(낭독, 턴 종료, 버리기, 미리보기)을 그대로 써서 설명한다', () => {
    const text = HOW_TO_PLAY_STEPS.flatMap((s) => s.lines).join(' ')
    for (const label of ['낭독', '턴 종료', '버리기', '미리보기']) expect(text).toContain(label)
  })
})
