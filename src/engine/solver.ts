import { isThyristor, TOPOLOGIES, writeSourceVoltages } from './topologies'
import type { ConductionState, DeviceSpec, SimConfig, Topology, Trace } from './types'

const TWO_PI = 2 * Math.PI
const DEG = Math.PI / 180

/** Currents below this are treated as zero, so a thyristor can turn off. */
const I_EPS = 1e-9

/** Recorded samples per supply cycle, which is the resolution of every plot. */
export const SAMPLES_PER_CYCLE = 1440

/**
 * Integration steps per recorded sample. Commutation instants fall between
 * samples, and a sample that straddles one must carry the average of both
 * sides or the mean output voltage picks up an error proportional to the step
 * size. Sub-stepping decouples integration accuracy from plot resolution.
 */
const SUBSTEPS = 12

export const FWD_ID = 'D_FW'

function wrap(x: number): number {
  const r = x % TWO_PI
  return r < 0 ? r + TWO_PI : r
}

/**
 * Gate pulses are modelled as a train rather than a single pulse, so a
 * thyristor gated before it is forward-biased (α below Hart's α_min against a
 * back-EMF) fires the moment it becomes forward-biased, and one whose current
 * has extinguished can re-strike while its train lasts.
 */
function gateActive(topology: Topology, device: DeviceSpec, theta: number, alpha: number): boolean {
  const window = topology.gateEnd === 'interval' ? topology.gateWindow - alpha : topology.gateWindow
  return wrap(theta - (device.naturalFireAngle + alpha)) < window
}

/** Whether a gate pulse is being applied to this device at the given angle. */
export function isGated(
  topology: Topology,
  config: SimConfig,
  device: DeviceSpec,
  theta: number,
): boolean {
  if (!isThyristor(device, config.deviceMode)) return false
  return gateActive(topology, device, theta, config.alphaDeg * DEG)
}

/** Conduction carried from one integration step to the next. */
interface SwitchState {
  current: number
  upperOn: string | null
  lowerOn: string | null
}

interface Decision {
  vo: number
  upper: DeviceSpec | null
  lower: DeviceSpec | null
  freewheeling: boolean
  blocking: boolean
  /** Positive output rail potential, referred to the supply neutral. */
  vPlus: number
  vMinus: number
}

/**
 * Ideal-switch conduction rule shared by every topology: among the devices
 * allowed to conduct, the upper group hands the positive rail to the most
 * positive phase and the lower group hands the negative rail to the most
 * negative one. Diodes are always allowed, thyristors only once gated, and a
 * device already carrying current stays in the running until that current
 * reaches zero.
 *
 * Writes into `out` because this runs on every integration step.
 */
function decide(
  out: Decision,
  topology: Topology,
  config: SimConfig,
  vNodes: number[],
  theta: number,
  alpha: number,
  state: SwitchState,
  E: number,
): void {
  let upper: DeviceSpec | null = null
  let lower: DeviceSpec | null = null
  let lowerGroupExists = false

  for (const d of topology.devices) {
    if (d.group === 'lower') lowerGroupExists = true
    const latched = d.id === state.upperOn || d.id === state.lowerOn
    if (
      !latched &&
      isThyristor(d, config.deviceMode) &&
      !gateActive(topology, d, theta, alpha)
    ) {
      continue
    }
    if (d.group === 'upper') {
      if (!upper || vNodes[d.phase] > vNodes[upper.phase]) upper = d
    } else {
      if (!lower || vNodes[d.phase] < vNodes[lower.phase]) lower = d
    }
  }

  // With no bridge device conducting, the output terminals sit at `vo` and the
  // rails distribute themselves so every device sees reverse bias.
  const float = (vo: number) => {
    if (topology.returnNode !== null) {
      out.vMinus = vNodes[topology.returnNode]
      out.vPlus = out.vMinus + vo
    } else {
      let hi = -Infinity
      let lo = Infinity
      for (const d of topology.devices) {
        if (vNodes[d.phase] > hi) hi = vNodes[d.phase]
        if (vNodes[d.phase] < lo) lo = vNodes[d.phase]
      }
      const slack = (vo - (hi - lo)) / 2
      out.vPlus = hi + slack
      out.vMinus = lo - slack
    }
    out.vo = vo
    out.upper = null
    out.lower = null
  }
  const blocked = () => {
    float(E)
    out.freewheeling = false
    out.blocking = true
  }
  const freewheel = (rail?: number) => {
    float(0)
    if (rail !== undefined) {
      out.vPlus = rail
      out.vMinus = rail
    }
    out.freewheeling = true
    out.blocking = false
  }

  if (!upper || (lowerGroupExists && !lower)) {
    // A lone thyristor whose gate pulse has ended still leaves the load current
    // a path through the freewheeling diode.
    if (config.fwd && state.current > I_EPS) freewheel()
    else blocked()
    return
  }

  const vMinusNode = lower ? vNodes[lower.phase] : vNodes[topology.returnNode as number]
  const vo = vNodes[upper.phase] - vMinusNode

  if (state.current > I_EPS) {
    // An established current keeps flowing; a freewheeling diode takes it over
    // the moment the bridge tries to push the output voltage negative.
    if (config.fwd && vo < 0) {
      freewheel(vMinusNode)
      return
    }
  } else if (vo <= E) {
    // From rest the bridge can only start conducting against the load EMF.
    blocked()
    return
  }

  out.vo = vo
  out.upper = upper
  out.lower = lower
  out.freewheeling = false
  out.blocking = false
  out.vPlus = vNodes[upper.phase]
  out.vMinus = vMinusNode
}

