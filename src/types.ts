// CAS BIS — Types

export type Side = 'friendly' | 'hostile' | 'neutral'
export type CoordFormat = 'mgrs' | 'utm' | 'dms' | 'dd'
export type DistUnit = 'meters' | 'feet'
export type GridMode = 'off' | 'auto' | 'fine'
export type Role = 'JTAC' | 'Pilot' | 'Observer'

export type MarkerType =
  | 'infantry' | 'vehicle' | 'aircraft'
  | 'objective' | 'checkpoint' | 'target'
  | 'ip' | 'danger'

export interface LatLng { lat: number; lng: number }

export interface TMarker {
  id: string
  name: string
  side: Side
  type: MarkerType
  lat: number
  lng: number
  altM: number
  hdg: number
  spdKt: number
  note: string
  ts: string
}

export interface ViewState {
  lat: number
  lng: number
  zoom: number
  bearing: number
  pitch: number
}
