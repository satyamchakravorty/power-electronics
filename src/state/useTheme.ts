import { create } from 'zustand'
import { applyThemeMode, type ThemeMode } from '../theme'

const STORAGE_KEY = 'rectifier-lab-theme'

function initialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const startMode = initialMode()
applyThemeMode(startMode)

export const useTheme = create<{ mode: ThemeMode; toggle: () => void }>((set, get) => ({
  mode: startMode,
  toggle: () => {
    const mode = get().mode === 'dark' ? 'light' : 'dark'
    applyThemeMode(mode)
    window.localStorage.setItem(STORAGE_KEY, mode)
    set({ mode })
  },
}))
