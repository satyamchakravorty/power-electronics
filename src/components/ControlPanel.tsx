import { DEVICE_MODE_LABELS, LOAD_LABELS } from '../engine/config'
import { TOPOLOGIES } from '../engine/topologies'
import type { DeviceMode, LoadType, SimConfig } from '../engine/types'
import { useSimStore } from '../state/useSimStore'
import { Card } from './Card'
import { SlidersIcon } from './icons'

export function ControlPanel() {
  const config = useSimStore((s) => s.config)
  const setConfig = useSimStore((s) => s.setConfig)
  const topology = TOPOLOGIES[config.topology]

  return (
    <Card icon={<SlidersIcon />} title="Controls" subtitle={topology.name} className="controls">
      <div className="card-body">
        <h3 className="control-group">Switches</h3>
        <div className="field">
          <div className="seg seg-fill">
            {(['diode', 'thyristor', 'semi'] as DeviceMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={config.deviceMode === mode}
                disabled={mode === 'semi' && !topology.supportsSemi}
                title={
                  mode === 'semi' && !topology.supportsSemi
                    ? 'A half-controlled bridge needs switches in both groups'
                    : undefined
                }
                onClick={() => setConfig({ deviceMode: mode })}
              >
                {DEVICE_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={config.fwd}
            onChange={(e) => setConfig({ fwd: e.target.checked })}
          />
          <span className="toggle-track" aria-hidden="true" />
          <span>Freewheeling diode across the load</span>
        </label>

        <h3 className="control-group">Load</h3>
        <div className="field">
          <div className="seg seg-fill">
            {(['R', 'RL', 'RLE'] as LoadType[]).map((load) => (
              <button
                key={load}
                type="button"
                aria-pressed={config.load === load}
                onClick={() => setConfig({ load })}
              >
                {LOAD_LABELS[load]}
              </button>
            ))}
          </div>
        </div>

        <Slider
          id="R"
          label="Resistance R"
          unit="Ω"
          min={0.5}
          max={100}
          step={0.5}
          value={config.R}
          onChange={(R) => setConfig({ R })}
        />
        {config.load !== 'R' ? (
          <Slider
            id="L"
            label="Inductance L"
            unit="mH"
            min={0}
            max={1000}
            step={5}
            value={config.L}
            onChange={(L) => setConfig({ L })}
          />
        ) : null}
        {config.load === 'RLE' ? (
          <Slider
            id="E"
            label="Back-EMF E"
            unit="V"
            min={-600}
            max={600}
            step={10}
            value={config.E}
            onChange={(E) => setConfig({ E })}
            hint="Negative EMF turns the load into a source, which is what lets the converter invert."
          />
        ) : null}

        <h3 className="control-group">Supply</h3>
        <Slider
          id="Vrms"
          label={topology.phases === 3 ? 'Phase voltage (RMS)' : 'Supply voltage (RMS)'}
          unit="V"
          min={12}
          max={500}
          step={1}
          value={config.Vrms}
          onChange={(Vrms) => setConfig({ Vrms })}
          hint={
            topology.phases === 3
              ? `Line-to-line is ${(config.Vrms * Math.sqrt(3)).toFixed(0)} V`
              : undefined
          }
        />

        <div className="field">
          <div className="field-head">
            <label>Frequency</label>
          </div>
          <div className="seg seg-fill">
            {[50, 60].map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={config.f === f}
                onClick={() => setConfig({ f } as Partial<SimConfig>)}
              >
                {f} Hz
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

/** A range input that paints the filled part of its track. */
export function Range({
  id,
  min,
  max,
  step,
  value,
  disabled,
  label,
  onChange,
}: {
  id?: string
  min: number
  max: number
  step: number
  value: number
  disabled?: boolean
  label?: string
  onChange: (value: number) => void
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <input
      id={id}
      className="range"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      style={{ '--fill': `${Math.max(0, Math.min(100, fill))}%` } as React.CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

function Slider({
  id,
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
  hint,
}: {
  id: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  hint?: string
}) {
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <span className="field-value">
          {value} {unit}
        </span>
      </div>
      <Range id={id} min={min} max={max} step={step} value={value} onChange={onChange} />
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}
