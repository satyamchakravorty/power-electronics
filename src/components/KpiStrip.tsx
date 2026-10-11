import { assumptionsHold, type Analytical } from '../engine/analytical'
import type { Metrics } from '../engine/metrics'
import type { SimConfig } from '../engine/types'
import { channelColors } from '../theme'
import { CheckIcon } from './icons'
import { formatValue } from './useCanvas'

/** Splits a formatted reading so the number and the unit can be styled apart. */
function Reading({ text }: { text: string }) {
  const space = text.lastIndexOf(' ')
  if (space < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, space)}
      <span className="kpi-unit">{text.slice(space + 1)}</span>
    </>
  )
}

/** The handful of numbers a reader looks for first, large and up front. */
export function KpiStrip({
  metrics,
  theory,
  config,
}: {
  metrics: Metrics
  theory: Analytical
  config: SimConfig
}) {
  const applies = assumptionsHold(theory, metrics.discontinuous)
  const error =
    applies && theory.vdc !== null && Math.abs(theory.vdc) > 1
      ? ((metrics.vdc - theory.vdc) / Math.abs(theory.vdc)) * 100
      : null
  const pulses = Math.round(metrics.rippleFrequency / config.f)
  const pf = Math.max(-1, Math.min(1, metrics.powerFactor))

  return (
    <div className="kpi-strip">
      <div className="kpi" style={{ '--kpi-colour': channelColors.vo } as React.CSSProperties}>
        <span className="kpi-label">Mean output voltage</span>
        <span className={`kpi-value${metrics.vdc < 0 ? ' is-negative' : ''}`}>
          <Reading text={formatValue(metrics.vdc, 'V')} />
        </span>
        {error !== null && theory.vdc !== null ? (
          <span className="kpi-sub kpi-agree">
            <CheckIcon /> theory {formatValue(theory.vdc, 'V')} · Δ {Math.abs(error).toFixed(2)}%
          </span>
        ) : theory.requiresContinuous && metrics.discontinuous ? (
          <span className="kpi-sub kpi-disagree" title="The closed-form expression assumes continuous load current">
            closed form invalid here
          </span>
        ) : (
          <span className="kpi-sub">V_rms {formatValue(metrics.vrms, 'V')}</span>
        )}
      </div>

      <div className="kpi" style={{ '--kpi-colour': channelColors.io } as React.CSSProperties}>
        <span className="kpi-label">Mean load current</span>
        <span className="kpi-value">
          <Reading text={formatValue(metrics.idc, 'A')} />
        </span>
        <span className="kpi-sub">I_rms {formatValue(metrics.irms, 'A')}</span>
      </div>

      <div className="kpi" style={{ '--kpi-colour': 'var(--violet)' } as React.CSSProperties}>
        <span className="kpi-label">{metrics.pLoad < 0 ? 'Power returned to supply' : 'Load power'}</span>
        <span className={`kpi-value${metrics.pLoad < 0 ? ' is-negative' : ''}`}>
          <Reading text={formatValue(Math.abs(metrics.pLoad), 'W')} />
        </span>
        <span className="kpi-sub">S {formatValue(metrics.sIn, 'VA')}</span>
      </div>

      <div className="kpi" style={{ '--kpi-colour': channelColors.is } as React.CSSProperties}>
        <span className="kpi-label">Power factor</span>
        <span className={`kpi-value${pf < 0 ? ' is-negative' : ''}`}>{formatValue(pf)}</span>
        <span className="kpi-meter" aria-hidden="true">
          <span style={{ width: `${Math.abs(pf) * 100}%` }} />
        </span>
        <span className="kpi-sub">cos φ₁ {formatValue(metrics.displacementFactor)}</span>
      </div>

      <div className="kpi kpi-mode">
        <span className="kpi-label">Operating point</span>
        <span className={`badge ${metrics.discontinuous ? 'badge-dcm' : 'badge-ccm'}`}>
          {metrics.discontinuous ? 'Discontinuous' : 'Continuous'}
        </span>
        <span className="kpi-sub">
          {pulses}-pulse · {metrics.rippleFrequency} Hz ripple
        </span>
        <span className="kpi-sub" title="The case the closed-form expression models">
          Model: {theory.regime}
        </span>
      </div>
    </div>
  )
}
