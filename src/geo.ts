// CAS BIS — Geo & math utilities

import * as mgrs from 'mgrs'
import type { CoordFormat, DistUnit, GridMode, LatLng } from './types'

const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export function clampLL(p: LatLng): LatLng {
  return { lng: Math.max(-180, Math.min(180, p.lng)), lat: Math.max(-85, Math.min(85, p.lat)) }
}

// --- DMS ---
export function toDMS(v: number, axis: 'lat' | 'lng') {
  const dir = axis === 'lat' ? (v >= 0 ? 'N' : 'S') : v >= 0 ? 'E' : 'W'
  const a = Math.abs(v)
  const d = Math.floor(a)
  const mf = (a - d) * 60
  const m = Math.floor(mf)
  const s = (mf - m) * 60
  const dp = axis === 'lat' ? 2 : 3
  return `${String(d).padStart(dp, '0')}°${String(m).padStart(2, '0')}′${s.toFixed(2).padStart(5, '0')}″${dir}`
}

// --- UTM ---
const A = 6378137
const F = 1 / 298.257223563
const E2 = F * (2 - F)
const K0 = 0.9996

export function toUTM(p: LatLng) {
  const c = clampLL(p)
  const zn = Math.floor((c.lng + 180) / 6) + 1
  const lon0 = (zn - 1) * 6 - 180 + 3
  const lt = rad(c.lat), ln = rad(c.lng), l0 = rad(lon0)
  const ep = E2 / (1 - E2)
  const N = A / Math.sqrt(1 - E2 * Math.sin(lt) ** 2)
  const T = Math.tan(lt) ** 2
  const C = ep * Math.cos(lt) ** 2
  const aa = Math.cos(lt) * (ln - l0)
  const M = A * ((1 - E2/4 - 3*E2*E2/64 - 5*E2*E2*E2/256) * lt
    - (3*E2/8 + 3*E2*E2/32 + 45*E2*E2*E2/1024) * Math.sin(2*lt)
    + (15*E2*E2/256 + 45*E2*E2*E2/1024) * Math.sin(4*lt)
    - (35*E2*E2*E2/3072) * Math.sin(6*lt))
  const E = K0 * N * (aa + (1-T+C)*aa*aa*aa/6 + (5-18*T+T*T+72*C-58*ep)*aa*aa*aa*aa*aa/120) + 500000
  let nVal = K0 * (M + N * Math.tan(lt) * (aa*aa/2 + (5-T+9*C+4*C*C)*aa*aa*aa*aa/24 + (61-58*T+T*T+600*C-330*ep)*aa*aa*aa*aa*aa*aa/720))
  if (c.lat < 0) nVal += 10000000
  return { zone: `${zn}${c.lat >= 0 ? 'N' : 'S'}`, e: Math.round(E), n: Math.round(nVal) }
}

// --- Format coord ---
export function fmtCoord(p: LatLng | null, f: CoordFormat): string {
  if (!p) return '—'
  const c = clampLL(p)
  switch (f) {
    case 'dd': return `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`
    case 'dms': return `${toDMS(c.lat, 'lat')} ${toDMS(c.lng, 'lng')}`
    case 'mgrs': return mgrs.forward([c.lng, c.lat], 5)
    case 'utm': { const u = toUTM(c); return `${u.zone} ${u.e}E ${u.n}N` }
  }
}

// --- Dist/alt/speed ---
export function fmtDist(m: number, u: DistUnit): string {
  if (u === 'feet') return `${Math.round(m * 3.28084).toLocaleString('en-US')} ft`
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}
export function fmtAlt(m: number, u: DistUnit): string {
  return u === 'feet' ? `${Math.round(m * 3.28084).toLocaleString('en-US')} ft` : `${Math.round(m)} m`
}
export function fmtKt(k: number): string { return `${Math.round(k)} kt` }
export function fmtHdg(d: number): string { return `${Math.round(d).toString().padStart(3, '0')}°` }

// --- Haversine ---
export function havM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// --- Bearing ---
export function bearing(a: LatLng, b: LatLng): number {
  const la1 = rad(a.lat), la2 = rad(b.lat), dL = rad(b.lng - a.lng)
  const y = Math.sin(dL) * Math.cos(la2)
  const x = Math.cos(la1)*Math.sin(la2) - Math.sin(la1)*Math.cos(la2)*Math.cos(dL)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

export function revBrg(b: number): number { return (b + 180) % 360 }

export function dest(p: LatLng, brg: number, distM: number): LatLng {
  const ad = distM / R, b = rad(brg)
  const l1 = rad(p.lat), g1 = rad(p.lng)
  const l2 = Math.asin(Math.sin(l1)*Math.cos(ad) + Math.cos(l1)*Math.sin(ad)*Math.cos(b))
  const g2 = g1 + Math.atan2(Math.sin(b)*Math.sin(ad)*Math.cos(l1), Math.cos(ad) - Math.sin(l1)*Math.sin(l2))
  return { lat: deg(l2), lng: ((deg(g2) + 540) % 360) - 180 }
}

export function ringFeature(center: LatLng, radiusM: number) {
  const coords: number[][] = []
  for (let b = 0; b <= 360; b += 3) {
    const p = dest(center, b, radiusM)
    coords.push([p.lng, p.lat])
  }
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } }
}

export function ringsFC(center: LatLng | null, radii: number[]) {
  return { type: 'FeatureCollection' as const, features: center ? radii.map(r => ringFeature(center, r)) : [] }
}

export function lineFC(a: LatLng, b: LatLng) {
  return { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } }] }
}

// --- Grid ---
function gridStep(z: number, mode: GridMode): number {
  if (mode === 'off') return 0
  const base = mode === 'fine'
    ? [[15, 0.0025], [13, 0.005], [11, 0.01], [9, 0.025], [0, 0.05]]
    : [[15, 0.005], [13, 0.01], [11, 0.025], [9, 0.05], [7, 0.1], [0, 0.5]]
  for (const [z2, s] of base) if (z >= z2) return s as number
  return 0.5
}

export function gridFC(
  b: { getWest: () => number; getEast: () => number; getSouth: () => number; getNorth: () => number },
  zoom: number, mode: GridMode,
) {
  if (mode === 'off') return { type: 'FeatureCollection' as const, features: [] }
  const step = gridStep(zoom, mode)
  const w = Math.floor(b.getWest() / step) * step
  const e = Math.ceil(b.getEast() / step) * step
  const s = Math.floor(b.getSouth() / step) * step
  const n = Math.ceil(b.getNorth() / step) * step
  const features: object[] = []
  for (let lng = w; lng <= e; lng += step)
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[Number(lng.toFixed(6)), s], [Number(lng.toFixed(6)), n]] } })
  for (let lat = s; lat <= n; lat += step)
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[w, Number(lat.toFixed(6))], [e, Number(lat.toFixed(6))]] } })
  return { type: 'FeatureCollection' as const, features }
}

// --- Cardinal ---
export function card(d: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(d / 22.5) % 16]
}

// --- Declination (rough — NOT for real nav) ---
export function decl(lat: number, lng: number): number {
  return deg(Math.atan2(-Math.sin(rad(lng + 100)), Math.cos(rad(lat)) * 2)) * 0.35
}

// --- Slant range ---
export function slant(groundM: number, altDiffM: number): number {
  return Math.sqrt(groundM ** 2 + altDiffM ** 2)
}

// --- NATO mils ---
export function toMils(degVal: number): number {
  return Math.round((degVal / 360) * 6400)
}
