import { useEffect } from 'react'
import { SAMPLES_PER_CYCLE } from '../engine/solver'
import { TOPOLOGY_ORDER } from '../engine/topologies'
import { useSimStore } from './useSimStore'

const SAMPLES_PER_DEGREE = SAMPLES_PER_CYCLE / 360

/**
 * Space plays, the horizontal arrows step the cursor, the vertical arrows
 * change α and the digits pick a converter. Keys aimed at a text field or a
 * slider are left alone, and Space is left to a focused button.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      const store = useSimStore.getState()
      const step = event.shiftKey ? 10 : 1

      switch (event.key) {
        case ' ':
          if (target?.closest('button')) return
          store.setPlaying(!store.playing)
          break
        case 'ArrowLeft':
        case 'ArrowRight':
          store.setPlaying(false)
          store.advance((event.key === 'ArrowRight' ? step : -step) * SAMPLES_PER_DEGREE)
          break
        case 'ArrowUp':
        case 'ArrowDown': {
          if (store.config.deviceMode === 'diode') return
          const delta = event.key === 'ArrowUp' ? step : -step
          store.setConfig({ alphaDeg: Math.min(180, Math.max(0, store.config.alphaDeg + delta)) })
          break
        }
        default: {
          const topology = TOPOLOGY_ORDER[Number(event.key) - 1]
          if (!/^[1-9]$/.test(event.key) || !topology) return
          store.setConfig({ topology })
        }
      }
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
