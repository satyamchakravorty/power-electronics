import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config'
import { computeMetrics } from './metrics'
import { simulate } from './solver'
import type { SimConfig, Trace } from './types'

/**
 * Worked examples from D. W. Hart, Power Electronics (McGraw-Hill, 2011),
 * chapters 3 and 4. Hart quotes three significant figures, so each value is
 * held to within 1% unless the example itself is approximate.
 *
 * Configurations bypass normalizeConfig on purpose: several examples use
 * supply voltages beyond the range the controls expose.
 */

const SQRT2 = Math.SQRT2
/** Large enough that Hart's "essentially dc" assumption holds. */
const STIFF = 20000

function run(overrides: Partial<SimConfig>) {
  const config = { ...DEFAULT_CONFIG, f: 60, fwd: false, E: 0, ...overrides }
  const trace = simulate(config)
  return { trace, m: computeMetrics(trace) }
}

function near(actual: number, expected: number, tolerance = 0.01) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * tolerance)
}

/** Angle in degrees at which a conduction interval starting near `fromDeg` ends. */
function extinctionDeg(trace: Trace, fromDeg: number): number {
  const N = trace.io.length
  const start = Math.round((fromDeg / 360) * N) + 2
  for (let j = 0; j < N; j++) {
    const k = (start + j) % N
    if (trace.io[k] <= 1e-9) return ((start + j) / N) * 360
  }
  return NaN
}

function device(m: ReturnType<typeof computeMetrics>, id: string) {
  const stress = m.devices.find((d) => d.id === id)
  if (!stress) throw new Error(`no device ${id}`)
  return stress
}

describe('Hart chapter 3: half-wave rectifiers', () => {
  it('Example 3-2: diode, R-L load', () => {
    const { trace, m } = run({
      topology: '1ph-half-wave', deviceMode: 'diode', load: 'RL',
      Vrms: 100 / SQRT2, R: 100, L: 100,
    })
    near(extinctionDeg(trace, 10), 201, 0.005)
    near(m.idc, 0.308)
    near(m.irms, 0.474)
    near(m.pLoad, 22.4)
    near(m.powerFactor, 0.67, 0.015)
  })

  it('Example 3-7: diode with a freewheeling diode', () => {
    const { m } = run({
      topology: '1ph-half-wave', deviceMode: 'diode', load: 'RL', fwd: true,
      Vrms: 100 / SQRT2, R: 2, L: 25,
    })
    near(m.vdc, 31.8)
    near(m.idc, 15.9)
    near(m.irms, 16.34)
    near(m.pLoad, 534)
  })

  it('Example 3-10: SCR, resistive load', () => {
    const { m } = run({
      topology: '1ph-half-wave', deviceMode: 'thyristor', load: 'R',
      Vrms: 120, R: 100, alphaDeg: 61.2,
    })
    near(m.vdc, 40)
    near(m.vrms, 75.6)
    near(m.pLoad, 57.1)
    near(m.powerFactor, 0.63, 0.015)
  })

  it('Example 3-11: SCR, R-L load', () => {
    const { trace, m } = run({
      topology: '1ph-half-wave', deviceMode: 'thyristor', load: 'RL',
      Vrms: 120, R: 20, L: 40, alphaDeg: 45,
    })
    near(extinctionDeg(trace, 50), 217, 0.005)
    // Hart prints 2.19 A, which contradicts his own beta: the inductor averages
    // zero volts, so Io = Vm(cos a - cos b)/(2 pi R) = 2.04 A. Integrating his
    // Eq. (3-55) directly gives 2.04 A too.
    near(m.idc, 2.04)
    near(m.vdc / 20, 2.04)
    near(m.irms, 3.26)
    near(m.pLoad, 213)
    near(m.powerFactor, 0.54, 0.015)
  })
})

