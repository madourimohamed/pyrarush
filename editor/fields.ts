import type { Field } from '../src/core';

/**
 * Un champ de formulaire par type d'option (voir core/schema.ts). Chaque champ affiche la valeur actuelle et appelle
 * `onChange` avec la nouvelle valeur, au format des fichiers de thème (couleurs en '#rrggbb').
 */

export interface Assets {
  models: string[];
  images: string[];
}

type Change = (value: unknown) => void;

/** Crée un élément avec ses propriétés et ses enfants. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
/** Couleur affichable : nombre 0xRRGGBB ou '#rrggbb'. */
const toHex = (v: unknown) => (typeof v === 'number' ? hex(v) : typeof v === 'string' && v ? v : '#808080');
const round = (v: number) => Math.round(v * 1000) / 1000;

function numberInput(field: Field, value: number, onChange: (v: number) => void): HTMLElement {
  const step = field.step ?? (field.integer ? 1 : 0.01);
  const box = el('input', { type: 'number', value: String(value), step: String(step) });
  if (field.min !== undefined) box.min = String(field.min);
  if (field.max !== undefined) box.max = String(field.max);
  const read = (input: HTMLInputElement) => {
    const v = Number(input.value);
    if (input.value !== '' && Number.isFinite(v)) onChange(v);
  };
  box.addEventListener('change', () => read(box));
  if (field.min === undefined || field.max === undefined) return box;
  // Intervalle connu : curseur + saisie précise, synchronisés.
  const slider = el('input', { type: 'range', min: String(field.min), max: String(field.max), step: String(step), value: String(value) });
  slider.addEventListener('input', () => {
    box.value = slider.value;
    read(slider);
  });
  box.addEventListener('change', () => (slider.value = box.value));
  return el('span', { className: 'pair' }, slider, box);
}

function colorInput(value: unknown, onChange: (v: string) => void): HTMLInputElement {
  const input = el('input', { type: 'color', value: toHex(value) });
  input.addEventListener('input', () => onChange(input.value));
  return input;
}

/** Liste modifiable (ajouter, retirer) : modèles, couleurs par matériau. */
function list<T>(items: T[], row: (item: T, set: (v: T) => void) => HTMLElement[], blank: () => T, onChange: (items: T[]) => void): HTMLElement {
  const box = el('div', { className: 'list' });
  items.forEach((item, i) => {
    const remove = el('button', { type: 'button', className: 'icon', title: 'Retirer', textContent: '×' });
    remove.addEventListener('click', () => onChange(items.filter((_, j) => j !== i)));
    box.append(el('div', { className: 'row' }, ...row(item, (v) => onChange(items.map((old, j) => (j === i ? v : old)))), remove));
  });
  const add = el('button', { type: 'button', className: 'small', textContent: '+ Ajouter' });
  add.addEventListener('click', () => onChange([...items, blank()]));
  box.append(add);
  return box;
}

function datalist(id: string, options: string[]): HTMLDataListElement {
  const existing = document.getElementById(id) as HTMLDataListElement | null;
  if (existing) return existing;
  const node = el('datalist', { id });
  node.append(...options.map((o) => el('option', { value: o })));
  document.body.append(node);
  return node;
}

function modelInput(value: string, assets: Assets, onChange: (v: string) => void): HTMLInputElement {
  datalist('models', assets.models);
  const input = el('input', { type: 'text', value, placeholder: 'modèle (pack/nom)' });
  input.setAttribute('list', 'models');
  input.addEventListener('change', () => onChange(input.value.trim()));
  return input;
}

