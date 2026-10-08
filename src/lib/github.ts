
// src/lib/github.ts
//
// Wrapper sulle API GitHub Gist usate per sincronizzare i contenuti della Wiki.
// Replica la logica dell'app legacy (pull pubblico/autenticato, push con PATCH,
// creazione gist, parsing errori e gestione del rate-limit) adattandola a un
// modulo tipizzato e privo di effetti collaterali sullo stato globale.

import type { AppState } from '../types/wiki'

export const GIST_API = 'https://api.github.com/gists'
export const GIST_FILENAME = 'learning-wiki-data.json'

/** Payload remoto: solo le parti sincronizzabili dell'AppState. */
export interface RemoteData {
    wiki?: AppState['wiki']
    playground?: AppState['playground']
}

/** Errore specializzato che trasporta eventuali info sul rate-limit. */
export class GistRateLimitError extends Error {
    readonly resetAt: number

    constructor(message: string, resetAt: number) {
        super(message)
        this.name = 'GistRateLimitError'
        this.resetAt = resetAt
    }
}

function buildAuthHeaders(token: string, extra?: Record<string, string>): HeadersInit {
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${token}`,
        ...extra,
    }
}

/**
 * Estrae un messaggio d'errore leggibile dalla risposta di GitHub, includendo
 * eventuali dettagli presenti nel body JSON.
 */
async function extractHttpError(response: Response): Promise<Error> {
    let detail = ''

    try {
        const text = await response.text()
        const json = JSON.parse(text) as {
            message?: string
            errors?: Array<{ message?: string; field?: string; code?: string }>
        }

        detail = json.message ?? ''

        if (json.errors?.length) {
            const parts = json.errors.map((item) =>
                item.message ?? `${item.field ?? ''} ${item.code ?? ''}`.trim(),
            )
            detail += ` (${parts.join('; ')})`
        }
    } catch {
        // Body non JSON: ci limitiamo allo status.
    }

    let message = `HTTP ${response.status}`
    if (response.statusText) {
        message += ` ${response.statusText}`
    }
    if (detail) {
        message += ` – ${detail}`
    }

    return new Error(message)
}

/**
 * Normalizza un Gist ID a partire da ID puro o da URL completo.
 * Restituisce null se l'input non contiene un ID valido.
 */
export function parseGistId(input: string): string | null {
    const trimmed = (input || '').trim()
    if (!trimmed) {
        return null
    }

    const withoutQuery = trimmed.split('?')[0].split('#')[0]
    const parts = withoutQuery.split('/').filter(Boolean)
    const last = parts[parts.length - 1] || withoutQuery

    return /^[0-9a-f]{10,40}$/i.test(last) ? last : null
}

async function readGistContent(file: {
    content?: string
    truncated?: boolean
    raw_url?: string
}): Promise<string> {
    if (file.truncated && file.raw_url) {
        const response = await fetch(file.raw_url)
        return response.text()
    }

    return file.content ?? ''
}

function parseRemoteData(text: string): RemoteData | null {
    try {
        const parsed = JSON.parse(text || '{}') as RemoteData
        return parsed && parsed.wiki ? parsed : null
    } catch {
        return null
    }
}

/**
 * Lettura pubblica (senza token) usata in modalità Viewer.
 */
export async function pullPublic(gistId: string): Promise<RemoteData | null> {
    if (!gistId) {
        return null
    }

    const response = await fetch(`${GIST_API}/${gistId}`)
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
    }

    const data = (await response.json()) as {
        files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>
    }
    const file = data.files?.[GIST_FILENAME]
    if (!file) {
        throw new Error('File non trovato nel gist')
    }

    const text = await readGistContent(file)
    return parseRemoteData(text)
}

/**
 * Lettura autenticata (modalità Admin).
 */
export async function pullFromRemote(
    token: string,
    gistId: string,
): Promise<RemoteData | null> {
    const response = await fetch(`${GIST_API}/${gistId}`, {
        headers: buildAuthHeaders(token),
    })

    if (!response.ok) {
        throw await extractHttpError(response)
    }

    const data = (await response.json()) as {
        files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>
    }
    const file = data.files?.[GIST_FILENAME]
    if (!file) {
        throw new Error('File non trovato nel gist')
    }

    const text = await readGistContent(file)
    return parseRemoteData(text)
}

/**
 * Aggiorna il Gist esistente con lo stato corrente (PATCH). In caso di
 * rate-limit (403 con X-RateLimit-Remaining = 0) lancia GistRateLimitError
 * con l'istante di reset per permettere al chiamante di sospendere i tentativi.
 */
export async function pushToRemote(
    token: string,
    gistId: string,
    state: AppState,
): Promise<void> {
    const response = await fetch(`${GIST_API}/${gistId}`, {
        method: 'PATCH',
        headers: buildAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            files: {
                [GIST_FILENAME]: { content: JSON.stringify(state) },
            },
        }),
    })

    if (!response.ok) {
        const remaining = response.headers.get('X-RateLimit-Remaining')
        const reset = response.headers.get('X-RateLimit-Reset')

        if (response.status === 403 && remaining === '0') {
            const resetTime = reset
                ? Number(reset) * 1000
                : Date.now() + 3_600_000
            // Margine di un minuto per evitare un nuovo 403 immediato.
            const message = (await extractHttpError(response)).message
            throw new GistRateLimitError(message, resetTime + 60_000)
        }

        throw await extractHttpError(response)
    }
}

/**
 * Crea un nuovo Gist privato con lo stato corrente e restituisce il suo ID.
 */
export async function createRemoteGist(
    token: string,
    state: AppState,
): Promise<string> {
    const response = await fetch(GIST_API, {
        method: 'POST',
        headers: buildAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            description: 'Learning Wiki - dati sincronizzati',
            public: false,
            files: {
                [GIST_FILENAME]: { content: JSON.stringify(state) },
            },
        }),
    })

    if (!response.ok) {
        throw await extractHttpError(response)
    }

    const data = (await response.json()) as { id?: string }
    if (!data.id) {
        throw new Error('Risposta inattesa dal server')
    }

    return data.id
}