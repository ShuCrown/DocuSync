import { LINKS } from '../config'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import { IconArrowUpRight } from './icons'

interface Step {
  no: string
  title: string
  desc: string
  action?: { label: string; href: string }
}

const STEPS: Step[] = [
  {
    no: '01',
    title: '下载桌面端',
    desc: 'macOS（Apple Silicon）下载 .dmg，Windows 下载 .msi / .exe；拖进应用程序文件夹即可，内置自动更新。',
    action: { label: '前往 GitHub Releases', href: LINKS.releases },
  },
  {
    no: '02',
    title: '或直接用 Web 版',
    desc: '不想安装？打开网页就能上传预览，浏览器里就是同一套界面、同一套快捷键。',
    action: { label: '打开 docusync.pages.dev', href: LINKS.webApp },
  },
  {
    no: '03',
    title: '拖入文件',
    desc: '把 PDF / Word / Excel / PPT / Markdown 拖进窗口，即刻开始预览，最近查看自动记录。',
  },
  {
    no: '04',
    title: '分栏对比',
    desc: '⌘D 新建分栏，拖入第二份文档并排阅读；拖动分隔条调整比例，⇧⌘X 一键交换两侧。',
  },
]

/** 04 · 开始使用：下载 App 与 Web 版双入口 */
export default function Start() {
  return (
    <section id="start" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <SectionHeading
            index="04"
            label="开始使用"
            title="三分钟上手。"
            sub="两条路，通向同一个界面：装一个桌面 App，或者打开浏览器。"
          />
        </Reveal>

        <div className="mt-12 border-t border-ink/10">
          {STEPS.map((step, i) => (
            <Reveal key={step.no} delay={i * 60}>
              <div className="grid gap-4 border-b border-ink/10 py-8 md:grid-cols-[72px_220px_1fr_auto] md:items-center md:gap-8">
                <p className="font-mono text-sm text-accent">{step.no}</p>
                <h3 className="font-serif text-xl font-bold text-ink">{step.title}</h3>
                <p className="text-sm leading-7 text-ink-soft md:max-w-xl">{step.desc}</p>
                {step.action && (
                  <a
                    href={step.action.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex items-center gap-1.5 justify-self-start rounded-full border border-ink/20 bg-card px-4 py-2 text-[13px] font-medium text-ink transition hover:border-accent hover:text-accent md:justify-self-end"
                  >
                    {step.action.label}
                    <IconArrowUpRight className="h-3.5 w-3.5 text-ink-faint transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                  </a>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
