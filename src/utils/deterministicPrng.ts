/**
 * Re-exporta todas las utilidades del PRNG determinista Mulberry32 y ruido 1D/2D
 * desde `./deterministicRandom` para compatibilidad con módulos existentes.
 */
export {
  computeDeterministicWordPulse,
  createDeterministicFrameContext,
  deriveBeatSeed,
  deterministicFbm1D,
  deterministicFbm2D,
  deterministicNoise1D,
  deterministicNoise2D,
  hashSeed32,
  mulberry32,
  mulberry32At,
  PRNG_CHANNEL,
  type DeterministicFrameContext,
} from './deterministicRandom';
