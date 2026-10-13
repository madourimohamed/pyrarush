"""Palmiers réalistes et légers, générés par script (Blender 4.5, sans interface).

    blender -b --factory-startup --python art/vegetation/build_palms.py -- [--no-render]

Produit public/models/vegetation/palm_a.glb (droit), palm_b.glb (penché), palm_c.glb (haut) et un aperçu
art/vegetation/previews/palmiers.png. Palmes = cartes à découpe (folioles en transparence, alphaMode MASK),
tronc courbé à anneaux. Textures en nuances de gris : la couleur vient du thème (matériaux `leafs` et `woodBark`,
recolorés par le composant props). Conventions de la fiche technique : mètres, Y vers le haut, origine au pied.
"""

import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "models", "vegetation"))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


# ------------------------------------------------------------------------------------------------------------------
# Textures générées (numpy) : palme (folioles sur une nervure) et écorce annelée.
# ------------------------------------------------------------------------------------------------------------------


def frond_texture(w=512, h=256):
    """Palme vue de dessus : nervure le long de x (u), folioles de part et d'autre. RGBA, gris clair."""
    rng = np.random.default_rng(3)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xx / w, (yy - h / 2) / (h / 2)  # v : -1 → 1 de part et d'autre de la nervure
    alpha = np.zeros((h, w), np.float32)
    shade = np.ones((h, w), np.float32) * 0.85
    # Nervure centrale.
    rib = np.clip(1 - np.abs(v) / (0.035 * (1.2 - u)), 0, 1) * (u < 0.98)
    alpha = np.maximum(alpha, rib)
    # Folioles : segments inclinés vers la pointe, plus courts au bout.
    count = 46
    for side in (-1, 1):
        for i in range(count):
            t0 = 0.04 + 0.93 * i / count + rng.uniform(-0.004, 0.004)
            length = (0.95 * math.sin(math.pi * min(1, t0 * 1.05)) ** 0.7 + 0.08) * rng.uniform(0.85, 1.05)
            angle = math.radians(rng.uniform(52, 62))
            # Le long de la foliole : de (t0, 0) vers (t0 + d·cos, side·d·sin) dans l'espace (u en largeur relative).
            du = math.cos(angle) * length * 0.16
            dv = math.sin(angle) * length * side
            # Distance de chaque pixel au segment.
            px, py = u - t0, v
            seg_len2 = du * du + dv * dv
            s = np.clip((px * du + py * dv) / seg_len2, 0, 1)
            dx, dy = px - s * du, (py - s * dv) * 0.16
            width = 0.012 * (1 - s) ** 0.6 + 0.0015
            d = np.sqrt(dx * dx + dy * dy)
            leaflet = np.clip(1 - (d - width) / 0.004, 0, 1)
            alpha = np.maximum(alpha, leaflet)
            shade = np.where(leaflet > 0.5, 0.78 + 0.22 * s * rng.uniform(0.8, 1.0) + 0.06 * rng.uniform(-1, 1), shade)
    rgb = np.stack([shade * 0.98, shade, shade * 0.9], axis=2)
    return np.concatenate([np.clip(rgb, 0, 1), alpha[:, :, None]], axis=2)


def bark_texture(w=128, h=256):
    """Écorce : anneaux horizontaux irréguliers (cicatrices des anciennes palmes), gris."""
    rng = np.random.default_rng(5)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    rings = 6
    wobble = 0.08 * np.sin(xx / w * math.tau * 2 + rng.uniform(0, 6)) + 0.04 * np.sin(xx / w * math.tau * 5)
    phase = (yy / h * rings + wobble) % 1.0
    ring = np.clip(1 - np.abs(phase - 0.5) / 0.12, 0, 1) ** 1.5
    fiber = 0.06 * np.sin(xx / w * math.tau * 23 + yy * 0.05) + rng.normal(0, 0.03, (h, w))
    val = 0.82 - 0.35 * ring + fiber + 0.08 * phase
    rgb = np.stack([val, val * 0.97, val * 0.92], axis=2)
    return np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1), np.float32)], axis=2)


def image_from(name, pixels):
    h, w = pixels.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.flipud(pixels).astype(np.float32).ravel())
    img.pack()
    return img


def material(name, image, cutout):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    if cutout:
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        m.blend_method = "CLIP"
        m.alpha_threshold = 0.5
        m.use_backface_culling = False
    return m


# ------------------------------------------------------------------------------------------------------------------
# Géométrie
# ------------------------------------------------------------------------------------------------------------------


def trunk(bm, height, lean, rng, uv_layer):
    """Tube courbé (base évasée), anneaux répétés tous les ~0,5 m ; renvoie la position et la direction du sommet."""
    segs, rows = 9, 18
    pts, dirs = [], []
    for r in range(rows + 1):
        t = r / rows
        # Courbe : la lean s'accentue vers le haut, avec un léger redressement au sommet.
        offset = lean * (t ** 1.6) - lean * 0.15 * (t ** 4)
        pts.append(Vector((offset.x, offset.y, height * t)))
    for r in range(rows + 1):
        a, b = pts[max(0, r - 1)], pts[min(rows, r + 1)]
        dirs.append((b - a).normalized())
    grid = []
    for r in range(rows + 1):
        t = r / rows
        radius = 0.2 + 0.07 * (1 - t) + 0.16 * max(0.0, 1 - t * 9) ** 2
        z = dirs[r]
        x = z.cross(Vector((0, 1, 0))).normalized()
        y = z.cross(x)
        ring = []
        for s in range(segs + 1):
            ang = math.tau * s / segs
            p = pts[r] + (x * math.cos(ang) + y * math.sin(ang)) * radius * rng.uniform(0.97, 1.03)
            ring.append(bm.verts.new(p))
        grid.append(ring)
    for r in range(rows):
        for s in range(segs):
            f = bm.faces.new((grid[r][s], grid[r][s + 1], grid[r + 1][s + 1], grid[r + 1][s]))
            f.material_index = 0
            v0, v1 = r / rows * height / 1.6, (r + 1) / rows * height / 1.6
            for loop, (uu, vv) in zip(f.loops, ((s / segs, v0), ((s + 1) / segs, v0), ((s + 1) / segs, v1), (s / segs, v1))):
                loop[uv_layer].uv = (uu, vv)
    return pts[-1], dirs[-1]


