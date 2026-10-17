import * as THREE from 'three';
import { getMechanic, DOOR_HEIGHT, DOOR_WIDTH, type Layout, type Theme, type TriedOutcome } from '../../core';
import { doorSlots, type DoorSlot } from './components/slots';
import { symbolTexture, type Tweens } from './fx';
import { glyphTextures } from './textures';

/** Couleurs de gameplay : identiques dans tous les thèmes pour rester lisibles. */
const COLORS = { hint: 0xffc93c, reveal: 0x3ce0ff, highlight: 0x7ff6ff };
/** Symbole des portes mystère : cyan lumineux (HDR). */
const MYSTERY_GLYPH = new THREE.Color(0.5, 2.2, 2.8);
/** Trace privée des portes essayées : indice scellé (pierre), piège fissuré (rouge sombre), coffre vidé (pouvoir : violet, trésor : or). */
type Traced = Exclude<TriedOutcome, 'up'>;
const TRIED_LOOK: Record<Traced, { panel: THREE.Color; glyph: THREE.Color }> = {
  wall: { panel: new THREE.Color(0x8c7a62), glyph: new THREE.Color(0.55, 0.5, 0.42) },
  trap: { panel: new THREE.Color(0x4a1712), glyph: new THREE.Color(1.6, 0.25, 0.12) },
  power: { panel: new THREE.Color(0x3a2350), glyph: new THREE.Color(1.3, 0.7, 1.9) },
  treasure: { panel: new THREE.Color(0x4a3812), glyph: new THREE.Color(1.8, 1.3, 0.35) },
};
const SEALED_PANEL = new THREE.Color(0x6a2aa8);
const isTraced = (t: TriedOutcome | null | undefined): t is Traced => !!t && t !== 'up';

interface DoorState {
  slot: DoorSlot;
  index: number;
  baseColor: THREE.Color;
  glyphIdle: THREE.Color;
  mystery: boolean;
  /** Ce que le joueur a découvert derrière la porte (trace privée), ou null si jamais ouverte. */
  tried: TriedOutcome | null;
  /** Case de l'atlas d'origine (hiéroglyphe ou symbole ±N). */
  cell: number;
  highlighted: boolean;
  privateHint: boolean;
  revealed: boolean;
  flashColor: THREE.Color | null;
  flashUntil: number;
  /** Décalages d'animation du battant (ouverture, tremblement, coup). */
  offset: THREE.Vector3;
  marker?: THREE.Mesh;
  beam?: THREE.Mesh;
  /** Duel : porte scellée (cercle de runes et chaînes devant la porte). */
  sealed: boolean;
  seal?: THREE.Mesh;
}

/**
 * Battants et symboles de toutes les portes : deux InstancedMesh (couleur et lueur par porte),
 * quel que soit le nombre de portes. L'encadrement fixe est un composant de décor (doorFrames).
 */
