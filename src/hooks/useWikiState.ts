// src/hooks/useWikiState.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, WikiFile } from '../types/wiki'
import { loadCache, saveCache } from '../lib/storage'

const CACHE_DEBOUNCE_MS = 400
const DEFAULT_CATEGORY = 'Generale'

export const DEFAULT_PLAYGROUND_CODE = [
    'const { useState, useEffect, useRef, useMemo, useCallback } = React;',
    '',
    'function App() {',
    '  const [count, setCount] = useState(0);',
    '  const renders = useRef(0);',
    '  renders.current++;',
    '',
    '  useEffect(() => {',
    "    console.log('Count cambiato:', count);",
    '  }, [count]);',
    '',
    '  const doubled = useMemo(() => count * 2, [count]);',
    '  const increment = useCallback(() => setCount(c => c + 1), []);',
    '',
    '  return (',
    "    <div style={{ fontFamily: 'sans-serif', padding: 24, color: '#e6edf3' }}>",
    '      <h2>Playground pronto️</h2>',
    '      <p>Count: {count} (doppio: {doubled})</p>',
    "      <button onClick={increment} style={{ padding: '8px 14px', cursor: 'pointer' }}>+1</button>",
    "      <p style={{ marginTop: 12, fontSize: 12, color: '#8b96a3' }}>Render #{renders.current}</p>",
    '    </div>',
    '  );',
    '}',
    '',
    "ReactDOM.createRoot(document.getElementById('root')).render(<App />);",
    '',
].join('\n')

const initialState: AppState = {
    wiki: { categories: [DEFAULT_CATEGORY], files: [] },
    playground: { code: DEFAULT_PLAYGROUND_CODE, updatedAt: 0 },
}

function createId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function safeSaveCache(state: AppState): void {
    try {
        saveCache(state)
    } catch (err) {
        // QuotaExceededError o storage disabilitato: i dati restano in memoria.
        console.warn('Salvataggio cache non riuscito:', err)
    }
}

export function useWikiState() {
    const [state, setState] = useState<AppState>(() => loadCache(initialState))
    const [activeFileId, setActiveFileIdState] = useState<string | null>(null)
    const stateRef = useRef(state)

    // Cache locale con debounce (come la versione legacy).
    useEffect(() => {
        stateRef.current = state
        const timer = window.setTimeout(() => safeSaveCache(state), CACHE_DEBOUNCE_MS)
        return () => window.clearTimeout(timer)
    }, [state])

    // Flush alla chiusura della pagina e allo smontaggio.
    useEffect(() => {
        const flush = () => safeSaveCache(stateRef.current)
        window.addEventListener('pagehide', flush)
        return () => {
            window.removeEventListener('pagehide', flush)
            flush()
        }
    }, [])

    const files = state.wiki.files
    const categories = state.wiki.categories

    const activeFile = useMemo(
        () => files.find((file) => file.id === activeFileId) ?? null,
        [activeFileId, files],
    )

    const setActiveFileId = useCallback((id: string | null) => {
        setActiveFileIdState(id)
        if (!id) {
            return
        }
        setState((current) => ({
            ...current,
            wiki: {
                ...current.wiki,
                files: current.wiki.files.map((file) =>
                    file.id === id ? { ...file, recentlyOpenedAt: Date.now() } : file,
                ),
            },
        }))
    }, [])

    const updateFile = useCallback(
        (updates: Partial<Omit<WikiFile, 'id'>>) => {
            if (!activeFileId) {
                return
            }
            setState((current) => ({
                ...current,
                wiki: {
                    ...current.wiki,
                    files: current.wiki.files.map((file) =>
                        file.id === activeFileId
                            ? { ...file, ...updates, updatedAt: Date.now() }
                            : file,
                    ),
                },
            }))
        },
        [activeFileId],
    )

    /** Aggiunge un file e ne restituisce l'id (non lo apre). */
    const addFile = useCallback((title: string, content: string, category?: string): string => {
        const id = createId()

        setState((current) => {
            const target = category || current.wiki.categories[0] || DEFAULT_CATEGORY
            const nextCategories = current.wiki.categories.includes(target)
                ? current.wiki.categories
                : [...current.wiki.categories, target]

            const file: WikiFile = { id, title, content, category: target, updatedAt: Date.now() }

            return {
                ...current,
                wiki: { categories: nextCategories, files: [...current.wiki.files, file] },
            }
        })

        return id
    }, [])

    const createCategory = useCallback((name: string) => {
        const normalized = name.trim()
        if (!normalized) {
            return
        }
        setState((current) =>
            current.wiki.categories.includes(normalized)
                ? current
                : {
                    ...current,
                    wiki: { ...current.wiki, categories: [...current.wiki.categories, normalized] },
                },
        )
    }, [])

    const deleteCategory = useCallback((category: string) => {
        setState((current) => ({
            ...current,
            wiki: {
                categories: current.wiki.categories.filter((item) => item !== category),
                files: current.wiki.files.filter((file) => file.category !== category),
            },
        }))

        setActiveFileIdState((id) => {
            const file = id ? stateRef.current.wiki.files.find((item) => item.id === id) : null
            return file?.category === category ? null : id
        })
    }, [])

    const deleteFile = useCallback(() => {
        if (!activeFileId) {
            return
        }
        setState((current) => ({
            ...current,
            wiki: {
                ...current.wiki,
                files: current.wiki.files.filter((file) => file.id !== activeFileId),
            },
        }))
        setActiveFileIdState(null)
    }, [activeFileId])

    const updatePlayground = useCallback((code: string) => {
        setState((current) => ({ ...current, playground: { code, updatedAt: Date.now() } }))
    }, [])

    const applyRemoteData = useCallback(
        (remote: { wiki?: AppState['wiki']; playground?: AppState['playground'] }) => {
            setState((current) => ({
                wiki: remote.wiki ?? current.wiki,
                playground: remote.playground ?? current.playground,
            }))
        },
        [],
    )

    return {
        state,
        files,
        categories,
        activeFile,
        activeFileId,
        setActiveFileId,
        updateFile,
        addFile,
        createCategory,
        deleteCategory,
        deleteFile,
        updatePlayground,
        applyRemoteData,
    }
}