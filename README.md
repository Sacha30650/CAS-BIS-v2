# CAS BIS v2

Application de navigation tactique Close Air Support — construite from scratch, sans template.

## Avertissement

Prototype civil d'entraînement cartographique. Aucune donnée réelle. Aucun usage opérationnel.

## Features

- Carte satellite Esri World Imagery
- Relief 3D (terrain DEM)
- SITAC : marqueurs Ami / Ennemi / Neutre
- Types : infanterie, véhicule, aéronef, objectif, checkpoint, cible, IP, danger
- Coordonnées : MGRS, UTM, DMS, décimal
- Unités : mètres / pieds
- Grille tactique auto / fine / off
- Solution CAS : distance IP→Cible, slant range, cap, élévation, mils OTAN
- Range rings, ligne IP→Cible
- Rôles : JTAC / Pilote / Observateur
- Déclinaison magnétique (approx)

## Dev

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

## Build & déploiement

- Build racine compatible Vercel / static host classique :

```bash
npm run build
```

- Build GitHub Pages, avec assets sous `/CAS-BIS-v2/` :

```bash
npm run build:pages
npx gh-pages -d dist
```

GitHub Pages est l'hébergement recommandé pour ce repo.
