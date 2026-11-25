import type {
  SceneVisualSpec,
  ScriptScene,
  VideoAspectRatio,
  ViralScript,
  VisualEnvironmentId,
  VisualMoodPalette,
  VisualPropIcon,
  VisualSubjectAction,
} from '../types';

export interface SceneVisualPalette {
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  floorA: string;
  floorB: string;
  rimLight: string;
  accent: string;
  accentGlow: string;
  skinBase: string;
  skinShadow: string;
  skinHighlight: string;
  outfitPrimary: string;
  outfitSecondary: string;
  particleColor: string;
}

export type CharacterEmotion =
  | 'shock'
  | 'curious'
  | 'excited'
  | 'intense'
  | 'happy'
  | 'stressed'
  | 'peaceful'
  | 'triumphant';

export interface SceneVisualContext {
  environment: VisualEnvironmentId;
  mainSubject: VisualSubjectAction;
  propIcon: VisualPropIcon;
  moodPalette: VisualMoodPalette;
  hasCrowd: boolean;
  isViralMeme: boolean;
  emotion: CharacterEmotion;
  palette: SceneVisualPalette;
}

export interface ProceduralFrameParams {
  width: number;
  height: number;
  scene: ScriptScene;
  script: ViralScript;
  /** Elapsed time inside the current scene in seconds */
  localElapsed: number;
  /** Total duration of the current scene in seconds */
  sceneDuration: number;
  /** Continuous animation clock (never stops, ensures 0 static seconds) */
  liveClockSec: number;
  /** True when playback or export is actively advancing narration */
  isSpeaking: boolean;
  /** 0..1 decaying impulse triggered each time an Impacto subtitle word highlights */
  wordPulse: number;
  /** Accent color from subtitleConfig */
  accentColor?: string;
  /** True when user prefers reduced motion */
  reducedMotion?: boolean;
}

const MOOD_PALETTES: Record<VisualMoodPalette, SceneVisualPalette> = {
  warm_energy: {
    skyTop: '#1E293B',
    skyMid: '#B45309',
    skyBottom: '#F59E0B',
    floorA: '#3F6212',
    floorB: '#1A2E05',
    rimLight: '#FEF08A',
    accent: '#F97316',
    accentGlow: 'rgba(249, 115, 22, 0.48)',
    skinBase: '#F2B892',
    skinShadow: '#9A573B',
    skinHighlight: '#FFE5D0',
    outfitPrimary: '#F97316',
    outfitSecondary: '#1E293B',
    particleColor: '#FEF08A',
  },
  neon_science: {
    skyTop: '#070B1E',
    skyMid: '#1D1852',
    skyBottom: '#3B287A',
    floorA: '#161D42',
    floorB: '#0B1028',
    rimLight: '#38BDF8',
    accent: '#A855F7',
    accentGlow: 'rgba(168, 85, 247, 0.5)',
    skinBase: '#F0B68F',
    skinShadow: '#8F4E3A',
    skinHighlight: '#FFE3CE',
    outfitPrimary: '#E2E8F0',
    outfitSecondary: '#0284C7',
    particleColor: '#7DD3FC',
  },
  crimson_pulse: {
    skyTop: '#1A0710',
    skyMid: '#581326',
    skyBottom: '#9F1239',
    floorA: '#3B0D1C',
    floorB: '#1C060E',
    rimLight: '#FDA4AF',
    accent: '#FB7185',
    accentGlow: 'rgba(251, 113, 133, 0.52)',
    skinBase: '#F3BA94',
    skinShadow: '#9A543C',
    skinHighlight: '#FFE5D3',
    outfitPrimary: '#F8FAFC',
    outfitSecondary: '#E11D48',
    particleColor: '#FDA4AF',
  },
  emerald_vitality: {
    skyTop: '#062019',
    skyMid: '#0F513D',
    skyBottom: '#22C55E',
    floorA: '#14532D',
    floorB: '#052E16',
    rimLight: '#BBF7D0',
    accent: '#10B981',
    accentGlow: 'rgba(16, 185, 129, 0.48)',
    skinBase: '#F1B791',
    skinShadow: '#96543A',
    skinHighlight: '#FFE4CF',
    outfitPrimary: '#10B981',
    outfitSecondary: '#0F172A',
    particleColor: '#86EFAC',
  },
  golden_history: {
    skyTop: '#1A1124',
    skyMid: '#643235',
    skyBottom: '#D97B48',
    floorA: '#D6C4AA',
    floorB: '#8E785E',
    rimLight: '#FDE68A',
    accent: '#F59E0B',
    accentGlow: 'rgba(245, 158, 11, 0.52)',
    skinBase: '#F2B892',
    skinShadow: '#9E5A3E',
    skinHighlight: '#FFE4CE',
    outfitPrimary: '#F5F0E6',
    outfitSecondary: '#B91C1C',
    particleColor: '#FDE68A',
  },
  alert_stress: {
    skyTop: '#19080A',
    skyMid: '#5C1414',
    skyBottom: '#C2410C',
    floorA: '#2D1418',
    floorB: '#16090B',
    rimLight: '#FDBA74',
    accent: '#EF4444',
    accentGlow: 'rgba(239, 68, 68, 0.54)',
    skinBase: '#F0B58E',
    skinShadow: '#944F39',
    skinHighlight: '#FFE2CC',
    outfitPrimary: '#334155',
    outfitSecondary: '#DC2626',
    particleColor: '#FCA5A5',
  },
  cosmic_indigo: {
    skyTop: '#030512',
    skyMid: '#131845',
    skyBottom: '#312E81',
    floorA: '#1E1B4B',
    floorB: '#090A20',
    rimLight: '#C4B5FD',
    accent: '#818CF8',
    accentGlow: 'rgba(129, 140, 248, 0.52)',
    skinBase: '#EBB08A',
    skinShadow: '#884B37',
    skinHighlight: '#FFE0C9',
    outfitPrimary: '#E0E7FF',
    outfitSecondary: '#4338CA',
    particleColor: '#E0E7FF',
  },
  wealth_gold: {
    skyTop: '#071713',
    skyMid: '#0F3B2E',
    skyBottom: '#166534',
    floorA: '#132A22',
    floorB: '#07130F',
    rimLight: '#FEF08A',
    accent: '#EAB308',
    accentGlow: 'rgba(234, 179, 8, 0.5)',
    skinBase: '#F2B892',
    skinShadow: '#97543A',
    skinHighlight: '#FFE5D1',
    outfitPrimary: '#0F172A',
    outfitSecondary: '#CA8A04',
    particleColor: '#FDE047',
  },
  calm_storybook: {
    skyTop: '#132244',
    skyMid: '#2D597D',
    skyBottom: '#E6A762',
    floorA: '#2F5642',
    floorB: '#193226',
    rimLight: '#FEF3C7',
    accent: '#F59E0B',
    accentGlow: 'rgba(245, 158, 11, 0.45)',
    skinBase: '#F3BC96',
    skinShadow: '#9A5A3F',
    skinHighlight: '#FFE7D4',
    outfitPrimary: '#2563EB',
    outfitSecondary: '#D97706',
    particleColor: '#FEF08A',
  },
  cyber_cyan: {
    skyTop: '#050B16',
    skyMid: '#0E2744',
    skyBottom: '#0C4A6E',
    floorA: '#0F223A',
    floorB: '#060E1C',
    rimLight: '#67E8F9',
    accent: '#06B6D4',
    accentGlow: 'rgba(6, 182, 212, 0.52)',
    skinBase: '#EDB28C',
    skinShadow: '#8E4E39',
    skinHighlight: '#FFE1CB',
    outfitPrimary: '#1E293B',
    outfitSecondary: '#06B6D4',
    particleColor: '#67E8F9',
  },
};

const ENVIRONMENT_LABELS_ES: Record<VisualEnvironmentId, string> = {
  park_walking: 'Parque',
  brain_neurons: 'Cerebro',
  heart_bloodflow: 'Corazón',
  muscles_gym: 'Energía',
  sleep_bedroom: 'Descanso',
  ancient_rome: 'Roma',
  medieval_castle: 'Castillo',
  space_cosmos: 'Espacio',
  money_charts: 'Finanzas',
  office_desk: 'Oficina',
  city_street: 'Ciudad',
  tech_studio: 'Tech',
  forest_stream: 'Bosque',
  ocean_deep: 'Océano',
  survival_wild: 'Naturaleza',
  mystery_vault: 'Misterio',
};

const PROP_LABELS_ES: Record<VisualPropIcon, string> = {
  sneakers_steps: 'Pasos',
  brain_glow: 'Neuronas',
  heart_pulse: 'Pulso',
  dumbbell: 'Fuerza',
  clock_calendar: '30 Días',
  bluetooth_speaker: 'Bocina',
  coin_chart: 'Gráfico',
  smartphone_glow: 'Móvil',
  compass_map: 'Brújula',
  planet_rocket: 'Órbita',
  warning_bolt: 'Alerta',
  energy_sun: 'Vitalidad',
  paper_boat: 'Barquito',
  coffee_cup: 'Rutina',
  shield_lock: 'Escudo',
};

/**
 * Infiere un visualSpec distinto por escena SOLO a partir del texto de esa escena,
 * usando la premisa general solo como último respaldo y rotando por orden de escena
 * para que nunca dos escenas consecutivas se vean idénticas.
 */
