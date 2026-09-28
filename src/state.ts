import { SimController } from './sim';
// One deterministic simulation state + clock drives map, telemetry, timeline and charts.
export const sim = new SimController();
// debug handle for preview verification
if (typeof window !== 'undefined') { (window as unknown as { __sim: SimController }).__sim = sim; }
