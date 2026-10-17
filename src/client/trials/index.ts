import type { TrialKind } from '../../core';
import { glyphes } from './glyphes';
import { horus } from './horus';
import type { TrialDef } from './trial';
import { verrou } from './verrou';

/** Registre des épreuves : une entrée par sorte déclarée dans core/trials.ts (vérifié par les tests). */
export const TRIALS: Record<TrialKind, TrialDef> = { verrou, glyphes, horus };
