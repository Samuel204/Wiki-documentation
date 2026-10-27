import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { GithubSettings } from '../../types/wiki'
import { getPublicGistId } from '../../lib/storage'
import { isCryptoAvailable } from '../../lib/crypto'
import { CloseIcon, VisibilityIcon } from '../icons'


interface SettingsModalProps {
    settings: GithubSettings
    lastError: string
    onClose: () => void
    /** Verifica e salva; lancia Error con messaggio leggibile. */
    onConnect: (settings: GithubSettings) => Promise<void>
    onCreateGist: (token: string) => Promise<string>
    onReset: () => void
}

interface StatusMessage {
    kind: 'info' | 'ok' | 'error'
    text: string
}

function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

export function SettingsModal({ settings, lastError, onClose, onConnect, onCreateGist, onReset }: SettingsModalProps) {
    // Il token salvato non viene mai mostrato: campo vuoto = mantieni quello esistente.
    const [token, setToken] = useState('')
    const [gistId, setGistId] = useState(settings.gistId)
    const [showToken, setShowToken] = useState(false)
    const [busy, setBusy] = useState<'save' | 'create' | null>(null)
    const [message, setMessage] = useState<StatusMessage | null>(
        lastError ? { kind: 'error', text: `Ultimo errore: ${lastError}` } : null,
    )

    const tokenRef = useRef<HTMLInputElement>(null)
    const closeTimerRef = useRef<number | undefined>(undefined)

    const publicGistId = getPublicGistId()
    const hasSavedToken = Boolean(settings.githubToken)
    const hasCredentials = hasSavedToken || Boolean(settings.gistId)
    const cryptoAvailable = isCryptoAvailable()

    useEffect(() => {
        tokenRef.current?.focus()
    }, [])

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape' && !busy) {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose, busy])

    useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

    async function handleSave(event: FormEvent) {
        event.preventDefault()
        setBusy('save')
        setMessage({ kind: 'info', text: 'Verifica connessione al Gist...' })

        try {
            await onConnect({ githubToken: token, gistId })
            setToken('')
            setMessage({ kind: 'ok', text: 'Connesso! Dati caricati.' })
            closeTimerRef.current = window.setTimeout(onClose, 900)
        } catch (err) {
            setMessage({ kind: 'error', text: messageOf(err) })
        } finally {
            setBusy(null)
        }
    }

    async function handleCreateGist() {
        setBusy('create')
        setMessage({ kind: 'info', text: 'Creazione nuovo Gist in corso...' })

        try {
            const newId = await onCreateGist(token)
            setGistId(newId)
            setToken('')
            setMessage({ kind: 'ok', text: 'Gist creato e collegato con lo stato corrente!' })
        } catch (err) {
            setMessage({ kind: 'error', text: messageOf(err) })
        } finally {
            setBusy(null)
        }
    }

    function handleReset() {
        if (!window.confirm("Rimuovere token e Gist ID salvati? L'app tornerà in modalità Viewer.")) {
            return
        }
        onReset()
        setToken('')
        setGistId('')
        setMessage({ kind: 'info', text: 'Credenziali rimosse.' })
    }

    return (
        <div
            className="settings-overlay"
            role="presentation"
            onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
        >
            <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
                <header className="settings-header">
                    <div className="settings-heading">
                        <h2 id="settings-title">Impostazioni sincronizzazione</h2>
                        <p className="settings-subtitle">
                            File e codice del Playground vengono salvati in un{' '}
                            <a href="https://gist.github.com" target="_blank" rel="noopener noreferrer">Gist GitHub</a>{' '}
                            privato. Serve un token con scope <code>gist</code>:{' '}
                            <a
                                href="https://github.com/settings/tokens/new?scopes=gist&description=Learning%20Wiki"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                crealo qui
                            </a>
                            , poi premi “Crea nuovo Gist” oppure incolla l'ID/URL di un Gist esistente.
                        </p>
                    </div>

                    <button className="icon-button settings-close" type="button" aria-label="Chiudi impostazioni" onClick={onClose}>
                        <CloseIcon />
                    </button>
                </header>

                <form className="settings-form" onSubmit={handleSave}>
                    <label className="settings-field">
                        <span className="settings-label">GitHub Token (scope “gist”)</span>
                        <div className="settings-input-group">
                            <input
                                ref={tokenRef}
                                type={showToken ? 'text' : 'password'}
                                value={token}
                                autoComplete="off"
                                spellCheck={false}
                                placeholder={hasSavedToken ? '•••••• salvato — lascia vuoto per mantenerlo' : 'ghp_...'}
                                onChange={(event) => setToken(event.target.value)}
                            />
                            <button
                                className="settings-reveal"
                                type="button"
                                aria-label={showToken ? 'Nascondi token' : 'Mostra token'}
                                onClick={() => setShowToken((value) => !value)}
                            >
                                <VisibilityIcon off={showToken} />
                            </button>
                        </div>
                    </label>

                    <label className="settings-field">
                        <span className="settings-label">Gist ID (o URL)</span>
                        <input
                            type="text"
                            value={gistId}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={publicGistId ? `${publicGistId} (predefinito)` : 'generato automaticamente...'}
                            onChange={(event) => setGistId(event.target.value)}
                        />
                        {publicGistId && (
                            <span className="settings-hint">Lascia vuoto per usare il Gist predefinito.</span>
                        )}
                    </label>

                    {!cryptoAvailable && (
                        <p className="settings-warning">
                            Web Crypto non disponibile: le credenziali verranno salvate senza cifratura forte.
                        </p>
                    )}

                    {message && (
                        <p className={`settings-status settings-status-${message.kind}`} role="status">
                            {message.text}
                        </p>
                    )}

                    <footer className="settings-actions">
                        {hasCredentials ? (
                            <button className="side-btn settings-clear" type="button" disabled={Boolean(busy)} onClick={handleReset}>
                                Rimuovi
                            </button>
                        ) : (
                            <span />
                        )}

                        <div className="settings-actions-right">
                            <button className="side-btn" type="button" disabled={Boolean(busy)} onClick={handleCreateGist}>
                                {busy === 'create' ? 'Creazione…' : 'Crea nuovo Gist'}
                            </button>
                            <button className="side-btn settings-save" type="submit" disabled={Boolean(busy)}>
                                {busy === 'save' ? 'Verifica…' : 'Salva'}
                            </button>
                        </div>
                    </footer>
                </form>
            </div>
        </div>
    )
}