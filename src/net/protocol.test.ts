import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol';

describe('lecture des messages reçus', () => {
  it('refuse les messages mal formés ou aux valeurs absurdes', () => {
    expect(parseClientMessage('pas du json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'inconnu' }))).toBeNull();
    for (const floor of [0, -2, 1.5, '3', null]) expect(parseClientMessage(JSON.stringify({ t: 'floor', seq: 1, floor }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'floor', seq: 1.2, floor: 2 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'pos', p: [1, 2], ry: 0 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'create', level: 1.5, powers: 'many' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'power', seq: 1, power: 'laser', p: [0, 0, 0] }))).toBeNull();
  });

  it('accepte les messages valides', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'floor', seq: 3, floor: 2 }))).toEqual({ t: 'floor', seq: 3, floor: 2 });
    expect(parseClientMessage(JSON.stringify({ t: 'join', code: 'ABC234' }))).toEqual({ t: 'join', code: 'ABC234' });
    expect(parseClientMessage(JSON.stringify({ t: 'kick', id: 'p7' }))).toEqual({ t: 'kick', id: 'p7' });
  });
});