const REST: SwitchState = { current: 0, upperOn: null, lowerOn: null }

interface Probe {
  start: SwitchState
  /** Current one cycle later minus the current the cycle started with. */
  gap: number
}

/**
 * Finds the periodic steady state directly rather than integrating through the
 * start-up transient, which can run to hundreds of cycles for a stiff inductor.
 *
 * The cycle map from the current at the start of a cycle to the current one
 * cycle later is piecewise affine. Its slope is the R-L decay over one cycle
 * while current flows throughout and zero wherever the current has to restart
 * from rest, so the gap between the two falls strictly as the starting current
 * rises. The fixed point is therefore bracketed, and secant steps inside the
 * bracket converge on it whichever conduction mode it sits in. An unguarded
 * Newton step built on the continuous-conduction slope overshoots by up to
 * L/R cycles in discontinuous conduction and never settles.
 */
function periodicState(
  runCycle: (start: SwitchState, sink: null) => SwitchState,
  decay: number,
): SwitchState {
  // The devices conducting at the end of a cycle are the ones carrying the
  // current into the next, so every trial starts from the latest such set.
  let carry = REST
  const probe = (current: number): Probe => {
    const start = { ...carry, current }
    const ended = runCycle(start, null)
    if (ended.current > I_EPS) carry = ended
    return { start, gap: ended.current - current }
  }
  const tolerance = (current: number) => 1e-10 * Math.max(1, current)

  // The continuous-conduction slope is the shallowest the gap can fall at, so
  // a step built on it from below lands on or beyond the fixed point.
  const shallowest = Math.max(1 - decay, 1e-9)

  const first = probe(0)
  if (first.gap <= tolerance(0)) return first.start
  let best = first
  let low = 0
  let lowGap = first.gap
  let high = Infinity
  let highGap = 0
  // Which end moved last, for the Illinois correction that stops a stale end
  // of the bracket from slowing the secant steps to a crawl.
  let side = 0
  let next = first.gap / shallowest

  for (let iter = 0; iter < 60; iter++) {
    if (high < Infinity && !(next > low && next < high)) next = (low + high) / 2
    const trial = probe(next)
    if (Math.abs(trial.gap) < Math.abs(best.gap)) best = trial
    if (Math.abs(trial.gap) <= tolerance(next)) return trial.start

    if (trial.gap > 0) {
      low = next
      lowGap = trial.gap
      if (side === 1) highGap /= 2
      side = 1
    } else {
      high = next
      highGap = trial.gap
      if (side === -1) lowGap /= 2
      side = -1
    }

    if (high === Infinity) {
      next = low + lowGap / shallowest
      continue
    }
    if (high - low <= tolerance(high)) break
    next = low + (lowGap * (high - low)) / (lowGap - highGap)
  }
  return best.start
}

function rk4(i: number, vo: number, R: number, E: number, L: number, dt: number): number {
  const f = (y: number) => (vo - y * R - E) / L
  const k1 = f(i)
  const k2 = f(i + (dt * k1) / 2)
  const k3 = f(i + (dt * k2) / 2)
  const k4 = f(i + dt * k3)
  return i + (dt * (k1 + 2 * k2 + 2 * k3 + k4)) / 6
}

interface Sink {
  theta: Float64Array
  t: Float64Array
  vSource: Float64Array[]
  vo: Float64Array
  io: Float64Array
  isSource: Float64Array
  vDevice: Float64Array
  deviceCurrent: Record<string, Float64Array>
  states: ConductionState[]
}

