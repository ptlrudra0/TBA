// ===========================================================================
// Deterministic client-side simulation engine for the dead-reckoning demo.
//
// Data-source adapter interface
// -----------------------------
// Every reading the UI shows comes through a `DataAdapter`. This build ships
// exactly one implementation, `MockAdapter`, which synthesizes a vehicle, a
// GNSS receiver, an IMU, an error-state Kalman filter (ESKF) and an AI bias
// model, all driven by one seeded PRNG and one simulation clock. To connect
// real sensors or a backend later, implement `DataAdapter` against the live
// source and hand it to the same UI: no component reads the mock directly.
// ===========================================================================

export type NavStateId =
  | 'init' | 'fused' | 'degraded' | 'lost' | 'ins' | 'ai' | 'refusion' | 'stabilized';

export interface Frame {
  t: number;                 // mission time, seconds
  state: NavStateId;
  // truth (never displayed directly)
  trueE: number; trueN: number; trueSpeed: number; trueHeading: number;
  // navigation solution (fused output, what the map shows)
  solE: number; solN: number; solSpeed: number; solHeading: number; alt: number;
  errE: number; errN: number;          // signed error of solution vs truth
  sigmaE: number; sigmaN: number;      // 1-sigma covariance, meters
  sigmaH: number;                      // horizontal 1-sigma
  confidence: number;                  // 0..100
  velErr: number; hdgErr: number;      // m/s, degrees
  // gnss
  gnssAvail: boolean;
  gnssE: number; gnssN: number;        // last fix (frozen during outage)
  lastFixT: number;                    // mission time of last fix
  fixType: string; satsUsed: number; satsVisible: number; hdop: number; cn0: number;
  // imu
  accelMag: number; gyroZ: number; roll: number; pitch: number;
  accelBiasMg: number; gyroBiasDph: number; imuTemp: number;
  // eskf
  nis: number; accepted: number; rejected: number; inertialOnly: number;
  sigmaV: number; sigmaPsi: number;
  // ai (simulated)
  aiStage: 'idle' | 'active';
  aiPredictedErr: number; aiCorrections: number; aiInferenceMs: number;
}

export interface HistoryRow {
  t: number; state: NavStateId;
  errE: number; errN: number; sigE: number; sigN: number; sigH: number;
  conf: number; velErr: number; hdgErr: number; nis: number; rej: number;
  gnss: number; accel: number; gyro: number;
}

export interface TimelineEvent { t: number; kind: 'state' | 'action' | 'note'; text: string; }

export interface DataAdapter {
  readonly sourceName: string;
  reset(seed: number): void;
  tick(dt: number): void;        // advance the simulation clock by dt seconds
  frame(): Frame;                // latest coherent snapshot
  history(): HistoryRow[];       // 1 Hz recorded series, oldest first
  events(): TimelineEvent[];     // reverse-chronological
}

export interface ScenarioScriptStep { at: number; action: 'degraded' | 'clear' | 'outage' | 'recover'; }

export interface Scenario {
  id: string; name: string; desc: string; scripted: boolean;
  targetSpeedKmh: number; imuNoise: number; nominalSigma: number; driftRate: number;
  path: [number, number][];    // ENU meters, ping-ponged
  speedAt: (t: number) => number;          // m/s
  script: ScenarioScriptStep[];
}

