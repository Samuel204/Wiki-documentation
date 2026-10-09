// Sincronizzazione dell'AppState con GitHub Gist.
// - Viewer: pull pubblico senza token.
// - Admin: pull autenticato + push con debounce (60 s, come la versione legacy).
// - Il push parte solo se il contenuto è cambiato davvero: aprire un file o
//   ricevere dati dal pull non genera push inutili.
// - Gestione del limite di richieste con nuovo tentativo automatico.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AppMode, AppState, GithubSettings, SyncInfo } from '../types/wiki'
import {
    createRemoteGist,
    GistRateLimitError,
    parseGistId,
    pullFromRemote,
    pullPublic,
    pushToRemote,
    type RemoteData,
} from '../lib/github'
import { clearSettings, getPublicGistId, loadSettings, saveSettings } from '../lib/storage'

const PUSH_DEBOUNCE_MS = 60_000
const EMPTY_SETTINGS: GithubSettings = { githubToken: '', gistId: '' }
const SYNC_IDLE: SyncInfo = { status: 'idle', text: 'non configurato' }
const SYNC_DONE: SyncInfo = { status: 'synced', text: 'sincronizzato' }
const SYNC_PENDING: SyncInfo = { status: 'syncing', text: 'in attesa...' }

function resolveGistId(settings: GithubSettings): string | null {
    return parseGistId(settings.gistId) ?? parseGistId(getPublicGistId())
}

/** Firma economica del contenuto sincronizzabile (ignora recentlyOpenedAt). */
function contentSignature(state: AppState): string {
    const files = state.wiki.files
        .map((file) => `${file.id}:${file.updatedAt}:${file.category}`)
        .join('|')
    return `${state.wiki.categories.join('\u0000')}#${files}#${state.playground.updatedAt}`
}

function mergeRemote(state: AppState, data: RemoteData): AppState {
    return {
        wiki: data.wiki ?? state.wiki,
        playground: data.playground ?? state.playground,
    }
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

function wantsAdminFromUrl(): boolean {
    return new URLSearchParams(window.location.search).get('admin') === '1'
}

function rateLimitInfo(until: number): SyncInfo {
    const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60_000))
    return {
        status: 'error',
        text: 'limite GitHub raggiunto',
        detail: `Nuovo tentativo tra circa ${minutes} minuti.`,
    }
}

interface UseGithubSyncOptions {
    state: AppState
    onRemoteData: (data: RemoteData) => void
}

