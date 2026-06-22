# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DocuSync is a document preview and AI-powered summary tool. It supports PDF, Markdown, Word (.docx), Excel (.xlsx), and PowerPoint (.pptx) files. Users upload a document, preview it in the browser, and generate an AI summary using Cloudflare Workers AI.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS v4
- **Backend**: Cloudflare Worker (Hono framework) — `docusync-api`
- **Deployment**: Cloudflare Pages (frontend) + Cloudflare Workers (API)
- **AI**: Cloudflare Workers AI (`@cf/meta/llama-3.2-3b-instruct`)
- **Storage**: Cloudflare R2 (file uploads), Cloudflare D1 (document metadata, summary cache, device accounts)

## Commands

```bash
npm run dev          # Vite dev server (frontend only, no API)
npm run build        # TypeScript check + Vite production build
npm run pages:dev    # Wrangler local dev (includes Functions API)
npm run pages:deploy # Deploy to Cloudflare Pages
npm run lint         # ESLint

cd worker
npm run deploy       # Deploy Worker API
```

## Architecture

### Frontend (`src/`)

Component-driven architecture with hooks for state management:

- `App.tsx` — Root orchestrator: file upload, document viewing, summary, history
- `components/Layout.tsx` — Header (back button, filename, AI summary, history dropdown, account)
- `components/FileUpload.tsx` — Drag-and-drop file upload (react-dropzone)
- `components/DocumentViewer.tsx` — Routes to the correct viewer based on file type
- `components/PdfViewer.tsx` — PDF rendering via pdf.js with page navigation and zoom
- `components/MarkdownViewer.tsx` — Markdown rendering (react-markdown + remark-gfm + rehype-highlight)
- `components/OfficeViewer.tsx` — Word/Excel/PPT parsing (mammoth for .docx, xlsx for spreadsheets, DOMPurify for XSS safety)
- `components/SummaryPanel.tsx` — Floating AI summary popup with copy-to-clipboard
- `components/FileHistory.tsx` — Document history list (unused, replaced by Layout dropdown)
- `hooks/useFileUpload.ts` — File upload state, validation, and history restoration (downloads from R2)
- `hooks/useFileHistory.ts` — D1-backed document history
- `hooks/useSummary.ts` — D1-cached summary API
- `hooks/useAccount.ts` — Email bind/recover state management
- `lib/api.ts` — Unified API client (auto-carries deviceId)
- `lib/device-id.ts` — 21-char random device identity (localStorage)
- `utils/fileType.ts` — File type detection and categorization
- `utils/formatTime.ts` — Shared relative time formatting

### Backend API (`worker/`)

Cloudflare Worker using Hono framework, deployed as `docusync-api`:

- `worker/src/index.ts` — All REST API endpoints
- `worker/src/lib/mailer.ts` — Email sending via external mail-service
- `worker/src/db/schema.sql` — D1 database schema (4 tables)

#### API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/device/register` | Register device, return email binding status |
| POST | `/api/documents/upload` | Upload file to R2, save metadata to D1 |
| GET | `/api/documents` | List documents for a device |
| DELETE | `/api/documents/:id` | Delete document from D1 + R2 |
| GET | `/api/documents/:id/download` | Download file from R2 |
| POST | `/api/documents/:id/summarize` | Generate AI summary (with D1 cache) |
| GET | `/api/documents/:id/summary` | Get cached summary |
| POST | `/api/account/bind` | Send verification email for binding |
| POST | `/api/account/bind/verify` | Verify code and bind email |
| POST | `/api/account/login` | Send recovery code to email |
| POST | `/api/account/recover` | Recover documents from email-bound devices |
| GET | `/api/account/info` | Get email binding status |
| DELETE | `/api/account/unbind` | Unbind email from device |

### Service Binding Architecture

Pages Functions (`functions/api/[[path]].ts`) proxies all `/api/*` requests to the Worker via Cloudflare service binding. No API logic lives in Pages Functions.

### Cloudflare Bindings

**Worker** (`worker/wrangler.toml`):
- `FILES_BUCKET` — R2 bucket for file storage
- `AI` — Workers AI binding
- `DB` — D1 database for persistence
- `MAIL_SERVICE_URL` / `MAIL_SERVICE_KEY` — External mail-service credentials (set as secrets)

**Pages** (`wrangler.toml`):
- Service binding to `docusync-api` worker

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `pdfjs-dist` | PDF rendering in browser |
| `mammoth` | .docx to HTML/text conversion |
| `xlsx` | Excel file parsing |
| `dompurify` | XSS sanitization for mammoth HTML output |
| `react-markdown` + `remark-gfm` + `rehype-highlight` | Markdown rendering |
| `react-dropzone` | Drag-and-drop file upload |
| `lucide-react` | Icons |
| `hono` | Worker API framework |
| `nanoid` | ID generation |

## Tailwind CSS v4

Uses the CSS-first configuration approach (no `tailwind.config.js`). Theme customization is in `src/index.css` via `@theme` blocks. The Vite plugin `@tailwindcss/vite` handles processing.

## Development Notes

- pdf.js worker is loaded from `node_modules` via import.meta.url — no separate worker file needed
- Text extraction for AI summary happens client-side for all formats except PDF
- The summary API truncates input to 12,000 characters to fit model context limits
- Office file parsing (mammoth, xlsx) runs entirely in the browser
- Device identity is a 21-char random ID stored in localStorage, no login required
- Email binding uses 6-digit verification codes with 10-minute expiry and 60-second rate limit