// --- deterministic PRNG -----------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- scenarios --------------------------------------------------------------
const KMH = 1 / 3.6;
export const SCENARIOS: Scenario[] = [
  {
    id: 'highway', name: 'Highway', scripted: true,
    desc: 'Steady cruise at speed. One short overpass shadow degrades the fix.',
    targetSpeedKmh: 61, imuNoise: 0.030, nominalSigma: 1.6, driftRate: 0.105,
    path: [[-1600, -420], [-700, -240], [300, 60], [1500, 480]],
    speedAt: () => 61 * KMH,
    script: [{ at: 40, action: 'degraded' }, { at: 48, action: 'clear' }],
  },
  {
    id: 'urban', name: 'Urban Canyon', scripted: true,
    desc: 'Stop-and-go through a street grid. Frequent multipath, intermittent drops.',
    targetSpeedKmh: 32, imuNoise: 0.045, nominalSigma: 2.2, driftRate: 0.14,
    path: [[-700, -700], [700, -700], [700, -100], [-100, -100], [-100, 500], [700, 500]],
    speedAt: (t) => { const c = t % 26; if (c < 4) return 0; if (c < 8) return 32 * KMH * (c - 4) / 4; if (c > 22) return 32 * KMH * (26 - c) / 4; return 32 * KMH; },
    script: [
      { at: 18, action: 'degraded' }, { at: 24, action: 'clear' },
      { at: 44, action: 'outage' }, { at: 50, action: 'recover' },
      { at: 78, action: 'degraded' }, { at: 88, action: 'clear' },
      { at: 120, action: 'outage' }, { at: 128, action: 'recover' },
    ],
  },
  {
    id: 'tunnel', name: 'Tunnel', scripted: true,
    desc: 'Sustained GNSS denial inside a portal. Long coast, slow recovery.',
    targetSpeedKmh: 55, imuNoise: 0.035, nominalSigma: 1.8, driftRate: 0.16,
    path: [[-1500, -120], [-500, 0], [500, 160], [1500, 380]],
    speedAt: () => 55 * KMH,
    script: [{ at: 15, action: 'outage' }, { at: 40, action: 'recover' }],
  },
  {
    id: 'sharp', name: 'Sharp Turn / Braking', scripted: true,
    desc: 'High lateral dynamics. Stresses strapdown propagation and the AI features.',
    targetSpeedKmh: 58, imuNoise: 0.055, nominalSigma: 2.0, driftRate: 0.19,
    path: [[-900, -500], [-100, -500], [-100, 200], [600, 200], [600, 800]],
    speedAt: (t) => { const c = t % 34; if (c > 12 && c < 18) return 15 * KMH; return 58 * KMH; },
    script: [{ at: 14, action: 'degraded' }, { at: 22, action: 'clear' }],
  },
  {
    id: 'blackout', name: 'GNSS Blackout', scripted: true,
    desc: 'Full FUSED > DEGRADED > OUTAGE > AI > RE-FUSION sequence, on a timer.',
    targetSpeedKmh: 45, imuNoise: 0.040, nominalSigma: 1.7, driftRate: 0.30,
    path: [[-1300, -320], [-500, -120], [300, 120], [1300, 360]],
    speedAt: () => 45 * KMH,
    script: [{ at: 8, action: 'degraded' }, { at: 12, action: 'outage' }, { at: 35, action: 'recover' }],
  },
];

export const STATE_META: Record<NavStateId, { label: string; tone: 'ok' | 'warn' | 'bad' | 'sim' | 'idle'; expl: string }> = {
  init:       { label: 'INITIALIZING',        tone: 'idle', expl: 'Filter converging on the first fixes. Covariance settling.' },
  fused:      { label: 'GNSS FUSED',          tone: 'ok',   expl: 'GNSS and ESKF accepting updates normally. Position continuity nominal.' },
  degraded:   { label: 'GNSS DEGRADED',       tone: 'warn', expl: 'Multipath or shadowing. Fixes accepted with inflated covariance.' },
  lost:       { label: 'GNSS LOST',           tone: 'bad',  expl: 'No valid fix. Last position frozen, inertial propagation taking over.' },
  ins:        { label: 'INS DEAD RECKONING',  tone: 'warn', expl: 'Strapdown integration only. Uncertainty grows with time since last fix.' },
  ai:         { label: 'AI CORRECTION',       tone: 'sim',  expl: 'SIMULATED model feeding a bias estimate to the filter as a weighted measurement.' },
  refusion:   { label: 'GNSS RE-FUSION',      tone: 'sim',  expl: 'Fix regained. ESKF pulling the inertial solution back onto the GNSS stream.' },
  stabilized: { label: 'STABILIZED',          tone: 'ok',   expl: 'Re-fusion complete. Covariance and bias back inside nominal bounds.' },
};

const NIS_GATE = 9.21; // chi-square 95%, 2 dof
export { NIS_GATE };

interface PathState { s: number; dir: 1 | -1; segLens: number[]; total: number; }

export class MockAdapter implements DataAdapter {
  readonly sourceName = 'MockAdapter';
  private rand: () => number = mulberry32(1);
  private scen: Scenario;
  private aiEnabled: () => boolean;
  private manual = false;

  private t = 0;
  private state: NavStateId = 'init';
  private stateAt = 0;
  private outageT = -1;          // mission time when current outage began (degraded phase)
  private lostT = -1;
  private refusionT = -1;
  private solAtRefusion: [number, number] = [0, 0];
  private scriptIdx = 0;

