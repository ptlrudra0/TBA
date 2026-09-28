import React, { useEffect, useRef, useState } from 'react';
import { HistoryRow } from './sim';
import { fmt } from './ui';

// --- tiny sparkline (confidence trend) ----------------------------------------
export function Sparkline({ rows, color }: { rows: HistoryRow[]; color: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const w = c.clientWidth || 220, h = c.clientHeight || 44;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const data = rows.slice(-150);
    if (data.length < 2) return;
    ctx.beginPath();
    data.forEach((r, i) => {
      const x = i / (data.length - 1) * (w - 4) + 2;
      const y = h - 3 - (r.conf / 100) * (h - 6);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.stroke();
  });
  return <canvas ref={ref} className="spark" aria-hidden="true" />;
}

// --- general dual-axis line chart ----------------------------------------------
export interface SeriesDef {
  key: string; label: string; color: string;
  axis?: 'l' | 'r'; dash?: boolean; step?: boolean; fill?: boolean;
}

interface AxisDef { unit: string; min?: number; max?: number; }

function niceTicks(min: number, max: number, count: number): number[] {
  if (!isFinite(min) || !isFinite(max) || max <= min) { max = min + 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= max + step * 0.5; v += step) out.push(v);
  return out.slice(0, 7);
}

function decFor(step: number): number {
  if (step >= 100) return 0;
  if (step >= 10) return 0;
  if (step >= 1) return 1;
  return 2;
}

export function LineChart({ title, rows, left, right, series, thresholds, held }: {
  title: string;
  rows: HistoryRow[];
  left: AxisDef;
  right?: AxisDef;
  series: SeriesDef[];
  thresholds?: { axis: 'l' | 'r'; value: number; color: string; label: string }[];
  held: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [w, setW] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  const H = 176;

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(240, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const empty = rows.length < 2;

  // scales
  const valOf = (r: HistoryRow, k: string): number => (r as unknown as Record<string, number>)[k];
  const axisRange = (axis: AxisDef, keys: string[]): [number, number] => {
    if (axis.min !== undefined && axis.max !== undefined) return [axis.min, axis.max];
    let mn = Infinity, mx = -Infinity;
    for (const r of rows) for (const k of keys) {
      const v = valOf(r, k);
      if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    if (!isFinite(mn)) { mn = 0; mx = 1; }
    if (axis.min !== undefined) mn = axis.min;
    if (axis.max !== undefined) mx = axis.max;
    if (mx - mn < 1e-6) mx = mn + 1;
    const pad = (mx - mn) * 0.12;
    return [axis.min !== undefined ? mn : mn - pad, axis.max !== undefined ? mx : mx + pad];
  };

  const lKeys = series.filter(s => (s.axis || 'l') === 'l').map(s => s.key);
  const rKeys = series.filter(s => s.axis === 'r').map(s => s.key);
  const [lMin, lMax] = axisRange(left, lKeys);
  const [rMin, rMax] = right ? axisRange(right, rKeys) : [0, 1];

  const padL = 44, padR = right ? 44 : 12, padT = 10, padB = 22;
  const plotW = w - padL - padR, plotH = H - padT - padB;
  const t0 = rows.length ? rows[0].t : 0;
  const t1 = rows.length ? rows[rows.length - 1].t : 1;
  const tSpan = Math.max(1, t1 - t0);
  const xOf = (t: number) => padL + (t - t0) / tSpan * plotW;
  const yL = (v: number) => padT + (1 - (v - lMin) / (lMax - lMin)) * plotH;
  const yR = (v: number) => padT + (1 - (v - rMin) / (rMax - rMin)) * plotH;

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, H);
    if (empty) return;

    const lTicks = niceTicks(lMin, lMax, 4);
    const lDec = decFor(lTicks.length > 1 ? lTicks[1] - lTicks[0] : 1);
    ctx.font = '9.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    // grid + left labels
    for (const tv of lTicks) {
      const y = yL(tv);
      if (y < padT - 2 || y > padT + plotH + 2) continue;
      ctx.strokeStyle = 'rgba(139,153,171,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      ctx.fillStyle = 'rgba(139,153,171,0.85)';
      ctx.textAlign = 'right';
      ctx.fillText(tv.toFixed(lDec), padL - 6, y);
    }
    if (right) {
      const rTicks = niceTicks(rMin, rMax, 4);
      const rDec = decFor(rTicks.length > 1 ? rTicks[1] - rTicks[0] : 1);
      ctx.textAlign = 'left';
      for (const tv of rTicks) {
        const y = yR(tv);
        if (y < padT - 2 || y > padT + plotH + 2) continue;
        ctx.fillStyle = 'rgba(139,153,171,0.6)';
        ctx.fillText(tv.toFixed(rDec), padL + plotW + 6, y);
      }
    }
    // x labels
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(139,153,171,0.85)';
    for (let i = 0; i <= 3; i++) {
      const tv = t0 + tSpan * i / 3;
      ctx.fillText(fmt.t(tv), xOf(tv), H - 10);
    }

    // thresholds
    for (const th of thresholds || []) {
      const y = th.axis === 'r' ? yR(th.value) : yL(th.value);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = th.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillStyle = th.color;
      ctx.fillText(th.label, padL + plotW - 4, y - 7);
    }

    // series
    for (const s of series) {
      const yOf = (s.axis || 'l') === 'l' ? yL : yR;
      ctx.beginPath();
      let started = false;
      let prevY = 0;
      for (const r of rows) {
        const v = valOf(r, s.key);
        const x = xOf(r.t);
        if (!isFinite(v)) { started = false; continue; }
        const y = yOf(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else if (s.step) { ctx.lineTo(x, prevY); ctx.lineTo(x, y); }
        else ctx.lineTo(x, y);
        prevY = y;
      }
      if (s.fill) {
        const baseY = yOf(Math.max((s.axis === 'r' ? rMin : lMin), 0));
        ctx.save();
        const lastX = rows.length ? xOf(rows[rows.length - 1].t) : padL;
        ctx.lineTo(lastX, baseY); ctx.lineTo(padL, baseY); ctx.closePath();
        ctx.fillStyle = s.color.replace(')', ',0.10)').replace('rgb', 'rgba');
        ctx.fill();
        ctx.restore();
        // stroke again on top
        ctx.beginPath();
        started = false;
        for (const r of rows) {
          const v = valOf(r, s.key);
          const x = xOf(r.t);
          if (!isFinite(v)) { started = false; continue; }
          const y = yOf(v);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else if (s.step) { ctx.lineTo(x, prevY); ctx.lineTo(x, y); }
          else ctx.lineTo(x, y);
          prevY = y;
        }
      }
      if (s.dash) ctx.setLineDash([4, 3]);
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // hover crosshair
    if (hover !== null && rows[hover]) {
      const x = xOf(rows[hover].t);
      ctx.strokeStyle = 'rgba(232,238,246,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    }
  });

  const hoverRow = hover !== null ? rows[hover] : null;

  return (
    <section className="card chart-card">
      <header className="card-head">
        <h3>{title}</h3>
        <span className="tag">DEMO</span>
        {held ? <span className="tag tag-amber">HELD</span> : null}
      </header>
      <div className="chart-wrap" ref={wrapRef}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          if (empty) return;
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const mx = e.clientX - rect.left;
          let best = 0, bd = Infinity;
          rows.forEach((r, i) => {
            const d = Math.abs(xOf(r.t) - mx);
            if (d < bd) { bd = d; best = i; }
          });
          setHover(best);
        }}>
        {empty ? (
          <div className="chart-empty">No samples in this window yet - press RUN on the Live cockpit.</div>
        ) : (
          <canvas ref={canvasRef} style={{ width: w, height: H, display: 'block' }} />
        )}
        {hoverRow ? (
          <div className="chart-tip" style={{ left: Math.min(Math.max(xOf(hoverRow.t), 90), w - 110) }}>
            <div className="tip-t">{fmt.t(hoverRow.t)}</div>
            {series.map(s => {
              const v = valOf(hoverRow, s.key);
              return (
                <div className="tip-row" key={s.key}>
                  <i style={{ background: s.color }} />
                  <span>{s.label}</span>
                  <b>{isFinite(v) ? v.toFixed(2) : '-'} {(s.axis || 'l') === 'l' ? left.unit : (right ? right.unit : '')}</b>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="chart-legend">
        {series.map(s => (
          <span className="lg" key={s.key}><i style={{ background: s.color }} />{s.label}{s.axis === 'r' && right ? ' (' + right.unit + ')' : ''}</span>
        ))}
      </div>
    </section>
  );
}
