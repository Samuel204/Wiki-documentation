// Logica del completamento inline ("ghost text") del Playground.
// Non dipende da CodeMirror: riceve il testo della riga prima del cursore
// e la lista di identificatori già presenti nel documento.

/** Parole di base: Hook React, globali del Playground, keyword JS, API DOM. */
export const PG_BASE_WORDS: readonly string[] = [
    // Hook React
    'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback',
    'useContext', 'useReducer', 'useLayoutEffect', 'useImperativeHandle',

    // Globali del Playground
    'React', 'ReactDOM', 'createRoot', 'render', 'console',

    // Keyword / costrutti JavaScript
    'const', 'let', 'var', 'function', 'return', 'if', 'else',
    'for', 'while', 'switch', 'case', 'break', 'continue',
    'try', 'catch', 'finally', 'throw', 'new', 'typeof',
    'instanceof', 'delete', 'void', 'class', 'extends', 'super',
    'import', 'export', 'default', 'from', 'async', 'await',
    'yield', 'true', 'false', 'null', 'undefined', 'this',

    // API DOM
    'getElementById', 'getElementsByClassName', 'getElementsByTagName',
    'querySelector', 'querySelectorAll',
    'createElement', 'createTextNode', 'createDocumentFragment',
    'addEventListener', 'removeEventListener',
    'requestAnimationFrame', 'cancelAnimationFrame',

    // Proprietà/metodi DOM frequenti
    'innerHTML', 'outerHTML', 'textContent', 'innerText',
    'value', 'checked', 'disabled', 'className', 'classList',
    'style', 'id', 'title', 'name', 'dataset',
    'getAttribute', 'setAttribute', 'removeAttribute',
    'appendChild', 'removeChild', 'replaceChild',
    'append', 'prepend', 'remove', 'before', 'after',
    'closest', 'matches', 'contains',
    'focus', 'blur', 'click',
]

const ELEMENT_WORDS: readonly string[] = [
    'innerHTML', 'outerHTML', 'textContent', 'innerText',
    'value', 'checked', 'disabled', 'className', 'classList',
    'style', 'id', 'title', 'name', 'dataset',
    'getAttribute', 'setAttribute', 'removeAttribute',
    'addEventListener', 'removeEventListener',
    'appendChild', 'removeChild', 'replaceChild',
    'append', 'prepend', 'remove', 'before', 'after',
    'closest', 'matches', 'contains',
    'focus', 'blur', 'click',
]

/** Suggerimenti contestuali dopo `oggetto.` */
export const PG_CONTEXT_WORDS: ReadonlyMap<string, readonly string[]> = new Map([
    ['document', [
        'getElementById', 'getElementsByClassName', 'getElementsByTagName',
        'querySelector', 'querySelectorAll',
        'createElement', 'createTextNode', 'createDocumentFragment',
        'addEventListener', 'removeEventListener',
        'body', 'head', 'documentElement', 'title', 'cookie',
        'forms', 'images', 'links', 'scripts',
    ]],
    ['window', [
        'document', 'console', 'localStorage', 'sessionStorage',
        'location', 'history', 'navigator', 'innerWidth', 'innerHeight',
        'alert', 'confirm', 'prompt',
        'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'requestAnimationFrame', 'cancelAnimationFrame',
        'addEventListener', 'removeEventListener',
    ]],
    ['console', [
        'log', 'info', 'warn', 'error', 'debug', 'clear', 'table',
        'time', 'timeEnd', 'group', 'groupEnd',
    ]],
    ['React', [
        'createElement', 'cloneElement', 'createContext',
        'forwardRef', 'memo', 'lazy', 'Fragment',
    ]],
    ['ReactDOM', ['createRoot', 'hydrateRoot', 'createPortal', 'flushSync']],
    ['element', ELEMENT_WORDS],
    ['el', ELEMENT_WORDS],
    ['node', [
        'textContent', 'nodeName', 'nodeType', 'parentNode',
        'parentElement', 'childNodes', 'children',
        'firstChild', 'lastChild', 'appendChild',
        'removeChild', 'replaceChild', 'contains',
    ]],
])

/** Identificatore digitato immediatamente prima del cursore. */
const TYPED_RE = /(?:^|[^\w$])([A-Za-z_$][\w$]*)$/
/** `oggetto.` immediatamente prima dell'identificatore digitato. */
const CONTEXT_RE = /(?:^|[^\w$])([A-Za-z_$][\w$]*)\.$/
const IDENTIFIER_RE = /[A-Za-z_$][\w$]*/g

export function findMatchingSuffix(
    candidates: Iterable<string>,
    typed: string,
): string | null {
    for (const word of candidates) {
        if (word !== typed && word.startsWith(typed)) {
            return word.slice(typed.length)
        }
    }
    return null
}

/** Estrae gli identificatori unici presenti nel codice. */
export function collectIdentifiers(text: string): string[] {
    return Array.from(new Set(text.match(IDENTIFIER_RE) ?? []))
}

/**
 * Restituisce il suffisso da mostrare come ghost text, oppure null.
 * @param beforeCursor testo della riga corrente fino al cursore
 * @param documentIdentifiers identificatori presenti nel documento
 */
export function findGhostSuffix(
    beforeCursor: string,
    documentIdentifiers: readonly string[],
): string | null {
    const typedMatch = beforeCursor.match(TYPED_RE)
    if (!typedMatch) {
        return null
    }

    const typed = typedMatch[1]
    const prefix = beforeCursor.slice(0, beforeCursor.length - typed.length)

    // Contesto noto (document., console., React., ...) → solo parole del contesto.
    const contextMatch = prefix.match(CONTEXT_RE)
    const contextWords = contextMatch ? PG_CONTEXT_WORDS.get(contextMatch[1]) : undefined
    if (contextWords) {
        return findMatchingSuffix(contextWords, typed)
    }

    // Fallback: parole di base, poi identificatori del documento.
    return (
        findMatchingSuffix(PG_BASE_WORDS, typed) ??
        findMatchingSuffix(documentIdentifiers, typed)
    )
}