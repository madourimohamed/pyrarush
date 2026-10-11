# Référence niveau 1 — avant

Date : 2026-10-11T19:04:31.732Z · graine 20261011 · rendu logiciel (SwiftShader)

| Profil | Vue | Appels de dessin | Triangles | Géométries | Textures | Shaders | i/s* | GPU ms* |
|---|---|---|---|---|---|---|---|---|
| desktop | menu | 535 | 126 k | 114 | 25 | 26 | 2 | 594.53 |
| desktop | play | 537 | 134 k | 118 | 27 | 27 | 2 | 600.53 |
| desktop | door | 543 | 134 k | 118 | 27 | 27 | 2 | 596.51 |
| desktop | terrace | 555 | 134 k | 118 | 27 | 27 | 1 | 613.66 |
| desktop | aerial | 558 | 134 k | 120 | 27 | 28 | 2 | 603.88 |
| mobile | menu | 547 | 103 k | 115 | 25 | 26 | 3 | 408.16 |
| mobile | play | 537 | 111 k | 118 | 27 | 27 | 3 | 433.49 |
| mobile | door | 549 | 111 k | 118 | 27 | 27 | 2 | 397.93 |
| mobile | terrace | 555 | 111 k | 118 | 27 | 27 | 3 | 401.51 |
| mobile | aerial | 558 | 111 k | 120 | 27 | 28 | 2 | 416.01 |

\* fluidité et temps GPU non significatifs en rendu logiciel : à mesurer sur appareils réels avec `?stats=1`.

**desktop** — chargement jusqu'à l'accueil : 384 ms · lancement du niveau : 111 ms · téléchargé : 0.93 Mo (accueil), 0.93 Mo (total) · erreurs : 0

**mobile** — chargement jusqu'à l'accueil : 342 ms · lancement du niveau : 82 ms · téléchargé : 0.94 Mo (accueil), 0.94 Mo (total) · erreurs : 0

Build de production (Ko) : woff2 42 · css 16 · js 759 · html 9 · txt 1 · glb 354
