import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

import { demoMarkers, sideColors, sideNames, sideShort, typeIcons, typeNames } from './data'
import { mapStyle } from './mapStyle'
import {
  bearing, card, decl, fmtAlt, fmtCoord, fmtDist, fmtHdg, fmtKt,
  mgrsGridFC, havM, lineFC, parseMgrsCoord, ringsFC, revBrg, slant, toMils,
} from './geo'
import { themes, themeNames, type Theme } from './themes'
import type { CoordFormat, DistUnit, GridMode, LatLng, MarkerType, Role, Side, TMarker, ViewState } from './types'

const emptyFC = { type: 'FeatureCollection' as const, features: [] }

function App() {
  // Refs
  const mapRef = useRef<maplibregl.Map | null>(null)
  const divRef = useRef<HTMLDivElement | null>(null)
  const mkRef = useRef<maplibregl.Marker[]>([])
  const mkElRef = useRef<Map<string, HTMLButtonElement>>(new Map())
  const syncFrame = useRef<number | null>(null)
  const cursorFrame = useRef<number | null>(null)
  const pendingCursor = useRef<LatLng | null>(null)
  const pActive = useRef(false)
  const pSide = useRef<Side>('friendly')
  const pType = useRef<MarkerType>('infantry')

  // State
  const [markers, setMarkers] = useState<TMarker[]>(demoMarkers)
  const [sel, setSel] = useState(demoMarkers[0].id)
  const [click, setClick] = useState<LatLng | null>(null)
  const [cur, setCur] = useState<LatLng | null>(null)
  const [view, setView] = useState<ViewState>({ lat: 43.7598, lng: 4.4087, zoom: 12.5, bearing: 0, pitch: 0 })
  const [ready, setReady] = useState(false)

  // Controls
  const [cSide, setCSide] = useState<Side>('friendly')
  const [cType, setCType] = useState<MarkerType>('infantry')
  const [placing, setPlacing] = useState(false)
  const [cf, setCF] = useState<CoordFormat>('mgrs')
  const [du, setDU] = useState<DistUnit>('meters')
  const [grid, setGrid] = useState<GridMode>('auto')
  const [showRings, setShowRings] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
  const [showRef, setShowRef] = useState(true)
  const [show3D, setShow3D] = useState(true)
  const [showLine, setShowLine] = useState(true)
  const [role, setRole] = useState<Role>('JTAC')
  const [vis, setVis] = useState<Record<Side, boolean>>({ friendly: true, hostile: true, neutral: true })
  const [theme, setTheme] = useState<Theme>('day')

  // UI density
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)
  const [hudMin, setHudMin] = useState(false)
  const [gridTick, setGridTick] = useState(0)
  const [gotoMgrs, setGotoMgrs] = useState('')
  const [gotoMsg, setGotoMsg] = useState('')
  const [editType, setEditType] = useState<MarkerType>(demoMarkers[0].type)
  const [editMgrs, setEditMgrs] = useState('')
  const [editMsg, setEditMsg] = useState('')

  // Derived
  const selM = useMemo(() => markers.find(m => m.id === sel) ?? null, [sel, markers])
  const selPt = useMemo<LatLng | null>(() => (selM ? { lat: selM.lat, lng: selM.lng } : click), [click, selM])
  const counts = useMemo(() => markers.reduce((a, m) => { a[m.side]++; return a }, { friendly: 0, hostile: 0, neutral: 0 }), [markers])
  const hiddenCount = useMemo(() => markers.filter(m => !vis[m.side]).length, [markers, vis])
  const ip = useMemo(() => markers.find(m => m.type === 'ip' && m.side === 'friendly') ?? null, [markers])
  const tgt = useMemo(() => markers.find(m => m.type === 'target') ?? null, [markers])
  const dec = useMemo(() => decl(view.lat, view.lng), [view.lat, view.lng])

  const ringR = useMemo(
    () => du === 'feet' ? [500, 1000, 3000, 5280, 10560].map(f => f / 3.28084) : [200, 500, 1000, 2000, 5000],
    [du],
  )

  // CAS solution — simulation/training only
  const cas = useMemo(() => {
    if (!ip || !tgt) return null
    const a: LatLng = { lat: ip.lat, lng: ip.lng }
    const b: LatLng = { lat: tgt.lat, lng: tgt.lng }
    const d = havM(a, b)
    const br = bearing(a, b)
    const ad = tgt.altM - ip.altM
    const sr = slant(d, ad)
    const el = d > 0 ? (Math.atan2(ad, d) * 180) / Math.PI : 0
    return { d, br, sr, el, rev: revBrg(br), mils: toMils(br) }
  }, [ip, tgt])

  const sd = selPt ? havM({ lat: view.lat, lng: view.lng }, selPt) : null
  const sb = selPt ? bearing({ lat: view.lat, lng: view.lng }, selPt) : null
  const coordOpts: { v: CoordFormat; l: string }[] = [
    { v: 'mgrs', l: 'MGRS 10-digit' }, { v: 'utm', l: 'UTM WGS84' }, { v: 'dms', l: 'DMS' }, { v: 'dd', l: 'Décimal' },
  ]
  const types = Object.entries(typeNames)

  // Theme application
  useEffect(() => {
    const root = document.documentElement
    Object.entries(themes[theme]).forEach(([k, v]) => root.style.setProperty(k, v))
  }, [theme])

  // Sync refs for map event handlers
  useEffect(() => { pActive.current = placing }, [placing])
  useEffect(() => { pSide.current = cSide }, [cSide])
  useEffect(() => { pType.current = cType }, [cType])

  useEffect(() => {
    if (!selM) {
      setEditMgrs('')
      setEditMsg('')
      return
    }
    setEditType(selM.type)
    setEditMgrs(fmtCoord({ lat: selM.lat, lng: selM.lng }, 'mgrs'))
    setEditMsg('')
  }, [selM?.id, selM?.lat, selM?.lng, selM?.type])

  // Init map (once)
  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    const m = new maplibregl.Map({
      container: divRef.current,
      style: mapStyle,
      center: [4.4087, 43.7598],
      zoom: 12.5,
      attributionControl: false,
      maxZoom: 19,
    })
    mapRef.current = m
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 160 }), 'bottom-left')
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    const resizeMap = () => {
      if (mapRef.current !== m) return
      window.requestAnimationFrame(() => m.resize())
    }

    const syncNow = () => {
      const c = m.getCenter()
      setView({ lat: c.lat, lng: c.lng, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() })
    }
    const syncThrottled = () => {
      if (syncFrame.current !== null) return
      syncFrame.current = window.requestAnimationFrame(() => {
        syncFrame.current = null
        syncNow()
      })
    }

    m.on('load', () => {
      m.addSource('grid', { type: 'geojson', data: emptyFC })
      m.addLayer({ id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': 'rgba(143,255,172,0.38)', 'line-width': 0.9, 'line-opacity': 0.65 }, filter: ['==', '$type', 'LineString'] })
      m.addLayer({
        id: 'grid-labels', type: 'symbol', source: 'grid',
        filter: ['==', '$type', 'Point'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 13,
          'text-font': ['Noto Sans Bold'],
          'text-anchor': 'center',
          'text-offset': ['case', ['==', ['get', 'axis'], 'v'], ['literal', [0, -0.65]], ['literal', [0.85, 0]]],
          'text-allow-overlap': true,
          'symbol-placement': 'point',
        },
        paint: {
          'text-color': 'rgba(185,255,202,0.98)',
          'text-halo-color': 'rgba(0,0,0,0.95)',
          'text-halo-width': 3,
        },
      })
      m.addSource('rings', { type: 'geojson', data: emptyFC })
      m.addLayer({ id: 'rings', type: 'line', source: 'rings', paint: { 'line-color': 'rgba(255,205,99,0.9)', 'line-width': 1.5, 'line-dasharray': [2, 2] } })
      m.addSource('caseline', { type: 'geojson', data: emptyFC })
      m.addLayer({ id: 'caseline', type: 'line', source: 'caseline', paint: { 'line-color': '#ff5d65', 'line-width': 2.8, 'line-dasharray': [4, 3] } })
      setReady(true)
      syncNow()
      resizeMap()
      window.setTimeout(resizeMap, 150)
      window.setTimeout(resizeMap, 600)
    })

    window.addEventListener('resize', resizeMap)
    window.addEventListener('orientationchange', resizeMap)
    window.visualViewport?.addEventListener('resize', resizeMap)

    m.on('mousemove', e => {
      pendingCursor.current = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      if (cursorFrame.current !== null) return
      cursorFrame.current = window.requestAnimationFrame(() => {
        cursorFrame.current = null
        setCur(pendingCursor.current)
      })
    })
    m.on('move', syncThrottled)
    m.on('moveend', () => { syncNow(); setGridTick(t => t + 1) })
    m.on('zoomend', () => { syncNow(); setGridTick(t => t + 1) })
    m.on('click', e => {
      const pt = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      setClick(pt)
      if (!pActive.current) return
      const s = pSide.current, t = pType.current
      const id = `${s}-${Date.now()}`
      setMarkers(c => {
        const nm: TMarker = {
          id, name: `${sideShort[s]}-${String(c.length + 1).padStart(2, '0')}`,
          side: s, type: t, lat: pt.lat, lng: pt.lng,
          altM: t === 'aircraft' ? Math.round(3000 + Math.random() * 3000) : Math.round(30 + Math.random() * 100),
          hdg: t === 'aircraft' ? Math.round(Math.random() * 360) : 0,
          spdKt: t === 'aircraft' ? Math.round(250 + Math.random() * 200) : 0,
          note: 'Ajouté manuellement — simulation', ts: new Date().toISOString(),
        }
        return [...c, nm]
      })
      setSel(id)
      setPlacing(false)
    })

    return () => {
      if (syncFrame.current !== null) window.cancelAnimationFrame(syncFrame.current)
      if (cursorFrame.current !== null) window.cancelAnimationFrame(cursorFrame.current)
      window.removeEventListener('resize', resizeMap)
      window.removeEventListener('orientationchange', resizeMap)
      window.visualViewport?.removeEventListener('resize', resizeMap)
      mkRef.current.forEach(x => x.remove())
      mkRef.current = []
      m.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // DOM markers — rebuild only when marker set, visibility or labels change
  useEffect(() => {
    const m = mapRef.current
    if (!m || !ready) return
    mkRef.current.forEach(x => x.remove())
    mkRef.current = []
    mkElRef.current.clear()

    markers.filter(x => vis[x.side]).forEach(x => {
      const col = sideColors[x.side]
      const el = document.createElement('button')
      const badge = document.createElement('span')
      const code = document.createElement('span')
      const label = document.createElement('span')

      el.type = 'button'
      el.className = `mk ${x.side}${sel === x.id ? ' on' : ''}${showLabels ? '' : ' nl'}`
      el.title = `${sideNames[x.side]} · ${x.name}`
      el.setAttribute('aria-label', `${sideNames[x.side]} ${x.name} ${typeNames[x.type]}`)
      el.style.setProperty('--mk-color', col)

      badge.className = 'ms'
      code.className = 'ms-code'
      code.textContent = typeIcons[x.type]
      badge.appendChild(code)

      label.className = 'mk-lbl'
      label.textContent = x.name

      el.appendChild(badge)
      el.appendChild(label)
      el.addEventListener('click', ev => {
        ev.stopPropagation()
        setSel(x.id)
        setClick({ lat: x.lat, lng: x.lng })
        setPlacing(false)
        setShowLeft(false)
        setShowRight(true)
      })
      mkElRef.current.set(x.id, el)
      mkRef.current.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([x.lng, x.lat]).addTo(m))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markers, vis, showLabels])

  // Selection highlight — toggle class only, no marker rebuild
  useEffect(() => {
    mkElRef.current.forEach((el, id) => el.classList.toggle('on', id === sel))
  }, [sel])

  // Grid — regenerated only on moveend/zoomend
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const src = m.getSource('grid') as GeoJSONSource | undefined; if (!src) return
    src.setData(mgrsGridFC(m.getBounds(), m.getZoom(), grid) as Parameters<GeoJSONSource['setData']>[0])
    const layerVisibility = grid === 'off' ? 'none' : 'visible'
    m.setLayoutProperty('grid', 'visibility', layerVisibility)
    m.setLayoutProperty('grid-labels', 'visibility', layerVisibility)
  }, [grid, ready, gridTick])

  // Rings
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const src = m.getSource('rings') as GeoJSONSource | undefined; if (!src) return
    src.setData(ringsFC(showRings ? selPt : null, ringR))
    m.setLayoutProperty('rings', 'visibility', showRings ? 'visible' : 'none')
  }, [ready, ringR, selPt, showRings])

  // CAS line
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const src = m.getSource('caseline') as GeoJSONSource | undefined; if (!src) return
    if (showLine && ip && tgt) {
      src.setData(lineFC({ lat: ip.lat, lng: ip.lng }, { lat: tgt.lat, lng: tgt.lng }))
      m.setLayoutProperty('caseline', 'visibility', 'visible')
    } else {
      m.setLayoutProperty('caseline', 'visibility', 'none')
    }
  }, [ready, showLine, ip, tgt])

  // Ref labels
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    m.setPaintProperty('ref-labels', 'raster-opacity', showRef ? 0.55 : 0)
  }, [ready, showRef])

  // 3D
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    m.easeTo({ pitch: show3D ? 45 : 0, duration: 450 })
  }, [ready, show3D])

  // Actions
  const flyToPoint = (pt: LatLng, zoom = 14.5) => {
    const m = mapRef.current
    if (!m) return
    m.flyTo({ center: [pt.lng, pt.lat], zoom: Math.max(m.getZoom(), zoom), speed: 0.8 })
  }
  const focus = (x: TMarker) => {
    const pt = { lat: x.lat, lng: x.lng }
    setSel(x.id)
    setClick(pt)
    flyToPoint(pt, 14)
  }
  const del = (id: string) => {
    setMarkers(c => {
      const next = c.filter(m => m.id !== id)
      setSel(cur => cur === id ? (next[0]?.id ?? '') : cur)
      return next
    })
  }
  const reset = () => { setMarkers(demoMarkers); setSel(demoMarkers[0].id); setClick(null); setGotoMsg(''); setEditMsg('') }
  const toggleLeft = () => { setShowLeft(v => !v); setShowRight(false) }
  const toggleRight = () => { setShowRight(v => !v); setShowLeft(false) }
  const togglePlace = () => { setPlacing(v => !v); setShowLeft(false); setShowRight(false) }
  const centerSelected = () => {
    if (!selPt) return
    flyToPoint(selPt, 14)
  }
  const goToMgrs = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const pt = parseMgrsCoord(gotoMgrs)
    if (!pt) {
      setGotoMsg('Coordonnée MGRS invalide. Exemple : 31T FJ 13181 46215')
      return
    }
    setGotoMsg('GO TO validé')
    setSel('')
    setClick(pt)
    setPlacing(false)
    setShowLeft(false)
    setShowRight(false)
    flyToPoint(pt, 15.5)
  }
  const applySelectedEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selM) return
    const pt = parseMgrsCoord(editMgrs)
    if (!pt) {
      setEditMsg('Coordonnée MGRS invalide. Exemple : 31T FJ 13181 46215')
      return
    }
    setMarkers(c => c.map(m => m.id === selM.id ? { ...m, type: editType, lat: pt.lat, lng: pt.lng, ts: new Date().toISOString() } : m))
    setClick(pt)
    setEditMsg('Unité mise à jour')
    flyToPoint(pt, 15)
  }
  const fitMission = () => {
    const m = mapRef.current
    if (!m || markers.length === 0) return
    const b = new maplibregl.LngLatBounds()
    markers.forEach(x => b.extend([x.lng, x.lat]))
    m.fitBounds(b, { padding: 86, maxZoom: 14, duration: 900 })
  }
  const resetNorth = () => mapRef.current?.easeTo({ bearing: 0, pitch: show3D ? 45 : 0, duration: 650 })

  return (
    <main className={`app${placing ? ' placing' : ''}${showLeft ? ' L-open' : ''}${showRight ? ' R-open' : ''}`}>
      <div className="mapwrap" aria-label="Carte tactique de simulation">
        <div ref={divRef} className="map" />
        <div className="map-vignette" />
        <div className="reticle" aria-hidden="true" />
        {placing && (
          <div className="placement-banner" role="status">
            <span>Mode placement armé</span>
            <b>{sideNames[cSide]} · {typeNames[cType]}</b>
            <small>Touchez la carte pour poser un marqueur</small>
          </div>
        )}
      </div>

      <section className={`hud-top${hudMin ? ' min' : ''}`} aria-label="Tableau de bord">
        <button type="button" className="hud-card brand-card" onClick={() => setHudMin(v => !v)} aria-label="Réduire ou étendre le HUD">
          <span className="brand-lockup">CAS BIS</span>
          <span className="brand-sub">simulation</span>
        </button>

        <div className="hud-card coord-card">
          <span className="hud-label">Centre carte</span>
          <strong>{fmtCoord({ lat: view.lat, lng: view.lng }, cf)}</strong>
          <div className="hud-metrics" aria-label="Mesures carte">
            <span>Z {view.zoom.toFixed(1)}</span>
            <span>CAP {fmtHdg(view.bearing)}</span>
            <span>DEC {dec > 0 ? '+' : ''}{dec.toFixed(1)}°</span>
          </div>
        </div>

        <button type="button" className="hud-card selection-card" onClick={centerSelected} disabled={!selPt} aria-label="Centrer la sélection">
          <span className="hud-label">Sélection</span>
          <strong>{selM?.name ?? 'Point carte'}</strong>
          <small>{sd !== null && sb !== null ? `${fmtDist(sd, du)} · ${fmtHdg(sb)} ${card(sb)}` : 'Touchez un point'}</small>
        </button>
      </section>

      <section className="mission-strip" aria-label="Résumé mission">
        <button type="button" className="mission-pill friendly" onClick={() => setVis(v => ({ ...v, friendly: !v.friendly }))} aria-pressed={vis.friendly}>
          <b>{counts.friendly}</b><span>Ami</span>
        </button>
        <button type="button" className="mission-pill hostile" onClick={() => setVis(v => ({ ...v, hostile: !v.hostile }))} aria-pressed={vis.hostile}>
          <b>{counts.hostile}</b><span>Hostile</span>
        </button>
        <button type="button" className="mission-pill neutral" onClick={() => setVis(v => ({ ...v, neutral: !v.neutral }))} aria-pressed={vis.neutral}>
          <b>{counts.neutral}</b><span>Neutre</span>
        </button>
        {cas && <button type="button" className="mission-pill cas-pill" onClick={toggleRight}><b>{fmtDist(cas.d, du)}</b><span>IP → Cible</span></button>}
      </section>

      <div className="quick-stack" aria-label="Contrôles rapides">
        <button type="button" onClick={fitMission}>Mission</button>
        <button type="button" onClick={resetNorth}>Nord</button>
      </div>

      {showLeft && (
        <div className="panel-overlay" onClick={() => setShowLeft(false)}>
          <aside className="panel L" aria-label="Navigation et outils de carte" onClick={e => e.stopPropagation()}>
            <div className="panel-bar">
              <div>
                <span className="tag">NAV</span>
                <h2>Navigation</h2>
              </div>
              <button type="button" className="close-btn" onClick={() => setShowLeft(false)} aria-label="Fermer les outils">×</button>
            </div>

            <form className="action-card goto-card" onSubmit={goToMgrs}>
              <span className="tag">GO TO MGRS</span>
              <h3>Rejoindre une coordonnée</h3>
              <p>Entrez une coordonnée MGRS complète, puis la carte se recentre dessus.</p>
              <label className="field">Coordonnée MGRS
                <input
                  className="txt-input mono"
                  value={gotoMgrs}
                  onChange={e => { setGotoMgrs(e.target.value); setGotoMsg('') }}
                  placeholder="31T FJ 13181 46215"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </label>
              <div className="inline-actions">
                <button type="submit" className="go">GO TO</button>
                <button type="button" className="soft-btn" onClick={() => setGotoMgrs(fmtCoord({ lat: view.lat, lng: view.lng }, 'mgrs'))}>Centre</button>
              </div>
              {gotoMsg && <p className={`form-msg ${gotoMsg.startsWith('Coordonnée') ? 'err' : 'ok'}`}>{gotoMsg}</p>}
            </form>

            <div className="action-card primary-card">
              <span className="tag">Insertion</span>
              <h3>{placing ? 'Placement armé' : 'Ajouter un point'}</h3>
              <p>{placing ? 'Le prochain toucher sur la carte créera un marqueur.' : 'Choisissez un camp et un type, puis posez le point sur la carte.'}</p>
              <button type="button" className={`go ${placing ? 'danger' : ''}`} onClick={togglePlace}>{placing ? 'Annuler le placement' : 'Placer sur la carte'}</button>
            </div>

            <div className="blk">
              <div className="lab">Camp</div>
              <div className="seg3">
                {(['friendly','hostile','neutral'] as Side[]).map(s => (
                  <button key={s} type="button" className={`choice ${s}${cSide === s ? ' active' : ''}`} onClick={() => setCSide(s)}>{sideNames[s]}</button>
                ))}
              </div>
              <label className="field">Type de marqueur
                <select className="dd" value={cType} onChange={e => setCType(e.target.value as MarkerType)}>
                  {types.map(([k,v]) => <option key={k} value={k}>{typeIcons[k]} · {v}</option>)}
                </select>
              </label>
            </div>

            <div className="blk grid-fields">
              <label className="field">Coordonnées
                <select className="dd" value={cf} onChange={e => setCF(e.target.value as CoordFormat)}>
                  {coordOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </label>
              <label className="field">Unités
                <select className="dd" value={du} onChange={e => setDU(e.target.value as DistUnit)}>
                  <option value="meters">Mètres</option><option value="feet">Pieds</option>
                </select>
              </label>
              <label className="field">Grille
                <select className="dd" value={grid} onChange={e => setGrid(e.target.value as GridMode)}>
                  <option value="auto">Auto</option><option value="fine">Fine</option><option value="off">Off</option>
                </select>
              </label>
              <label className="field">Rôle
                <select className="dd" value={role} onChange={e => setRole(e.target.value as Role)}>
                  <option value="JTAC">JTAC</option><option value="Pilot">Pilote</option><option value="Observer">Observateur</option>
                </select>
              </label>
            </div>

            <div className="toggle-grid" aria-label="Couches de carte">
              <label><input type="checkbox" checked={showRings} onChange={e => setShowRings(e.target.checked)} /> Range rings</label>
              <label><input type="checkbox" checked={showLine} onChange={e => setShowLine(e.target.checked)} /> Ligne IP→Cible</label>
              <label><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} /> Labels points</label>
              <label><input type="checkbox" checked={showRef} onChange={e => setShowRef(e.target.checked)} /> Labels carte</label>
              <label><input type="checkbox" checked={show3D} onChange={e => setShow3D(e.target.checked)} /> Relief 3D</label>
            </div>

            <div className="blk">
              <div className="lab">Ambiance carte</div>
              <div className="theme-row">
                {(Object.keys(themes) as Theme[]).map(t => (
                  <button key={t} type="button" className={`theme-chip ${t}${theme === t ? ' active' : ''}`} onClick={() => setTheme(t)}>{themeNames[t]}</button>
                ))}
              </div>
            </div>

            <div className="readout-grid">
              <div className="readout"><span>Curseur</span><code>{fmtCoord(cur, cf)}</code></div>
              <div className="readout"><span>Centre</span><code>{fmtCoord({ lat: view.lat, lng: view.lng }, cf)}</code></div>
            </div>
          </aside>
        </div>
      )}

      {showRight && (
        <div className="panel-overlay" onClick={() => setShowRight(false)}>
          <aside className="panel R" aria-label="Situation tactique" onClick={e => e.stopPropagation()}>
            <div className="panel-bar">
              <div>
                <span className="tag">SITAC</span>
                <h2>Situation</h2>
              </div>
              <button type="button" className="close-btn" onClick={() => setShowRight(false)} aria-label="Fermer la situation">×</button>
            </div>

            <div className="seg3 counts">
              {(['friendly','hostile','neutral'] as Side[]).map(s => (
                <button key={s} type="button" className={`count-card ${s}${vis[s] ? '' : ' dim'}`} onClick={() => setVis(c => ({ ...c, [s]: !c[s] }))} aria-pressed={vis[s]}>
                  <span>{counts[s]}</span><b>{sideNames[s]}</b>
                </button>
              ))}
            </div>
            {hiddenCount > 0 && <p className="panel-note">{hiddenCount} point(s) masqué(s) par filtre.</p>}

            {cas && (
              <div className="cas-card">
                <span className="tag">Solution simulée IP→Cible</span>
                <div className="cas-grid">
                  <div><span>Distance</span><b>{fmtDist(cas.d, du)}</b></div>
                  <div><span>Slant</span><b>{fmtDist(cas.sr, du)}</b></div>
                  <div><span>Cap</span><b>{fmtHdg(cas.br)} {card(cas.br)}</b></div>
                  <div><span>Retour</span><b>{fmtHdg(cas.rev)}</b></div>
                  <div><span>Élev.</span><b>{cas.el > 0 ? '+' : ''}{cas.el.toFixed(1)}°</b></div>
                  <div><span>Mils</span><b>{cas.mils}</b></div>
                </div>
              </div>
            )}

            <div className="selection-detail">
              <span className="tag">Sélection active</span>
              <b>{selM?.name ?? 'Aucune unité sélectionnée'}</b>
              {selM && <small>{typeNames[selM.type]} · {sideNames[selM.side]} · {fmtAlt(selM.altM, du)}</small>}
              <code>{fmtCoord(selPt, cf)}</code>
              {selM && (
                <div className="meta-row">
                  <span>{fmtAlt(selM.altM, du)}</span>
                  {selM.spdKt > 0 && <span>{fmtKt(selM.spdKt)}</span>}
                  {selM.hdg > 0 && <span>HDG {fmtHdg(selM.hdg)}</span>}
                </div>
              )}
              {sd !== null && sb !== null && <div className="meta-row"><span>{fmtDist(sd, du)}</span><span>BRG {fmtHdg(sb)}</span></div>}

              {selM && (
                <form className="unit-edit" onSubmit={applySelectedEdit}>
                  <label className="field">Nature de l'unité
                    <select className="dd" value={editType} onChange={e => { setEditType(e.target.value as MarkerType); setEditMsg('') }}>
                      {types.map(([k,v]) => <option key={k} value={k}>{typeIcons[k]} · {v}</option>)}
                    </select>
                  </label>
                  <label className="field">Coordonnée MGRS
                    <input
                      className="txt-input mono"
                      value={editMgrs}
                      onChange={e => { setEditMgrs(e.target.value); setEditMsg('') }}
                      placeholder="31T FJ 13181 46215"
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                  </label>
                  <div className="inline-actions">
                    <button type="submit" className="go">Appliquer</button>
                    <button type="button" className="soft-btn" onClick={() => setEditMgrs(fmtCoord({ lat: selM.lat, lng: selM.lng }, 'mgrs'))}>Recharger</button>
                  </div>
                  {editMsg && <p className={`form-msg ${editMsg.startsWith('Coordonnée') ? 'err' : 'ok'}`}>{editMsg}</p>}
                </form>
              )}

              <div className="detail-actions">
                <button type="button" onClick={centerSelected} disabled={!selPt}>Centrer</button>
                {selM && <button type="button" className="del" onClick={() => del(selM.id)}>Supprimer</button>}
              </div>
            </div>

            <div className="marker-list-panel" aria-label="Liste des points">
              {markers.map(m => (
                <button key={m.id} type="button" className={`marker-card ${m.side}${sel === m.id ? ' active' : ''}${vis[m.side] ? '' : ' hidden-side'}`} onClick={() => { focus(m); setShowRight(false) }}>
                  <span className="marker-token" style={{ borderColor: sideColors[m.side], color: sideColors[m.side] }}>{typeIcons[m.type]}</span>
                  <span className="marker-copy"><b>{m.name}</b><small>{typeNames[m.type]} · {fmtAlt(m.altM, du)}</small></span>
                  <span className="marker-side">{sideNames[m.side]}</span>
                </button>
              ))}
            </div>

            <button type="button" className="ghost-action" onClick={reset}>Réinitialiser la situation</button>
          </aside>
        </div>
      )}

      <div className="sbar" aria-label="État carte">
        <span>Z{view.zoom.toFixed(1)}</span>
        <span>{Math.round(view.bearing)}°</span>
        <span>{dec > 0 ? '+' : ''}{dec.toFixed(1)}°</span>
        <span>{role}</span>
        {cas && <span className="sbar-cas">{fmtDist(cas.d, du)}</span>}
      </div>

      <nav className="action-rail" aria-label="Actions principales">
        <button type="button" className={`rail-btn${showLeft ? ' active' : ''}`} onClick={toggleLeft}>
          <span>NAV</span><b>GO TO</b>
        </button>
        <button type="button" className={`rail-primary${placing ? ' armed' : ''}`} onClick={togglePlace}>
          <span>{placing ? 'Annuler' : 'Placer'}</span>
        </button>
        <button type="button" className={`rail-btn${showRight ? ' active' : ''}`} onClick={toggleRight}>
          <span>SIT</span><b>Situation</b>
        </button>
      </nav>
    </main>
  )
}

export default App
