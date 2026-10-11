import { useEffect, useRef } from 'react'
import { SAMPLES_PER_CYCLE } from '../engine/solver'
import { useSimStore } from './useSimStore'

/**
 * Walks the playhead along the precomputed trace. Nothing is re-simulated
 * here, so playback stays smooth even while sliders are being dragged.
 *
 * Speed is in supply cycles per second of wall clock rather than a multiple of
 * real time: a 50 Hz cycle lasts 20 ms, which is far too quick to follow a
 * commutation, so every useful playback rate is deep slow motion anyway.
 */
export function usePlayback() {
  const playing = useSimStore((s) => s.playing)
  const speed = useSimStore((s) => s.speed)
  const advance = useSimStore((s) => s.advance)
  const last = useRef(0)
  // The store holds a whole sample index, so fractions are carried here.
  const remainder = useRef(0)

  useEffect(() => {
    if (!playing) return
    let frame = 0
    last.current = performance.now()

    const tick = (now: number) => {
      const elapsed = Math.min(now - last.current, 100) / 1000
      last.current = now

      const samples = remainder.current + elapsed * speed * SAMPLES_PER_CYCLE
      const whole = Math.floor(samples)
      remainder.current = samples - whole
      if (whole > 0) advance(whole)

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, advance])
}
