export interface Harmonic {
  /** Harmonic order, where 1 is the supply fundamental. */
  order: number
  /** Peak amplitude. */
  amplitude: number
  /** RMS contribution of this harmonic. */
  rms: number
  /** Phase in radians, such that the component equals amplitude*sin(order*theta + phase). */
  phase: number
}

export interface Spectrum {
  /** Mean (DC) value of the signal. */
  dc: number
  harmonics: Harmonic[]
  /** Total RMS of the signal including the DC term. */
  totalRms: number
  /** RMS of the fundamental. */
  fundamentalRms: number
  /** Total harmonic distortion referred to the fundamental. */
  thd: number
  /** Phase of the fundamental in radians. */
  fundamentalPhase: number
}

/**
 * Direct discrete Fourier evaluation over exactly one cycle.
 *
 * A full FFT is unnecessary here: a few dozen harmonics across a couple of
 * thousand samples is a handful of microseconds, and working term by term
 * avoids constraining the sample count to a power of two.
 */
export function spectrum(signal: Float64Array, maxHarmonic = 40): Spectrum {
  const N = signal.length
  const dTheta = (2 * Math.PI) / N

  let sum = 0
  let sumSq = 0
  for (let k = 0; k < N; k++) {
    sum += signal[k]
    sumSq += signal[k] * signal[k]
  }
  const dc = sum / N
  const totalRms = Math.sqrt(sumSq / N)

  const harmonics: Harmonic[] = []
  for (let h = 1; h <= maxHarmonic; h++) {
    let sinSum = 0
    let cosSum = 0
    for (let k = 0; k < N; k++) {
      const angle = h * k * dTheta
      sinSum += signal[k] * Math.sin(angle)
      cosSum += signal[k] * Math.cos(angle)
    }
    const a = (2 / N) * sinSum
    const b = (2 / N) * cosSum
    const amplitude = Math.hypot(a, b)
    harmonics.push({
      order: h,
      amplitude,
      rms: amplitude / Math.SQRT2,
      phase: Math.atan2(b, a),
    })
  }

  const fundamentalRms = harmonics[0]?.rms ?? 0
  // Everything that is not the fundamental counts as distortion, including the
  // DC term, which a half-wave rectifier injects into the supply.
  const distortionRms = Math.sqrt(Math.max(0, totalRms * totalRms - fundamentalRms * fundamentalRms))
  return {
    dc,
    harmonics,
    totalRms,
    fundamentalRms,
    thd: fundamentalRms > 1e-12 ? distortionRms / fundamentalRms : 0,
    fundamentalPhase: harmonics[0]?.phase ?? 0,
  }
}
