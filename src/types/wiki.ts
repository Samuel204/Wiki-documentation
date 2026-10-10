export interface WikiFile {
    id: string
    title: string
    category: string
    content: string
    updatedAt: number
    recentlyOpenedAt?: number
}

export interface WikiState {
    categories: string[]
    files: WikiFile[]
}

export interface PlaygroundExtraFile {
    id: string
    name: string
    code: string
}

export interface PlaygroundState {
    code: string
    updatedAt: number
    extraFiles?: PlaygroundExtraFile[]
}

export interface AppState {
    wiki: WikiState
    playground: PlaygroundState
}

export interface GithubSettings {
    githubToken: string
    gistId: string
}

export type AppMode = 'viewer' | 'admin'
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

/** Stato mostrato nell'indicatore della TopBar. */
export interface SyncInfo {
    status: SyncStatus
    text: string
    /** Dettaglio mostrato nel tooltip (es. messaggio d'errore). */
    detail?: string
}