import { TOPOLOGIES } from './topologies'
import type { SimConfig } from './types'

const DEG = Math.PI / 180

export interface Analytical {
  /** Closed-form mean output voltage, or null where no elementary form exists. */
  vdc: number | null
  /** Closed-form RMS output voltage where one is available. */
  vrms: number | null
  /** KaTeX source for the governing expression. */
  latex: string
  /** Short name of the operating regime the expression assumes. */
  regime: string
  /** Plain-language description of the converter and the assumption made. */
  description: string
  /**
   * False when the expression is only an idealisation of the configured case,
   * so a mismatch against the simulation is expected rather than a bug.
   */
  exact: boolean
  /**
   * True for expressions derived assuming the load current never reaches zero.
   * Past a certain firing angle a passive load cannot sustain that, and the
   * expression stops describing the circuit.
   */
  requiresContinuous: boolean
  note?: string
}

/**
 * Whether the closed-form expression actually describes the simulated
 * operating point. A continuous-conduction formula silently stops applying
 * once the current becomes discontinuous, which is precisely the divergence
 * worth showing a student rather than hiding.
 */
export function assumptionsHold(theory: Analytical, discontinuous: boolean): boolean {
  if (!theory.exact || theory.vdc === null) return false
  return !(theory.requiresContinuous && discontinuous)
}

/** True when the output voltage is structurally prevented from going negative. */
function clampedToZero(config: SimConfig): boolean {
  const topology = TOPOLOGIES[config.topology]
  const semi = config.deviceMode === 'semi' && topology.supportsSemi
  return semi || config.fwd
}

/** True when stored inductive energy can sustain current through the gaps. */
function inductive(config: SimConfig): boolean {
  return config.load !== 'R' && config.L > 0
}

/**
 * Closed-form output voltage for the configured converter. These are the
 * textbook expressions, and the simulation is expected to reproduce them
 * wherever `exact` is true, which is what the test suite asserts.
 */
