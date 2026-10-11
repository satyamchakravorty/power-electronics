export type TopologyId =
  | '1ph-half-wave'
  | '1ph-centre-tap'
  | '1ph-bridge'
  | '3ph-half-wave'
  | '3ph-bridge'

/** Which devices in a topology are gate-controlled. */
export type DeviceMode = 'diode' | 'thyristor' | 'semi'

export type LoadType = 'R' | 'RL' | 'RLE'

export interface DeviceSpec {
  id: string
  group: 'upper' | 'lower'
  /** Index into the source voltage vector this leg taps. */
  phase: number
  /** False means the device is hard-wired as a diode regardless of DeviceMode. */
  controllable: boolean
  /** Angle (rad) at which an equivalent diode would start conducting. Alpha is measured from here. */
  naturalFireAngle: number
  /**
   * Signed contribution of the load current to the reference supply current
   * while this device conducts. Zero for devices on other phases.
   */
  srcSign: number
}

export interface Topology {
  id: TopologyId
  name: string
  shortName: string
  phases: 1 | 3
  /** Output ripple pulses per input cycle. */
  pulses: number
  devices: DeviceSpec[]
  supportsFWD: boolean
  /** Half-controlled bridge only makes sense where both groups are switched. */
  supportsSemi: boolean
  /**
   * How long a gate pulse train is held after firing, equal to the conduction
   * span of the equivalent diode. This is what lets a thyristor re-conduct
   * within its own interval under discontinuous conduction.
   */
  gateWindow: number
  /**
   * Number of distinct source nodes. The centre-tapped transformer presents two
   * antiphase secondaries, so it has two source nodes but only one supply phase.
   */
  sourceNodes: number
  /**
   * Node index clamped to the negative rail for topologies with no switched
   * lower group (the supply neutral or transformer centre tap), else null.
   */
  returnNode: number | null
  /** True when the lower group is a single fixed return node rather than switched devices. */
  commonReturn: boolean
}

export interface SimConfig {
  topology: TopologyId
  deviceMode: DeviceMode
  /** Firing angle in degrees. */
  alphaDeg: number
  fwd: boolean
  load: LoadType
  /** Ohms. */
  R: number
  /** Millihenries. */
  L: number
  /** Back-EMF in volts, used only for the RLE load. */
  E: number
  /**
   * Source RMS voltage. Phase-to-neutral for single phase and for the
   * three-phase topologies (line-to-line is derived as sqrt(3) times this).
   */
  Vrms: number
  /** Supply frequency in hertz. */
  f: number
}

/** Per-sample snapshot of which devices conduct and how the current returns. */
export interface ConductionState {
  /** Device ids that are carrying current at this sample. */
  on: string[]
  /** True when the freewheeling diode is carrying the load current. */
  freewheeling: boolean
  /** True when no main device conducts and the load current is zero. */
  blocking: boolean
}

export interface Trace {
  config: SimConfig
  topology: Topology
  /** Samples per input cycle. */
  samplesPerCycle: number
  /** Normalised angle 0..2pi across one steady-state input cycle. */
  theta: Float64Array
  /** Time in seconds across the retained cycle, starting at zero. */
  t: Float64Array
  /** Source node voltages, one array per source node. */
  vSource: Float64Array[]
  /** Instantaneous load (output) voltage. */
  vo: Float64Array
  /** Instantaneous load current. */
  io: Float64Array
  /** Current drawn from supply phase A (or the single phase). */
  isSource: Float64Array
  /** Voltage across the upper-group reference device, for blocking-voltage plots. */
  vDevice: Float64Array
  /** Per-device instantaneous current, keyed by device id. */
  deviceCurrent: Record<string, Float64Array>
  /** Conduction bookkeeping per sample. */
  states: ConductionState[]
}
