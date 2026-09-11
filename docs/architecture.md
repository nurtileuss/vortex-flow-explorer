# Architecture

VORTEX is a static web application. It has two independent visualization surfaces: a vortex renderer with a cinematic mode and **Flow Explorer**, and a wind-tunnel renderer. They share navigation, compact information panels, and an optional audio controller. It does not need a server-side application, database, rendering service, or model-provider API.

## Runtime map

```text
index.html + styles.css + explorer.css + live-scene.css
        │
        ├── vortex.js ───── cosmos.js
        │      │              └── post-processing passes
        │      └── stationary field → trajectories → WebGL geometry
        │
        ├── aero.js ─────── assets/aero/{fly,car,plane}.json
        │      │              ├── 3D mesh for display
        │      │              └── 2D silhouette mask for the solver
        │      └── aero-worker.js ─── aero-solver.js
        │                └── velocity/density snapshots → field rendering
        │
        └── interface.js + soundtrack.js
               ├── #explore routing and docked panels
               └── optional media and playback coordination
```

All numerical quantities are in model or lattice units. No input is interpreted as a measured physical speed in km/h or m/s.

## Vortex geometry

`vortex.js` samples trajectories from a stationary Burgers vortex field. The baseline parameters are `a = 0.65`, `ν = 0.048`, and `Γ = 8.4`; the interface adjusts multipliers of these values.

The display contains 320 trajectories: 216 thin round strands, 72 flat elliptical ribbons, and 32 fine supporting lines. Each ribbon is accompanied by three fine filaments; closely interleaved bundles reduce gaps through the whole form. Assembly particles are sampled from the solid trajectories. Indexed 16-bit mesh batches share ring vertices to keep memory use bounded. Tube radii are selected for visual readability rather than representing physical tube boundaries. Color encodes relative angular speed before an artistic radial envelope narrows the upper and lower stems by up to 34% and 28%. The displayed centerlines are therefore a stylized illustration rather than the exact spatial field.

The renderer uses native WebGL. Fine trajectories use triangle ribbons with soft edges to preserve legibility; the round strands have radii 0.0065–0.011, and the ribbons have 5:1 elliptical cross sections. Parallel transport keeps their orientation stable; normals from surface derivatives account for taper and roll. A packed 24-bit depth-stencil texture avoids surface conflicts on closely spaced ribbons when supported; otherwise a 16-bit depth buffer is used. The post-processing layer in `cosmos.js` supplies edge smoothing and restrained glow. Pixel density is capped according to both a rendering budget and device limits.

### Choreography and interaction

The timeline uses elapsed real time with fixed timing:

| Interval | Visual action |
| --- | --- |
| 0–18 seconds | Particles converge and trajectories emerge. |
| 18–21 seconds | The remaining particle cloud fades. |
| By 30 seconds | The camera completes its pullback to the full form. |
| After 30 seconds | The completed form continues a gentle rotation, traveling axial twist, and subtle lateral sway. |

Assembly and twist are artistic transformations of a stationary field. They should not be presented as a numerical solution of an evolving three-dimensional flow.

The visitor can pause, replay, scrub, rotate, and zoom. Pausing freezes the animated formation, deformation, and traveling light. A reduced-motion preference starts with a complete, stationary form. Hidden or offscreen scenes suspend animation work; loss of the WebGL context exposes a static fallback and a recovery message.

### Flow Explorer

`#explore` identifies a dedicated inspection mode of the vortex renderer, not a separately loaded application or a second canvas. The **Explore in 3D** link enters the mode. A direct link with the same fragment opens it immediately, and browser Back/Forward navigation updates the mode through the page's history handling.

Explorer presents the complete stylized geometry without the animated twist or sway. It hides the formation transport, gives the canvas additional room, and opens the parameter panel. The visitor can freely rotate and zoom, choose an oblique, side, or axial view, select presets, and adjust circulation, stretching, or viscosity. **Back to animation** returns to the cinematic view and restarts the sequence. Switching to the wind tunnel leaves Explorer mode.

`interface.js` owns the route and panel state. `vortex.js` owns the renderer state and the distinction between cinematic choreography and direct geometry inspection. `explorer.css` supplies the layout, entry link, mode badge, and responsive panel placement. The distinction remains one of presentation: Explorer still visualizes the same stationary Burgers vortex model.

## Aerodynamic lab

The visible fruit fly is adapted from the Apache-2.0 NeuroMechFly v2 anatomy by NeLy / EPFL; the car and plane are original procedural meshes. All were prepared in Blender. The fly separates opaque anatomy and veins from translucent wing membranes and uses a closer camera. Its wings stay fixed: the flow does not simulate flapping flight. Each JSON asset contains packed vertex positions, normals, colors, and a side-silhouette mask. The car body is red. Meshes are fetched when selected and cached in memory. Object dimensions are illustrative model units. The fly is deliberately displayed larger through its camera; this does not imply a larger physical insect.

