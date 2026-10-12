import { TOPOLOGIES } from './topologies'
import type { SimConfig } from './types'

const DEG = Math.PI / 180

export interface Analytical {
  /** Closed-form mean output voltage, or null where no elementary form exists. */
  vdc: number | null
  /** Short name of the operating regime the expression assumes. */
  regime: string
  /**
   * False when the expression is only an idealisation of the configured case,
   * so a mismatch against the simulation is expected rather than a bug.
   */
  exact: boolean
  /**
   * True for expressions that only hold while the load current never reaches
   * zero. Past a certain firing angle a passive load cannot sustain that, and
   * a back-EMF blocks conduction over part of every cycle.
   */
  requiresContinuous: boolean
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

/** True when stored inductive energy can sustain current through the gaps. */
function inductive(config: SimConfig): boolean {
  return config.load !== 'R' && config.L > 0
}

/**
 * Closed-form output voltage for the configured converter. These are the
 * textbook expressions, and the simulation is expected to reproduce them
 * wherever `assumptionsHold` is true, which is what the test suite asserts.
 *
 * A back-EMF never enters the output voltage while current flows, since the
 * conducting devices then tie the output to the supply or the freewheeling
 * path to zero. It matters only once the current stops: the output then sits
 * at E rather than following the supply, so the mean rises above these
 * figures for a positive E and falls below them for a negative one. Every
 * expression therefore holds with a back-EMF exactly as long as the current
 * is continuous.
 */
export function analytical(config: SimConfig): Analytical {
  const Vm = config.Vrms * Math.SQRT2
  const a = config.deviceMode === 'diode' ? 0 : config.alphaDeg * DEG
  const topology = TOPOLOGIES[config.topology]
  const semi = config.deviceMode === 'semi' && topology.supportsSemi
  const clamped = semi || config.fwd
  const hasEMF = config.load === 'RLE' && config.E !== 0
  // Without stored current a freewheeling diode has nothing to carry.
  const freewheels = semi || (config.fwd && inductive(config))

  // Formulas built on a zero output across the gaps. Where a freewheeling path
  // holds the output there, a back-EMF only matters if the current stops. A
  // resistive formula assumes conduction ends at the supply zero crossing,
  // which no back-EMF allows: a positive one ends it early and leaves the
  // output at E, a negative one carries it on past the crossing.
  const gapped = (vdc: number, regime: string): Analytical => ({
    vdc,
    regime,
    exact: !hasEMF || freewheels,
    requiresContinuous: hasEMF,
  })
  const continuous = (vdc: number): Analytical => ({
    vdc,
    regime: 'Continuous conduction',
    exact: true,
    requiresContinuous: true,
  })

  switch (config.topology) {
    case '1ph-half-wave': {
      if (!inductive(config) || clamped) {
        return gapped(
          (Vm * (1 + Math.cos(a))) / (2 * Math.PI),
          clamped && inductive(config) ? 'Freewheeling' : 'Resistive load',
        )
      }
      // Conduction runs past 180 degrees to an extinction angle that only a
      // transcendental equation gives, so there is nothing elementary to show.
      return {
        vdc: null,
        regime: 'Inductive, no freewheeling path',
        exact: false,
        requiresContinuous: true,
      }
    }

    case '1ph-bridge': {
      if (semi) return gapped((Vm * (1 + Math.cos(a))) / Math.PI, 'Half-controlled (semi-converter)')
      if (config.fwd) return gapped((Vm * (1 + Math.cos(a))) / Math.PI, 'Freewheeling diode fitted')
      if (!inductive(config)) {
        return gapped((Vm * (1 + Math.cos(a))) / Math.PI, 'Resistive load (discontinuous)')
      }
      return continuous((2 * Vm * Math.cos(a)) / Math.PI)
    }

    case '3ph-bridge': {
      const VmLL = Math.sqrt(3) * Vm
      if (semi) {
        return gapped((3 * VmLL * (1 + Math.cos(a))) / (2 * Math.PI), 'Half-controlled (semi-converter)')
      }
      const dcmBoundary = 60 * DEG
      if ((!inductive(config) || clamped) && a > dcmBoundary) {
        // Past 120 degrees no line voltage is positive when its pulse arrives.
        return gapped(
          a + dcmBoundary >= Math.PI ? 0 : (3 * VmLL * (1 + Math.cos(a + dcmBoundary))) / Math.PI,
          'Discontinuous conduction',
        )
      }
      return continuous((3 * VmLL * Math.cos(a)) / Math.PI)
    }
  }
}
