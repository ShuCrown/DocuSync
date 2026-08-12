import {
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileType,
  Presentation,
  type LucideIcon,
} from 'lucide-react'
import type { FileCategory } from './fileType'

export interface FileIconSpec {
  Icon: LucideIcon
  /** Brand color for the file type (matches the app palette). */
  color: string
}

/**
 * Per-type icon + color for file categories. Icons are chosen to stay
 * visually distinct at small sizes (tab strip, history rows):
 *   pdf → FileText (red) · word → FileType (blue) · excel → FileSpreadsheet (green)
 *   powerpoint → Presentation (orange) · markdown → FileCode (grey) · other → File
 */
export function getFileIconSpec(category: FileCategory): FileIconSpec {
  switch (category) {
    case 'pdf':
      return { Icon: FileText, color: '#b34242' }
    case 'word':
      return { Icon: FileType, color: '#2a4a7f' }
    case 'excel':
      return { Icon: FileSpreadsheet, color: '#3a7d5c' }
    case 'powerpoint':
      return { Icon: Presentation, color: '#c2571b' }
    case 'markdown':
      return { Icon: FileCode, color: '#7a7267' }
    default:
      return { Icon: File, color: '#7a7267' }
  }
}

/**
 * Ready-to-render icon for a file category — the matching lucide icon tinted
 * with its brand color. `className` controls the size (w-x / h-x utilities),
 * consistent with how lucide icons are used elsewhere.
 */
export function FileTypeIcon({
  category,
  className,
}: {
  category: FileCategory
  className?: string
}) {
  const { Icon, color } = getFileIconSpec(category)
  return <Icon className={className} style={{ color }} aria-hidden />
}
