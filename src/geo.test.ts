import { describe, expect, it } from 'vitest'

import {
  bearing,
  fmtAlt,
  fmtCoord,
  fromUTM,
  havM,
  mgrsGridFC,
  parseMgrsCoord,
  slant,
  toMils,
  toUTM,
} from './geo'
import type { GridMode, LatLng } from './types'

function distance(a: LatLng, b: LatLng) {
  return havM(a, b)
}

function bounds(west: number, east: number, south: number, north: number) {
  return {
    getWest: () => west,
    getEast: () => east,
    getSouth: () => south,
    getNorth: () => north,
  }
}

function lineCount(fc: ReturnType<typeof mgrsGridFC>) {
  return fc.features.filter((feature) => {
    const geometry = (feature as { geometry?: { type?: string } }).geometry
    return geometry?.type === 'LineString'
  }).length
}

describe('CAS BIS geo utilities', () => {
  it('parses both spaced and compact MGRS coordinates near the same point', () => {
    const spaced = parseMgrsCoord('31T FJ 13396 46159')
    const compact = parseMgrsCoord('31TFJ1339646159')

    expect(spaced).not.toBeNull()
    expect(compact).not.toBeNull()
    expect(distance(spaced!, compact!)).toBeLessThan(2)
    expect(spaced!.lat).toBeGreaterThan(43.7)
    expect(spaced!.lat).toBeLessThan(43.8)
    expect(spaced!.lng).toBeGreaterThan(4.3)
    expect(spaced!.lng).toBeLessThan(4.5)
  })

  it('rejects invalid MGRS input instead of throwing', () => {
    expect(parseMgrsCoord('not a coordinate')).toBeNull()
    expect(parseMgrsCoord('31T')).toBeNull()
  })

  it('round-trips UTM conversion within a small navigation tolerance', () => {
    const original = { lat: 43.7598, lng: 4.4087 }
    const utm = toUTM(original)
    const roundTrip = fromUTM(Number.parseInt(utm.zone, 10), utm.e, utm.n)

    expect(distance(original, roundTrip)).toBeLessThan(2)
  })

  it('formats MGRS and altitude labels for cockpit display', () => {
    const point = { lat: 43.7598, lng: 4.4087 }

    expect(fmtCoord(point, 'mgrs')).toMatch(/^31T [A-Z]{2} \d{5} \d{5}$/)
    expect(fmtAlt(150, 'meters')).toBe('150 m AMSL')
    expect(fmtAlt(150, 'feet')).toBe('492 ft AMSL')
  })

  it('computes core CAS geometry values', () => {
    const ip = { lat: 43.8021, lng: 4.3812 }
    const target = { lat: 43.7712, lng: 4.4523 }
    const ground = havM(ip, target)
    const heading = bearing(ip, target)

    expect(ground).toBeGreaterThan(6500)
    expect(ground).toBeLessThan(7000)
    expect(heading).toBeGreaterThan(115)
    expect(heading).toBeLessThan(125)
    expect(slant(3000, 4000)).toBe(5000)
    expect(toMils(90)).toBe(1600)
  })

  it('keeps grid off empty and makes fine mode denser than auto mode', () => {
    const nimesBounds = bounds(4.35, 4.48, 43.72, 43.84)
    const grid = (mode: GridMode) => mgrsGridFC(nimesBounds, 12, mode)

    expect(grid('off').features).toHaveLength(0)
    expect(lineCount(grid('fine'))).toBeGreaterThan(lineCount(grid('auto')))
  })
})