  private ps: PathState;
  private trueE = 0; private trueN = 0; private trueSpeed = 0; private trueHeading = 0;
  private solE = 0; private solN = 0;
  private insE = 0; private insN = 0;           // inertial solution while coasting
  private driftDirE = 0; private driftDirN = 0; // unit vector of slow drift
  private velErrCur = 0.08; private hdgErrCur = 0.4;

  private gnssAvail = true;
  private gnssE = 0; private gnssN = 0; private lastFixT = 0;
  private sats = 13; private hdop = 0.9; private cn0 = 44;

  private nis = 0.8; private accepted = 0; private rejected = 0; private inertialOnly = 0;
  private conf = 50; private aiPredErr = 0; private aiCorr = 0; private aiInfMs = 0;
  private imuTemp = 38.4; private gBias = 42; private aBias = 8;
  private rollC = 0; private pitchC = 0; private accelMagC = 9.79; private gyroZC = 0;
  private altC = 920;
  public gnssTrail: [number, number][] = [];
  public solTrail: [number, number][] = [];

  private hist: HistoryRow[] = [];
  private evts: TimelineEvent[] = [];
  private acc = 0; private secAcc = 0;

  constructor(scenario: Scenario, aiEnabled: () => boolean) {
    this.scen = scenario;
    this.aiEnabled = aiEnabled;
    this.ps = this.buildPath();
    this.reset(20260926);
  }

  private buildPath(): PathState {
    const segLens: number[] = [];
    let total = 0;
    for (let i = 0; i < this.scen.path.length - 1; i++) {
      const dx = this.scen.path[i + 1][0] - this.scen.path[i][0];
      const dy = this.scen.path[i + 1][1] - this.scen.path[i][1];
      const l = Math.hypot(dx, dy); segLens.push(l); total += l;
    }
    return { s: 0, dir: 1, segLens, total };
  }

  reset(seed: number): void {
    this.rand = mulberry32(seed);
    this.t = 0; this.state = 'init'; this.stateAt = 0;
    this.outageT = -1; this.lostT = -1; this.refusionT = -1; this.scriptIdx = 0; this.manual = false;
    this.ps.s = 0; this.ps.dir = 1;
    const p0 = this.posAt(0);
    this.trueE = p0[0]; this.trueN = p0[1];
    this.solE = p0[0]; this.solN = p0[1]; this.insE = p0[0]; this.insN = p0[1];
    this.gnssE = p0[0]; this.gnssN = p0[1]; this.lastFixT = 0;
    const ang = this.rand() * Math.PI * 2;
    this.driftDirE = Math.cos(ang); this.driftDirN = Math.sin(ang);
    this.velErrCur = 0.08; this.hdgErrCur = 0.4;
    this.gnssAvail = true; this.sats = 13; this.hdop = 0.9; this.cn0 = 44;
    this.nis = 0.8; this.accepted = 0; this.rejected = 0; this.inertialOnly = 0;
    this.conf = 50; this.aiPredErr = 0; this.aiCorr = 0; this.aiInfMs = 0;
    this.imuTemp = 38.4; this.gBias = 42; this.aBias = 8;
    this.hist = []; this.evts = []; this.acc = 0; this.secAcc = 0;
    this.gnssTrail = []; this.solTrail = [[this.trueE, this.trueN]];
    this.pushEvt('action', 'Simulation reset - deterministic seed ' + seed);
    this.pushEvt('state', 'INITIALIZING - filter convergence started');
  }

