<div align="center">

<img src="public/hero.png" width="120" alt="DocuSync">

# DocuSync

**Preview & summarize any document with AI**

</div>

## Why

Every day we deal with PDFs, Word docs, Excel sheets, and slide decks scattered across tools. DocuSync brings them into one clean browser view — upload a file, preview it instantly, and get an AI-powered summary in seconds. No plugins, no installs, no account required.

## See it

| **PDF** · Full text rendering with page navigation | **Word** · Clean HTML conversion with TOC support | **Excel** · Spreadsheet parsing with sheet tabs |
|:---:|:---:|:---:|
| ![PDF](https://img.shields.io/badge/PDF-ef4444?style=flat-square&logo=adobeacrobatreader&logoColor=white) | ![Word](https://img.shields.io/badge/Word-2b579a?style=flat-square&logo=microsoftword&logoColor=white) | ![Excel](https://img.shields.io/badge/Excel-217346?style=flat-square&logo=microsoftexcel&logoColor=white) |

| **PowerPoint** · Slide deck preview with navigation | **Markdown** · Syntax highlighted rendering | **AI Summary** · One-click intelligent summary |
|:---:|:---:|:---:|
| ![PPT](https://img.shields.io/badge/PPT-b7472a?style=flat-square&logo=microsoftpowerpoint&logoColor=white) | ![Markdown](https://img.shields.io/badge/Markdown-000000?style=flat-square&logo=markdown&logoColor=white) | ![AI](https://img.shields.io/badge/AI-1B365D?style=flat-square&logo=cloudflare&logoColor=white) |

## Usage

```bash
# Install
npm install

# Development
npm run dev              # Frontend only
npm run pages:dev        # Full stack with API

# Deploy
npm run deploy           # Worker + Pages
```

## Design

| Element | Choice |
|---------|--------|
| Frontend | React 19 · Vite · TypeScript · Tailwind CSS v4 |
| Backend | Cloudflare Worker · Hono |
| Storage | R2 (files) · D1 (metadata & cache) |
| AI | Cloudflare Workers AI · Llama 3.2 3B |
| PDF | pdf.js with web worker |
| Office | mammoth (Word) · xlsx (Excel) · DOMPurify (XSS safety) |
| Markdown | react-markdown · remark-gfm · rehype-highlight |
| Auth | Device-based (localStorage), optional email binding |

## Architecture

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│   Browser    │────▶│  CF Pages     │────▶│  CF Worker   │
│  React App   │     │  (Functions)  │     │  (Hono API)  │
└──────────────┘     └───────────────┘     └──────┬───────┘
                                                   │
                                          ┌────────┼────────┐
                                          ▼        ▼        ▼
                                        R2       D1       AI
                                      (files)  (meta)  (summary)
```

## License

MIT