function inferFallbackVisualSpec(scene: ScriptScene, script: ViralScript): SceneVisualSpec {
  const sceneText = `${scene.narracion} ${scene.subtituloDinamico} ${scene.promptVisual3D}`.toLowerCase();
  const globalText = `${script.premisa} ${script.nicho} ${script.tituloViral}`.toLowerCase();

  let environment: VisualEnvironmentId | null = null;
  let mainSubject: VisualSubjectAction | null = null;
  let propIcon: VisualPropIcon | null = null;
  let moodPalette: VisualMoodPalette | null = null;

  // 1. Señales fuertes de la escena individual
  if (/(coraz[oó]n|sangre|arteri|circulaci[oó]n|latid|pulso|presi[oó]n|ox[ií]geno)/i.test(sceneText)) {
    environment = 'heart_bloodflow';
    mainSubject = 'running_fast';
    propIcon = 'heart_pulse';
    moodPalette = 'crimson_pulse';
  } else if (/(cerebro|mente|neurona|cortisol|estr[eé]s|ansiedad|dopamina|serotonina|enfoque|memoria|psicolog)/i.test(sceneText)) {
    environment = 'brain_neurons';
    mainSubject = /(estr[eé]s|cortisol|ansiedad|agotad|bloqueo)/i.test(sceneText)
      ? 'stressed_head'
      : 'thinking_curious';
    propIcon = 'brain_glow';
    moodPalette = /(estr[eé]s|cortisol|alerta|peligro)/i.test(sceneText)
      ? 'alert_stress'
      : 'neon_science';
  } else if (/(m[uú]scul|pierna|fuerza|gimnasio|pesa|metabolismo|calor[ií]a|resistencia|cuerpo fuerte)/i.test(sceneText)) {
    environment = 'muscles_gym';
    mainSubject = 'flexing_muscles';
    propIcon = 'dumbbell';
    moodPalette = 'warm_energy';
  } else if (/(dormir|sue[nñ]o|noche|descanso|cama|insomnio|despertar)/i.test(sceneText)) {
    environment = 'sleep_bedroom';
    mainSubject = 'sleeping_peaceful';
    propIcon = 'clock_calendar';
    moodPalette = 'cosmic_indigo';
  } else if (/(caminar|pasos|zapatilla|parque|sendero|20 minutos|caminata|trotar)/i.test(sceneText)) {
    environment = 'park_walking';
    mainSubject = /(d[ií]a 30|transforma|logro|feliz|resultado)/i.test(sceneText)
      ? 'triumphant_celebrate'
      : 'walking_happy';
    propIcon = /(d[ií]a|semana|calendario|30 d[ií]as|20 minutos)/i.test(sceneText)
      ? 'clock_calendar'
      : 'sneakers_steps';
    moodPalette = 'emerald_vitality';
  } else if (/(roma|senado|emperador|coliseo|gladiador|toga|c[eé]sar)/i.test(sceneText)) {
    environment = 'ancient_rome';
    mainSubject = /(bocina|altavoz|m[uú]sica)/i.test(sceneText) ? 'holding_speaker' : 'shocked_crowd';
    propIcon = /(bocina|altavoz|m[uú]sica)/i.test(sceneText) ? 'bluetooth_speaker' : 'warning_bolt';
    moodPalette = 'golden_history';
  } else if (/(castillo|caballero|medieval|espada|reino|rey|armadura)/i.test(sceneText)) {
    environment = 'medieval_castle';
    mainSubject = 'exploring_pov';
    propIcon = 'shield_lock';
    moodPalette = 'golden_history';
  } else if (/(espacio|planeta|universo|galaxia|luna|marte|astronauta|estrella|cohete)/i.test(sceneText)) {
    environment = 'space_cosmos';
    mainSubject = 'exploring_pov';
    propIcon = 'planet_rocket';
    moodPalette = 'cosmic_indigo';
  } else if (/(dinero|ahorro|inversi[oó]n|mill[oó]n|banco|gasto|bolsillo|riqueza|moneda|sueldo|finanza)/i.test(sceneText)) {
    environment = 'money_charts';
    mainSubject = 'counting_money';
    propIcon = 'coin_chart';
    moodPalette = 'wealth_gold';
  } else if (/(celular|tel[eé]fono|app|bater[ií]a|inteligencia artificial|pantalla|privacidad|ajuste|algoritmo)/i.test(sceneText)) {
    environment = 'tech_studio';
    mainSubject = 'working_focused';
    propIcon = 'smartphone_glow';
    moodPalette = 'cyber_cyan';
  } else if (/(oficina|trabajo|jefe|productiv|caf[eé]|escritorio|procrastin)/i.test(sceneText)) {
    environment = 'office_desk';
    mainSubject = 'working_focused';
    propIcon = 'coffee_cup';
    moodPalette = 'cyber_cyan';
  } else if (/(puente|bosque|arroyo|barquito|r[ií]o|tortuga|cuento|[aá]rbol|br[uú]jula)/i.test(sceneText)) {
    environment = /(agua|arroyo|bajo el agua|onda)/i.test(sceneText) ? 'ocean_deep' : 'forest_stream';
    mainSubject = /(caminar|cruzar|sendero)/i.test(sceneText) ? 'walking_happy' : 'exploring_pov';
    propIcon = /(barquito|barca)/i.test(sceneText)
      ? 'paper_boat'
      : /(br[uú]jula|mapa)/i.test(sceneText)
        ? 'compass_map'
        : 'energy_sun';
    moodPalette = 'calm_storybook';
  } else if (/(oc[eé]ano|mar|submarino|abismo|tibur[oó]n|bajo el agua)/i.test(sceneText)) {
    environment = 'ocean_deep';
    mainSubject = 'exploring_pov';
    propIcon = 'compass_map';
    moodPalette = 'cyber_cyan';
  } else if (/(supervivencia|selva|monta[nñ]a|desierto|perdido|isla|peligro)/i.test(sceneText)) {
    environment = 'survival_wild';
    mainSubject = 'exploring_pov';
    propIcon = 'compass_map';
    moodPalette = 'alert_stress';
  } else if (/(secreto|misterio|b[oó]veda|c[oó]digo|oculto|puerta|fortuna|reloj)/i.test(sceneText)) {
    environment = 'mystery_vault';
    mainSubject = 'thinking_curious';
    propIcon = 'shield_lock';
    moodPalette = 'cosmic_indigo';
  } else if (/(calle|ciudad|tr[aá]fico|edificio|mercado|marca|tienda)/i.test(sceneText)) {
    environment = 'city_street';
    mainSubject = 'walking_happy';
    propIcon = 'energy_sun';
    moodPalette = 'warm_energy';
  }

  // 2. Respaldo por tema general + progresión variada por orden de escena (evita clones entre tarjetas)
  if (!environment || !mainSubject || !propIcon || !moodPalette) {
    const isHealthGlobal = /(caminar|salud|cuerpo|h[aá]bito|ejercicio|dormir|bienestar)/i.test(globalText);
    const isFinanceGlobal = /(dinero|ahorro|finanza|negocio|marca|mill[oó]n)/i.test(globalText);
    const isHistoryGlobal = /(roma|medieval|historia|antigu|imperio)/i.test(globalText);
    const isStoryGlobal = script.publicoObjetivo === 'kids' || /(cuento|bosque|puente|aventura)/i.test(globalText);

    const healthCycle: Array<Omit<SceneVisualSpec, 'flowPrompt'>> = [
      { environment: 'park_walking', mainSubject: 'walking_happy', propIcon: 'sneakers_steps', moodPalette: 'emerald_vitality' },
      { environment: 'heart_bloodflow', mainSubject: 'running_fast', propIcon: 'heart_pulse', moodPalette: 'crimson_pulse' },
      { environment: 'brain_neurons', mainSubject: 'thinking_curious', propIcon: 'brain_glow', moodPalette: 'neon_science' },
      { environment: 'muscles_gym', mainSubject: 'flexing_muscles', propIcon: 'dumbbell', moodPalette: 'warm_energy' },
      { environment: 'sleep_bedroom', mainSubject: 'sleeping_peaceful', propIcon: 'clock_calendar', moodPalette: 'cosmic_indigo' },
      { environment: 'park_walking', mainSubject: 'triumphant_celebrate', propIcon: 'energy_sun', moodPalette: 'warm_energy' },
    ];
    const financeCycle: Array<Omit<SceneVisualSpec, 'flowPrompt'>> = [
      { environment: 'money_charts', mainSubject: 'counting_money', propIcon: 'coin_chart', moodPalette: 'wealth_gold' },
      { environment: 'office_desk', mainSubject: 'working_focused', propIcon: 'coffee_cup', moodPalette: 'cyber_cyan' },
      { environment: 'city_street', mainSubject: 'walking_happy', propIcon: 'smartphone_glow', moodPalette: 'warm_energy' },
      { environment: 'mystery_vault', mainSubject: 'thinking_curious', propIcon: 'shield_lock', moodPalette: 'wealth_gold' },
    ];
    const historyCycle: Array<Omit<SceneVisualSpec, 'flowPrompt'>> = [
      { environment: 'ancient_rome', mainSubject: 'exploring_pov', propIcon: 'compass_map', moodPalette: 'golden_history' },
      { environment: 'medieval_castle', mainSubject: 'thinking_curious', propIcon: 'shield_lock', moodPalette: 'golden_history' },
      { environment: 'mystery_vault', mainSubject: 'triumphant_celebrate', propIcon: 'energy_sun', moodPalette: 'warm_energy' },
    ];
    const storyCycle: Array<Omit<SceneVisualSpec, 'flowPrompt'>> = [
      { environment: 'forest_stream', mainSubject: 'walking_happy', propIcon: 'paper_boat', moodPalette: 'calm_storybook' },
      { environment: 'ocean_deep', mainSubject: 'exploring_pov', propIcon: 'compass_map', moodPalette: 'cyber_cyan' },
      { environment: 'park_walking', mainSubject: 'triumphant_celebrate', propIcon: 'energy_sun', moodPalette: 'warm_energy' },
      { environment: 'sleep_bedroom', mainSubject: 'thinking_curious', propIcon: 'clock_calendar', moodPalette: 'cosmic_indigo' },
    ];
    const generalCycle: Array<Omit<SceneVisualSpec, 'flowPrompt'>> = [
      { environment: 'tech_studio', mainSubject: 'thinking_curious', propIcon: 'smartphone_glow', moodPalette: 'cyber_cyan' },
      { environment: 'brain_neurons', mainSubject: 'working_focused', propIcon: 'brain_glow', moodPalette: 'neon_science' },
      { environment: 'city_street', mainSubject: 'walking_happy', propIcon: 'energy_sun', moodPalette: 'warm_energy' },
      { environment: 'space_cosmos', mainSubject: 'exploring_pov', propIcon: 'planet_rocket', moodPalette: 'cosmic_indigo' },
      { environment: 'money_charts', mainSubject: 'triumphant_celebrate', propIcon: 'coin_chart', moodPalette: 'wealth_gold' },
    ];

    const pool = isHealthGlobal
      ? healthCycle
      : isFinanceGlobal
        ? financeCycle
        : isHistoryGlobal
          ? historyCycle
          : isStoryGlobal
            ? storyCycle
            : generalCycle;

    const pick = pool[Math.max(0, scene.orden - 1) % pool.length];
    environment = environment ?? pick.environment;
    mainSubject = mainSubject ?? pick.mainSubject;
    propIcon = propIcon ?? pick.propIcon;
    moodPalette = moodPalette ?? pick.moodPalette;
  }

  return {
    environment,
    mainSubject,
    propIcon,
    moodPalette,
    flowPrompt: '',
  };
}

export function analyzeSceneContext(scene: ScriptScene, script: ViralScript): SceneVisualContext {
  const spec = scene.visualSpec ?? inferFallbackVisualSpec(scene, script);
  const environment = spec.environment;
  const mainSubject = spec.mainSubject;
  const propIcon = spec.propIcon;
  const moodPalette = spec.moodPalette;

  const isViralMeme =
    script.estilo3D === 'viral_meme_3d' ||
    script.publicoObjetivo === 'viral_meme' ||
    mainSubject === 'shocked_crowd' ||
    mainSubject === 'holding_speaker';

  let emotion: CharacterEmotion = 'excited';
  if (mainSubject === 'stressed_head') {
    emotion = 'stressed';
  } else if (mainSubject === 'sleeping_peaceful') {
    emotion = 'peaceful';
  } else if (mainSubject === 'triumphant_celebrate' || mainSubject === 'flexing_muscles') {
    emotion = 'triumphant';
  } else if (mainSubject === 'shocked_crowd') {
    emotion = 'shock';
  } else if (mainSubject === 'thinking_curious' || scene.fase === 'Dato clave') {
    emotion = 'curious';
  } else if (mainSubject === 'walking_happy' || script.publicoObjetivo === 'kids') {
    emotion = 'happy';
  } else if (scene.fase === 'Tensión' || scene.fase === 'Escalada' || mainSubject === 'running_fast') {
    emotion = 'intense';
  } else if (scene.esGiro30s || scene.fase === 'Giro' || scene.fase === 'Giro 30s') {
    emotion = isViralMeme ? 'shock' : 'excited';
  }

  // Solo mostrar multitud cuando la escena realmente pide multitud en shock
  const hasCrowd = mainSubject === 'shocked_crowd';

  return {
    environment,
    mainSubject,
    propIcon,
    moodPalette,
    hasCrowd,
    isViralMeme,
    emotion,
    palette: MOOD_PALETTES[moodPalette] ?? MOOD_PALETTES.warm_energy,
  };
}

