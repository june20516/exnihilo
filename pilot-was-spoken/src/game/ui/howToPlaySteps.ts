/**
 * 게임 시작 때 보여 주는 조작 안내. 처음 하는 사람이 읽는 글이라, 화면에 보이는 이름(버튼, 칸 이름)만 쓰고 개발용 말은 쓰지 않는다.
 */
export interface HowToPlayStep {
  /** Material Symbols 아이콘 이름. */
  readonly icon: string
  readonly title: string
  readonly lines: readonly string[]
}

export const HOW_TO_PLAY_STEPS: readonly HowToPlayStep[] = [
  {
    icon: 'menu_book',
    title: '단어로 문장을 만들어 싸웁니다',
    lines: ['단어 카드로 문장을 만들면, 그 문장대로 일이 일어납니다.', '적을 모두 쓰러뜨리면 다음 층으로 갑니다. 7층까지 올라가면 승리, HP가 0이 되면 패배입니다.'],
  },
  {
    icon: 'pest_control',
    title: '적이 무엇을 할지 먼저 보입니다',
    lines: ['적 그림 위의 빨간 글은 그 적이 이번 턴에 할 행동입니다.', '적이 여럿이면 노리고 싶은 적 그림을 눌러 고르세요. 고른 적에 "대상" 표시가 붙습니다.'],
  },
  {
    icon: 'drag_pan',
    title: '아래 카드를 가운데 칸에 놓습니다',
    lines: [
      '카드를 끌어서 문장 칸에 놓으세요. 카드를 누른 다음 칸을 눌러도 됩니다. 놓을 수 있는 칸은 노란 테두리로 빛납니다.',
      '"동사" 칸은 꼭 채워야 합니다. 맨 왼쪽 "때린다"는 카드가 없어도 매 턴 쓸 수 있습니다.',
      '단어 옆 "+" 칸에는 꾸미는 말을 붙입니다. 놓은 카드는 다시 누르면 손으로 돌아옵니다.',
    ],
  },
  {
    icon: 'campaign',
    title: '낭독을 누르면 문장이 실행됩니다',
    lines: [
      '문장이 완성되면 오른쪽 아래 "낭독"을 누르세요. 문장대로 일이 일어나고, 이어서 적이 행동한 뒤 다음 턴이 됩니다.',
      '낭독은 한 턴에 한 번입니다. 할 것이 없으면 "턴 종료", 손에 든 카드가 마음에 들지 않으면 "버리기"로 바꿀 수 있습니다.',
    ],
  },
  {
    icon: 'help',
    title: '모르겠으면 올려 보세요',
    lines: [
      '카드에 마우스를 올리면 설명이 나옵니다. 휴대폰에서는 카드를 길게 누르세요.',
      '문장판 오른쪽 "미리보기"를 열면 낭독했을 때의 결과를 먼저 볼 수 있습니다.',
      '이 안내는 위쪽 "?" 버튼으로 언제든 다시 볼 수 있습니다.',
    ],
  },
]

export const HOW_TO_PLAY_STORAGE_KEY = 'was-spoken:how-to-play-seen'
const SEEN = '1'

/** 브라우저 저장소에서 이 기능이 쓰는 부분. 테스트에서는 메모리 저장소를 넘긴다. */
export type HowToPlayStorage = Pick<Storage, 'getItem' | 'setItem'>

/** 안내를 이미 봤는가. 저장소를 읽을 수 없으면 보지 않은 것으로 친다(안내가 한 번 더 뜨는 편이 안전하다). */
export function hasSeenHowToPlay(storage: HowToPlayStorage): boolean {
  try {
    return storage.getItem(HOW_TO_PLAY_STORAGE_KEY) === SEEN
  } catch {
    return false
  }
}

/** 안내를 봤다고 기억한다. 저장소에 쓸 수 없으면 이번 방문에서만 닫힌 채로 둔다. */
export function markHowToPlaySeen(storage: HowToPlayStorage): void {
  try {
    storage.setItem(HOW_TO_PLAY_STORAGE_KEY, SEEN)
  } catch {
    // 저장할 수 없는 환경(사생활 보호 모드 등): 다음 방문에 다시 뜰 뿐 게임은 그대로 진행된다.
  }
}
