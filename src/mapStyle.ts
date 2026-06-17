// CAS BIS — Map style (satellite + terrain)

import type { StyleSpecification } from 'maplibre-gl'

export const mapStyle: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© Esri',
    },
    ref: {
      type: 'raster',
      tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Labels © Esri',
    },
    dem: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 15,
    },
  },
  layers: [
    {
      id: 'sat-base', type: 'raster', source: 'sat',
      paint: { 'raster-brightness-min': 0.05, 'raster-brightness-max': 0.72, 'raster-contrast': 0.14, 'raster-saturation': -0.1 },
    },
    {
      id: 'ref-labels', type: 'raster', source: 'ref',
      paint: { 'raster-opacity': 0.5 },
    },
  ],
  terrain: { source: 'dem', exaggeration: 1.2 },
}
