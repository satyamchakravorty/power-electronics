import { useMemo } from 'react'
import { Card } from './components/Card'
import { ControlPanel } from './components/ControlPanel'
import { CircuitIcon, LogoMark, MoonIcon, ScopeIcon, SunIcon } from './components/icons'
import { KpiStrip } from './components/KpiStrip'
import { Schematic } from './components/schematic'
import { Scope } from './components/Scope'
import { TopologyTabs } from './components/TopologyTabs'
import { AlphaBar, PlaybackBar, ShortcutHints } from './components/Transport'
import { formatValue } from './components/useCanvas'
import { analytical } from './engine/analytical'
import { channelsFor, type Channel } from './engine/channels'
import { computeMetrics } from './engine/metrics'
import { simulate } from './engine/solver'
import { useSimStore } from './state/useSimStore'
import { usePlayback } from './state/usePlayback'
import { useShortcuts } from './state/useShortcuts'
import { useTheme } from './state/useTheme'
import { channelPalette } from './theme'

export default function App() {
  const config = useSimStore((s) => s.config)
  const setConfig = useSimStore((s) => s.setConfig)
  const toggleDevice = useSimStore((s) => s.toggleDevice)
  const playhead = useSimStore((s) => s.playhead)
  const setPlayhead = useSimStore((s) => s.setPlayhead)
  const scopeMode = useSimStore((s) => s.scopeMode)
  const setScopeMode = useSimStore((s) => s.setScopeMode)
  const visibleChannels = useSimStore((s) => s.visibleChannels)
  const toggleChannel = useSimStore((s) => s.toggleChannel)
  const showAverage = useSimStore((s) => s.showAverage)
  const setShowAverage = useSimStore((s) => s.setShowAverage)
  const showGrid = useSimStore((s) => s.showGrid)
  const setShowGrid = useSimStore((s) => s.setShowGrid)

  const themeMode = useTheme((s) => s.mode)
  const toggleTheme = useTheme((s) => s.toggle)

  usePlayback()
  useShortcuts()

  const trace = useMemo(() => simulate(config), [config])
  const metrics = useMemo(() => computeMetrics(trace), [trace])
  const channels = useMemo(() => channelsFor(trace, channelPalette(themeMode)), [trace, themeMode])
  const theory = useMemo(() => analytical(config), [config])

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <LogoMark />
          <div>
            <h1>Rectifier Lab</h1>
            <span className="tagline">Interactive power electronics converter simulator</span>
          </div>
        </div>
        <div className="header-spacer" />
        <div className="header-actions">
          <button
            className="btn theme-toggle"
            type="button"
            aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {themeMode === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="rail">
          <ControlPanel />
        </aside>

        <main className="main">
          <TopologyTabs value={config.topology} onChange={(topology) => setConfig({ topology })} />

          <KpiStrip metrics={metrics} theory={theory} config={config} />

          <div className="stage">
            <Card
              icon={<CircuitIcon />}
              title={trace.topology.name}
              subtitle="Click a switch to swap it between diode and thyristor"
              className="stage-schematic"
              footer={
                <div className="legend">
                  <span className="legend-item legend-on">Conducting</span>
                  <span className="legend-item legend-gated">Gate pulse, still blocking</span>
                  <span className="legend-item legend-off">Blocking</span>
                </div>
              }
            >
              <div className="schematic-frame">
                <Schematic
                  trace={trace}
                  config={config}
                  index={playhead}
                  onToggleDevice={toggleDevice}
                />
              </div>
            </Card>

            <AlphaBar />

            <Card
              icon={<ScopeIcon />}
              title="Oscilloscope"
              subtitle="One steady-state cycle. Drag across the screen to move the cursor."
              className="stage-scope"
              actions={
                <>
                  <div className="seg seg-small">
                    <button
                      type="button"
                      aria-pressed={scopeMode === 'superimposed'}
                      onClick={() => setScopeMode('superimposed')}
                    >
                      Overlay
                    </button>
                    <button
                      type="button"
                      aria-pressed={scopeMode === 'stacked'}
                      onClick={() => setScopeMode('stacked')}
                    >
                      Stacked
                    </button>
                  </div>
                  <button
                    type="button"
                    className="pill-toggle"
                    aria-pressed={showAverage}
                    onClick={() => setShowAverage(!showAverage)}
                  >
                    V_dc
                  </button>
                  <button
                    type="button"
                    className="pill-toggle"
                    aria-pressed={showGrid}
                    onClick={() => setShowGrid(!showGrid)}
                  >
                    Grid
                  </button>
                </>
              }
            >
              <div className="chips">
                {channels.map((channel) => (
                  <ChannelChip
                    key={channel.id}
                    channel={channel}
                    active={visibleChannels.includes(channel.id)}
                    reading={channel.data[playhead]}
                    onClick={() => toggleChannel(channel.id)}
                  />
                ))}
              </div>
              <div className="scope-frame">
                <Scope
                  channels={channels}
                  visible={visibleChannels}
                  mode={scopeMode}
                  playhead={playhead}
                  vdc={metrics.vdc}
                  showAverage={showAverage}
                  showGrid={showGrid}
                  onScrub={setPlayhead}
                />
              </div>
            </Card>

            <PlaybackBar />
            <ShortcutHints />
          </div>

          <footer className="app-footer">
            <p>
              The solver integrates the load equation with fourth-order Runge–Kutta and finds the
              periodic steady state by shooting, so start-up transients never pollute a reading.
              Its results are checked against the closed-form expressions and against the worked
              examples of D. W. Hart, <i>Power Electronics</i>, chapters 3 and 4.
            </p>
          </footer>
        </main>
      </div>
    </div>
  )
}

function ChannelChip({
  channel,
  active,
  reading,
  onClick,
}: {
  channel: Channel
  active: boolean
  reading: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={active}
      onClick={onClick}
      title={channel.title}
      style={{ '--chip-colour': channel.color } as React.CSSProperties}
    >
      <span className="swatch" />
      <span className="chip-name">{channel.label}</span>
      <span className="reading">{formatValue(reading, channel.unit)}</span>
    </button>
  )
}