// src/components/DocumentPanel.tsx
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { renderMarkdown, type RenderedMarkdown } from '../lib/markdown'
import { useDismiss } from '../hooks/useDismiss'
import type { WikiFile } from '../types/wiki'

interface DocumentPanelProps {
    file: WikiFile | null
    categories: string[]
    adminMode: boolean
    className?: string
    onUpdate: (updates: Partial<Omit<WikiFile, 'id'>>) => void
    onDelete: () => void
    onUpload: () => void
    onOpenInPlayground: (code: string) => void
}

const EMPTY_RENDER: RenderedMarkdown = { html: '', examples: [] }

const COPY_BUTTON_HTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="btn-text">Copia</span>'
const COPIED_BUTTON_HTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span class="btn-text">Copiato</span>'

/* ---------------- Icone ---------------- */
function FolderIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
    )
}

function ChevronDownIcon({ size = 15 }: { size?: number }) {
    return (
        <svg className="chev-down" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

function CheckIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 12 10 17 19 7" />
        </svg>
    )
}

function PencilIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    )
}

function EyeIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}

function TrashIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
        </svg>
    )
}

/* ---------------- Utility ---------------- */
async function copyToClipboard(text: string): Promise<void> {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
}

const copyTimers = new WeakMap<HTMLButtonElement, number>()

function showCopiedState(button: HTMLButtonElement) {
    window.clearTimeout(copyTimers.get(button))
    button.classList.add('copied')
    button.setAttribute('aria-label', 'Codice copiato')
    button.innerHTML = COPIED_BUTTON_HTML

    copyTimers.set(
        button,
        window.setTimeout(() => {
            button.classList.remove('copied')
            button.setAttribute('aria-label', 'Copia codice')
            button.innerHTML = COPY_BUTTON_HTML
        }, 1800),
    )
}

/* ---------------- Selettore categoria ---------------- */
interface CategoryPickerProps {
    value: string
    categories: string[]
    disabled: boolean
    onChange: (category: string) => void
}

