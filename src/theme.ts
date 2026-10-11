/**
 * Colours shared between the stylesheet and the canvas renderers. The canvas
 * cannot read CSS custom properties cheaply during a draw, so these are the
 * single source of truth and `index.css` mirrors them for each mode.
 */
export type ThemeMode = 'dark' | 'light'

const PALETTES = {
  dark: {
    bg: '#060912',
    panel: '#0c1220',
    panelAlt: '#111a2c',
    screen: '#050810',
    border: '#1b2640',
    grid: '#131d31',
    gridStrong: '#22304c',
    text: '#e7edf8',
    muted: '#8390a9',
    accent: '#38bdf8',
    warn: '#fbbf24',
    danger: '#f87171',
    good: '#34d399',
  },
  light: {
    bg: '#f3f6fb',
    panel: '#ffffff',
    panelAlt: '#f7f9fc',
    screen: '#fcfdff',
    border: '#dde4ef',
    grid: '#e8edf5',
    gridStrong: '#c9d3e3',
    text: '#0f172a',
    muted: '#5b6880',
    accent: '#0284c7',
    warn: '#b45309',
    danger: '#dc2626',
    good: '#059669',
  },
}

/** Traces need more weight on a white screen, so light mode gets deeper hues. */
const CHANNELS = {
  dark: {
    vsA: '#fbbf24',
    vsB: '#a78bfa',
    vsC: '#34d399',
    vo: '#38bdf8',
    io: '#f472b6',
    is: '#2dd4bf',
    vDevice: '#94a3b8',
  },
  light: {
    vsA: '#d97706',
    vsB: '#7c3aed',
    vsC: '#059669',
    vo: '#0284c7',
    io: '#db2777',
    is: '#0d9488',
    vDevice: '#64748b',
  },
}

/**
 * The active palette. Mutated in place by `applyThemeMode`, so anything that
 * reads it during a draw must also re-render when the mode changes.
 */
export const theme = { ...PALETTES.dark }
export const channelColors = { ...CHANNELS.dark }

export type ChannelPalette = typeof CHANNELS.dark

export function channelPalette(mode: ThemeMode): ChannelPalette {
  return CHANNELS[mode]
}

export function applyThemeMode(mode: ThemeMode): void {
  Object.assign(theme, PALETTES[mode])
  Object.assign(channelColors, CHANNELS[mode])
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = mode
    document.documentElement.style.colorScheme = mode
  }
}

export const fonts = {
  sans: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
  mono: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const
