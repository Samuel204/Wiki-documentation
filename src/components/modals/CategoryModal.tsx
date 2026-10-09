// src/components/modals/CategoryModal.tsx
import { useEffect, useRef, useState, type FormEvent } from 'react'

interface CategoryModalProps {
    existing: string[]
    onClose: () => void
    onConfirm: (name: string) => void
}

export function CategoryModal({ existing, onClose, onConfirm }: CategoryModalProps) {
    const [name, setName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    function handleSubmit(event: FormEvent) {
        event.preventDefault()
        const trimmed = name.trim()

        if (!trimmed) {
            setError('Inserisci un nome.')
            return
        }
        if (existing.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
            setError('Esiste già una categoria con questo nome.')
            return
        }

        onConfirm(trimmed)
        onClose()
    }

    return (
        <div
            className="settings-overlay"
            role="presentation"
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <div className="settings-dialog category-dialog" role="dialog" aria-modal="true" aria-labelledby="category-title">
                <header className="settings-header">
                    <div className="settings-heading">
                        <h2 id="category-title">Nuova categoria</h2>
                    </div>
                </header>

                <form className="settings-form" onSubmit={handleSubmit}>
                    <label className="settings-field">
                        <span className="settings-label">Nome categoria</span>
                        <input
                            ref={inputRef}
                            type="text"
                            value={name}
                            placeholder="es. React"
                            maxLength={60}
                            onChange={(event) => {
                                setName(event.target.value)
                                setError(null)
                            }}
                        />
                    </label>

                    {error && <p className="settings-error">{error}</p>}

                    <footer className="settings-actions settings-actions-end">
                        <button className="side-btn settings-clear" type="button" onClick={onClose}>
                            Annulla
                        </button>
                        <button className="side-btn settings-save" type="submit">
                            Crea
                        </button>
                    </footer>
                </form>
            </div>
        </div>
    )
}