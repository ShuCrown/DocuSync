import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import { Logo } from './icons'

/** 05 · Why DocuSync：作者故事（对应 kaku 的 "It started as my own daily driver"） */
export default function Story() {
  return (
    <section id="story" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <SectionHeading index="05" label="Why DocuSync" title="它首先是我自己的日常工具。" />
        </Reveal>

        <Reveal delay={120} className="mt-12">
          <div className="max-w-2xl">
            <p className="font-serif text-lg leading-10 text-ink first-letter:float-left first-letter:mr-3 first-letter:font-serif first-letter:text-6xl first-letter:font-black first-letter:leading-[0.9] first-letter:text-accent">
              每天都要和散落各处的 PDF、Word、Excel、PPT 打交道：预览要装插件、开会员、登账号；
              想对比两份文档，还得开两个窗口手动摆好。
            </p>
            <p className="mt-6 font-serif text-lg leading-10 text-ink-soft">
              DocuSync 把它们收进一个干净的视图：上传即预览，多标签、分栏对比；
              桌面端的数据不出本机。它先是解决自己问题的工具，然后才是开源项目。
            </p>
            <div className="mt-10 flex items-center gap-3">
              <Logo className="h-6 w-6" />
              <p className="font-mono text-xs text-ink-faint">
                ShuCrown · MIT 开源 · 欢迎共建
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
