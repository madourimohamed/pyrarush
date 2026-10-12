import { describe, expect, it } from 'vitest';
import { levels } from '../src/levels';
import { mergeProgress, nameProblem, normalizeProgress, passwordProblem } from '../src/net/account';
import { AccountError, AccountService, SESSION_DAYS } from './accounts';
import { openDatabase } from './db';

const ids = levels.map((l) => l.config.id);

function service(now = { t: 1_000_000 }) {
  return { accounts: new AccountService(openDatabase(':memory:'), ids, () => now.t), now };
}

describe('comptes', () => {
  it('crée un invité sans rien saisir ; sa session le retrouve', () => {
    const { accounts } = service();
    const { account, token } = accounts.createGuest();
    expect(account.secured).toBe(false);
    expect(account.name).toMatch(/^Explorateur\d{4}$/);
    expect(accounts.authenticate(token)?.id).toBe(account.id);
    expect(accounts.authenticate('faux-jeton')).toBeNull();
  });

  it('sécurise un invité (pseudo + mot de passe), donne un code de secours, puis permet de se reconnecter ailleurs', () => {
    const { accounts } = service();
    const guest = accounts.createGuest();
    accounts.saveProgress(guest.account.id, { unlocked: 3, levels: { [ids[0]]: { best: 90000, stars: 2 } } });
    const { account, recoveryCode } = accounts.secure(guest.account.id, 'Élodie', 'pyramide-du-sud');
    expect(account).toMatchObject({ name: 'Élodie', secured: true });
    expect(recoveryCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    const other = accounts.login('elodie', 'pyramide-du-sud'); // sans accent ni majuscule : même pseudo
    expect(other.account.id).toBe(guest.account.id);
    expect(other.account.progress.unlocked).toBe(3);
    expect(() => accounts.login('Élodie', 'mauvais-mot-de-passe')).toThrow(AccountError);
    expect(() => accounts.login('Inconnu', 'pyramide-du-sud')).toThrow('Pseudo ou mot de passe incorrect.');
  });

  it('refuse un pseudo déjà pris (même avec d’autres majuscules ou accents), y compris pour un invité', () => {
    const { accounts } = service();
    accounts.secure(accounts.createGuest().account.id, 'Karim', 'sable-et-soleil');
    const other = accounts.createGuest().account;
    expect(() => accounts.secure(other.id, 'KARÎM', 'autre-mot-de-passe')).toThrow('déjà pris');
    expect(() => accounts.rename(other.id, 'karim')).toThrow('déjà pris');
    expect(accounts.rename(other.id, 'Karima').name).toBe('Karima');
  });

  it('mot de passe oublié : le code de secours en donne un nouveau, ferme les anciennes sessions et change de code', () => {
    const { accounts } = service();
    const guest = accounts.createGuest();
    const { recoveryCode } = accounts.secure(guest.account.id, 'Nour', 'premier-secret');
    expect(() => accounts.recover('Nour', 'AAAA-BBBB-CCCC-DDDD', 'nouveau-secret')).toThrow('code de secours incorrect');
    const recovered = accounts.recover('nour', recoveryCode.toLowerCase(), 'nouveau-secret');
    expect(accounts.authenticate(guest.token)).toBeNull();
    expect(accounts.authenticate(recovered.token)?.id).toBe(guest.account.id);
    expect(recovered.recoveryCode).not.toBe(recoveryCode);
    expect(() => accounts.recover('Nour', recoveryCode, 'encore-un-autre')).toThrow(AccountError); // l'ancien code ne marche plus
    expect(accounts.login('Nour', 'nouveau-secret').account.id).toBe(guest.account.id);
  });

  it('les sessions expirent ; la déconnexion et la suppression du compte ferment tout', () => {
    const now = { t: 1_000_000 };
    const { accounts } = service(now);
    const { account, token } = accounts.createGuest();
    now.t += (SESSION_DAYS + 1) * 24 * 3600 * 1000;
    expect(accounts.authenticate(token)).toBeNull();
    const second = accounts.createGuest();
    accounts.logout(second.token);
    expect(accounts.authenticate(second.token)).toBeNull();
    const third = accounts.createGuest();
    accounts.delete(third.account.id);
    expect(accounts.authenticate(third.token)).toBeNull();
    expect(accounts.get(account.id)).not.toBeNull();
  });

  it('la progression reçue est nettoyée et fusionnée (on garde le meilleur des deux)', () => {
    const { accounts } = service();
    const { account } = accounts.createGuest();
    accounts.saveProgress(account.id, { unlocked: 4, levels: { [ids[0]]: { best: 80000, stars: 2 } } });
    const merged = accounts.saveProgress(account.id, {
      unlocked: 2,
      levels: { [ids[0]]: { best: 95000, stars: 3 }, [ids[1]]: { best: 12, stars: 9 }, inconnu: { best: 50000 } },
    });
    expect(merged.unlocked).toBe(4);
    expect(merged.levels[ids[0]]).toEqual({ best: 80000, stars: 3 });
    expect(merged.levels[ids[1]]).toBeUndefined(); // record impossible et étoiles hors bornes ignorés
    expect(merged.levels.inconnu).toBeUndefined();
  });
});

describe('règles partagées', () => {
  it('pseudos et mots de passe', () => {
    expect(nameProblem('Al')).toMatch(/entre/);
    expect(nameProblem('Super Explorateur 42')).toMatch(/entre/);
    expect(nameProblem('<script>')).toMatch(/uniquement/);
    expect(nameProblem('Admin du jeu')).toMatch(/autorisé/);
    expect(nameProblem('Léa-2')).toBeNull();
    expect(passwordProblem('court')).toMatch(/au moins/);
    expect(passwordProblem('azertyuiop')).toMatch(/courant/);
    expect(passwordProblem('le-sphinx-dort')).toBeNull();
  });

  it('progression : bornes et fusion', () => {
    expect(normalizeProgress({ unlocked: 99 }, ids).unlocked).toBe(ids.length);
    expect(normalizeProgress('n’importe quoi', ids)).toEqual({ unlocked: 1, levels: {}, bonus: null });
    expect(mergeProgress({ unlocked: 2, levels: {}, bonus: 'eye' }, { unlocked: 1, levels: {}, bonus: null }).bonus).toBeNull();
    // La démo faite sur un appareil reste faite après fusion (elle n'est montrée qu'une fois).
    expect(mergeProgress({ unlocked: 1, levels: {}, tutorial: true }, { unlocked: 1, levels: {} }).tutorial).toBe(true);
    expect(normalizeProgress({ tutorial: 'oui' }, ids).tutorial).toBeUndefined();
  });
});
