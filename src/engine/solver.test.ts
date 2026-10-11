import { describe, expect, it } from 'vitest'
import { analytical, assumptionsHold } from './analytical'
import { DEFAULT_CONFIG } from './config'
import { computeMetrics } from './metrics'
import { simulate } from './solver'
import { TOPOLOGY_ORDER, TOPOLOGIES } from './topologies'
import type { SimConfig } from './types'

function cfg(overrides: Partial<SimConfig>): SimConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}

function run(overrides: Partial<SimConfig>) {
  const config = cfg(overrides)
  return { metrics: computeMetrics(simulate(config)), theory: analytical(config), config }
}

/** Stiff inductance so the load current cannot reach zero. */
const CCM = { load: 'RL' as const, R: 10, L: 500 }
/** Purely resistive, so conduction is forced to stop at every zero crossing. */
const RES = { load: 'R' as const, R: 10, L: 0 }

const ALPHAS = [0, 15, 30, 45, 60, 75, 90]

describe('analytical agreement', () => {
  // Every expression flagged exact must be reproduced by the solver. This is
  // the guard against firing-angle reference-point mistakes, which are
  // otherwise invisible in a plot that merely looks plausible.
  const cases: Array<{ name: string; overrides: Partial<SimConfig> }> = []

  for (const topology of TOPOLOGY_ORDER) {
    cases.push({ name: `${topology} uncontrolled`, overrides: { topology, deviceMode: 'diode' } })
    for (const alphaDeg of ALPHAS) {
      cases.push({
        name: `${topology} resistive alpha=${alphaDeg}`,
        overrides: { topology, deviceMode: 'thyristor', alphaDeg, ...RES },
      })
      cases.push({
        name: `${topology} continuous alpha=${alphaDeg}`,
        overrides: { topology, deviceMode: 'thyristor', alphaDeg, ...CCM },
      })
      cases.push({
        name: `${topology} freewheeling alpha=${alphaDeg}`,
        overrides: { topology, deviceMode: 'thyristor', alphaDeg, fwd: true, ...CCM },
      })
      if (TOPOLOGIES[topology].supportsSemi) {
        cases.push({
          name: `${topology} semi alpha=${alphaDeg}`,
          overrides: { topology, deviceMode: 'semi', alphaDeg, ...CCM },
        })
      }
    }
  }

  for (const { name, overrides } of cases) {
    it(name, () => {
      const { metrics, theory, config } = run(overrides)
      // A continuous-conduction expression stops describing the circuit once a
      // passive load can no longer sustain current, so there is nothing to
      // compare in that region.
      if (!assumptionsHold(theory, metrics.discontinuous)) return
      // Scale the tolerance against the supply peak rather than against the
      // expected value, which passes through zero at 90 degrees.
      const scale = Math.max(Math.abs(theory.vdc as number), 0.02 * config.Vrms * Math.SQRT2)
      expect(Math.abs(metrics.vdc - (theory.vdc as number)) / scale).toBeLessThan(0.005)
    })
  }
})

describe('power balance', () => {
  // A passive load can only sit where the mean output voltage equals the mean
  // resistive drop plus the back-EMF. This holds regardless of topology or
  // conduction mode, so it is the strongest single check on the solver.
  for (const topology of TOPOLOGY_ORDER) {
    for (const alphaDeg of [0, 30, 60, 90, 120]) {
      it(`${topology} alpha=${alphaDeg} satisfies Vdc = Idc*R + E`, () => {
        const E = -150
        const { metrics } = run({ topology, alphaDeg, load: 'RLE', R: 12, L: 400, E })
        expect(Math.abs(metrics.vdc - (metrics.idc * 12 + E))).toBeLessThan(2)
      })
    }
  }
})

