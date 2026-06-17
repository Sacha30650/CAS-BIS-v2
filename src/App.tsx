import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

import { demoMarkers, sideColors, sideNames, sideShort, typeIcons, typeNames } from './data'
import { mapStyle } from './mapStyle'
import {
  bearing, card, decl, fmtAlt, fmtCoord, fmtDist, fmtHdg, fmtKt,
  mgrsGridFC, havM, lineFC, ringsFC, revBrg, slant, toMils,
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
  const [showRings, setShowRings] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [showRef, setShowRef] = useState(true)
  const [show3D, setShow3D] = useState(true)
  const [showLine, setShowLine] = useState(true)
  const [role, setRole] = useState<Role>('JTAC')
  const [vis, setVis] = useState<Record<Side, boolean>>({ friendly: true, hostile: true, neutral: true })
  const [theme, setTheme] = useState<Theme>('day')

  // Panel visibility — collapsed by default for minimalist view
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)
  const [hudMin, setHudMin] = useState(true)

  // Derived
  const selM = useMemo(() => markers.find(m => m.id === sel) ?? null, [sel, markers])
  const selPt = useMemo<LatLng | null>(() => (selM ? { lat: selM.lat, lng: selM.lng } : click), [click, selM])
  const counts = useMemo(() => markers.reduce((a, m) => { a[m.side]++; return a }, { friendly: 0, hostile: 0, neutral: 0 }), [markers])
  const ip = useMemo(() => markers.find(m => m.type === 'ip' && m.side === 'friendly') ?? null, [markers])
  const tgt = useMemo(() => markers.find(m => m.type === 'target') ?? null, [markers])
  const dec = useMemo(() => decl(view.lat, view.lng), [view.lat, view.lng])

  const ringR = useMemo(
    () => du === 'feet' ? [500, 1000, 3000, 5280, 10560].map(f => f / 3.28084) : [200, 500, 1000, 2000, 5000],
    [du],
  )

  // CAS solution
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

  // Theme application
  useEffect(() => {
    const root = document.documentElement
    Object.entries(themes[theme]).forEach(([k, v]) => root.style.setProperty(k, v))
  }, [theme])

  // Sync refs
  useEffect(() => { pActive.current = placing }, [placing])
  useEffect(() => { pSide.current = cSide }, [cSide])
  useEffect(() => { pType.current = cType }, [cType])

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
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 180 }), 'bottom-left')
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    const sync = () => {
      const c = m.getCenter()
      setView({ lat: c.lat, lng: c.lng, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() })
    }

    m.on('load', () => {
      m.addSource('grid', { type: 'geojson', data: emptyFC })
      m.addLayer({ id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': 'rgba(143,255,172,0.35)', 'line-width': 0.8, 'line-opacity': 0.6 }, filter: ['==', '$type', 'LineString'] })
      m.addLayer({
        id: 'grid-labels', type: 'symbol', source: 'grid',
        filter: ['==', '$type', 'Point'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Noto Sans Bold'],
          'text-anchor': 'center',
          'text-offset': ['case', ['==', ['get', 'axis'], 'v'], ['literal', [0, 0]], ['literal', [-1.2, 0]]],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': 'rgba(143,255,172,0.85)',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 2,
        },
      })
      m.addSource('rings', { type: 'geojson', data: emptyFC })
      m.addLayer({ id: 'rings', type: 'line', source: 'rings', paint: { 'line-color': 'rgba(255,205,99,0.85)', 'line-width': 1.3, 'line-dasharray': [2, 2] } })
      m.addSource('caseline', { type: 'geojson', data: emptyFC })
      m.addLayer({ id: 'caseline', type: 'line', source: 'caseline', paint: { 'line-color': '#ff5d65', 'line-width': 2.5, 'line-dasharray': [4, 3] } })
      setReady(true)
      sync()
    })

    m.on('mousemove', e => setCur({ lat: e.lngLat.lat, lng: e.lngLat.lng }))
    m.on('move', sync)
    m.on('click', e => {
      const pt = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      setClick(pt)
      if (!pActive.current) return
      const s = pSide.current, t = pType.current
      const id = `${s}-${Date.now()}`
      const nm: TMarker = {
        id, name: `${sideShort[s]}-${String(markers.length + 1).padStart(2, '0')}`,
        side: s, type: t, lat: pt.lat, lng: pt.lng,
        altM: t === 'aircraft' ? Math.round(3000 + Math.random() * 3000) : Math.round(30 + Math.random() * 100),
        hdg: t === 'aircraft' ? Math.round(Math.random() * 360) : 0,
        spdKt: t === 'aircraft' ? Math.round(250 + Math.random() * 200) : 0,
        note: 'Ajouté manuellement — simulation', ts: new Date().toISOString(),
      }
      setMarkers(c => [...c, nm])
      setSel(id)
      setPlacing(false)
    })

    return () => {
      mkRef.current.forEach(x => x.remove())
      mkRef.current = []
      m.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // DOM markers — rebuild only when the marker set or visibility changes
  useEffect(() => {
    const m = mapRef.current
    if (!m || !ready) return
    mkRef.current.forEach(x => x.remove())
    mkRef.current = []
    mkElRef.current.clear()
    markers.filter(x => vis[x.side]).forEach(x => {
      const col = sideColors[x.side]
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `mk ${x.side}${sel === x.id ? ' on' : ''}${showLabels ? '' : ' nl'}`
      el.innerHTML = `<span class="ms" style="border-color:${col};color:${col}">${typeIcons[x.type]}</span><span class="mk-lbl">${x.name}</span>`
      el.title = `${sideNames[x.side]} · ${x.name}`
      el.setAttribute('aria-label', `${sideNames[x.side]} ${x.name} ${typeNames[x.type]}`)
      el.addEventListener('click', ev => { ev.stopPropagation(); setSel(x.id); setClick({ lat: x.lat, lng: x.lng }) })
      mkElRef.current.set(x.id, el)
      mkRef.current.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([x.lng, x.lat]).addTo(m))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markers, vis, showLabels])

  // Selection highlight — toggle class only, no rebuild
  useEffect(() => {
    mkElRef.current.forEach((el, id) => el.classList.toggle('on', id === sel))
  }, [sel])

  // Grid
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const src = m.getSource('grid') as GeoJSONSource | undefined; if (!src) return
    src.setData(mgrsGridFC(m.getBounds(), m.getZoom(), grid))
    const vis = grid === 'off' ? 'none' : 'visible'
    m.setLayoutProperty('grid', 'visibility', vis)
    m.setLayoutProperty('grid-labels', 'visibility', vis)
  }, [grid, ready, view.lat, view.lng, view.zoom])

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
    m.setPaintProperty('ref-labels', 'raster-opacity', showRef ? 0.5 : 0)
  }, [ready, showRef])

  // 3D
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    m.setPitch(show3D ? 45 : 0)
  }, [ready, show3D])

  // Actions
  const focus = (x: TMarker) => {
    setSel(x.id); setClick({ lat: x.lat, lng: x.lng })
    mapRef.current?.flyTo({ center: [x.lng, x.lat], zoom: Math.max(mapRef.current.getZoom(), 14), speed: 0.8 })
  }
  const del = (id: string) => {
    setMarkers(c => c.filter(m => m.id !== id))
    setSel(cur => cur === id ? (markers[0]?.id ?? '') : cur)
  }
  const reset = () => { setMarkers(demoMarkers); setSel(demoMarkers[0].id); setClick(null) }

  const sd = selPt ? havM({ lat: view.lat, lng: view.lng }, selPt) : null
  const sb = selPt ? bearing({ lat: view.lat, lng: view.lng }, selPt) : null

  const coordOpts: { v: CoordFormat; l: string }[] = [
    { v: 'mgrs', l: 'MGRS 10-digit' }, { v: 'utm', l: 'UTM WGS84' }, { v: 'dms', l: 'DMS' }, { v: 'dd', l: 'Décimal' },
  ]
  const types = Object.entries(typeNames)

  return (
    <div className={`app${placing ? ' placing' : ''}${showLeft ? ' L-open' : ''}${showRight ? ' R-open' : ''}`}>
      <div className="mapwrap">
        <div ref={divRef} className="map" />
        <div className="reticle" />
        {placing && <div className="banner">● {sideNames[cSide]} — {typeNames[cType]} — TAP MAP</div>}
      </div>

      {/* TOP HUD — minimaliste, toujours visible */}
      <div className={`hud-top${hudMin ? ' min' : ''}`}>
        <button className="hud-btn" aria-label="Outils" onClick={() => { setShowLeft(v => !v); setShowRight(false) }}>
          <span className="hud-ic">⚙</span>
        </button>
        <div className="hud-center">
          <span className="hud-title">CAS BIS</span>
          <span className="hud-coord">{fmtCoord({ lat: view.lat, lng: view.lng }, cf)}</span>
        </div>
        <button className="hud-btn" aria-label="Situation" onClick={() => { setShowRight(v => !v); setShowLeft(false) }}>
          <span className="hud-ic">◉</span>
          {counts.hostile > 0 && <span className="hud-badge">{counts.friendly + counts.hostile + counts.neutral}</span>}
        </button>
      </div>

      {/* LEFT PANEL — Outils */}
      {showLeft && (
        <div className="panel-overlay" onClick={() => setShowLeft(false)}>
          <div className="panel L" onClick={e => e.stopPropagation()}>
            <div className="panel-bar">
              <span className="tag">CAS BIS — Outils</span>
              <button className="close-btn" onClick={() => setShowLeft(false)}>✕</button>
            </div>

            <div className="blk">
              <div className="lab">Ajouter un marqueur</div>
              <div className="r3">
                {(['friendly','hostile','neutral'] as Side[]).map(s => (
                  <button key={s} className={`b ${cSide === s ? 'a ' + s : ''}`} onClick={() => setCSide(s)}>{sideNames[s]}</button>
                ))}
              </div>
              <select className="dd" value={cType} onChange={e => setCType(e.target.value as MarkerType)}>
                {types.map(([k,v]) => <option key={k} value={k}>{typeIcons[k]} {v}</option>)}
              </select>
              <button className="go" onClick={() => { setPlacing(v => !v); setShowLeft(false) }}>{placing ? '✕ Annuler' : '+ Placer'}</button>
            </div>

            <div className="blk g2">
              <label className="lab">Coordonnées
                <select className="dd" value={cf} onChange={e => setCF(e.target.value as CoordFormat)}>
                  {coordOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </label>
              <label className="lab">Unités
                <select className="dd" value={du} onChange={e => setDU(e.target.value as DistUnit)}>
                  <option value="meters">Mètres</option><option value="feet">Pieds</option>
                </select>
              </label>
              <label className="lab">Grille
                <select className="dd" value={grid} onChange={e => setGrid(e.target.value as GridMode)}>
                  <option value="auto">Auto</option><option value="fine">Fine</option><option value="off">Off</option>
                </select>
              </label>
              <label className="lab">Rôle
                <select className="dd" value={role} onChange={e => setRole(e.target.value as Role)}>
                  <option value="JTAC">JTAC</option><option value="Pilot">Pilote</option><option value="Observer">Observateur</option>
                </select>
              </label>
            </div>

            <div className="tg">
              <label><input type="checkbox" checked={showRings} onChange={e => setShowRings(e.target.checked)} /> Range rings</label>
              <label><input type="checkbox" checked={showLine} onChange={e => setShowLine(e.target.checked)} /> Ligne IP→Cible</label>
              <label><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} /> Labels</label>
              <label><input type="checkbox" checked={showRef} onChange={e => setShowRef(e.target.checked)} /> Carte labels</label>
              <label><input type="checkbox" checked={show3D} onChange={e => setShow3D(e.target.checked)} /> Relief 3D</label>
            </div>

            <div className="blk">
              <div className="lab">Thème</div>
              <div className="r4">
                {(Object.keys(themes) as Theme[]).map(t => (
                  <button key={t} className={`b th ${t}${theme === t ? ' on' : ''}`} onClick={() => setTheme(t)}>{themeNames[t]}</button>
                ))}
              </div>
            </div>

            <div className="ro">
              <div className="rc"><span>Curseur</span><code>{fmtCoord(cur, cf)}</code></div>
              <div className="rc"><span>Centre</span><code>{fmtCoord({ lat: view.lat, lng: view.lng }, cf)}</code></div>
            </div>
          </div>
        </div>
      )}

      {/* RIGHT PANEL — Situation */}
      {showRight && (
        <div className="panel-overlay" onClick={() => setShowRight(false)}>
          <div className="panel R" onClick={e => e.stopPropagation()}>
            <div className="panel-bar">
              <span className="tag">SITAC</span>
              <button className="close-btn" onClick={() => setShowRight(false)}>✕</button>
            </div>

            <div className="r3 counts">
              {(['friendly','hostile','neutral'] as Side[]).map(s => (
                <button key={s} className={`b count ${s}${vis[s] ? '' : ' dim'}`} onClick={() => setVis(c => ({ ...c, [s]: !c[s] }))}>
                  <span className="cn">{counts[s]}</span><span className="cl">{sideNames[s]}</span>
                </button>
              ))}
            </div>

            {cas && (
              <div className="cas">
                <span className="tag">CAS (IP→Cible)</span>
                <div className="cg">
                  <div><span>Dist</span><b>{fmtDist(cas.d, du)}</b></div>
                  <div><span>Slant</span><b>{fmtDist(cas.sr, du)}</b></div>
                  <div><span>Cap</span><b>{fmtHdg(cas.br)} {card(cas.br)}</b></div>
                  <div><span>Retour</span><b>{fmtHdg(cas.rev)}</b></div>
                  <div><span>Élev.</span><b>{cas.el > 0 ? '+' : ''}{cas.el.toFixed(1)}°</b></div>
                  <div><span>Mils</span><b>{cas.mils}</b></div>
                </div>
              </div>
            )}

            <div className="sd-card">
              <span className="tag">Sélection</span>
              <b className="sname">{selM?.name ?? '—'}</b>
              {selM && <small className="scat">{typeNames[selM.type]} · {sideNames[selM.side]}</small>}
              <code className="scoord">{fmtCoord(selPt, cf)}</code>
              {selM && (
                <div className="sm">
                  <span>{fmtAlt(selM.altM, du)}</span>
                  {selM.spdKt > 0 && <span>{fmtKt(selM.spdKt)}</span>}
                </div>
              )}
              {sd !== null && sb !== null && <div className="sm"><span>{fmtDist(sd, du)}</span><span>BRG {fmtHdg(sb)}</span></div>}
              {selM && <button className="del" onClick={() => del(selM.id)}>✕ Supprimer</button>}
            </div>

            <div className="ml">
              {markers.map(m => (
                <button key={m.id} className={`mc ${m.side}${sel === m.id ? ' act' : ''}`} onClick={() => { focus(m); setShowRight(false) }}>
                  <span className="mi" style={{ borderColor: sideColors[m.side], color: sideColors[m.side] }}>{typeIcons[m.type]}</span>
                  <span className="mif"><b>{m.name}</b><small>{typeNames[m.type]} · {fmtAlt(m.altM, du)}</small></span>
                </button>
              ))}
            </div>

            <button className="gh" style={{ marginTop: 8 }} onClick={reset}>↺ Reset situation</button>
          </div>
        </div>
      )}

      {/* STATUS BAR — compact */}
      <div className="sbar">
        <span>Z{view.zoom.toFixed(1)}</span>
        <span>{Math.round(view.bearing)}°</span>
        <span>{dec > 0 ? '+' : ''}{dec.toFixed(1)}°</span>
        <span>{role}</span>
        {cas && <span className="sbar-cas">{fmtDist(cas.d, du)}</span>}
      </div>
    </div>
  )
}

export default App
