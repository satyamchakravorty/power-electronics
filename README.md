# Rectifier Lab

An interactive simulator for single-phase and three-phase rectifiers. Pick a topology, choose
diodes or thyristors, set the firing angle and the load, and watch the conduction path light up on
the schematic while the oscilloscope and the headline figures update with it.

The firing angle and the playback cursor sit directly under the schematic and the oscilloscope, so
either can be dragged while both views are in sight. The keyboard drives them too: Space plays or
pauses, ← and → step the cursor, ↑ and ↓ change α (hold Shift for 10° steps), and 1–3 pick a
converter.

Every number on screen comes from a time-domain simulation, and the mean output voltage is shown
next to the textbook closed-form result wherever that formula's assumptions hold.

## Topologies

| Topology | Pulses | Devices | Half-controlled |
| --- | --- | --- | --- |
| Single-phase half-wave | 1 | 1 | – |
| Single-phase full bridge | 2 | 4 | yes |
| Three-phase full bridge | 6 | 6 | yes |

Each can run as an uncontrolled (diode) rectifier, a fully controlled converter, or — for the
bridges — a semi-converter, with an optional freewheeling diode and an R, R-L or R-L-E load.

## How the simulation works

The solver is topology-agnostic. A topology is described as data: a list of devices, each tagged
with the group it belongs to (which rail it can reach), the phase it connects to, whether it is
controllable, and the angle at which an equivalent diode would begin to conduct. That last field is
what makes a single firing-angle rule work across every converter.

At each step the solver applies the ideal-switch conduction rule — the upper group hands the
positive rail to the most positive available phase, the lower group hands the negative rail to the
most negative — where a diode is always available and a thyristor only once it has been gated or
has latched. Gate signals are pulse trains, so a thyristor gated before it is forward-biased (α
below Hart's $\alpha_{min}$ against a back-EMF) fires the moment the supply rises past E. In the
single-phase converters the train ends with the device's positive half-cycle, the range Hart's α
refers to; the six-pulse bridge holds it for the full conduction span, which it needs to re-gate
each thyristor when its partner in the next pair fires. The load current
then follows from integrating

$$L \frac{di}{dt} = v_o - iR - E$$

with RK4. Where the current would cross zero inside a step, the applied voltage is blended over the
fraction of the step that actually conducted, which is what keeps the volt-second balance exact in
discontinuous conduction.

Rather than running hundreds of warm-up cycles to settle a stiff load, periodic steady state is
found with a shooting method on the map from the current at the start of a cycle to the current one
cycle later. That map is piecewise affine: its slope is the R-L decay over a cycle while current
flows throughout, and zero wherever the current has to restart from rest. The gap between the two
currents therefore falls strictly, so the fixed point is bracketed and found by secant steps inside
the bracket. A plain Newton step on the continuous-conduction slope would overshoot by up to L/R
cycles in discontinuous conduction against a back-EMF. Integration runs at twelve sub-steps per
plotted sample, so commutation instants that fall between samples do not bias the averages.

Supply-side quantities (THD, displacement factor, power factor) come from a direct DFT, which
avoids constraining the sample count to a power of two.

### Validation

The suite in `src/engine/solver.test.ts` holds the solver to 193 tests, covering:

- agreement with the closed-form $V_{dc}$ for every topology across firing angles and load regimes,
  skipping the comparisons where the formula's own continuous-conduction assumption does not hold
- volt-second balance, $V_{dc} = I_{dc}R + E$, which must hold in every conduction mode
- textbook supply-side values: 48.3% current THD for a stiff single-phase bridge, 31.1% for the
  six-pulse bridge, and a displacement factor equal to $\cos\alpha$
- device stress: peak inverse voltage of $V_m$ for a bridge, and 120° conduction in the six-pulse
  bridge
- inverter operation into a negative back-EMF, and the fact that a passive load cannot be driven
  into inversion
- R-L-E loads in discontinuous conduction with a stiff inductor, freewheeling after a lone
  thyristor's gate pulse ends, and gating confined to the positive half-cycle under a negative EMF

`src/engine/hart.test.ts` adds 13 more against D. W. Hart, *Power Electronics*, chapters 3 and 4.
They reproduce the worked examples from the book's own circuit values: half-wave diode and
thyristor rectifiers, the freewheeling diode, single-phase bridges in continuous and discontinuous
conduction, an RL-source load, single- and three-phase inverter operation, and the six-pulse
bridge's supply-current harmonics and diode reverse voltage. Each one checks extinction angles,
average and RMS currents, power and power factor to within 1%.

Example 3-11 prints $I_o = 2.19$ A, which contradicts the example's own extinction angle: the
inductor averages zero volts, so $I_o = V_m(\cos\alpha - \cos\beta)/2\pi R = 2.04$ A, and
integrating the book's current expression gives the same. The simulator gets 2.04 A, and matches
the book's $I_{rms}$, $P$ and power factor for that example exactly.

```bash
npm test
```

## Running locally

```bash
npm install
npm run dev
```

`npm run build` produces a static `dist/` with a relative base path, so it can be served from any
subdirectory. Pushing to `main` builds, tests and publishes it to GitHub Pages.

## Project layout

```
src/engine/      topology data, solver, metrics, DFT, closed-form results
src/components/  schematics, canvas oscilloscope, panels
src/state/       zustand store and the playback clock
scripts/         schematic generator
```

The schematics are drawn with [schemdraw](https://schemdraw.readthedocs.io/) by
`scripts/schematics/build.py`, one SVG per topology, load and freewheeling-diode setting, using
standard symbols and STIX math labels. Every part the simulation changes is tagged with a class,
and a manifest records the current path for each conduction state, the clickable area of each
switch and where the live readouts go. The app colours the figure through CSS and never redraws
it. Wires that cross without connecting hop over each other, so the three-phase figures stay
unambiguous. `src/components/schematic/figures.test.ts` checks the figures against the solver:
every conduction state it can reach must have a drawn current path.

The generated figures are committed, so building the site needs no Python. After editing a layout,
regenerate them with `npm run schematics`, which needs Python and `pip install schemdraw ziamath`.
