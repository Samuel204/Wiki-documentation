import DOMPurify from 'dompurify'
import { marked } from 'marked'
import hljs from 'highlight.js'

const RUNNABLE_LANGS = ['jsx', 'js', 'javascript', 'react']

export interface CodeExample {
    code: string
    lang: string
}

export interface RenderedMarkdown {
    html: string
    examples: CodeExample[]
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

export function renderMarkdown(markdown: string): RenderedMarkdown {
    const examples: CodeExample[] = []

    const renderer = new marked.Renderer()

    renderer.code = ({ text, lang }) => {
        const language = (lang || '').toLowerCase()
        const runnable = RUNNABLE_LANGS.includes(language)

        let highlighted: string
        try {
            highlighted = hljs.getLanguage(language)
                ? hljs.highlight(text, { language }).value
                : hljs.highlightAuto(text).value
        } catch {
            highlighted = escapeHtml(text)
        }

        const numbered = highlighted
            .split('\n')
            .map((line) => `<span class="code-line">${line || '&nbsp;'}</span>`)
            .join('')

        const codeHtml = `<pre class="hljs"><code class="hljs language-${escapeHtml(
            language,
        )}">${numbered}</code></pre>`

        if (!runnable) {
            return codeHtml
        }

        const index = examples.push({ code: text, lang: language }) - 1

        return (
            `<div class="code-example-wrap" data-runnable="true" data-example-index="${index}">` +
            `<div class="code-example-header">` +
            `<div class="code-example-meta">` +
            `<span class="lang-label">${escapeHtml(language || 'code')}</span>` +
            `<span class="example-kind">Esempio interattivo</span>` +
            `</div>` +
            `<div class="code-example-actions">` +
            `<button type="button" class="copy-example-btn" data-example-index="${index}" aria-label="Copia codice">` +
            `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>` +
            `<span class="btn-text">Copia</span>` +
            `</button>` +
            `<button type="button" class="try-example-btn" data-example-index="${index}">` +
            `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><polygon points="6 4 19 12 6 20"/></svg>` +
            `<span class="btn-text">Apri nel Playground</span>` +
            `</button>` +
            `</div>` +
            `</div>` +
            codeHtml +
            `</div>`
        )
    }

    const html = marked.parse(markdown, { renderer }) as string

    const clean = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['data-runnable', 'data-example-index', 'class', 'type'],
    })

    return { html: clean, examples }
}