# Référence niveau 1 — sable

Date : 2026-10-13T21:18:07.808Z · graine 20261011 · rendu logiciel (SwiftShader)

| Profil | Vue | Appels de dessin | Triangles | Géométries | Textures | Shaders | i/s* | GPU ms* |
|---|---|---|---|---|---|---|---|---|
| desktop | menu | 151 | 507 k | 95 | 44 | 46 | 1 | 2581.65 |
| desktop | play | 151 | 506 k | 94 | 49 | 45 | 1 | 2112.38 |
| desktop | door | 151 | 506 k | 94 | 49 | 45 | 0 | 2036.09 |
| desktop | terrace | 151 | 506 k | 94 | 49 | 45 | 0 | 2202.15 |
| desktop | aerial | 154 | 506 k | 96 | 49 | 47 | 1 | 2484.17 |
| mobile | menu | 152 | 259 k | 94 | 44 | 46 | 1 | 1505.99 |
| mobile | play | 151 | 259 k | 93 | 49 | 45 | 1 | 1241.85 |
| mobile | door | 151 | 259 k | 93 | 49 | 45 | 1 | 1264.48 |
| mobile | terrace | 151 | 259 k | 93 | 49 | 45 | 0 | 1385.31 |
| mobile | aerial | 154 | 259 k | 95 | 49 | 47 | 1 | 1434.66 |

\* fluidité et temps GPU non significatifs en rendu logiciel : à mesurer sur appareils réels avec `?stats=1`.

**desktop** — chargement jusqu'à l'accueil : 553 ms · lancement du niveau : 170 ms · téléchargé : 3.46 Mo (accueil), 3.46 Mo (total) · erreurs : 1

**mobile** — chargement jusqu'à l'accueil : 417 ms · lancement du niveau : 144 ms · téléchargé : 2.86 Mo (accueil), 2.86 Mo (total) · erreurs : 1

Build de production (Ko) : woff2 42 · js 868 · css 37 · png 34 · svg 1 · html 19 · webmanifest 1 · txt 2 · glb 1573 · jpg 1417
