import DOMPurify from 'dompurify'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

const RUNNABLE_LANGS = new Set(['jsx', 'js', 'javascript', 'react'])

export interface CodeExample {
    code: string
    lang: string
}

export interface RenderedMarkdown {
    html: string
    examples: CodeExample[]
}

const COPY_ICON =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
const PLAY_ICON =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><polygon points="6 4 19 12 6 20"/></svg>'

// I link esterni si aprono in una nuova scheda.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && /^https?:\/\//i.test(node.getAttribute('href') ?? '')) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
    }
})

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function highlight(code: string, language: string): string {
    try {
        return language && hljs.getLanguage(language)
            ? hljs.highlight(code, { language, ignoreIllegals: true }).value
            : hljs.highlightAuto(code).value
    } catch {
        return escapeHtml(code)
    }
}

export function renderMarkdown(markdown: string): RenderedMarkdown {
    const examples: CodeExample[] = []
    const renderer = new marked.Renderer()

    renderer.code = ({ text, lang }) => {
        // "jsx title=App" → "jsx"
        const language = (lang ?? '').trim().split(/\s+/)[0].toLowerCase()
        // marked 18 può lasciare il "\n" finale: genererebbe una riga vuota numerata.
        const code = text.replace(/\n+$/, '')
        const highlighted = highlight(code, language)
        const langClass = language ? ` class="language-${escapeHtml(language)}"` : ''

        if (!RUNNABLE_LANGS.has(language)) {
            return `<pre><code${langClass}>${highlighted}</code></pre>`
        }

        const numbered = highlighted
            .split('\n')
            .map((line) => `<span class="code-line">${line || '&nbsp;'}</span>`)
            .join('')

        const index = examples.push({ code, lang: language }) - 1

        return (
            `<div class="code-example-wrap">` +
            `<div class="code-example-header">` +
            `<div class="code-example-meta">` +
            `<span class="lang-label">${escapeHtml(language)}</span>` +
            `<span class="example-kind">Esempio interattivo</span>` +
            `</div>` +
            `<div class="code-example-actions">` +
            `<button type="button" class="copy-example-btn" data-example-index="${index}" aria-label="Copia codice">` +
            `${COPY_ICON}<span class="btn-text">Copia</span></button>` +
            `<button type="button" class="try-example-btn" data-example-index="${index}">` +
            `${PLAY_ICON}<span class="btn-text">Apri nel Playground</span></button>` +
            `</div></div>` +
            `<pre><code${langClass}>${numbered}</code></pre>` +
            `</div>`
        )
    }

    const html = marked.parse(markdown || '', {
        renderer,
        gfm: true,
        breaks: true,
        async: false,
    }) as string

    const clean = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['data-example-index', 'type', 'target'],
    })

    return { html: clean, examples }
}