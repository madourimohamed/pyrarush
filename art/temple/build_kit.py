"""Kit de maçonnerie « temple » : blocs de pierre taillée et usée, construits entièrement par script.

Usage (Blender 4.5, sans interface) :
    blender -b --factory-startup --python art/temple/build_kit.py -- [--no-render]

Produit :
    public/models/temple/block_<variante>.glb      bloc détaillé (biseau arrondi, surface irrégulière, éclats)
    public/models/temple/block_<variante>_lo.glb   même bloc simplifié (profil « qualité réduite », téléphones)
et, à côté de ce script :
    temple_kit.blend    fichier source Blender
    previews/mur.png    aperçu d'un pan de mur assemblé (Cycles)

Les blocs sont posés par le composant de décor `masonry` (src/client/scene/components/masonry.ts) sur les parois
de la pyramide : instanciés (un appel de dessin par variante), recolorés par le thème (matériau `stone`), de largeur
ajustée à la paroi. Le relief et l'usure sont dans la géométrie et dans les couleurs des sommets (COLOR_0) :
arêtes éclaircies (usure), creux assombris (occlusion précalculée), marbrures du grès. Aucune texture à télécharger.

Conventions (ART_DIRECTION.md § 7.3) : mètres, origine au centre de la base, face visible vers -Y dans Blender
(= +Z après l'export glTF, Y vers le haut). Faces arrière et dessous supprimées (toujours cachées dans la paroi).
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "models", "temple"))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

# Dimensions nominales (m) : une assise de 0,75 m (4 par étage de 3 m), 0,36 m de profondeur.
HEIGHT = 0.75
DEPTH = 0.36
# Variantes : (nom, largeur, graine). Plusieurs formes par largeur pour casser la répétition.
VARIANTS = [
    ("a", 0.9, 11),
    ("b", 1.2, 23),
    ("c", 1.2, 37),
    ("d", 1.5, 41),
    ("e", 1.5, 59),
    ("f", 1.9, 67),
]
# Détail : taille visée d'une subdivision (m), largeur et segments du biseau.
DETAIL = {"hi": (0.22, 0.035, 2), "lo": (None, 0.035, 1)}

SANDSTONE = 0xD4924C


def srgb(hex_color):
    c = [((hex_color >> s) & 0xFF) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def stone_material():
    m = bpy.data.materials.get("stone")
    if m:
        return m
    m = bpy.data.materials.new("stone")
    m.use_nodes = True
    nodes = m.node_tree.nodes
    p = nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = srgb(SANDSTONE)
    p.inputs["Roughness"].default_value = 0.9
    # Couleurs des sommets × couleur de base (comme dans le jeu : material.color × COLOR_0).
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["A"].default_value = srgb(SANDSTONE)
    m.node_tree.links.new(attr.outputs["Color"], mix.inputs["B"])
    m.node_tree.links.new(mix.outputs["Result"], p.inputs["Base Color"])
    return m


def subdivide_axis(bm, axis, size, step):
    """Coupe les arêtes parallèles à un axe pour obtenir des segments d'environ `step` mètres."""
    cuts = max(0, round(size / step) - 1)
    if not cuts:
        return
    edges = [e for e in bm.edges if abs((e.verts[1].co - e.verts[0].co).normalized()[axis]) > 0.99]
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)


