import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import './style.css';
import { sim } from './state';
import { STATE_META, NIS_GATE } from './sim';
import { PROJECT_NAME } from './config';
import { fmt, Icon, StateBadge } from './ui';
import { MapView } from './map';
import { PositionCard, Timeline, SolutionHealth, SimPanel, SystemDrawer } from './components';
import { AboutPanel } from './about';
import { LineChart } from './charts';
import mountainReference from './mountain-reference.png';

function useSimClock() {
  const [, setV] = useState(0);
  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      sim.advance((now - last) / 1000);
      last = now;
      setV(v => v + 1);
    }, 200);
    return () => window.clearInterval(id);
  }, []);
}


function StateBanner() {
  const f = sim.adapter.frame();
  const meta = STATE_META[f.state];
  const inState = f.t - sim.adapter.stateEnteredAt();
  return (
    <div className={'banner tone-' + meta.tone} role="status">
      <StateBadge state={f.state} large />
      <div className="banner-text"><span>{meta.expl}</span></div>
      <span className="banner-time">{fmt.dur(inState)} in state</span>
    </div>
  );
}

function Cockpit() {
  const f = sim.adapter.frame();
  return (
    <>
      <div className="system-intro"><div><span className="eyebrow">LIVE / NAVIGATION</span><h1>Route monitor</h1><p>Watch the fused solution through GNSS loss and recovery. All data is simulated.</p></div><span className="time-readout">{fmt.t(f.t)} <i>SIM TIME</i></span></div>
      <div className="system-workspace">
        <div className="system-map-stage"><MapView /><div className="system-map-chip">BENGALURU / WGS84 <span>SIMULATED TRACK</span></div><PositionCard /><div className="system-map-health"><SolutionHealth /></div></div>
        <div className="system-bottom-grid">
          <section className="system-signal card telemetry"><header className="card-head"><h3>LIVE SIGNAL</h3><span className="tag">SIMULATED</span></header>
            <div className="readout"><span>GNSS FIX</span><strong>{f.gnssAvail ? f.fixType : 'NO FIX'}</strong></div>
            <div className="readout"><span>SATELLITES</span><strong>{f.satsUsed} <small>/ {f.satsVisible} visible</small></strong></div>
            <div className="readout"><span>INERTIAL ONLY</span><strong>{fmt.dur(f.inertialOnly)}</strong></div>
            <div className="readout"><span>FILTER INNOVATION</span><strong>{isFinite(f.nis) ? f.nis.toFixed(2) : '-'}</strong></div>
          </section>
          <Timeline />
        </div>
      </div>
    </>
  );
}

const WINDOWS = [60, 180, 600];

