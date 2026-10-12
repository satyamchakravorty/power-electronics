import type { ReactNode } from 'react'
import type { TopologyId } from '../engine/types'

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const PlayIcon = () => (
  <Icon>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
  </Icon>
)

export const PauseIcon = () => (
  <Icon>
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
  </Icon>
)

export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </Icon>
)

export const MoonIcon = () => (
  <Icon>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
)

export const ScopeIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M6 13c1.5 0 1.5-5 3-5s1.5 7 3 7 1.5-5 3-5 1.5 3 3 3" />
    <path d="M8 21h8" />
  </Icon>
)

export const CircuitIcon = () => (
  <Icon>
    <path d="M3 12h4l2-5 3 10 2-5h7" />
  </Icon>
)

export const SlidersIcon = () => (
  <Icon>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Icon>
)

/** The brand mark: a sine wave folded into a rectified one. */
export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#logo-gradient)" />
      <path
        d="M5 21c2.2 0 2.8-10 5.5-10S13.3 21 16 21s2.8-10 5.5-10S24.8 21 27 21"
        fill="none"
        stroke="#06101c"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * The ideal output waveform of a topology over two supply cycles, used as the
 * thumbnail on its selector tab so the pulse count is visible before reading.
 */
export function TopologyGlyph({ topology }: { topology: TopologyId }) {
  const width = 64
  const height = 24
  const points: string[] = []
  const steps = 160
  for (let k = 0; k <= steps; k++) {
    const theta = (k / steps) * 4 * Math.PI
    const value = rectified(topology, theta)
    points.push(`${((k / steps) * width).toFixed(2)},${(height - 2 - value * (height - 5)).toFixed(2)}`)
  }
  return (
    <svg className="topology-glyph" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <line x1={0} y1={height - 2} x2={width} y2={height - 2} className="glyph-axis" />
      <polyline points={points.join(' ')} className="glyph-wave" />
    </svg>
  )
}

function rectified(topology: TopologyId, theta: number): number {
  const phase = (shift: number) => Math.sin(theta - shift)
  const third = (2 * Math.PI) / 3
  switch (topology) {
    case '1ph-half-wave':
      return Math.max(0, phase(0))
    case '1ph-bridge':
      return Math.abs(phase(0))
    case '3ph-bridge': {
      const values = [phase(0), phase(third), phase(-third)]
      return (Math.max(...values) - Math.min(...values)) / Math.sqrt(3)
    }
  }
}