export function analytical(config: SimConfig): Analytical {
  const Vm = config.Vrms * Math.SQRT2
  const uncontrolled = config.deviceMode === 'diode'
  const a = uncontrolled ? 0 : config.alphaDeg * DEG
  const topology = TOPOLOGIES[config.topology]
  const semi = config.deviceMode === 'semi' && topology.supportsSemi
  const clamped = clampedToZero(config)
  const hasEMF = config.load === 'RLE' && config.E !== 0

  // A back-EMF load can block conduction over part of the cycle, which none of
  // the elementary expressions account for.
  const emfNote = hasEMF
    ? 'Back-EMF loads can force discontinuous conduction, so the simulated value will fall below this ideal figure.'
    : undefined

  switch (config.topology) {
    case '1ph-half-wave': {
      if (!inductive(config) || clamped) {
        return {
          vdc: (Vm * (1 + Math.cos(a))) / (2 * Math.PI),
          vrms: rms1ph(Vm / 2, a),
          latex: 'V_{dc} = \\frac{V_m}{2\\pi}\\left(1 + \\cos\\alpha\\right)',
          regime: clamped && inductive(config) ? 'Freewheeling' : 'Resistive load',
          description: clamped
            ? 'Half-wave converter with a freewheeling diode. The diode clamps the output at zero through the negative half cycle, so conduction always ends at 180 degrees.'
            : 'Half-wave converter into a resistive load. Current follows the voltage exactly, so conduction spans the firing angle to 180 degrees.',
          exact: !hasEMF,
          requiresContinuous: false,
          note: emfNote,
        }
      }
      return {
        vdc: null,
        vrms: null,
        latex:
          'V_{dc} = \\frac{V_m}{2\\pi}\\left(\\cos\\alpha - \\cos\\beta\\right),\\quad \\beta \\text{ from } \\sin(\\beta-\\phi) = \\sin(\\alpha-\\phi)e^{-(\\beta-\\alpha)/\\omega\\tau}',
        regime: 'Inductive, no freewheeling path',
        description:
          'With an inductive load and no freewheeling diode, conduction runs past 180 degrees to an extinction angle beta that has no closed-form solution. The numerical result on the left is the answer; add a freewheeling diode to recover an elementary formula.',
        exact: false,
        requiresContinuous: true,
        note: 'The extinction angle satisfies a transcendental equation, so there is no elementary expression to compare against.',
      }
    }

    case '1ph-centre-tap':
    case '1ph-bridge': {
      const label = config.topology === '1ph-bridge' ? 'bridge' : 'centre-tapped converter'
      if (semi) {
        return {
          vdc: (Vm * (1 + Math.cos(a))) / Math.PI,
          vrms: null,
          latex: 'V_{dc} = \\frac{V_m}{\\pi}\\left(1 + \\cos\\alpha\\right)',
          regime: 'Half-controlled (semi-converter)',
          description:
            'Half-controlled bridge: thyristors in the upper legs, diodes below. The diode leg and the still-latched thyristor short the load together, giving inherent freewheeling that clamps the output at zero and restricts operation to one quadrant.',
          exact: !hasEMF,
          requiresContinuous: false,
          note: emfNote,
        }
      }
      if (config.fwd) {
        return {
          vdc: (Vm * (1 + Math.cos(a))) / Math.PI,
          vrms: null,
          latex: 'V_{dc} = \\frac{V_m}{\\pi}\\left(1 + \\cos\\alpha\\right)',
          regime: 'Freewheeling diode fitted',
          description: `Fully controlled ${label} with a freewheeling diode across the load. The diode blocks the negative output excursion, so the converter behaves exactly like a semi-converter and can no longer invert.`,
          exact: !hasEMF,
          requiresContinuous: false,
          note: emfNote,
        }
      }
      if (!inductive(config)) {
        return {
          vdc: (Vm * (1 + Math.cos(a))) / Math.PI,
          vrms: rms1ph(Vm / Math.SQRT2, a),
          latex: 'V_{dc} = \\frac{V_m}{\\pi}\\left(1 + \\cos\\alpha\\right)',
          regime: 'Resistive load (discontinuous)',
          description: `Fully controlled ${label} into a resistive load. Current dies at every voltage zero crossing, so the output never goes negative and the mean follows the one-plus-cosine law rather than the cosine law.`,
          exact: true,
          requiresContinuous: false,
        }
      }
      return {
        vdc: (2 * Vm * Math.cos(a)) / Math.PI,
        vrms: Vm / Math.SQRT2,
        latex: 'V_{dc} = \\frac{2V_m}{\\pi}\\cos\\alpha',
        regime: 'Continuous conduction',
        description: `Fully controlled ${label} with enough load inductance to keep current flowing continuously. The output is forced negative between 180 degrees and 180 plus alpha, which is why the mean follows a pure cosine and reverses sign beyond 90 degrees.`,
        exact: !hasEMF,
        requiresContinuous: true,
        note: emfNote,
      }
    }

    case '3ph-half-wave': {
      const dcmBoundary = 30 * DEG
      if ((!inductive(config) || clamped) && a > dcmBoundary) {
        return {
          // Past 150 degrees no phase is positive when its pulse arrives.
          vdc: a + dcmBoundary >= Math.PI ? 0 : (3 * Vm * (1 + Math.cos(a + dcmBoundary))) / (2 * Math.PI),
          vrms: null,
          latex:
            'V_{dc} = \\frac{3V_m}{2\\pi}\\left[1 + \\cos\\!\\left(\\alpha + 30^\\circ\\right)\\right]',
          regime: 'Discontinuous conduction',
          description:
            'Three-pulse converter past 30 degrees of firing delay without an inductive path to sustain current. Each phase stops conducting at its own voltage zero crossing instead of handing over to the next phase, so the output has zero-voltage gaps.',
          exact: !hasEMF,
          requiresContinuous: false,
          note: emfNote,
        }
      }
      return {
        vdc: (3 * Math.sqrt(3) * Vm * Math.cos(a)) / (2 * Math.PI),
        vrms: null,
        latex: 'V_{dc} = \\frac{3\\sqrt{3}\\,V_m}{2\\pi}\\cos\\alpha = 1.17\\,V_{ph}\\cos\\alpha',
        regime: 'Continuous conduction',
        description:
          'Three-pulse (half-wave) converter. Each phase holds the positive rail for 120 degrees, starting 30 degrees after its own zero crossing, which is where the firing angle is measured from.',
        exact: !hasEMF,
        requiresContinuous: true,
        note: emfNote,
      }
    }

    case '3ph-bridge': {
      const VmLL = Math.sqrt(3) * Vm
      if (semi) {
        return {
          vdc: (3 * Math.sqrt(3) * Vm * (1 + Math.cos(a))) / (2 * Math.PI),
          vrms: null,
          latex: 'V_{dc} = \\frac{3\\sqrt{3}\\,V_m}{2\\pi}\\left(1 + \\cos\\alpha\\right)',
          regime: 'Half-controlled (semi-converter)',
          description:
            'Three-phase half-controlled bridge: three thyristors above, three diodes below. Whenever the fired thyristor and the conducting diode land on the same phase leg, that leg shorts the load and freewheels, clamping the output at zero.',
          exact: !hasEMF,
          requiresContinuous: false,
          note: emfNote,
        }
      }
      const dcmBoundary = 60 * DEG
      if ((!inductive(config) || clamped) && a > dcmBoundary) {
        return {
          // Past 120 degrees no line voltage is positive when its pulse arrives.
          vdc: a + dcmBoundary >= Math.PI ? 0 : (3 * VmLL * (1 + Math.cos(a + dcmBoundary))) / Math.PI,
          vrms: null,
          latex:
            'V_{dc} = \\frac{3V_{m(LL)}}{\\pi}\\left[1 + \\cos\\!\\left(\\alpha + 60^\\circ\\right)\\right]',
          regime: 'Discontinuous conduction',
          description:
            'Six-pulse bridge past 60 degrees of firing delay with no path to sustain current. Each line voltage segment is cut short at its own zero crossing, leaving gaps in the output.',
          exact: !hasEMF,
          requiresContinuous: false,
          note: emfNote,
        }
      }
      return {
        vdc: (3 * VmLL * Math.cos(a)) / Math.PI,
        vrms: null,
        latex:
          'V_{dc} = \\frac{3V_{m(LL)}}{\\pi}\\cos\\alpha = \\frac{3\\sqrt{3}\\,V_m}{\\pi}\\cos\\alpha = 1.35\\,V_{LL}\\cos\\alpha',
        regime: 'Continuous conduction',
        description:
          'Six-pulse fully controlled bridge, the workhorse of high-power rectification. Two devices conduct at a time for 120 degrees each, so the output tracks the line-to-line voltage envelope and ripples at six times supply frequency.',
        exact: !hasEMF,
        requiresContinuous: true,
        note: emfNote,
      }
    }
  }
}

/** RMS of a sinusoid chopped from alpha to pi, scaled by its full-conduction RMS. */
function rms1ph(fullRms: number, a: number): number {
  const shape = Math.sqrt(1 - a / Math.PI + Math.sin(2 * a) / (2 * Math.PI))
  return fullRms * shape
}
