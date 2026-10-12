import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../../engine/config'
import { simulate } from '../../engine/solver'
import { TOPOLOGIES, TOPOLOGY_ORDER } from '../../engine/topologies'
import type { SimConfig } from '../../engine/types'
import manifest from './figures/manifest.json'
import { flowKey, readFigure } from './state'

interface Entry {
  viewBox: number[]
  anchors: Record<string, unknown>
  devices: Record<string, number[]>
  flows: Record<string, string[]>
}

const ENTRIES = manifest as Record<string, Entry>
const SVGS = import.meta.glob<string>('./figures/*.svg', { query: '?raw', import: 'default', eager: true })
const LOADS: SimConfig['load'][] = ['R', 'RL', 'RLE']
const SOURCE_ANCHORS: Record<string, string[]> = {
  '1ph-half-wave': ['vs'],
  '1ph-bridge': ['vs'],
  '3ph-half-wave': ['va', 'vb', 'vc'],
  '3ph-bridge': ['va', 'vb', 'vc'],
}

function classes(svg: string): Set<string> {
  return new Set(Array.from(svg.matchAll(/class="t-([^"]+)"/g), (m) => m[1]))
}

const variants = TOPOLOGY_ORDER.flatMap((topology) =>
  LOADS.flatMap((load) => [false, true].map((fwd) => ({ topology, load, fwd }))),
)

describe('generated figures', () => {
  it('cover every topology, load and freewheeling-diode setting', () => {
    expect(Object.keys(ENTRIES)).toHaveLength(variants.length)
    expect(Object.keys(SVGS)).toHaveLength(variants.length)
  })

  for (const { topology, load, fwd } of variants) {
    const key = `${topology}__${load}__${fwd ? 'fw' : 'nofw'}`
    const devices = TOPOLOGIES[topology].devices

    it(`${key} draws and tags every part`, () => {
      const entry = ENTRIES[key]
      const tags = classes(SVGS[`./figures/${key}.svg`])

      for (const d of devices) {
        expect(tags, `${d.id} thyristor symbol`).toContain(`d-${d.id}-S`)
        expect(tags, `${d.id} diode symbol`).toContain(`d-${d.id}-D`)
        expect(entry.devices[d.id], `${d.id} hit box`).toHaveLength(4)
      }
      expect(tags.has('d-FW-D')).toBe(fwd)

      const parts = ['R', ...(load !== 'R' ? ['L'] : []), ...(load === 'RLE' ? ['E'] : [])]
      for (const p of ['R', 'L', 'E']) {
        expect(tags.has(`p-${p}`), `p-${p}`).toBe(parts.includes(p))
        expect(p in entry.anchors, `${p} readout`).toBe(parts.includes(p))
      }
      for (const a of ['io', 'vo', ...SOURCE_ANCHORS[topology]]) {
        expect(entry.anchors, `${a} readout`).toHaveProperty(a)
      }

      // Every path names only drawn parts, and every drawn wire can light up.
      const lit = new Set(Object.values(entry.flows).flat())
      for (const tag of lit) expect(tags, tag).toContain(tag)
      for (const tag of tags) {
        if (!tag.startsWith('d-')) expect(lit, `${tag} is never on a current path`).toContain(tag)
      }
      expect('fw' in entry.flows).toBe(true)
    })
  }

  // Every conduction state the solver can reach must have a drawn current path.
  const modes: SimConfig['deviceMode'][] = ['diode', 'thyristor', 'semi']
  for (const topology of TOPOLOGY_ORDER) {
    it(`${topology} has a current path for every conduction state`, () => {
      const missing = new Set<string>()
      for (const deviceMode of modes) {
        if (deviceMode === 'semi' && !TOPOLOGIES[topology].supportsSemi) continue
        for (const load of LOADS) {
          for (const fwd of [false, true]) {
            for (const alphaDeg of [0, 45, 100, 160]) {
              const config: SimConfig = { ...DEFAULT_CONFIG, topology, deviceMode, load, fwd, alphaDeg, E: 60 }
              const trace = simulate(config)
              const entry = ENTRIES[`${topology}__${load}__${fwd ? 'fw' : 'nofw'}`]
              for (let index = 0; index < trace.states.length; index++) {
                const figure = readFigure({ trace, config, index })
                const state = flowKey(trace, figure)
                if (state && !entry.flows[state]?.length) missing.add(`${state} (${deviceMode}, ${load})`)
              }
            }
          }
        }
      }
      expect([...missing]).toEqual([])
    })
  }
})