def frond(bm, base, yaw, pitch, length, width, droop, uv_layer):
    """Palme : bande arquée (monte puis retombe), pliée en V le long de la nervure, UV sur la texture de palme."""
    rows = 9
    grid = []
    rot = Matrix.Rotation(yaw, 3, "Z")
    for r in range(rows + 1):
        t = r / rows
        # Profil : direction initiale `pitch`, la gravité courbe vers le bas.
        along = length * t
        x = along * math.cos(pitch)
        z = along * math.sin(pitch) - droop * length * t * t
        half = width / 2 * (math.sin(math.pi * min(1, t * 1.1)) ** 0.6 * 0.9 + 0.1)
        row = []
        for c, side in enumerate((-1, 0, 1)):
            fold = 0.0 if side == 0 else -half * 0.25  # pli en V : bords plus bas que la nervure
            p = Vector((x, side * half, z + fold))
            row.append(bm.verts.new(base + rot @ p))
        grid.append(row)
    for r in range(rows):
        for c in range(2):
            f = bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
            f.material_index = 1
            for loop, (uu, vv) in zip(f.loops, ((r / rows, c / 2), (r / rows, (c + 1) / 2), ((r + 1) / rows, (c + 1) / 2), ((r + 1) / rows, c / 2))):
                loop[uv_layer].uv = (uu, vv)


def palm(name, height, lean_amount, fronds, seed, mats):
    rng = random.Random(seed)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    lean_dir = rng.uniform(0, math.tau)
    lean = Vector((math.cos(lean_dir), math.sin(lean_dir), 0)) * lean_amount
    top, _ = trunk(bm, height, lean, rng, uv)
    # Couronne : palmes étalées (deux étages) + quelques jeunes palmes dressées.
    for i in range(fronds):
        yaw = math.tau * i / fronds + rng.uniform(-0.15, 0.15)
        tier = i % 2
        frond(bm, top + Vector((0, 0, -0.05 * tier)), yaw, math.radians(rng.uniform(18, 34) - 14 * tier),
              rng.uniform(3.2, 4.0) * (0.9 if tier else 1.0), rng.uniform(1.3, 1.6), rng.uniform(0.55, 0.8), uv)
    for i in range(4):
        frond(bm, top, rng.uniform(0, math.tau), math.radians(rng.uniform(55, 70)), rng.uniform(1.8, 2.4), 0.9, 0.25, uv)
    # Repère Blender → glTF : Z vers le haut devient Y (fait par l'export).
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for m in mats:
        me.materials.append(m)
    return ob


def export(ob, path):
    for o in bpy.context.scene.objects:
        o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_apply=True, export_animations=False, export_cameras=False, export_lights=False,
                              export_image_format="AUTO")


def preview(objs):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1200, 600
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.7, 0.9, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = world
    # Teintes du thème pour l'aperçu (le jeu les applique par multiplication).
    for m, col in (("leafs", (0.24, 0.4, 0.12)), ("woodBark", (0.42, 0.3, 0.2))):
        mat = bpy.data.materials[m]
        mul = mat.node_tree.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        mul.inputs["B"].default_value = (*col, 1)
        tex = next(n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE")
        mat.node_tree.links.new(tex.outputs["Color"], mul.inputs["A"])
        mat.node_tree.links.new(mul.outputs["Result"], mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 4
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(50), 0, math.radians(-40))
    scene.collection.objects.link(so)
    ground = bpy.data.meshes.new("g")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
    bm.to_mesh(ground)
    g = bpy.data.objects.new("g", ground)
    gm = bpy.data.materials.new("sand")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.75, 0.5, 0.25, 1)
    ground.materials.append(gm)
    scene.collection.objects.link(g)
    for i, ob in enumerate(objs):
        ob.location.x = (i - 1) * 7
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 35
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = (0, -24, 6)
    cam.rotation_euler = (Vector((0, 0, 5)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    os.makedirs(os.path.join(HERE, "previews"), exist_ok=True)
    scene.render.filepath = os.path.join(HERE, "previews", "palmiers.png")
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bark = material("woodBark", image_from("bark", bark_texture()), False)
    leafs = material("leafs", image_from("frond", frond_texture()), True)
    os.makedirs(OUT, exist_ok=True)
    specs = (("palm_a", 8.0, 0.6, 14, 11), ("palm_b", 7.0, 2.4, 13, 23), ("palm_c", 10.5, 1.2, 15, 37))
    objs = []
    for name, height, lean, fronds, seed in specs:
        ob = palm(name, height, lean, fronds, seed, (bark, leafs))
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        print(f"[palm] {name}: {tris} triangles")
        export(ob, os.path.join(OUT, f"{name}.glb"))
        objs.append(ob)
    if "--no-render" not in ARGS:
        preview(objs)


main()
