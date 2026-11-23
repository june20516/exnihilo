export function ApMeter({ ap, max }: { ap: number; max: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-container px-4 py-2 shadow-lg" data-testid="ap">
      <div className="flex flex-col">
        <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">행동력</span>
        <span className="font-headline text-2xl font-bold leading-none text-secondary">{ap} / {max}</span>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            data-ap-drop={i}
            className={`h-7 w-5 rounded-full transition-all duration-300 ${
              i < ap ? 'bg-secondary shadow-[0_0_12px_rgba(252,186,91,0.7)]' : 'bg-surface-container-highest'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
