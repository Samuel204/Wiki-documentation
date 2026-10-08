import { useEffect, useRef, useState } from 'react'
import type { GithubSettings } from '../../types/wiki'
import {
    clearSettings,
    getPublicGistId,
    loadSettings,
    saveSettings,
} from '../../lib/storage'
import { isCryptoAvailable } from '../../lib/crypto'

interface SettingsModalProps {
    onClose: () => void
    onSaved?: (settings: GithubSettings) => void
    onCleared?: () => void
}

function CloseIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
    )
}

function EyeIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}

function EyeOffIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    )
}

export function SettingsModal({ onClose, onSaved, onCleared }: SettingsModalProps) {
    const [githubToken, setGithubToken] = useState('')
    const [gistId, setGistId] = useState('')
    const [showToken, setShowToken] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const dialogRef = useRef<HTMLDivElement>(null)
    const firstFieldRef = useRef<HTMLInputElement>(null)
    const savedTimeoutRef = useRef<number | undefined>(undefined)

    const publicGistId = getPublicGistId()
    const cryptoAvailable = isCryptoAvailable()

    useEffect(() => {
        let cancelled = false

        loadSettings()
            .then((settings) => {
                if (cancelled) {
                    return
                }
                setGithubToken(settings.githubToken)
                setGistId(settings.gistId)
            })
            .catch(() => {
                if (!cancelled) {
                    setError('Impossibile caricare le impostazioni salvate.')
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (!loading) {
            firstFieldRef.current?.focus()
        }
    }, [loading])

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    useEffect(() => {
        return () => {
            if (savedTimeoutRef.current) {
                window.clearTimeout(savedTimeoutRef.current)
            }
        }
    }, [])

    async function handleSave(event: React.FormEvent) {
        event.preventDefault()
        setError(null)
        setSaving(true)

        const nextSettings: GithubSettings = {
            githubToken: githubToken.trim(),
            gistId: gistId.trim(),
        }

        try {
            await saveSettings(nextSettings)
            setSaved(true)
            onSaved?.(nextSettings)

            if (savedTimeoutRef.current) {
                window.clearTimeout(savedTimeoutRef.current)
            }
            savedTimeoutRef.current = window.setTimeout(() => {
                setSaved(false)
            }, 2000)
        } catch {
            setError('Salvataggio non riuscito. Riprova.')
        } finally {
            setSaving(false)
        }
    }

    function handleClear() {
        if (!window.confirm('Rimuovere il token e il Gist ID salvati?')) {
            return
        }

        clearSettings()
        setGithubToken('')
        setGistId('')
        setSaved(false)
        setError(null)
        onCleared?.()
    }

    function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
        if (event.target === event.currentTarget) {
            onClose()
        }
    }

    return (
        <div
            className="settings-overlay"
            role="presentation"
            onMouseDown={handleOverlayClick}
        >
            <div
                ref={dialogRef}
                className="settings-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-title"
            >
                <header className="settings-header">
                    <div className="settings-heading">
                        <h2 id="settings-title">Impostazioni GitHub</h2>
                        <p className="settings-subtitle">
                            Collega un Gist per sincronizzare i contenuti della Wiki.
                        </p>
                    </div>

                    <button
                        className="icon-button settings-close"
                        type="button"
                        aria-label="Chiudi impostazioni"
                        onClick={onClose}
                    >
                        <CloseIcon />
                    </button>
                </header>

                {loading ? (
                    <div className="settings-loading">Caricamento impostazioni…</div>
                ) : (
                    <form className="settings-form" onSubmit={handleSave}>
                        <label className="settings-field">
                            <span className="settings-label">GitHub Token</span>
                            <div className="settings-input-group">
                                <input
                                    ref={firstFieldRef}
                                    type={showToken ? 'text' : 'password'}
                                    value={githubToken}
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder="ghp_…"
                                    onChange={(event) =>
                                        setGithubToken(event.target.value)
                                    }
                                />
                                <button
                                    className="settings-reveal"
                                    type="button"
                                    aria-label={
                                        showToken
                                            ? 'Nascondi token'
                                            : 'Mostra token'
                                    }
                                    onClick={() =>
                                        setShowToken((value) => !value)
                                    }
                                >
                                    {showToken ? <EyeOffIcon /> : <EyeIcon />}
                                </button>
                            </div>
                            <span className="settings-hint">
                                Serve un token con scope{' '}
                                <code>gist</code> per salvare le modifiche.
                            </span>
                        </label>

                        <label className="settings-field">
                            <span className="settings-label">Gist ID</span>
                            <input
                                type="text"
                                value={gistId}
                                autoComplete="off"
                                spellCheck={false}
                                placeholder={
                                    publicGistId
                                        ? `${publicGistId} (pubblico)`
                                        : 'ID del Gist…'
                                }
                                onChange={(event) =>
                                    setGistId(event.target.value)
                                }
                            />
                            <span className="settings-hint">
                                {publicGistId
                                    ? 'Lascia vuoto per usare il Gist pubblico predefinito.'
                                    : 'ID del Gist usato come storage remoto.'}
                            </span>
                        </label>

                        {!cryptoAvailable && (
                            <p className="settings-warning">
                                Web Crypto non disponibile: i dati verranno
                                salvati senza cifratura forte.
                            </p>
                        )}

                        {error && <p className="settings-error">{error}</p>}

                        <footer className="settings-actions">
                            <button
                                className="side-btn settings-clear"
                                type="button"
                                onClick={handleClear}
                            >
                                Rimuovi
                            </button>

                            <div className="settings-actions-right">
                                <button
                                    className="side-btn"
                                    type="button"
                                    onClick={onClose}
                                >
                                    Annulla
                                </button>

                                <button
                                    className="side-btn settings-save"
                                    type="submit"
                                    disabled={saving}
                                >
                                    {saving
                                        ? 'Salvataggio…'
                                        : saved
                                            ? 'Salvato ✓'
                                            : 'Salva'}
                                </button>
                            </div>
                        </footer>
                    </form>
                )}
            </div>
        </div>
    )
}