"""
Generates the circuit figures with schemdraw.

    python scripts/schematics/build.py

Every figure is drawn once per load type and freewheeling-diode setting, with
textbook symbols and math labels. Anything the app changes at runtime (a
switch, a wire segment, a source, a load part) is drawn in its own marker
colour, which is then rewritten into a class name, so the app can recolour
the drawing without redrawing it. A manifest records where the live readouts
go, where each switch can be clicked, and which wires carry current for every
conduction state.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import schemdraw
import schemdraw.elements as elm
from schemdraw.segments import Segment

schemdraw.use('svg')
schemdraw.config(fontsize=17, lw=1.6, font='serif')

# schemdraw's SVG backend writes 36 points per drawing unit, y pointing up.
SCALE = 36
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'components' / 'schematic' / 'figures'

LOADS = ('R', 'RL', 'RLE')
LOAD_WIRES = ['w-top-a', 'w-top-b', 'p-R', 'p-L', 'p-E', 'w-bot-a', 'w-bot-b']
FREEWHEEL_WIRES = ['w-top-b', 'p-R', 'p-L', 'p-E', 'w-bot-b']
# Parts a conduction path may name that only some variants draw.
OPTIONAL = {'w-top-b', 'w-bot-b', 'p-L', 'p-E', 'w-a-u'}


def present(figure, path: list[str], key: str) -> list[str]:
    """Drops parts this variant does not draw; any other unknown name is a typo."""
    unknown = [tag for tag in path if tag not in figure.tags and tag not in OPTIONAL]
    if unknown:
        raise ValueError(f'{key}: conduction path names undrawn parts {unknown}')
    return [tag for tag in path if tag in figure.tags]


class HorizontalSine(elm.Source):
    """AC source for horizontal wires; schemdraw's own turns its sine on end with the wire."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        steps = [i / 24 for i in range(25)]
        wave = [(0.25 + 0.5 * u, -0.2 * math.sin(2 * math.pi * u)) for u in steps]
        self.segments.append(Segment(wave))


def between(element, a, b):
    """Places a two-terminal element from a to b. Sources ignore .to(), so set the angle explicitly."""
    angle = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    return element.at(a).theta(angle).length(math.hypot(b[0] - a[0], b[1] - a[1]))


def px(point) -> list[float]:
    return [round(point[0] * SCALE, 2), round(-point[1] * SCALE, 2)]


