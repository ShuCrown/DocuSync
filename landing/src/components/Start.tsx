import { LINKS, detectOS, downloadLabel } from '../config'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import { IconArrowUpRight, IconDownload } from './icons'

/** 04 · 开始使用：Web 版优先，桌面端为进阶选择 */
export default function Start() {
  const dlLabel = downloadLabel(detectOS())

  return (
    <section id="start" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <SectionHeading
            index="04"
            label="开始使用"
            title="三分钟上手。"
            sub="推荐直接打开 Web 版：不用安装，浏览器里就是完整功能；桌面端留给本地文件为主的场景。"
          />
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Reveal>
            <div className="flex h-full flex-col rounded-xl border border-ink/15 bg-card p-8">
              <h3 className="flex items-center gap-2.5 font-serif text-2xl font-bold text-ink">
                Web 版
                <span className="rounded-full bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] font-normal text-accent">
                  推荐
                </span>
              </h3>
              <p className="mt-3 text-sm leading-7 text-ink-soft">
                无需安装，打开网页就能上传预览，同一套界面、同一套分栏与快捷键，随手分享链接也靠它。
              </p>
              <div className="mt-auto pt-8">
                <a
                  href={LINKS.webApp}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-white shadow-lg shadow-accent/25 transition hover:-translate-y-0.5 hover:bg-accent-bright"
                >
                  打开 Web 版
                  <IconArrowUpRight className="h-4 w-4 text-white/80 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>
              </div>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="flex h-full flex-col rounded-xl border border-ink/15 p-8">
              <h3 className="font-serif text-2xl font-bold text-ink">桌面端</h3>
              <p className="mt-3 text-sm leading-7 text-ink-soft">
                需要离线预览本地文件时再装：macOS（Apple Silicon）下载 .dmg，Windows 下载 .msi / .exe，内置自动更新。
              </p>
              <div className="mt-auto pt-8">
                <a
                  href={LINKS.releases}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2.5 rounded-full border border-ink/20 bg-card px-6 py-3 text-[15px] font-medium text-ink transition hover:-translate-y-0.5 hover:border-accent hover:text-accent"
                >
                  <IconDownload className="h-[18px] w-[18px]" />
                  {dlLabel}
                </a>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={160}>
          <p className="mt-8 text-center font-mono text-[11px] text-ink-faint">
            剩下的只有一步：把 PDF / Word / Excel / PPT / Markdown 拖进窗口，最近查看自动记录。
          </p>
        </Reveal>
      </div>
    </section>
  )
}
