import { describe, expect, it } from 'vitest'

import { demoMarkers } from './data'
import { defaultMissionState, parseMissionState, serializeMissionState } from './missionStorage'

describe('mission storage', () => {
  it('serializes and parses a full mission state', () => {
    const state = defaultMissionState('2026-06-26T00:00:00.000Z')
    const raw = serializeMissionState({ ...state, markers: demoMarkers.slice(0, 2), selectedId: demoMarkers[1].id })
    const parsed = parseMissionState(raw)

    expect(parsed).not.toBeNull()
    expect(parsed!.markers).toHaveLength(2)
    expect(parsed!.selectedId).toBe(demoMarkers[1].id)
    expect(parsed!.coordFormat).toBe('mgrs')
    expect(parsed!.showLine).toBe(true)
  })

  it('rejects invalid JSON and empty marker payloads', () => {
    expect(parseMissionState('not json')).toBeNull()
    expect(parseMissionState(JSON.stringify({ markers: [] }))).toBeNull()
  })

  it('falls back to a valid selected marker when the saved selection is missing', () => {
    const state = defaultMissionState('2026-06-26T00:00:00.000Z')
    const raw = serializeMissionState({ ...state, markers: demoMarkers.slice(0, 2), selectedId: 'missing' })
    const parsed = parseMissionState(raw)

    expect(parsed!.selectedId).toBe(demoMarkers[0].id)
  })
})
