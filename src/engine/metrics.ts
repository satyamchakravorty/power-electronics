import { spectrum, type Spectrum } from './fft'
import { FWD_ID } from './solver'
import type { Trace } from './types'

export interface DeviceStress {
  id: string
  /** Mean current carried by the device over a supply cycle. */
  iAvg: number
  /** RMS current through the device, which sets its thermal rating. */
  iRms: number
  /** Conduction span in degrees of the supply cycle. */
  conductionDeg: number
}

export interface Metrics {
  vdc: number
  vrms: number
  /** RMS of the ripple alone, i.e. the output with its DC term removed. */
  vripple: number
  idc: number
  irms: number
  /** Power delivered to the load, resistive dissipation plus EMF conversion. */
  pLoad: number
  /** Apparent power drawn from the supply. */
  sIn: number
  powerFactor: number
  /** RMS supply current. */
  isRms: number
  /** Peak supply current. */
  isPeak: number
  formFactor: number
  rippleFactor: number
  /** Supply-current THD referred to the fundamental. */
  thd: number
  /** Cosine of the fundamental current displacement from the supply voltage. */
  displacementFactor: number
  /** Fundamental RMS current divided by total RMS current. */
  distortionFactor: number
  /** Peak inverse voltage seen by the reference device. */
  piv: number
  /** Output ripple frequency in hertz. */
  rippleFrequency: Hz
  /** True when the load current reaches zero at some point in the cycle. */
  discontinuous: boolean
  /** Fraction of the cycle spent freewheeling. */
  freewheelDuty: number
  devices: DeviceStress[]
  sourceSpectrum: Spectrum
}

type Hz = number

function mean(x: Float64Array): number {
  let s = 0
  for (let k = 0; k < x.length; k++) s += x[k]
  return s / x.length
}

function rms(x: Float64Array): number {
  let s = 0
  for (let k = 0; k < x.length; k++) s += x[k] * x[k]
  return Math.sqrt(s / x.length)
}

function peakAbs(x: Float64Array): number {
  let p = 0
  for (let k = 0; k < x.length; k++) p = Math.max(p, Math.abs(x[k]))
  return p
}

export function computeMetrics(trace: Trace): Metrics {
  const { config, topology, vo, io, isSource, vDevice, deviceCurrent, states } = trace
  const N = vo.length

  const vdc = mean(vo)
  const vrms = rms(vo)
  const idc = mean(io)
  const irms = rms(io)
  const isRms = rms(isSource)

  const E = config.load === 'RLE' ? config.E : 0
  const pLoad = irms * irms * config.R + idc * E

  // Three-phase apparent power counts all three phases; the per-phase current
  // is identical by symmetry, so the single simulated phase suffices.
  const sIn = topology.phases * config.Vrms * isRms

  const sourceSpectrum = spectrum(isSource, 40)
  const fundamentalRms = sourceSpectrum.fundamentalRms
  const distortionFactor = isRms > 1e-9 ? fundamentalRms / isRms : 0
  // The supply voltage is defined as Vm*sin(theta), so the fundamental current
  // phase is already measured relative to it.
  const displacementFactor = Math.cos(sourceSpectrum.fundamentalPhase)

  const formFactor = Math.abs(vdc) > 1e-9 ? vrms / Math.abs(vdc) : Infinity
  const rippleFactor = Number.isFinite(formFactor)
    ? Math.sqrt(Math.max(0, formFactor * formFactor - 1))
    : Infinity

  let minDevice = 0
  for (let k = 0; k < N; k++) minDevice = Math.min(minDevice, vDevice[k])

  // A current that merely touches zero at an instant, as a diode bridge into a
  // resistor does at each voltage zero crossing, is not discontinuous
  // conduction. Only count spans of zero current that last beyond one sample.
  let blockedSpan = 0
  let freewheelCount = 0
  for (let k = 0; k < N; k++) {
    if (states[k].blocking && states[(k + 1) % N].blocking) blockedSpan++
    if (states[k].freewheeling) freewheelCount++
  }

  // A half-controlled six-pulse bridge only fires its thyristors three times a
  // cycle, so once alpha is non-zero its output repeats every 120 degrees.
  const pulses =
    topology.id === '3ph-bridge' && config.deviceMode === 'semi' && config.alphaDeg > 0
      ? 3
      : topology.pulses

  const devices: DeviceStress[] = []
  for (const id of [...topology.devices.map((d) => d.id), FWD_ID]) {
    const current = deviceCurrent[id]
    if (!current) continue
    if (id === FWD_ID && freewheelCount === 0) continue
    let conducting = 0
    for (let k = 0; k < N; k++) if (current[k] > 1e-9) conducting++
    devices.push({
      id,
      iAvg: mean(current),
      iRms: rms(current),
      conductionDeg: (conducting / N) * 360,
    })
  }

  return {
    vdc,
    vrms,
    vripple: Math.sqrt(Math.max(0, vrms * vrms - vdc * vdc)),
    idc,
    irms,
    pLoad,
    sIn,
    powerFactor: sIn > 1e-9 ? pLoad / sIn : 0,
    isRms,
    isPeak: peakAbs(isSource),
    formFactor,
    rippleFactor,
    thd: sourceSpectrum.thd,
    displacementFactor,
    distortionFactor,
    piv: Math.abs(minDevice),
    rippleFrequency: pulses * config.f,
    discontinuous: blockedSpan > 0,
    freewheelDuty: freewheelCount / N,
    devices,
    sourceSpectrum,
  }
}