export class DoorsView {
  readonly group = new THREE.Group();
  private readonly states = new Map<string, DoorState>();
  private readonly panels: THREE.InstancedMesh;
  private readonly emblems: THREE.InstancedMesh;
  private readonly emissive: THREE.InstancedBufferAttribute;
  private readonly cellAttr: THREE.InstancedBufferAttribute;
  /** Cases de l'atlas des symboles de trace (scellé, fissure). */
  private readonly traceCells: Record<Traced, number>;
  private readonly markerGeo = new THREE.OctahedronGeometry(0.3);
  private readonly markerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 0.4) });
  private readonly beamGeo = new THREE.CylinderGeometry(0.6, 0.9, 18, 14, 1, true);
  private readonly sealGeo = new THREE.PlaneGeometry(1.9, 1.9);
  private sealMat: THREE.MeshBasicMaterial | null = null;
  private readonly beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 2.6), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
  private dirty = new Set<DoorState>();
  private time = 0;

  constructor(
    layout: Layout,
    theme: Theme,
    private readonly tweens: Tweens,
  ) {
    const slots = doorSlots(layout);
    const count = slots.length;

    // Atlas des symboles : 4 hiéroglyphes + les symboles des portes reconnaissables (±2, ±3…).
    const glyphs = glyphTextures().map((t) => t.image as HTMLCanvasElement);
    const symbols = [...new Set(slots.map((s) => getMechanic(s.door.mechanic).appearance?.symbol(layout.config)).filter((x): x is string => !!x))];
    const cells = [...glyphs, ...symbols.map((sym) => symbolTexture(sym).image as HTMLCanvasElement), sealCanvas(), crackCanvas(), chestCanvas()];
    this.traceCells = { wall: cells.length - 3, trap: cells.length - 2, power: cells.length - 1, treasure: cells.length - 1 };
    const atlas = document.createElement('canvas');
    atlas.width = 128 * cells.length;
    atlas.height = 128;
    cells.forEach((c, i) => atlas.getContext('2d')!.drawImage(c, i * 128, 0, 128, 128));
    const atlasTexture = new THREE.CanvasTexture(atlas);
    atlasTexture.colorSpace = THREE.SRGBColorSpace;

    // Battants : couleur par instance + lueur par instance (attribut aEmissive injecté dans le shader standard).
    const panelMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.15 });
    panelMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aEmissive;\nvarying vec3 vEmissive;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmissive = aEmissive;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEmissive;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmissive;');
    };
    const panelGeo = new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, 0.16);
    this.emissive = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    panelGeo.setAttribute('aEmissive', this.emissive);
    this.panels = new THREE.InstancedMesh(panelGeo, panelMat, count);
    this.panels.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.panels.receiveShadow = true;

    // Symboles : case de l'atlas par instance (attribut aCell), couleur HDR par instance.
    const emblemGeo = new THREE.PlaneGeometry(0.95, 0.95);
    const cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.cellAttr = cellAttr;
    emblemGeo.setAttribute('aCell', cellAttr);
    const emblemMat = new THREE.MeshBasicMaterial({ map: atlasTexture, transparent: true, depthWrite: false });
    emblemMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float aCell;`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = (vMapUv + vec2(aCell, 0.0)) / vec2(${cells.length.toFixed(1)}, 1.0);`);
    };
    this.emblems = new THREE.InstancedMesh(emblemGeo, emblemMat, count);
    this.emblems.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

    const glyphColor = new THREE.Color(...theme.door.glyph);
    slots.forEach((slot, index) => {
      const mechanic = getMechanic(slot.door.mechanic);
      const symbol = mechanic.appearance?.symbol(layout.config);
      const cell = symbol ? glyphs.length + symbols.indexOf(symbol) : slot.door.ring % glyphs.length;
      cellAttr.setX(index, cell);
      const state: DoorState = {
        slot,
        index,
        baseColor: new THREE.Color(mechanic.appearance?.color ?? theme.door.panel),
        glyphIdle: symbol ? MYSTERY_GLYPH.clone() : glyphColor.clone(),
        mystery: !!symbol,
        tried: null,
        cell,
        highlighted: false,
        privateHint: false,
        revealed: false,
        sealed: false,
        flashColor: null,
        flashUntil: 0,
        offset: new THREE.Vector3(),
      };
      this.states.set(slot.door.id, state);
      this.writeMatrix(state);
    });
    this.group.add(this.panels, this.emblems);
  }

  /** Trace privée : la porte garde l'aspect de ce que le joueur y a découvert (le passage reste signalé par l'indice doré). */
  markTried(doorId: string, outcome: TriedOutcome): void {
    const s = this.states.get(doorId);
    if (!s || s.tried === outcome) return;
    s.tried = outcome;
    this.cellAttr.setX(s.index, outcome === 'up' ? s.cell : this.traceCells[outcome]);
    this.cellAttr.needsUpdate = true;
  }

  setHighlight(doorId: string | null): void {
    for (const s of this.states.values()) s.highlighted = s.slot.door.id === doorId;
  }

  /** Indices privés : les passages connus du joueur, sur les étages qu'il doit encore (re)franchir. */
  setPrivateHints(known: Set<string>, playerFloor: number): void {
    for (const s of this.states.values()) {
      s.privateHint = known.has(s.slot.door.id) && s.slot.floor >= playerFloor;
      if (s.privateHint && !s.marker) s.marker = this.attach(s, new THREE.Mesh(this.markerGeo, this.markerMat), DOOR_HEIGHT / 2 + 1, 0.5);
      if (s.marker) s.marker.visible = s.privateHint;
    }
  }

  /** Duel : sceau magique devant la porte (violet, chaînes), visible par les deux joueurs. */
  setSealed(doorId: string, on: boolean): void {
    const s = this.states.get(doorId);
    if (!s) return;
    s.sealed = on;
    if (on && !s.seal) {
      this.sealMat ??= new THREE.MeshBasicMaterial({ map: runeTexture(), color: new THREE.Color(1.8, 0.9, 2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      s.seal = this.attach(s, new THREE.Mesh(this.sealGeo, this.sealMat), 0, 0.14);
    }
    if (s.seal) s.seal.visible = on;
  }

  setReveal(doorId: string, on: boolean): void {
    const s = this.states.get(doorId);
    if (!s) return;
    s.revealed = on;
    if (on && !s.beam) s.beam = this.attach(s, new THREE.Mesh(this.beamGeo, this.beamMat), 9 - DOOR_HEIGHT / 2, 0.8);
    if (s.beam) s.beam.visible = on;
  }

  flash(doorId: string, color: number, duration = 1.4): void {
    const s = this.states.get(doorId);
    if (!s) return;
    s.flashColor = new THREE.Color(color);
    s.flashUntil = this.time + duration;
  }

  shake(doorId: string): void {
    this.animate(doorId, 0.35, (s, t) => (s.offset.x = Math.sin(t * Math.PI * 6) * 0.06 * (1 - t)));
  }

  /** Le battant s'enfonce dans le sol puis remonte. */
  open(doorId: string, holdSeconds = 0.9): void {
    this.animate(doorId, 0.25, (s, t) => (s.offset.y = -t * (DOOR_HEIGHT - 0.05)));
    setTimeout(() => this.animate(doorId, 0.3, (s, t) => (s.offset.y = -(1 - t) * (DOOR_HEIGHT - 0.05))), holdSeconds * 1000);
  }

  /** Position et orientation de la porte (z local = vers l'extérieur), pour placer des effets. */
  transform(doorId: string): THREE.Object3D | undefined {
    const s = this.states.get(doorId);
    if (!s) return undefined;
    const o = new THREE.Object3D();
    o.position.copy(s.slot.position);
    o.rotation.y = s.slot.rotationY;
    return o;
  }

  update(dt: number): void {
    this.time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    const panel = new THREE.Color();
    const glow = new THREE.Color();
    const glyph = new THREE.Color();
    for (const s of this.states.values()) {
      let glyphBoost = s.highlighted ? 0.6 + 0.4 * pulse : 0;
      glow.setScalar(0);
      if (s.flashColor && this.time < s.flashUntil) {
        panel.copy(s.flashColor);
        glow.copy(s.flashColor).multiplyScalar(0.9);
      } else if (s.sealed) {
        panel.set(SEALED_PANEL);
        glow.set(SEALED_PANEL).multiplyScalar(0.4 + 0.3 * pulse);
      } else if (s.revealed) {
        panel.set(COLORS.reveal);
        glow.set(COLORS.reveal).multiplyScalar(0.6 + 0.6 * pulse);
        glyphBoost = 1;
      } else if (s.privateHint) {
        panel.set(COLORS.hint);
        glow.set(COLORS.hint).multiplyScalar(0.5 + (s.highlighted ? 0.4 * pulse : 0));
        glyphBoost = 1;
      } else {
        const look = isTraced(s.tried) ? TRIED_LOOK[s.tried] : null;
        panel.copy(look ? look.panel : s.baseColor);
        if (s.highlighted) glow.set(COLORS.highlight).multiplyScalar(0.25 + 0.25 * pulse);
      }
      if (s.mystery && !s.tried) glyphBoost = Math.max(glyphBoost, 0.35 + 0.35 * pulse);
      const traced = !s.flashColor && !s.revealed && !s.privateHint && isTraced(s.tried);
      glyph.copy(traced ? TRIED_LOOK[s.tried as Traced].glyph : s.glyphIdle).multiplyScalar(1 + glyphBoost);
      this.panels.setColorAt(s.index, panel);
      this.emissive.setXYZ(s.index, glow.r, glow.g, glow.b);
      this.emblems.setColorAt(s.index, glyph);
      if (s.marker?.visible) {
        s.marker.position.y = DOOR_HEIGHT / 2 + 1 + Math.sin(this.time * 3 + s.index) * 0.12;
        s.marker.rotation.y += dt * 2;
      }
    }
    this.panels.instanceColor!.needsUpdate = true;
    this.emblems.instanceColor!.needsUpdate = true;
    this.emissive.needsUpdate = true;
    this.beamMat.opacity = 0.2 + 0.2 * pulse;
    for (const s of this.states.values()) if (s.seal?.visible) s.seal.rotation.z = this.time * 0.8;
    for (const s of this.dirty) this.writeMatrix(s);
    if (this.dirty.size) {
      this.panels.instanceMatrix.needsUpdate = true;
      this.emblems.instanceMatrix.needsUpdate = true;
      this.dirty.clear();
    }
  }

  private animate(doorId: string, duration: number, fn: (s: DoorState, t: number) => void): void {
    const s = this.states.get(doorId);
    if (!s) return;
    this.tweens.add(duration, (t) => {
      fn(s, t);
      this.dirty.add(s);
    });
  }

  private writeMatrix(s: DoorState): void {
    const base = new THREE.Matrix4().compose(s.slot.position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.slot.rotationY), new THREE.Vector3(1, 1, 1));
    const local = new THREE.Matrix4().makeTranslation(s.offset.x, s.offset.y, 0.06 + s.offset.z);
    this.panels.setMatrixAt(s.index, base.clone().multiply(local));
    this.emblems.setMatrixAt(s.index, base.multiply(local).multiply(new THREE.Matrix4().makeTranslation(0, 0.25, 0.085)));
  }

  /** Ajoute un objet (repère, faisceau) devant une porte. */
  private attach(s: DoorState, mesh: THREE.Mesh, y: number, out: number): THREE.Mesh {
    const holder = this.transform(s.slot.door.id)!;
    mesh.position.set(0, y, out);
    holder.add(mesh);
    this.group.add(holder);
    return mesh;
  }
}

/** Symbole « scellé » : trois barres de pierre en travers (mur déjà essayé). */
function sealCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  for (const y of [38, 60, 82]) g.fillRect(22, y, 84, 11);
  g.globalAlpha = 0.6;
  g.fillRect(30, 30, 6, 66);
  g.fillRect(92, 30, 6, 66);
  return c;
}

