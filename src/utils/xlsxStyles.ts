import JSZip from 'jszip'

export interface XlsxCellStyle {
  bold?: boolean
  italic?: boolean
  color?: string
  bg?: string
  halign?: 'left' | 'center' | 'right'
}

/** Legacy indexed color palette (ECMA-376, 64 entries) */
const INDEXED_COLORS = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#808080',
  '#9999FF', '#993366', '#FFFFCC', '#CCFFFF', '#660066', '#FF8080', '#0066CC', '#CCCCFF',
  '#000080', '#FF00FF', '#FFFF00', '#00FFFF', '#800080', '#800000', '#008080', '#0000FF',
  '#00CCFF', '#CCFFFF', '#CCFFCC', '#FFFF99', '#99CCFF', '#FF99CC', '#CC99FF', '#FFCC99',
  '#3366FF', '#33CCCC', '#99CC00', '#FFCC00', '#FF9900', '#FF6600', '#666699', '#969696',
  '#003366', '#339966', '#003300', '#333300', '#993300', '#993366', '#333399', '#333333',
]

function argbToHex(v: string): string | undefined {
  const m = /^(?:[0-9A-Fa-f]{2})?([0-9A-Fa-f]{6})$/.exec(v.trim())
  return m ? `#${m[1].toUpperCase()}` : undefined
}

