import { LINKS, detectOS, downloadLabel } from '../config'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import { IconArrowUpRight, IconDownload } from './icons'

/** 04 · 开始使用：桌面端 / Web 版双入口 */
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
            sub="两条路，通向同一个界面：装一个桌面 App，或者打开浏览器。"
          />
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Reveal>
            <div className="flex h-full flex-col rounded-xl border border-ink/15 bg-card p-8">
              <h3 className="font-serif text-2xl font-bold text-ink">桌面端</h3>
              <p className="mt-3 text-sm leading-7 text-ink-soft">
                macOS（Apple Silicon）下载 .dmg，Windows 下载 .msi / .exe；拖进应用程序文件夹即可，内置自动更新。
              </p>
              <div className="mt-auto pt-8">
                <a
                  href={LINKS.releases}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-white shadow-lg shadow-accent/25 transition hover:-translate-y-0.5 hover:bg-accent-bright"
                >
                  <IconDownload className="h-[18px] w-[18px]" />
                  {dlLabel}
                </a>
                <p className="mt-4 font-mono text-[11px] text-ink-faint">
                  全部安装包见 GitHub Releases
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="flex h-full flex-col rounded-xl border border-ink/15 p-8">
              <h3 className="font-serif text-2xl font-bold text-ink">Web 版</h3>
              <p className="mt-3 text-sm leading-7 text-ink-soft">
                不想安装？打开网页就能上传预览，浏览器里就是同一套界面、同一套快捷键。
              </p>
              <div className="mt-auto pt-8">
                <a
                  href={LINKS.webApp}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-2 rounded-full border border-ink/20 bg-card px-6 py-3 text-[15px] font-medium text-ink transition hover:-translate-y-0.5 hover:border-accent hover:text-accent"
                >
                  打开 docusync.pages.dev
                  <IconArrowUpRight className="h-4 w-4 text-ink-faint transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
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
