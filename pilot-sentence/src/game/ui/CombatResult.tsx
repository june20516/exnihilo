interface CombatResultProps {
  outcome: 'won' | 'lost'
  onRestart: () => void
}

export function CombatResult({ outcome, onRestart }: CombatResultProps) {
  const won = outcome === 'won'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-container-lowest/80 backdrop-blur" data-testid="result">
      <div className="flex flex-col items-center gap-6 rounded-xl bg-surface-container p-10 shadow-2xl">
        <span className={`font-headline text-5xl font-black ${won ? 'text-secondary' : 'text-error'}`}>
          {won ? '승리' : '패배'}
        </span>
        <p className="text-on-surface-variant">{won ? '문장이 당신의 뜻대로 완성되었습니다.' : '잉크가 다했습니다.'}</p>
        <button
          type="button"
          onClick={onRestart}
          className="rounded-xl bg-primary-container px-6 py-3 font-headline text-xl font-bold text-on-primary-container"
        >
          다시 하기
        </button>
      </div>
    </div>
  )
}