export function fieldInput(field: Field, value: unknown, assets: Assets, onChange: Change): HTMLElement {
  switch (field.kind) {
    case 'number':
      return numberInput(field, Number(value), onChange);
    case 'boolean': {
      const input = el('input', { type: 'checkbox', checked: Boolean(value) });
      input.addEventListener('change', () => onChange(input.checked));
      return input;
    }
    case 'text': {
      const input = el('input', { type: 'text', value: String(value ?? '') });
      input.addEventListener('change', () => onChange(input.value));
      return input;
    }
    case 'choice': {
      const select = el('select');
      select.append(...field.options!.map((o) => el('option', { value: o, textContent: o, selected: o === value })));
      select.addEventListener('change', () => onChange(select.value));
      return select;
    }
    case 'choices': {
      const chosen = new Set(value as string[]);
      return el(
        'span',
        { className: 'pair' },
        ...field.options!.map((o) => {
          const box = el('input', { type: 'checkbox', checked: chosen.has(o) });
          box.addEventListener('change', () => onChange(field.options!.filter((x) => (x === o ? box.checked : chosen.has(x)))));
          return el('label', {}, box, o);
        }),
      );
    }
    case 'color':
      return colorInput(value, onChange);
    case 'cssColor': {
      // Vide = couleur tirée du thème (ex. le sol de la palette).
      const auto = el('input', { type: 'checkbox', checked: value === '' });
      const color = colorInput(value, onChange);
      color.disabled = value === '';
      auto.addEventListener('change', () => {
        color.disabled = auto.checked;
        onChange(auto.checked ? '' : color.value);
      });
      return el('span', { className: 'pair' }, color, el('label', {}, auto, 'du thème'));
    }
    case 'cssColors': {
      const colors = [...(value as string[])];
      return el('span', { className: 'pair' }, ...colors.map((c, i) => colorInput(c, (v) => onChange(colors.map((old, j) => (j === i ? v : old))))));
    }
    case 'hdr': {
      // Couleur lumineuse = teinte × intensité (au-dessus de 1, elle brille).
      const [r, g, b] = value as number[];
      const intensity = Math.max(r, g, b) || 1;
      const tint = '#' + [r, g, b].map((c) => Math.round((c / intensity) * 255).toString(16).padStart(2, '0')).join('');
      let state = { tint, intensity };
      const emit = () => {
        const n = parseInt(state.tint.slice(1), 16);
        onChange([(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => round((c / 255) * state.intensity)));
      };
      const color = colorInput(tint, (v) => ((state = { ...state, tint: v }), emit()));
      const power = numberInput({ kind: 'number', default: 1, min: 0, max: 5, step: 0.05 }, round(intensity), (v) => ((state = { ...state, intensity: v }), emit()));
      return el('span', { className: 'pair' }, color, el('small', { textContent: 'intensité' }), power);
    }
    case 'vector': {
      const values = [...(value as number[])];
      return el('span', { className: 'pair' }, ...values.map((v, i) => numberInput({ ...field, kind: 'number' }, v, (n) => onChange(values.map((old, j) => (j === i ? n : old))))));
    }
    case 'numbers': {
      const input = el('input', { type: 'text', value: (value as number[]).join(', ') });
      input.addEventListener('change', () => onChange(input.value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))));
      return input;
    }
    case 'model':
      return modelInput(String(value ?? ''), assets, onChange);
    case 'models':
      return list(value as string[], (item, set) => [modelInput(item, assets, set)], () => '', (items) => onChange(items));
    case 'image': {
      const select = el('select');
      select.append(el('option', { value: '', textContent: '(aucune)' }), ...assets.images.map((o) => el('option', { value: o, textContent: o, selected: o === value })));
      select.addEventListener('change', () => onChange(select.value));
      return select;
    }
    case 'colorMap': {
      const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toHex(v)] as [string, string]);
      return list(
        entries,
        ([k, v], set) => {
          const name = el('input', { type: 'text', value: k, placeholder: 'matériau' });
          name.addEventListener('change', () => set([name.value.trim(), v]));
          return [name, colorInput(v, (c) => set([k, c]))];
        },
        () => ['materiau', '#808080'],
        (items) => onChange(Object.fromEntries(items)),
      );
    }
    case 'group':
      return el('span', { textContent: '(groupe)' });
  }
}
