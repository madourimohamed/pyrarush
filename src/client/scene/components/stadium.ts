import * as THREE from 'three';
import { bool, color, hdrColor, int, num, Rng } from '../../../core';
import { canvasTexture, defineComponent, hdr, merged, type SceneContext } from './component';

/**
 * Stade autour de la pyramide (niveau « Le Stade Légendaire ») : un ovale de gradins à la bonne échelle, vu correctement
 * de partout (un panorama ne peut pas rendre un décor aussi proche).
 * - gradins avec foule dessinée (couleurs des deux équipes), panneaux publicitaires au bord de la pelouse ;
 * - façade à arcades, toit rayé, tours de projecteurs lumineuses, drapeaux, écrans géants ;
 * - pelouse à bandes, lignes blanches et buts.
 * L'ovale commence à `distance` × la demi-largeur de l'esplanade (petit axe), allongé de `aspect` sur l'axe X ; il reste
 * assez loin et assez bas pour que la caméra du jeu passe toujours au-dessus des gradins. Aucune collision : hors du jeu.
 */

/** Ovale : point du bord intérieur à l'angle `t`, décalé de `d` mètres vers l'extérieur (vraie courbe parallèle). */
interface Oval {
  a: number;
  b: number;
}
function ovalPoint(o: Oval, t: number, d: number): THREE.Vector2 {
  const n = new THREE.Vector2(o.b * Math.cos(t), o.a * Math.sin(t)).normalize();
  return new THREE.Vector2(o.a * Math.cos(t) + n.x * d, o.b * Math.sin(t) + n.y * d);
}

