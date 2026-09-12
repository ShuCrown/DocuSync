interface SectionHeadingProps {
  index: string
  label: string
  title: string
  sub?: string
}

/** kaku.fun 式编号分节标题：`01 · 标签` + 大标题 */
export default function SectionHeading({ index, label, title, sub }: SectionHeadingProps) {
  return (
    <div>
      <p className="flex items-center gap-3 font-mono text-[13px] tracking-widest text-ink-faint">
        <span className="text-accent">{index}</span>
        <span aria-hidden="true">·</span>
        <span>{label}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-ink/10" />
      </p>
      <h2 className="mt-5 font-serif text-3xl font-bold leading-snug tracking-tight text-ink md:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-4 max-w-xl text-[15px] leading-7 text-ink-soft">{sub}</p>}
    </div>
  )
}