The camera changes only the visual inspection angle. Turning a mesh does not rotate the obstacle inside the two-dimensional simulation: the calculation continues to use the same side silhouette.

The car is an unbranded Formula 1-style study with open wheels, a halo, suspension, and front and rear wings. Its display mesh contains 32,336 triangles and spans 5.6 illustrative units. The solver uses its side-projection mask and does not calculate real downforce. A development stability check advanced this mask for 6,500 steps at each supported endpoint and the default flow multiplier (0.65, 1.0, and 1.4), preserving finite fields and zero velocity in solid cells. That check establishes numerical health for those runs, not aerodynamic validation.

### Solver

`aero-solver.js` implements D2Q9 BGK lattice Boltzmann with typed arrays. The active scene requests a 288 × 144 lattice.

| Setting | Implementation |
| --- | --- |
| Discrete velocities | Nine directions on a two-dimensional lattice |
| Collision model | Single-relaxation-time BGK |
| Relaxation time | `tau = 0.62` |
| Inlet speed | `0.055 × speedMultiplier` |
| Multiplier range | `0.65–1.4` |
| Solid boundary | Bounce-back at the fixed obstacle silhouette |
| Inlet, top, bottom | Prescribed uniform-flow equilibrium |
| Outlet | Extrapolation from the interior, with a nearby damping region |

The distribution function advances through collision and streaming. Density and velocity are recovered from its moments. The implementation stops and reports an error when density or velocity fails its health bounds instead of continuing to draw an invalid field.

`aero-worker.js` runs the calculation outside the UI thread and transfers field snapshots back to the renderer. Each new calculation has an epoch identifier; the page discards old snapshots after an object or flow setting changes. Pausing, switching away, and hiding the page suspend the worker's ongoing calculation.

### Reading the visualization

- **Lines:** particles and streamlines follow the calculated planar velocity field.
- **Speed:** color shows speed relative to the inlet, using a display range of 0–2.4 times the inlet speed.
- **Vorticity:** color distinguishes the sign of the planar curl: copper for counterclockwise motion and blue for clockwise motion.
- **Wake deficit:** the displayed percentage averages `max(0, 1 − ux / Uin)` across a fixed section behind the body, at scene `x = 4` over `y ∈ [−1.8, 1.8]`. It appears after 900 simulation steps. This warm-up threshold does not establish that the flow has converged.

The deficit is a local visualization metric, not a force measurement. Differences can depend on grid resolution, silhouette, chosen section, inlet conditions, and the current simulation state. Three-dimensional flow around a real object, wheel or propeller rotation, wingtip vortices, real lift, and validated drag coefficients are outside this implementation.

## Interface and optional audio

Page controls are native HTML buttons, ranges, and selectors. Their state is exposed through labels and pressed or expanded attributes. CSS handles the compact panel transitions and respects reduced-motion preferences.

The model notes, research credits, parameters, and film use non-modal `<aside>` panels. One panel is open at a time. On desktop, the scene reserves space for the panel on its right, so the object remains visible and interactive. On narrow screens, the panel moves below the visible portion of the scene. There is no modal backdrop or document-wide focus trap. Opening a panel moves focus into it; the close button or Escape returns focus to its trigger.

The model panel adapts to the active surface. In the wind tunnel, it also updates its heading and introduction for the selected fly, car, or plane. The film remains in a compact side player. Closing or replacing its panel pauses the video.

`soundtrack.js` coordinates one optional audio element with the active scene. It listens for the vortex playback event and for wind-tunnel playback controls. It also handles replay, page visibility, and media playback. Audible autoplay is attempted, then retried after a genuine visitor gesture if the browser requires one.

Film audio from development is excluded from the public package. An optional replacement is a separate media asset; its license is independent of the JavaScript source. The renderer and solver do not require an audio file.

## Deployment and maintenance

Serve `dist/` as a static directory over HTTP or HTTPS. Relative URLs keep it portable across static hosts. Do not publish the private hosting manifest, deployment records, local working files, or the development repository's Git history.

No bundler or package manager is required. For a source change, check JavaScript syntax and exercise the affected scene in a browser. For a solver change, additionally inspect stability over sustained runs across the three silhouettes and supported flow settings. A visual check alone cannot validate a numerical method or establish physical accuracy.

Private deployment metadata is intentionally outside the public package; this document describes the application, not its account-specific hosting setup.
