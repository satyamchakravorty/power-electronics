import type { Metrics } from '../engine/metrics'
import { FWD_ID } from '../engine/solver'
import { deviceLabel } from '../engine/topologies'
import type { SimConfig, Topology } from '../engine/types'
import { Card } from './Card'
import { ChipIcon } from './icons'
import { formatValue } from './useCanvas'

/**
 * Per-device loading. These are the numbers you size real parts from, and
 * they make the difference between topologies concrete: a centre-tapped
 * rectifier needs devices rated for twice the bridge's reverse voltage.
 */
export function DeviceTable({
  metrics,
  topology,
  config,
}: {
  metrics: Metrics
  topology: Topology
  config: SimConfig
}) {
  return (
    <Card
      icon={<ChipIcon />}
      title="Device stress"
      subtitle="What each switch has to survive"
      footer={
        <>
          Every device must block <b>{formatValue(metrics.piv, 'V')}</b> in reverse, which is{' '}
          {formatValue(metrics.piv / (config.Vrms * Math.SQRT2))} times the supply peak. Rate the
          switches above that, with margin for supply transients.
        </>
      }
    >
      <table className="data">
        <thead>
          <tr>
            <th>Device</th>
            <th>I avg</th>
            <th>I rms</th>
            <th>Conducts</th>
          </tr>
        </thead>
        <tbody>
          {metrics.devices.map((stress) => {
            const spec = topology.devices.find((d) => d.id === stress.id)
            const label = spec ? deviceLabel(spec, config.deviceMode) : 'D_FW'
            return (
              <tr key={stress.id}>
                <td>{stress.id === FWD_ID ? 'D_FW' : label}</td>
                <td className="num">{formatValue(stress.iAvg, 'A')}</td>
                <td className="num">{formatValue(stress.iRms, 'A')}</td>
                <td className="num">
                  <span className="conduction">
                    <span
                      className="conduction-bar"
                      style={{ width: `${Math.min(100, (stress.conductionDeg / 360) * 100)}%` }}
                    />
                  </span>
                  {stress.conductionDeg.toFixed(0)}°
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