export function useGithubSync({ state, onRemoteData }: UseGithubSyncOptions) {
    const [settings, setSettings] = useState<GithubSettings>(EMPTY_SETTINGS)
    const [mode, setMode] = useState<AppMode>('viewer')
    const [sync, setSync] = useState<SyncInfo>(SYNC_IDLE)
    const [lastError, setLastError] = useState('')
    const [ready, setReady] = useState(false)

    const stateRef = useRef(state)
    const onRemoteDataRef = useRef(onRemoteData)
    const settingsRef = useRef<GithubSettings>(EMPTY_SETTINGS)
    const modeRef = useRef<AppMode>('viewer')
    const pushTimerRef = useRef<number | null>(null)
    const blockedUntilRef = useRef(0)
    const lastSyncedSigRef = useRef<string | null>(null)
    const pushNowRef = useRef<() => Promise<boolean>>(async () => false)

    useLayoutEffect(() => {
        stateRef.current = state
        onRemoteDataRef.current = onRemoteData
    })

    const applySettings = useCallback((next: GithubSettings) => {
        settingsRef.current = next
        setSettings(next)
    }, [])

    const applyMode = useCallback((next: AppMode) => {
        modeRef.current = next
        setMode(next)
    }, [])

    const clearPushTimer = useCallback(() => {
        if (pushTimerRef.current !== null) {
            window.clearTimeout(pushTimerRef.current)
            pushTimerRef.current = null
        }
    }, [])

    const armPushTimer = useCallback(
        (delay: number) => {
            clearPushTimer()
            pushTimerRef.current = window.setTimeout(() => {
                pushTimerRef.current = null
                void pushNowRef.current()
            }, Math.max(0, delay))
        },
        [clearPushTimer],
    )

    const reportError = useCallback((err: unknown, text: string) => {
        const message = errorMessage(err)
        console.warn(`[sync] ${text}:`, err)

        if (err instanceof GistRateLimitError) {
            blockedUntilRef.current = err.resetAt
            setSync(rateLimitInfo(err.resetAt))
        } else {
            setSync({ status: 'error', text, detail: message })
        }
        setLastError(message)
    }, [])

    /** Applica i dati remoti e allinea la firma dell'ultimo stato sincronizzato. */
    const acceptRemote = useCallback((data: RemoteData | null) => {
        if (data) {
            lastSyncedSigRef.current = contentSignature(mergeRemote(stateRef.current, data))
            onRemoteDataRef.current(data)
        } else {
            lastSyncedSigRef.current = contentSignature(stateRef.current)
        }
    }, [])

    /* ---------------- PULL ---------------- */
    const pull = useCallback(async (): Promise<boolean> => {
        const { githubToken } = settingsRef.current
        const gistId = resolveGistId(settingsRef.current)

        if (!gistId) {
            setSync(SYNC_IDLE)
            return false
        }

        const authenticated = modeRef.current === 'admin' && Boolean(githubToken)
        setSync({
            status: 'syncing',
            text: authenticated ? 'sincronizzazione...' : 'caricamento...',
        })

        try {
            const data = authenticated
                ? await pullFromRemote(githubToken, gistId)
                : await pullPublic(gistId)
            acceptRemote(data)
            setSync(SYNC_DONE)
            return true
        } catch (err) {
            reportError(err, authenticated ? 'errore lettura' : 'errore caricamento')
            return false
        }
    }, [acceptRemote, reportError])

    /* ---------------- PUSH ---------------- */
    const pushNow = useCallback(async (): Promise<boolean> => {
        clearPushTimer()

        const { githubToken } = settingsRef.current
        const gistId = resolveGistId(settingsRef.current)
        if (modeRef.current !== 'admin' || !githubToken || !gistId) {
            return false
        }

        if (Date.now() < blockedUntilRef.current) {
            setSync(rateLimitInfo(blockedUntilRef.current))
            armPushTimer(blockedUntilRef.current - Date.now())
            return false
        }

        const snapshot = stateRef.current
        const signature = contentSignature(snapshot)
        setSync({ status: 'syncing', text: 'salvataggio...' })

        try {
            await pushToRemote(githubToken, gistId, snapshot)
            lastSyncedSigRef.current = signature
            setLastError('')

            // Modifiche arrivate durante il push → nuovo giro.
            if (contentSignature(stateRef.current) !== signature) {
                setSync(SYNC_PENDING)
                armPushTimer(PUSH_DEBOUNCE_MS)
            } else {
                setSync(SYNC_DONE)
            }
            return true
        } catch (err) {
            reportError(err, 'errore salvataggio')
            if (err instanceof GistRateLimitError) {
                armPushTimer(err.resetAt - Date.now())
            }
            return false
        }
    }, [armPushTimer, clearPushTimer, reportError])

    useLayoutEffect(() => {
        pushNowRef.current = pushNow
    }, [pushNow])

    /* ---------------- INIT ---------------- */
    useEffect(() => {
        let cancelled = false

        void (async () => {
            let loaded = EMPTY_SETTINGS
            try {
                loaded = await loadSettings()
            } catch {
                // impostazioni corrotte: si riparte da vuoto
            }
            if (cancelled) {
                return
            }

            applySettings(loaded)
            applyMode(loaded.githubToken || wantsAdminFromUrl() ? 'admin' : 'viewer')
            lastSyncedSigRef.current = contentSignature(stateRef.current)
            setReady(true)
            await pull()
        })()

        return () => {
            cancelled = true
        }
    }, [applyMode, applySettings, pull])

    /* ------- Push pianificato a ogni modifica reale del contenuto ------- */
    useEffect(() => {
        if (!ready || mode !== 'admin') {
            return
        }

        if (contentSignature(state) === lastSyncedSigRef.current) {
            if (pushTimerRef.current !== null) {
                clearPushTimer()
                setSync(SYNC_DONE)
            }
            return
        }

        if (!settingsRef.current.githubToken || !resolveGistId(settingsRef.current)) {
            setSync(SYNC_IDLE)
            return
        }

        if (Date.now() < blockedUntilRef.current) {
            setSync(rateLimitInfo(blockedUntilRef.current))
            armPushTimer(blockedUntilRef.current - Date.now())
            return
        }

        setSync(SYNC_PENDING)
        armPushTimer(PUSH_DEBOUNCE_MS)
    }, [state, mode, ready, armPushTimer, clearPushTimer])

    // Tab nascosta (cambio app su mobile, chiusura) → push immediato se in sospeso.
    useEffect(() => {
        const flush = () => {
            if (document.visibilityState === 'hidden' && pushTimerRef.current !== null) {
                void pushNowRef.current()
            }
        }
        document.addEventListener('visibilitychange', flush)
        return () => {
            document.removeEventListener('visibilitychange', flush)
            clearPushTimer()
        }
    }, [clearPushTimer])

    /* ---------------- AZIONI ---------------- */

    /**
     * Verifica token + Gist con un pull autenticato; solo se riesce salva le
     * impostazioni e attiva la modalità Admin. Lancia Error con messaggio leggibile.
     */
    const connect = useCallback(
        async (input: GithubSettings) => {
            const tokenInput = input.githubToken.trim()
            if (/^https?:\/\//i.test(tokenInput)) {
                throw new Error('Il campo Token contiene un URL, non un token. Incolla solo il token GitHub.')
            }

            // Campo vuoto → mantiene il token già salvato (come la versione legacy).
            const githubToken = tokenInput || settingsRef.current.githubToken
            if (!githubToken) {
                throw new Error('Inserisci il GitHub Token.')
            }

            const gistId = input.gistId.trim()
                ? parseGistId(input.gistId)
                : resolveGistId(settingsRef.current)
            if (!gistId) {
                throw new Error('Gist ID/URL non valido.')
            }

            setSync({ status: 'syncing', text: 'sincronizzazione...' })

            let data: RemoteData | null
            try {
                data = await pullFromRemote(githubToken, gistId)
            } catch (err) {
                reportError(err, 'errore lettura')
                throw new Error(
                    `Non riesco a leggere questo Gist (${errorMessage(err)}). Controlla token/ID, oppure creane uno nuovo.`,
                    { cause: err },
                )
            }

            const next: GithubSettings = { githubToken, gistId }
            await saveSettings(next)
            clearPushTimer()
            applySettings(next)
            applyMode('admin')
            acceptRemote(data)
            setLastError('')
            setSync(SYNC_DONE)
        },
        [acceptRemote, applyMode, applySettings, clearPushTimer, reportError],
    )

    /** Crea un Gist privato con lo stato corrente e lo collega. */
    const createGist = useCallback(
        async (tokenInput: string): Promise<string> => {
            const githubToken = tokenInput.trim() || settingsRef.current.githubToken
            if (!githubToken) {
                throw new Error('Inserisci prima il GitHub Token.')
            }
            if (/^https?:\/\//i.test(githubToken)) {
                throw new Error('Il campo Token contiene un URL, non un token.')
            }

            setSync({ status: 'syncing', text: 'creazione...' })

            let gistId: string
            try {
                gistId = await createRemoteGist(githubToken, stateRef.current)
            } catch (err) {
                reportError(err, 'errore creazione')
                throw new Error(
                    `Errore durante la creazione del Gist (${errorMessage(err)}). Il token ha lo scope "gist"?`,
                    { cause: err },
                )
            }

            const next: GithubSettings = { githubToken, gistId }
            await saveSettings(next)
            applySettings(next)
            applyMode('admin')
            lastSyncedSigRef.current = contentSignature(stateRef.current)
            setLastError('')
            setSync(SYNC_DONE)
            return gistId
        },
        [applyMode, applySettings, reportError],
    )

    /** Admin → Viewer: invia le modifiche in sospeso, poi rimuove il token. */
    const exitAdmin = useCallback(async () => {
        if (pushTimerRef.current !== null) {
            await pushNow()
        }
        clearPushTimer()

        const next: GithubSettings = { githubToken: '', gistId: settingsRef.current.gistId }
        await saveSettings(next)
        applySettings(next)
        applyMode('viewer')
        setSync(resolveGistId(next) ? SYNC_DONE : SYNC_IDLE)
    }, [applyMode, applySettings, clearPushTimer, pushNow])

    /** Rimuove tutte le credenziali. */
    const resetSettings = useCallback(() => {
        clearPushTimer()
        clearSettings()
        applySettings(EMPTY_SETTINGS)
        applyMode('viewer')
        setLastError('')
        setSync(resolveGistId(EMPTY_SETTINGS) ? SYNC_DONE : SYNC_IDLE)
    }, [applyMode, applySettings, clearPushTimer])

    return {
        settings,
        mode,
        sync,
        lastError,
        ready,
        /** Nessun Gist (né personale né pubblico): serve la configurazione iniziale. */
        needsSetup: ready && !resolveGistId(settings),
        pull,
        pushNow,
        connect,
        createGist,
        exitAdmin,
        resetSettings,
    }
}