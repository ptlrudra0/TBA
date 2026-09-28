import React from 'react';
import { sim } from './state';
import { SCENARIOS, NIS_GATE } from './sim';
import { fmt, Icon, Card, KV } from './ui';
import { enuToLatLon } from './geo';
import { CRS_LABEL } from './config';
import { Sparkline } from './charts';

// --- overlaid position card ----------------------------------------------------
export function PositionCard() {
  const f = sim.adapter.frame();
  const ll = enuToLatLon(f.solE, f.solN);
  const inOutage = !f.gnssAvail;
  return (
    <div className="poscard" aria-label="Current position">
      <div className="poscard-top">
        <span className="pc-label">POSITION</span>
        <span className={'pc-src' + (inOutage ? ' pc-src-warn' : '')}>{inOutage ? 'INS ONLY' : 'FUSED'}</span>
      </div>
      <div className="pc-grid">
        <div><span>LAT</span><b>{fmt.lat(ll.lat)}</b></div>
        <div><span>LON</span><b>{fmt.lon(ll.lon)}</b></div>

      </div>
      <div className="pc-strip">
        <div><span>SPD</span><b>{(f.solSpeed * 3.6).toFixed(1)} <i>km/h</i></b></div>
        <div><span><abbr title="Heading, degrees clockwise from true north">HDG</abbr></span><b>{f.solHeading.toFixed(1)}{'\u00B0'}</b></div>
      </div>
      <div className="pc-foot">
        <span><abbr title="95% horizontal uncertainty radius">HORIZ UNC</abbr> {(2.45 * f.sigmaH).toFixed(1)} m</span>
      </div>
    </div>
  );
}

