import { create } from 'zustand'
import { DEFAULT_CONFIG, normalizeConfig } from '../engine/config'
import { DEFAULT_VISIBLE, type ChannelId } from '../engine/channels'
import { SAMPLES_PER_CYCLE } from '../engine/solver'
import { TOPOLOGIES } from '../engine/topologies'
import type { DeviceMode, SimConfig } from '../engine/types'
import type { ScopeMode } from '../components/Scope'

export interface SimState {
  config: SimConfig
  /** Sample index the schematic and scope cursors sit on. */
  playhead: number
  playing: boolean
  speed: number
  scopeMode: ScopeMode
  visibleChannels: ChannelId[]
  showAverage: boolean
  showGrid: boolean

  setConfig: (patch: Partial<SimConfig>) => void
  /**
   * Flips one device between diode and thyristor. Topologies only expose
   * whole-converter modes, so toggling a single upper device from an
   * all-diode bridge lands on the half-controlled arrangement.
   */
  toggleDevice: (deviceId: string) => void
  setPlayhead: (index: number) => void
  advance: (deltaSamples: number) => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  setScopeMode: (mode: ScopeMode) => void
  toggleChannel: (id: ChannelId) => void
  setShowAverage: (value: boolean) => void
  setShowGrid: (value: boolean) => void
  reset: () => void
}

export const useSimStore = create<SimState>((set, get) => ({
  config: DEFAULT_CONFIG,
  playhead: 0,
  playing: false,
  speed: 0.5,
  scopeMode: 'superimposed',
  visibleChannels: DEFAULT_VISIBLE,
  showAverage: true,
  showGrid: true,

  setConfig: (patch) => set({ config: normalizeConfig({ ...get().config, ...patch }) }),

  toggleDevice: (deviceId) => {
    const { config } = get()
    const topology = TOPOLOGIES[config.topology]
    const device = topology.devices.find((d) => d.id === deviceId)
    if (!device || !device.controllable) return

    let next: DeviceMode
    if (!topology.supportsSemi) {
      next = config.deviceMode === 'thyristor' ? 'diode' : 'thyristor'
    } else if (config.deviceMode === 'semi') {
      // The upper legs are the controlled ones, so clicking an upper device
      // takes the whole bridge to diodes and a lower device takes it to a
      // fully controlled bridge.
      next = device.group === 'upper' ? 'diode' : 'thyristor'
    } else if (config.deviceMode === 'thyristor') {
      next = device.group === 'lower' ? 'semi' : 'diode'
    } else {
      next = device.group === 'upper' ? 'semi' : 'thyristor'
    }
    set({ config: normalizeConfig({ ...config, deviceMode: next }) })
  },

  setPlayhead: (index) =>
    set({ playhead: Math.min(SAMPLES_PER_CYCLE - 1, Math.max(0, Math.round(index))) }),

  advance: (deltaSamples) =>
    set((state) => ({
      // Rounded, because the playhead indexes directly into the trace arrays.
      playhead:
        (((Math.round(state.playhead + deltaSamples) % SAMPLES_PER_CYCLE) + SAMPLES_PER_CYCLE) %
          SAMPLES_PER_CYCLE),
    })),

  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setScopeMode: (scopeMode) => set({ scopeMode }),

  toggleChannel: (id) =>
    set((state) => ({
      visibleChannels: state.visibleChannels.includes(id)
        ? state.visibleChannels.filter((c) => c !== id)
        : [...state.visibleChannels, id],
    })),

  setShowAverage: (showAverage) => set({ showAverage }),
  setShowGrid: (showGrid) => set({ showGrid }),
  reset: () => set({ config: DEFAULT_CONFIG, playhead: 0, playing: false }),
}))