function CategoryPicker({ value, categories, disabled, onChange }: CategoryPickerProps) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useDismiss(ref, open, () => setOpen(false))

    return (
        <div ref={ref} className={`category-picker ${open ? 'open' : ''}`}>
            <button
                className="category-picker-toggle"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label="Cambia categoria"
                disabled={disabled || categories.length === 0}
                onClick={() => setOpen((current) => !current)}
            >
                <FolderIcon className="category-icon" />
                <span className="category-label">{value || 'Categoria'}</span>
                {!disabled && <ChevronDownIcon />}
            </button>

            {open && (
                <div className="category-dropdown" role="listbox" aria-label="Categorie">
                    {categories.map((category) => {
                        const selected = category === value
                        return (
                            <button
                                key={category}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`category-option ${selected ? 'selected' : ''}`}
                                onClick={() => {
                                    setOpen(false)
                                    if (!selected) {
                                        onChange(category)
                                    }
                                }}
                            >
                                <span className="option-name">{category}</span>
                                {selected && (
                                    <span className="check">
                                        <CheckIcon />
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

/* ---------------- Menu Azioni ---------------- */
interface ActionsMenuProps {
    editing: boolean
    onToggleEdit: () => void
    onDelete: () => void
}

function ActionsMenu({ editing, onToggleEdit, onDelete }: ActionsMenuProps) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useDismiss(ref, open, () => setOpen(false))

    const select = (action: () => void) => () => {
        setOpen(false)
        action()
    }

    return (
        <div ref={ref} className={`actions-menu ${open ? 'open' : ''}`}>
            <button
                className="icon-btn actions-toggle"
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
            >
                Azioni
                <ChevronDownIcon size={12} />
            </button>

            {open && (
                <div className="actions-dropdown" role="menu">
                    <button className="actions-item" type="button" role="menuitem" onClick={select(onToggleEdit)}>
                        {editing ? <EyeIcon /> : <PencilIcon />}
                        {editing ? 'Anteprima' : 'Modifica'}
                    </button>
                    <button className="actions-item danger" type="button" role="menuitem" onClick={select(onDelete)}>
                        <TrashIcon />
                        Elimina
                    </button>
                </div>
            )}
        </div>
    )
}

/* ---------------- Stato vuoto ---------------- */
function EmptyState({ adminMode, className, onUpload }: { adminMode: boolean; className?: string; onUpload: () => void }) {
    return (
        <section className={`document-panel empty-state ${className ?? ''}`}>
            <div className="empty-illustration" aria-hidden="true">
                <svg className="empty-doc" viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="13" y2="17" />
                </svg>
                <svg className="empty-cap" viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
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
                Una raccolta organizzata di appunti, esempi e concetti per imparare e
                approfondire lo sviluppo web.
            </p>

            <span className="empty-rule" aria-hidden="true" />

            {adminMode && (
                <>
                    <div className="empty-info">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="9" />
                            <line x1="12" y1="11" x2="12" y2="16" />
                            <line x1="12" y1="8" x2="12" y2="8" />
                        </svg>
                        In modalità Admin puoi caricare nuovi file .md.
                    </div>

                    <button className="empty-upload-button" type="button" onClick={onUpload}>
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3v12" />
                            <polyline points="7 8 12 3 17 8" />
                            <path d="M5 21h14" />
                        </svg>
                        Carica file .md
                    </button>
                </>
            )}

            <p className="empty-hint">Scegli un argomento dalla sidebar per iniziare.</p>
        </section>
    )
}

/* ---------------- Pannello ---------------- */
export function DocumentPanel({
                                  file,
                                  categories,
                                  adminMode,
                                  className,
                                  onUpdate,
                                  onDelete,
                                  onUpload,
                                  onOpenInPlayground,
                              }: DocumentPanelProps) {
    const bodyRef = useRef<HTMLDivElement>(null)
    const [editing, setEditing] = useState(false)
    const [previousFileId, setPreviousFileId] = useState(file?.id)

    // Cambio file → torna in anteprima.
    if (file?.id !== previousFileId) {
        setPreviousFileId(file?.id)
        setEditing(false)
    }

    const isEditing = adminMode && editing
    const content = file?.content ?? ''

    // Durante la modifica l'anteprima è nascosta: niente render a ogni tasto.
    const rendered = useMemo(
        () => (isEditing ? EMPTY_RENDER : renderMarkdown(content)),
        [content, isEditing],
    )

    // Cambio file → scroll in cima.
    useEffect(() => {
        bodyRef.current?.scrollTo({ top: 0 })
    }, [file?.id])

    if (!file) {
        return <EmptyState adminMode={adminMode} className={className} onUpload={onUpload} />
    }

    function handleContentClick(event: MouseEvent<HTMLElement>) {
        const target = event.target as HTMLElement

        const tryButton = target.closest<HTMLButtonElement>('.try-example-btn')
        if (tryButton) {
            const example = rendered.examples[Number(tryButton.dataset.exampleIndex)]
            if (example) {
                onOpenInPlayground(example.code)
            }
            return
        }

        const copyButton = target.closest<HTMLButtonElement>('.copy-example-btn')
        if (copyButton) {
            const example = rendered.examples[Number(copyButton.dataset.exampleIndex)]
            if (example) {
                copyToClipboard(example.code)
                    .then(() => showCopiedState(copyButton))
                    .catch((err: unknown) => console.warn('Copia non riuscita:', err))
            }
        }
    }

    function handleDelete() {
        if (file && window.confirm(`Eliminare il file "${file.title}"?`)) {
            onDelete()
        }
    }

    return (
        <section className={`document-panel ${className ?? ''}`}>
            <header className="document-header">
                <input
                    className="document-title"
                    value={file.title}
                    placeholder="Titolo file"
                    aria-label="Titolo file"
                    readOnly={!adminMode}
                    tabIndex={adminMode ? 0 : -1}
                    onChange={(event) => onUpdate({ title: event.target.value })}
                />

                <CategoryPicker
                    value={file.category}
                    categories={categories}
                    disabled={!adminMode}
                    onChange={(category) => onUpdate({ category })}
                />

                {adminMode && (
                    <ActionsMenu
                        editing={editing}
                        onToggleEdit={() => setEditing((current) => !current)}
                        onDelete={handleDelete}
                    />
                )}
            </header>

            <div className="document-body" ref={bodyRef}>
                {isEditing ? (
                    <textarea
                        className="document-editor"
                        value={file.content}
                        spellCheck={false}
                        aria-label="Contenuto Markdown"
                        onChange={(event) => onUpdate({ content: event.target.value })}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                                setEditing(false)
                            }
                        }}
                    />
                ) : (
                    <article
                        className="document-content markdown-body"
                        onClick={handleContentClick}
                        dangerouslySetInnerHTML={{ __html: rendered.html }}
                    />
                )}
            </div>
        </section>
    )
}