function Analytics() {
  const [win, setWin] = useState(180);
  const [details, setDetails] = useState(false);
  const hist = sim.adapter.history();
  const rows = hist.filter(r => r.t >= (hist.length ? hist[hist.length - 1].t : 0) - win);
  const held = sim.running !== 'running';
  const transitions = sim.adapter.events().filter(e => e.kind === 'state');
  return (
    <div className="analytics system-analytics">
      <div className="section-lead"><div><span className="eyebrow">02 / ANALYTICS</span><h1>Error over time.</h1><p>One simulated run, synchronized across every plot.</p></div></div>
      <div className="win-row" role="radiogroup" aria-label="Time window">
        <span className="sim-row-label">WINDOW</span>
        {WINDOWS.map(w => (
          <button key={w} role="radio" aria-checked={w === win}
            className={'btn btn-chip' + (w === win ? ' chip-on' : '')}
            onClick={() => setWin(w)}>{w} s</button>
        ))}

      </div>
      <div className="charts-grid">
        <LineChart title="POSITION ERROR" rows={rows} held={held}
          left={{ unit: 'm' }}
          series={[
            { key: 'errE', label: 'East error', color: 'rgb(169,185,239)' },
            { key: 'errN', label: 'North error', color: 'rgb(143,143,143)' },
            { key: 'sigE', label: '\u03C3 East', color: 'rgb(122,122,122)', dash: true },
            { key: 'sigN', label: '\u03C3 North', color: 'rgb(93,93,93)', dash: true },
          ]} />
        <LineChart title="UNCERTAINTY & CONFIDENCE" rows={rows} held={held}
          left={{ unit: 'm' }} right={{ unit: '%', min: 0, max: 100 }}
          series={[
            { key: 'sigH', label: '1\u03C3 horizontal', color: 'rgb(169,185,239)' },
            { key: 'conf', label: 'Confidence', color: 'rgb(222,222,222)', axis: 'r' },
          ]} />
      </div>
      <button className="details-toggle" aria-expanded={details} onClick={() => setDetails(v => !v)}>{details ? "Hide" : "Show"} diagnostic traces <span>{details ? "−" : "+"}</span></button>
      {details ? <div className="charts-grid diagnostics">
        <LineChart title="VELOCITY & HEADING ERROR" rows={rows} held={held}
          left={{ unit: 'm/s', min: 0 }} right={{ unit: '\u00B0', min: 0 }}
          series={[
            { key: 'velErr', label: 'Velocity error', color: 'rgb(169,185,239)' },
            { key: 'hdgErr', label: 'Heading error', color: 'rgb(143,143,143)', axis: 'r' },
          ]} />
        <LineChart title="ESKF INNOVATION (NIS)" rows={rows} held={held}
          left={{ unit: '', min: 0 }} right={{ unit: '', min: 0 }}
          thresholds={[{ axis: 'l', value: NIS_GATE, color: 'rgb(229,117,117)', label: 'gate ' + NIS_GATE }]}
          series={[
            { key: 'nis', label: 'NIS per update', color: 'rgb(169,185,239)' },
            { key: 'rej', label: 'Cumulative rejections', color: 'rgb(229,117,117)', axis: 'r', step: true },
          ]} />
        <LineChart title="GNSS AVAILABILITY" rows={rows} held={held}
          left={{ unit: '', min: 0, max: 1.2 }}
          series={[{ key: 'gnss', label: 'Fix available (1/0)', color: 'rgb(169,185,239)', step: true, fill: true }]} />
        <LineChart title="IMU MAGNITUDES" rows={rows} held={held}
          left={{ unit: 'm/s\u00B2', min: 8, max: 12 }} right={{ unit: '\u00B0/s', min: 0 }}
          series={[
            { key: 'accel', label: 'Specific force', color: 'rgb(169,185,239)' },
            { key: 'gyro', label: 'Gyro |z|', color: 'rgb(143,143,143)', axis: 'r' },
          ]} />
      </div> : null}
      <section className="card transition-card">
        <header className="card-head"><h3>STATE TRANSITION LOG</h3><span className="tag">DEMO</span></header>
        {transitions.length === 0 ? <p className="chart-empty">No transitions recorded yet.</p> : (
          <table className="log">
            <thead><tr><th>TIME</th><th>TRANSITION</th></tr></thead>
            <tbody>
              {transitions.map((e, i) => (
                <tr key={i}><td className="mono">{fmt.t(e.t)}</td><td>{e.text}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const navDestinations = [
  { to: '/', label: 'Home', end: true },
  { to: '/live', label: 'Map' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/system', label: 'System' },
  { to: '/about', label: 'About' },
];

function UniversalNav({ landing = false }: { landing?: boolean }) {
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;
    const place = () => {
      const active = nav.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
      if (active) {
        indicator.style.left = `${active.offsetLeft}px`;
        indicator.style.width = `${active.offsetWidth}px`;
      }
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(nav);
    return () => observer.disconnect();
  });
  return <nav ref={navRef} className={landing ? 'universal-nav universal-nav-landing' : 'viewnav universal-nav'} aria-label="Site navigation">
    <span ref={indicatorRef} className="nav-indicator" aria-hidden="true" />
    {navDestinations.map(destination =>
      <NavLink key={destination.to} to={destination.to} end={destination.end}>
        {destination.label}
      </NavLink>)}
  </nav>;
}

function Landing() {
  return (
    <section className="landing" aria-label="The Black Archive landing page">
      <div className="landing-top"><div className="landing-brand"><span className="landing-mark">✳</span><b>THE BLACK ARCHIVE</b><span>SIH / NAVIGATION SYSTEMS</span></div><UniversalNav landing /></div>
      <div className="landing-stage">
        <div className="landing-copy"><span className="landing-kicker">GNSS + INS / RESEARCH DEMO</span><h1>Find your way<br />when the signal<br /><em>disappears.</em></h1><p>Navigation continuity through signal loss. Explore the simulated fused route, inertial coast, and recovery in one cockpit.</p><Link to="/live" className="landing-cta">Explore the live demo <span aria-hidden="true">↗</span></Link><span className="landing-truth">DEMO / SIMULATED · NOT A CONNECTED RECEIVER</span></div>
        <div className="landing-terrain" aria-hidden="true"><img src={mountainReference} alt="" /><svg className="landing-route" viewBox="0 0 1000 650" preserveAspectRatio="none"><path d="M175 490 C280 470 320 420 370 390 S488 385 540 310 S635 295 665 235 S752 200 795 145" fill="none" stroke="#fff" strokeWidth="5" strokeDasharray="9 10" strokeLinecap="round"/><path d="M175 490 C280 470 320 420 370 390 S488 385 540 310 S635 295 665 235 S752 200 795 145" fill="none" stroke="#a9b9ef" strokeWidth="2" strokeDasharray="9 10" strokeLinecap="round"/><circle cx="370" cy="390" r="11" fill="#a9b9ef" stroke="white" strokeWidth="4"/><circle cx="665" cy="235" r="12" fill="#a9b9ef" stroke="white" strokeWidth="4"/><circle cx="795" cy="145" r="13" fill="#a9b9ef" stroke="white" strokeWidth="4"/></svg></div>
        <span className="landing-scene-note">ILLUSTRATIVE TERRAIN / NOT GEOREFERENCED</span>
      </div>
      <section className="landing-map-section" aria-label="Simulated navigation map">
        <div className="landing-map-heading"><div><span>01 / LIVE MAP</span><h2>See the route.</h2><p>The fused track, GNSS fixes and uncertainty update as the simulation runs.</p></div><Link to="/live">Open cockpit <span aria-hidden="true">↗</span></Link></div>
        <div className="landing-map-window"><MapView /><div className="landing-map-caption">SIMULATED DATA · BENGALURU / WGS84</div></div>
      </section>
      <footer className="landing-footer"><span>THE BLACK ARCHIVE / SIH</span><span>Research demo. No real sensor data or accuracy claims.</span></footer>
    </section>
  );
}

export function App() {
  useSimClock();
  const [showSim, setShowSim] = useState(false);
  const scenario = sim.scenario;

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/live" element={<div className="drn">
      <header className="shell">
        <div className="shell-top">
          <div className="wordmark">
            <span className="wm-mark" aria-hidden="true">✳</span>
            <span className="wm-name">{PROJECT_NAME}</span>

          </div>
          <div className="shell-actions">
            <span className="tag tag-demo" title="All readings are synthesized by a deterministic client-side simulator">● DEMO / SIMULATED</span>
            <span className="tag tag-ghost" title="Active scenario">{scenario.name}</span>
            <button className={'btn btn-text' + (showSim ? ' btn-on' : '')} onClick={() => setShowSim(v => !v)} aria-expanded={showSim}>Controls</button>

          </div>
        </div>
        <div className="shell-nav-row">
          <UniversalNav />
        </div>
        <StateBanner />
        {showSim ? <SimPanel /> : null}

      </header>
      <main><Cockpit /></main>
      <footer className="foot">
        <span>Research demo - all telemetry synthesized client-side. No real sensor data, no accuracy claims.</span>
        <span>Map: (c) OpenStreetMap contributors</span>
      </footer>
    </div>} />
      <Route path="/system" element={<div className="drn"><header className="shell"><div className="shell-top"><div className="wordmark"><span className="wm-mark" aria-hidden="true">✳</span><span className="wm-name">{PROJECT_NAME}</span></div><span className="tag tag-demo">● DEMO / SIMULATED</span></div><div className="shell-nav-row"><UniversalNav /></div><StateBanner /></header><main><div className="section-lead detail-lead"><div><span className="eyebrow">TECHNICAL DETAIL</span><h1>System readouts</h1></div></div><SystemDrawer /></main><footer className="foot">All readings are simulated, not connected sensor data.</footer></div>} />
      <Route path="/about" element={<div className="drn"><header className="shell"><div className="shell-top"><div className="wordmark"><span className="wm-mark" aria-hidden="true">✳</span><span className="wm-name">{PROJECT_NAME}</span></div><span className="tag tag-demo">● DEMO / SIMULATED</span></div><div className="shell-nav-row"><UniversalNav /></div></header><main><div className="section-lead"><div><span className="eyebrow">THE BLACK ARCHIVE</span><h1>About the project.</h1></div></div><AboutPanel /></main></div>} />
      <Route path="/analytics" element={<div className="drn">
        <header className="shell"><div className="shell-top"><div className="wordmark"><span className="wm-mark" aria-hidden="true">✳</span><span className="wm-name">{PROJECT_NAME}</span></div><div className="shell-actions"><span className="tag tag-demo">● DEMO / SIMULATED</span><span className="tag tag-ghost">{scenario.name}</span><button className={'btn btn-text' + (showSim ? ' btn-on' : '')} onClick={() => setShowSim(v => !v)} aria-expanded={showSim}>Controls</button></div></div><div className="shell-nav-row"><UniversalNav /></div><StateBanner />{showSim ? <SimPanel /> : null}</header>
        <main><Analytics /></main><footer className="foot"><span>Research demo - all telemetry synthesized client-side. No real sensor data, no accuracy claims.</span></footer>
      </div>} />
    </Routes>
  );
}
