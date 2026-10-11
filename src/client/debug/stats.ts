import type * as THREE from 'three';

/** Instantané des mesures (exposé aux scripts de capture via window.__debug.stats()). */
export interface StatsSnapshot {
  fps: number;
  /** Temps entre deux images (ms) : moyenne et 95e centile sur les 2 dernières secondes. */
  frameAvg: number;
  frameP95: number;
  /** Images de plus de 33 ms (saccades) sur la même fenêtre. */
  longFrames: number;
  /** Temps GPU réel par image (ms), si le navigateur fournit la requête de chronométrage ; sinon null. */
  gpuAvg: number | null;
  /** Appels de dessin et triangles de toutes les passes (rendu + post-traitement) de la dernière image. */
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  /** Mémoire JavaScript utilisée (Mo, Chrome uniquement). */
  heapMb: number | null;
}

interface TimerQueryExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

const WINDOW_MS = 2000;

/**
 * Mesures de performance en jeu. Affichage avec ?stats=1.
 * `renderer.info` ne donne que des compteurs ; le temps GPU réel vient de EXT_disjoint_timer_query_webgl2
 * (indisponible sur certains navigateurs, notamment Safari : utiliser alors les outils du navigateur).
 */
export class PerfStats {
  private readonly frames: { t: number; dt: number }[] = [];
  private readonly gpu: number[] = [];
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: TimerQueryExt | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private last = 0;
  private lastDraw = 0;
  private counts = { drawCalls: 0, triangles: 0 };
  private readonly panel: HTMLDivElement | null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    visible: boolean,
  ) {
    renderer.info.autoReset = false;
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExt | null;
    this.panel = visible ? this.createPanel() : null;
  }

  beginFrame(now: number): void {
    if (this.last) {
      this.frames.push({ t: now, dt: now - this.last });
      while (this.frames.length && now - this.frames[0].t > WINDOW_MS) this.frames.shift();
    }
    this.last = now;
    this.renderer.info.reset();
    if (this.ext && !this.active && this.pending.length < 4) {
      this.active = this.gl.createQuery();
      if (this.active) this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active);
    }
  }

  endFrame(now: number): void {
    const info = this.renderer.info.render;
    this.counts = { drawCalls: info.calls, triangles: info.triangles };
    if (this.ext && this.active) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(this.active);
      this.active = null;
    }
    this.pollGpu();
    if (this.panel && now - this.lastDraw > 500) {
      this.lastDraw = now;
      this.draw();
    }
  }

  snapshot(): StatsSnapshot {
    const dts = this.frames.map((f) => f.dt).sort((a, b) => a - b);
    const avg = dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0;
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const info = this.renderer.info;
    return {
      fps: avg ? 1000 / avg : 0,
      frameAvg: avg,
      frameP95: dts.length ? dts[Math.min(dts.length - 1, Math.floor(dts.length * 0.95))] : 0,
      longFrames: dts.filter((d) => d > 33).length,
      gpuAvg: this.gpu.length ? this.gpu.reduce((a, b) => a + b, 0) / this.gpu.length : null,
      drawCalls: this.counts.drawCalls,
      triangles: this.counts.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      heapMb: memory ? memory.usedJSHeapSize / 1048576 : null,
    };
  }

  private pollGpu(): void {
    if (!this.ext) return;
    const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const query = this.pending[0];
      if (!this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!disjoint) {
        this.gpu.push(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) / 1e6);
        if (this.gpu.length > 120) this.gpu.shift();
      }
      this.gl.deleteQuery(query);
    }
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed',
      left: '8px',
      bottom: '8px',
      zIndex: '50',
      padding: '6px 9px',
      borderRadius: '8px',
      background: 'rgba(0,0,0,0.65)',
      color: '#b8ffb8',
      font: '12px/1.35 ui-monospace, monospace',
      whiteSpace: 'pre',
      pointerEvents: 'none',
    });
    document.body.appendChild(panel);
    return panel;
  }

  private draw(): void {
    const s = this.snapshot();
    const f = (n: number, d = 1) => n.toFixed(d);
    this.panel!.textContent = [
      `${f(s.fps, 0)} i/s · ${f(s.frameAvg)} ms (p95 ${f(s.frameP95)}) · saccades ${s.longFrames}`,
      `GPU ${s.gpuAvg === null ? 'n/d' : `${f(s.gpuAvg, 2)} ms`}`,
      `appels ${s.drawCalls} · triangles ${(s.triangles / 1000).toFixed(0)} k`,
      `géométries ${s.geometries} · textures ${s.textures} · shaders ${s.programs}`,
      s.heapMb === null ? '' : `mémoire JS ${f(s.heapMb, 0)} Mo`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}