def build_block(name, width, seed, quality):
    rng = random.Random(seed)
    step, bevel_width, segments = DETAIL[quality]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * width, v.co.y * DEPTH, (v.co.z + 0.5) * HEIGHT))
    if step:
        subdivide_axis(bm, 0, width, step)
        subdivide_axis(bm, 2, HEIGHT, step)
        subdivide_axis(bm, 1, DEPTH, step * 1.5)

    # Biseau sur toutes les arêtes vives (entre deux faces à angle droit).
    bm.normal_update()
    sharp = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.5]
    bmesh.ops.bevel(bm, geom=sharp, offset=bevel_width, offset_type="OFFSET", segments=segments, profile=0.7,
                    affect="EDGES", clamp_overlap=True)
    bm.normal_update()

    # Surface irrégulière : bosses douces et léger bombement de la face avant (ondulation des arêtes comprise).
    off = Vector((seed * 1.37, seed * 0.71, seed * 2.13))
    amp = 0.011 if step else 0.005
    for v in bm.verts:
        n = noise.noise(v.co * 3.2 + off) * amp + noise.noise(v.co * 9.0 + off) * amp * 0.35
        v.co += v.normal * n
    # Éclats : un ou deux coins et un bout d'arête enfoncés.
    corners = [Vector((sx * width / 2, -DEPTH / 2, z)) for sx in (-1, 1) for z in (0, HEIGHT)]
    for corner in rng.sample(corners, rng.choice([1, 2])):
        radius = rng.uniform(0.08, 0.16)
        for v in bm.verts:
            d = (v.co - corner).length
            if d < radius:
                v.co += (Vector((0, 0, HEIGHT / 2)) - corner).normalized() * (radius - d) * 0.45
    bm.normal_update()

    # Faces arrière et dessous : toujours cachées dans la paroi.
    hidden = [f for f in bm.faces if f.normal.y > 0.9 and f.calc_center_median().y > DEPTH / 2 - 0.05
              or f.normal.z < -0.9 and f.calc_center_median().z < 0.05]
    bmesh.ops.delete(bm, geom=hidden, context="FACES")
    bm.normal_update()

    # Couleurs des sommets : usure des arêtes (convexe = plus clair), creux (concave = plus sombre), marbrures.
    color = bm.loops.layers.color.new("Col")
    shade = {}
    for v in bm.verts:
        neighbours = [e.other_vert(v).co - v.co for e in v.link_edges]
        curvature = sum(d.normalized().dot(v.normal) for d in neighbours if d.length > 1e-6) / max(1, len(neighbours))
        mottle = noise.noise(v.co * 1.6 + off * 0.5) * 0.13 + noise.noise(v.co * 6.0 + off) * 0.06
        # Les arêtes (pointes du biseau) : normale qui s'écarte des axes principaux.
        edge = 1 - max(abs(v.normal.x), abs(v.normal.y), abs(v.normal.z))
        value = 0.9 + mottle - curvature * 1.1 + edge * 0.45
        shade[v] = max(0.55, min(1.12, value))
    for f in bm.faces:
        for loop in f.loops:
            s = shade[loop.vert]
            # Légère dominante chaude dans les zones claires, froide dans les creux.
            loop[color] = (min(1.0, s * 1.02), min(1.0, s), min(1.0, s * 0.97), 1.0)

    # UV en projection cubique, 1 unité = 1 m (texture de grain répétée par le jeu).
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            p = loop.vert.co
            loop[uv].uv = (p.x, p.z) if axis == 1 else (p.y, p.z) if axis == 0 else (p.x, p.y)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(stone_material())
    for poly in mesh.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def export(ob):
    os.makedirs(OUT, exist_ok=True)
    for other in bpy.context.scene.objects:
        other.select_set(other == ob)
    bpy.context.view_layer.objects.active = ob
    loc = ob.location.copy()
    ob.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, ob.name + ".glb"), export_format="GLB", use_selection=True, export_yup=True,
        export_apply=True, export_vertex_color="ACTIVE", export_normals=True, export_texcoords=True,
        export_materials="EXPORT", export_extras=False, export_cameras=False, export_lights=False,
        export_animations=False,
    )
    ob.location = loc
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f"  {ob.name}: {tris} triangles")


def preview(blocks):
    """Pan de mur assemblé (4 assises, joints décalés) éclairé par un soleil rasant : contrôle visuel du kit."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("ciel")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.35, 0.5, 0.8, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    scene.world = world
    rng = random.Random(5)
    wall = bpy.data.collections.new("mur")
    scene.collection.children.link(wall)
    length = 7.0
    for course in range(4):
        x = -length / 2 - (0.45 if course % 2 else 0)
        while x < length / 2:
            src = rng.choice(blocks)
            ob = src.copy()
            ob.hide_render = False
            wall.objects.link(ob)
            w = src.dimensions.x
            ob.location = (x + w / 2 + 0.01, 0, course * HEIGHT)
            x += w + 0.015
    ground = bpy.data.meshes.new("sol")
    gbm = bmesh.new()
    bmesh.ops.create_grid(gbm, x_segments=1, y_segments=1, size=8)
    gbm.to_mesh(ground)
    gbm.free()
    gob = bpy.data.objects.new("sol", ground)
    gob.location = (0, -4, 0)
    scene.collection.objects.link(gob)
    sun = bpy.data.lights.new("soleil", "SUN")
    sun.energy = 4.5
    sun.color = (1.0, 0.82, 0.6)
    sun.angle = math.radians(2)
    sob = bpy.data.objects.new("soleil", sun)
    sob.rotation_euler = (math.radians(62), 0, math.radians(-38))
    scene.collection.objects.link(sob)
    cam = bpy.data.cameras.new("camera")
    cam.lens = 40
    cob = bpy.data.objects.new("camera", cam)
    cob.location = (2.2, -7.5, 2.4)
    cob.rotation_euler = (math.radians(82), 0, math.radians(14))
    scene.collection.objects.link(cob)
    scene.camera = cob
    os.makedirs(os.path.join(HERE, "previews"), exist_ok=True)
    scene.render.filepath = os.path.join(HERE, "previews", "mur.png")
    bpy.ops.render.render(write_still=True)


def main():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    hi = []
    print("Kit temple :")
    for name, width, seed in VARIANTS:
        for quality in ("hi", "lo"):
            ob = build_block(f"block_{name}" + ("" if quality == "hi" else "_lo"), width, seed, quality)
            export(ob)
            if quality == "hi":
                hi.append(ob)
            else:
                ob.hide_render = True
    # Les blocs sources sont rangés hors champ ; l'aperçu en pose des copies.
    for i, ob in enumerate(bpy.context.scene.objects):
        ob.location = (i * 3, 20, 0)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "temple_kit.blend"))
    if "--no-render" not in ARGS:
        for ob in hi:
            ob.hide_render = True
        preview(hi)


main()
