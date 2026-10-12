import { SAMPLES_PER_CYCLE } from '../engine/solver'
import { useSimStore } from '../state/useSimStore'
import { Range } from './ControlPanel'
import { PauseIcon, PlayIcon } from './icons'

/** Supply cycles per second of wall clock. */
const SPEEDS = [0.1, 0.25, 0.5, 1, 2]
const ALPHA_PRESETS = [0, 30, 60, 90, 120, 150]

const degrees = (value: number) => `${value.toFixed(0).padStart(3, ' ')}°`

/** Firing angle, kept beside the drawings so its effect can be watched while dragging. */
export function AlphaBar() {
  const config = useSimStore((s) => s.config)
  const setConfig = useSimStore((s) => s.setConfig)
  const uncontrolled = config.deviceMode === 'diode'

  return (
    <div className={`transport transport-alpha${uncontrolled ? ' is-disabled' : ''}`}>
      <div className="transport-readout">
        <label className="transport-label" htmlFor="alpha">
          firing angle α
        </label>
        <span className="mono">{uncontrolled ? '  —' : degrees(config.alphaDeg)}</span>
      </div>
      <Range
        id="alpha"
        min={0}
        max={180}
        step={1}
        disabled={uncontrolled}
        value={config.alphaDeg}
        onChange={(alphaDeg) => setConfig({ alphaDeg })}
      />
      {uncontrolled ? (
        <button
          type="button"
          className="pill-toggle"
          title="Diodes fire at their natural angle, so α only applies to thyristors"
          onClick={() => setConfig({ deviceMode: 'thyristor' })}
        >
          Use thyristors
        </button>
      ) : (
        <div className="seg seg-small" aria-label="Firing angle presets">
          {ALPHA_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={config.alphaDeg === value}
              onClick={() => setConfig({ alphaDeg: value })}
            >
              {value}°
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PlaybackBar() {
  const f = useSimStore((s) => s.config.f)
  const playhead = useSimStore((s) => s.playhead)
  const setPlayhead = useSimStore((s) => s.setPlayhead)
  const playing = useSimStore((s) => s.playing)
  const setPlaying = useSimStore((s) => s.setPlaying)
  const speed = useSimStore((s) => s.speed)
  const setSpeed = useSimStore((s) => s.setSpeed)

  return (
    <div className="transport transport-play">
      <button
        className="play-button"
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => setPlaying(!playing)}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="transport-readout">
        <span className="transport-label">ωt</span>
        <span className="mono">{degrees((playhead / SAMPLES_PER_CYCLE) * 360)}</span>
      </div>
      <Range
        min={0}
        max={SAMPLES_PER_CYCLE - 1}
        step={1}
        value={playhead}
        label="Angle through the supply cycle"
        onChange={setPlayhead}
      />
      <div
        className="seg seg-small"
        title={`Supply cycles per second of real time. At 1× one cycle takes a second instead of ${(1000 / f).toFixed(0)} ms.`}
      >
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={speed === value}
            onClick={() => setSpeed(value)}
          >
            {value}×
          </button>
        ))}
      </div>
    </div>
  )
}

export function ShortcutHints() {
  return (
    <p className="transport-keys">
      <span>
        <kbd>Space</kbd> play or pause
      </span>
      <span>
        <kbd>←</kbd>
        <kbd>→</kbd> step ωt
      </span>
      <span>
        <kbd>↑</kbd>
        <kbd>↓</kbd> change α
      </span>
      <span>
        hold <kbd>Shift</kbd> for 10° steps
      </span>
      <span>
        <kbd>1</kbd>–<kbd>4</kbd> switch converter
      </span>
    </p>
  )
}