describe('Hart chapter 4: single-phase full-wave', () => {
  it('Example 4-1: diode bridge, R-L load', () => {
    const { m } = run({
      topology: '1ph-bridge', deviceMode: 'diode', load: 'RL',
      Vrms: 100 / SQRT2, R: 10, L: 10,
    })
    near(m.vdc, 63.7)
    near(m.idc, 6.37)
    // Hart truncates the Fourier series after n = 4, so allow a little more.
    near(m.irms, 6.81, 0.015)
    near(m.pLoad, 464, 0.02)
    near(m.powerFactor, 0.964, 0.01)
    near(device(m, 'T1').iAvg, 3.19)
    near(device(m, 'T1').iRms, 4.82, 0.015)
  })

  it('Example 4-6: SCR bridge, resistive load', () => {
    const { m } = run({
      topology: '1ph-bridge', deviceMode: 'thyristor', load: 'R',
      Vrms: 120, R: 20, alphaDeg: 40,
    })
    near(m.vdc, 95.4)
    near(m.idc, 4.77)
    near(m.irms, 5.8)
    near(m.pLoad, 673)
    near(m.sIn, 696)
    near(m.powerFactor, 0.967)
  })

  it('Example 4-7: SCR bridge, R-L load, discontinuous current', () => {
    const { trace, m } = run({
      topology: '1ph-bridge', deviceMode: 'thyristor', load: 'RL',
      Vrms: 120, R: 10, L: 20, alphaDeg: 60,
    })
    expect(m.discontinuous).toBe(true)
    near(extinctionDeg(trace, 65), 216, 0.005)
    near(m.idc, 7.05)
    near(m.irms, 8.35)
    near(m.pLoad, 697)
  })

  it('Example 4-8: SCR bridge, R-L load, continuous current', () => {
    const { m } = run({
      topology: '1ph-bridge', deviceMode: 'thyristor', load: 'RL',
      Vrms: 120, R: 10, L: 100, alphaDeg: 60,
    })
    expect(m.discontinuous).toBe(false)
    near(m.vdc, 54.0)
    near(m.idc, 5.4)
    near(m.irms, 5.54)
    near(m.pLoad, 307)
  })

  it('Example 4-10: SCR bridge charging a 100 V source', () => {
    const { m } = run({
      topology: '1ph-bridge', deviceMode: 'thyristor', load: 'RLE',
      Vrms: 240, R: 5, L: STIFF, E: 100, alphaDeg: 46,
    })
    near(m.vdc, 150)
    // Io = (Vo - Vdc)/R amplifies the 1° rounding in Hart's alpha.
    near(m.idc, 10, 0.03)
    near(m.idc * 100, 1000, 0.03)
  })

  it('Example 4-11: SCR bridge inverting from a solar array', () => {
    // Hart rounds alpha to 165.5°, and Io is very sensitive to it here, so use
    // the angle that gives his Vo exactly.
    const Vm = 120 * SQRT2
    const alphaDeg = (Math.acos((-105.5 * Math.PI) / (2 * Vm)) * 180) / Math.PI
    const { m } = run({
      topology: '1ph-bridge', deviceMode: 'thyristor', load: 'RLE',
      Vrms: 120, R: 0.5, L: STIFF, E: -110, alphaDeg,
    })
    near(m.vdc, -105.5)
    near(m.idc, 9.09, 0.02)
    near(-m.vdc * m.idc, 959, 0.02)
    near(m.irms * m.irms * 0.5, 41, 0.04)
  })
})

describe('Hart chapter 4: three-phase', () => {
  const phase = (lineToLine: number) => lineToLine / Math.sqrt(3)

  it('Example 4-12: diode bridge, R-L load', () => {
    const { m } = run({
      topology: '3ph-bridge', deviceMode: 'diode', load: 'RL',
      Vrms: phase(480), R: 25, L: 50,
    })
    near(m.vdc, 648)
    near(m.idc, 25.9)
    near(device(m, 'T1').iAvg, 8.63)
    near(device(m, 'T1').iRms, 15.0)
    near(m.isRms, 21.2)
    near(m.sIn, 17600)
    // Against Hart's PSpice FFT of the phase current (peak amplitudes).
    const h = m.sourceSpectrum.harmonics
    near(h[0].amplitude, 28.6, 0.015)
    near(h[4].amplitude, 5.75, 0.03)
    near(h[6].amplitude, 4.05, 0.03)
    // Sec. 4.4: "The maximum reverse voltage across a diode is the peak line-to-line voltage."
    near(m.piv, 480 * SQRT2)
  })

  it('Example 4-13: SCR bridge set for 50 A', () => {
    const { m } = run({
      topology: '3ph-bridge', deviceMode: 'thyristor', load: 'RL',
      Vrms: phase(480), R: 10, L: 50, alphaDeg: 39.5,
    })
    near(m.vdc, 500)
    near(m.idc, 50)
  })

  it('Example 4-14: SCR bridge inverting from a 3000 V source', () => {
    // Hart's Io = (Vo + Vdc)/R, so his source opposes ours in sign.
    const { m } = run({
      topology: '3ph-bridge', deviceMode: 'thyristor', load: 'RLE',
      Vrms: phase(4160), R: 2, L: STIFF, E: -3000, alphaDeg: 120,
    })
    near(m.vdc, -2809)
    near(m.idc, 95.5, 0.02)
    near(-m.vdc * m.idc, 268.3e3, 0.02)
    near(m.idc * 3000, 286.5e3, 0.02)
  })
})
