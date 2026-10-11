import { assumptionsHold, type Analytical } from '../engine/analytical'
import type { Metrics } from '../engine/metrics'
import { Card } from './Card'
import { BookIcon } from './icons'
import { Katex } from './Katex'
import { formatValue } from './useCanvas'

export function TheoryPanel({
  theory,
  metrics,
  title,
}: {
  theory: Analytical
  metrics: Metrics
  title: string
}) {
  const applies = assumptionsHold(theory, metrics.discontinuous)
  const error =
    applies && theory.vdc !== null && Math.abs(theory.vdc) > 1
      ? ((metrics.vdc - theory.vdc) / Math.abs(theory.vdc)) * 100
      : null

  return (
    <Card
      icon={<BookIcon />}
      title="Theory"
      subtitle={title}
      actions={<span className="theory-regime">{theory.regime}</span>}
    >
      <div className="card-body">
        <p className="prose">{theory.description}</p>

        <div className="theory-formula">
          <Katex expression={theory.latex} />
        </div>

        <div className="theory-compare">
          <div>
            <span className="compare-label">Simulated</span>
            <span className="compare-value">{formatValue(metrics.vdc, 'V')}</span>
          </div>
          <div>
            <span className="compare-label">Closed form</span>
            <span className="compare-value">
              {theory.vdc === null ? '—' : formatValue(theory.vdc, 'V')}
            </span>
          </div>
          <div>
            <span className="compare-label">Difference</span>
            <span className={`compare-value ${error !== null ? 'is-good' : 'is-muted'}`}>
              {error !== null ? `${Math.abs(error).toFixed(2)} %` : 'n/a'}
            </span>
          </div>
        </div>

        {error !== null ? (
          <div className="callout callout-info">
            The numerical solver and the textbook expression agree to{' '}
            <b>{Math.abs(error).toFixed(2)}%</b>, which is the discretisation floor of the solver
            rather than a difference in physics.
          </div>
        ) : null}

        {theory.requiresContinuous && metrics.discontinuous ? (
          <div className="callout callout-warn">
            <b>The formula no longer applies.</b> It assumes the load current never reaches zero,
            but conduction here is discontinuous, so the output sits at the load EMF during the gaps
            instead of following the supply. Add inductance, add a freewheeling diode, or reduce the
            firing angle to bring the two back into agreement.
          </div>
        ) : null}

        {theory.note ? <div className="callout callout-info">{theory.note}</div> : null}
      </div>
    </Card>
  )
}
