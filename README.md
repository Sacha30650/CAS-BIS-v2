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
npm run build
```

## Déploiement

https://vercel.com/new/clone?repository-url=https://github.com/Sacha30650/CAS-BIS-v2