class Figure:
    def __init__(self) -> None:
        self.d = schemdraw.Drawing(show=False)
        self.d.config(unit=2)
        self.tags: dict[str, str] = {}
        self.anchors: dict[str, dict] = {}
        self.devices: dict[str, list[float]] = {}
        self.extent: list[tuple[float, float]] = []

    def colour(self, tag: str) -> str:
        if tag not in self.tags:
            n = len(self.tags) + 1
            self.tags[tag] = f'#01{n // 256:02x}{n % 256:02x}'
        return self.tags[tag]

    def add(self, element):
        self.d.add(element)
        return element

    def wire(self, tag: str | None, *points) -> None:
        for a, b in zip(points, points[1:]):
            line = between(elm.Line(), a, b)
            if tag:
                line.color(self.colour(tag))
            self.add(line)

    def hop_wire(self, tag: str, a, b, hops) -> None:
        """Horizontal wire that jumps over the vertical wires at the given x positions."""
        y = a[1]
        x = a[0]
        r = 0.16
        for hx in sorted(hops):
            self.wire(tag, (x, y), (hx - r, y))
            self.add(elm.Arc2(k=0.55).at((hx - r, y)).to((hx + r, y)).color(self.colour(tag)))
            x = hx + r
        self.wire(tag, (x, y), b)

    def dot(self, at, label: str | None = None, loc: str = 'left') -> None:
        d = elm.Dot(radius=0.075).at(at)
        if label:
            d.label(label, loc=loc)
        self.add(d)

    def text(self, at, label: str) -> None:
        self.add(elm.Label().at(at).label(label))

    def device(self, dev_id: str, a, b, loc: str = 'bottom', diode_only: bool = False) -> None:
        """Draws both forms of a switch on the same spot; the app shows one of them."""
        number = dev_id[1:] if dev_id != 'FW' else 'FW'
        variants = [('D', elm.Diode, 'D')] if diode_only else [('S', elm.SCR, 'T'), ('D', elm.Diode, 'D')]
        box = None
        for kind, cls, prefix in variants:
            e = between(cls(), a, b).color(self.colour(f'd-{dev_id}-{kind}'))
            e.label(f'${prefix}_{{{number}}}$', loc=loc)
            self.add(e)
            bb = e.get_bbox(transform=True)
            box = bb if box is None else box
        # Clickable area around the symbol, not its leads.
        cx = (a[0] + b[0]) / 2
        cy = (a[1] + b[1]) / 2
        self.devices[dev_id] = [*px((cx - 0.5, cy + 0.5)), 1.0 * SCALE, 1.0 * SCALE]

    def anchor(self, name: str, at, align: str = 'middle', width: float = 2.4) -> None:
        self.anchors[name] = {'x': px(at)[0], 'y': px(at)[1], 'anchor': align}
        # Rough extent of the runtime text so the view box leaves room for it.
        x0 = at[0] - (width if align == 'end' else width / 2 if align == 'middle' else 0)
        self.extent.append((x0, at[1] + 0.3))
        self.extent.append((x0 + width, at[1] - 0.3))

    def source(self, tag: str, a, b, name: str, loc: str) -> None:
        symbol = HorizontalSine() if a[1] == b[1] else elm.SourceSin()
        e = between(symbol, a, b).color(self.colour(tag))
        e.label(name, loc=loc)
        self.add(e)

    # ------------------------------------------------------------ DC side

    def output(self, top_from, bot_from, load_x, y_top, y_bot, load: str, fwd: bool, outlet_x: float) -> None:
        if fwd:
            fw_x = load_x - 3.8
            self.wire('w-top-a', (top_from, y_top), (fw_x, y_top))
            self.wire('w-top-b', (fw_x, y_top), (load_x, y_top))
            self.wire('w-bot-a', (bot_from, y_bot), (fw_x, y_bot))
            self.wire('w-bot-b', (fw_x, y_bot), (load_x, y_bot))
            self.dot((fw_x, y_top))
            self.dot((fw_x, y_bot))
            self.device('FW', (fw_x, y_bot), (fw_x, y_top), loc='top', diode_only=True)
            arrow_x = (outlet_x + fw_x) / 2
        else:
            self.wire('w-top-a', (top_from, y_top), (load_x, y_top))
            self.wire('w-bot-a', (bot_from, y_bot), (load_x, y_bot))
            arrow_x = (outlet_x + load_x) / 2

        arrow = elm.Arrow(headwidth=0.2, headlength=0.28)
        self.add(between(arrow, (arrow_x - 0.14, y_top), (arrow_x + 0.14, y_top)).color(self.colour('w-top-a')))
        self.anchor('io', (arrow_x, y_top + 0.42))

        parts = ['R'] + (['L'] if load != 'R' else []) + (['E'] if load == 'RLE' else [])
        slot = (y_top - y_bot) / len(parts)
        for i, kind in enumerate(parts):
            ya = y_top - slot * i
            yb = ya - slot
            centre = (ya + yb) / 2
            if kind == 'R':
                e = between(elm.Resistor(), (load_x, ya), (load_x, yb))
            elif kind == 'L':
                e = between(elm.Inductor2(loops=3), (load_x, ya), (load_x, yb))
            else:
                # schemdraw puts the long (+) plate at the start, so start at the
                # top: the back-EMF's + faces the + output rail.
                e = between(elm.Battery(), (load_x, ya), (load_x, yb))
            self.add(e.color(self.colour(f'p-{kind}')))
            self.anchor(kind, (load_x - 0.5, centre), 'end', width=2.6)

        gap = between(elm.Gap(), (load_x + 1.35, y_top - 0.2), (load_x + 1.35, y_bot + 0.2))
        self.add(gap.label(('$+$', '', '$-$')))
        self.anchor('vo', (load_x + 1.05, (y_top + y_bot) / 2), 'start', width=2.8)

    def save(self, path: Path) -> dict:
        svg = self.d.get_imagedata('svg').decode()
        svg = retag(svg, self.tags)
        view = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
        x0, y0, w, h = view
        x1, y1 = x0 + w, y0 + h
        for ux, uy in self.extent:
            sx, sy = ux * SCALE, -uy * SCALE
            x0, y0, x1, y1 = min(x0, sx), min(y0, sy), max(x1, sx), max(y1, sy)
        body = re.sub(r'^<svg[^>]*>|</svg>\s*$', '', svg.strip())
        path.write_text(body, encoding='utf-8')
        return {
            'viewBox': [round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)],
            'anchors': self.anchors,
            'devices': self.devices,
        }


def retag(svg: str, tags: dict[str, str]) -> str:
    """Rewrites each marker colour into currentColor plus a class naming the part."""
    by_colour = {c.lower(): t for t, c in tags.items()}

    def element(match: re.Match) -> str:
        text = match.group(0)
        found = None
        for colour, tag in by_colour.items():
            if colour in text.lower():
                found = tag
                text = re.sub(re.escape(colour), 'currentColor', text, flags=re.I)
        text = re.sub(r'\bblack\b', 'currentColor', text)
        if found:
            text = re.sub(r'^<(\w+)', rf'<\1 class="t-{found}"', text)
        return text

    return re.sub(r'<(?!/)(?!svg\b)[^>]+>', element, svg)


