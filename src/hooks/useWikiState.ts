import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppState, WikiFile } from '../types/wiki'
import { loadCache, saveCache } from '../lib/storage'

export const DEFAULT_PLAYGROUND_CODE = `const { useState } = React;

function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h2>Playground React</h2>
      <p>Count: {count}</p>
      <button onClick={() => setCount((value) => value + 1)}>
        Incrementa
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);`

const initialState: AppState = {
    wiki: {
        categories: ['Generale'],
        files: [],
    },
    playground: {
        code: DEFAULT_PLAYGROUND_CODE,
        updatedAt: 0,
    },
}

function createId(): string {
    return `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 9)}`
}

export function useWikiState() {
    const [state, setState] = useState<AppState>(() =>
        loadCache(initialState),
    )
    const [activeFileId, setActiveFileIdState] = useState<string | null>(null)

    useEffect(() => {
        saveCache(state)
    }, [state])

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
                    file.id === id
                        ? { ...file, recentlyOpenedAt: Date.now() }
                        : file,
                ),
            },
        }))
    }, [])

    const updateFile = useCallback(
        (updates: Partial<WikiFile>) => {
            if (!activeFileId) {
                return
            }

            setState((current) => ({
                ...current,
                wiki: {
                    ...current.wiki,
                    files: current.wiki.files.map((file) =>
                        file.id === activeFileId
                            ? {
                                ...file,
                                ...updates,
                                updatedAt: Date.now(),
                            }
                            : file,
                    ),
                },
            }))
        },
        [activeFileId],
    )

    const addFile = useCallback(
        (title: string, content: string, category?: string) => {
            const targetCategory =
                category || categories[0] || 'Generale'

            setState((current) => {
                const nextCategories = current.wiki.categories.includes(targetCategory)
                    ? current.wiki.categories
                    : [...current.wiki.categories, targetCategory]

                const file: WikiFile = {
                    id: createId(),
                    title,
                    content,
                    category: targetCategory,
                    updatedAt: Date.now(),
                }

                return {
                    ...current,
                    wiki: {
                        categories: nextCategories,
                        files: [...current.wiki.files, file],
                    },
                }
            })
        },
        [categories],
    )

    const createCategory = useCallback((name: string) => {
        const normalizedName = name.trim()

        if (!normalizedName) {
            return
        }

        setState((current) => {
            if (current.wiki.categories.includes(normalizedName)) {
                return current
            }

            return {
                ...current,
                wiki: {
                    ...current.wiki,
                    categories: [...current.wiki.categories, normalizedName],
                },
            }
        })
    }, [])

    const deleteCategory = useCallback(
        (category: string) => {
            setState((current) => ({
                ...current,
                wiki: {
                    categories: current.wiki.categories.filter(
                        (item) => item !== category,
                    ),
                    files: current.wiki.files.filter(
                        (file) => file.category !== category,
                    ),
                },
            }))

            if (activeFile?.category === category) {
                setActiveFileId(null)
            }
        },
        [activeFile?.category],
    )

    const deleteFile = useCallback(() => {
        if (!activeFileId) {
            return
        }

        setState((current) => ({
            ...current,
            wiki: {
                ...current.wiki,
                files: current.wiki.files.filter(
                    (file) => file.id !== activeFileId,
                ),
            },
        }))

        setActiveFileId(null)
    }, [activeFileId])

    const updatePlayground = useCallback((code: string) => {
        setState((current) => ({
            ...current,
            playground: {
                code,
                updatedAt: Date.now(),
            },
        }))
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