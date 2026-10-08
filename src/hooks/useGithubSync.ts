// Hook che orchestra la sincronizzazione dell'AppState con GitHub Gist.
// Gestisce il caricamento/salvataggio delle impostazioni cifrate, i pull
// (pubblici in modalità viewer, autenticati in admin), i push con debounce,
// la creazione del gist e la sospensione temporanea in caso di rate-limit.

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
    AppMode,
    AppState,
    GithubSettings,
    SyncStatus,
} from '../types/wiki'
import {
    createRemoteGist,
    GistRateLimitError,
    parseGistId,
    pullFromRemote,
    pullPublic,
    pushToRemote,
    type RemoteData,
} from '../lib/github'
import {
    clearSettings,
    getPublicGistId,
    loadSettings,
    saveSettings,
} from '../lib/storage'

const PUSH_DEBOUNCE_MS = 1500

const EMPTY_SETTINGS: GithubSettings = { githubToken: '', gistId: '' }

interface UseGithubSyncOptions {
    /** Stato corrente dell'app, usato come sorgente per i push. */
    state: AppState
    /** Callback invocata quando un pull restituisce dati remoti validi. */
    onRemoteData: (data: RemoteData) => void
}

export function useGithubSync({ state, onRemoteData }: UseGithubSyncOptions) {
    const [settings, setSettings] = useState<GithubSettings>(EMPTY_SETTINGS)
    const [mode, setMode] = useState<AppMode>('viewer')
    const [status, setStatus] = useState<SyncStatus>('idle')
    const [error, setError] = useState<string | null>(null)
    const [rateLimitedUntil, setRateLimitedUntil] = useState<number>(0)
    const [ready, setReady] = useState(false)

    // Riferimenti sempre aggiornati per evitare dipendenze stantie nei callback.
    const stateRef = useRef(state)
    const settingsRef = useRef(settings)
    const onRemoteDataRef = useRef(onRemoteData)
    const pushTimerRef = useRef<number | null>(null)

    useEffect(() => {
        stateRef.current = state
    }, [state])

    useEffect(() => {
        settingsRef.current = settings
    }, [settings])

    useEffect(() => {
        onRemoteDataRef.current = onRemoteData
    }, [onRemoteData])

    // Caricamento iniziale delle impostazioni cifrate.
    useEffect(() => {
        let cancelled = false

        loadSettings()
            .then((loaded) => {
                if (cancelled) {
                    return
                }
                setSettings(loaded)
                setMode(loaded.githubToken ? 'admin' : 'viewer')
            })
            .catch(() => {
                if (!cancelled) {
                    setSettings(EMPTY_SETTINGS)
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setReady(true)
                }
            })

        return () => {
            cancelled = true
        }
    }, [])

    const isRateLimited = useCallback(() => {
        return rateLimitedUntil > Date.now()
    }, [rateLimitedUntil])

    const handleError = useCallback((err: unknown) => {
        if (err instanceof GistRateLimitError) {
            setRateLimitedUntil(err.resetAt)
            setError(err.message)
        } else {
            setError(err instanceof Error ? err.message : String(err))
        }
        setStatus('error')
    }, [])

    /**
     * Esegue un pull dei contenuti remoti. In modalità admin con token usa
     * l'endpoint autenticato, altrimenti ricade sul gist pubblico.
     */
    const pull = useCallback(async () => {
        const current = settingsRef.current
        const token = current.githubToken
        const gistId =
            parseGistId(current.gistId) || getPublicGistId()

        if (!gistId) {
            return
        }

        setStatus('syncing')
        setError(null)

        try {
            const data = token
                ? await pullFromRemote(token, gistId)
                : await pullPublic(gistId)

            if (data) {
                onRemoteDataRef.current(data)
            }
            setStatus('synced')
        } catch (err) {
            handleError(err)
        }
    }, [handleError])

    /**
     * Push immediato dello stato corrente verso il gist. Richiede token e
     * gistId; se è attivo un rate-limit l'operazione viene saltata.
     */
    const pushNow = useCallback(async () => {
        const current = settingsRef.current
        const token = current.githubToken
        const gistId = parseGistId(current.gistId)

        if (!token || !gistId) {
            return
        }

        if (isRateLimited()) {
            return
        }

        setStatus('syncing')
        setError(null)

        try {
            await pushToRemote(token, gistId, stateRef.current)
            setStatus('synced')
        } catch (err) {
            handleError(err)
        }
    }, [handleError, isRateLimited])

    /**
     * Push con debounce: raggruppa modifiche ravvicinate in un solo invio.
     */
    const schedulePush = useCallback(() => {
        if (mode !== 'admin') {
            return
        }

        if (pushTimerRef.current !== null) {
            window.clearTimeout(pushTimerRef.current)
        }

        pushTimerRef.current = window.setTimeout(() => {
            pushTimerRef.current = null
            void pushNow()
        }, PUSH_DEBOUNCE_MS)
    }, [mode, pushNow])

    useEffect(() => {
        return () => {
            if (pushTimerRef.current !== null) {
                window.clearTimeout(pushTimerRef.current)
            }
        }
    }, [])

    /**
     * Salva nuove impostazioni (cifrate) e aggiorna la modalità operativa.
     */
    const updateSettings = useCallback(
        async (next: GithubSettings) => {
            const normalized: GithubSettings = {
                githubToken: next.githubToken.trim(),
                gistId: next.gistId.trim(),
            }

            await saveSettings(normalized)
            setSettings(normalized)
            settingsRef.current = normalized
            setMode(normalized.githubToken ? 'admin' : 'viewer')
            setError(null)
        },
        [],
    )

    /**
     * Rimuove le credenziali e riporta l'app in modalità viewer.
     */
    const resetSettings = useCallback(() => {
        clearSettings()
        setSettings(EMPTY_SETTINGS)
        settingsRef.current = EMPTY_SETTINGS
        setMode('viewer')
        setError(null)
    }, [])

    /**
     * Crea un nuovo gist privato con lo stato corrente e salva l'ID ottenuto.
     * Restituisce l'ID creato.
     */
    const createGist = useCallback(async (): Promise<string> => {
        const token = settingsRef.current.githubToken

        if (!token) {
            throw new Error('Token GitHub mancante')
        }

        setStatus('syncing')
        setError(null)

        try {
            const newId = await createRemoteGist(token, stateRef.current)
            await updateSettings({ githubToken: token, gistId: newId })
            setStatus('synced')
            return newId
        } catch (err) {
            handleError(err)
            throw err
        }
    }, [handleError, updateSettings])

    return {
        settings,
        mode,
        setMode,
        status,
        error,
        ready,
        rateLimitedUntil,
        isRateLimited,
        pull,
        pushNow,
        schedulePush,
        updateSettings,
        resetSettings,
        createGist,
    }
}