/** Bande verticale le long de l'ovale (de `y0` à `y1`, à la distance `d`), tournée vers l'intérieur ou l'extérieur. */
function wallStrip(o: Oval, segments: number, d: number, y0: number, y1: number, tile: number, inward: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let u = 0;
  let prev = ovalPoint(o, 0, d);
  for (let i = 0; i <= segments; i++) {
    const p = ovalPoint(o, (i / segments) * Math.PI * 2, d);
    u += p.distanceTo(prev) / tile;
    prev = p;
    pos.push(p.x, y0, p.y, p.x, y1, p.y);
    uv.push(u, 0, u, 1);
    if (i < segments) {
      const k = i * 2;
      if (inward) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  return indexed(pos, uv, idx);
}

/** Bande horizontale (ou inclinée) entre les distances d0 et d1, aux hauteurs y0 et y1 ; face vers le haut. */
function ringStrip(o: Oval, segments: number, d0: number, d1: number, y0: number, y1: number, tile: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let u = 0;
  let prev = ovalPoint(o, 0, d0);
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const p0 = ovalPoint(o, t, d0);
    const p1 = ovalPoint(o, t, d1);
    u += p0.distanceTo(prev) / tile;
    prev = p0;
    pos.push(p0.x, y0, p0.y, p1.x, y1, p1.y);
    uv.push(u, 0, u, 1);
    if (i < segments) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  return indexed(pos, uv, idx);
}

function indexed(pos: number[], uv: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Donne une couleur unie à une géométrie (pour fusionner des pièces de couleurs différentes en un seul mesh). */
function tinted(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const geometry = g.index ? g.toNonIndexed() : g;
  const n = geometry.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
const SKIN = ['#f1c7a3', '#d9a27a', '#a8714c', '#7a4b2e', '#f5d2b8'];

/** Foule vue de face (contremarches) : supporters assis, bras levés, écharpes et petits drapeaux. */
function crowdFront(teamA: number, teamB: number, seat: number, rng: Rng): THREE.CanvasTexture {
  return canvasTexture(
    512,
    128,
    (c) => {
      c.fillStyle = css(seat);
      c.fillRect(0, 0, 512, 128);
      const shirts = [css(teamA), css(teamB), css(teamA), css(teamB), '#ffffff', '#f2c14e'];
      for (let i = 0; i < 18; i++) {
        const x = i * 28.4 + 6 + rng.next() * 6;
        const shirt = shirts[rng.int(0, shirts.length - 1)];
        const y = 52 + rng.next() * 12;
        c.fillStyle = shirt;
        c.beginPath();
        c.roundRect(x, y, 22, 128 - y, 8);
        c.fill();
        if (rng.next() < 0.45) {
          // Bras levés.
          c.strokeStyle = shirt;
          c.lineWidth = 6;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(x + 3, y + 8);
          c.lineTo(x - 4, y - 18);
          c.moveTo(x + 19, y + 8);
          c.lineTo(x + 26, y - 18);
          c.stroke();
        }
        if (rng.next() < 0.15) {
          // Petit drapeau.
          c.fillStyle = rng.next() < 0.5 ? css(teamA) : css(teamB);
          c.fillRect(x + 22, y - 34, 18, 12);
          c.fillStyle = '#ddd';
          c.fillRect(x + 21, y - 34, 2, 30);
        }
        c.fillStyle = SKIN[rng.int(0, SKIN.length - 1)];
        c.beginPath();
        c.arc(x + 11, y - 7, 9, 0, Math.PI * 2);
        c.fill();
      }
    },
    true,
  );
}

/** Foule vue de dessus (marches) : têtes et épaules serrées. */
function crowdTop(teamA: number, teamB: number, seat: number, rng: Rng): THREE.CanvasTexture {
  return canvasTexture(
    256,
    64,
    (c) => {
      c.fillStyle = css(seat);
      c.fillRect(0, 0, 256, 64);
      const shirts = [css(teamA), css(teamB), css(teamA), css(teamB), '#ffffff', '#f2c14e'];
      for (let i = 0; i < 70; i++) {
        const x = rng.next() * 256;
        const y = 8 + rng.next() * 48;
        c.fillStyle = shirts[rng.int(0, shirts.length - 1)];
        c.beginPath();
        c.ellipse(x, y + 3, 8, 6, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = SKIN[rng.int(0, SKIN.length - 1)];
        c.beginPath();
        c.arc(x, y - 2, 4, 0, Math.PI * 2);
        c.fill();
      }
    },
    true,
  );
}

/** Panneaux publicitaires au bord de la pelouse. */
function boards(teamA: number, teamB: number): THREE.CanvasTexture {
  return canvasTexture(
    1024,
    64,
    (c) => {
      for (let i = 0; i < 4; i++) {
        c.fillStyle = css(i % 2 ? teamB : teamA);
        c.fillRect(i * 256, 0, 256, 64);
        c.fillStyle = i % 2 ? '#ffffff' : '#ffd84a';
        c.font = 'bold 34px "Fredoka Variable", sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(i % 2 ? 'PYRARUSH' : '★ GOAL ★', i * 256 + 128, 34);
      }
    },
    true,
  );
}

/** Façade extérieure : pierre claire, deux étages d'arcades sombres, liserés dorés. */
function facade(stone: number): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (c) => {
      c.fillStyle = css(stone);
      c.fillRect(0, 0, 256, 256);
      c.fillStyle = '#2a2420';
      for (const [y, h] of [
        [40, 70],
        [140, 80],
      ]) {
        for (let i = 0; i < 4; i++) {
          const x = i * 64 + 14;
          c.beginPath();
          c.moveTo(x, y + h);
          c.lineTo(x, y + 18);
          c.arc(x + 18, y + 18, 18, Math.PI, 0);
          c.lineTo(x + 36, y + h);
          c.fill();
        }
      }
      c.fillStyle = '#d9a83a';
      c.fillRect(0, 122, 256, 6);
      c.fillRect(0, 10, 256, 6);
    },
    true,
  );
}

/** Écran géant : un ballon qui jaillit d'un éclair, sur fond bleu nuit. */
function screenTexture(teamA: number, teamB: number): THREE.CanvasTexture {
  return canvasTexture(512, 288, (c) => {
    const g = c.createLinearGradient(0, 0, 512, 288);
    g.addColorStop(0, '#0b1a4a');
    g.addColorStop(1, '#2a0b3a');
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 288);
    c.strokeStyle = css(teamA);
    c.lineWidth = 10;
    c.beginPath();
    c.moveTo(0, 230);
    c.lineTo(200, 150);
    c.stroke();
    c.strokeStyle = css(teamB);
    c.beginPath();
    c.moveTo(512, 60);
    c.lineTo(310, 140);
    c.stroke();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(256, 144, 70, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#111111';
    const pentagon = (x: number, y: number, r: number) => {
      c.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
        c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      c.fill();
    };
    pentagon(256, 144, 22);
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      pentagon(256 + Math.cos(a) * 52, 144 + Math.sin(a) * 52, 14);
    }
  });
}

/** Pelouse tondue à bandes. */
function stripes(light: number, dark: number): THREE.CanvasTexture {
  return canvasTexture(
    64,
    8,
    (c) => {
      c.fillStyle = css(light);
      c.fillRect(0, 0, 32, 8);
      c.fillStyle = css(dark);
      c.fillRect(32, 0, 32, 8);
    },
    true,
  );
}

export const stadium = defineComponent(
  {
    /** Début des gradins (petit axe), en multiple de la demi-largeur de l'esplanade. */
    distance: num(1.6, { min: 1.1, max: 3, step: 0.05 }),
    /** Allongement de l'ovale sur l'axe X. */
    aspect: num(1.3, { min: 1, max: 2, step: 0.05 }),
    rows: int(16, { min: 4, max: 40 }),
    rowHeight: num(1, { min: 0.4, max: 2, step: 0.05 }),
    rowDepth: num(1.4, { min: 0.8, max: 3, step: 0.05 }),
    /** Hauteur du mur au bord de la pelouse (panneaux publicitaires). */
    podium: num(2.5, { min: 1, max: 6, step: 0.1 }),
    stone: color(0xece4d4),
    seats: color(0x2a3550),
    teamA: color(0xd8202a),
    teamB: color(0x2a5ad8),
    roof: bool(true),
    towers: int(4, { min: 0, max: 8 }),
    light: hdrColor([3.2, 3, 2.6]),
    flags: int(40, { min: 0, max: 120 }),
    screens: bool(true),
    pitch: bool(true),
    grassLight: color(0x5fbf3a),
    grassDark: color(0x4ea832),
  },
  (ctx: SceneContext, o) => {
    const { scene, lowQuality } = ctx;
    const rng = new Rng(ctx.layout.seed ^ 0x57ade);
    const r0 = ctx.groundHalf * o.distance;
    const oval: Oval = { a: r0 * o.aspect, b: r0 };
    const segments = lowQuality ? 72 : 128;
    const depth = o.rows * o.rowDepth;
    const top = o.podium + o.rows * o.rowHeight;

    // Gradins : marches (foule vue de dessus) et contremarches (foule vue de face).
    const crowdRisers: THREE.BufferGeometry[] = [];
    const treads: THREE.BufferGeometry[] = [];
    for (let i = 0; i < o.rows; i++) {
      const d0 = i * o.rowDepth;
      const y = o.podium + i * o.rowHeight;
      treads.push(ringStrip(oval, segments, d0, d0 + o.rowDepth, y, y, 4));
      crowdRisers.push(wallStrip(oval, segments, d0 + o.rowDepth, y, y + o.rowHeight, 8, true));
    }
    const boardsMesh = new THREE.Mesh(wallStrip(oval, segments, 0, 0, o.podium, 20, true), new THREE.MeshLambertMaterial({ map: boards(o.teamA, o.teamB) }));
    boardsMesh.receiveShadow = true;
    scene.add(boardsMesh);
    scene.add(merged(crowdRisers, new THREE.MeshLambertMaterial({ map: crowdFront(o.teamA, o.teamB, o.seats, rng) }), false));
    scene.add(merged(treads, new THREE.MeshLambertMaterial({ map: crowdTop(o.teamA, o.teamB, o.seats, rng) }), false));

    // Façade extérieure, parapet et sol sous les gradins (vu de loin, par les arcades).
    const outer = depth + 0.6;
    const stoneMaterial = new THREE.MeshLambertMaterial({ color: o.stone });
    scene.add(
      merged(
        [
          wallStrip(oval, segments, depth, top, top + 1.2, 6, true),
          ringStrip(oval, segments, depth, outer, top + 1.2, top + 1.2, 6),
        ],
        stoneMaterial,
        false,
      ),
    );
    scene.add(merged([wallStrip(oval, segments, outer, 0, top + 1.2, 16, false)], new THREE.MeshLambertMaterial({ map: facade(o.stone) }), false));

    // Toit rayé aux couleurs des équipes, au-dessus des derniers rangs ; poteaux de soutien.
    if (o.roof) {
      const roofParts: THREE.BufferGeometry[] = [];
      const posts: THREE.BufferGeometry[] = [];
      const a = new THREE.Color(o.teamA);
      const b = new THREE.Color(o.teamB);
      const roofIn = depth * 0.62;
      for (let i = 0; i < segments; i++) {
        const t0 = (i / segments) * Math.PI * 2;
        const t1 = ((i + 1) / segments) * Math.PI * 2;
        const p = [ovalPoint(oval, t0, roofIn), ovalPoint(oval, t1, roofIn), ovalPoint(oval, t1, outer), ovalPoint(oval, t0, outer)];
        const ys = [top + 6, top + 6, top + 8, top + 8];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(p.flatMap((q, k) => [q.x, ys[k], q.y]), 3));
        g.setIndex([0, 1, 2, 0, 2, 3]);
        g.computeVertexNormals();
        roofParts.push(tinted(g, i % 2 ? a : b));
        if (i % 8 === 0) {
          const q = ovalPoint(oval, t0, outer - 0.3);
          const post = new THREE.BoxGeometry(0.5, 7, 0.5);
          post.translate(q.x, top + 4.5, q.y);
          posts.push(post);
        }
      }
      const roof = merged(roofParts, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), false);
      scene.add(roof);
      if (posts.length) scene.add(merged(posts, stoneMaterial, false));
    }

    // Drapeaux sur le parapet.
    if (o.flags > 0 && !lowQuality) {
      const parts: THREE.BufferGeometry[] = [];
      const pole = new THREE.Color(0xdddddd);
      for (let i = 0; i < o.flags; i++) {
        const t = (i / o.flags) * Math.PI * 2;
        const q = ovalPoint(oval, t, outer - 0.2);
        const stick = new THREE.CylinderGeometry(0.06, 0.06, 4.5, 5);
        stick.translate(q.x, top + 1.2 + (o.roof ? 7 : 0) + 2.25, q.y);
        parts.push(tinted(stick, pole));
        const cloth = new THREE.PlaneGeometry(1.8, 1.1);
        cloth.translate(0.9, 0, 0);
        cloth.rotateY(rng.next() * Math.PI * 2);
        cloth.translate(q.x, top + 1.2 + (o.roof ? 7 : 0) + 3.8, q.y);
        parts.push(tinted(cloth, new THREE.Color(i % 2 ? o.teamA : o.teamB)));
      }
      scene.add(merged(parts, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), false));
    }

    // Tours de projecteurs (panneaux lumineux tournés vers la pelouse).
    if (o.towers > 0) {
      const columns: THREE.BufferGeometry[] = [];
      const panels: THREE.BufferGeometry[] = [];
      const height = top + 20;
      for (let i = 0; i < o.towers; i++) {
        const t = ((i + 0.5) / o.towers) * Math.PI * 2;
        const q = ovalPoint(oval, t, outer + 4);
        const face = Math.atan2(-q.x, -q.y);
        const column = new THREE.BoxGeometry(1.6, height, 1.6);
        column.translate(q.x, height / 2, q.y);
        columns.push(column);
        const head = new THREE.BoxGeometry(8, 5, 1);
        head.rotateX(-0.35);
        head.rotateY(face);
        head.translate(q.x, height + 2, q.y);
        columns.push(head);
        const panel = new THREE.PlaneGeometry(7.2, 4.2);
        panel.translate(0, 0, 0.55);
        panel.rotateX(-0.35);
        panel.rotateY(face);
        panel.translate(q.x, height + 2, q.y);
        panels.push(panel);
      }
      scene.add(merged(columns, stoneMaterial, false));
      scene.add(merged(panels, new THREE.MeshBasicMaterial({ color: hdr(o.light), toneMapped: false }), false));
    }

    // Écrans géants aux deux bouts du grand axe.
    if (o.screens) {
      const frames: THREE.BufferGeometry[] = [];
      const screens: THREE.BufferGeometry[] = [];
      for (const t of [0, Math.PI]) {
        const q = ovalPoint(oval, t, outer);
        const face = Math.atan2(-q.x, -q.y);
        const y = top + (o.roof ? 16 : 8);
        const frame = new THREE.BoxGeometry(17, 10, 1);
        frame.rotateY(face);
        frame.translate(q.x, y, q.y);
        frames.push(frame);
        for (const side of [-6, 6]) {
          const leg = new THREE.BoxGeometry(0.8, y, 0.8);
          leg.translate(side, y / 2, 0);
          leg.rotateY(face);
          leg.translate(q.x, 0, q.y);
          frames.push(leg);
        }
        const screen = new THREE.PlaneGeometry(16, 9);
        screen.translate(0, 0, 0.55);
        screen.rotateY(face);
        screen.translate(q.x, y, q.y);
        screens.push(screen);
      }
      scene.add(merged(frames, new THREE.MeshLambertMaterial({ color: 0x23232b }), false));
      scene.add(merged(screens, new THREE.MeshBasicMaterial({ map: screenTexture(o.teamA, o.teamB), color: new THREE.Color(1.3, 1.3, 1.3) }), false));
    }

    // Pelouse à bandes, lignes et buts (sous l'esplanade, qui reste le sol jouable).
    if (o.pitch) {
      const grassTexture = stripes(o.grassLight, o.grassDark);
      grassTexture.repeat.set((oval.a * 2) / 12, 1);
      const field = new THREE.CircleGeometry(1, 96);
      field.rotateX(-Math.PI / 2);
      field.scale(oval.a + 0.5, 1, oval.b + 0.5);
      const fieldMesh = new THREE.Mesh(field, new THREE.MeshLambertMaterial({ map: grassTexture, polygonOffset: true, polygonOffsetFactor: -1 }));
      fieldMesh.position.y = 0.01;
      fieldMesh.receiveShadow = true;
      scene.add(fieldMesh);

      const halfLength = oval.a * 0.82;
      const halfWidth = Math.min(oval.b * 0.8, halfLength * 0.66);
      const lines: THREE.BufferGeometry[] = [];
      const line = (x0: number, z0: number, x1: number, z1: number) => {
        const length = Math.hypot(x1 - x0, z1 - z0);
        const g = new THREE.PlaneGeometry(length, 0.3);
        g.rotateX(-Math.PI / 2);
        g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
        g.translate((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
        lines.push(g);
      };
      const box = (x0: number, z0: number, x1: number, z1: number) => {
        line(x0, z0, x1, z0);
        line(x1, z0, x1, z1);
        line(x1, z1, x0, z1);
        line(x0, z1, x0, z0);
      };
      box(-halfLength, -halfWidth, halfLength, halfWidth);
      for (const s of [-1, 1]) {
        box(s * halfLength, -20, s * (halfLength - 16.5), 20);
        box(s * halfLength, -9, s * (halfLength - 5.5), 9);
      }
      const circle = new THREE.RingGeometry(ctx.groundHalf + 5, ctx.groundHalf + 5.3, 96);
      circle.rotateX(-Math.PI / 2);
      circle.translate(0, 0.02, 0);
      lines.push(circle);
      scene.add(merged(lines, new THREE.MeshLambertMaterial({ color: 0xf6f6f2, polygonOffset: true, polygonOffsetFactor: -2 }), false));

      const goals: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) {
        for (const z of [-3.66, 3.66]) {
          const post = new THREE.CylinderGeometry(0.08, 0.08, 2.44, 8);
          post.translate(s * halfLength, 1.22, z);
          goals.push(post);
        }
        const bar = new THREE.CylinderGeometry(0.08, 0.08, 7.32, 8);
        bar.rotateX(Math.PI / 2);
        bar.translate(s * halfLength, 2.44, 0);
        goals.push(bar);
      }
      scene.add(merged(goals, new THREE.MeshLambertMaterial({ color: 0xffffff })));
      const net = canvasTexture(
        32,
        32,
        (c) => {
          c.strokeStyle = 'rgba(255,255,255,0.9)';
          c.lineWidth = 2;
          c.strokeRect(0, 0, 32, 32);
        },
        true,
      );
      net.repeat.set(12, 4);
      const nets: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) {
        const back = new THREE.PlaneGeometry(7.32, 2.44);
        back.rotateY(Math.PI / 2);
        back.translate(s * (halfLength + 1.8), 1.22, 0);
        nets.push(back);
        const roofNet = new THREE.PlaneGeometry(1.8, 7.32);
        roofNet.rotateX(-Math.PI / 2);
        roofNet.translate(s * (halfLength + 0.9), 2.44, 0);
        nets.push(roofNet);
      }
      scene.add(merged(nets, new THREE.MeshBasicMaterial({ map: net, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false }), false));
    }
  },
);
