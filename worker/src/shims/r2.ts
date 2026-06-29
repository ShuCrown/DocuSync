/**
 * R2Bucket compatibility shim over the local filesystem.
 *
 * Stores files under a base directory, preserving the R2 key as a relative
 * path.  Supports put/get/delete — the only operations used by index.ts.
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

// ---------------------------------------------------------------------------
// Types matching the R2 API subset we use
// ---------------------------------------------------------------------------

interface R2HttpMetadata {
  contentType?: string
}

interface R2ConditionalHeaders {}

interface R2GetOptions {
  onlyIf?: R2ConditionalHeaders
  range?: { offset: number; length?: number }
}

interface R2HeadResult {
  key: string
  size: number
  httpMetadata: R2HttpMetadata
  customMetadata?: Record<string, string>
}

interface R2ObjectBody extends R2HeadResult {
  body: ReadableStream
  writeHttpMetadata(headers: Headers): void
}

interface R2PutOptions {
  httpMetadata?: R2HttpMetadata
  customMetadata?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Helper: Node ReadableStream → Web ReadableStream
// ---------------------------------------------------------------------------

function nodeToWebStream(nodeStream: fs.ReadStream): ReadableStream {
  // Node 18+ supports Readable.toWeb()
  return Readable.toWeb(nodeStream) as ReadableStream
}

// ---------------------------------------------------------------------------
// R2 Shim
// ---------------------------------------------------------------------------

export class R2Shim {
  constructor(private baseDir: string) {}

  /** Resolve an R2 key to an absolute file path. */
  private filePath(key: string): string {
    // Sanitize: prevent directory traversal
    const safe = key.replace(/\.\./g, '_')
    return path.join(this.baseDir, safe)
  }

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null,
    options?: R2PutOptions,
  ): Promise<R2HeadResult> {
    const filePath = this.filePath(key)
    const dir = path.dirname(filePath)
    await fsp.mkdir(dir, { recursive: true })

    if (value === null) {
      // R2 put with null creates a tombstone / empty object
      await fsp.writeFile(filePath, '')
    } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const buf = value instanceof ArrayBuffer
        ? Buffer.from(value)
        : Buffer.from(value.buffer, value.byteOffset, value.byteLength)
      await fsp.writeFile(filePath, buf)
    } else if (typeof value === 'string') {
      await fsp.writeFile(filePath, value, 'utf-8')
    } else {
      // ReadableStream — pipe to file
      const nodeStream = Readable.fromWeb(value as import('node:stream/web').ReadableStream)
      await new Promise<void>((resolve, reject) => {
        const ws = fs.createWriteStream(filePath)
        nodeStream.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
        nodeStream.on('error', reject)
      })
    }

    const stat = await fsp.stat(filePath)
    return {
      key,
      size: stat.size,
      httpMetadata: options?.httpMetadata ?? {},
      customMetadata: options?.customMetadata,
    }
  }

  async get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null> {
    const filePath = this.filePath(key)
    if (!fs.existsSync(filePath)) return null

    const stat = await fsp.stat(filePath)
    const contentType = this.detectContentType(key)

    // Handle range requests
    let start = 0
    let end = stat.size - 1
    if (options?.range) {
      start = options.range.offset
      end = options.range.length != null
        ? start + options.range.length - 1
        : stat.size - 1
    }

    const nodeStream = fs.createReadStream(filePath, { start, end })

    return {
      key,
      size: stat.size,
      httpMetadata: { contentType },
      body: nodeToWebStream(nodeStream),
      writeHttpMetadata(headers: Headers): void {
        if (contentType) headers.set('Content-Type', contentType)
      },
    }
  }

  async head(key: string): Promise<R2HeadResult | null> {
    const filePath = this.filePath(key)
    if (!fs.existsSync(filePath)) return null

    const stat = await fsp.stat(filePath)
    return {
      key,
      size: stat.size,
      httpMetadata: { contentType: this.detectContentType(key) },
    }
  }

  async delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys]
    for (const key of list) {
      const filePath = this.filePath(key)
      if (fs.existsSync(filePath)) {
        await fsp.unlink(filePath)
      }
    }
  }

  // Minimal content-type detection by extension
  private detectContentType(key: string): string {
    const ext = path.extname(key).toLowerCase()
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.md': 'text/markdown',
      '.markdown': 'text/markdown',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
    }
    return map[ext] ?? 'application/octet-stream'
  }
}
