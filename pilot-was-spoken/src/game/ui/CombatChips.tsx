import type { ReactNode } from 'react'
import type { Amplifier } from '@/game/rally/summary'
import { Icon } from './Icon'
import { ICONS } from './icons'
import { Tooltip } from './Tooltip'

interface CombatChipsProps {
  /** 서고: 단어별 장수(순서는 감춘다). */
  drawPile: readonly { readonly text: string; readonly count: number }[]
  /** 망각: 들어간 순서대로의 단어 문구. */
  discardPile: readonly string[]
  /** 서고가 바닥났을 때 못 뽑은 장수당 잃는 HP(규칙 값). */
  emptyDrawHpLoss: number
  turn: number
  amplifiers: readonly Amplifier[]
}

function Chip({ icon, children, muted = false }: { icon: string; children: ReactNode; muted?: boolean }) {
  return (
    <span className={`flex items-center gap-1 whitespace-nowrap rounded-full bg-surface-container-high px-2.5 py-1 font-ui text-sm ${muted ? 'text-outline' : ''}`}>
      <Icon name={icon} className="text-[17px]" />
      {children}
    </span>
  )
}

const Count = ({ value }: { value: number }) => <b className="font-number text-base font-normal">{value}</b>

/** 상단 바 칩: 서고·망각·턴·적용 중. 숫자만 늘 보이고, 내용은 툴팁(자세한 목록은 왼쪽 서랍). */
export function CombatChips({ drawPile, discardPile, emptyDrawHpLoss, turn, amplifiers }: CombatChipsProps) {
  const drawCount = drawPile.reduce((sum, d) => sum + d.count, 0)
  return (
    <>
      <Tooltip
        testId="pile-draw"
        content={
          <>
            <b>서고</b> — 앞으로 뽑을 카드(순서는 모름)
            <br />
            {drawPile.length > 0
              ? drawPile.map((d) => `${d.text} ×${d.count}`).join(', ')
              : `비어 있음: 뽑아야 할 때 못 뽑은 장수마다 HP ${emptyDrawHpLoss}를 잃습니다.`}
          </>
        }
      >
        <Chip icon={ICONS.draw}>
          서고 <Count value={drawCount} />
        </Chip>
      </Tooltip>
      <Tooltip
        testId="pile-discard"
        content={
          <>
            <b>망각</b> — 쓰거나 버린 카드(들어간 순서). 저절로 서고로 돌아오지 않습니다.
            <br />
            {discardPile.length > 0 ? discardPile.join(' → ') : '비어 있음'}
          </>
        }
      >
        <span data-testid="discard-pile">
          <Chip icon={ICONS.discardPile}>
            망각 <Count value={discardPile.length} />
          </Chip>
        </span>
      </Tooltip>
      <span data-testid="turn">
        <Chip icon="hourglass_top">
          턴 <Count value={turn} />
        </Chip>
      </span>
      <Tooltip
        content={
          amplifiers.length === 0 ? (
            <>
              <b>적용 중</b> — 유물·늘어난 구조·강화·내 상태가 여기 모입니다.
            </>
          ) : (
            <span className="flex flex-col gap-0.5">
              {amplifiers.map((a, i) => (
                <span key={`${a.kind}-${a.name}-${i}`}>
                  <b>{a.name}</b> — {a.text}
                </span>
              ))}
            </span>
          )
        }
      >
        <span data-testid="amplifiers">
          <Chip icon={ICONS.relic} muted={amplifiers.length === 0}>
            적용 {amplifiers.length === 0 ? '없음' : <Count value={amplifiers.length} />}
          </Chip>
        </span>
      </Tooltip>
    </>
  )
}
