import { band, defineLevel } from '../core';
import { themes } from './themes';

export default defineLevel({
  name: 'Le Temple des Sables',
  tagline: 'Passages, murs et gants de boxe : apprends les bases.',
  duration: '2–5 min',
  highlights: ['Découvre les bases', 'Évite les gants de boxe', 'Saute les dalles fissurées', 'Atteins le sommet !'],
  // Étoiles : sommet atteint ; moins de 2 min 30 s ; au plus 1 chute. À ajuster après les tests.
  goals: { time: 150, maxFalls: 1 },
  rules: {
    floors: 6,
    // Temple compact (maquette) : 4 portes par face en bas, 2 en haut (16, 16, 12, 12, 8, 8 portes).
    doorsPerSideAtBase: 4,
    // Les pièges font perdre 1 étage ; seule la porte risquée (visible, choisie) va jusqu'à ±2.
    maxFloorsLost: 2,
    maxFloorsGained: 2,
    // Un bonus ne dépose jamais sur le dernier étage : depuis l'étage 3, la porte ±2 mène au 5 au mieux.
    protectedTopFloors: 1,
    bands: [
      band(1, 1, 2, { smallTrap: 2 }, 0),
      band(2, 2, 2, { smallTrap: 3 }, [1, 2]),
      band(3, 3, 2, { smallTrap: 2, riskyDoor: 1 }, [1, 2]), // ±2 : vers l'étage 5 ou l'étage 1
      band(4, 4, 2, { smallTrap: 2 }, 1, 1), // première dalle fissurée, une fois les bases acquises
      band(5, 6, 1, { smallTrap: 2 }, [1, 2], 1), // un seul passage en haut : le sommet se mérite
    ],
    settings: { riskyDoor: { amount: 2 } },
  },
  theme: themes.sables,
  // Identifiant d'avant le 2026-10-13 (rangé par position) : la progression déjà enregistrée suit le niveau.
  formerIds: ['level-1'],
});
