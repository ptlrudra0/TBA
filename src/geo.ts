// Map geometry: Web-Mercator pixel math for the bundled CARTO/OSM tile grid.
import { TILE_Z, TILE_X0, TILE_Y0, TILE_GRID } from './tiles';
import { MAP_CENTER } from './config';

export const GRID_PX = TILE_GRID * 256;
export const MPP = 156543.03392 * Math.cos(MAP_CENTER.lat * Math.PI / 180) / Math.pow(2, TILE_Z); // meters per pixel

const N = Math.pow(2, TILE_Z);
const LAT_R = MAP_CENTER.lat * Math.PI / 180;

export function enuToLatLon(e: number, n: number): { lat: number; lon: number } {
  return {
    lat: MAP_CENTER.lat + n / 111320,
    lon: MAP_CENTER.lon + e / (111320 * Math.cos(LAT_R)),
  };
}

export function latLonToPx(lat: number, lon: number): [number, number] {
  const gx = (lon + 180) / 360 * N * 256;
  const lr = lat * Math.PI / 180;
  const gy = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * N * 256;
  return [gx - TILE_X0 * 256, gy - TILE_Y0 * 256];
}

export function enuToPx(e: number, n: number): [number, number] {
  const ll = enuToLatLon(e, n);
  return latLonToPx(ll.lat, ll.lon);
}

export const CENTER_PX = latLonToPx(MAP_CENTER.lat, MAP_CENTER.lon);
