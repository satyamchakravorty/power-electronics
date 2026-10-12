import { TOPOLOGY_ORDER } from '../engine/topologies'
import type { TopologyId } from '../engine/types'
import { TopologyGlyph } from './icons'

const TAB_TEXT: Record<TopologyId, { name: string; detail: string }> = {
  '1ph-half-wave': { name: 'Half-wave', detail: '1-phase · 1-pulse' },
  '1ph-bridge': { name: 'Full bridge', detail: '1-phase · 2-pulse' },
  '3ph-half-wave': { name: 'Half-wave', detail: '3-phase · 3-pulse' },
  '3ph-bridge': { name: 'Full bridge', detail: '3-phase · 6-pulse' },
}

export function TopologyTabs({
  value,
  onChange,
}: {
  value: TopologyId
  onChange: (topology: TopologyId) => void
}) {
  return (
    <nav className="topology-tabs" aria-label="Converter topology">
      {TOPOLOGY_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          className="topology-tab"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          <TopologyGlyph topology={id} />
          <span className="topology-tab-text">
            <span className="topology-tab-name">{TAB_TEXT[id].name}</span>
            <span className="topology-tab-detail">{TAB_TEXT[id].detail}</span>
          </span>
        </button>
      ))}
    </nav>
  )
}
