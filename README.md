# The Black Archive | GNSS + INS navigation demo

An interactive research demo for The Black Archive's Smart India Hackathon (SIH) navigation project. It illustrates how a navigation display might carry a vehicle's position through degraded or missing GNSS, using inertial dead reckoning, a simulated error-state Kalman filter (ESKF), and an illustrative AI-bias-correction stage.

**This is a simulation, not a connected receiver or a trained navigation model.** Readings, routes, uncertainty and AI outputs are synthetic and generated in the browser. Do not use the demo for navigation or safety decisions.

Live hosted preview: https://files.instinct.com/file-01M3EFR4BK4N9FZ5WB51ZZ5TH1

## What you can explore

- A landing page with a terrain illustration and a live simulated map below it.
- A route-monitor cockpit with fused position, GNSS fixes, uncertainty, signal health and event timeline.
- Simulation controls: choose a scenario, run/pause/reset, trigger outage or recovery, and compare the illustrative AI correction switch.
- Analytics charts for position error and uncertainty, with a state-transition log.
- System readouts for GNSS, IMU, ESKF and simulated AI stages, plus an About page explaining the limits of the prototype.
- Responsive layouts and reduced-motion support.

## Tech stack

React 18, TypeScript, Vite, React Router, CSS, SVG and Canvas. The simulator is deterministic browser-side TypeScript in `src/sim.ts`; there is no backend, hardware feed or model inference service. Map imagery consists of bundled CARTO dark tiles with OpenStreetMap contributor attribution.

## Run locally

Install Node.js 20 or newer and npm. Then:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To make a production build:

```sh
npm run build
npm run preview
```

The Vite build has been checked with TypeScript. The source in this repository uses React Router for standalone local hosting. The linked hosted File uses its own routing adapter, so the two builds have the same UI and simulation but use different routing wrappers. If deploying this standalone build behind a static host, configure a fallback from unknown routes to `index.html` so direct links to `/live`, `/analytics`, `/system` and `/about` work.

## Project structure

- `src/App.tsx` - the landing page, dashboard routes and shared navigation.
- `src/sim.ts` - deterministic scenarios, state ladder and synthetic telemetry.
- `src/components.tsx`, `src/charts.tsx`, `src/map.tsx` - cockpit controls, charts and map.
- `src/about.tsx` - project explanation and glossary.
- `src/tiles/`, `src/fonts/` and the image assets - bundled presentation assets.

## Data and credits

This prototype uses a seeded mock adapter and a fictional demonstration track around a Bengaluru map anchor. It does not read location, GNSS, IMU or personal account data. Map tiles are CARTO dark basemap imagery with OpenStreetMap contributor attribution. The mountain on the landing page is illustrative and is not georeferenced. The Black Archive is the SIH team behind this research demo.
