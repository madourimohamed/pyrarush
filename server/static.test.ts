import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveStatic } from './static';

const dist = mkdtempSync(join(tmpdir(), 'pyrarush-dist-'));
mkdirSync(join(dist, 'assets'));
writeFileSync(join(dist, 'index.html'), '<!doctype html>');
writeFileSync(join(dist, 'assets', 'jeu.js'), '');

describe('fichiers du jeu', () => {
  it('sert les fichiers existants, et index.html pour le reste', () => {
    expect(resolveStatic(dist, '/assets/jeu.js?v=1')).toBe(join(dist, 'assets', 'jeu.js'));
    expect(resolveStatic(dist, '/niveau/3')).toBe(join(dist, 'index.html'));
  });

  it('une adresse mal encodée est refusée sans exception (elle arrêtait le serveur)', () => {
    expect(() => resolveStatic(dist, '/%E0%A4%A')).not.toThrow();
    expect(resolveStatic(dist, '/%E0%A4%A')).toBeNull();
    expect(resolveStatic(dist, '/%')).toBeNull();
    expect(resolveStatic(dist, '/a%00b')).toBeNull();
  });
});
