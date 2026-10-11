import { useEffect, useState, type KeyboardEvent } from 'react'
import { FWD_ID } from '../../engine/solver'
import { deviceLabel, isThyristor } from '../../engine/topologies'
import manifest from './figures/manifest.json'
import {
  flowKey,
  readFigure,
  reading,
  trim,
  type DeviceState,
  type Figure,
  type SchematicProps,
} from './state'

/*
 * The figures are drawn ahead of time by scripts/schematics/build.py. Every
 * part the simulation changes carries a class, t-<tag>, and draws in
 * currentColor, so the live state is applied here purely as CSS.
 */

interface Anchor {
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
}

interface Entry {
  viewBox: number[]
  anchors: Record<string, Anchor>
  devices: Record<string, number[]>
  flows: Record<string, string[]>
}

const ENTRIES = manifest as Record<string, Entry>

const SOURCES = import.meta.glob<string>('./figures/*.svg', { query: '?raw', import: 'default' })
const loaded = new Map<string, string>()

function load(path: string): Promise<void> {
  const key = path.slice('./figures/'.length, -'.svg'.length)
  if (loaded.has(key)) return Promise.resolve()
  return SOURCES[path]().then((body) => {
    loaded.set(key, body)
  })
}

/** Loads the figure on demand, then the rest in the background so later switches are instant. */
function useFigureSvg(key: string): string | null {
  const [, setLoadedCount] = useState(0)
  useEffect(() => {
    if (loaded.has(key)) return
    let cancelled = false
    void load(`./figures/${key}.svg`).then(() => {
      if (cancelled) return
      setLoadedCount(loaded.size)
      for (const path of Object.keys(SOURCES)) void load(path)
    })
    return () => {
      cancelled = true
    }
  }, [key])
  return loaded.get(key) ?? null
}

/** Mathematical italic letters, as TeX sets symbols. */
function italic(text: string): string {
  return Array.from(text, (ch) => {
    if (ch >= 'a' && ch <= 'z') return String.fromCodePoint(0x1d44e + ch.charCodeAt(0) - 97)
    if (ch >= 'A' && ch <= 'Z') return String.fromCodePoint(0x1d434 + ch.charCodeAt(0) - 65)
    return ch
  }).join('')
}

const FONT_SIZE = 17
const SUB_SHIFT = 4.5

/** A live reading in the figure's math font, e.g. i_o = 8.34 A. */
function Readout({ at, symbol, value }: { at?: Anchor; symbol?: string; value: string }) {
  if (!at) return null
  const [base, sub] = symbol?.split('_') ?? []
  return (
    <text className="sch-readout" x={at.x} y={at.y} textAnchor={at.anchor} dominantBaseline="central">
      {base && <tspan>{italic(base)}</tspan>}
      {sub && (
        <tspan className="sch-sub" dy={SUB_SHIFT}>
          {italic(sub)}
        </tspan>
      )}
      <tspan dy={sub ? -SUB_SHIFT : undefined}>{symbol ? ` = ${value}` : value}</tspan>
    </text>
  )
}

function stateStyles(props: SchematicProps, figure: Figure, entry: Entry): string {
  const rules: string[] = []
  const paint = (tag: string, state: DeviceState) => {
    if (state === 'off') return
    const colour = state === 'on' ? 'var(--sch-live)' : 'var(--sch-gated)'
    const fill = state === 'on' ? 'var(--sch-live)' : 'var(--sch-gated-fill)'
    rules.push(`.schematic .t-${tag} { color: ${colour}; }`)
    rules.push(`.schematic polygon.t-${tag} { fill: ${fill} !important; }`)
  }

  for (const device of props.trace.topology.devices) {
    const thyristor = isThyristor(device, props.config.deviceMode)
    rules.push(`.schematic .t-d-${device.id}-${thyristor ? 'D' : 'S'} { display: none; }`)
    paint(`d-${device.id}-${thyristor ? 'S' : 'D'}`, figure.states.get(device.id) ?? 'off')
  }
  if (props.config.fwd) paint('d-FW-D', figure.states.get(FWD_ID) ?? 'off')

  const key = flowKey(props.trace, figure)
  const live = key ? entry.flows[key] : undefined
  if (live?.length) {
    rules.push(`${live.map((tag) => `.schematic .t-${tag}`).join(', ')} { color: var(--sch-live); }`)
  }
  return rules.join('\n')
}

function describe(label: string, state: DeviceState): string {
  const status = state === 'on' ? 'conducting' : state === 'gated' ? 'gate pulse applied' : 'blocking'
  return `${label}: ${status}. Click to switch between diode and thyristor.`
}

export function Schematic(props: SchematicProps) {
  const { trace, config, index, onToggleDevice } = props
  const key = `${trace.topology.id}__${config.load}__${config.fwd ? 'fw' : 'nofw'}`
  const entry = ENTRIES[key]
  const svg = useFigureSvg(key)
  if (!entry) return null

  const figure = readFigure(props)
  const [x, y, w, h] = entry.viewBox
  const source = (phase: number) => reading(trace.vSource[phase]?.[index] ?? 0, 'V')
  const a = entry.anchors

  return (
    <svg
      className="schematic"
      viewBox={`${x} ${y} ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={`${trace.topology.name} circuit diagram`}
      fontSize={FONT_SIZE}
    >
      <style>{stateStyles(props, figure, entry)}</style>
      {svg && <g className="sch-figure" dangerouslySetInnerHTML={{ __html: svg }} />}

      <Readout at={a.vs} value={source(0)} />
      <Readout at={a.vs1} value={source(0)} />
      <Readout at={a.vs2} value={source(1)} />
      <Readout at={a.va} value={source(0)} />
      <Readout at={a.vb} value={source(1)} />
      <Readout at={a.vc} value={source(2)} />
      <Readout at={a.io} symbol="i_o" value={reading(figure.current, 'A')} />
      <Readout at={a.vo} symbol="v_o" value={reading(figure.vo, 'V')} />
      <Readout at={a.R} symbol="R" value={`${trim(config.R)} Ω`} />
      <Readout at={a.L} symbol="L" value={`${trim(config.L)} mH`} />
      <Readout at={a.E} symbol="E" value={`${trim(config.E)} V`} />

      {trace.topology.devices.map((device) => {
        const box = entry.devices[device.id]
        if (!box || !device.controllable || !onToggleDevice) return null
        const label = deviceLabel(device, config.deviceMode)
        const toggle = () => onToggleDevice(device.id)
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggle()
          }
        }
        return (
          <g
            key={device.id}
            className="device-clickable"
            role="button"
            tabIndex={0}
            aria-label={describe(label, figure.states.get(device.id) ?? 'off')}
            onClick={toggle}
            onKeyDown={onKeyDown}
          >
            <title>{describe(label, figure.states.get(device.id) ?? 'off')}</title>
            <rect className="device-hit" x={box[0]} y={box[1]} width={box[2]} height={box[3]} rx={5} />
          </g>
        )
      })}
    </svg>
  )
}

export type { SchematicProps }
