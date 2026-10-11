import { useMemo } from 'react'
import { Card } from './components/Card'
import { ControlPanel, Range } from './components/ControlPanel'
import { DeviceTable } from './components/DeviceTable'
import { HarmonicsChart } from './components/HarmonicsChart'
import {
  CircuitIcon,
  LogoMark,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  ScopeIcon,
  SpectrumIcon,
  SunIcon,
} from './components/icons'
import { KpiStrip, MetricsPanel } from './components/MetricsPanel'
import { Schematic } from './components/schematic'
import { Scope } from './components/Scope'
import { TheoryPanel } from './components/TheoryPanel'
import { TopologyTabs } from './components/TopologyTabs'
import { formatValue } from './components/useCanvas'
import { analytical } from './engine/analytical'
import { channelsFor, type Channel } from './engine/channels'
import { computeMetrics } from './engine/metrics'
import { SAMPLES_PER_CYCLE, simulate } from './engine/solver'
import { useSimStore } from './state/useSimStore'
import { usePlayback } from './state/usePlayback'
import { useTheme } from './state/useTheme'
import { channelPalette } from './theme'

/** Supply cycles per second of wall clock. */
const SPEEDS = [0.1, 0.25, 0.5, 1, 2]

export default function App() {
  const config = useSimStore((s) => s.config)
  const setConfig = useSimStore((s) => s.setConfig)
  const toggleDevice = useSimStore((s) => s.toggleDevice)
  const playhead = useSimStore((s) => s.playhead)
  const setPlayhead = useSimStore((s) => s.setPlayhead)
  const playing = useSimStore((s) => s.playing)
  const setPlaying = useSimStore((s) => s.setPlaying)
  const speed = useSimStore((s) => s.speed)
  const setSpeed = useSimStore((s) => s.setSpeed)
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

  const trace = useMemo(() => simulate(config), [config])
  const metrics = useMemo(() => computeMetrics(trace), [trace])
  const channels = useMemo(() => channelsFor(trace, channelPalette(themeMode)), [trace, themeMode])
  const theory = useMemo(() => analytical(config), [config])

  const angle = (playhead / SAMPLES_PER_CYCLE) * 360

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

            <div className="transport">
              <button
                className="play-button"
                type="button"
                aria-label={playing ? 'Pause' : 'Play'}
                onClick={() => setPlaying(!playing)}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <div className="transport-angle">
                <span className="transport-label">ωt</span>
                <span className="mono">{angle.toFixed(0).padStart(3, ' ')}°</span>
              </div>
              <Range
                min={0}
                max={SAMPLES_PER_CYCLE - 1}
                step={1}
                value={playhead}
                label="Angle through the supply cycle"
                onChange={setPlayhead}
              />
              <div className="seg seg-small" title="Supply cycles per second of real time">
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
              <span className="transport-note">
                At 1× one cycle takes a second instead of {(1000 / config.f).toFixed(0)} ms
              </span>
            </div>
          </div>

          <div className="grid-2">
            <Card
              icon={<SpectrumIcon />}
              title="Supply current harmonics"
              subtitle={`Relative to the fundamental · ${Math.round(metrics.rippleFrequency / config.f)}-pulse converter`}
              actions={
                <span className="stat">
                  <span className="stat-label">THD</span>
                  <span className="stat-value">{formatValue(metrics.thd * 100)}%</span>
                </span>
              }
              footer="An ideal p-pulse bridge draws harmonics only at orders p·k ± 1. The single-phase bridge therefore carries every odd harmonic, while the six-pulse bridge cancels the 3rd and 9th and is left with the 5th, 7th, 11th, 13th and so on."
            >
              <div className="card-body chart-body">
                <HarmonicsChart spectrum={metrics.sourceSpectrum} />
              </div>
            </Card>

            <TheoryPanel theory={theory} metrics={metrics} title={trace.topology.name} />
          </div>

          <div className="grid-2">
            <MetricsPanel metrics={metrics} config={config} />
            <DeviceTable metrics={metrics} topology={trace.topology} config={config} />
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