// --- event timeline --------------------------------------------------------------
export function Timeline() {
  const evts = sim.adapter.events();
  return (
    <Card title="EVENT TIMELINE" icon="pulse" className="timeline-card">
      <ol className="timeline" aria-live="polite">
        {evts.length === 0 ? <li className="tl-empty">No events yet.</li> : null}
        {evts.slice(0, 8).map((e, i) => (
          <li key={i} className={'tl-' + e.kind}>
            <span className="tl-dot" aria-hidden="true" />
            <span className="tl-t">{fmt.t(e.t)}</span>
            <span className="tl-x">{e.text}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// --- subsystem snapshot cards ------------------------------------------------------
export function SnapshotCards() {
  const f = sim.adapter.frame();
  const fixAge = f.t - f.lastFixT;
  return (
    <div className="snap-grid">
      <Card title="GNSS" icon="satellite">
        <KV items={[
          ['FIX', f.fixType, 'Receiver fix type'],
          ['SATS', f.satsUsed + '/' + f.satsVisible, 'Satellites used / visible'],
          [<abbr key="h" title="Horizontal dilution of precision">HDOP</abbr>, f.hdop > 50 ? '-' : f.hdop.toFixed(1)],
          [<abbr key="c" title="Carrier-to-noise density, dB-Hz">C/N0</abbr>, f.cn0 > 0 ? f.cn0.toFixed(0) + ' dB-Hz' : '-'],
          ['FIX AGE', f.gnssAvail ? fixAge.toFixed(0) + ' s' : fixAge.toFixed(0) + ' s (held)'],
        ]} />
      </Card>
      <Card title="IMU" icon="imu">
        <KV items={[
          ['RATE', '100 Hz'],
          ['ROLL / PITCH', f.roll.toFixed(1) + '\u00B0 / ' + f.pitch.toFixed(1) + '\u00B0'],
          ['SPEC FORCE', f.accelMag.toFixed(3) + ' m/s\u00B2'],
          ['ANG RATE Z', f.gyroZ.toFixed(1) + '\u00B0/s'],
          ['TEMP', f.imuTemp.toFixed(1) + '\u00B0C'],
        ]} />
      </Card>
      <Card title="ESKF" icon="filter">
        <KV items={[
          ['STATES', '15'],
          [<abbr key="n" title="Normalized innovation squared - gate at 9.21 (95%, 2 dof)">NIS</abbr>, isFinite(f.nis) ? f.nis.toFixed(2) : '-'],
          ['ACC / REJ', f.accepted + ' / ' + f.rejected],
          ['INERTIAL ONLY', fmt.dur(f.inertialOnly)],
          ['\u03C3E / \u03C3N', f.sigmaE.toFixed(2) + ' / ' + f.sigmaN.toFixed(2) + ' m'],
        ]} />
      </Card>
      <Card title="AI CORRECTION" icon="ai" tag="SIMULATED">
        <KV items={[
          ['STAGE', f.aiStage.toUpperCase()],
          ['PRED ERR', f.aiStage === 'active' ? f.aiPredictedErr.toFixed(2) + ' m' : '-'],
          ['INFERENCE', f.aiStage === 'active' ? f.aiInferenceMs.toFixed(0) + ' ms' : '-'],
          ['CORRECTIONS', String(f.aiCorrections)],
        ]} />
      </Card>
    </div>
  );
}

// --- solution health -----------------------------------------------------------------
export function SolutionHealth() {
  const f = sim.adapter.frame();
  const hist = sim.adapter.history();
  const confColor = f.confidence > 85 ? '#a9b9ef' : f.confidence > 60 ? '#a9b9ef' : '#e57575';
  return (
    <Card title="SOLUTION HEALTH" icon="gauge">
      <div className="health-top">
        <div className="health-conf" style={{ color: confColor }}>
          {f.confidence.toFixed(0)}<span>%</span>
        </div>
        <div className="health-sub">
          <div>CONFIDENCE</div>
          <div className="health-unc">95% horiz <b>{(2.45 * f.sigmaH).toFixed(1)} m</b></div>
          <div className="health-unc">updates <b>{f.accepted}</b> ok / <b>{f.rejected}</b> rejected</div>
        </div>
      </div>
      <Sparkline rows={hist} color={confColor} />
      <div className="spark-cap">CONFIDENCE TREND - LAST 150 S</div>
    </Card>
  );
}

// --- correction pipeline ---------------------------------------------------------------
const STAGES = ['IMU window', 'Motion features', 'AI inference', 'Error correction', 'ESKF fusion'];

export function Pipeline() {
  const f = sim.adapter.frame();
  const running = sim.running === 'running';
  const aiOn = f.aiStage === 'active';
  const activeIdx = !running ? -1
    : f.state === 'fused' || f.state === 'stabilized' || f.state === 'degraded' ? 4
    : f.state === 'lost' || f.state === 'ins' ? 1
    : aiOn ? 3 : -1;
  return (
    <Card title="CORRECTION PIPELINE" icon="layers" tag="SIMULATED">
      <ol className="pipeline">
        {STAGES.map((s, i) => (
          <li key={s} className={i === activeIdx || (aiOn && i <= 3) ? 'pl-active' : 'pl-idle'}>
            <span className="pl-dot" aria-hidden="true" />
            <span className="pl-name">{s}</span>
            {i < STAGES.length - 1 ? <span className="pl-arrow" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
      <p className="pl-note">
        {aiOn
          ? 'Predicted drift error ' + f.aiPredictedErr.toFixed(2) + ' m - bias estimate applied as a weighted measurement. SIMULATED model output.'
          : 'Idle. During a GNSS outage the simulated model estimates inertial drift bias; enable the feed with the AI switch in Simulation controls.'}
      </p>
    </Card>
  );
}

// --- simulation controls ----------------------------------------------------------------
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

export function SimPanel() {
  const f = sim.adapter.frame();
  const sc = sim.scenario;
  const inOutage = !f.gnssAvail;
  return (
    <Card title="SIMULATION CONTROLS" icon="sliders" className="simpanel">
      <div className="scen-grid" role="radiogroup" aria-label="Scenario">
        {SCENARIOS.map(s => (
          <button key={s.id} role="radio" aria-checked={s.id === sc.id}
            className={'scen' + (s.id === sc.id ? ' scen-on' : '')}
            onClick={() => sim.setScenario(s.id)}>
            <span className="scen-name">{s.name}{s.scripted ? <em>SCRIPTED</em> : null}</span>
            <span className="scen-desc">{s.desc}</span>
          </button>
        ))}
      </div>
      {sc.id === 'blackout' ? (
        <p className="scen-note">This scenario runs its own outage at T+12 s for 23 s. Pressing either trigger below hands control to you permanently for this run.</p>
      ) : null}

      <div className="sim-row">
        <span className="sim-row-label">TRANSPORT</span>
        <div className="sim-transport">
          <button className="btn btn-primary" onClick={() => sim.run()} disabled={sim.running === 'running'}>
            <Icon name="play" size={13} /> RUN
          </button>
          <button className="btn" onClick={() => sim.hold()} disabled={sim.running !== 'running'}>
            <Icon name="hold" size={13} /> HOLD
          </button>
          <button className="btn" onClick={() => sim.reset()}>
            <Icon name="reset" size={13} /> RESET
          </button>
        </div>
      </div>

      <div className="sim-row">
        <span className="sim-row-label">PLAYBACK SPEED <b className="sim-speed">{sim.speed}{'\u00D7'}</b></span>
        <input type="range" min={0} max={SPEEDS.length - 1} step={1}
          value={SPEEDS.indexOf(sim.speed) < 0 ? 3 : SPEEDS.indexOf(sim.speed)}
          aria-label="Playback speed"
          onChange={e => sim.setSpeed(SPEEDS[Number(e.target.value)])} />
        <div className="sim-ticks"><span>0.25{'\u00D7'}</span><span>1{'\u00D7'}</span><span>3{'\u00D7'}</span></div>
      </div>

      <div className="sim-row sim-toggle-row">
        <label className="switch">
          <input type="checkbox" checked={sim.aiEnabled} onChange={e => sim.setAiEnabled(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span className="switch-label">FEED AI OUTPUT TO FILTER
            <small>The simulated model's bias estimate is applied as a weighted measurement.</small>
          </span>
        </label>
      </div>

      <div className="sim-row">
        <span className="sim-row-label">GNSS CONTROL</span>
        <div className="sim-transport">
          <button className="btn btn-danger" onClick={() => sim.triggerOutage()} disabled={inOutage}>
            <Icon name="warn" size={13} /> TRIGGER OUTAGE
          </button>
          <button className="btn btn-ok" onClick={() => sim.triggerRecovery()} disabled={!inOutage}>
            <Icon name="reset" size={13} /> TRIGGER RECOVERY
          </button>
        </div>
        <p className="sim-hint">Outage runs the full ladder - degraded, outage detected, dead reckoning, AI correction, re-fusion, stabilized - and writes each step to the timeline.</p>
      </div>

      <div className="sim-params">
        <span className="sim-row-label">SCENARIO PARAMETERS</span>
        <KV items={[
          ['TARGET SPEED', sc.targetSpeedKmh + ' km/h'],
          ['IMU NOISE', sc.imuNoise.toFixed(3) + ' m/s\u00B2'],
          ['NOMINAL 1\u03C3', sc.nominalSigma.toFixed(1) + ' m'],
          ['DRIFT RATE', sc.driftRate.toFixed(3) + ' m/s'],
          ['ELAPSED', fmt.t(f.t)],
          ['SOURCE', sim.adapter.sourceName + ' (seeded, deterministic)'],
        ]} />
      </div>
    </Card>
  );
}

// --- system detail drawer ----------------------------------------------------------------
export function SystemDrawer() {
  const f = sim.adapter.frame();
  return (
    <div className="sysdrawer-grid">
      <Card title="GNSS DETAIL" icon="satellite">
        <KV items={[
          ['FIX TYPE', f.fixType],
          ['SATELLITES', f.satsUsed + ' used / ' + f.satsVisible + ' visible'],
          [<abbr key="h" title="Horizontal dilution of precision">HDOP</abbr>, f.hdop > 50 ? '-' : f.hdop.toFixed(2)],
          [<abbr key="c" title="Carrier-to-noise density">C/N0 AVG</abbr>, f.cn0 > 0 ? f.cn0.toFixed(1) + ' dB-Hz' : '-'],
          ['FIX AGE', (f.t - f.lastFixT).toFixed(1) + ' s'],
        ]} />
      </Card>
      <Card title="IMU DETAIL" icon="imu">
        <KV items={[
          ['OUTPUT RATE', '100 Hz'],
          ['ATTITUDE', f.roll.toFixed(2) + '\u00B0 / ' + f.pitch.toFixed(2) + '\u00B0 / ' + f.solHeading.toFixed(1) + '\u00B0'],
          ['SPECIFIC FORCE', f.accelMag.toFixed(3) + ' m/s\u00B2'],
          ['ANGULAR RATE', f.gyroZ.toFixed(2) + '\u00B0/s'],
          ['ACCEL BIAS', f.accelBiasMg.toFixed(1) + ' mg'],
          ['GYRO BIAS', f.gyroBiasDph.toFixed(1) + '\u00B0/h'],
          ['TEMPERATURE', f.imuTemp.toFixed(1) + '\u00B0C'],
        ]} />
      </Card>
      <Card title="ESKF DETAIL" icon="filter">
        <KV items={[
          ['ERROR STATES', '15 (pos, vel, att, biases)'],
          ['LAST NIS', isFinite(f.nis) ? f.nis.toFixed(2) : '-'],
          ['GATE', NIS_GATE.toFixed(2) + ' (95%, 2 dof)'],
          ['ACCEPTED / REJECTED', f.accepted + ' / ' + f.rejected],
          ['INERTIAL-ONLY', fmt.dur(f.inertialOnly)],
          ['\u03C3E / \u03C3N', f.sigmaE.toFixed(2) + ' / ' + f.sigmaN.toFixed(2) + ' m'],
          ['\u03C3V / \u03C3\u03C8', f.sigmaV.toFixed(2) + ' m/s / ' + f.sigmaPsi.toFixed(2) + '\u00B0'],
        ]} />
      </Card>
      <Card title="AI DETAIL" icon="ai" tag="SIMULATED">
        <KV items={[
          ['STAGE', f.aiStage.toUpperCase()],
          ['WINDOW', '200 samples @ 100 Hz'],
          ['FEATURES', '12 motion features'],
          ['PREDICTED ERROR', f.aiStage === 'active' ? f.aiPredictedErr.toFixed(2) + ' m' : '-'],
          ['INFERENCE TIME', f.aiStage === 'active' ? f.aiInferenceMs.toFixed(0) + ' ms' : '-'],
          ['CORRECTIONS APPLIED', String(f.aiCorrections)],
        ]} />
      </Card>
      <Card title="PROVENANCE" icon="info">
        <KV items={[
          ['DATA SOURCE', sim.adapter.sourceName + ' - client-side synthesis'],
          ['SEED', '20260926 (deterministic)'],
          ['IMU SAMPLES', String(Math.floor(f.t * 100))],
          ['GNSS FIXES', String(f.accepted + f.rejected)],
          ['AI INFERENCES', String(f.aiCorrections)],
          ['ESKF UPDATES', String(f.accepted + Math.floor(f.inertialOnly * 10))],
        ]} />
        <p className="sys-note">No real receiver, IMU, or trained model is connected. The adapter interface is documented in <code>src/sim.ts</code> for later sensor or backend integration.</p>
      </Card>
    </div>
  );
}
