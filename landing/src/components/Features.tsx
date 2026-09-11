import Reveal from './Reveal'
import SectionHeading from './SectionHeading'

const CARDS: Array<{ no: string; title: string; desc: string }> = [
  {
    no: '01',
    title: '最近查看',
    desc: '按预览时间排序、最新置顶；全量列表支持实时过滤、↑↓ 键盘选择、Enter 直接打开。',
  },
  {
    no: '02',
    title: '记录不丢文件',
    desc: '从「最近查看」移除仅隐藏记录，文件仍在原处；彻底删除需要二次确认。',
  },
  {
    no: '03',
    title: '同名覆盖',
    desc: '重复上传同名文件会明确提示「将覆盖旧版本」，先传新再删旧，失败也不丢数据。',
  },
  {
    no: '04',
    title: '在线分享',
    desc: '在线模式一键生成分享链接，任何人点开即可预览，无需登录。',
  },
  {
    no: '05',
    title: '本地优先',
    desc: '桌面端本地模式：文件与元数据全部存于本机，无需账号，数据不出你的电脑。',
  },
  {
    no: '06',
    title: '状态保留',
    desc: '每个分栏独立滚动与缩放，切换标签再回来，文档还是原来的位置。',
  },
]

/** 03 · 更多细节：kaku 式编号特性网格 */
export default function Features() {
  return (
    <section id="features" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <SectionHeading
            index="03"
            label="更多细节"
            title="有用的默认，都已设好。"
            sub="不用配置，不用调教 —— 打开就是一个「装了心的预览器」。"
          />
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card, i) => (
            <Reveal key={card.no} delay={(i % 3) * 60}>
              <div className="h-full rounded-xl border border-ink/15 bg-card p-6 transition duration-300 hover:-translate-y-1 hover:border-ink/60 hover:shadow-[6px_6px_0_0_#242933]">
                <p className="font-mono text-xs text-accent">{card.no}</p>
                <h3 className="mt-3 font-serif text-lg font-bold text-ink">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{card.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
