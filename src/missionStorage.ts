import { demoMarkers } from './data'
import type { CoordFormat, DistUnit, GridMode, MarkerType, Role, Side, TMarker } from './types'

export const MISSION_STORAGE_KEY = 'cas-bis-v2:mission-state'
export const MISSION_EXPORT_VERSION = 1

export interface MissionState {
  version: number
  savedAt: string
  markers: TMarker[]
  selectedId: string
  coordFormat: CoordFormat
  distanceUnit: DistUnit
  altitudeUnit: DistUnit
  grid: GridMode
  showRings: boolean
  showLabels: boolean
  showRef: boolean
  show3D: boolean
  showLine: boolean
  role: Role
  visibility: Record<Side, boolean>
  theme: 'day' | 'night' | 'red' | 'nvg'
}

const markerTypes = new Set<MarkerType>(['infantry', 'vehicle', 'aircraft', 'objective', 'checkpoint', 'target', 'ip', 'danger'])
const sides = new Set<Side>(['friendly', 'hostile', 'neutral'])
const coordFormats = new Set<CoordFormat>(['mgrs', 'utm', 'dms', 'dd'])
const distUnits = new Set<DistUnit>(['meters', 'feet'])
const gridModes = new Set<GridMode>(['off', 'auto', 'fine'])
const roles = new Set<Role>(['JTAC', 'Pilot', 'Observer'])
const themes = new Set<MissionState['theme']>(['day', 'night', 'red', 'nvg'])

const defaultVisibility: Record<Side, boolean> = { friendly: true, hostile: true, neutral: true }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isMarker(value: unknown): value is TMarker {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && sides.has(value.side as Side)
    && markerTypes.has(value.type as MarkerType)
    && isFiniteNumber(value.lat)
    && isFiniteNumber(value.lng)
    && isFiniteNumber(value.altM)
    && isFiniteNumber(value.hdg)
    && isFiniteNumber(value.spdKt)
    && typeof value.note === 'string'
    && typeof value.ts === 'string'
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function readEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T) {
  return typeof value === 'string' && allowed.has(value as T) ? value as T : fallback
}

function readVisibility(value: unknown): Record<Side, boolean> {
  if (!isObject(value)) return defaultVisibility
  return {
    friendly: readBoolean(value.friendly, true),
    hostile: readBoolean(value.hostile, true),
    neutral: readBoolean(value.neutral, true),
  }
}

export function defaultMissionState(now = new Date().toISOString()): MissionState {
  return {
    version: MISSION_EXPORT_VERSION,
    savedAt: now,
    markers: demoMarkers,
    selectedId: demoMarkers[0]?.id ?? '',
    coordFormat: 'mgrs',
    distanceUnit: 'meters',
    altitudeUnit: 'meters',
    grid: 'auto',
    showRings: false,
    showLabels: false,
    showRef: true,
    show3D: true,
    showLine: true,
    role: 'JTAC',
    visibility: defaultVisibility,
    theme: 'day',
  }
}

export function serializeMissionState(state: Omit<MissionState, 'version' | 'savedAt'>, now = new Date().toISOString()): string {
  return JSON.stringify({ ...state, version: MISSION_EXPORT_VERSION, savedAt: now }, null, 2)
}

export function normalizeMissionState(value: unknown): MissionState | null {
  if (!isObject(value)) return null

  const markers = Array.isArray(value.markers) ? value.markers.filter(isMarker) : []
  if (markers.length === 0) return null

  const selectedId = typeof value.selectedId === 'string' && markers.some(marker => marker.id === value.selectedId)
    ? value.selectedId
    : markers[0].id

  return {
    version: MISSION_EXPORT_VERSION,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : new Date().toISOString(),
    markers,
    selectedId,
    coordFormat: readEnum(value.coordFormat, coordFormats, 'mgrs'),
    distanceUnit: readEnum(value.distanceUnit, distUnits, 'meters'),
    altitudeUnit: readEnum(value.altitudeUnit, distUnits, 'meters'),
    grid: readEnum(value.grid, gridModes, 'auto'),
    showRings: readBoolean(value.showRings, false),
    showLabels: readBoolean(value.showLabels, false),
    showRef: readBoolean(value.showRef, true),
    show3D: readBoolean(value.show3D, true),
    showLine: readBoolean(value.showLine, true),
    role: readEnum(value.role, roles, 'JTAC'),
    visibility: readVisibility(value.visibility),
    theme: readEnum(value.theme, themes, 'day'),
  }
}

export function parseMissionState(raw: string): MissionState | null {
  try {
    return normalizeMissionState(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function loadMissionState(storage: Pick<Storage, 'getItem'> = window.localStorage): MissionState | null {
  try {
    const raw = storage.getItem(MISSION_STORAGE_KEY)
    return raw ? parseMissionState(raw) : null
  } catch {
    return null
  }
}

export function saveMissionState(state: Omit<MissionState, 'version' | 'savedAt'>, storage: Pick<Storage, 'setItem'> = window.localStorage): boolean {
  try {
    storage.setItem(MISSION_STORAGE_KEY, serializeMissionState(state))
    return true
  } catch {
    return false
  }
}