# ---------------------------------------------------------------- topologies

def half_wave(load: str, fwd: bool):
    f = Figure()
    top, bot = 0, -6
    f.source('s-1', (0, bot), (0, top), '$v_s$', 'top')
    f.anchor('vs', (-0.62, -3.55), 'end', width=1.8)
    f.device('T1', (0, top), (2.6, top), loc='bottom')
    f.output(2.6, 0, 8.6, top, bot, load, fwd, outlet_x=2.6)
    flows = {'T1': ['s-1', *LOAD_WIRES], 'fw': FREEWHEEL_WIRES}
    return f, flows


def bridge(load: str, fwd: bool):
    f = Figure()
    top, bot, mid = 0, -6, -3
    xa, xb = 0, 4.6
    f.device('T1', (xa, mid), (xa, top), loc='top')
    f.device('T4', (xa, bot), (xa, mid), loc='top')
    f.device('T3', (xb, mid), (xb, top), loc='bottom')
    f.device('T2', (xb, bot), (xb, mid), loc='bottom')
    f.wire('w-top-ab', (xa, top), (xb, top))
    f.wire('w-bot-ab', (xa, bot), (xb, bot))
    f.source('s-1', (xa, mid), (xb, mid), '$v_s$', 'top')
    f.anchor('vs', ((xa + xb) / 2, mid - 0.95), 'middle', width=1.8)
    f.dot((xa, mid), 'A', loc='left')
    f.dot((xb, mid), 'B', loc='right')
    f.dot((xb, top))
    f.dot((xb, bot))
    f.output(xb, xb, 11.1, top, bot, load, fwd, outlet_x=xb)
    flows = {
        'T1|T2': ['w-top-ab', *LOAD_WIRES, 's-1'],
        'T3|T4': ['w-bot-ab', *LOAD_WIRES, 's-1'],
        # A half-controlled bridge can short one leg and freewheel through it.
        'T1|T4': ['w-top-ab', *LOAD_WIRES, 'w-bot-ab'],
        'T3|T2': [*LOAD_WIRES],
        'fw': FREEWHEEL_WIRES,
    }
    return f, flows


PHASE_Y = (-1.5, -3.5, -5.5)
LEGS = (4.6, 6.5, 8.4)
PHASES = ('a', 'b', 'c')


def supply3(f: Figure, hops_for=None) -> None:
    for k, (p, y) in enumerate(zip(PHASES, PHASE_Y)):
        f.source(f's-{p}', (0, y), (2.4, y), f'$v_{p}$', 'top')
        f.anchor(f'v{p}', (2.55, y + 0.3), 'start', width=1.8)
        if hops_for:
            f.hop_wire(f'w-{p}', (2.4, y), (LEGS[k], y), hops_for[k])
        else:
            f.wire(f'w-{p}', (2.4, y), (LEGS[k], y))
    f.wire('w-star-ab', (0, PHASE_Y[0]), (0, PHASE_Y[1]))
    f.wire('w-star-bc', (0, PHASE_Y[1]), (0, PHASE_Y[2]))
    f.dot((0, PHASE_Y[1]))


def three_half(load: str, fwd: bool):
    f = Figure()
    top, bot = 0, -7.5
    supply3(f)
    f.wire('w-n', (0, PHASE_Y[2]), (0, bot))
    f.dot((0, PHASE_Y[2]))
    f.text((-0.45, PHASE_Y[1]), 'N')
    ids = ('T1', 'T2', 'T3')
    for k, (p, y, x) in enumerate(zip(PHASES, PHASE_Y, LEGS)):
        if k > 0:
            f.wire(f'w-{p}-u', (x, y), (x, PHASE_Y[0]))
        f.device(ids[k], (x, PHASE_Y[0]), (x, top), loc='bottom')
    f.wire('w-top-ab', (LEGS[0], top), (LEGS[1], top))
    f.wire('w-top-bc', (LEGS[1], top), (LEGS[2], top))
    f.dot((LEGS[1], top))
    f.dot((LEGS[2], top))
    f.output(LEGS[2], 0, 13.6, top, bot, load, fwd, outlet_x=LEGS[2])
    star = {0: ['w-star-ab', 'w-star-bc'], 1: ['w-star-bc'], 2: []}
    rail = {0: ['w-top-ab', 'w-top-bc'], 1: ['w-top-bc'], 2: []}
    flows = {'fw': FREEWHEEL_WIRES}
    for k, p in enumerate(PHASES):
        up = [f'w-{p}-u'] if k > 0 else []
        flows[ids[k]] = [f's-{p}', f'w-{p}', *up, *rail[k], *LOAD_WIRES, 'w-n', *star[k]]
    return f, flows