export function getSceneVisualBadgeLabel(scene: ScriptScene, script: ViralScript): string {
  const ctx = analyzeSceneContext(scene, script);
  const envLabel = ENVIRONMENT_LABELS_ES[ctx.environment] ?? 'Escena';
  const propLabel = PROP_LABELS_ES[ctx.propIcon] ?? '3D';
  return `${envLabel} · ${propLabel}`;
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const t = Math.min(1, Math.max(0, x));
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

/**
 * Capa 1: Cielo volumétrico, foco trasero y suelo en perspectiva adaptado al entorno exacto
 */
function drawAtmosphericBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  parallaxX: number,
  context: SceneVisualContext,
  wordPulse: number
) {
  const { palette, environment } = context;

  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  skyGrad.addColorStop(0, palette.skyTop);
  skyGrad.addColorStop(0.55, palette.skyMid);
  skyGrad.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-w * 0.15, -h * 0.15, w * 1.3, h * 1.3);

  const sunX = w * 0.52 - parallaxX * 0.18;
  const sunY = environment === 'sleep_bedroom' || environment === 'space_cosmos' ? h * 0.24 : h * 0.34;
  const sunR = Math.min(w, h) * (0.48 + wordPulse * 0.06);
  const sunGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.05, sunX, sunY, sunR);
  sunGlow.addColorStop(0, 'rgba(255, 248, 228, 0.52)');
  sunGlow.addColorStop(0.35, palette.accentGlow);
  sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(-w * 0.1, -h * 0.1, w * 1.2, h * 1.2);

  // Rayos volumétricos suaves
  if (environment !== 'space_cosmos' && environment !== 'sleep_bedroom') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const angle = -0.52 + i * 0.34 + Math.sin(t * 0.7 + i * 1.3) * 0.055;
      ctx.save();
      ctx.translate(sunX, sunY - h * 0.25);
      ctx.rotate(angle);
      const rayW = w * (0.14 + (i % 2) * 0.06);
      const rayGrad = ctx.createLinearGradient(0, 0, 0, h * 1.15);
      rayGrad.addColorStop(0, `rgba(255, 238, 198, ${(0.14 + wordPulse * 0.06).toFixed(3)})`);
      rayGrad.addColorStop(0.65, 'rgba(255, 210, 150, 0.03)');
      rayGrad.addColorStop(1, 'rgba(255, 210, 150, 0)');
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(-rayW * 0.28, 0);
      ctx.lineTo(rayW * 0.28, 0);
      ctx.lineTo(rayW * 1.35, h * 1.15);
      ctx.lineTo(-rayW * 1.35, h * 1.15);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // Suelo en perspectiva (excepto entornos flotantes: espacio, océano, neuronas, flujo arterial)
  const isFloatingSpace =
    environment === 'space_cosmos' ||
    environment === 'ocean_deep' ||
    environment === 'brain_neurons' ||
    environment === 'heart_bloodflow';

  const horizonY = h * 0.62;
  const vanishX = w * 0.5 - parallaxX * 0.42;

  if (!isFloatingSpace) {
    const floorGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    floorGrad.addColorStop(0, palette.floorB);
    floorGrad.addColorStop(0.45, palette.floorA);
    floorGrad.addColorStop(1, '#090B12');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(-w * 0.15, horizonY, w * 1.3, h * 0.55);

    ctx.save();
    ctx.beginPath();
    ctx.rect(-w * 0.15, horizonY, w * 1.3, h * 0.55);
    ctx.clip();

    if (environment === 'park_walking' || environment === 'city_street') {
      // Sendero de parque o avenida en perspectiva con líneas en movimiento
      const roadGrad = ctx.createLinearGradient(0, horizonY, 0, h);
      roadGrad.addColorStop(0, environment === 'park_walking' ? '#D6B88D' : '#334155');
      roadGrad.addColorStop(1, environment === 'park_walking' ? '#8A6743' : '#0F172A');
      ctx.fillStyle = roadGrad;
      ctx.beginPath();
      ctx.moveTo(vanishX - w * 0.08, horizonY);
      ctx.lineTo(vanishX + w * 0.08, horizonY);
      ctx.lineTo(vanishX + w * 0.52, h * 1.1);
      ctx.lineTo(vanishX - w * 0.52, h * 1.1);
      ctx.closePath();
      ctx.fill();

      // Bordes luminosos del sendero
      ctx.strokeStyle = environment === 'park_walking' ? 'rgba(254, 240, 138, 0.45)' : 'rgba(248, 250, 252, 0.38)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(vanishX - w * 0.08, horizonY);
      ctx.lineTo(vanishX - w * 0.52, h * 1.1);
      ctx.moveTo(vanishX + w * 0.08, horizonY);
      ctx.lineTo(vanishX + w * 0.52, h * 1.1);
      ctx.stroke();

      // Marcas centrales avanzando hacia cámara (sensación real de caminar)
      const dashPhase = (t * 1.15) % 1;
      for (let i = 0; i < 6; i++) {
        const p0 = Math.pow((i + dashPhase) / 6, 1.85);
        const p1 = Math.pow((i + dashPhase + 0.42) / 6, 1.85);
        const y0 = horizonY + p0 * (h * 0.48);
        const y1 = horizonY + p1 * (h * 0.48);
        ctx.strokeStyle =
          environment === 'park_walking'
            ? `rgba(255, 250, 235, ${(0.55 * p0).toFixed(3)})`
            : `rgba(250, 204, 21, ${(0.75 * p0).toFixed(3)})`;
        ctx.lineWidth = 2 + p0 * 8;
        ctx.beginPath();
        ctx.moveTo(vanishX, y0);
        ctx.lineTo(vanishX, y1);
        ctx.stroke();
      }
    } else if (environment === 'ancient_rome' || environment === 'medieval_castle') {
      // Baldosas de mármol o piedra en perspectiva
      for (let i = -8; i <= 8; i++) {
        ctx.strokeStyle = 'rgba(72, 46, 28, 0.34)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(vanishX + i * w * 0.055, horizonY);
        ctx.lineTo(vanishX + i * w * 0.26, h * 1.12);
        ctx.stroke();
      }
      for (let row = 1; row <= 7; row++) {
        const p = Math.pow(row / 7, 1.75);
        const y = horizonY + p * (h * 0.45);
        ctx.strokeStyle = `rgba(255, 240, 215, ${(0.22 * p).toFixed(3)})`;
        ctx.lineWidth = 1.5 + p * 2;
        ctx.beginPath();
        ctx.moveTo(-w * 0.1, y);
        ctx.lineTo(w * 1.1, y);
        ctx.stroke();
      }
    } else {
      // Cuadrícula / plano espacial 3D
      for (let i = -7; i <= 7; i++) {
        ctx.strokeStyle = `${palette.accent}33`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(vanishX + i * w * 0.05, horizonY);
        ctx.lineTo(vanishX + i * w * 0.28, h * 1.15);
        ctx.stroke();
      }
      const scrollPhase = (t * 0.65) % 1;
      for (let row = 0; row < 7; row++) {
        const p = Math.pow((row + scrollPhase) / 7, 1.85);
        const y = horizonY + p * (h * 0.44);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.18 * p).toFixed(3)})`;
        ctx.lineWidth = 1 + p * 1.6;
        ctx.beginPath();
        ctx.moveTo(-w * 0.1, y);
        ctx.lineTo(w * 1.1, y);
        ctx.stroke();
      }
    }

    ctx.restore();

    const fogGrad = ctx.createLinearGradient(0, horizonY - h * 0.1, 0, horizonY + h * 0.1);
    fogGrad.addColorStop(0, 'rgba(0,0,0,0)');
    fogGrad.addColorStop(0.5, palette.accentGlow.replace(/[\d.]+\)$/, '0.24)'));
    fogGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fogGrad;
    ctx.fillRect(-w * 0.1, horizonY - h * 0.1, w * 1.2, h * 0.2);
  }
}

function drawRomanColumn(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  bottomY: number,
  colW: number,
  depthAlpha: number
) {
  ctx.save();
  ctx.globalAlpha = depthAlpha;

  ctx.fillStyle = 'rgba(20, 10, 6, 0.36)';
  ctx.beginPath();
  ctx.ellipse(cx + colW * 0.35, bottomY + colW * 0.14, colW * 0.95, colW * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();

  const shaftGrad = ctx.createLinearGradient(cx - colW / 2, 0, cx + colW / 2, 0);
  shaftGrad.addColorStop(0, '#FFF5E4');
  shaftGrad.addColorStop(0.28, '#E6D6C1');
  shaftGrad.addColorStop(0.72, '#8F7760');
  shaftGrad.addColorStop(0.92, '#5A4637');
  shaftGrad.addColorStop(1, '#D6A472');
  ctx.fillStyle = shaftGrad;
  ctx.fillRect(cx - colW / 2, topY, colW, bottomY - topY);

  for (let i = -2; i <= 2; i++) {
    const fx = cx + (i * colW) / 6;
    ctx.strokeStyle = i < 0 ? 'rgba(255,255,255,0.28)' : 'rgba(42,26,16,0.28)';
    ctx.lineWidth = Math.max(1.5, colW * 0.045);
    ctx.beginPath();
    ctx.moveTo(fx, topY + colW * 0.25);
    ctx.lineTo(fx, bottomY - colW * 0.22);
    ctx.stroke();
  }

  const capW = colW * 1.48;
  const capH = colW * 0.42;
  const capGrad = ctx.createLinearGradient(cx - capW / 2, topY, cx + capW / 2, topY + capH);
  capGrad.addColorStop(0, '#FFF7EA');
  capGrad.addColorStop(0.55, '#D2BEA4');
  capGrad.addColorStop(1, '#6B5442');
  ctx.fillStyle = capGrad;
  drawRoundedRectPath(ctx, cx - capW / 2, topY - capH * 0.25, capW, capH, 6);
  ctx.fill();

  const baseW = colW * 1.42;
  const baseH = colW * 0.34;
  ctx.fillStyle = capGrad;
  drawRoundedRectPath(ctx, cx - baseW / 2, bottomY - baseH * 0.85, baseW, baseH, 5);
  ctx.fill();

  ctx.restore();
}

function drawStylizedTree3D(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  scale: number,
  t: number,
  seed: number
) {
  const sway = Math.sin(t * 2.1 + seed) * 4 * scale;
  ctx.save();
  ctx.translate(x, baseY);

  // Sombra
  ctx.fillStyle = 'rgba(8, 28, 16, 0.36)';
  ctx.beginPath();
  ctx.ellipse(0, 4 * scale, 48 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tronco 3D
  const trunkGrad = ctx.createLinearGradient(-12 * scale, 0, 12 * scale, 0);
  trunkGrad.addColorStop(0, '#A16207');
  trunkGrad.addColorStop(0.55, '#713F12');
  trunkGrad.addColorStop(1, '#422006');
  ctx.fillStyle = trunkGrad;
  drawRoundedRectPath(ctx, -11 * scale, -108 * scale, 22 * scale, 112 * scale, 8 * scale);
  ctx.fill();

  // Copa 3D en 3 lóbulos sombreados
  const blobs = [
    { ox: -26 * scale + sway * 0.8, oy: -118 * scale, r: 42 * scale },
    { ox: 26 * scale + sway * 0.8, oy: -114 * scale, r: 39 * scale },
    { ox: sway, oy: -152 * scale, r: 52 * scale },
  ];
  blobs.forEach((b) => {
    const g = ctx.createRadialGradient(b.ox - b.r * 0.3, b.oy - b.r * 0.3, 4 * scale, b.ox, b.oy, b.r * 1.1);
    g.addColorStop(0, '#86EFAC');
    g.addColorStop(0.45, '#16A34A');
    g.addColorStop(1, '#14532D');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.ox, b.oy, b.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

/**
 * Capa 2: 16 Escenografías distintas en perspectiva y paralaje 2.5D/3D
 */
function drawStageArchitecture(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  parallaxX: number,
  context: SceneVisualContext,
  wordPulse: number
) {
  const horizonY = h * 0.62;
  const unit = Math.min(w, h) / 720;

  switch (context.environment) {
    case 'park_walking': {
      // Colinas soleadas en capas de paralaje
      const hillLayers = [
        { y: horizonY - h * 0.05, amp: h * 0.05, color: '#166534', p: 0.35 },
        { y: horizonY + h * 0.01, amp: h * 0.035, color: '#15803D', p: 0.65 },
      ];
      hillLayers.forEach((layer, idx) => {
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.moveTo(-w * 0.2, horizonY + h * 0.04);
        for (let x = -w * 0.2; x <= w * 1.2; x += w * 0.14) {
          const wave = Math.sin((x + parallaxX * layer.p * 2) * 0.008 + idx * 1.8) * layer.amp;
          ctx.lineTo(x, layer.y + wave);
        }
        ctx.lineTo(w * 1.2, horizonY + h * 0.04);
        ctx.closePath();
        ctx.fill();
      });

      // Árboles 3D pasando en profundidad a ambos lados del sendero
      const scroll = (t * 0.45) % 1;
      for (let i = 0; i < 3; i++) {
        const depth = (i + scroll) / 3;
        const scale = unit * (0.42 + depth * 0.95);
        const y = horizonY + Math.pow(depth, 1.5) * h * 0.14;
        const spread = w * (0.28 + depth * 0.26);
        drawStylizedTree3D(ctx, w * 0.5 - spread - parallaxX * (0.4 + depth * 0.5), y, scale, t, i * 2.1);
        drawStylizedTree3D(ctx, w * 0.5 + spread - parallaxX * (0.4 + depth * 0.5), y, scale, t, i * 2.1 + 1);
      }
      break;
    }

    case 'brain_neurons': {
      // Red neuronal 3D conectada con impulsos eléctricos animados
      const nodes = [
        { x: w * 0.14, y: h * 0.2 },
        { x: w * 0.36, y: h * 0.14 },
        { x: w * 0.68, y: h * 0.16 },
        { x: w * 0.88, y: h * 0.26 },
        { x: w * 0.18, y: h * 0.46 },
        { x: w * 0.82, y: h * 0.48 },
        { x: w * 0.28, y: h * 0.72 },
        { x: w * 0.74, y: h * 0.7 },
        { x: w * 0.5, y: h * 0.34 },
      ].map((n, idx) => ({
        x: n.x - parallaxX * (0.35 + (idx % 3) * 0.18) + Math.sin(t * 1.4 + idx) * 10 * unit,
        y: n.y + Math.cos(t * 1.2 + idx * 1.5) * 8 * unit,
      }));

      const edges = [
        [0, 1], [1, 2], [2, 3], [0, 4], [1, 8], [2, 8], [3, 5],
        [4, 8], [5, 8], [4, 6], [5, 7], [6, 8], [7, 8],
      ];

      ctx.save();
      edges.forEach(([a, b], idx) => {
        const na = nodes[a];
        const nb = nodes[b];
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.34)';
        ctx.lineWidth = 2.5 * unit;
        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
        ctx.stroke();

        // Pulso sináptico viajando por el axón
        const p = (t * 0.85 + idx * 0.19) % 1;
        const px = na.x + (nb.x - na.x) * p;
        const py = na.y + (nb.y - na.y) * p;
        ctx.fillStyle = idx % 2 === 0 ? '#38BDF8' : '#FACC15';
        ctx.beginPath();
        ctx.arc(px, py, (4 + wordPulse * 3) * unit, 0, Math.PI * 2);
        ctx.fill();
      });

      nodes.forEach((n, idx) => {
        const nr = (8 + (idx % 3) * 4) * unit;
        const g = ctx.createRadialGradient(n.x, n.y, 1, n.x, n.y, nr * 2.2);
        g.addColorStop(0, '#FFFFFF');
        g.addColorStop(0.35, idx % 2 === 0 ? '#38BDF8' : '#C084FC');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, nr * 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      break;
    }

    case 'heart_bloodflow': {
      // Túnel arterial 3D latiendo con glóbulos rojos/oxígeno circulando
      const cx = w * 0.5 - parallaxX * 0.45;
      const cy = h * 0.42;
      const beat = Math.pow(0.5 + 0.5 * Math.sin(t * 7.2), 3) + wordPulse * 0.45;

      for (let i = 6; i >= 1; i--) {
        const p = ((i - ((t * 0.9) % 1)) / 6);
        const rx = Math.max(20, w * (0.14 + p * 0.72) * (1 + beat * 0.04));
        const ry = Math.max(20, h * (0.1 + p * 0.58) * (1 + beat * 0.04));
        ctx.strokeStyle = `rgba(251, 113, 133, ${(0.12 + (1 - p) * 0.32).toFixed(3)})`;
        ctx.lineWidth = (4 + p * 10) * unit;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Glóbulos rojos 3D flotando hacia cámara
      for (let i = 0; i < 12; i++) {
        const phase = (t * 0.55 + i / 12) % 1;
        const ang = i * 2.399;
        const dist = (0.1 + phase * 0.52) * Math.min(w, h);
        const bx = cx + Math.cos(ang) * dist;
        const by = cy + Math.sin(ang) * dist * 0.85;
        const r = (10 + phase * 22) * unit;
        const g = ctx.createRadialGradient(bx - r * 0.25, by - r * 0.25, 2, bx, by, r);
        g.addColorStop(0, '#FDA4AF');
        g.addColorStop(0.5, '#E11D48');
        g.addColorStop(1, '#4C0519');
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.25 + phase * 0.65;
        ctx.beginPath();
        ctx.ellipse(bx, by, r, r * 0.72, ang, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }

    case 'muscles_gym': {
      // Estudio atlético con focos verticales y anillos de energía ascendentes
      const spotlights = [w * 0.2, w * 0.5, w * 0.8];
      spotlights.forEach((sx, idx) => {
        const grad = ctx.createLinearGradient(sx, 0, sx, h * 0.72);
        grad.addColorStop(0, 'rgba(254, 240, 138, 0.3)');
        grad.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(sx - 24 * unit - parallaxX * 0.3, 0);
        ctx.lineTo(sx + 24 * unit - parallaxX * 0.3, 0);
        ctx.lineTo(sx + 135 * unit - parallaxX * 0.6, h * 0.72);
        ctx.lineTo(sx - 135 * unit - parallaxX * 0.6, h * 0.72);
        ctx.closePath();
        ctx.fill();

        // Anillos ascendentes de energía
        const ringY = horizonY - ((t * 95 + idx * 140) % (h * 0.45));
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.28)';
        ctx.lineWidth = 3 * unit;
        ctx.beginPath();
        ctx.ellipse(w * 0.5 - parallaxX * 0.3, ringY, w * 0.36, 26 * unit, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      break;
    }

    case 'sleep_bedroom': {
      // Ventana nocturna con luna creciente y estrellas titilantes
      const winW = w * 0.54;
      const winH = h * 0.34;
      const winX = w * 0.5 - winW / 2 - parallaxX * 0.4;
      const winY = h * 0.1;

      const nightGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
      nightGrad.addColorStop(0, '#020617');
      nightGrad.addColorStop(1, '#1E1B4B');
      ctx.fillStyle = nightGrad;
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 8 * unit;
      drawRoundedRectPath(ctx, winX, winY, winW, winH, 16 * unit);
      ctx.fill();
      ctx.stroke();

      // Estrellas dentro de la ventana
      for (let i = 0; i < 16; i++) {
        const sx = winX + ((i * 73) % 90) * (winW / 100) + winW * 0.05;
        const sy = winY + ((i * 41) % 75) * (winH / 100) + winH * 0.08;
        const alpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.5 + i));
        ctx.fillStyle = `rgba(254, 249, 195, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, (2 + (i % 3)) * unit, 0, Math.PI * 2);
        ctx.fill();
      }

      // Luna llena / creciente luminosa
      const moonX = winX + winW * 0.72;
      const moonY = winY + winH * 0.32;
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 34 * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(moonX + 12 * unit, moonY - 6 * unit, 28 * unit, 0, Math.PI * 2);
      ctx.fill();

      // Cruce de marco de ventana
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 6 * unit;
      ctx.beginPath();
      ctx.moveTo(winX + winW / 2, winY);
      ctx.lineTo(winX + winW / 2, winY + winH);
      ctx.moveTo(winX, winY + winH * 0.56);
      ctx.lineTo(winX + winW, winY + winH * 0.56);
      ctx.stroke();
      break;
    }

    case 'ancient_rome': {
      const backX = w * 0.5 - parallaxX * 0.35;
      ctx.fillStyle = 'rgba(92, 62, 48, 0.55)';
      ctx.beginPath();
      ctx.moveTo(backX - w * 0.48, horizonY - h * 0.28);
      ctx.lineTo(backX, horizonY - h * 0.42);
      ctx.lineTo(backX + w * 0.48, horizonY - h * 0.28);
      ctx.closePath();
      ctx.fill();

      drawRomanColumn(ctx, w * 0.24 - parallaxX * 0.55, h * 0.14, horizonY + h * 0.04, w * 0.075, 0.74);
      drawRomanColumn(ctx, w * 0.76 - parallaxX * 0.55, h * 0.14, horizonY + h * 0.04, w * 0.075, 0.74);
      drawRomanColumn(ctx, w * 0.07 - parallaxX * 1.05, h * 0.02, horizonY + h * 0.16, w * 0.13, 0.96);
      drawRomanColumn(ctx, w * 0.93 - parallaxX * 1.05, h * 0.02, horizonY + h * 0.16, w * 0.13, 0.96);
      break;
    }

    case 'medieval_castle': {
      // Arcos góticos de piedra en perspectiva + antorchas encendidas
      for (let i = 0; i < 3; i++) {
        const s = 1 - i * 0.2;
        const archW = w * 0.86 * s;
        const archTop = h * (0.06 + i * 0.09);
        const cx = w * 0.5 - parallaxX * (0.8 - i * 0.22);
        ctx.strokeStyle = `rgba(120, 113, 108, ${(0.55 - i * 0.12).toFixed(2)})`;
        ctx.lineWidth = (22 - i * 5) * unit;
        ctx.beginPath();
        ctx.moveTo(cx - archW / 2, horizonY + h * 0.12);
        ctx.lineTo(cx - archW / 2, archTop + 120 * unit);
        ctx.quadraticCurveTo(cx - archW / 2, archTop, cx, archTop - 30 * unit);
        ctx.quadraticCurveTo(cx + archW / 2, archTop, cx + archW / 2, archTop + 120 * unit);
        ctx.lineTo(cx + archW / 2, horizonY + h * 0.12);
        ctx.stroke();
      }
      // Dos antorchas con llamas parpadeantes
      [w * 0.16, w * 0.84].forEach((tx, idx) => {
        const flicker = Math.sin(t * 15 + idx * 3) * 6 * unit;
        const x = tx - parallaxX * 0.75;
        const y = h * 0.34;
        const glow = ctx.createRadialGradient(x, y, 4, x, y, 85 * unit);
        glow.addColorStop(0, 'rgba(253, 224, 71, 0.85)');
        glow.addColorStop(0.4, 'rgba(249, 115, 22, 0.42)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 85 * unit, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.ellipse(x, y - 6 * unit, 13 * unit, (22 + flicker * 0.4) * unit, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }

    case 'space_cosmos': {
      // Estrellas en paralaje + planeta con anillos 3D
      for (let i = 0; i < 42; i++) {
        const sx = ((i * 97.3 + t * (6 + (i % 4) * 5)) % (w * 1.1)) - w * 0.05;
        const sy = ((i * 61.7) % (h * 0.92)) + h * 0.04;
        const r = (1.5 + (i % 3) * 1.3) * unit;
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.45 + 0.5 * Math.sin(t * 3 + i)).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      const px = w * 0.76 - parallaxX * 0.45;
      const py = h * 0.24 + Math.sin(t * 1.4) * 10 * unit;
      const pr = 78 * unit;
      // Anillo trasero
      ctx.strokeStyle = 'rgba(196, 181, 253, 0.55)';
      ctx.lineWidth = 10 * unit;
      ctx.beginPath();
      ctx.ellipse(px, py, pr * 1.85, pr * 0.42, -0.28, Math.PI, Math.PI * 2);
      ctx.stroke();

      const pGrad = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 6, px, py, pr);
      pGrad.addColorStop(0, '#E0E7FF');
      pGrad.addColorStop(0.45, '#6366F1');
      pGrad.addColorStop(1, '#1E1B4B');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();

      // Anillo delantero
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.7)';
      ctx.lineWidth = 10 * unit;
      ctx.beginPath();
      ctx.ellipse(px, py, pr * 1.85, pr * 0.42, -0.28, 0, Math.PI);
      ctx.stroke();
      break;
    }

    case 'money_charts': {
      // Columnas financieras 3D ascendentes + curva de tendencia dorada
      const barCount = 6;
      const barW = w * 0.1;
      for (let i = 0; i < barCount; i++) {
        const bx = w * 0.12 + i * w * 0.145 - parallaxX * 0.45;
        const bh = h * (0.12 + i * 0.055) + Math.sin(t * 2.8 + i) * 14 * unit + wordPulse * 14 * unit;
        const by = horizonY - bh + h * 0.04;
        const bGrad = ctx.createLinearGradient(bx, by, bx, horizonY + h * 0.04);
        bGrad.addColorStop(0, i === barCount - 1 ? '#FACC15' : '#34D399');
        bGrad.addColorStop(1, 'rgba(6, 78, 59, 0.25)');
        ctx.fillStyle = bGrad;
        drawRoundedRectPath(ctx, bx, by, barW, bh, 10 * unit);
        ctx.fill();
      }
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 5 * unit;
      ctx.beginPath();
      ctx.moveTo(w * 0.08 - parallaxX * 0.5, horizonY - h * 0.06);
      ctx.quadraticCurveTo(w * 0.45 - parallaxX * 0.5, horizonY - h * 0.16, w * 0.88 - parallaxX * 0.5, h * 0.17);
      ctx.stroke();
      break;
    }

    case 'office_desk': {
      // Monitores luminosos de estudio en el fondo + lámpara cálida
      const monitors = [
        { x: w * 0.24, y: h * 0.28, mw: w * 0.28, mh: h * 0.13, rot: -0.06 },
        { x: w * 0.74, y: h * 0.26, mw: w * 0.3, mh: h * 0.14, rot: 0.05 },
      ];
      monitors.forEach((m, idx) => {
        ctx.save();
        ctx.translate(m.x - parallaxX * 0.55, m.y);
        ctx.rotate(m.rot);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 3 * unit;
        drawRoundedRectPath(ctx, -m.mw / 2, -m.mh / 2, m.mw, m.mh, 12 * unit);
        ctx.fill();
        ctx.stroke();
        // Líneas de código/tarjetas animadas
        for (let r = 0; r < 3; r++) {
          const lw = m.mw * (0.4 + ((idx + r) % 3) * 0.16);
          ctx.fillStyle = r === 0 ? '#38BDF8' : 'rgba(226, 232, 240, 0.38)';
          drawRoundedRectPath(ctx, -m.mw * 0.4, -m.mh * 0.28 + r * 22 * unit, lw, 9 * unit, 4 * unit);
          ctx.fill();
        }
        ctx.restore();
      });
      break;
    }

    case 'city_street': {
      // Rascacielos iluminados en paralaje con ventanas encendidas
      const buildings = [
        { x: 0.04, bw: 0.18, bh: 0.42 },
        { x: 0.2, bw: 0.15, bh: 0.32 },
        { x: 0.66, bw: 0.16, bh: 0.36 },
        { x: 0.81, bw: 0.19, bh: 0.46 },
      ];
      buildings.forEach((b, idx) => {
        const bx = b.x * w - parallaxX * (0.55 + (idx % 2) * 0.2);
        const by = horizonY - b.bh * h;
        const bw = b.bw * w;
        const bh = b.bh * h + h * 0.04;
        ctx.fillStyle = idx % 2 === 0 ? '#1E293B' : '#0F172A';
        ctx.fillRect(bx, by, bw, bh);

        // Ventanas cálidas
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 3; c++) {
            const lit = ((r * 3 + c + idx) % 4) !== 0;
            ctx.fillStyle = lit ? 'rgba(253, 224, 71, 0.65)' : 'rgba(148, 163, 184, 0.18)';
            ctx.fillRect(bx + 12 * unit + c * (bw * 0.28), by + 18 * unit + r * 34 * unit, bw * 0.18, 18 * unit);
          }
        }
      });
      break;
    }

    case 'tech_studio': {
      // Paneles holográficos flotantes 3D
      const cards = [
        { x: w * 0.17, y: h * 0.22, bw: w * 0.26, bh: h * 0.11, rot: -0.11 },
        { x: w * 0.8, y: h * 0.19, bw: w * 0.24, bh: h * 0.12, rot: 0.1 },
      ];
      cards.forEach((c, idx) => {
        const bob = Math.sin(t * 2.4 + idx * 2.1) * 10 * unit;
        ctx.save();
        ctx.translate(c.x - parallaxX * 0.72, c.y + bob);
        ctx.rotate(c.rot + Math.sin(t + idx) * 0.03);
        const grad = ctx.createLinearGradient(-c.bw / 2, -c.bh / 2, c.bw / 2, c.bh / 2);
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.34)');
        grad.addColorStop(1, 'rgba(15, 23, 42, 0.82)');
        ctx.fillStyle = grad;
        ctx.strokeStyle = 'rgba(103, 232, 249, 0.65)';
        ctx.lineWidth = 2.5 * unit;
        drawRoundedRectPath(ctx, -c.bw / 2, -c.bh / 2, c.bw, c.bh, 14 * unit);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(249, 115, 22, 0.85)';
        drawRoundedRectPath(ctx, -c.bw * 0.36, -c.bh * 0.18, c.bw * 0.55, 8 * unit, 4 * unit);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
        drawRoundedRectPath(ctx, -c.bw * 0.36, c.bh * 0.08, c.bw * 0.38, 6 * unit, 3 * unit);
        ctx.fill();
        ctx.restore();
      });
      break;
    }

    case 'forest_stream': {
      // Colinas boscosas + arroyo azul brillante + arco de puente de madera
      const layers = [
        { y: horizonY - h * 0.05, amp: h * 0.06, color: '#1E3A5F', p: 0.35 },
        { y: horizonY + h * 0.01, amp: h * 0.045, color: '#1B4332', p: 0.6 },
      ];
      layers.forEach((layer, idx) => {
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.moveTo(-w * 0.2, h);
        for (let x = -w * 0.2; x <= w * 1.2; x += w * 0.14) {
          const wave = Math.sin((x + parallaxX * layer.p * 2) * 0.008 + idx * 1.7) * layer.amp;
          ctx.lineTo(x, layer.y + wave);
        }
        ctx.lineTo(w * 1.2, h);
        ctx.closePath();
        ctx.fill();
      });

      // Arroyo azul animado
      const streamGrad = ctx.createLinearGradient(0, horizonY, 0, h);
      streamGrad.addColorStop(0, '#38BDF8');
      streamGrad.addColorStop(1, '#0369A1');
      ctx.fillStyle = streamGrad;
      ctx.beginPath();
      ctx.moveTo(w * 0.38 - parallaxX * 0.4, horizonY);
      ctx.lineTo(w * 0.62 - parallaxX * 0.4, horizonY);
      ctx.lineTo(w * 0.85, h);
      ctx.lineTo(w * 0.15, h);
      ctx.closePath();
      ctx.fill();

      // Baranda arqueada de puente de madera 3D
      ctx.strokeStyle = '#92400E';
      ctx.lineWidth = 14 * unit;
      ctx.beginPath();
      ctx.moveTo(w * 0.05 - parallaxX * 0.6, horizonY + h * 0.06);
      ctx.quadraticCurveTo(w * 0.5 - parallaxX * 0.6, horizonY - h * 0.06, w * 0.95 - parallaxX * 0.6, horizonY + h * 0.06);
      ctx.stroke();

      drawStylizedTree3D(ctx, w * 0.12 - parallaxX * 0.8, horizonY + h * 0.04, unit * 0.85, t, 1);
      drawStylizedTree3D(ctx, w * 0.88 - parallaxX * 0.8, horizonY + h * 0.04, unit * 0.85, t, 2);
      break;
    }

    case 'ocean_deep': {
      // Rayos submarinos + ondas concéntricas + burbujas ascendentes
      for (let i = 0; i < 5; i++) {
        const bx = w * (0.12 + i * 0.19) - parallaxX * 0.3;
        const grad = ctx.createLinearGradient(bx, 0, bx + 40 * unit, h * 0.85);
        grad.addColorStop(0, 'rgba(125, 211, 252, 0.28)');
        grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(bx - 16 * unit, 0);
        ctx.lineTo(bx + 28 * unit, 0);
        ctx.lineTo(bx + 90 * unit, h * 0.85);
        ctx.lineTo(bx - 40 * unit, h * 0.85);
        ctx.closePath();
        ctx.fill();
      }
      for (let i = 0; i < 16; i++) {
        const bx = ((i * 89 + Math.sin(t * 2 + i) * 18) % w + w) % w;
        const by = h - (((t * (55 + (i % 4) * 20) + i * 71) % (h + 60)));
        const r = (5 + (i % 4) * 4.5) * unit;
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.65)';
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case 'survival_wild': {
      // Picos montañosos dramáticos en capas de paralaje
      const peaks = [
        { color: '#27272A', y: horizonY - h * 0.24, p: 0.3, offsets: [-0.1, 0.18, 0.45, 0.72, 1.05] },
        { color: '#18181B', y: horizonY - h * 0.12, p: 0.6, offsets: [-0.1, 0.1, 0.36, 0.64, 0.92, 1.15] },
      ];
      peaks.forEach((pk) => {
        ctx.fillStyle = pk.color;
        ctx.beginPath();
        ctx.moveTo(-w * 0.2, horizonY + h * 0.05);
        pk.offsets.forEach((ox, idx) => {
          const px = ox * w - parallaxX * pk.p;
          const py = idx % 2 === 1 ? pk.y : horizonY - h * 0.02;
          ctx.lineTo(px, py);
        });
        ctx.lineTo(w * 1.2, horizonY + h * 0.05);
        ctx.closePath();
        ctx.fill();
      });
      break;
    }

    case 'mystery_vault': {
      // Bóveda circular de acero 3D giratoria con engranajes
      const cx = w * 0.5 - parallaxX * 0.45;
      const cy = h * 0.38;
      const r = Math.min(w, h) * 0.34;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.25);

      const vaultGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
      vaultGrad.addColorStop(0, '#64748B');
      vaultGrad.addColorStop(0.6, '#1E293B');
      vaultGrad.addColorStop(1, '#020617');
      ctx.fillStyle = vaultGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
      ctx.lineWidth = 6 * unit;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 10 * unit;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r * 0.25, Math.sin(ang) * r * 0.25);
        ctx.lineTo(Math.cos(ang) * r * 0.78, Math.sin(ang) * r * 0.78);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
  }
}

