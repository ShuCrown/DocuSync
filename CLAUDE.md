# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DocuSync is a document preview and AI-powered summary tool. It supports PDF, Markdown, Word (.docx), Excel (.xlsx), and PowerPoint (.pptx) files. Users upload a document, preview it in the browser, and generate an AI summary using Cloudflare Workers AI.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS v4
- **Deployment**: Cloudflare Pages with Functions (serverless API)
- **AI**: Cloudflare Workers AI (`@cf/meta/llama-3-8b-instruct`)
- **Storage**: Cloudflare R2 (file uploads), KV (summary caching, optional)

## Commands

```bash
npm run dev          # Vite dev server (frontend only, no API)
npm run build        # TypeScript check + Vite production build
npm run pages:dev    # Wrangler local dev (includes Functions API)
npm run pages:deploy # Deploy to Cloudflare Pages
npm run lint         # ESLint
```

For local development with API endpoints, use `npm run pages:dev` instead of `npm run dev`.

## Architecture

### Frontend (`src/`)

The app follows a component-driven architecture with hooks for state management:

- `App.tsx` — Root component orchestrating file upload, document viewing, and summary
- `components/FileUpload.tsx` — Drag-and-drop file upload (react-dropzone)
- `components/DocumentViewer.tsx` — Routes to the correct viewer based on file type
- `components/PdfViewer.tsx` — PDF rendering via pdf.js with page navigation and zoom
- `components/MarkdownViewer.tsx` — Markdown rendering (react-markdown + remark-gfm + rehype-highlight)
- `components/OfficeViewer.tsx` — Word/Excel/PPT parsing (mammoth for .docx, xlsx library for spreadsheets)
- `components/SummaryPanel.tsx` — AI summary display with copy-to-clipboard
- `hooks/useFileUpload.ts` — File selection state and validation
- `hooks/useSummary.ts` — Summary API call state
- `services/fileService.ts` — Client-side text extraction from documents
- `services/summaryService.ts` — Fetch wrapper for the summary API
- `utils/fileType.ts` — File type detection and categorization

### Backend API (`functions/`)

Cloudflare Pages Functions live in the `functions/` directory. The file path maps to the URL route:

- `functions/api/_middleware.ts` — CORS middleware for all `/api/*` routes
- `functions/api/upload.ts` — Accepts file upload via FormData, stores in R2 bucket
- `functions/api/summarize.ts` — Receives extracted text, calls Workers AI for summary

### Cloudflare Bindings (`wrangler.toml`)

The bindings are commented out in `wrangler.toml` and must be configured in the Cloudflare Dashboard:

- `FILES_BUCKET` — R2 bucket for file storage
- `AI` — Workers AI binding (auto-available on Cloudflare Pages)
- `CACHE_KV` — KV namespace for caching summaries (optional)

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `pdfjs-dist` | PDF rendering in browser |
| `mammoth` | .docx to HTML/text conversion |
| `xlsx` | Excel file parsing |
| `react-markdown` + `remark-gfm` + `rehype-highlight` | Markdown rendering with GFM and syntax highlighting |
| `react-dropzone` | Drag-and-drop file upload |
| `lucide-react` | Icons |

## Tailwind CSS v4

Uses the CSS-first configuration approach (no `tailwind.config.js`). Theme customization is in `src/index.css` via `@theme` blocks. The Vite plugin `@tailwindcss/vite` handles processing.

## Development Notes

- pdf.js worker is loaded from `node_modules` via import.meta.url — no separate worker file needed
- Text extraction for AI summary happens client-side for all formats except PDF (which extracts via pdf.js)
- The summary API truncates input to 12,000 characters to fit model context limits
- Office file parsing (mammoth, xlsx) runs entirely in the browser — no server-side conversion needed