describe('uncontrolled rectifier reference values', () => {
  const Vm = 230 * Math.SQRT2

  it('single-phase half-wave averages Vm/pi', () => {
    const { metrics } = run({ topology: '1ph-half-wave', deviceMode: 'diode', ...RES })
    expect(metrics.vdc).toBeCloseTo(Vm / Math.PI, 1)
    expect(metrics.vrms).toBeCloseTo(Vm / 2, 1)
  })

  it('single-phase bridge averages 2Vm/pi', () => {
    const { metrics } = run({ topology: '1ph-bridge', deviceMode: 'diode', ...RES })
    expect(metrics.vdc).toBeCloseTo((2 * Vm) / Math.PI, 1)
    expect(metrics.vrms).toBeCloseTo(Vm / Math.SQRT2, 1)
  })

  it('centre-tapped full-wave matches the bridge', () => {
    const bridge = run({ topology: '1ph-bridge', deviceMode: 'diode', ...RES })
    const centreTap = run({ topology: '1ph-centre-tap', deviceMode: 'diode', ...RES })
    expect(centreTap.metrics.vdc).toBeCloseTo(bridge.metrics.vdc, 1)
  })

  it('three-phase half-wave averages 1.17 times phase RMS', () => {
    const { metrics } = run({ topology: '3ph-half-wave', deviceMode: 'diode', ...RES })
    expect(metrics.vdc).toBeCloseTo(1.17 * 230, 0)
  })

  it('three-phase bridge averages 1.35 times line RMS', () => {
    const { metrics } = run({ topology: '3ph-bridge', deviceMode: 'diode', ...RES })
    expect(metrics.vdc).toBeCloseTo(1.35 * Math.sqrt(3) * 230, 0)
  })
})

describe('firing angle behaviour', () => {
  it('a fully controlled bridge inverts beyond 90 degrees', () => {
    // Inversion needs a source on the DC side to push current against the
    // supply, so the load carries a negative back-EMF.
    const inverting = { load: 'RLE' as const, R: 10, L: 800, E: -250 }
    const peak = 230 * Math.SQRT2
    for (const alphaDeg of [90, 120, 150]) {
      const { metrics } = run({ topology: '1ph-bridge', alphaDeg, ...inverting })
      const expected = (2 * peak * Math.cos((alphaDeg * Math.PI) / 180)) / Math.PI
      expect(Math.abs(metrics.vdc - expected)).toBeLessThan(0.005 * peak)
      // Current keeps flowing out of the DC side regardless of voltage sign.
      expect(metrics.idc).toBeGreaterThan(0)
    }
    // At exactly 90 degrees the converter transfers no net power: the EMF
    // source supplies precisely what the load resistance dissipates. Past
    // that, power flows back into the supply.
    expect(run({ topology: '1ph-bridge', alphaDeg: 90, ...inverting }).metrics.pLoad).toBeCloseTo(
      0,
      -1,
    )
    for (const alphaDeg of [120, 150]) {
      expect(run({ topology: '1ph-bridge', alphaDeg, ...inverting }).metrics.pLoad).toBeLessThan(0)
    }
  })

  it('a three-phase bridge follows the cosine law right through inversion', () => {
    const peakLL = 3 * Math.sqrt(3) * 230 * Math.SQRT2
    for (const alphaDeg of [0, 30, 60, 90, 120, 135]) {
      const config = { topology: '3ph-bridge' as const, alphaDeg, load: 'RLE' as const }
      const { metrics } = run({ ...config, R: 10, L: 800, E: -420 })
      const expected = (peakLL * Math.cos((alphaDeg * Math.PI) / 180)) / Math.PI
      expect(Math.abs(metrics.vdc - expected)).toBeLessThan(0.005 * peakLL)
    }
  })

  it('a semi-converter never produces negative output', () => {
    for (const alphaDeg of [0, 45, 90, 135, 170]) {
      const trace = simulate(cfg({ topology: '1ph-bridge', deviceMode: 'semi', alphaDeg, ...CCM }))
      for (let k = 0; k < trace.vo.length; k++) expect(trace.vo[k]).toBeGreaterThan(-1e-6)
    }
  })

  it('a freewheeling diode clamps the negative excursion away', () => {
    const withoutFwd = simulate(cfg({ topology: '1ph-bridge', alphaDeg: 60, ...CCM }))
    const withFwd = simulate(cfg({ topology: '1ph-bridge', alphaDeg: 60, fwd: true, ...CCM }))
    let minWithout = Infinity
    let minWith = Infinity
    for (let k = 0; k < withoutFwd.vo.length; k++) {
      minWithout = Math.min(minWithout, withoutFwd.vo[k])
      minWith = Math.min(minWith, withFwd.vo[k])
    }
    expect(minWithout).toBeLessThan(-100)
    expect(minWith).toBeGreaterThan(-1e-6)
  })

  it('output falls monotonically as the firing angle increases', () => {
    let previous = Infinity
    for (const alphaDeg of [0, 20, 40, 60, 80, 100, 120, 140, 160]) {
      const { metrics } = run({ topology: '3ph-bridge', alphaDeg, load: 'RLE', R: 10, L: 800, E: -520 })
      expect(metrics.vdc).toBeLessThan(previous)
      previous = metrics.vdc
    }
  })

  it('a passive load cannot be driven negative however late the firing', () => {
    // Without a DC-side source there is nowhere for energy to come from, so
    // the converter stalls into discontinuous conduction instead of inverting.
    for (const alphaDeg of [100, 120, 150]) {
      const { metrics } = run({ topology: '3ph-bridge', alphaDeg, ...CCM })
      expect(metrics.vdc).toBeGreaterThanOrEqual(-1e-6)
      expect(metrics.discontinuous).toBe(true)
    }
  })
})

