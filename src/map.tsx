import React, { useEffect, useRef, useState } from 'react';
import { sim } from './state';
import { enuToPx, enuToLatLon, GRID_PX, MPP, CENTER_PX } from './geo';
import { TILE_URLS, TILE_X0, TILE_Y0, TILE_GRID } from './tiles';
import { MAP_ATTRIBUTION } from './config';

// Tile pipeline (module-level: load once per session).
// The hosted viewer's CSP blocks plain <img> loads of bundle assets, so each
// tile is fetched as bytes, shown through a same-origin blob: URL, and
// dark-graded ONCE into a stitched offscreen canvas. Per-frame map drawing
// then costs a single drawImage with no filter work.
const tileImgs: Record<string, HTMLImageElement> = {};
let stitch: HTMLCanvasElement | null = null;
let stitchCtx: CanvasRenderingContext2D | null = null;
function drawTileIntoStitch(key: string, img: HTMLImageElement): void {
  if (!stitch) {
    stitch = document.createElement('canvas');
    stitch.width = GRID_PX; stitch.height = GRID_PX;
    stitchCtx = stitch.getContext('2d');
    if (stitchCtx) {
      stitchCtx.fillStyle = '#111110';
      stitchCtx.fillRect(0, 0, GRID_PX, GRID_PX);
    }
  }
  if (!stitchCtx) return;
  const parts = key.split('_');
  const gx = Number(parts[0]) - TILE_X0;
  const gy = Number(parts[1]) - TILE_Y0;
  stitchCtx.filter = 'grayscale(1) invert(0.9) brightness(0.96) contrast(1.25)';
  stitchCtx.drawImage(img, gx * 256, gy * 256);
  stitchCtx.filter = 'none';
}
function ensureTiles(onOne: () => void): void {
  for (const key of Object.keys(TILE_URLS)) {
    if (!tileImgs[key]) {
      const img = new Image();
      tileImgs[key] = img;
      fetch(TILE_URLS[key])
        .then(r => { if (!r.ok) throw new Error('tile ' + r.status); return r.blob(); })
        .then(b => {
          img.onload = () => { drawTileIntoStitch(key, img); onOne(); };
          img.src = URL.createObjectURL(b);
        })
        .catch(() => { /* tile stays dark; grid bg remains */ });
    }
  }
}

const SCALE_STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000];

