import React from 'react';

// --- formatting -------------------------------------------------------------
export const fmt = {
  lat: (v: number): string => Math.abs(v).toFixed(6) + '\u00B0 ' + (v >= 0 ? 'N' : 'S'),
  lon: (v: number): string => Math.abs(v).toFixed(6) + '\u00B0 ' + (v >= 0 ? 'E' : 'W'),
  t: (s: number): string => {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return 'T+' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  },
  dur: (s: number): string => {
    if (s < 60) return s.toFixed(1) + ' s';
    return Math.floor(s / 60) + 'm ' + String(Math.floor(s % 60)).padStart(2, '0') + 's';
  },
  n: (v: number, d: number): string => v.toFixed(d),
};

// --- icons: one small, consistent stroked set -------------------------------
const PATHS: Record<string, string> = {
  satellite: 'M13 7l4 4M9.5 10.5l4 4M7 13l-2.5 2.5a2.12 2.12 0 003 3L10 16m2-8 3-3 4 4-3 3M4 20l1.5-1.5M16 3l1 2M20 7l2 1',
  imu: 'M7 4h10v16H7zM10 8h4M10 12h4M10 16h4M4 8h3M4 12h3M4 16h3M17 8h3M17 12h3M17 16h3',
  filter: 'M4 6h16M7 12h10M10 18h4',
  ai: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M12 9a3 3 0 100 6 3 3 0 000-6z',
  play: 'M7 5l12 7-12 7z',
  hold: 'M7 5h4v14H7zM13 5h4v14h-4z',
  reset: 'M4 10a8 8 0 118 8M4 10V4m0 6h6',
  warn: 'M12 4L2.5 20h19L12 4zm0 6v5m0 3v.5',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-13v.5M12 11v6',
  gauge: 'M12 15l4-6M12 15a2 2 0 100 .5M4 15a8 8 0 1116 0',
  sliders: 'M5 6h14M5 12h14M5 18h14M9 4v4M15 10v4M8 16v4',
  book: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zm0 13a3 3 0 013-3h11',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  pulse: 'M3 12h4l2-6 4 12 2-6h6',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
};

export function Icon({ name, size = 15 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || PATHS.info} />
    </svg>
  );
}

// --- state badge -------------------------------------------------------------
import { STATE_META, NavStateId } from './sim';

export function StateBadge({ state, large }: { state: NavStateId; large?: boolean }) {
  const meta = STATE_META[state];
  return (
    <span className={'badge tone-' + meta.tone + (large ? ' badge-lg' : '')}>
      <span className="badge-dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

// --- generic card ------------------------------------------------------------
export function Card({ title, icon, tag, children, className }: {
  title: string; icon?: string; tag?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={'card' + (className ? ' ' + className : '')}>
      <header className="card-head">
        {icon ? <Icon name={icon} /> : null}
        <h3>{title}</h3>
        {tag ? <span className="tag">{tag}</span> : null}
      </header>
      {children}
    </section>
  );
}

// --- mono key/value grid ------------------------------------------------------
export function KV({ items }: { items: [React.ReactNode, React.ReactNode, string?][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v, tip], i) => (
        <div className="kv-row" key={i}>
          <dt>{tip ? <abbr title={tip}>{k}</abbr> : k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
