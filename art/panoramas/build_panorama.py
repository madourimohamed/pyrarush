"""Panorama d'horizon d'un thème (image 360° équirectangulaire), rendu dans Blender.

    blender -b --factory-startup --python art/panoramas/build_panorama.py -- <thème> [--preview]

Produit art/panoramas/renders/<thème>.jpg (4096 × 2048) et <thème>-mobile.jpg (2048 × 1024), à copier dans
public/textures/panoramas/ si on l'adopte (prepare_panorama.py) ; --preview : rendu rapide (1024 × 512) dans
art/panoramas/previews/<thème>.jpg. Le niveau 1 utilise plutôt une image fournie (design/panoramique/), plus riche.

Le paysage est entièrement lointain (dunes, pyramides, plateaux rocheux, montagnes dans la brume, ciel physique
Nishita) : le sol proche, la pyramide et le décor restent en 3D dans le jeu. Le soleil est placé selon
`sun` (même direction que theme.sun.dir dans le jeu, repère Three.js : Y vers le haut).

Correspondance avec Three.js (scene.background en EquirectangularReflectionMapping) : le centre de l'image
regarde vers +X (Three) ; le quart droit vers +Z (Three) = -Y (Blender).
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "renders")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def srgb(hex_color):
    c = [((hex_color >> s) & 0xFF) / 255 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


# Un preset par thème : à compléter quand d'autres niveaux passeront au panorama.
PRESETS = {
    "sables": {
        "sun": (-0.62, 0.42, 0.66),  # = theme.sun.dir du niveau 1
        "sand": 0xE2A866,
        "sand_shadow": 0xB8743F,
        "pyramid": 0xD9A160,
        "rock": 0xC27B52,
        "mountain": 0xB98A74,
        "haze": (1.0, 0.80, 0.58),
        "haze_distance": 7000,
        "air": 1.0,
        "dust": 2.2,
        "seed": 7,
    },
}


def three_to_blender(v):
    x, y, z = v
    return Vector((x, -z, y))


# ------------------------------------------------------------------------------------------------------------------
# Matériaux : surface + brume de distance (perspective atmosphérique), sans volumes (rendu rapide).
# ------------------------------------------------------------------------------------------------------------------


def hazy_material(name, p, build_surface):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    surface = build_surface(nodes, links)
    cam = nodes.new("ShaderNodeCameraData")
    k = nodes.new("ShaderNodeMath")
    k.operation = "DIVIDE"
    k.inputs[1].default_value = -p["haze_distance"]
    links.new(cam.outputs["View Distance"], k.inputs[0])
    e = nodes.new("ShaderNodeMath")
    e.operation = "EXPONENT"
    links.new(k.outputs[0], e.inputs[0])
    inv = nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    links.new(e.outputs[0], inv.inputs[1])
    haze = nodes.new("ShaderNodeEmission")
    haze.inputs["Color"].default_value = (*p["haze"], 1)
    haze.inputs["Strength"].default_value = 1.0
    mix = nodes.new("ShaderNodeMixShader")
    links.new(inv.outputs[0], mix.inputs[0])
    links.new(surface, mix.inputs[1])
    links.new(haze.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def sand_surface(p):
    def build(nodes, links):
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Roughness"].default_value = 0.95
        # Couleur : clair sur les crêtes, plus soutenu dans les creux (attribut « height » du maillage).
        attr = nodes.new("ShaderNodeAttribute")
        attr.attribute_name = "height"
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = srgb(p["sand_shadow"])
        ramp.color_ramp.elements[1].color = srgb(p["sand"])
        links.new(attr.outputs["Fac"], ramp.inputs["Fac"])
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 0.004
        noise.inputs["Detail"].default_value = 6
        mul = nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 0.25
        links.new(ramp.outputs["Color"], mul.inputs["A"])
        links.new(noise.outputs["Color"], mul.inputs["B"])
        links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
        # Rides de sable (vent) en relief.
        wave = nodes.new("ShaderNodeTexWave")
        wave.inputs["Scale"].default_value = 0.08
        wave.inputs["Distortion"].default_value = 6
        wave.inputs["Detail"].default_value = 3
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.25
        links.new(wave.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        return bsdf.outputs[0]
    return build


def rock_surface(color, strata=True):
    def build(nodes, links):
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Roughness"].default_value = 0.9
        coord = nodes.new("ShaderNodeTexCoord")
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 0.02
        noise.inputs["Detail"].default_value = 8
        links.new(coord.outputs["Object"], noise.inputs["Vector"])
        ramp = nodes.new("ShaderNodeValToRGB")
        base = srgb(color)
        ramp.color_ramp.elements[0].color = tuple(c * 0.72 for c in base[:3]) + (1,)
        ramp.color_ramp.elements[1].color = tuple(min(1, c * 1.12) for c in base[:3]) + (1,)
        if strata:
            # Strates horizontales (couches de grès).
            sep = nodes.new("ShaderNodeSeparateXYZ")
            links.new(coord.outputs["Object"], sep.inputs[0])
            wave = nodes.new("ShaderNodeTexWave")
            wave.wave_type = "BANDS"
            wave.bands_direction = "Z"
            wave.inputs["Scale"].default_value = 0.012
            wave.inputs["Distortion"].default_value = 4
            links.new(coord.outputs["Object"], wave.inputs["Vector"])
            mix = nodes.new("ShaderNodeMath")
            mix.operation = "MULTIPLY_ADD"
            mix.inputs[1].default_value = 0.35
            links.new(wave.outputs["Fac"], mix.inputs[0])
            links.new(noise.outputs["Fac"], mix.inputs[2])
            links.new(mix.outputs[0], ramp.inputs["Fac"])
        else:
            links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.6
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        return bsdf.outputs[0]
    return build


# ------------------------------------------------------------------------------------------------------------------
# Géométrie
# ------------------------------------------------------------------------------------------------------------------


def mesh_object(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(material)
    return ob


def dunes(p, rng):
    """Mer de dunes : grille polaire (dense près du centre), crêtes en « abs(sin) » orientées par le vent."""
    bm = bmesh.new()
    rings, segs = 150, 360
    radius = lambda i: 1 + (i / rings) ** 2.2 * 40000  # noqa: E731
    phase = [rng.uniform(0, 6.28) for _ in range(6)]
    heights = []

    def h(x, y):
        r = math.hypot(x, y)
        a = abs(math.sin(x * 0.0021 + y * 0.0009 + phase[0] + math.sin(y * 0.0013 + phase[1]) * 1.6))
        b = abs(math.sin(x * 0.0007 - y * 0.0016 + phase[2] + math.sin(x * 0.0011 + phase[3]) * 1.2))
        c = math.sin(x * 0.006 + phase[4]) * math.sin(y * 0.0055 + phase[5])
        height = (1 - a) ** 2 * 28 + (1 - b) ** 2 * 45 + c * 4
        return height * min(1.0, max(0.0, (r - 250) / 900)) * (1.6 if 600 < r < 6000 else 1.0) - 6

    grid = []
    for i in range(rings + 1):
        r = radius(i)
        row = []
        for j in range(segs):
            t = 2 * math.pi * j / segs
            x, y = r * math.cos(t), r * math.sin(t)
            z = h(x, y)
            heights.append(z)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(rings):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]))
    ob = mesh_object("dunes", bm, hazy_material("sand", p, sand_surface(p)))
    lo, hi = min(heights), max(heights)
    attr = ob.data.attributes.new("height", "FLOAT", "POINT")
    for i, z in enumerate(heights):
        attr.data[i].value = (z - lo) / (hi - lo)
    return ob


def pyramid(center, size, height, material, rot):
    bm = bmesh.new()
    s = size / 2
    base = [bm.verts.new((center[0] + dx, center[1] + dy, center[2])) for dx, dy in ((-s, -s), (s, -s), (s, s), (-s, s))]
    apex = bm.verts.new((center[0], center[1], center[2] + height))
    for i in range(4):
        bm.faces.new((base[i], base[(i + 1) % 4], apex))
    bmesh.ops.rotate(bm, verts=bm.verts, cent=center, matrix=__import__("mathutils").Matrix.Rotation(rot, 3, "Z"))
    ob = mesh_object("pyramid", bm, material)
    ob.data.shade_flat()
    return ob


def mesa(center, radius, height, material, rng):
    """Plateau rocheux : cylindre irrégulier, flancs érodés, sommet plat."""
    bm = bmesh.new()
    segs, rows = 48, 10
    noise = [rng.uniform(0.75, 1.25) for _ in range(segs)]
    smooth = [(noise[i - 1] + noise[i] * 2 + noise[(i + 1) % segs]) / 4 for i in range(segs)]
    grid = []
    for r in range(rows + 1):
        z = height * r / rows
        flare = 1.0 + 0.6 * (1 - r / rows) ** 3
        row = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            k = radius * smooth[i] * flare * rng.uniform(0.96, 1.04)
            row.append(bm.verts.new((center[0] + k * math.cos(a), center[1] + k * math.sin(a), center[2] + z - 20)))
        grid.append(row)
    top = bm.verts.new((center[0], center[1], center[2] + height - 20))
    for r in range(rows):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((grid[r][i], grid[r][j], grid[r + 1][j], grid[r + 1][i]))
    for i in range(segs):
        bm.faces.new((grid[rows][i], grid[rows][(i + 1) % segs], top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_object("mesa", bm, material)


def mountain_ring(p, rng, material):
    """Chaîne de montagnes très lointaine, tout autour (silhouette bleutée dans la brume)."""
    bm = bmesh.new()
    segs = 720
    phases = [rng.uniform(0, 6.28) for _ in range(4)]
    inner, outer = [], []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ridge = (math.sin(a * 7 + phases[0]) * 0.5 + 0.5) * 1100 + (math.sin(a * 23 + phases[1]) * 0.5 + 0.5) * 500 \
            + abs(math.sin(a * 61 + phases[2])) * 180 + 200
        r = 16000 + math.sin(a * 5 + phases[3]) * 2000
        inner.append(bm.verts.new((r * math.cos(a), r * math.sin(a), -50)))
        outer.append(bm.verts.new(((r + 3000) * math.cos(a), (r + 3000) * math.sin(a), ridge)))
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((inner[i], inner[j], outer[j], outer[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_object("mountains", bm, material)


def clouds(p):
    """Couche de nuages (bruit découpé) à 2,5 km d'altitude : la perspective les tasse vers l'horizon."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60000)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 2500))
    m = bpy.data.materials.new("clouds")
    m.use_nodes = True
    m.blend_method = "BLEND"
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 70.0
    noise.inputs["Detail"].default_value = 10
    noise.inputs["Roughness"].default_value = 0.62
    links.new(coord.outputs["Generated"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.55
    ramp.color_ramp.elements[1].position = 0.68
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    lit = nodes.new("ShaderNodeBsdfPrincipled")
    lit.inputs["Base Color"].default_value = (1.0, 0.97, 0.94, 1)
    lit.inputs["Roughness"].default_value = 1.0
    lit.inputs["Emission Color"].default_value = (1.0, 0.82, 0.62, 1)
    lit.inputs["Emission Strength"].default_value = 0.6
    clear = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    links.new(ramp.outputs["Color"], mix.inputs[0])
    links.new(clear.outputs[0], mix.inputs[1])
    links.new(lit.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs["Surface"])
    ob = mesh_object("clouds", bm, m)
    ob.visible_shadow = False


def polar(angle_deg, dist):
    """Position au sol vue depuis le centre ; angle 0 = devant la caméra du jeu au départ (+Z Three = -Y Blender)."""
    a = math.radians(angle_deg)
    return Vector((dist * math.sin(a), -dist * math.cos(a), 0))


def build_scene(p):
    rng = random.Random(p["seed"])
    scene = bpy.context.scene

    # Ciel physique, soleil dans la direction du thème.
    sun = three_to_blender(p["sun"]).normalized()
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    sky = world.node_tree.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.asin(sun.z)
    sky.sun_rotation = math.atan2(sun.x, sun.y)
    sky.altitude = 200
    sky.air_density = p["air"]
    sky.dust_density = p["dust"]
    sky.sun_intensity = 0.5
    bg = world.node_tree.nodes["Background"]
    world.node_tree.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.55
    scene.world = world

    # Lumière du soleil (ombres des dunes et des pyramides).
    light = bpy.data.lights.new("sun", "SUN")
    light.energy = 3.0
    light.angle = math.radians(1.5)
    light.color = (1.0, 0.86, 0.68)
    sun_ob = bpy.data.objects.new("sun", light)
    sun_ob.rotation_euler = (-sun).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun_ob)

    dunes(p, rng)
    stone = hazy_material("pyramid", p, rock_surface(p["pyramid"], strata=False))
    # Groupe de trois pyramides (façon Gizeh) et deux isolées, toutes lointaines.
    for angle, dist, size, height in ((34, 1000, 290, 190), (44, 1300, 250, 160), (52, 1150, 130, 85),
                                      (-118, 1900, 260, 165), (168, 1600, 150, 95), (-40, 2600, 180, 115)):
        c = polar(angle, dist)
        c.z = -8
        pyramid(c, size, height, stone, math.radians(rng.uniform(0, 90)))
    rock = hazy_material("rock", p, rock_surface(p["rock"]))
    for _ in range(11):
        angle = rng.uniform(-180, 180)
        if 25 < angle < 65:
            angle += 60  # dégager le groupe de pyramides
        c = polar(angle, rng.uniform(2800, 6000))
        mesa(c, rng.uniform(180, 480), rng.uniform(220, 520), rock, rng)
    mountain_ring(p, rng, hazy_material("mountain", p, rock_surface(p["mountain"], strata=False)))
    clouds(p)

    # Caméra panoramique à hauteur de vue du jeu.
    cam_data = bpy.data.cameras.new("pano")
    cam_data.type = "PANO"
    cam_data.panorama_type = "EQUIRECTANGULAR"
    cam_data.clip_start, cam_data.clip_end = 1, 200000
    cam = bpy.data.objects.new("pano", cam_data)
    cam.location = (0, 0, 18)
    # Centre de l'image vers +X Blender (= +X Three) ; haut de l'image = zénith.
    cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
    scene.collection.objects.link(cam)
    scene.camera = cam


def render(path, width, samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = width, width // 2
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = -0.9
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 88
    scene.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)


def main():
    theme = ARGS[0] if ARGS and not ARGS[0].startswith("--") else "sables"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_scene(PRESETS[theme])
    if "--preview" in ARGS:
        render(os.path.join(HERE, "previews", f"{theme}.jpg"), 1024, 24)
        return
    render(os.path.join(OUT, f"{theme}.jpg"), 4096, 96)
    render(os.path.join(OUT, f"{theme}-mobile.jpg"), 2048, 96)


main()