describe('load current', () => {
  it('stays continuous with large inductance and goes discontinuous without it', () => {
    const stiff = run({ topology: '1ph-bridge', alphaDeg: 60, ...CCM })
    const resistive = run({ topology: '1ph-bridge', alphaDeg: 60, ...RES })
    expect(stiff.metrics.discontinuous).toBe(false)
    expect(resistive.metrics.discontinuous).toBe(true)
  })

  it('never reverses through the switches', () => {
    for (const topology of TOPOLOGY_ORDER) {
      const trace = simulate(cfg({ topology, alphaDeg: 75, load: 'RL', R: 15, L: 120 }))
      for (let k = 0; k < trace.io.length; k++) expect(trace.io[k]).toBeGreaterThanOrEqual(0)
    }
  })

  it('obeys Ohm law instantaneously for a resistive load', () => {
    const trace = simulate(cfg({ topology: '1ph-bridge', alphaDeg: 30, ...RES }))
    for (let k = 0; k < trace.io.length; k++) {
      expect(trace.io[k]).toBeCloseTo(Math.max(0, trace.vo[k] / 10), 6)
    }
  })

  it('settles to steady state, so the cycle starts and ends at the same current', () => {
    for (const topology of TOPOLOGY_ORDER) {
      const trace = simulate(cfg({ topology, alphaDeg: 45, load: 'RL', R: 10, L: 300 }))
      const first = trace.io[0]
      const last = trace.io[trace.io.length - 1]
      expect(Math.abs(first - last)).toBeLessThan(0.02 * Math.max(1, first))
    }
  })
})

describe('supply-side quantities', () => {
  it('reports unity displacement factor for an uncontrolled bridge', () => {
    const { metrics } = run({ topology: '1ph-bridge', deviceMode: 'diode', ...CCM })
    expect(metrics.displacementFactor).toBeCloseTo(1, 2)
  })

  it('displacement factor follows cos(alpha) for a controlled bridge', () => {
    // The cos(alpha) identity assumes a ripple-free DC current, so this needs
    // a much stiffer load than the general continuous-conduction cases.
    const stiff = { load: 'RL' as const, R: 2, L: 3000 }
    for (const alphaDeg of [0, 30, 45, 60]) {
      const { metrics } = run({ topology: '1ph-bridge', alphaDeg, ...stiff })
      expect(metrics.displacementFactor).toBeCloseTo(Math.cos((alphaDeg * Math.PI) / 180), 2)
    }
  })

  it('a stiff single-phase bridge draws the textbook 48.3 percent THD', () => {
    // With ripple-free DC current the supply current is a square wave, whose
    // harmonics give THD = sqrt(pi^2/8 - 1) = 48.34 percent.
    const { metrics } = run({ topology: '1ph-bridge', alphaDeg: 30, load: 'RL', R: 2, L: 3000 })
    expect(metrics.thd).toBeCloseTo(Math.sqrt(Math.PI ** 2 / 8 - 1), 2)
  })

  it('a stiff six-pulse bridge draws the textbook 31.1 percent THD', () => {
    const { metrics } = run({ topology: '3ph-bridge', alphaDeg: 30, load: 'RL', R: 2, L: 3000 })
    expect(metrics.thd).toBeCloseTo(0.311, 2)
  })

  it('distortion and displacement factors multiply out to the power factor', () => {
    for (const alphaDeg of [0, 30, 60]) {
      const { metrics } = run({ topology: '1ph-bridge', alphaDeg, load: 'RL', R: 2, L: 3000 })
      const product = metrics.distortionFactor * metrics.displacementFactor
      expect(product).toBeCloseTo(metrics.powerFactor, 2)
    }
  })

  it('power factor never exceeds unity', () => {
    for (const topology of TOPOLOGY_ORDER) {
      for (const alphaDeg of [0, 45, 90]) {
        const { metrics } = run({ topology, alphaDeg, ...CCM })
        expect(metrics.powerFactor).toBeLessThanOrEqual(1.001)
      }
    }
  })
})

