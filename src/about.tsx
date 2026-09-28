import React from 'react';
import { PROJECT_NAME, PROJECT_TAGLINE } from './config';
import { Icon } from './ui';

const GLOSSARY: [string, string][] = [
  ['GNSS', 'Global navigation satellite systems (GPS, NavIC, Galileo, ...). The absolute position source.'],
  ['INS / IMU', 'Inertial navigation system / inertial measurement unit. Accelerometers and gyroscopes; drifts without external correction.'],
  ['Dead reckoning', 'Propagating position from a known fix using heading and speed (or inertial sensing) when the absolute source is gone.'],
  ['ESKF', 'Error-state Kalman filter. Fuses GNSS and inertial data and tracks its own uncertainty (covariance).'],
  ['NIS', 'Normalized innovation squared. Measures how surprising each GNSS update is; above the gate the update is rejected.'],
  ['HDOP', 'Horizontal dilution of precision. Lower is better; above ~4 the geometry is poor.'],
  ['C/N0', 'Carrier-to-noise density in dB-Hz. Signal strength per satellite.'],
  ['95% uncertainty', 'Radius (2.45 x 1-sigma) inside which the true position lies with 95% probability, under the filter model.'],
  ['CRS', 'Coordinate reference system for displayed coordinates.'],
];

export function AboutPanel() {
  return (
    <div className="about">
      <section>
        <h4><Icon name="info" /> THE PROBLEM</h4>
        <p>Navigation becomes unreliable whenever GNSS is degraded or unavailable - a tunnel, an urban canyon, a temporary outage. Position is still needed, and losing it is worse than a wrong answer because the driver does not know it has happened.</p>
        <p>{PROJECT_NAME} explores navigation continuity: combine inertial sensing with an explicit estimate of the navigation state, so the system knows what it is doing and how much to trust it.</p>
      </section>
      <section>
        <h4><Icon name="pin" /> WHO IT IS FOR</h4>
        <p>Any vehicle that must keep navigating when satellites do not: road and rail vehicles in tunnels and cuttings, warehouse and port equipment indoors, drones below or between obstructions, and survey work where the sky is blocked. The requirement is not a better fix - it is a position that keeps arriving, and an honest measure of its own error.</p>
      </section>
      <section>
        <h4><Icon name="layers" /> WHAT IS BUILT VS SIMULATED</h4>
        <ul>
          <li><b>Built:</b> navigation-state architecture and the full state ladder (fused {'\u2192'} degraded {'\u2192'} lost {'\u2192'} dead reckoning {'\u2192'} AI correction {'\u2192'} re-fusion {'\u2192'} stabilized), an honest uncertainty display, event timeline, and synchronized analytics.</li>
          <li><b>Simulated:</b> every reading on this page. GNSS fixes, IMU samples, ESKF behavior and the AI bias model are synthesized client-side by a deterministic, seeded mock adapter. Nothing here is field data, and no accuracy number on this page is a measured result.</li>
          <li><b>Integration path:</b> the simulator sits behind a documented adapter interface (<code>src/sim.ts</code>). A real receiver, IMU stream, or backend service can replace it without touching the UI.</li>
        </ul>
      </section>
      <section>
        <h4><Icon name="play" /> HOW TO RUN THE DEMO</h4>
        <ol>
          <li>Open Simulation controls and pick a scenario - <b>GNSS Blackout</b> shows the complete sequence on a timer.</li>
          <li>Press RUN. Watch the state banner, the uncertainty ellipse on the map, and the event timeline.</li>
          <li>Use TRIGGER OUTAGE / TRIGGER RECOVERY to drive the ladder manually, and the AI switch to compare pure inertial coast against simulated AI correction.</li>
          <li>Open Analytics for synchronized error, covariance, innovation, and sensor plots from the same run.</li>
        </ol>
      </section>
      <section>
        <h4><Icon name="book" /> RESEARCH STATUS</h4>
        <p>Research prototype. The AI stage is a placeholder for a learned bias model that is still being trained and evaluated; in this build its output is synthetic and labeled SIMULATED wherever it appears. No performance claims are made from synthetic data.</p>
        <p><b>{PROJECT_NAME}</b> is the SIH team behind this research demo. {PROJECT_TAGLINE}.</p>
      </section>
      <section>
        <h4><Icon name="book" /> GLOSSARY</h4>
        <dl className="glossary">
          {GLOSSARY.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}
