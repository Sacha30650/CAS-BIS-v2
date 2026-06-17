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
    case 'mgrs': {
      const raw = mgrs.forward([c.lng, c.lat], 5)
      // Format: 31T FJ 13181 46215
      const m = raw.match(/^(\d+[A-Z])([A-Z]{2})(\d+)$/)
      if (m) {
        const d = m[3], h = Math.floor(d.length / 2)
        return `${m[1]} ${m[2]} ${d.slice(0, h)} ${d.slice(h)}`
      }
      return raw
    }
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

// --- UTM inverse ---
export function fromUTM(zoneNum: number, easting: number, northing: number): LatLng {
  let n = northing
  const isNorth = n < 10000000
  if (!isNorth) n -= 10000000
  const lon0 = rad((zoneNum - 1) * 6 - 180 + 3)
  const x = easting - 500000
  const y = n
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const eP2 = E2 / (1 - E2)
  const M = y / K0
  const mu = M / (A * (1 - E2/4 - 3*E2*E2/64 - 5*E2*E2*E2/256))
  const phi1 = mu + (3*e1/2 - 27*e1**3/32) * Math.sin(2*mu)
    + (21*e1*e1/16 - 55*e1**4/32) * Math.sin(4*mu)
    + (151*e1**3/96) * Math.sin(6*mu)
    + (1097*e1**4/512) * Math.sin(8*mu)
  const N1 = A / Math.sqrt(1 - E2 * Math.sin(phi1)**2)
  const T1 = Math.tan(phi1)**2
  const C1 = eP2 * Math.cos(phi1)**2
  const R1 = A * (1 - E2) / (1 - E2 * Math.sin(phi1)**2)**1.5
  const D = x / (N1 * K0)
  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D*D/2
    - (5 + 3*T1 + 10*C1 - 4*C1*C1 - 9*eP2) * D**4/24
    + (61 + 90*T1 + 298*C1 + 45*T1*T1 - 252*eP2 - 3*C1*C1) * D**6/720)
  const lng = lon0 + (D - (1 + 2*T1 + C1) * D**3/6
    + (5 - 2*C1 + 28*T1 - 3*C1*C1 + 8*eP2 + 24*T1*T1) * D**5/120) / Math.cos(phi1)
  return { lat: deg(lat), lng: deg(lng) }
}

// --- MGRS km grid ---
function mgrsGridSpacing(zoom: number): number {
  if (zoom >= 14) return 1000    // 1 km
  if (zoom >= 11) return 1000    // 1 km
  if (zoom >= 9) return 10000    // 10 km
  return 100000                   // 100 km
}

export function mgrsGridFC(
  b: { getWest: () => number; getEast: () => number; getSouth: () => number; getNorth: () => number },
  zoom: number,
  mode: GridMode,
) {
  if (mode === 'off') return { type: 'FeatureCollection' as const, features: [] as object[] }

  const spacing = mgrsGridSpacing(zoom)
  const wLat = b.getSouth(), nLat = b.getNorth()
  const wLng = b.getWest(), eLng = b.getEast()

  // Determine all UTM zones in view
  const zStart = Math.floor((wLng + 180) / 6) + 1
  const zEnd = Math.floor((eLng + 180) / 6) + 1

  const features: object[] = []
  const labelFeatures: object[] = []

  for (let zoneNum = zStart; zoneNum <= zEnd; zoneNum++) {
    const zoneW = (zoneNum - 1) * 6 - 180
    const zoneE = zoneNum * 6 - 180
    // Clip to visible bounds
    const zLeft = Math.max(wLng, zoneW)
    const zRight = Math.min(eLng, zoneE)
    if (zLeft >= zRight) continue

    const swUTM = toUTM({ lat: wLat, lng: zLeft })
    const seUTM = toUTM({ lat: wLat, lng: zRight })
    const nwUTM = toUTM({ lat: nLat, lng: zLeft })
    const neUTM = toUTM({ lat: nLat, lng: zRight })

    const eStart = Math.floor(Math.min(swUTM.e, nwUTM.e) / spacing) * spacing
    const eEnd = Math.ceil(Math.max(seUTM.e, neUTM.e) / spacing) * spacing
    const nStart = Math.floor(Math.min(swUTM.n, seUTM.n) / spacing) * spacing
    const nEnd = Math.ceil(Math.max(nwUTM.n, neUTM.n) / spacing) * spacing

    // Vertical lines (easting) — top to bottom
    for (let e = eStart; e <= eEnd; e += spacing) {
      const top = fromUTM(zoneNum, e, nEnd)
      const bot = fromUTM(zoneNum, e, nStart)
      features.push({
        type: 'Feature', properties: { axis: 'v' },
        geometry: { type: 'LineString', coordinates: [[top.lng, top.lat], [bot.lng, bot.lat]] },
      })
      const labelNum = String(Math.floor((e % 100000) / 1000)).padStart(2, '0')
      const labelPt = fromUTM(zoneNum, e, nEnd - spacing * 0.5)
      labelFeatures.push({
        type: 'Feature', properties: { label: labelNum, axis: 'v' },
        geometry: { type: 'Point', coordinates: [labelPt.lng, labelPt.lat] },
      })
    }

    // Horizontal lines (northing) — left to right
    for (let nn = nStart; nn <= nEnd; nn += spacing) {
      const left = fromUTM(zoneNum, eStart, nn)
      const right = fromUTM(zoneNum, eEnd, nn)
      features.push({
        type: 'Feature', properties: { axis: 'h' },
        geometry: { type: 'LineString', coordinates: [[left.lng, left.lat], [right.lng, right.lat]] },
      })
      const labelNum = String(Math.floor((nn % 100000) / 1000)).padStart(2, '0')
      const labelPt = fromUTM(zoneNum, eStart + spacing * 0.5, nn)
      labelFeatures.push({
        type: 'Feature', properties: { label: labelNum, axis: 'h' },
        geometry: { type: 'Point', coordinates: [labelPt.lng, labelPt.lat] },
      })
    }
  }

  return { type: 'FeatureCollection' as const, features: [...features, ...labelFeatures] }
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