describe('device stress', () => {
  it('shares conduction equally between bridge devices', () => {
    const { metrics } = run({ topology: '3ph-bridge', deviceMode: 'diode', ...CCM })
    const spans = metrics.devices.map((d) => d.conductionDeg)
    for (const span of spans) expect(span).toBeCloseTo(120, 0)
  })

  it('peak inverse voltage is Vm for a bridge and 2Vm for a centre tap', () => {
    const Vm = 230 * Math.SQRT2
    const bridge = run({ topology: '1ph-bridge', deviceMode: 'diode', ...RES })
    const centreTap = run({ topology: '1ph-centre-tap', deviceMode: 'diode', ...RES })
    expect(bridge.metrics.piv).toBeCloseTo(Vm, 0)
    expect(centreTap.metrics.piv).toBeCloseTo(2 * Vm, 0)
  })

  it('device currents sum to the load current', () => {
    const trace = simulate(cfg({ topology: '3ph-bridge', alphaDeg: 45, ...CCM }))
    for (let k = 0; k < trace.io.length; k++) {
      let upper = 0
      for (const d of trace.topology.devices) {
        if (d.group === 'upper') upper += trace.deviceCurrent[d.id][k]
      }
      expect(upper + trace.deviceCurrent.D_FW[k]).toBeCloseTo(trace.io[k], 6)
    }
  })
})

describe('edge cases', () => {
  it('closed form goes to zero once no supply voltage is positive at the firing instant', () => {
    for (const [topology, alphaDeg] of [
      ['3ph-half-wave', 170],
      ['3ph-bridge', 150],
    ] as const) {
      const { metrics, theory } = run({ topology, alphaDeg, ...RES })
      expect(theory.vdc).toBe(0)
      expect(metrics.vdc).toBeCloseTo(0, 6)
    }
  })

  it('fires every phase identically, so the output has exact pulse symmetry', () => {
    const trace = simulate(cfg({ topology: '3ph-bridge', deviceMode: 'semi', alphaDeg: 90, ...CCM }))
    const third = trace.vo.length / 3
    for (let k = 0; k < trace.vo.length; k++) {
      expect(trace.vo[k]).toBeCloseTo(trace.vo[(k + third) % trace.vo.length], 6)
    }
  })

  it('reports a half-controlled six-pulse bridge as three-pulse once fired late', () => {
    expect(run({ topology: '3ph-bridge', deviceMode: 'semi', alphaDeg: 45, ...CCM }).metrics.rippleFrequency).toBe(150)
    expect(run({ topology: '3ph-bridge', deviceMode: 'diode', ...CCM }).metrics.rippleFrequency).toBe(300)
  })

  it('does not call a current that only touches zero discontinuous', () => {
    expect(run({ topology: '1ph-bridge', deviceMode: 'diode', ...RES }).metrics.discontinuous).toBe(false)
    expect(run({ topology: '1ph-half-wave', deviceMode: 'diode', ...RES }).metrics.discontinuous).toBe(true)
  })
})