  private gauss(sd: number): number {
    const u = Math.max(this.rand(), 1e-9); const v = this.rand();
    return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  private pushEvt(kind: TimelineEvent['kind'], text: string): void {
    this.evts.unshift({ t: this.t, kind, text });
    if (this.evts.length > 80) this.evts.pop();
  }

  private setState(s: NavStateId, note?: string): void {
    if (s === this.state) return;
    this.state = s; this.stateAt = this.t;
    const meta = STATE_META[s];
    this.pushEvt('state', meta.label + (note ? ' - ' + note : ''));
  }

  private posAt(s: number): [number, number] {
    const sc = Math.max(0, Math.min(this.ps.total, s));
    let acc = 0;
    for (let i = 0; i < this.ps.segLens.length; i++) {
      if (sc <= acc + this.ps.segLens[i] || i === this.ps.segLens.length - 1) {
        const f = this.ps.segLens[i] === 0 ? 0 : (sc - acc) / this.ps.segLens[i];
        const a = this.scen.path[i], b = this.scen.path[i + 1];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      }
      acc += this.ps.segLens[i];
    }
    const last = this.scen.path[this.scen.path.length - 1];
    return [last[0], last[1]];
  }

  // --- controls -------------------------------------------------------------
  triggerOutage(): void {
    if (this.outageT >= 0) return;
    this.manual = true;
    this.beginOutage('manual trigger');
  }
  triggerRecovery(): void {
    if (this.outageT < 0) return;
    this.manual = true;
    this.beginRecovery('manual trigger');
  }
  note(text: string): void { this.pushEvt('action', text); }

  private beginOutage(why: string): void {
    this.outageT = this.t; this.refusionT = -1;
    this.setState('degraded', why + ' - multipath rising, covariance inflating');
  }
  private beginRecovery(why: string): void {
    this.outageT = -1; this.lostT = -1;
    this.refusionT = this.t;
    this.solAtRefusion = [this.solE, this.solN];
    this.setState('refusion', why);
  }

  // --- main tick ------------------------------------------------------------
  tick(dt: number): void {
    this.t += dt;
    const S = this.scen;

    // vehicle truth (ping-pong along path)
    const v = S.speedAt(this.t);
    this.trueSpeed = v;
    this.ps.s += v * dt * this.ps.dir;
    if (this.ps.s >= this.ps.total) { this.ps.s = this.ps.total; this.ps.dir = -1; }
    if (this.ps.s <= 0) { this.ps.s = 0; this.ps.dir = 1; }
    const ahead = this.posAt(this.ps.s + 2 * this.ps.dir);
    const here = this.posAt(this.ps.s);
    this.trueE = here[0]; this.trueN = here[1];
    if (v > 0.2) this.trueHeading = Math.atan2(ahead[0] - here[0], ahead[1] - here[1]) * 180 / Math.PI;

    // IMU (display-grade synthesis)
    const turnRate = v > 0.2 ? (this.gauss(2) + (S.id === 'sharp' ? 18 * Math.sin(this.t * 0.9) : 4 * Math.sin(this.t * 0.3))) : this.gauss(0.4);
    this.rollC = Math.max(-4, Math.min(4, this.rollC + this.gauss(0.05)));
    this.pitchC = Math.max(-4, Math.min(4, this.pitchC + this.gauss(0.05)));
    this.accelMagC = 9.79 + Math.abs(this.gauss(S.imuNoise)) + (S.id === 'sharp' ? Math.abs(Math.sin(this.t * 0.9)) * 1.4 : 0);
    this.gyroZC = turnRate;
    this.altC = 920 + this.trueN * 0.008 + Math.sin(this.t * 0.05) * 4 + this.gauss(0.15);
    this.solTrail.push([this.solE, this.solN]);
    if (this.solTrail.length > 4000) this.solTrail.shift();
    this.imuTemp += this.gauss(0.002);
    this.gBias = Math.max(20, Math.min(80, this.gBias + this.gauss(0.02)));
    this.aBias = Math.max(3, Math.min(20, this.aBias + this.gauss(0.01)));

    // script
    if (!this.manual) {
      while (this.scriptIdx < S.script.length && S.script[this.scriptIdx].at <= this.t) {
        const step = S.script[this.scriptIdx]; this.scriptIdx++;
        if (step.action === 'degraded' && this.outageT < 0) { this.outageT = this.t; this.setState('degraded', 'scripted - signal shadowing'); }
        else if (step.action === 'clear' && this.state === 'degraded' && this.lostT < 0) { this.outageT = -1; this.setState('fused', 'multipath cleared'); }
        else if (step.action === 'outage' && this.lostT < 0) { if (this.outageT < 0) this.outageT = this.t; this.loseFix('scripted outage'); }
        else if (step.action === 'recover' && this.outageT >= 0) { this.beginRecovery('scripted recovery'); }
      }
    }

    // outage ladder: degraded -> lost -> ins -> ai
    if (this.outageT >= 0 && this.lostT < 0 && this.t - this.outageT > 2.5 && this.manual) {
      this.loseFix('no valid fix within gate');
    }
    if (this.state === 'lost' && this.t - this.lostT > 1.0) {
      this.setState('ins', 'strapdown propagation only');
    }
    if (this.state === 'ins' && this.aiEnabled() && this.t - this.lostT > 5) {
      this.setState('ai', 'SIMULATED bias model online');
    }

    // GNSS availability + fix stream (1 Hz)
    const inOutage = this.outageT >= 0 && this.refusionT < 0;
    const degradedOnly = this.state === 'degraded';
    this.gnssAvail = !inOutage || degradedOnly;
    this.secAcc += dt;
    const gnssSigma = this.state === 'degraded' ? 8 + 3 * Math.abs(this.gauss(1)) : S.nominalSigma;
    if (this.gnssAvail && this.secAcc >= 1) {
      this.gnssE = this.trueE + this.gauss(gnssSigma);
      this.gnssN = this.trueN + this.gauss(gnssSigma);
      this.lastFixT = this.t;
      this.gnssTrail.push([this.gnssE, this.gnssN]);
      if (this.gnssTrail.length > 960) this.gnssTrail.shift();
      // NIS against predicted solution
      const dE = this.gnssE - this.solE, dN = this.gnssN - this.solN;
      const sPool = Math.hypot(dE, dN);
      this.nis = (sPool * sPool) / (gnssSigma * gnssSigma + this.sigmaH() * this.sigmaH()) * (0.6 + this.rand() * 0.8);
      if (this.state === 'degraded' && this.rand() < 0.16) this.nis *= 9 + this.rand() * 6;
      if (this.nis > NIS_GATE) {
        this.rejected++;
        if (this.rejected % 3 === 1) this.pushEvt('note', 'NIS ' + this.nis.toFixed(1) + ' > ' + NIS_GATE + ' - GNSS update rejected by gate');
      } else {
        this.accepted++;
      }
    }

    // receiver health numbers
    if (this.state === 'degraded') { this.sats = 5 + Math.floor(this.rand() * 3); this.hdop = 3.2 + this.rand(); this.cn0 = 31 + this.rand() * 4; }
    else if (inOutage && !degradedOnly) { this.sats = 0; this.hdop = 99; this.cn0 = 0; }
    else { this.sats = 12 + Math.floor(this.rand() * 4); this.hdop = 0.8 + this.rand() * 0.4; this.cn0 = 42 + this.rand() * 5; }

    // navigation solution
    const outageAge = this.lostT >= 0 ? this.t - this.lostT : 0;
    if (this.state === 'init') {
      this.solE = this.trueE + this.gauss(3); this.solN = this.trueN + this.gauss(3);
      this.conf = Math.min(92, this.conf + dt * 14);
      if (this.t - this.stateAt > 3) this.setState('fused', 'covariance inside nominal bounds');
    } else if (this.state === 'fused' || this.state === 'stabilized' || this.state === 'degraded') {
      const k = Math.min(1, dt * (this.state === 'degraded' ? 1.5 : 4));
      const targE = this.trueE + this.gauss(gnssSigma * 0.55);
      const targN = this.trueN + this.gauss(gnssSigma * 0.55);
      this.solE += (targE - this.solE) * k; this.solN += (targN - this.solN) * k;
      const cTarget = this.state === 'degraded' ? 74 : (this.state === 'stabilized' ? 96 : 95);
      this.conf += (cTarget - this.conf) * Math.min(1, dt * 0.8);
      this.velErrCur += (0.09 - this.velErrCur) * dt; this.hdgErrCur += (0.4 - this.hdgErrCur) * dt;
      if (this.state === 'stabilized' && this.t - this.stateAt > 8) this.setState('fused', 'returned to nominal operation');
    } else if (this.state === 'lost' || this.state === 'ins' || this.state === 'ai') {
      // inertial propagation: honest growth, AI (simulated) brakes it
      const driftScale = this.state === 'ai' ? 0.35 : 1;
      this.insE += (this.trueSpeed * Math.sin(this.trueHeading * Math.PI / 180)) * dt
        + this.driftDirE * S.driftRate * driftScale * dt + this.gauss(0.05 * driftScale) * Math.sqrt(dt);
      this.insN += (this.trueSpeed * Math.cos(this.trueHeading * Math.PI / 180)) * dt
        + this.driftDirN * S.driftRate * driftScale * dt + this.gauss(0.05 * driftScale) * Math.sqrt(dt);
      // slow random walk of the drift direction
      const rot = this.gauss(0.02);
      const ce = this.driftDirE * Math.cos(rot) - this.driftDirN * Math.sin(rot);
      const cn = this.driftDirE * Math.sin(rot) + this.driftDirN * Math.cos(rot);
      this.driftDirE = ce; this.driftDirN = cn;
      this.solE = this.insE; this.solN = this.insN;
      this.inertialOnly += dt;
      this.conf = Math.max(28, this.conf - dt * (this.state === 'ai' ? 0.55 : 1.5));
      this.velErrCur = Math.min(3.5, this.velErrCur + dt * 0.05 * driftScale);
      this.hdgErrCur = Math.min(12, this.hdgErrCur + dt * 0.12 * driftScale);
      if (this.state === 'ai') {
        this.aiInfMs = 6 + this.rand() * 3;
        this.aiPredErr = Math.max(0.3, Math.hypot(this.solE - this.trueE, this.solN - this.trueN) * (0.9 + this.rand() * 0.2));
        this.acc += dt;
        if (this.acc >= 1) {
          this.acc = 0; this.aiCorr++;
          // weighted correction pulls the inertial estimate part-way back
          this.insE += (this.trueE - this.insE) * 0.06 + this.gauss(0.15);
          this.insN += (this.trueN - this.insN) * 0.06 + this.gauss(0.15);
          this.conf = Math.min(70, this.conf + 0.6);
          if (this.aiCorr % 5 === 0) this.pushEvt('note', 'AI bias correction applied (' + this.aiCorr + ' total) - SIMULATED');
        }
      }
    } else if (this.state === 'refusion') {
      const a = Math.min(1, (this.t - this.refusionT) / 4);
      const sm = a * a * (3 - 2 * a);
      const gE = this.trueE + this.gauss(1.1), gN = this.trueN + this.gauss(1.1);
      this.solE = this.solAtRefusion[0] + (gE - this.solAtRefusion[0]) * sm;
      this.solN = this.solAtRefusion[1] + (gN - this.solAtRefusion[1]) * sm;
      this.conf = Math.min(92, this.conf + dt * 9);
      this.velErrCur = Math.max(0.09, this.velErrCur - dt * 0.5);
      this.hdgErrCur = Math.max(0.4, this.hdgErrCur - dt * 1.4);
      if (a >= 1) this.setState('stabilized', 'inertial solution re-anchored to GNSS');
    }

    // history at 1 Hz
    if (this.secAcc >= 1) {
      this.secAcc = 0;
      this.hist.push({
        t: this.t, state: this.state,
        errE: this.solE - this.trueE, errN: this.solN - this.trueN,
        sigE: this.sigmaH() * 0.9, sigN: this.sigmaH() * 0.82, sigH: this.sigmaH(),
        conf: this.conf, velErr: this.velErrCur, hdgErr: this.hdgErrCur,
        nis: this.gnssAvail ? this.nis : NaN, rej: this.rejected,
        gnss: this.gnssAvail ? 1 : 0,
        accel: 9.79 + Math.abs(this.gauss(S.imuNoise)) + (S.id === 'sharp' ? Math.abs(Math.sin(this.t * 0.9)) * 1.4 : 0),
        gyro: Math.abs(turnRate),
      });
      if (this.hist.length > 960) this.hist.shift();
    }
  }

  private loseFix(why: string): void {
    if (this.lostT >= 0) return;
    this.lostT = this.t;
    this.gnssAvail = false;
    // anchor the inertial coast at the current fused solution - never at a stale point
    this.insE = this.solE; this.insN = this.solN;
    this.setState('lost', why + ' - last fix frozen');
  }

  private sigmaH(): number {
    if (this.state === 'init') return 4;
    if (this.state === 'degraded') return 8 + 2 * Math.abs(Math.sin(this.t));
    if (this.lostT >= 0) {
      const age = this.t - this.lostT;
      const driftScale = this.state === 'ai' ? 0.4 : 1;
      return Math.sqrt(this.scen.nominalSigma ** 2 + (this.scen.driftRate * driftScale * age) ** 2);
    }
    if (this.state === 'refusion') {
      const a = Math.min(1, (this.t - this.refusionT) / 4);
      const start = Math.sqrt(this.scen.nominalSigma ** 2 + (this.scen.driftRate * 6) ** 2);
      return start + (this.scen.nominalSigma - start) * a;
    }
    return this.scen.nominalSigma;
  }

  frame(): Frame {
    const sh = this.sigmaH();
    const inOutage = this.outageT >= 0 && this.refusionT < 0 && this.state !== 'degraded';
    return {
      t: this.t, state: this.state,
      trueE: this.trueE, trueN: this.trueN, trueSpeed: this.trueSpeed, trueHeading: this.trueHeading,
      solE: this.solE, solN: this.solN, solSpeed: Math.max(0, this.trueSpeed - this.velErrCur * 0.4), solHeading: (this.trueHeading + this.hdgErrCur * 0.5 + 360) % 360,
      alt: this.altC,
      errE: this.solE - this.trueE, errN: this.solN - this.trueN,
      sigmaE: sh * 0.9, sigmaN: sh * 0.82, sigmaH: sh,
      confidence: this.conf, velErr: this.velErrCur, hdgErr: this.hdgErrCur,
      gnssAvail: this.gnssAvail,
      gnssE: this.gnssE, gnssN: this.gnssN, lastFixT: this.lastFixT,
      fixType: inOutage ? 'NO FIX' : (this.state === 'degraded' ? '2D / DGNSS' : '3D FIX'),
      satsUsed: this.sats, satsVisible: this.sats + 6, hdop: this.hdop, cn0: this.cn0,
      accelMag: this.accelMagC, gyroZ: this.gyroZC, roll: this.rollC, pitch: this.pitchC,
      accelBiasMg: this.aBias, gyroBiasDph: this.gBias, imuTemp: this.imuTemp,
      nis: this.nis, accepted: this.accepted, rejected: this.rejected, inertialOnly: this.inertialOnly,
      sigmaV: 0.12 + this.velErrCur * 0.5, sigmaPsi: 0.5 + this.hdgErrCur * 0.4,
      aiStage: this.state === 'ai' ? 'active' : 'idle',
      aiPredictedErr: this.aiPredErr, aiCorrections: this.aiCorr, aiInferenceMs: this.aiInfMs,
    };
  }

  history(): HistoryRow[] { return this.hist; }
  events(): TimelineEvent[] { return this.evts; }
  stateEnteredAt(): number { return this.stateAt; }
}

// --- app-facing controller ---------------------------------------------------
export type RunState = 'idle' | 'running' | 'held';

export class SimController {
  adapter: MockAdapter;
  scenario: Scenario;
  running: RunState = 'idle';
  speed = 1;
  aiEnabled = true;
  seed = 20260926;
  private listeners: (() => void)[] = [];