/**
 * Bocina Bluetooth gigante 3D con woofers pulsantes, LED EQ y ondas sonoras
 */
function drawGiantBoombox3D(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  t: number,
  wordPulse: number
) {
  const beat = Math.pow(0.5 + 0.5 * Math.sin(t * 14.5), 2) * 0.6 + wordPulse * 0.7;
  const bw = 200 * scale;
  const bh = 120 * scale;

  ctx.save();
  ctx.translate(cx, cy);

  for (let ring = 0; ring < 3; ring++) {
    const phase = (t * 1.85 + ring / 3) % 1;
    const radius = (bw * 0.55 + phase * bw * 1.65) * (1 + wordPulse * 0.12);
    const alpha = (1 - phase) * (0.5 + wordPulse * 0.28);
    ctx.strokeStyle =
      ring % 2 === 0 ? `rgba(249, 115, 22, ${alpha.toFixed(3)})` : `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
    ctx.lineWidth = (5 - phase * 3.5) * scale;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.scale(1 + beat * 0.08, 1 - beat * 0.06);

  const bodyGrad = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
  bodyGrad.addColorStop(0, '#334155');
  bodyGrad.addColorStop(0.5, '#1E293B');
  bodyGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bodyGrad;
  drawRoundedRectPath(ctx, -bw / 2, -bh / 2, bw, bh, 22 * scale);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.lineWidth = 2.5 * scale;
  ctx.stroke();

  [-bw * 0.27, bw * 0.27].forEach((wx) => {
    const outerR = bh * 0.36;
    const coneR = outerR * (0.76 + beat * 0.12);
    ctx.strokeStyle = '#F97316';
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.arc(wx, 4 * scale, outerR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(wx, 4 * scale, outerR * 0.92, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.arc(wx, 4 * scale, coneR * 0.36, 0, Math.PI * 2);
    ctx.fill();
  });

  for (let i = 0; i < 5; i++) {
    const level = 0.28 + 0.72 * Math.abs(Math.sin(t * 11 + i * 1.4 + wordPulse * 3));
    const barH = bh * 0.42 * level;
    const bx = (i - 2) * (11 * scale) - 4 * scale;
    ctx.fillStyle = i % 2 === 0 ? '#38BDF8' : '#FACC15';
    drawRoundedRectPath(ctx, bx, bh * 0.25 - barH, 8 * scale, barH, 3 * scale);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Capa 5: 15 Props 3D animados específicos de cada escena (zapatilla + contador de pasos,
 * cerebro luminoso, corazón latiendo con ECG, mancuerna, calendario/reloj, etc.)
 */
function drawContextHeroProp(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  context: SceneVisualContext,
  wordPulse: number
) {
  const unit = Math.min(w, h) / 720;
  const bob = Math.sin(t * 3.2) * 10 * unit;

  switch (context.propIcon) {
    case 'bluetooth_speaker': {
      drawGiantBoombox3D(ctx, w * 0.5, h * 0.67 + Math.sin(t * 5.2) * 8 * unit, unit * 1.0, t, wordPulse);
      return;
    }

    case 'sneakers_steps': {
      // Zapatilla deportiva 3D + anillo contador de pasos animado
      const cx = w * 0.75;
      const cy = h * 0.29 + bob;
      const r = 64 * unit;
      ctx.save();
      ctx.translate(cx, cy);

      // Anillo de progreso de pasos
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 10 * unit;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      const progress = 0.35 + ((t * 0.22) % 0.62);
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 10 * unit;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();

      // Zapatilla estilizada 3D rebotando dentro del anillo
      ctx.rotate(-0.18 + Math.sin(t * 7) * 0.14);
      const shoeGrad = ctx.createLinearGradient(-34 * unit, -20 * unit, 38 * unit, 22 * unit);
      shoeGrad.addColorStop(0, '#FB923C');
      shoeGrad.addColorStop(1, '#EA580C');
      ctx.fillStyle = shoeGrad;
      ctx.beginPath();
      ctx.moveTo(-36 * unit, 12 * unit);
      ctx.lineTo(-28 * unit, -18 * unit);
      ctx.lineTo(-4 * unit, -14 * unit);
      ctx.quadraticCurveTo(18 * unit, -4 * unit, 40 * unit, 8 * unit);
      ctx.lineTo(38 * unit, 20 * unit);
      ctx.lineTo(-36 * unit, 20 * unit);
      ctx.closePath();
      ctx.fill();

      // Suela blanca 3D
      ctx.fillStyle = '#F8FAFC';
      drawRoundedRectPath(ctx, -38 * unit, 14 * unit, 78 * unit, 11 * unit, 5 * unit);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'brain_glow': {
      // Cerebro 3D brillante con surcos corticales y chispas sinápticas
      const cx = w * 0.74;
      const cy = h * 0.27 + bob;
      const r = (54 + wordPulse * 8) * unit;
      ctx.save();
      ctx.translate(cx, cy);

      const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.1);
      halo.addColorStop(0, 'rgba(244, 114, 182, 0.58)');
      halo.addColorStop(0.55, 'rgba(168, 85, 247, 0.22)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2);
      ctx.fill();

      [-r * 0.33, r * 0.33].forEach((ox) => {
        const g = ctx.createRadialGradient(ox - r * 0.14, -r * 0.2, r * 0.08, ox, 0, r * 0.78);
        g.addColorStop(0, '#FCE7F3');
        g.addColorStop(0.5, '#EC4899');
        g.addColorStop(1, '#701A75');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(ox, 0, r * 0.52, r * 0.68, ox < 0 ? -0.14 : 0.14, 0, Math.PI * 2);
        ctx.fill();

        // Surcos cerebrales
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
        ctx.lineWidth = 3 * unit;
        ctx.beginPath();
        ctx.arc(ox, -r * 0.12, r * 0.24, 0.3, Math.PI - 0.3);
        ctx.stroke();
      });

      for (let i = 0; i < 6; i++) {
        const ang = t * 2.4 + (i * Math.PI) / 3;
        ctx.fillStyle = i % 2 === 0 ? '#FEF08A' : '#38BDF8';
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * r * 1.18, Math.sin(ang) * r * 0.82, 4.8 * unit, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    case 'heart_pulse': {
      // Corazón 3D brillante latiendo + línea de pulso ECG
      const cx = w * 0.74;
      const cy = h * 0.28 + bob * 0.6;
      const beat = 1 + Math.pow(0.5 + 0.5 * Math.sin(t * 7.2), 4) * 0.2 + wordPulse * 0.12;
      const s = 54 * unit * beat;

      ctx.save();
      ctx.translate(cx, cy);

      // Onda radial de latido
      const ringPhase = (t * 1.6) % 1;
      ctx.strokeStyle = `rgba(251, 113, 133, ${((1 - ringPhase) * 0.65).toFixed(3)})`;
      ctx.lineWidth = 4 * unit;
      ctx.beginPath();
      ctx.arc(0, 0, s * (0.9 + ringPhase * 1.4), 0, Math.PI * 2);
      ctx.stroke();

      const hGrad = ctx.createRadialGradient(-s * 0.25, -s * 0.3, 4, 0, 0, s * 1.3);
      hGrad.addColorStop(0, '#FDA4AF');
      hGrad.addColorStop(0.42, '#E11D48');
      hGrad.addColorStop(1, '#881337');
      ctx.fillStyle = hGrad;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.72);
      ctx.bezierCurveTo(-s * 1.15, s * 0.1, -s * 1.05, -s * 0.88, 0, -s * 0.32);
      ctx.bezierCurveTo(s * 1.05, -s * 0.88, s * 1.15, s * 0.1, 0, s * 0.72);
      ctx.closePath();
      ctx.fill();

      // Brillo especular + línea ECG blanca
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3.5 * unit;
      ctx.beginPath();
      ctx.moveTo(-s * 0.75, 0);
      ctx.lineTo(-s * 0.3, 0);
      ctx.lineTo(-s * 0.14, -s * 0.34);
      ctx.lineTo(s * 0.08, s * 0.34);
      ctx.lineTo(s * 0.24, -s * 0.14);
      ctx.lineTo(s * 0.75, -s * 0.14);
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'dumbbell': {
      // Mancuerna 3D metálica flotando con brillo y destellos
      const cx = w * 0.75;
      const cy = h * 0.29 + bob;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.32 + Math.sin(t * 3.8) * 0.16);

      // Barra metálica
      ctx.fillStyle = '#CBD5E1';
      drawRoundedRectPath(ctx, -56 * unit, -9 * unit, 112 * unit, 18 * unit, 6 * unit);
      ctx.fill();

      // Discos 3D en ambos lados
      [-46 * unit, 46 * unit].forEach((dx) => {
        const dGrad = ctx.createLinearGradient(dx - 16 * unit, -44 * unit, dx + 16 * unit, 44 * unit);
        dGrad.addColorStop(0, '#64748B');
        dGrad.addColorStop(0.5, '#1E293B');
        dGrad.addColorStop(1, '#020617');
        ctx.fillStyle = dGrad;
        drawRoundedRectPath(ctx, dx - 16 * unit, -42 * unit, 32 * unit, 84 * unit, 10 * unit);
        ctx.fill();
        ctx.strokeStyle = '#F97316';
        ctx.lineWidth = 3 * unit;
        ctx.stroke();
      });
      ctx.restore();
      return;
    }

    case 'clock_calendar': {
      // Reloj / contador de días 3D con manecilla girando
      const cx = w * 0.75;
      const cy = h * 0.27 + bob;
      const r = 56 * unit;
      ctx.save();
      ctx.translate(cx, cy);

      const faceGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 4, 0, 0, r);
      faceGrad.addColorStop(0, '#FFFFFF');
      faceGrad.addColorStop(0.8, '#E2E8F0');
      faceGrad.addColorStop(1, '#94A3B8');
      ctx.fillStyle = faceGrad;
      ctx.strokeStyle = context.palette.accent;
      ctx.lineWidth = 8 * unit;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Arco de 20 minutos destacado
      ctx.fillStyle = 'rgba(249, 115, 22, 0.25)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 0.82, -Math.PI / 2, -Math.PI / 2 + Math.PI * 0.68);
      ctx.closePath();
      ctx.fill();

      // Manecillas animadas
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 5 * unit;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(t * 1.4 - Math.PI / 2) * r * 0.48, Math.sin(t * 1.4 - Math.PI / 2) * r * 0.48);
      ctx.stroke();

      ctx.strokeStyle = '#F97316';
      ctx.lineWidth = 3.5 * unit;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(t * 5.2 - Math.PI / 2) * r * 0.7, Math.sin(t * 5.2 - Math.PI / 2) * r * 0.7);
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'coin_chart': {
      // Moneda dorada 3D giratoria + flecha verde ascendente
      const cx = w * 0.76;
      const cy = h * 0.28 + bob;
      const spin = Math.max(0.28, Math.abs(Math.cos(t * 3.2)));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(spin, 1);
      const cg = ctx.createRadialGradient(-12 * unit, -12 * unit, 4, 0, 0, 52 * unit);
      cg.addColorStop(0, '#FEF9C3');
      cg.addColorStop(0.5, '#FACC15');
      cg.addColorStop(1, '#A16207');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, 50 * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 5 * unit;
      ctx.stroke();
      ctx.fillStyle = '#713F12';
      ctx.font = `900 ${Math.round(44 * unit)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 3 * unit);
      ctx.restore();
      return;
    }

    case 'smartphone_glow': {
      const px = w * 0.76;
      const py = h * 0.3 + bob;
      const pw = 82 * unit;
      const ph = 144 * unit;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(0.14 + Math.sin(t * 1.9) * 0.05);

      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 3 * unit;
      drawRoundedRectPath(ctx, -pw / 2, -ph / 2, pw, ph, 16 * unit);
      ctx.fill();
      ctx.stroke();

      const dispGrad = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
      dispGrad.addColorStop(0, '#06B6D4');
      dispGrad.addColorStop(1, '#4F46E5');
      ctx.fillStyle = dispGrad;
      drawRoundedRectPath(ctx, -pw * 0.42, -ph * 0.44, pw * 0.84, ph * 0.88, 10 * unit);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'compass_map': {
      // Brújula dorada 3D con aguja girando suavemente
      const cx = w * 0.75;
      const cy = h * 0.28 + bob;
      const r = 52 * unit;
      ctx.save();
      ctx.translate(cx, cy);
      const rim = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 4, 0, 0, r);
      rim.addColorStop(0, '#FEF08A');
      rim.addColorStop(0.6, '#D97706');
      rim.addColorStop(1, '#78350F');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFBEB';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(Math.sin(t * 2.2) * 0.85);
      ctx.fillStyle = '#DC2626';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.62);
      ctx.lineTo(10 * unit, 0);
      ctx.lineTo(-10 * unit, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.moveTo(0, r * 0.62);
      ctx.lineTo(10 * unit, 0);
      ctx.lineTo(-10 * unit, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'planet_rocket': {
      // Cohete 3D despegando con estela de fuego
      const cx = w * 0.75 + Math.sin(t * 2.5) * 14 * unit;
      const cy = h * 0.28 + bob;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.45);
      ctx.fillStyle = '#F97316';
      ctx.beginPath();
      ctx.ellipse(0, 48 * unit, 14 * unit, (22 + Math.sin(t * 20) * 6) * unit, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22 * unit, 46 * unit, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.moveTo(-20 * unit, -22 * unit);
      ctx.lineTo(0, -56 * unit);
      ctx.lineTo(20 * unit, -22 * unit);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.arc(0, -6 * unit, 10 * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'warning_bolt': {
      // Rayo de alerta 3D brillante
      const cx = w * 0.76;
      const cy = h * 0.27 + bob * 0.7;
      const pulse = 1 + wordPulse * 0.16 + Math.sin(t * 9) * 0.05;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);

      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = '#EA580C';
      ctx.lineWidth = 4 * unit;
      ctx.beginPath();
      ctx.moveTo(10 * unit, -58 * unit);
      ctx.lineTo(-32 * unit, 8 * unit);
      ctx.lineTo(-2 * unit, 8 * unit);
      ctx.lineTo(-14 * unit, 58 * unit);
      ctx.lineTo(34 * unit, -10 * unit);
      ctx.lineTo(4 * unit, -10 * unit);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'energy_sun': {
      // Sol radiante 3D girando con corona de energía
      const cx = w * 0.76;
      const cy = h * 0.25 + bob * 0.6;
      const r = 42 * unit;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.6);
      for (let i = 0; i < 10; i++) {
        ctx.rotate((Math.PI * 2) / 10);
        ctx.fillStyle = 'rgba(253, 224, 71, 0.78)';
        ctx.beginPath();
        ctx.moveTo(-7 * unit, -r * 1.1);
        ctx.lineTo(0, -r * 1.65);
        ctx.lineTo(7 * unit, -r * 1.1);
        ctx.closePath();
        ctx.fill();
      }
      const sg = ctx.createRadialGradient(-10 * unit, -10 * unit, 4, 0, 0, r);
      sg.addColorStop(0, '#FEF9C3');
      sg.addColorStop(0.5, '#FACC15');
      sg.addColorStop(1, '#EA580C');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'paper_boat': {
      // Barquito de papel 3D meciendo suavemente sobre ondas
      const cx = w * 0.74 + Math.sin(t * 1.8) * 16 * unit;
      const cy = h * 0.3 + bob * 0.8;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(t * 2.6) * 0.1);
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.moveTo(0, -44 * unit);
      ctx.lineTo(28 * unit, 8 * unit);
      ctx.lineTo(-28 * unit, 8 * unit);
      ctx.closePath();
      ctx.fill();

      const hull = ctx.createLinearGradient(-56 * unit, 0, 56 * unit, 28 * unit);
      hull.addColorStop(0, '#E2E8F0');
      hull.addColorStop(1, '#94A3B8');
      ctx.fillStyle = hull;
      ctx.beginPath();
      ctx.moveTo(-58 * unit, 6 * unit);
      ctx.lineTo(58 * unit, 6 * unit);
      ctx.lineTo(38 * unit, 30 * unit);
      ctx.lineTo(-38 * unit, 30 * unit);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'coffee_cup': {
      // Taza 3D con vapor subiendo
      const cx = w * 0.76;
      const cy = h * 0.3 + bob * 0.6;
      ctx.save();
      ctx.translate(cx, cy);
      // Vapor animado
      for (let i = -1; i <= 1; i++) {
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 4 * unit;
        ctx.beginPath();
        ctx.moveTo(i * 14 * unit, -34 * unit);
        ctx.quadraticCurveTo(
          i * 14 * unit + Math.sin(t * 4 + i) * 10 * unit,
          -56 * unit,
          i * 14 * unit,
          -74 * unit
        );
        ctx.stroke();
      }
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 9 * unit;
      ctx.beginPath();
      ctx.arc(34 * unit, 4 * unit, 18 * unit, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.fillStyle = '#F8FAFC';
      drawRoundedRectPath(ctx, -34 * unit, -28 * unit, 68 * unit, 66 * unit, 14 * unit);
      ctx.fill();
      ctx.fillStyle = '#78350F';
      ctx.beginPath();
      ctx.ellipse(0, -24 * unit, 28 * unit, 8 * unit, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'shield_lock': {
      // Escudo 3D brillante con candado dorado
      const cx = w * 0.75;
      const cy = h * 0.28 + bob;
      const s = 54 * unit;
      ctx.save();
      ctx.translate(cx, cy);
      const shGrad = ctx.createLinearGradient(-s, -s, s, s);
      shGrad.addColorStop(0, '#38BDF8');
      shGrad.addColorStop(1, '#1D4ED8');
      ctx.fillStyle = shGrad;
      ctx.strokeStyle = '#E0F2FE';
      ctx.lineWidth = 4 * unit;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.82, -s * 0.62);
      ctx.quadraticCurveTo(s * 0.78, s * 0.45, 0, s);
      ctx.quadraticCurveTo(-s * 0.78, s * 0.45, -s * 0.82, -s * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FACC15';
      drawRoundedRectPath(ctx, -18 * unit, -6 * unit, 36 * unit, 30 * unit, 6 * unit);
      ctx.fill();
      ctx.restore();
      return;
    }
  }
}

/**
 * Capa 4: Personaje 3D articulado con poses reales según mainSubject
 * (caminando con piernas/zapatillas, flexionando bíceps, estresado, durmiendo, celebrando, etc.)
 */
function drawStylized3DCharacter(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    t: number;
    isSpeaking: boolean;
    wordPulse: number;
    context: SceneVisualContext;
    lookOffsetX: number;
    isBackgroundCrowd?: boolean;
    seed?: number;
  }
) {
  const {
    cx,
    cy,
    scale,
    t,
    isSpeaking,
    wordPulse,
    context,
    lookOffsetX,
    isBackgroundCrowd = false,
    seed = 0,
  } = opts;
  const { palette, emotion, mainSubject, environment } = context;

  const isWalking = mainSubject === 'walking_happy';
  const isRunning = mainSubject === 'running_fast';
  const isFlexing = mainSubject === 'flexing_muscles';
  const isStressed = mainSubject === 'stressed_head';
  const isSleeping = mainSubject === 'sleeping_peaceful';
  const isCelebrating = mainSubject === 'triumphant_celebrate';
  const isThinking = mainSubject === 'thinking_curious';

  const strideSpeed = isRunning ? 10.5 : isWalking ? 6.2 : 0;
  const strideSin = strideSpeed > 0 ? Math.sin(t * strideSpeed + seed) : 0;
  const strideBounce = strideSpeed > 0 ? Math.abs(Math.sin(t * strideSpeed + seed)) * (isRunning ? 18 : 11) * scale : 0;

  const breath = Math.sin(t * 3.4 + seed) * 0.024;
  const jump = isBackgroundCrowd
    ? Math.abs(Math.sin(t * 7.2 + seed * 1.9)) * (14 + wordPulse * 18) * scale
    : strideBounce + Math.sin(t * 4.2) * 4 * scale + wordPulse * 9 * scale;

  const stretchY = 1 + breath + wordPulse * 0.055;
  const squashX = 1 - breath * 0.6 - wordPulse * 0.035;
  const bodyLean = isRunning ? 0.09 : isSleeping ? -0.14 : 0;
  const headTilt =
    (isSleeping ? -0.22 : Math.sin(t * 2.6 + seed) * 0.05) +
    (emotion === 'shock' || isStressed ? Math.sin(t * 15 + seed) * 0.04 : 0) +
    wordPulse * (seed % 2 === 0 ? 0.04 : -0.04);

  ctx.save();
  ctx.translate(cx, cy - jump);
  ctx.rotate(bodyLean);
  ctx.scale(squashX, stretchY);

  const headR = 72 * scale;

  // Sombra en el suelo
  if (!isBackgroundCrowd) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(
      0,
      headR * (isWalking || isRunning ? 3.15 : 2.3) + jump * 0.45,
      headR * 1.25,
      headR * 0.28,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Piernas y zapatillas articuladas cuando camina o corre
  if (!isBackgroundCrowd && (isWalking || isRunning)) {
    [-1, 1].forEach((side) => {
      const swing = strideSin * side * (isRunning ? 0.65 : 0.44);
      ctx.save();
      ctx.translate(side * headR * 0.34, headR * 2.02);
      ctx.rotate(swing);

      // Pierna
      ctx.fillStyle = '#1E293B';
      drawRoundedRectPath(ctx, -14 * scale, 0, 28 * scale, headR * 0.92, 12 * scale);
      ctx.fill();

      // Zapatilla deportiva brillante
      ctx.fillStyle = '#F97316';
      drawRoundedRectPath(ctx, -16 * scale, headR * 0.78, 44 * scale, 22 * scale, 10 * scale);
      ctx.fill();
      ctx.fillStyle = '#F8FAFC';
      drawRoundedRectPath(ctx, -16 * scale, headR * 0.94, 44 * scale, 8 * scale, 4 * scale);
      ctx.fill();
      ctx.restore();
    });
  }

  // Aura energética al flexionar músculos o celebrar
  if (!isBackgroundCrowd && (isFlexing || isCelebrating)) {
    ctx.save();
    ctx.strokeStyle = isFlexing ? 'rgba(249, 115, 22, 0.55)' : 'rgba(250, 204, 21, 0.55)';
    ctx.lineWidth = 4 * scale;
    const auraR = headR * (1.85 + Math.sin(t * 6) * 0.1 + wordPulse * 0.18);
    ctx.beginPath();
    ctx.arc(0, headR * 0.7, auraR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Torso y hombros con volumen 3D
  const torsoGrad = ctx.createRadialGradient(-headR * 0.35, headR * 1.1, headR * 0.15, 0, headR * 1.45, headR * 1.35);
  torsoGrad.addColorStop(0, palette.outfitPrimary);
  torsoGrad.addColorStop(0.68, palette.outfitSecondary);
  torsoGrad.addColorStop(1, '#0B0D14');
  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.ellipse(0, headR * 1.52, headR * 1.06, headR * 0.88, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(headR * 1.06, headR * 2.15);
  ctx.lineTo(-headR * 1.06, headR * 2.15);
  ctx.closePath();
  ctx.fill();

  // Toga romana solo si el entorno es Roma antigua
  if (environment === 'ancient_rome') {
    const sashGrad = ctx.createLinearGradient(-headR, headR * 0.85, headR, headR * 2.0);
    sashGrad.addColorStop(0, '#DC2626');
    sashGrad.addColorStop(1, '#450A0A');
    ctx.fillStyle = sashGrad;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.7, headR * 0.86);
    ctx.lineTo(-headR * 0.22, headR * 0.82);
    ctx.lineTo(headR * 0.8, headR * 2.05);
    ctx.lineTo(headR * 0.24, headR * 2.05);
    ctx.closePath();
    ctx.fill();
  }

  // Brazos y manos articulados según mainSubject
  [-1, 1].forEach((side) => {
    let hx = side * headR * 1.15;
    let hy = headR * 1.35;

    if (isFlexing) {
      // Pose doble bíceps levantados
      ctx.strokeStyle = palette.outfitPrimary;
      ctx.lineWidth = 24 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(side * headR * 0.85, headR * 1.18);
      ctx.lineTo(side * headR * 1.48, headR * 1.02);
      ctx.lineTo(side * headR * 1.32, headR * 0.42 - wordPulse * 12 * scale);
      ctx.stroke();
      hx = side * headR * 1.28;
      hy = headR * 0.36 - wordPulse * 12 * scale;
    } else if (isCelebrating) {
      // Brazos arriba en V de victoria
      ctx.strokeStyle = palette.outfitPrimary;
      ctx.lineWidth = 22 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(side * headR * 0.82, headR * 1.18);
      ctx.lineTo(side * headR * 1.45, headR * (0.12 - Math.sin(t * 7 + side) * 0.14));
      ctx.stroke();
      hx = side * headR * 1.48;
      hy = headR * (0.06 - Math.sin(t * 7 + side) * 0.14);
    } else if (isStressed) {
      // Manos llevadas a las sienes
      hx = side * headR * 1.02;
      hy = headR * (0.05 + Math.sin(t * 14 + side) * 0.08);
    } else if (isThinking && side === 1) {
      // Mano derecha pensativa en el mentón
      hx = headR * 0.42;
      hy = headR * 0.78;
    } else if (isWalking || isRunning) {
      // Braceo opuesto a las piernas
      const armSwing = -strideSin * side * (isRunning ? 0.55 : 0.38);
      hx = side * headR * 1.12;
      hy = headR * (1.28 + armSwing * 0.85);
    } else if (emotion === 'shock' || isBackgroundCrowd) {
      hx = side * headR * 1.18;
      hy = headR * (0.52 + Math.sin(t * 9 + seed) * 0.14);
    } else {
      hx = side * headR * 1.14;
      hy = headR * (1.36 + Math.sin(t * 4 + side) * 0.12);
    }

    const handGrad = ctx.createRadialGradient(hx - 5 * scale, hy - 5 * scale, 2, hx, hy, 22 * scale);
    handGrad.addColorStop(0, palette.skinHighlight);
    handGrad.addColorStop(0.65, palette.skinBase);
    handGrad.addColorStop(1, palette.skinShadow);
    ctx.fillStyle = handGrad;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 20 * scale, 24 * scale, side * 0.3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Cuello
  ctx.fillStyle = palette.skinShadow;
  drawRoundedRectPath(ctx, -headR * 0.25, headR * 0.64, headR * 0.5, headR * 0.38, 12 * scale);
  ctx.fill();

  // Cabeza 3D
  ctx.save();
  ctx.rotate(headTilt);

  [-1, 1].forEach((side) => {
    const ex = side * headR * 0.94;
    const ey = headR * 0.04;
    ctx.fillStyle = palette.skinBase;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 16 * scale, 22 * scale, side * 0.18, 0, Math.PI * 2);
    ctx.fill();
  });

  const headGrad = ctx.createRadialGradient(-headR * 0.32, -headR * 0.34, headR * 0.08, 0, headR * 0.05, headR * 1.18);
  headGrad.addColorStop(0, palette.skinHighlight);
  headGrad.addColorStop(0.48, palette.skinBase);
  headGrad.addColorStop(0.88, palette.skinShadow);
  headGrad.addColorStop(1, palette.rimLight);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, headR * 0.94, headR * 1.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cabello 3D esculpido
  const hairGrad = ctx.createRadialGradient(-headR * 0.25, -headR * 0.9, 6, 0, -headR * 0.65, headR * 1.1);
  hairGrad.addColorStop(0, seed % 2 === 0 ? '#6B4226' : '#334155');
  hairGrad.addColorStop(0.65, seed % 2 === 0 ? '#3B2214' : '#1E293B');
  hairGrad.addColorStop(1, '#0F172A');
  ctx.fillStyle = hairGrad;
  ctx.beginPath();
  ctx.ellipse(0, -headR * 0.64, headR * 0.92, headR * 0.46, 0, Math.PI, Math.PI * 2);
  ctx.quadraticCurveTo(headR * 0.55, -headR * 0.52, headR * 0.1, -headR * 0.82);
  ctx.quadraticCurveTo(-headR * 0.35, -headR * 0.5, -headR * 0.92, -headR * 0.64);
  ctx.fill();

  // Corona de laurel solo en Roma antigua
  if (environment === 'ancient_rome') {
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      ctx.fillStyle = i % 2 === 0 ? '#FACC15' : '#EAB308';
      ctx.beginPath();
      ctx.ellipse(i * headR * 0.26, -headR * 0.78 + Math.abs(i) * headR * 0.05, 11 * scale, 5.5 * scale, i * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ojos expresivos (cerrados serenos si duerme, grandes 3D en el resto)
  const blinkCycle = (t + seed * 1.37) % 3.6;
  const isBlinking = !isBackgroundCrowd && emotion !== 'shock' && blinkCycle > 3.48;
  const eyeScaleY = isBlinking ? 0.12 : emotion === 'shock' ? 1.18 + wordPulse * 0.12 : 1.0 + wordPulse * 0.06;
  const eyeR = headR * (emotion === 'shock' || isBackgroundCrowd ? 0.25 : 0.22);

  [-1, 1].forEach((side) => {
    const ex = side * headR * 0.34;
    const ey = -headR * 0.08;

    if (isSleeping) {
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 5 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, ey + 6 * scale, eyeR * 0.75, 0.2, Math.PI - 0.2);
      ctx.stroke();
    } else {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.scale(1, eyeScaleY);

      const scleraGrad = ctx.createRadialGradient(-eyeR * 0.25, -eyeR * 0.3, 1, 0, 0, eyeR);
      scleraGrad.addColorStop(0, '#FFFFFF');
      scleraGrad.addColorStop(0.75, '#E2E8F0');
      scleraGrad.addColorStop(1, '#94A3B8');
      ctx.fillStyle = scleraGrad;
      ctx.beginPath();
      ctx.arc(0, 0, eyeR, 0, Math.PI * 2);
      ctx.fill();

      if (!isBlinking) {
        const px = lookOffsetX * eyeR * 0.28;
        const py = emotion === 'shock' ? -eyeR * 0.05 : Math.sin(t * 2.1 + seed) * eyeR * 0.08;
        const irisR = eyeR * (emotion === 'shock' ? 0.48 : 0.58);
        const pupilR = irisR * 0.58;

        ctx.fillStyle = '#1D4ED8';
        ctx.beginPath();
        ctx.arc(px, py, irisR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.arc(px, py, pupilR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px - irisR * 0.32, py - irisR * 0.32, irisR * 0.24, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Cejas articuladas
    const browBaseY = ey - eyeR * (emotion === 'shock' ? 1.55 : 1.3) - wordPulse * 8 * scale;
    const browTilt =
      emotion === 'shock'
        ? side * -0.34
        : emotion === 'stressed' || emotion === 'intense'
          ? side * 0.32
          : emotion === 'curious'
            ? side === 1
              ? -0.26
              : 0.1
            : side * -0.14;

    ctx.save();
    ctx.translate(ex, browBaseY);
    ctx.rotate(browTilt);
    ctx.fillStyle = '#291811';
    drawRoundedRectPath(ctx, -eyeR * 0.92, -5 * scale, eyeR * 1.84, 10 * scale, 5 * scale);
    ctx.fill();
    ctx.restore();
  });

  // Nariz 3D
  ctx.fillStyle = palette.skinBase;
  ctx.beginPath();
  ctx.ellipse(0, headR * 0.15, headR * 0.12, headR * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Boca sincronizada con la narración (o sonrisa tranquila si duerme)
  const mouthY = headR * 0.5;
  if (isSleeping && !isSpeaking) {
    ctx.strokeStyle = '#7C2D12';
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.arc(0, mouthY - 6 * scale, headR * 0.2, 0.25, Math.PI - 0.25);
    ctx.stroke();
  } else {
    const talkCadence = isSpeaking
      ? 0.26 + 0.4 * Math.abs(Math.sin(t * 14.5 + seed)) + 0.28 * Math.abs(Math.cos(t * 23.0)) + wordPulse * 0.42
      : emotion === 'shock' || isBackgroundCrowd
        ? 0.68 + Math.sin(t * 7 + seed) * 0.16
        : 0.22 + Math.abs(Math.sin(t * 2.4)) * 0.1;

    const mouthOpen = Math.min(1.1, talkCadence);
    const mouthW = headR * (emotion === 'shock' ? 0.34 : 0.42 + mouthOpen * 0.08);
    const mouthH = headR * (0.1 + mouthOpen * (emotion === 'shock' ? 0.4 : 0.26));

    ctx.fillStyle = '#58111E';
    ctx.beginPath();
    ctx.ellipse(0, mouthY, mouthW, mouthH, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, mouthY, mouthW * 0.94, mouthH * 0.94, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#FB7185';
    ctx.beginPath();
    ctx.ellipse(0, mouthY + mouthH * 0.65, mouthW * 0.64, mouthH * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F8FAFC';
    drawRoundedRectPath(ctx, -mouthW * 0.76, mouthY - mouthH * 1.04, mouthW * 1.52, mouthH * 0.54, 6 * scale);
    ctx.fill();
    ctx.restore();
  }

  // Zzz flotantes si está durmiendo o rayos de estrés si está estresado
  if (!isBackgroundCrowd && isSleeping) {
    ctx.fillStyle = '#E0E7FF';
    ctx.font = `800 ${Math.round(28 * scale)}px sans-serif`;
    const floatZ = (t * 24) % 42;
    ctx.globalAlpha = 1 - floatZ / 42;
    ctx.fillText('Z', headR * 0.82 + floatZ * 0.3 * scale, -headR * 0.55 - floatZ * scale);
    ctx.globalAlpha = 1;
  } else if (!isBackgroundCrowd && (isStressed || emotion === 'shock')) {
    ctx.fillStyle = isStressed ? '#EF4444' : '#38BDF8';
    const dropY = -headR * 0.42 + ((t * 45) % 24) * scale;
    ctx.beginPath();
    ctx.arc(headR * 0.88, dropY, 7 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

/**
 * Capa 6: Partículas contextuales y líneas cinéticas de impacto
 */
function drawDynamicParticlesAndImpact(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  context: SceneVisualContext,
  wordPulse: number,
  accentColor: string
) {
  const unit = Math.min(w, h) / 720;

  for (let i = 0; i < 22; i++) {
    const seed = i * 97.31;
    const speed = 0.25 + (i % 5) * 0.14;
    const x =
      (((Math.sin(seed) * 0.5 + 0.5) * w + t * (22 + (i % 3) * 14) * (i % 2 === 0 ? 1 : -1)) % (w + 60) + (w + 60)) %
        (w + 60) -
      30;
    const y =
      (((Math.cos(seed * 1.3) * 0.5 + 0.5) * h - t * 48 * speed) % (h + 60) + (h + 60)) % (h + 60) - 30;
    const size = (2.4 + (i % 4) * 1.6) * unit * (1 + wordPulse * 0.35);
    const alpha = 0.26 + 0.44 * Math.abs(Math.sin(t * 2.5 + seed));

    ctx.fillStyle = i % 3 === 0 ? accentColor : context.palette.particleColor;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (wordPulse > 0.08) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const maxR = Math.hypot(w, h) * 0.55;
    const innerR = maxR * (0.58 - wordPulse * 0.08);
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = wordPulse * 0.32;
    ctx.lineWidth = 3 * unit;

    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + Math.floor(t * 6) * 0.12;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * innerR, Math.sin(ang) * innerR);
      ctx.lineTo(Math.cos(ang) * maxR, Math.sin(ang) * maxR);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Motor principal 2.5D/3D Adaptativo (0 segundos estáticos, cada escena única según su visualSpec).
 */
export function renderProceduralSceneFrame(
  ctx: CanvasRenderingContext2D,
  params: ProceduralFrameParams
): void {
  const {
    width: w,
    height: h,
    scene,
    script,
    localElapsed,
    liveClockSec,
    isSpeaking,
    wordPulse,
    accentColor = '#F97316',
    reducedMotion = false,
  } = params;

  const context = analyzeSceneContext(scene, script);
  const t = isSpeaking ? localElapsed + scene.orden * 3.7 : liveClockSec + scene.orden * 3.7;

  // Micro-cortes cada 2.7 segundos para mantener retención máxima
  const microCutPeriod = 2.7;
  const microCutIdx = Math.floor(Math.max(0, localElapsed) / microCutPeriod);
  const microCutElapsed = Math.max(0, localElapsed) % microCutPeriod;
  const shotMode = (scene.orden + microCutIdx) % 3;

  const entrySpring = reducedMotion ? 1 : easeOutBack(Math.min(1, microCutElapsed / 0.34));
  const punchZoom = reducedMotion
    ? 1.02
    : shotMode === 1
      ? 1.15 + (entrySpring - 1) * 0.07 + Math.min(0.07, microCutElapsed * 0.024)
      : shotMode === 2
        ? 0.99 + Math.min(0.08, microCutElapsed * 0.028)
        : 1.03 + (entrySpring - 1) * 0.06 + Math.min(0.07, microCutElapsed * 0.026);

  const shakeAmp = reducedMotion ? 0 : context.isViralMeme ? 0.95 : 0.55;
  const handheldX = (Math.sin(t * 2.1) * 8 + Math.cos(t * 5.3) * 3.5) * shakeAmp * (w / 720);
  const handheldY = (Math.cos(t * 1.9) * 6 + Math.sin(t * 4.7) * 2.5) * shakeAmp * (h / 1280);
  const bumpScale = reducedMotion ? 0 : wordPulse * 0.045;
  const bumpY = reducedMotion ? 0 : -wordPulse * 10 * (h / 1280);
  const camRot = reducedMotion
    ? 0
    : Math.sin(t * 1.4) * 0.012 +
      (shotMode === 1 ? 0.018 : shotMode === 2 ? -0.015 : 0) +
      wordPulse * (microCutIdx % 2 === 0 ? 0.015 : -0.015);

  const shotPanX = shotMode === 1 ? -w * 0.035 : shotMode === 2 ? w * 0.03 : 0;
  const shotPanY = shotMode === 1 ? h * 0.04 : 0;

  ctx.save();
  ctx.fillStyle = '#07090D';
  ctx.fillRect(0, 0, w, h);

  ctx.translate(w / 2 + handheldX + shotPanX, h / 2 + handheldY + bumpY + shotPanY);
  ctx.rotate(camRot);
  ctx.scale(punchZoom + bumpScale, punchZoom + bumpScale);
  ctx.translate(-w / 2, -h / 2);

  const parallaxX = Math.sin(t * 1.35) * 30 * (w / 720) + shotPanX * 0.45;

  // Capa 1: Fondo atmosférico + suelo en perspectiva
  drawAtmosphericBackdrop(ctx, w, h, t, parallaxX, context, wordPulse);

  // Capa 2: Entorno específico de esta escena (16 escenarios distintos)
  drawStageArchitecture(ctx, w, h, t, parallaxX, context, wordPulse);

  const unit = Math.min(w, h) / 720;

  // Capa 3: Multitud secundaria SOLO si mainSubject === 'shocked_crowd'
  if (context.hasCrowd) {
    const crowdPositions = [
      { x: w * 0.18, y: h * 0.56, s: 0.46, seed: 1 },
      { x: w * 0.82, y: h * 0.56, s: 0.46, seed: 2 },
      { x: w * 0.31, y: h * 0.6, s: 0.54, seed: 3 },
      { x: w * 0.69, y: h * 0.6, s: 0.54, seed: 4 },
    ];
    crowdPositions.forEach((p) => {
      drawStylized3DCharacter(ctx, {
        cx: p.x - parallaxX * 0.7,
        cy: p.y,
        scale: unit * p.s,
        t,
        isSpeaking: false,
        wordPulse,
        context: { ...context, emotion: 'shock' },
        lookOffsetX: p.x < w / 2 ? 0.6 : -0.6,
        isBackgroundCrowd: true,
        seed: p.seed,
      });
    });
  }

  // Capa 4: Personaje protagonista 3D articulado (posicionado para lucir junto al prop)
  const isCenterSpeaker = context.propIcon === 'bluetooth_speaker';
  const mainCharX = isCenterSpeaker ? w * 0.5 - parallaxX * 0.22 : w * 0.42 - parallaxX * 0.24;
  const mainCharY = isCenterSpeaker
    ? h * 0.42
    : context.mainSubject === 'walking_happy' || context.mainSubject === 'running_fast'
      ? h * 0.45
      : h * 0.48;
  const mainCharScale = unit * (shotMode === 1 ? 1.06 : 0.96);

  drawStylized3DCharacter(ctx, {
    cx: mainCharX,
    cy: mainCharY,
    scale: mainCharScale,
    t,
    isSpeaking,
    wordPulse,
    context,
    lookOffsetX: Math.sin(t * 1.9) * 0.48,
    isBackgroundCrowd: false,
    seed: scene.orden,
  });

  // Capa 5: Prop protagonista animado específico de esta escena (15 props distintos)
  drawContextHeroProp(ctx, w, h, t, context, wordPulse);

  // Capa 6: Partículas y líneas cinéticas
  drawDynamicParticlesAndImpact(ctx, w, h, t, context, wordPulse, accentColor);

  ctx.restore();

  // Viñeta y scrim inferior para contraste de subtítulos
  const scrim = ctx.createLinearGradient(0, 0, 0, h);
  scrim.addColorStop(0, 'rgba(0,0,0,0.32)');
  scrim.addColorStop(0.45, 'rgba(0,0,0,0.05)');
  scrim.addColorStop(0.72, 'rgba(0,0,0,0.46)');
  scrim.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, w, h);

  if (!reducedMotion && microCutIdx > 0 && microCutElapsed < 0.12) {
    const flashAlpha = (1 - microCutElapsed / 0.12) * 0.3;
    ctx.fillStyle = `rgba(255, 248, 235, ${flashAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * Genera una miniatura distinta para cada tarjeta de escena desde el segundo 0
 */
export function renderProceduralThumbnailDataUrl(
  scene: ScriptScene,
  script: ViralScript,
  aspectRatio: VideoAspectRatio
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = aspectRatio === '16:9' ? 320 : 180;
  canvas.height = aspectRatio === '16:9' ? 180 : 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  renderProceduralSceneFrame(ctx, {
    width: canvas.width,
    height: canvas.height,
    scene,
    script,
    localElapsed: 0.55 + scene.orden * 0.45,
    sceneDuration: Math.max(3, scene.segundoFin - scene.segundoInicio),
    liveClockSec: 0.55 + scene.orden * 0.45,
    isSpeaking: true,
    wordPulse: scene.esGiro30s ? 0.55 : 0.22,
    accentColor: '#F97316',
    reducedMotion: false,
  });

  return canvas.toDataURL('image/jpeg', 0.85);
}
