"""Prépare un panorama 360° (équirectangulaire, rapport 2:1) pour le jeu.

    blender -b --factory-startup --python art/panoramas/prepare_panorama.py -- <image source> <nom>

Produit public/textures/panoramas/<nom>.jpg (2048 × 1024, ordinateur) et <nom>-mobile.jpg (1536 × 768).
Vérifie le raccord entre les bords gauche et droit (l'image fait le tour complet de la scène).
"""

import os
import sys

import numpy as np
import OpenImageIO as oiio

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "textures", "panoramas"))
source, name = sys.argv[sys.argv.index("--") + 1:][:2]
os.makedirs(OUT, exist_ok=True)

src = oiio.ImageBuf(source)
spec = src.spec()
px = src.get_pixels(oiio.FLOAT)[:, :, :3]
seam = float(np.abs(px[:, 0] - px[:, -1]).mean())
inner = float(np.abs(px[:, 0] - px[:, 1]).mean())
print(f"source {spec.width}x{spec.height}, rapport {spec.width / spec.height:.3f}, "
      f"écart au raccord {seam:.4f} (entre colonnes voisines : {inner:.4f})")

# Raccord : on fond les couleurs des deux bords vers leur moyenne, en s'atténuant sur SEAM colonnes.
SEAM = 40
mean = (px[:, 0] + px[:, -1]) / 2
left, right = mean - px[:, 0], mean - px[:, -1]
for k in range(SEAM):
    w = 1 - k / SEAM
    px[:, k] += left * w
    px[:, -1 - k] += right * w
src = oiio.ImageBuf(oiio.ImageSpec(spec.width, spec.height, 3, oiio.FLOAT))
src.set_pixels(oiio.ROI(0, spec.width, 0, spec.height, 0, 1, 0, 3), np.clip(px, 0, 1).astype(np.float32))

# Soleil : point le plus lumineux de la moitié haute (u : 0 = bord gauche ; v : 0 = zénith).
lum = px[: spec.height // 2] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
y, x = np.unravel_index(np.argmax(lum), lum.shape)
print(f"soleil vers u = {x / spec.width:.3f}, v = {y / spec.height:.3f} (hauteur {90 - 180 * y / spec.height:.1f}°)")

for width, suffix, quality in ((2048, "", 90), (1536, "-mobile", 85)):
    dst = oiio.ImageBufAlgo.resize(src, filtername="lanczos3", roi=oiio.ROI(0, width, 0, width // 2, 0, 1, 0, 3))
    dst.specmod().attribute("Compression", f"jpeg:{quality}")
    dst.write(os.path.join(OUT, f"{name}{suffix}.jpg"))
print("ok", OUT)
