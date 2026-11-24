/** 문장판 칸의 아이콘과 크기(SlotView·SentenceBoard가 함께 쓴다). */
export const HEAD_ICONS = { player: 'style', enemy: 'format_quote', implied: 'visibility_off', emptyVerb: 'add' } as const
/** 칸 이름 앞 아이콘. 연결어 칸(SentenceBoard)도 같은 모양으로 쓴다. */
export const ROLE_ICONS = { subject: 'person', object: 'my_location', verb: 'bolt', connective: 'link' } as const

/** 칸 크기: 보통과 compact(절 둘). 버튼 높이는 모바일 축소 뒤에도 터치 40px 이상이다. */
export const SLOT_SIZES = {
  normal: {
    box: 'h-20 short:h-[60px]',
    head: 'min-w-36 px-5 text-3xl short:min-w-28 short:px-3 short:text-2xl',
    modifier: 'min-w-16 text-xl short:min-w-12 short:text-base',
    particle: 'mb-6 h-10 w-10 text-2xl short:mb-4 short:h-8 short:w-8 short:text-xl',
  },
  compact: { box: 'h-16 short:h-[60px]', head: 'min-w-28 px-3 text-xl', modifier: 'min-w-14 text-sm short:min-w-12', particle: 'mb-4 h-8 w-8 text-lg' },
} as const

