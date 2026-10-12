import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inside, resolveStatic } from './static';

const dist = mkdtempSync(join(tmpdir(), 'pyrarush-dist-'));
mkdirSync(join(dist, 'assets'));
writeFileSync(join(dist, 'index.html'), '<!doctype html>');
writeFileSync(join(dist, 'assets', 'jeu.js'), '');

describe('fichiers du jeu', () => {
  it('sert les fichiers existants, et index.html pour le reste', () => {
    expect(resolveStatic(dist, '/assets/jeu.js?v=1')).toBe(join(dist, 'assets', 'jeu.js'));
    expect(resolveStatic(dist, '/niveau/3')).toBe(join(dist, 'index.html'));
  });

  it('ne sort jamais du dossier du jeu, même vers un dossier voisin au nom proche (dist-server)', () => {
    mkdirSync(`${dist}-server`, { recursive: true });
    writeFileSync(join(`${dist}-server`, 'secret.txt'), 'secret');
    expect(inside(dist, join(dist, 'assets', 'jeu.js'))).toBe(true);
    expect(inside(dist, `${dist}-server/secret.txt`)).toBe(false);
    expect(inside(dist, '/etc/passwd')).toBe(false);
    for (const url of ['/../etc/passwd', '/..%2f..%2fetc%2fpasswd', `/..%2f${dist.split('/').pop()}-server%2fsecret.txt`]) {
      expect(resolveStatic(dist, url)).toBe(join(dist, 'index.html'));
    }
  });

  it('une adresse mal encodée est refusée sans exception (elle arrêtait le serveur)', () => {
    expect(() => resolveStatic(dist, '/%E0%A4%A')).not.toThrow();
    expect(resolveStatic(dist, '/%E0%A4%A')).toBeNull();
    expect(resolveStatic(dist, '/%')).toBeNull();
    expect(resolveStatic(dist, '/a%00b')).toBeNull();
  });
});