  constructor() {
    this.scenario = SCENARIOS[4]; // GNSS Blackout shows the full ladder
    this.adapter = new MockAdapter(this.scenario, () => this.aiEnabled);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(f => f !== fn); };
  }
  private emit(): void { this.listeners.forEach(f => f()); }

  advance(realDt: number): void {
    if (this.running !== 'running') return;
    let budget = realDt * this.speed;
    while (budget > 0) { const step = Math.min(0.1, budget); this.adapter.tick(step); budget -= step; }
    this.emit();
  }

  run(): void {
    this.running = 'running';
    this.adapter.note(this.adapter.frame().t === 0 ? 'Run started' : 'Run resumed');
    this.emit();
  }
  hold(): void { this.running = 'held'; this.adapter.note('Held by operator'); this.emit(); }
  reset(): void {
    this.running = 'idle';
    this.adapter.reset(this.seed);
    this.emit();
  }
  setScenario(id: string): void {
    const s = SCENARIOS.find(x => x.id === id);
    if (!s || s.id === this.scenario.id) return;
    this.scenario = s;
    this.running = 'idle';
    this.adapter = new MockAdapter(s, () => this.aiEnabled);
    this.adapter.note('Scenario loaded: ' + s.name);
    this.emit();
  }
  setSpeed(v: number): void { this.speed = v; this.emit(); }
  setAiEnabled(on: boolean): void {
    this.aiEnabled = on;
    this.adapter.note(on ? 'AI bias correction ENABLED (simulated)' : 'AI bias correction disabled - pure inertial coast');
    this.emit();
  }
  triggerOutage(): void { this.adapter.triggerOutage(); this.emit(); }
  triggerRecovery(): void { this.adapter.triggerRecovery(); this.emit(); }
}
