# Référence niveau 1 — fusion-blocs

Date : 2026-10-11T20:08:50.670Z · graine 20261011 · rendu logiciel (SwiftShader)

| Profil | Vue | Appels de dessin | Triangles | Géométries | Textures | Shaders | i/s* | GPU ms* |
|---|---|---|---|---|---|---|---|---|
| desktop | menu | 143 | 129 k | 84 | 25 | 26 | 1 | 1228.14 |
| desktop | play | 165 | 134 k | 88 | 27 | 27 | 1 | 1161.20 |
| desktop | door | 165 | 134 k | 88 | 27 | 27 | 1 | 1140.70 |
| desktop | terrace | 165 | 134 k | 88 | 27 | 27 | 1 | 1165.48 |
| desktop | aerial | 168 | 134 k | 90 | 27 | 28 | 1 | 1134.42 |
| mobile | menu | 145 | 104 k | 84 | 25 | 26 | 1 | 737.49 |
| mobile | play | 165 | 111 k | 88 | 27 | 27 | 2 | 740.90 |
| mobile | door | 165 | 111 k | 88 | 27 | 27 | 1 | 704.48 |
| mobile | terrace | 165 | 111 k | 88 | 27 | 27 | 1 | 721.69 |
| mobile | aerial | 168 | 111 k | 90 | 27 | 28 | 2 | 727.05 |

\* fluidité et temps GPU non significatifs en rendu logiciel : à mesurer sur appareils réels avec `?stats=1`.

**desktop** — chargement jusqu'à l'accueil : 558 ms · lancement du niveau : 509 ms · téléchargé : 0.93 Mo (accueil), 0.93 Mo (total) · erreurs : 0

**mobile** — chargement jusqu'à l'accueil : 475 ms · lancement du niveau : 178 ms · téléchargé : 0.94 Mo (accueil), 0.94 Mo (total) · erreurs : 0

Build de production (Ko) : woff2 42 · css 18 · js 760 · png 34 · svg 1 · html 10 · webmanifest 1 · txt 1 · glb 354