export function simulate(config: SimConfig): Trace {
  const topology = TOPOLOGIES[config.topology]
  const N = SAMPLES_PER_CYCLE
  const M = SUBSTEPS
  const Vm = config.Vrms * Math.SQRT2
  const alpha = config.deviceMode === 'diode' ? 0 : config.alphaDeg * DEG
  const R = Math.max(config.R, 1e-6)
  const L = config.load === 'R' ? 0 : config.L / 1000
  const E = config.load === 'RLE' ? config.E : 0
  const dt = 1 / (config.f * N * M)
  const dTheta = TWO_PI / (N * M)
  const refDevice = topology.devices[0]
  const refUpper = refDevice.group === 'upper'

  const vNodes = new Array<number>(topology.sourceNodes).fill(0)
  const sampleNodes = new Array<number>(topology.sourceNodes).fill(0)
  const dec: Decision = {
    vo: 0,
    upper: null,
    lower: null,
    freewheeling: false,
    blocking: true,
    vPlus: 0,
    vMinus: 0,
  }

  /**
   * Integrates exactly one supply cycle from a given switch state and returns
   * the state one cycle later, optionally writing every sample into `sink`.
   */
  function runCycle(start: SwitchState, sink: Sink | null): SwitchState {
    const state: SwitchState = { ...start }

    for (let k = 0; k < N; k++) {
      let sumVo = 0
      let sumIo = 0
      let sumSrc = 0
      let sumDevice = 0
      let sumFwd = 0
      const perDevice = sink ? topology.devices.map(() => 0) : null

      for (let s = 0; s < M; s++) {
        // Each step is judged and driven at its midpoint. Holding the
        // start-of-step voltage instead biases the mean by a step's share of
        // every commutation jump, which is what limits accuracy here.
        const th = (k * M + s + 0.5) * dTheta
        writeSourceVoltages(topology, th, Vm, vNodes)

        // A purely resistive load has no state, so the current follows the
        // voltage instantaneously and conduction is always judged from rest.
        if (L === 0) state.current = 0
        decide(dec, topology, config, vNodes, th, alpha, state, E)
        if (L === 0) state.current = dec.blocking ? 0 : Math.max(0, (dec.vo - E) / R)

        state.upperOn = dec.upper ? dec.upper.id : null
        state.lowerOn = dec.lower ? dec.lower.id : null

        let voStep = dec.vo
        let nextCurrent = state.current
        if (L > 0) {
          if (dec.blocking) {
            nextCurrent = 0
          } else {
            const next = rk4(state.current, dec.vo, R, E, L, dt)
            if (next < 0) {
              // The current extinguishes partway through this step. Blending
              // the applied voltage over the fraction it actually conducted
              // keeps the volt-second balance over the cycle exact, which is
              // what pins the operating point to Vdc = Idc*R + E.
              const fraction = state.current / (state.current - next)
              voStep = fraction * dec.vo + (1 - fraction) * E
              nextCurrent = 0
            } else {
              nextCurrent = next
            }
          }
        }

        if (sink) {
          sumVo += voStep
          sumIo += state.current
          if (dec.upper) sumSrc += dec.upper.srcSign * state.current
          if (dec.lower) sumSrc += dec.lower.srcSign * state.current
          sumDevice += refUpper
            ? vNodes[refDevice.phase] - dec.vPlus
            : dec.vMinus - vNodes[refDevice.phase]
          if (dec.freewheeling) sumFwd += state.current
          for (let d = 0; d < topology.devices.length; d++) {
            const id = topology.devices[d].id
            if (id === state.upperOn || id === state.lowerOn) perDevice![d] += state.current
          }
          if (s === 0) {
            sink.states[k] = {
              on: dec.freewheeling
                ? [FWD_ID]
                : ([state.upperOn, state.lowerOn].filter(Boolean) as string[]),
              freewheeling: dec.freewheeling,
              blocking: dec.blocking,
            }
            sink.theta[k] = k * M * dTheta
            sink.t[k] = k * M * dt
            writeSourceVoltages(topology, sink.theta[k], Vm, sampleNodes)
            for (let n = 0; n < topology.sourceNodes; n++) sink.vSource[n][k] = sampleNodes[n]
          }
        }

        if (L > 0) {
          // The load current cannot reverse through unidirectional switches.
          state.current = nextCurrent
          if (nextCurrent === 0) {
            state.upperOn = null
            state.lowerOn = null
          }
        }
      }

      if (sink) {
        sink.vo[k] = sumVo / M
        sink.io[k] = sumIo / M
        sink.isSource[k] = sumSrc / M
        sink.vDevice[k] = sumDevice / M
        sink.deviceCurrent[FWD_ID][k] = sumFwd / M
        for (let d = 0; d < topology.devices.length; d++) {
          sink.deviceCurrent[topology.devices[d].id][k] = perDevice![d] / M
        }
      }
    }
    return state
  }

  const state = L > 0 ? periodicState(runCycle, Math.exp(-R / (config.f * L))) : REST

  const sink: Sink = {
    theta: new Float64Array(N),
    t: new Float64Array(N),
    vSource: Array.from({ length: topology.sourceNodes }, () => new Float64Array(N)),
    vo: new Float64Array(N),
    io: new Float64Array(N),
    isSource: new Float64Array(N),
    vDevice: new Float64Array(N),
    deviceCurrent: Object.fromEntries([
      ...topology.devices.map((d) => [d.id, new Float64Array(N)]),
      [FWD_ID, new Float64Array(N)],
    ]),
    states: new Array(N),
  }
  runCycle(state, sink)

  return {
    config,
    topology,
    samplesPerCycle: N,
    theta: sink.theta,
    t: sink.t,
    vSource: sink.vSource,
    vo: sink.vo,
    io: sink.io,
    isSource: sink.isSource,
    vDevice: sink.vDevice,
    deviceCurrent: sink.deviceCurrent,
    states: sink.states,
  }
}
