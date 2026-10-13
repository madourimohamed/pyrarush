"""Textures de détail du sable, préparées à partir de « Aerial Beach 01 » (Poly Haven, CC0, 30 × 30 m).

    blender -b --factory-startup --python art/textures/prepare_sand.py -- <diffuse.jpg> <normal_gl.jpg>

Produit dans public/textures/sand/ (ordinateur 1024 px, mobile 512 px) :
    ripples.jpg / ripples-mobile.jpg            nuances de gris (moyenne 0,8) : la couleur vient du thème
    ripples-normal.jpg / ripples-normal-mobile.jpg   relief des rides (convention OpenGL, comme Three.js)
"""

import os
import sys

import numpy as np
import OpenImageIO as oiio

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "textures", "sand"))
diffuse, normal = sys.argv[sys.argv.index("--") + 1:][:2]
os.makedirs(OUT, exist_ok=True)


def resized(path, size):
    src = oiio.ImageBuf(path)
    dst = oiio.ImageBufAlgo.resize(src, roi=oiio.ROI(0, size, 0, size, 0, 1, 0, 3))
    return dst.get_pixels(oiio.FLOAT)[:, :, :3]


def write(pixels, name):
    h, w = pixels.shape[:2]
    buf = oiio.ImageBuf(oiio.ImageSpec(w, h, 3, oiio.UINT8))
    buf.set_pixels(oiio.ROI(0, w, 0, h, 0, 1, 0, 3), np.clip(pixels, 0, 1).astype(np.float32))
    buf.specmod().attribute("Compression", "jpeg:88")
    buf.write(os.path.join(OUT, name))


for size, suffix in ((1024, ""), (512, "-mobile")):
    px = resized(diffuse, size)
    # Luminance, contraste renforcé autour de la moyenne, moyenne ramenée à 0,8 (le jeu compense).
    lum = px @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lum = (lum - lum.mean()) * 2.2 + 0.8
    write(np.repeat(lum[:, :, None], 3, axis=2), f"ripples{suffix}.jpg")
    write(resized(normal, size), f"ripples-normal{suffix}.jpg")
print("ok", OUT)