export function MapView() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<[number, number]>([640, 480]);
  const [, setTiles] = useState(0);

  useEffect(() => { ensureTiles(() => setTiles(c => c + 1)); }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize([Math.max(280, el.clientWidth), Math.max(300, el.clientHeight)]);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frame = sim.adapter.frame();
  const inOutage = !frame.gnssAvail;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const [w, h] = size;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#111110';
    ctx.fillRect(0, 0, w, h);

    // camera follows the solution, clamped to the bundled tile coverage
    let [cx, cy] = enuToPx(frame.solE, frame.solN);
    cx = Math.max(0, Math.min(GRID_PX - w, cx - w / 2));
    cy = Math.max(0, Math.min(GRID_PX - h, cy - h / 2));
    if (GRID_PX < w) cx = (GRID_PX - w) / 2;
    if (GRID_PX < h) cy = (GRID_PX - h) / 2;

    // one blit from the pre-graded stitched tile canvas
    if (stitch) {
      ctx.drawImage(stitch, cx, cy, w, h, 0, 0, w, h);
    }
    // darken slightly so overlays read cleanly
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, w, h);

    const px = (e: number, n: number): [number, number] => {
      const p = enuToPx(e, n);
      return [p[0] - cx, p[1] - cy];
    };

    // 95% uncertainty ellipse (E/N aligned), grows while dead reckoning
    const [sx, sy] = px(frame.solE, frame.solN);
    const rx = Math.max(4, 2.45 * frame.sigmaE / MPP);
    const ry = Math.max(4, 2.45 * frame.sigmaN / MPP);
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = inOutage ? 'rgba(169, 185, 239, 0.12)' : 'rgba(169, 185, 239, 0.08)';
    ctx.fill();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = inOutage ? 'rgba(169, 185, 239, 0.75)' : 'rgba(169, 185, 239, 0.65)';
    ctx.stroke();
    ctx.setLineDash([]);

    // GNSS fix route (frozen during outage)
    const gnssTrail = sim.adapter.gnssTrail;
    if (gnssTrail.length > 1) {
      ctx.beginPath();
      gnssTrail.forEach(([e, n], i) => {
        const [x, y] = px(e, n);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(139, 153, 171, 0.8)';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // fused / INS solution route
    const solTrail = sim.adapter.solTrail;
    if (solTrail.length > 1) {
      ctx.beginPath();
      solTrail.forEach(([e, n], i) => {
        const [x, y] = px(e, n);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.lineWidth = 3.3;
      ctx.strokeStyle = '#a9b9ef';
      ctx.shadowColor = 'rgba(169,185,239,.48)'; ctx.shadowBlur = 18;
      ctx.lineJoin = 'round';
      ctx.stroke(); ctx.shadowBlur = 0;
      for (let i = 0; i < solTrail.length - 1; i += Math.max(20, Math.floor(solTrail.length / 5))) {
        const [x, y] = px(solTrail[i][0], solTrail[i][1]);
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#050813'; ctx.fill();
        ctx.lineWidth = 1.8; ctx.strokeStyle = '#a9b9ef'; ctx.stroke();
      }
    }

    // last GNSS fix marker (stays frozen while GNSS is out)
    if (gnssTrail.length > 0) {
      const [fe, fn] = gnssTrail[gnssTrail.length - 1];
      const [fx, fy] = px(fe, fn);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = inOutage ? '#a9b9ef' : 'rgba(139,153,171,0.9)';
      ctx.strokeRect(fx - 4, fy - 4, 8, 8);
      if (inOutage) {
        ctx.beginPath();
        ctx.arc(fx, fy, 9, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(169,185,239,0.35)';
        ctx.stroke();
      }
    }

    // moving solution marker with heading tick
    const hdg = frame.solHeading * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.sin(hdg) * 14, sy - Math.cos(hdg) * 14);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#e8eef6';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#a9b9ef';
    ctx.shadowColor = 'rgba(169,185,239,.65)'; ctx.shadowBlur = 16;
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#071015';
    ctx.stroke();

    // scale bar (honest meters)
    const target = 96 * MPP;
    let nice = SCALE_STEPS[0];
    for (const s of SCALE_STEPS) { if (s <= target) nice = s; }
    const barPx = nice / MPP;
    const bx = 16, by = h - 34;
    ctx.strokeStyle = 'rgba(232,238,246,0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx + barPx, by);
    ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4);
    ctx.moveTo(bx + barPx, by - 4); ctx.lineTo(bx + barPx, by + 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,238,246,0.85)';
    ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(nice >= 1000 ? (nice / 1000) + ' km' : nice + ' m', bx, by - 8);
  });

  const fixAge = frame.t - frame.lastFixT;

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} aria-label="Map: fused route, GNSS fix route, and 95% uncertainty ellipse" role="img" />
      <div className="map-legend" aria-hidden="false">
        <span className="lg"><i className="lg-line solid" />Fused / INS solution</span>
        <span className="lg"><i className="lg-line dashed" />GNSS fixes{inOutage ? ' (frozen)' : ''}</span>
        <span className="lg"><i className="lg-sq" />Last fix{inOutage ? ' - held' : ''}</span>
        <span className="lg"><i className="lg-ell" />95% uncertainty</span>
      </div>
      <div className="map-attr">{MAP_ATTRIBUTION}</div>
      {inOutage ? <div className="map-outage">GNSS OUTAGE - fix age {fixAge.toFixed(0)} s, inertial coast</div> : null}
    </div>
  );
}

export { enuToLatLon, CENTER_PX };
