// CAS BIS — Demo data (all fictional)

import type { TMarker } from './types'

const now = new Date().toISOString()

export const demoMarkers: TMarker[] = [
  { id: 'jtac-1', name: 'JTAC ALPHA', side: 'friendly', type: 'infantry', lat: 43.7598, lng: 4.4087, altM: 62, hdg: 0, spdKt: 0, note: 'JTAC au sol', ts: now },
  { id: 'hawk-1', name: 'HAWK 21', side: 'friendly', type: 'aircraft', lat: 43.8291, lng: 4.3164, altM: 4500, hdg: 215, spdKt: 320, note: 'CAP', ts: now },
  { id: 'ip-1', name: 'IP BRAVO', side: 'friendly', type: 'ip', lat: 43.8021, lng: 4.3812, altM: 48, hdg: 0, spdKt: 0, note: 'Initial Point', ts: now },
  { id: 'tgt-1', name: 'TGT VICTOR', side: 'hostile', type: 'target', lat: 43.7712, lng: 4.4523, altM: 35, hdg: 0, spdKt: 0, note: 'Objectif simulé', ts: now },
  { id: 'opfor-1', name: 'OPFOR ECHO', side: 'hostile', type: 'vehicle', lat: 43.7856, lng: 4.4698, altM: 41, hdg: 90, spdKt: 12, note: 'Véhicule adverse', ts: now },
  { id: 'cp-1', name: 'CP NEUTRAL', side: 'neutral', type: 'checkpoint', lat: 43.7643, lng: 4.3901, altM: 55, hdg: 0, spdKt: 0, note: 'Checkpoint', ts: now },
]

export const sideColors = {
  friendly: '#62a8ff',
  hostile: '#ff5d65',
  neutral: '#f1f5c5',
} as const

export const sideNames = {
  friendly: 'Ami',
  hostile: 'Ennemi',
  neutral: 'Neutre',
} as const

export const sideShort = {
  friendly: 'FRD',
  hostile: 'ENY',
  neutral: 'NEU',
} as const

export const typeIcons: Record<string, string> = {
  infantry: '⚔',
  vehicle: '⚙',
  aircraft: '✈',
  objective: '◎',
  checkpoint: '⬡',
  target: '⨯',
  ip: '▲',
  danger: '⚠',
}

export const typeNames: Record<string, string> = {
  infantry: 'Infanterie',
  vehicle: 'Véhicule',
  aircraft: 'Aérien',
  objective: 'Objectif',
  checkpoint: 'Checkpoint',
  target: 'Cible',
  ip: 'Initial Point',
  danger: 'Danger',
}