def three_bridge(load: str, fwd: bool):
    f = Figure()
    top, bot = 0, -7.5
    upper_y, lower_y = PHASE_Y[0], -6.0
    # Phase b and c leads pass over the legs to their left.
    supply3(f, hops_for=[[], [LEGS[0]], [LEGS[0], LEGS[1]]])
    upper = ('T1', 'T3', 'T5')
    lower = ('T4', 'T6', 'T2')
    for k, (p, y, x) in enumerate(zip(PHASES, PHASE_Y, LEGS)):
        if y != upper_y:
            f.wire(f'w-{p}-u', (x, y), (x, upper_y))
        f.wire(f'w-{p}-l', (x, lower_y), (x, y))
        f.device(upper[k], (x, upper_y), (x, top), loc='bottom')
        f.device(lower[k], (x, bot), (x, lower_y), loc='bottom')
        f.dot((x, y))
    f.wire('w-top-ab', (LEGS[0], top), (LEGS[1], top))
    f.wire('w-top-bc', (LEGS[1], top), (LEGS[2], top))
    f.wire('w-bot-ab', (LEGS[0], bot), (LEGS[1], bot))
    f.wire('w-bot-bc', (LEGS[1], bot), (LEGS[2], bot))
    for x in LEGS[1:]:
        f.dot((x, top))
        f.dot((x, bot))
    f.output(LEGS[2], LEGS[2], 13.6, top, bot, load, fwd, outlet_x=LEGS[2])

    top_rail = {0: ['w-top-ab', 'w-top-bc'], 1: ['w-top-bc'], 2: []}
    bot_rail = {0: ['w-bot-ab', 'w-bot-bc'], 1: ['w-bot-bc'], 2: []}
    star = {(0, 1): ['w-star-ab'], (1, 2): ['w-star-bc'], (0, 2): ['w-star-ab', 'w-star-bc']}
    flows = {'fw': FREEWHEEL_WIRES}
    for k, pk in enumerate(PHASES):
        for m, pm in enumerate(PHASES):
            dc = [*top_rail[k], *LOAD_WIRES, *bot_rail[m]]
            if k == m:
                # Both devices on one leg: the loop closes there, clear of the supply.
                path = [f'w-{pk}-u', f'w-{pk}-l', *dc]
            else:
                path = [
                    f's-{pk}', f'w-{pk}', f'w-{pk}-u',
                    *dc,
                    f'w-{pm}-l', f'w-{pm}', f's-{pm}',
                    *star[tuple(sorted((k, m)))],
                ]
            flows[f'{upper[k]}|{lower[m]}'] = path
    return f, flows


TOPOLOGIES = {
    '1ph-half-wave': half_wave,
    '1ph-bridge': bridge,
    '3ph-half-wave': three_half,
    '3ph-bridge': three_bridge,
}


def math_italic(ch: str) -> str:
    if ch.islower():
        return chr(0x1D44E + ord(ch) - ord('a'))
    return chr(0x1D434 + ord(ch) - ord('A'))


def subset_font() -> None:
    """The live readouts are typeset in the same STIX font the static labels were drawn with."""
    import ziamath
    from fontTools import subset

    source = Path(ziamath.__file__).parent / 'fonts' / 'STIXTwoMath-Regular.ttf'
    text = '0123456789.,=+-\u2212 VAHmΩ' + ''.join(math_italic(c) for c in 'abciosvREL')
    target = ROOT / 'src' / 'assets' / 'fonts' / 'stix-two-math-subset.woff'
    target.parent.mkdir(parents=True, exist_ok=True)
    options = subset.Options()
    options.flavor = 'woff'
    options.layout_features = ['*']
    font = subset.load_font(str(source), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    subset.save_font(font, str(target), options)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    subset_font()
    manifest: dict[str, dict] = {}
    for topology, draw in TOPOLOGIES.items():
        for load in LOADS:
            for fwd in (False, True):
                key = f'{topology}__{load}__{"fw" if fwd else "nofw"}'
                figure, flows = draw(load, fwd)
                entry = figure.save(OUT / f'{key}.svg')
                entry['flows'] = {state: present(figure, path, key) for state, path in flows.items()}
                manifest[key] = entry
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=1), encoding='utf-8')
    print(f'wrote {len(manifest)} figures to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
