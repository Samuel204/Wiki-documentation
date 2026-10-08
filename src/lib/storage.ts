// src/lib/storage.ts

import type { AppState, GithubSettings } from '../types/wiki'
import { decryptString, encryptString } from './crypto'

export const STORAGE_KEYS = {
    settings: 'lw_settings_v5',
    cache: 'lw_cache_v1',
    layout: 'lw_layout_v1',
    sidebar: 'lw_sidebar_collapsed_v1',
} as const

const LEGACY_SETTINGS_KEY = 'lw_settings_v4'

/**
 * Gist ID pubblico iniettato in fase di build (Vercel / .env).
 * In modalità Viewer i contenuti vengono letti da questo Gist senza token.
 */
export function getPublicGistId(): string {
    const fromEnv = import.meta.env.VITE_PUBLIC_GIST_ID as string | undefined
    if (fromEnv && fromEnv.trim()) {
        return fromEnv.trim()
    }

    const meta =
        typeof document !== 'undefined'
            ? document
                .querySelector('meta[name="gist-public-id"]')
                ?.getAttribute('content')
            : null

    return meta?.trim() ?? ''
}

interface StoredSettings {
    // Campi cifrati (nuovo formato v5)
    githubToken?: string
    gistId?: string
}

const EMPTY_SETTINGS: GithubSettings = { githubToken: '', gistId: '' }

/**
 * Carica le impostazioni GitHub decifrandole. Supporta il formato legacy v4
 * (dati in chiaro) migrandolo automaticamente al formato cifrato v5.
 */
export async function loadSettings(): Promise<GithubSettings> {
    const raw = localStorage.getItem(STORAGE_KEYS.settings)

    if (raw) {
        try {
            const parsed = JSON.parse(raw) as StoredSettings
            const [githubToken, gistId] = await Promise.all([
                decryptString(parsed.githubToken ?? ''),
                decryptString(parsed.gistId ?? ''),
            ])
            return { githubToken, gistId }
        } catch {
            return { ...EMPTY_SETTINGS }
        }
    }

    // Migrazione dal vecchio formato in chiaro.
    const legacyRaw = localStorage.getItem(LEGACY_SETTINGS_KEY)
    if (legacyRaw) {
        try {
            const legacy = JSON.parse(legacyRaw) as GithubSettings
            const migrated: GithubSettings = {
                githubToken:
                    typeof legacy.githubToken === 'string'
                        ? legacy.githubToken
                        : '',
                gistId: typeof legacy.gistId === 'string' ? legacy.gistId : '',
            }
            await saveSettings(migrated)
            localStorage.removeItem(LEGACY_SETTINGS_KEY)
            return migrated
        } catch {
            localStorage.removeItem(LEGACY_SETTINGS_KEY)
        }
    }

    return { ...EMPTY_SETTINGS }
}

/**
 * Salva le impostazioni GitHub cifrando token e Gist ID prima di scriverli
 * in localStorage.
 */
export async function saveSettings(settings: GithubSettings): Promise<void> {
    const [githubToken, gistId] = await Promise.all([
        encryptString(settings.githubToken ?? ''),
        encryptString(settings.gistId ?? ''),
    ])

    const payload: StoredSettings = { githubToken, gistId }
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(payload))
}

export function clearSettings(): void {
    localStorage.removeItem(STORAGE_KEYS.settings)
    localStorage.removeItem(LEGACY_SETTINGS_KEY)
}

export function loadCache(fallback: AppState): AppState {
    const raw = localStorage.getItem(STORAGE_KEYS.cache)

    if (!raw) {
        return fallback
    }

    try {
        const parsed = JSON.parse(raw)

        return {
            wiki: {
                categories: Array.isArray(parsed.wiki?.categories)
                    ? parsed.wiki.categories
                    : fallback.wiki.categories,
                files: Array.isArray(parsed.wiki?.files)
                    ? parsed.wiki.files
                    : fallback.wiki.files,
            },
            playground: {
                code:
                    typeof parsed.playground?.code === 'string'
                        ? parsed.playground.code
                        : fallback.playground.code,
                updatedAt:
                    typeof parsed.playground?.updatedAt === 'number'
                        ? parsed.playground.updatedAt
                        : fallback.playground.updatedAt,
            },
        }
    } catch {
        return fallback
    }
}

export function saveCache(state: AppState): void {
    localStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(state))
}