import { describe, expect, it } from 'vitest';
import { originAllowed, RateLimiter } from './security';

describe('protections', () => {
  it('connexion multijoueur : même site, origine autorisée, ou programme sans origine ; jamais un autre site', () => {
    expect(originAllowed('https://jeu.example.com', 'jeu.example.com')).toBe(true);
    expect(originAllowed('http://localhost:5173', 'localhost:5173')).toBe(true);
    expect(originAllowed('https://pirate.example.net', 'jeu.example.com')).toBe(false);
    expect(originAllowed('capacitor://localhost', 'jeu.example.com', ['capacitor://localhost'])).toBe(true);
    expect(originAllowed('pas une url', 'jeu.example.com')).toBe(false);
    expect(originAllowed(undefined, 'jeu.example.com')).toBe(true);
  });

  it('limite de fréquence : refus au-delà du maximum, puis remise à zéro après la fenêtre', () => {
    const now = { t: 0 };
    const limiter = new RateLimiter(2, 1000, () => now.t);
    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a')]).toEqual([true, true, false]);
    expect(limiter.blocked('a')).toBe(true);
    expect(limiter.hit('b')).toBe(true);
    now.t = 1000;
    expect(limiter.blocked('a')).toBe(false);
    expect(limiter.hit('a')).toBe(true);
  });
});