/** tint > 0 lightens towards white, < 0 darkens towards black (approx. of lumMod/lumOff) */
function applyTint(hex: string, tint: number): string {
  if (!tint) return hex
  const n = parseInt(hex.slice(1), 16)
  const ch = (x: number) => {
    const v = tint < 0 ? x * (1 + tint) : x + (255 - x) * tint
    return Math.round(Math.min(255, Math.max(0, v)))
  }
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${(((r << 16) | (g << 8) | b) >>> 0).toString(16).padStart(6, '0').toUpperCase()}`
}

interface ColorSpec {
  rgb?: string
  indexed?: number
  theme?: number
  tint?: number
}

function parseColorTag(xml: string): ColorSpec | null {
  if (!/\b(?:rgb|indexed|theme)=/.test(xml)) return null
  const num = (re: RegExp) => {
    const m = re.exec(xml)
    return m ? Number(m[1]) : undefined
  }
  return {
    rgb: /\brgb="([^"]+)"/.exec(xml)?.[1],
    indexed: num(/\bindexed="(\d+)"/),
    theme: num(/\btheme="(\d+)"/),
    tint: num(/\btint="([^"]+)"/),
  }
}

function resolveColor(spec: ColorSpec | null | undefined, theme: string[]): string | undefined {
  if (!spec) return undefined
  let base: string | undefined
  if (spec.rgb) base = argbToHex(spec.rgb)
  else if (spec.indexed != null) base = INDEXED_COLORS[spec.indexed]
  else if (spec.theme != null) base = theme[spec.theme]
  if (!base) return undefined
  return spec.tint ? applyTint(base, spec.tint) : base
}

/** Theme palette in styles.xml index order: [lt1, dk1, lt2, dk2, accent1..6, hlink, folHlink] */
function parseThemeColors(themeXml: string): string[] {
  const scheme = /<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/.exec(themeXml)?.[1]
  if (!scheme) return []
  const slots = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']
  const fileOrder = slots.map((name) => {
    const block = new RegExp(`<a:${name}>([\\s\\S]*?)</a:${name}>`).exec(scheme)?.[1] ?? ''
    const srgb = /<a:srgbClr val="([^"]+)"/.exec(block)?.[1]
    if (srgb) return argbToHex(srgb)
    const sys = /<a:sysClr[^>]*lastClr="([^"]+)"/.exec(block)?.[1]
    return sys ? argbToHex(sys) : undefined
  })
  // file order is dk1,lt1,dk2,lt2,... — index order swaps the first two pairs
  return [
    fileOrder[1], fileOrder[0], fileOrder[3], fileOrder[2],
    ...fileOrder.slice(4),
  ].map((c) => c ?? '#000000')
}

function section(xml: string, tag: string): string {
  return new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1] ?? ''
}

/**
 * Extract per-cell display styles from an .xlsx buffer. SheetJS CE does not
 * parse styles.xml, so fonts/fills/alignment are read directly from the zip.
 * Returns one Map per sheet (workbook order): cell ref ("B3") → style.
 * Non-xlsx input (e.g. legacy .xls OLE2) yields empty maps.
 */
export async function parseXlsxCellStyles(buffer: ArrayBuffer): Promise<Map<string, XlsxCellStyle>[]> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    return []
  }
  const stylesFile = zip.file('xl/styles.xml')
  if (!stylesFile) return []
  const stylesXml = await stylesFile.async('string')

  const themeFile = zip.file('xl/theme/theme1.xml')
  const theme = themeFile ? parseThemeColors(await themeFile.async('string')) : []

  // fonts
  const fonts = section(stylesXml, 'fonts')
    .split('</font>')
    .map((chunk) => {
      if (!/<font[>\s]/.test(chunk)) return null
      return {
        bold: /<b\s*\/>|<b>/.test(chunk),
        italic: /<i\s*\/>|<i>/.test(chunk),
        color: resolveColor(parseColorTag(chunk), theme),
      }
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)

  // fills: only solid patternFill fgColor is a visible background
  const fills = section(stylesXml, 'fills')
    .split('</fill>')
    .map((chunk) => {
      if (!/<fill[>\s]/.test(chunk)) return null
      if (!/patternType="solid"/.test(chunk)) return { bg: undefined }
      const fg = /<fgColor\b[^>]*\/?>/.exec(chunk)?.[0] ?? ''
      return { bg: resolveColor(parseColorTag(fg), theme) }
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)

  // cellXfs: xf index → composed style
  const numAttr = (xml: string, name: string) => {
    const m = new RegExp(`\\b${name}="(\\d+)"`).exec(xml)
    return m ? Number(m[1]) : 0
  }
  const xfs: XlsxCellStyle[] = []
  for (const chunk of section(stylesXml, 'cellXfs').split(/<xf\b/).slice(1)) {
    const fontId = numAttr(chunk, 'fontId')
    const fillId = numAttr(chunk, 'fillId')
    const applyFont = /\bapplyFont="(?:1|true)"/.test(chunk)
    const applyFill = /\bapplyFill="(?:1|true)"/.test(chunk)
    const applyAlign = /\bapplyAlignment="(?:1|true)"/.test(chunk)
    const style: XlsxCellStyle = {}
    if (applyFont) {
      const f = fonts[fontId]
      if (f?.bold) style.bold = true
      if (f?.italic) style.italic = true
      if (f?.color) style.color = f.color
    }
    if (applyFill) {
      const bg = fills[fillId]?.bg
      if (bg) style.bg = bg
    }
    if (applyAlign) {
      const h = /<alignment\b[^>]*\bhorizontal="(left|center|right)"/.exec(chunk)?.[1]
      if (h) style.halign = h as XlsxCellStyle['halign']
    }
    xfs.push(style)
  }

  // sheet name → worksheet path (via workbook rels)
  const wbXml = await zip.file('xl/workbook.xml')!.async('string')
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
  const relTarget = new Map<string, string>()
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0]
    const id = /\bId="([^"]+)"/.exec(tag)?.[1]
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1]
    if (id && target) relTarget.set(id, target)
  }

  const out: Map<string, XlsxCellStyle>[] = []
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = m[0]
    const rid = /\br:id="([^"]+)"/.exec(tag)?.[1]
    const target = rid ? relTarget.get(rid) : undefined
    const styles = new Map<string, XlsxCellStyle>()
    out.push(styles)
    if (!target) continue
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`
    const sheetFile = zip.file(path)
    if (!sheetFile) continue
    const sheetXml = await sheetFile.async('string')
    for (const cm of sheetXml.matchAll(/<c\b[^>]*>/g)) {
      const ctag = cm[0]
      const s = numAttr(ctag, 's')
      if (s === 0) continue
      const ref = /\br="([A-Z]+\d+)"/.exec(ctag)?.[1]
      if (!ref) continue
      const style = xfs[s]
      if (style && (style.bold || style.italic || style.color || style.bg || style.halign)) {
        styles.set(ref, style)
      }
    }
  }
  return out
}
