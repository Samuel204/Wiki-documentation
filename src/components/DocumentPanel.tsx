import { useEffect, useMemo, useRef, useState } from 'react'
import { renderMarkdown } from '../lib/markdown'
import type { WikiFile } from '../types/wiki'

interface DocumentPanelProps {
    file: WikiFile | null
    categories: string[]
    adminMode: boolean
    onUpdate: (updates: Partial<WikiFile>) => void
    onDelete: () => void
    onOpenInPlayground: (code: string) => void
}

export function DocumentPanel({
                                  file,
                                  categories,
                                  adminMode,
                                  onUpdate,
                                  onDelete,
                                  onOpenInPlayground,
                              }: DocumentPanelProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const contentRef = useRef<HTMLElement>(null)
    const [editing, setEditing] = useState(false)

    const [previousFileId, setPreviousFileId] = useState(file?.id)
    if (file?.id !== previousFileId) {
        setPreviousFileId(file?.id)
        setEditing(false)
    }

    const rendered = useMemo(
        () => (file ? renderMarkdown(file.content) : { html: '', examples: [] }),
        [file],
    )

    useEffect(() => {
        const container = contentRef.current
        if (!container) {
            return
        }

        function handleClick(event: MouseEvent) {
            const target = event.target as HTMLElement

            const tryBtn = target.closest<HTMLElement>('.try-example-btn')
            if (tryBtn) {
                const index = Number(tryBtn.dataset.exampleIndex)
                const example = rendered.examples[index]
                if (example) {
                    onOpenInPlayground(example.code)
                }
                return
            }

            const copyBtn = target.closest<HTMLButtonElement>('.copy-example-btn')
            if (copyBtn) {
                const index = Number(copyBtn.dataset.exampleIndex)
                const example = rendered.examples[index]
                if (!example) {
                    return
                }

                void navigator.clipboard?.writeText(example.code)
                copyBtn.classList.add('copied')
                const text = copyBtn.querySelector('.btn-text')
                const original = text?.textContent ?? 'Copia'
                if (text) {
                    text.textContent = 'Copiato'
                }
                window.setTimeout(() => {
                    copyBtn.classList.remove('copied')
                    if (text) {
                        text.textContent = original
                    }
                }, 1800)
            }
        }

        container.addEventListener('click', handleClick)
        return () => container.removeEventListener('click', handleClick)
    }, [rendered, onOpenInPlayground])

    if (!file) {
        return (
            <section className="document-panel empty-state">
                <div className="empty-illustration" aria-hidden="true">
                    <svg
                        className="empty-doc"
                        viewBox="0 0 24 24"
                        width="56"
                        height="56"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="8" y1="13" x2="16" y2="13" />
                        <line x1="8" y1="17" x2="13" y2="17" />
                    </svg>

                    <svg
                        className="empty-cap"
                        viewBox="0 0 24 24"
                        width="30"
                        height="30"
                        fill="currentColor"
                    >
                        <path d="M12 3 1 9l11 6 9-4.91V17h2V9z" />
                        <path d="M5 13.18v4L12 21l7-3.82v-4L12 17z" />
                    </svg>

                    <span className="empty-spark empty-spark-1">✦</span>
                    <span className="empty-spark empty-spark-2">✦</span>
                    <span className="empty-spark empty-spark-3">✦</span>
                </div>

                <h1 className="empty-title">
                    Benvenuto nella
                    <span className="empty-title-accent">Learning Wiki</span>
                </h1>

                <p className="empty-subtitle">
                    Una raccolta organizzata di appunti, esempi e concetti
                    per imparare e approfondire lo sviluppo web.
                </p>

                <span className="empty-rule" aria-hidden="true" />

                {adminMode && (
                    <div className="empty-info">
                        <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="12" cy="12" r="9" />
                            <line x1="12" y1="11" x2="12" y2="16" />
                            <line x1="12" y1="8" x2="12" y2="8" />
                        </svg>
                        In modalità Admin puoi caricare nuovi file .md.
                    </div>
                )}

                {adminMode && (
                    <button
                        className="empty-upload-button"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            width="17"
                            height="17"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M12 3v12" />
                            <polyline points="7 8 12 3 17 8" />
                            <path d="M5 21h14" />
                        </svg>
                        Carica file .md
                    </button>
                )}

                <p className="empty-hint">
                    Scegli un argomento dalla sidebar per iniziare.
                </p>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.markdown,text/markdown"
                    hidden
                />
            </section>
        )
    }

    function handleCategoryChange(
        event: React.ChangeEvent<HTMLSelectElement>,
    ) {
        onUpdate({ category: event.target.value })
    }

    function handleDelete() {
        if (!file) {
            return
        }

        if (window.confirm(`Eliminare il file "${file.title}"?`)) {
            onDelete()
        }
    }

    return (
        <section className="document-panel">
            <header className="document-header">
                <input
                    className="document-title"
                    value={file.title}
                    readOnly={!adminMode}
                    onChange={(event) => onUpdate({ title: event.target.value })}
                />

                <select
                    className="document-category"
                    value={file.category}
                    disabled={!adminMode}
                    onChange={handleCategoryChange}
                >
                    {categories.map((category) => (
                        <option value={category} key={category}>
                            {category}
                        </option>
                    ))}
                </select>

                {adminMode && (
                    <div className="document-actions">
                        <button
                            type="button"
                            onClick={() => setEditing((value) => !value)}
                        >
                            {editing ? 'Anteprima' : 'Modifica'}
                        </button>

                        <button
                            className="danger-button"
                            type="button"
                            onClick={handleDelete}
                        >
                            Elimina
                        </button>
                    </div>
                )}
            </header>

            {adminMode && editing ? (
                <textarea
                    className="document-editor"
                    value={file.content}
                    spellCheck={false}
                    onChange={(event) => onUpdate({ content: event.target.value })}
                />
            ) : (
                <article
                    ref={contentRef}
                    className="document-content markdown-body"
                    dangerouslySetInnerHTML={{ __html: rendered.html }}
                />
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,text/markdown"
                hidden
            />
        </section>
    )
}