/** Symbole « fissure » : éclair brisé (piège déjà déclenché). */
function crackCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 9;
  g.lineCap = g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(70, 14);
  g.lineTo(50, 56);
  g.lineTo(76, 66);
  g.lineTo(52, 114);
  g.moveTo(50, 56);
  g.lineTo(30, 62);
  g.moveTo(76, 66);
  g.lineTo(98, 58);
  g.stroke();
  return c;
}

/** Symbole « coffre vidé » : coffre ouvert (porte à pouvoir déjà ouverte, duel). */
function chestCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = g.fillStyle = '#ffffff';
  g.lineWidth = 8;
  g.lineJoin = 'round';
  g.strokeRect(26, 62, 76, 44);
  g.beginPath();
  g.moveTo(26, 62);
  g.lineTo(34, 30);
  g.lineTo(110, 22);
  g.lineTo(102, 62);
  g.stroke();
  g.fillRect(58, 74, 12, 16);
  return c;
}

/** Sceau magique : cercle de runes et deux chaînes croisées (texture claire, teintée en violet lumineux). */
function runeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = g.fillStyle = '#ffffff';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(128, 128, 112, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.arc(128, 128, 88, 0, Math.PI * 2);
  g.stroke();
  // Runes entre les deux cercles.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.save();
    g.translate(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100);
    g.rotate(a + Math.PI / 2);
    g.fillRect(-2, -8, 4, 16);
    g.fillRect(-7, i % 2 ? -8 : 2, 14, 4);
    g.restore();
  }
  // Chaînes croisées : maillons ovales.
  g.lineWidth = 6;
  for (const dir of [1, -1]) {
    for (let k = -3; k <= 3; k++) {
      g.save();
      g.translate(128 + k * 24, 128 + k * 24 * dir);
      g.rotate(dir * Math.PI / 4 + (k % 2 ? Math.PI / 2 : 0));
      g.beginPath();
      g.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

