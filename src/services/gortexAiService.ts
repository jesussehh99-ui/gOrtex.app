import type {
  AlternativeHookItem,
  AudienceId,
  BeatHudData,
  BeatPacingProfile,
  BeatRetentionRole,
  CameraMotionPreset,
  CommercialBrief,
  CommercialCtaOverlay,
  CommercialSpecBadge,
  CommercialSpecIcon,
  DurationOption,
  FoleyCueType,
  GenerateScriptPayload,
  GroundingSource,
  HookStyleId,
  ImageAspectRatio,
  NarrativeBlueprint,
  PlatformId,
  RefineScenePayload,
  RetentionAudit,
  SagaBible,
  SagaMemoryUpdate,
  ScenePhase,
  SceneVisualSpec,
  ScriptLanguage,
  ScriptScene,
  SemanticWordStyle,
  SemanticWordTag,
  ShotType,
  ShotVariationType,
  StudioMode,
  Style3DId,
  TrendItem,
  TrendRadarResult,
  VideoAspectRatio,
  ViralScript,
  VisualBible,
  VisualEnvironmentId,
  VisualMoodPalette,
  VisualPropIcon,
  VisualSubjectAction,
} from '../types';
import {
  getCommercialSectorById,
  sanitizeCommercialFoleyCue,
} from '../data/commercialPresets';
import {
  base64ToUtf8,
  extractAndSanitizeSvg,
  extractJsonString,
  GeminiApiError,
  generateContentWithGemini,
  generateJsonWithGemini,
  Type,
  utf8ToBase64,
} from './geminiClient';

const STYLE_LABELS: Record<string, string> = {
  soft_storybook:
    'Gentle non-realistic matte 3D storybook illustration for kids and general audiences, rounded toy-like characters with calm understated minimal expressions, soft pastel daylight, friendly uncluttered shapes',
  flat_kids:
    'Clean modern flat 2D picture-book illustration for kids and general audiences, simplified geometric shapes, calm dot-eye understated expressions, soft gouache matte colors, gentle daylight',
  paper_diorama:
    'Minimalist handcrafted layered paper-cut and wooden peg toy diorama for all ages, calm neutral understated faces, warm soft studio daylight, matte cardstock texture',
  viral_meme_3d:
    'Cartoonish stylized 3D viral internet meme animation in Blender / Source Filmmaker (SFM) comedy style, characters with wildly exaggerated facial expressions (bulging eyes, dropped jaws, dramatic side-eye, frozen panic), comical slapstick/ragdoll physics, dynamic vertical camera work (first-person POV shots, rapid crash zooms onto stunned secondary characters, wide chaotic crowd establishing shots), bright punchy 3D shaders',
  pixar_dark: 'Dark stylized Pixar-grade 3D animation with volumetric thriller lighting',
  ue5_realism: 'Photorealistic Unreal Engine 5 cinematic 3D render with dramatic 35mm lens',
  clay_suspense: 'Tactile 3D stop-motion claymation frame with warm tungsten key lighting',
  stylized_thriller: 'Painterly 3D stylized noir animation with sharp amber accents',
};

const AUDIENCE_RULES: Record<string, string> = {
  educational:
    'FORMATOS INFORMATIVOS, ÚTILES Y "¿SABÍAS QUÉ?": Enfócate en explicar datos fascinantes, consejos prácticos que ayuden de verdad, curiosidades científicas, salud, finanzas personales, tecnología o historia real de manera clara, amena y memorable. NO fuerces giros ficticios artificiales: organiza el video como gancho inmediato + datos/pasos de alto valor que mantengan la atención + conclusión útil.',
  kids: 'PÚBLICO INFANTIL Y FAMILIAR (NIÑOS Y PADRES): 100% seguro, cero violencia, cero terror, cero expresiones exageradas o agresivas. Usa asombro, curiosidad positiva, descubrimientos ingeniosos y personajes tranquilos/amigables con expresiones serenas y suaves.',
  general:
    'PÚBLICO GENERAL (TODAS LAS EDADES): Apto para todo anunciante, tono entretenido, accesible, claro y atrapante. Sigue fielmente la intención e idea del usuario (ya sea historia, curiosidad, guía útil o dato interesante) con estética ilustrativa limpia.',
  viral_meme:
    'MODO ANIMACIÓN 3D VIRAL / MEME ("¿QUÉ PASARÍA SI...?"): Estilo de comedia viral de TikTok, YouTube Shorts y Reels inspirado en animaciones 3D caricaturescas de Blender y Source Filmmaker (SFM). Empieza en 0:00 con el objeto o situación absurda fuera de lugar, incluye expresiones faciales exageradas, físicas cómicas, reacciones graciosas de personajes secundarios y alterna planos POV, crash zooms y planos abiertos.',
  suspense:
    'PÚBLICO ADULTO / SUSPENSO: Narrativa intensa de misterio, dilemas extremos o casos reales fascinantes con atmósfera cinematográfica y revelaciones bien dosificadas.',
};

const PLATFORM_LABELS: Record<string, string> = {
  tiktok_creativity: 'TikTok Creator Rewards (videos verticales +60s monetizados por RPM y retención)',
  youtube_shorts: 'YouTube Shorts + embudo hacia compilaciones de formato largo',
  youtube_long: 'YouTube Horizontal 16:9 (video estándar de alto RPM apto para anunciantes)',
  instagram_reels: 'Instagram Reels optimizado para compartidos, guardados y patrocinios',
};

const VALID_VISUAL_ENVIRONMENTS = new Set<string>([
  'park_walking',
  'brain_neurons',
  'heart_bloodflow',
  'muscles_gym',
  'sleep_bedroom',
  'ancient_rome',
  'medieval_castle',
  'space_cosmos',
  'money_charts',
  'office_desk',
  'city_street',
  'tech_studio',
  'forest_stream',
  'ocean_deep',
  'survival_wild',
  'mystery_vault',
]);

const VALID_VISUAL_SUBJECTS = new Set<string>([
  'walking_happy',
  'running_fast',
  'flexing_muscles',
  'stressed_head',
  'sleeping_peaceful',
  'thinking_curious',
  'triumphant_celebrate',
  'shocked_crowd',
  'holding_speaker',
  'working_focused',
  'counting_money',
  'exploring_pov',
]);

const VALID_VISUAL_PROPS = new Set<string>([
  'sneakers_steps',
  'brain_glow',
  'heart_pulse',
  'dumbbell',
  'clock_calendar',
  'bluetooth_speaker',
  'coin_chart',
  'smartphone_glow',
  'compass_map',
  'planet_rocket',
  'warning_bolt',
  'energy_sun',
  'paper_boat',
  'coffee_cup',
  'shield_lock',
]);

const VALID_VISUAL_PALETTES = new Set<string>([
  'warm_energy',
  'neon_science',
  'crimson_pulse',
  'emerald_vitality',
  'golden_history',
  'alert_stress',
  'cosmic_indigo',
  'wealth_gold',
  'calm_storybook',
  'cyber_cyan',
]);

const VALID_NARRATIVE_BLUEPRINTS = new Set<string>([
  'pov_immersive',
  'classified_mystery',
  'historical_what_if',
  'escalation_ladder',
  'psychological_lore',
  'real_estate_tour',
  'local_business_ad',
  'commercial_promo',
]);

const BLUEPRINT_DIRECTIVES: Record<NarrativeBlueprint, string> = {
  pov_immersive: [
    'BLUEPRINT NARRATIVO ACTIVO — POV INMERSIVO (Primera Persona Presente):',
    '- Habla en segunda persona directa ("Abres los ojos...", "Sientes...", "Tu oxígeno cae a...") metiendo al espectador DENTRO de la crisis desde 0:00.',
    '- Usa transiciones sensoriales táctiles/acústicas, abundantes planos POV_FIRST_PERSON y CLOSE_UP_EMOTION (sin repetir consecutivo) y `foleyCue` físicos (heartbeat, sub_drop, whoosh_cut).',
  ].join('\n'),
  classified_mystery: [
    'BLUEPRINT NARRATIVO ACTIVO — MISTERIO CLASIFICADO (Expediente Forense):',
    '- Tono de documento desclasificado de investigación real: fecha exacta, coordenada/código técnico, anomalía medida en cifras (`hudData`) y una contradicción sin explicación oficial.',
    '- Usa pausas dramáticas (`prePauseMs`: 180-320ms) antes de las revelaciones y cues `hud_click`, `analog_glitch`, `sub_drop`.',
  ].join('\n'),
  historical_what_if: [
    'BLUEPRINT NARRATIVO ACTIVO — WHAT IF HISTÓRICO (Choque Contrafactual):',
    '- Arranca en 0:00 con la colisión imposible en pleno curso y encadena consecuencias físicas/sociales cada vez más absurdas o impactantes en cadena causa-efecto.',
    '- Ritmo ágil (`speedMultiplier` 1.05-1.18 en escalada), alternancia rápida de planos `WIDE_ESTABLISHING` -> `EXTREME_CLOSE_UP` -> `LOW_ANGLE_DRAMATIC` y `whoosh_cut`/`thunder_impact`.',
  ].join('\n'),
  escalation_ladder: [
    'BLUEPRINT NARRATIVO ACTIVO — ESCALERA DE ESCALADA (Niveles Progresivos):',
    '- Estructura la historia como una subida inexorable de intensidad (Nivel 1 sutil -> Nivel 2 inquietante -> Re-Hook a mitad -> Nivel crítico -> Punto sin retorno).',
    '- Incluye `hudData` con el peldaño, cifra o umbral de peligro en los beats clave y eleva progresivamente `riser_tension` -> `sub_drop` -> `thunder_impact`.',
  ].join('\n'),
  psychological_lore: [
    'BLUEPRINT NARRATIVO ACTIVO — LORE PSICOLÓGICO (Paradoja Mental):',
    '- Tono íntimo, hipnótico y ligeramente inquietante sobre cómo funciona la mente, la percepción o un fenómeno humano oculto.',
    '- Alterna susurros semánticos (`style: "whisper"` en wordTags) y revelaciones con `musicDuckLevel: 0.06` y `prePauseMs: 220-380ms` en los momentos de mayor impacto.',
  ].join('\n'),
  real_estate_tour: [
    'BLUEPRINT COMERCIAL ACTIVO — RECORRIDO INMOBILIARIO (Real Estate Tour Editorial):',
    '- Estructura de alta conversión: Beat 1 arranca con un gancho visual concreto y un dato diferencial real (ej. terraza, metraje, vista, ubicación) -> recorrido lógico espacio por espacio (fachada/acceso -> sala/luz natural -> cocina/acabados -> recámaras/amenidades) -> ficha técnica clara (`commercialSpecs`) -> cierre elegante con CTA de visita.',
    '- Tono editorial de arquitectura y agencia de alto nivel: natural, aspiracional y concreto, cero hipérboles artificiales.',
    '- Usa `cameraMotion` suaves de gimbal/dron (`dolly_in`, `dolly_out`, `orbit_left`, `orbit_right`, `rack_focus_reveal`) y `foleyCue` únicamente elegantes (`none`, `whoosh_cut`, `hud_click`, `riser_tension`).',
  ].join('\n'),
  local_business_ad: [
    'BLUEPRINT COMERCIAL ACTIVO — ANUNCIO DE NEGOCIO LOCAL (Local Business Ad):',
    '- Estructura persuasiva: Beat 1 ataca un deseo o necesidad cotidiana concreta -> presenta el ambiente real y diferencial del lugar -> muestra el producto o servicio estrella en plano detalle -> destaca ubicación/horarios reales (`commercialSpecs`) -> cierre directo con CTA de reserva o visita.',
    '- Lenguaje cercano, auténtico y memorable que suene a anuncio real de marca local cuidada.',
    '- Usa `foleyCue` elegantes únicamente (`none`, `whoosh_cut`, `hud_click`, `riser_tension`).',
  ].join('\n'),
  commercial_promo: [
    'BLUEPRINT COMERCIAL ACTIVO — PROMO / OFERTA COMERCIAL (Commercial Promo):',
    '- Estructura directa a conversión: Beat 1 abre con la propuesta de valor o beneficio medible -> prueba visual inmediata del espacio/producto -> desglose ágil de ventajas y condición de la oferta (`commercialSpecs`) -> cierre claro con CTA accionable.',
    '- Cero relleno: cada beat aporta una razón visual o económica concreta para actuar hoy.',
    '- Usa `foleyCue` elegantes únicamente (`none`, `whoosh_cut`, `hud_click`, `riser_tension`).',
  ].join('\n'),
};

const ANTI_CLICHE_DIRECTIVE = [
  'FILTRO ESTRICTO ANTI-CLICHÉS DE IA (LISTA NEGRA ABSOLUTA):',
  '- PROHIBIDO usar en el segundo 0:00 o en cualquier narración frases genéricas, clichés publicitarios robóticos o rellenos como: "En un mundo donde", "En el mundo de hoy", "¿Alguna vez te has preguntado?", "Prepárate para", "Acompáñame a descubrir", "Hoy vamos a ver", "En este video te contaré", "Imagina un mundo", "Hola amigos", "Bienvenidos", "Quédate hasta el final", "Descubre un oasis de lujo", "No te pierdas esta oportunidad única", "El hogar de tus sueños".',
  '- OBLIGATORIO: El segundo 0:00 DEBE arrancar en frío con una ACCIÓN INMEDIATA, un DATO/CIFRA/CARACTERÍSTICA REAL concreta o un GANCHO VISUAL específico desde la primera palabra.',
].join('\n');

const SHOT_TYPE_CYCLE: ShotType[] = [
  'WIDE_ESTABLISHING',
  'EXTREME_CLOSE_UP',
  'LOW_ANGLE_DRAMATIC',
  'OVER_THE_SHOULDER',
  'CLOSE_UP_EMOTION',
  'MEDIUM_ACTION',
  'POV_FIRST_PERSON',
];

const SHOT_TYPE_EN_FRAMING: Record<ShotType, { en: string; es: string }> = {
  WIDE_ESTABLISHING: {
    en: 'Wide establishing shot showing full environment and dramatic spatial scale',
    es: 'Plano general amplio con dolly suave de entrada',
  },
  MEDIUM_ACTION: {
    en: 'Dynamic medium action shot framing the protagonist mid-motion',
    es: 'Plano medio dinámico siguiendo la acción principal',
  },
  CLOSE_UP_EMOTION: {
    en: 'Tight cinematic close-up capturing subtle tension and expression',
    es: 'Primer plano íntimo con enfoque en la expresión',
  },
  EXTREME_CLOSE_UP: {
    en: 'Extreme close-up macro detail shot on the decisive object or eyes',
    es: 'Primerísimo primer plano macro al detalle clave',
  },
  LOW_ANGLE_DRAMATIC: {
    en: 'Dramatic low-angle upward hero shot creating towering tension',
    es: 'Ángulo contrapicado dramático ascendente',
  },
  OVER_THE_SHOULDER: {
    en: 'Over-the-shoulder cinematic framing pulling the viewer into the scene',
    es: 'Plano sobre el hombro con profundidad cinematográfica',
  },
  POV_FIRST_PERSON: {
    en: 'Immersive first-person POV shot placing the viewer directly inside the moment',
    es: 'Plano subjetivo POV inmersivo en primera persona',
  },
};

const VALID_SHOT_TYPES = new Set<string>(SHOT_TYPE_CYCLE);
const VALID_CAMERA_MOTIONS = new Set<string>([
  'dolly_in',
  'dolly_out',
  'orbit_left',
  'orbit_right',
  'handheld_tension',
  'rack_focus_reveal',
  'push_impact',
]);
const VALID_FOLEY_CUES = new Set<string>([
  'none',
  'sub_drop',
  'riser_tension',
  'hud_click',
  'whoosh_cut',
  'heartbeat',
  'thunder_impact',
  'analog_glitch',
]);
const VALID_WORD_STYLES = new Set<string>(['normal', 'emphasis', 'danger', 'stat', 'whisper']);
const VALID_RETENTION_ROLES = new Set<string>([
  'hook',
  'setup',
  'escalation',
  're_hook',
  'climax',
  'loop_close',
]);
const VALID_PHASES = new Set<string>([
  'Gancho',
  'Desarrollo',
  'Dato clave',
  'Tensión',
  'Giro',
  'Giro 30s',
  'Escalada',
  'Cierre y Loop',
  'Clímax y Loop',
]);

const BEAT_CAMERA_PLANS = [
  {
    en: 'Wide establishing shot showing full environment and dramatic scale',
    es: 'Plano general amplio con zoom suave de entrada',
  },
  {
    en: 'Extreme close-up macro shot focusing tightly on the key object or eyes',
    es: 'Primerísimo primer plano macro al objeto o mirada clave',
  },
  {
    en: 'Dramatic low-angle upward hero shot with towering perspective',
    es: 'Ángulo contrapicado dramático ascendente',
  },
  {
    en: 'Immersive over-the-shoulder POV shot pulling the viewer into the action',
    es: 'Plano subjetivo POV sobre el hombro con empuje dinámico',
  },
];

const VALID_COMMERCIAL_SPEC_ICONS = new Set<string>([
  'price',
  'area',
  'rooms',
  'location',
  'hours',
  'discount',
  'highlight',
]);

function normalizeCommercialSpecs(rawSpecs: unknown): CommercialSpecBadge[] | undefined {
  if (!Array.isArray(rawSpecs) || rawSpecs.length === 0) return undefined;
  const cleaned: CommercialSpecBadge[] = [];
  for (const item of rawSpecs) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const label = String(rec.label || '').trim().slice(0, 26);
    const value = String(rec.value || '').trim().slice(0, 32);
    if (!label || !value) continue;
    const rawIcon = String(rec.icon || 'highlight').trim().toLowerCase();
    const icon: CommercialSpecIcon = VALID_COMMERCIAL_SPEC_ICONS.has(rawIcon)
      ? (rawIcon as CommercialSpecIcon)
      : 'highlight';
    cleaned.push({ icon, label, value });
    if (cleaned.length >= 3) break;
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeCtaOverlay(rawCta: unknown): CommercialCtaOverlay | undefined {
  if (!rawCta || typeof rawCta !== 'object') return undefined;
  const rec = rawCta as Record<string, unknown>;
  const headline = String(rec.headline || '').trim().slice(0, 64);
  if (!headline) return undefined;
  const subheadline = String(rec.subheadline || '').trim().slice(0, 72);
  const contactLine = String(rec.contactLine || '').trim().slice(0, 56);
  const badge = String(rec.badge || '').trim().slice(0, 36);
  return {
    headline,
    ...(subheadline ? { subheadline } : {}),
    ...(contactLine ? { contactLine } : {}),
    ...(badge ? { badge } : {}),
  };
}

function resolveNarrativeBlueprint(
  requested: unknown,
  niche: string,
  audience: string,
  studioMode: StudioMode = 'viral_storytelling',
  commercialBrief?: CommercialBrief
): NarrativeBlueprint {
  const reqStr = String(requested || '').trim();
  if (VALID_NARRATIVE_BLUEPRINTS.has(reqStr)) {
    if (
      studioMode === 'commercial_real_estate' &&
      !['real_estate_tour', 'local_business_ad', 'commercial_promo'].includes(reqStr)
    ) {
      return getCommercialSectorById(commercialBrief?.sector).defaultBlueprint;
    }
    return reqStr as NarrativeBlueprint;
  }
  if (studioMode === 'commercial_real_estate') {
    return getCommercialSectorById(commercialBrief?.sector).defaultBlueprint;
  }
  const n = niche.toLowerCase();
  if (audience === 'viral_meme' || /what if|absurd|pasaría si|meme/.test(n)) {
    return 'historical_what_if';
  }
  if (/superviv|pov|extremo|cuerpo|oc[eé]ano|abisal|submar/.test(n)) {
    return 'pov_immersive';
  }
  if (/psicolog|mente|sue[ñn]o|paradoja|cerebro|trauma/.test(n)) {
    return 'psychological_lore';
  }
  if (/expediente|misterio|espacio|señal|clasific|crimen|enigma|lore|historia/.test(n)) {
    return 'classified_mystery';
  }
  if (/nivel|escala|dinero|finanza|top|etapa|fases|ciencia/.test(n)) {
    return 'escalation_ladder';
  }
  return audience === 'suspense' ? 'classified_mystery' : 'escalation_ladder';
}

function normalizeVisualSpec(rawSpec: unknown, fallbackPrompt: string) {
  const spec =
    rawSpec && typeof rawSpec === 'object' ? (rawSpec as Record<string, unknown>) : {};
  const envRaw = String(spec.environment || '').trim();
  const subjRaw = String(spec.mainSubject || '').trim();
  const propRaw = String(spec.propIcon || '').trim();
  const palRaw = String(spec.moodPalette || '').trim();
  const flowPromptRaw = String(spec.flowPrompt || '').trim();

  return {
    environment: VALID_VISUAL_ENVIRONMENTS.has(envRaw)
      ? (envRaw as VisualEnvironmentId)
      : undefined,
    mainSubject: VALID_VISUAL_SUBJECTS.has(subjRaw)
      ? (subjRaw as VisualSubjectAction)
      : undefined,
    propIcon: VALID_VISUAL_PROPS.has(propRaw) ? (propRaw as VisualPropIcon) : undefined,
    moodPalette: VALID_VISUAL_PALETTES.has(palRaw) ? (palRaw as VisualMoodPalette) : undefined,
    flowPrompt: flowPromptRaw.length >= 25 ? flowPromptRaw : fallbackPrompt,
  };
}

function normalizeVisualBible(rawBible: unknown, fallbackStyle: string): VisualBible {
  const b = rawBible && typeof rawBible === 'object' ? (rawBible as Record<string, unknown>) : {};
  const artStyle = String(b.artStyle || '').trim() || fallbackStyle;
  const lightingPalette =
    String(b.lightingPalette || '').trim() ||
    'Dramatic volumetric rim lighting, deep atmospheric shadows, high-contrast cinema color grading';
  const characterOrWorldLock =
    String(b.characterOrWorldLock || '').trim() ||
    'Consistent central protagonist appearance, wardrobe, proportions, and cohesive architectural world design across every shot';
  const rawPrefix = String(b.fixedPrefixPrompt || '').trim();
  const fixedPrefixPrompt =
    rawPrefix.length >= 20
      ? rawPrefix
      : `${artStyle}, ${lightingPalette}, ${characterOrWorldLock}`;

  return {
    artStyle,
    lightingPalette,
    characterOrWorldLock,
    fixedPrefixPrompt,
  };
}

function injectVisualBiblePrefix(prompt: string, fixedPrefix?: string): string {
  const cleanPrompt = prompt.replace(/\s+/g, ' ').trim();
  const cleanPrefix = (fixedPrefix || '').replace(/\s+/g, ' ').trim();
  if (!cleanPrefix || cleanPrefix.length < 12) return cleanPrompt;
  if (cleanPrompt.toLowerCase().includes(cleanPrefix.slice(0, 28).toLowerCase())) {
    return cleanPrompt;
  }
  return `${cleanPrefix}. ${cleanPrompt}`;
}

function normalizeWordTagsForNarration(
  rawTags: unknown,
  narration: string,
  visualKeywords: string[]
): SemanticWordTag[] {
  const words = narration.trim().split(/\s+/).filter(Boolean);
  const tagMap = new Map<string, SemanticWordStyle>();
  if (Array.isArray(rawTags)) {
    for (const item of rawTags) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const w = String(rec.word || '').trim();
      const st = String(rec.style || '').trim();
      if (w && VALID_WORD_STYLES.has(st)) {
        tagMap.set(w.toLowerCase().replace(/[^a-z0-9áéíóúñü]/gi, ''), st as SemanticWordStyle);
      }
    }
  }
  const kwSet = new Set(
    visualKeywords
      .flatMap((k) => k.split(/\s+/))
      .map((w) => w.toLowerCase().replace(/[^a-z0-9áéíóúñü]/gi, ''))
      .filter((w) => w.length >= 3)
  );

  return words.map((word) => {
    const clean = word.toLowerCase().replace(/[^a-z0-9áéíóúñü]/gi, '');
    let style: SemanticWordStyle = tagMap.get(clean) || 'normal';
    if (style === 'normal') {
      if (/\d/.test(word) || /^[A-Z0-9]{4,}$/.test(word.replace(/[^A-Za-z0-9]/g, ''))) {
        style = 'stat';
      } else if (kwSet.has(clean)) {
        style = 'emphasis';
      }
    }
    return { word, style };
  });
}

function normalizePacingProfile(
  rawPacing: unknown,
  role: string,
  isTwist: boolean
): BeatPacingProfile {
  const rec =
    rawPacing && typeof rawPacing === 'object' ? (rawPacing as Record<string, unknown>) : {};
  const rawSpeed = Number(rec.speedMultiplier);
  const rawPause = Number(rec.prePauseMs);
  const rawDuck = Number(rec.musicDuckLevel);

  const defaultSpeed = role === 'climax' || role === 'hook' ? 1.06 : role === 're_hook' ? 0.96 : 1.0;
  const defaultPause = role === 're_hook' || isTwist ? 220 : role === 'climax' ? 180 : 0;
  const defaultDuck = role === 're_hook' || role === 'climax' || isTwist ? 0.06 : 0.12;

  return {
    speedMultiplier: Number(
      (Number.isFinite(rawSpeed) ? Math.max(0.85, Math.min(1.25, rawSpeed)) : defaultSpeed).toFixed(
        2
      )
    ),
    prePauseMs: Number.isFinite(rawPause)
      ? Math.max(0, Math.min(450, Math.round(rawPause)))
      : defaultPause,
    musicDuckLevel: Number(
      (Number.isFinite(rawDuck) ? Math.max(0.05, Math.min(0.25, rawDuck)) : defaultDuck).toFixed(2)
    ),
  };
}

function normalizeHudData(rawHud: unknown): BeatHudData | undefined {
  if (!rawHud || typeof rawHud !== 'object') return undefined;
  const rec = rawHud as Record<string, unknown>;
  const label = String(rec.label || '').trim();
  const value = String(rec.value || '').trim();
  const unit = String(rec.unit || '').trim();
  if (!label || !value) return undefined;
  return {
    label: label.slice(0, 32),
    value: value.slice(0, 24),
    ...(unit ? { unit: unit.slice(0, 20) } : {}),
  };
}

function normalizeRetentionAudit(rawAudit: unknown, scenes: ScriptScene[]): RetentionAudit {
  const rec =
    rawAudit && typeof rawAudit === 'object' ? (rawAudit as Record<string, unknown>) : {};
  const count = Math.max(1, scenes.length);
  const rawHookScore = Number(rec.hookVelocityScore);
  const hookVelocityScore = Number.isFinite(rawHookScore)
    ? Math.max(0, Math.min(100, Math.round(rawHookScore)))
    : 86;

  let reHookIdx = Number(rec.reHookBeatIndex);
  if (!Number.isInteger(reHookIdx) || reHookIdx < 1 || reHookIdx >= count) {
    const found = scenes.findIndex((s) => s.retentionRole === 're_hook' || s.esGiro30s);
    reHookIdx = found >= 1 ? found : Math.max(1, Math.floor(count * 0.4));
  }

  const firstWords = String(scenes[0]?.narracion || '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
  const lastWords = String(scenes[count - 1]?.narracion || '')
    .trim()
    .split(/\s+/)
    .slice(-4)
    .join(' ');

  const patternInterruptCheck =
    String(rec.patternInterruptCheck || '').trim() ||
    'Pattern interrupts validados: cada 1-2 beats alterna plano, cue de foley o dato HUD.';
  const loopSeamVerification =
    String(rec.loopSeamVerification || '').trim() || `"${lastWords}" -> "${firstWords}"`;

  return {
    hookVelocityScore,
    reHookBeatIndex: reHookIdx,
    patternInterruptCheck,
    loopSeamVerification,
  };
}

function normalizeSagaMemoryUpdate(rawMem: unknown): SagaMemoryUpdate | undefined {
  if (!rawMem || typeof rawMem !== 'object') return undefined;
  const rec = rawMem as Record<string, unknown>;
  const toList = (val: unknown) =>
    Array.isArray(val)
      ? val
          .map((x) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];
  const recurringCharacters = toList(rec.recurringCharacters);
  const establishedLore = toList(rec.establishedLore);
  const resolvedLoop = String(rec.resolvedLoop || '').trim();
  const newUnresolvedLoop = String(rec.newUnresolvedLoop || '').trim();

  if (
    recurringCharacters.length === 0 &&
    establishedLore.length === 0 &&
    !resolvedLoop &&
    !newUnresolvedLoop
  ) {
    return undefined;
  }

  return {
    ...(recurringCharacters.length > 0 ? { recurringCharacters } : {}),
    ...(establishedLore.length > 0 ? { establishedLore } : {}),
    ...(resolvedLoop ? { resolvedLoop } : {}),
    ...(newUnresolvedLoop ? { newUnresolvedLoop } : {}),
  };
}

function getTargetBeatRange(durationSec: number): { min: number; max: number; target: number } {
  if (durationSec <= 30) return { min: 7, max: 8, target: 8 };
  if (durationSec <= 60) return { min: 14, max: 16, target: 15 };
  if (durationSec <= 90) return { min: 21, max: 24, target: 22 };
  if (durationSec <= 120) return { min: 28, max: 32, target: 30 };
  return { min: 40, max: 45, target: 42 };
}

function splitLongNarrationIntoBeats(text: string, maxWordsPerBeat = 12): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  const words = clean.split(' ').filter(Boolean);
  if (words.length <= maxWordsPerBeat + 2) return [clean];

  const targetBeats = Math.max(2, Math.round(words.length / 10));
  const idealSize = Math.ceil(words.length / targetBeats);
  const chunks: string[] = [];
  let idx = 0;

  while (idx < words.length) {
    let end = Math.min(words.length, idx + idealSize);
    if (end < words.length) {
      for (let look = end; look >= Math.max(idx + 6, end - 3); look--) {
        if (/[.!?,;:]$/.test(words[look - 1])) {
          end = look;
          break;
        }
      }
    }
    const remaining = words.length - end;
    if (remaining > 0 && remaining <= 4) {
      end = words.length;
    }
    chunks.push(words.slice(idx, end).join(' '));
    idx = end;
  }

  return chunks.filter(Boolean);
}

function enforceMicroSceneBeats(
  rawScenes: Record<string, unknown>[],
  safeDuration: number,
  visualBible: VisualBible,
  styleDesc: string,
  fallbackPremise: string,
  options?: {
    studioMode?: StudioMode;
    commercialBrief?: CommercialBrief;
    preserveBeatCountForPhotos?: boolean;
    photoCount?: number;
  }
): ScriptScene[] {
  const isCommercial = options?.studioMode === 'commercial_real_estate';
  const preserveForPhotos = Boolean(options?.preserveBeatCountForPhotos);
  const photoCount = options?.photoCount ?? 0;
  const commercialBrief = options?.commercialBrief;

  const formatMMSS = (sec: number) => {
    const clamped = Math.max(0, Math.round(sec));
    return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`;
  };

  const expanded: Record<string, unknown>[] = [];
  for (const sc of rawScenes) {
    const rawNarr = String(sc.narracion || '').trim() || fallbackPremise;
    const beatPieces = preserveForPhotos
      ? [rawNarr]
      : splitLongNarrationIntoBeats(rawNarr, 12);
    if (beatPieces.length === 1) {
      expanded.push(sc);
    } else {
      beatPieces.forEach((piece, subIdx) => {
        const cam = BEAT_CAMERA_PLANS[(expanded.length + subIdx) % BEAT_CAMERA_PLANS.length];
        const baseImg = String(sc.imagePrompt || sc.promptVisual3D || styleDesc).trim();
        const subWords = piece.replace(/[.,!?;:¡¿"]/g, '').split(/\s+/).filter(Boolean);
        const subTitle = subWords.slice(0, 5).join(' ').toUpperCase();
        expanded.push({
          ...sc,
          narracion: piece,
          subtituloDinamico: subIdx === 0 && sc.subtituloDinamico ? sc.subtituloDinamico : subTitle,
          palabraDestacada: subWords.find((w) => w.length >= 5) || subWords[0] || '',
          esGiro30s: subIdx === 0 ? Boolean(sc.esGiro30s) : false,
          shotType: subIdx === 0 ? sc.shotType : undefined,
          commercialSpecs: subIdx === 0 ? sc.commercialSpecs : undefined,
          isCtaBeat: subIdx === beatPieces.length - 1 ? sc.isCtaBeat : false,
          ctaOverlay: subIdx === beatPieces.length - 1 ? sc.ctaOverlay : undefined,
          movimientoCamara: cam.es,
          imagePrompt: `${cam.en}, illustrating "${piece.slice(0, 90)}", ${baseImg}`,
          promptVisual3D: `${cam.en}, ${baseImg}`,
          visualSpec:
            sc.visualSpec && typeof sc.visualSpec === 'object'
              ? {
                  ...(sc.visualSpec as Record<string, unknown>),
                  flowPrompt: `${cam.en}, fast 3.5-second vertical kinetic shot illustrating "${piece.slice(0, 90)}", ${String((sc.visualSpec as Record<string, unknown>).flowPrompt || baseImg)}`,
                }
              : sc.visualSpec,
        });
      });
    }
  }

  const finalList = expanded.length > 0 ? expanded : rawScenes;
  const count = Math.max(1, finalList.length);
  const wordCounts = finalList.map((sc) =>
    Math.max(4, String(sc.narracion || '').trim().split(/\s+/).filter(Boolean).length)
  );
  const totalWords = Math.max(1, wordCounts.reduce((a, b) => a + b, 0));
  const baseSeedBatch = Math.floor(100000 + Math.random() * 799999);

  const reHookTargetIdx = Math.max(1, Math.min(count - 2, Math.round(count * 0.4)));
  const hasExplicitReHook = finalList.some(
    (sc, idx) =>
      idx >= Math.max(1, Math.floor(count * 0.3)) &&
      idx <= Math.ceil(count * 0.5) &&
      (sc.retentionRole === 're_hook' || Boolean(sc.esGiro30s))
  );

  let cursor = 0;
  let prevShotType: ShotType | null = null;
  const rollingWorldState: string[] = [];

  return finalList.map((sc, idx): ScriptScene => {
    const proportionalDur = Math.max(
      3,
      Math.min(4.5, (wordCounts[idx] / totalWords) * safeDuration)
    );
    const startSec = Math.round(cursor);
    const nextCursor =
      idx === count - 1 ? Math.max(startSec + 3, safeDuration) : cursor + proportionalDur;
    const endSec = Math.max(startSec + 3, Math.round(nextCursor));
    cursor = nextCursor;

    const narracion = String(sc.narracion || '').trim() || fallbackPremise;
    const subtitulo =
      String(sc.subtituloDinamico || '').trim() ||
      narracion.split(/\s+/).slice(0, 5).join(' ').toUpperCase();

    // Shot Continuity Graph: jamás repetir el mismo shotType en dos beats consecutivos
    const candidateShot = String(sc.shotType || '').trim();
    let resolvedShot: ShotType = VALID_SHOT_TYPES.has(candidateShot)
      ? (candidateShot as ShotType)
      : SHOT_TYPE_CYCLE[idx % SHOT_TYPE_CYCLE.length];
    if (resolvedShot === prevShotType) {
      const curCycleIdx = SHOT_TYPE_CYCLE.indexOf(resolvedShot);
      resolvedShot = SHOT_TYPE_CYCLE[(curCycleIdx + 1 + (idx % 2)) % SHOT_TYPE_CYCLE.length];
      if (resolvedShot === prevShotType) {
        resolvedShot = SHOT_TYPE_CYCLE[(curCycleIdx + 1) % SHOT_TYPE_CYCLE.length];
      }
    }
    prevShotType = resolvedShot;
    const shotFraming = SHOT_TYPE_EN_FRAMING[resolvedShot];

    const rawDelta = String(sc.worldStateDelta || '').replace(/\s+/g, ' ').trim();
    const cleanDelta =
      rawDelta && !/^(none|ninguno|n\/a|sin cambios?|-)$/i.test(rawDelta)
        ? rawDelta.slice(0, 120)
        : '';
    const inheritedStateSnippet =
      rollingWorldState.length > 0 ? rollingWorldState.slice(-2).join('; ') : '';
    if (cleanDelta) {
      rollingWorldState.push(cleanDelta);
    }

    const injectContinuity = (baseText: string): string => {
      let out = baseText.replace(/\s+/g, ' ').trim();
      if (!out.toLowerCase().includes(shotFraming.en.slice(0, 16).toLowerCase())) {
        out = `${shotFraming.en}. ${out}`;
      }
      if (
        inheritedStateSnippet &&
        !out.toLowerCase().includes(inheritedStateSnippet.slice(0, 18).toLowerCase())
      ) {
        out = `${out}. Persistent world state: ${inheritedStateSnippet}`;
      }
      if (cleanDelta && !out.toLowerCase().includes(cleanDelta.slice(0, 18).toLowerCase())) {
        out = `${out}. Scene change: ${cleanDelta}`;
      }
      return injectVisualBiblePrefix(out, visualBible.fixedPrefixPrompt);
    };

    const rawPromptVisual =
      String(sc.promptVisual3D || '').trim() || `${shotFraming.en}, ${styleDesc}`;
    const promptVisual = injectContinuity(rawPromptVisual);
    const normalizedVisual = normalizeVisualSpec(sc.visualSpec, promptVisual);
    const lockedFlowPrompt = injectContinuity(normalizedVisual.flowPrompt);
    const visualSpec: SceneVisualSpec | undefined =
      normalizedVisual.environment &&
      normalizedVisual.mainSubject &&
      normalizedVisual.propIcon &&
      normalizedVisual.moodPalette
        ? {
            environment: normalizedVisual.environment,
            mainSubject: normalizedVisual.mainSubject,
            propIcon: normalizedVisual.propIcon,
            moodPalette: normalizedVisual.moodPalette,
            flowPrompt: lockedFlowPrompt,
          }
        : undefined;
    const rawImagePrompt =
      String(sc.imagePrompt || '').trim() || lockedFlowPrompt || promptVisual;
    const imagePrompt = injectContinuity(rawImagePrompt);

    const rawVisualKeywords = Array.isArray(sc.visualKeywords)
      ? sc.visualKeywords
          .map((kw) => String(kw || '').trim())
          .filter((kw) => kw.length >= 2)
          .slice(0, 4)
      : [];

    const rawRole = String(sc.retentionRole || '').trim();
    let retentionRole: BeatRetentionRole = VALID_RETENTION_ROLES.has(rawRole)
      ? (rawRole as BeatRetentionRole)
      : idx === 0
        ? 'hook'
        : idx === count - 1
          ? 'loop_close'
          : Boolean(sc.esGiro30s)
            ? 're_hook'
            : idx >= count - 2
              ? 'climax'
              : idx <= 2
                ? 'setup'
                : 'escalation';

    if (!hasExplicitReHook && count >= 5 && idx === reHookTargetIdx) {
      retentionRole = 're_hook';
    }

    const isKeyTwist =
      Boolean(sc.esGiro30s) || retentionRole === 're_hook' || retentionRole === 'climax';

    const rawMotion = String(sc.cameraMotion || '').trim();
    const defaultMotions: CameraMotionPreset[] = isCommercial
      ? ['dolly_in', 'orbit_right', 'dolly_out', 'orbit_left', 'rack_focus_reveal']
      : [
          'dolly_in',
          'push_impact',
          'orbit_left',
          'handheld_tension',
          'rack_focus_reveal',
          'dolly_out',
          'orbit_right',
        ];
    let cameraMotion: CameraMotionPreset = VALID_CAMERA_MOTIONS.has(rawMotion)
      ? (rawMotion as CameraMotionPreset)
      : defaultMotions[idx % defaultMotions.length];
    if (isCommercial && (cameraMotion === 'handheld_tension' || cameraMotion === 'push_impact')) {
      cameraMotion = idx % 2 === 0 ? 'dolly_in' : 'orbit_right';
    }

    const rawFoley = String(sc.foleyCue || '').trim();
    const defaultFoley: FoleyCueType = isCommercial
      ? idx === 0
        ? 'whoosh_cut'
        : idx % 3 === 0
          ? 'hud_click'
          : 'none'
      : idx === 0
        ? 'sub_drop'
        : retentionRole === 're_hook'
          ? 'riser_tension'
          : retentionRole === 'climax'
            ? 'thunder_impact'
            : idx % 3 === 0
              ? 'whoosh_cut'
              : 'none';
    const rawValidFoley: FoleyCueType = VALID_FOLEY_CUES.has(rawFoley)
      ? (rawFoley as FoleyCueType)
      : defaultFoley;
    const foleyCue: FoleyCueType = isCommercial
      ? sanitizeCommercialFoleyCue(rawValidFoley)
      : rawValidFoley;

    const pacingProfile = normalizePacingProfile(sc.pacingProfile, retentionRole, isKeyTwist);
    const hudData = normalizeHudData(sc.hudData);
    const wordTags = normalizeWordTagsForNarration(sc.wordTags, narracion, rawVisualKeywords);
    const depthTitleText = String(sc.depthTitleText || '').trim().slice(0, 26) || undefined;

    const commercialSpecs = isCommercial
      ? normalizeCommercialSpecs(sc.commercialSpecs)
      : undefined;
    const isLastBeat = idx === count - 1;
    const wantsCta = isCommercial && commercialBrief?.includeCtaCard !== false;
    const isCtaBeat = Boolean(sc.isCtaBeat) || (wantsCta && isLastBeat);
    let ctaOverlay = isCtaBeat ? normalizeCtaOverlay(sc.ctaOverlay) : undefined;
    if (isCtaBeat && !ctaOverlay && wantsCta) {
      const headline =
        (commercialBrief?.ctaHeadline || '').trim() ||
        (commercialBrief?.businessOrPropertyName
          ? `Conoce ${commercialBrief.businessOrPropertyName}`
          : 'Agenda tu visita hoy');
      ctaOverlay = {
        headline,
        ...(commercialBrief?.locationText ? { subheadline: commercialBrief.locationText } : {}),
        ...(commercialBrief?.ctaContact ? { contactLine: commercialBrief.ctaContact } : {}),
        ...(commercialBrief?.businessOrPropertyName
          ? { badge: commercialBrief.businessOrPropertyName }
          : {}),
      };
    } else if (ctaOverlay && commercialBrief?.ctaContact && !ctaOverlay.contactLine) {
      ctaOverlay = { ...ctaOverlay, contactLine: commercialBrief.ctaContact };
    }

    const mappedPhotoIdx =
      preserveForPhotos && photoCount > 0 && idx < photoCount ? idx : undefined;

    const resolvedFase: ScenePhase = VALID_PHASES.has(String(sc.fase))
      ? (String(sc.fase) as ScenePhase)
      : idx === 0
        ? 'Gancho'
        : idx === count - 1
          ? 'Cierre y Loop'
          : retentionRole === 're_hook'
            ? 'Giro'
            : isKeyTwist
              ? 'Dato clave'
              : 'Desarrollo';

    return {
      id: `beat-${idx + 1}`,
      orden: idx + 1,
      segundoInicio: startSec,
      segundoFin: endSec,
      tiempoInicio: formatMMSS(startSec),
      tiempoFin: formatMMSS(endSec),
      narracion,
      subtituloDinamico: subtitulo,
      palabraDestacada:
        String(sc.palabraDestacada || '').trim() || subtitulo.split(/\s+/)[0] || '',
      ...(rawVisualKeywords.length > 0 ? { visualKeywords: rawVisualKeywords } : {}),
      wordTags,
      shotType: resolvedShot,
      cameraMotion,
      ...(depthTitleText ? { depthTitleText } : {}),
      ...(hudData ? { hudData } : {}),
      foleyCue,
      pacingProfile,
      worldStateDelta: cleanDelta,
      retentionRole,
      promptVisual3D: promptVisual,
      imagePrompt,
      imageSeed: ((baseSeedBatch + idx * 17389) % 899999) + 100001,
      ...(visualSpec ? { visualSpec } : {}),
      movimientoCamara: String(sc.movimientoCamara || '').trim() || shotFraming.es,
      transicionRapida:
        String(sc.transicionRapida || '').trim() ||
        (isCommercial ? 'Disolvencia editorial suave' : 'Corte seco de impacto'),
      disenoSonoro:
        String(sc.disenoSonoro || '').trim() ||
        (isCommercial ? 'Transición suave de aire' : 'Whoosh seco + impacto sutil'),
      esGiro30s: isCommercial ? false : isKeyTwist,
      fase: resolvedFase,
      ...(mappedPhotoIdx !== undefined ? { mediaSource: 'user_photo' as const } : {}),
      ...(commercialSpecs ? { commercialSpecs } : {}),
      ...(isCtaBeat ? { isCtaBeat: true } : {}),
      ...(ctaOverlay ? { ctaOverlay } : {}),
    };
  });
}

// ---------- SCHEMAS STRUCTURED OUTPUTS (ProjectScriptV2 + BeatV2) ----------

const visualBibleSchema = {
  type: Type.OBJECT,
  description:
    'Bloque fijo de consistencia visual (Character & World Lock) definido ANTES de las escenas para mantener 100% coherencia de personaje, vestimenta, estilo artístico e iluminación de principio a fin.',
  properties: {
    artStyle: { type: Type.STRING },
    lightingPalette: { type: Type.STRING },
    characterOrWorldLock: { type: Type.STRING },
    fixedPrefixPrompt: { type: Type.STRING },
  },
  required: ['artStyle', 'lightingPalette', 'characterOrWorldLock', 'fixedPrefixPrompt'],
};

const visualSpecSchema = {
  type: Type.OBJECT,
  description: 'Especificación visual única para ESTA escena individual.',
  properties: {
    environment: { type: Type.STRING },
    mainSubject: { type: Type.STRING },
    propIcon: { type: Type.STRING },
    moodPalette: { type: Type.STRING },
    flowPrompt: { type: Type.STRING },
  },
  required: ['environment', 'mainSubject', 'propIcon', 'moodPalette', 'flowPrompt'],
};

const retentionAuditSchema = {
  type: Type.OBJECT,
  description:
    'Auditoría interna del Crítico de Retención generada OBLIGATORIAMENTE ANTES de las escenas.',
  properties: {
    hookVelocityScore: { type: Type.INTEGER },
    reHookBeatIndex: { type: Type.INTEGER },
    patternInterruptCheck: { type: Type.STRING },
    loopSeamVerification: { type: Type.STRING },
  },
  required: [
    'hookVelocityScore',
    'reHookBeatIndex',
    'patternInterruptCheck',
    'loopSeamVerification',
  ],
};

const sagaMemoryUpdateSchema = {
  type: Type.OBJECT,
  description: 'Memoria persistente del universo (SagaBible) para futuros episodios.',
  properties: {
    recurringCharacters: { type: Type.ARRAY, items: { type: Type.STRING } },
    establishedLore: { type: Type.ARRAY, items: { type: Type.STRING } },
    resolvedLoop: { type: Type.STRING },
    newUnresolvedLoop: { type: Type.STRING },
  },
  required: ['recurringCharacters', 'establishedLore', 'newUnresolvedLoop'],
};

const sceneSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    orden: { type: Type.INTEGER },
    tiempoInicio: { type: Type.STRING },
    tiempoFin: { type: Type.STRING },
    segundoInicio: { type: Type.INTEGER },
    segundoFin: { type: Type.INTEGER },
    fase: { type: Type.STRING },
    esGiro30s: { type: Type.BOOLEAN },
    retentionRole: { type: Type.STRING },
    narracion: { type: Type.STRING },
    wordTags: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          style: { type: Type.STRING },
        },
        required: ['word', 'style'],
      },
    },
    subtituloDinamico: { type: Type.STRING },
    palabraDestacada: { type: Type.STRING },
    visualKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    shotType: { type: Type.STRING },
    cameraMotion: { type: Type.STRING },
    depthTitleText: { type: Type.STRING },
    hudData: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING },
        value: { type: Type.STRING },
        unit: { type: Type.STRING },
      },
      required: ['label', 'value'],
    },
    foleyCue: { type: Type.STRING },
    pacingProfile: {
      type: Type.OBJECT,
      properties: {
        speedMultiplier: { type: Type.NUMBER },
        prePauseMs: { type: Type.INTEGER },
        musicDuckLevel: { type: Type.NUMBER },
      },
      required: ['speedMultiplier', 'prePauseMs', 'musicDuckLevel'],
    },
    worldStateDelta: { type: Type.STRING },
    promptVisual3D: { type: Type.STRING },
    imagePrompt: { type: Type.STRING },
    visualSpec: visualSpecSchema,
    movimientoCamara: { type: Type.STRING },
    transicionRapida: { type: Type.STRING },
    disenoSonoro: { type: Type.STRING },
    commercialSpecs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          icon: { type: Type.STRING },
          label: { type: Type.STRING },
          value: { type: Type.STRING },
        },
        required: ['icon', 'label', 'value'],
      },
    },
    isCtaBeat: { type: Type.BOOLEAN },
    ctaOverlay: {
      type: Type.OBJECT,
      properties: {
        headline: { type: Type.STRING },
        subheadline: { type: Type.STRING },
        contactLine: { type: Type.STRING },
        badge: { type: Type.STRING },
      },
      required: ['headline'],
    },
  },
  required: [
    'id',
    'orden',
    'tiempoInicio',
    'tiempoFin',
    'segundoInicio',
    'segundoFin',
    'fase',
    'esGiro30s',
    'retentionRole',
    'narracion',
    'wordTags',
    'subtituloDinamico',
    'palabraDestacada',
    'visualKeywords',
    'shotType',
    'cameraMotion',
    'foleyCue',
    'pacingProfile',
    'worldStateDelta',
    'promptVisual3D',
    'imagePrompt',
    'visualSpec',
    'movimientoCamara',
    'transicionRapida',
    'disenoSonoro',
  ],
};

const alternativeHookSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    label: { type: Type.STRING },
    subtitle: { type: Type.STRING },
    fraseApertura: { type: Type.STRING },
    impactoVisual: { type: Type.STRING },
    sonidoRompeScroll: { type: Type.STRING },
    imagePrompt: { type: Type.STRING },
  },
  required: ['id', 'label', 'subtitle', 'fraseApertura', 'impactoVisual', 'sonidoRompeScroll'],
};

const scriptResponseSchema = {
  type: Type.OBJECT,
  properties: {
    tituloViral: { type: Type.STRING },
    ganchoInicial3Seg: {
      type: Type.OBJECT,
      properties: {
        impactoVisual: { type: Type.STRING },
        fraseApertura: { type: Type.STRING },
        sonidoRompeScroll: { type: Type.STRING },
      },
      required: ['impactoVisual', 'fraseApertura', 'sonidoRompeScroll'],
    },
    ganchosAlternativos: {
      type: Type.ARRAY,
      items: alternativeHookSchema,
    },
    guiaEstilo3D: { type: Type.STRING },
    visualBible: visualBibleSchema,
    retentionAudit: retentionAuditSchema,
    sagaMemoryUpdate: sagaMemoryUpdateSchema,
    estrategiaMonetizacion: {
      type: Type.OBJECT,
      properties: {
        anguloRpm: { type: Type.STRING },
        nichoMonetizador: { type: Type.STRING },
        retencionObjetivo: { type: Type.STRING },
        ctaOrganico: { type: Type.STRING },
        planEjecucionRapida: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        'anguloRpm',
        'nichoMonetizador',
        'retencionObjetivo',
        'ctaOrganico',
        'planEjecucionRapida',
      ],
    },
    escenas: {
      type: Type.ARRAY,
      items: sceneSchema,
    },
    loopFinal: { type: Type.STRING },
    metadatosPublicacion: {
      type: Type.OBJECT,
      properties: {
        titulosAlternativos: { type: Type.ARRAY, items: { type: Type.STRING } },
        descripcionSeo: { type: Type.STRING },
        hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
        promptPortada: { type: Type.STRING },
      },
      required: ['titulosAlternativos', 'descripcionSeo', 'hashtags', 'promptPortada'],
    },
  },
  required: [
    'tituloViral',
    'ganchoInicial3Seg',
    'ganchosAlternativos',
    'guiaEstilo3D',
    'visualBible',
    'retentionAudit',
    'sagaMemoryUpdate',
    'estrategiaMonetizacion',
    'escenas',
    'loopFinal',
    'metadatosPublicacion',
  ],
};

// ---------- 1. GENERADOR PRINCIPAL DE GUION (ProjectScriptV2) ----------

export async function generateViralScript(payload: GenerateScriptPayload): Promise<ViralScript> {
  const {
    premise,
    niche,
    audience,
    durationSec,
    style3D,
    platform,
    aspectRatio,
    voiceProfileId,
    monetizationGoal,
    narrativeBlueprint,
    sagaBible,
    includeMicroRecap,
    studioMode: requestedStudioMode,
    commercialBrief,
    multimodalPhotos,
  } = payload;

  const studioMode: StudioMode =
    requestedStudioMode === 'commercial_real_estate'
      ? 'commercial_real_estate'
      : 'viral_storytelling';
  const isCommercial = studioMode === 'commercial_real_estate';
  const hasMultimodalPhotos = Array.isArray(multimodalPhotos) && multimodalPhotos.length > 0;
  const trimmedPremise =
    (premise || '').trim() ||
    (hasMultimodalPhotos
      ? `Recorrido editorial y presentación comercial de ${commercialBrief?.businessOrPropertyName || 'esta propiedad o negocio'} basado en las ${multimodalPhotos!.length} fotos reales subidas.`
      : '');

  if (trimmedPremise.length < 8) {
    throw new GeminiApiError(
      'Describe una idea, propiedad o negocio de al menos 8 caracteres para construir el guion.',
      { status: 400 }
    );
  }

  const safeDuration: DurationOption = ([30, 60, 90, 120, 180].includes(Number(durationSec))
    ? Number(durationSec)
    : isCommercial
      ? 60
      : 90) as DurationOption;
  const safeAudience: AudienceId = (['general', 'educational', 'kids', 'viral_meme', 'suspense'].includes(
    String(audience)
  )
    ? String(audience)
    : 'general') as AudienceId;
  const safeAspectRatio: VideoAspectRatio = aspectRatio === '16:9' ? '16:9' : '9:16';
  const styleKey: Style3DId = (STYLE_LABELS[String(style3D)]
    ? style3D
    : isCommercial
      ? 'ue5_realism'
      : 'soft_storybook') as Style3DId;
  const commercialSector = isCommercial
    ? getCommercialSectorById(commercialBrief?.sector)
    : null;
  const styleDesc = isCommercial
    ? commercialSector!.visualDirectionEn
    : STYLE_LABELS[styleKey] ?? STYLE_LABELS.soft_storybook;
  const audienceRule = isCommercial
    ? 'MODO COMERCIAL & BIENES RAÍCES (AGENCIA EDITORIAL): Tono profesional, cálido, confiable y orientado a conversión. Cero caricaturas, cero terror, cero hipérboles artificiales. Destaca beneficios tangibles, luz, materiales, ubicación y propuesta de valor real.'
    : AUDIENCE_RULES[safeAudience] ?? AUDIENCE_RULES.general;
  const platformKey: PlatformId = (PLATFORM_LABELS[String(platform)]
    ? platform
    : 'youtube_shorts') as PlatformId;
  const platformDesc = PLATFORM_LABELS[platformKey] ?? PLATFORM_LABELS.youtube_shorts;
  const resolvedBlueprint = resolveNarrativeBlueprint(
    narrativeBlueprint,
    String(niche || ''),
    safeAudience,
    studioMode,
    commercialBrief
  );
  const blueprintDirective = BLUEPRINT_DIRECTIVES[resolvedBlueprint] ?? '';
  const frameFormatText =
    safeAspectRatio === '16:9' ? '16:9 horizontal widescreen' : '9:16 vertical';

  const requestedEnglish = /\b(en ingl[eé]s|in english|english script|english narration)\b/i.test(
    trimmedPremise
  );
  const requestedPortuguese = /\b(en portugu[eé]s|em portugu[eê]s|in portuguese)\b/i.test(
    trimmedPremise
  );
  const narrationLangDirective = requestedEnglish
    ? 'IDIOMA OBLIGATORIO DE LA NARRACIÓN Y SUBTÍTULOS: INGLÉS NATURAL (US/UK) porque el usuario lo solicitó explícitamente en su premisa.'
    : requestedPortuguese
      ? 'IDIOMA OBLIGATORIO DE LA NARRACIÓN Y SUBTÍTULOS: PORTUGUÉS NATURAL porque el usuario lo solicitó explícitamente en su premisa.'
      : 'IDIOMA OBLIGATORIO DE LA NARRACIÓN Y SUBTÍTULOS: ESPAÑOL NATURAL, humano, claro y 100% hablable en voz alta.';

  const framingSafeZoneRule = isCommercial
    ? safeAspectRatio === '9:16'
      ? 'vertical 9:16 architectural commercial framing, clean level horizon, rectilinear wide-angle lens without fisheye distortion, natural golden-hour or balanced daylight, clean uncluttered composition respecting bottom subtitle safe zone'
      : '16:9 widescreen architectural commercial photography, clean level horizon, rectilinear 16mm/24mm lens, warm daylight and crisp interior exposure'
    : safeAspectRatio === '9:16'
      ? 'vertical 9:16 aspect ratio, primary subject strictly centered in the middle third of the frame so it never collides with bottom subtitles or TikTok/Shorts/Reels side UI buttons, dramatic volumetric lighting, continuous camera movement with zero static frames'
      : '16:9 horizontal widescreen framing, dramatic volumetric lighting, continuous cinematic camera movement';

  const beatRange = hasMultimodalPhotos
    ? {
        min: multimodalPhotos!.length,
        max:
          isCommercial && commercialBrief?.includeCtaCard !== false
            ? multimodalPhotos!.length + 1
            : multimodalPhotos!.length,
        target: multimodalPhotos!.length,
      }
    : getTargetBeatRange(safeDuration);

  const lockedSagaBible =
    !isCommercial && sagaBible && sagaBible.visualBible
      ? normalizeVisualBible(sagaBible.visualBible, styleDesc)
      : null;

  const sagaContextBlock =
    !isCommercial && sagaBible
      ? [
          'CONTINUIDAD DE SAGA PERSISTENTE (SagaBible ACTIVA):',
          `- Título de la Saga: ${String(sagaBible.title || '')}`,
          `- Personajes recurrentes bloqueados: ${JSON.stringify(sagaBible.recurringCharacters ?? [])}`,
          `- Lore ya establecido: ${JSON.stringify(sagaBible.establishedLore ?? [])}`,
          `- Bucles pendientes por resolver (ELIGE Y RESUELVE 1 en este episodio, y abre 1 nuevo bucle en sagaMemoryUpdate.newUnresolvedLoop): ${JSON.stringify(sagaBible.unresolvedLoops ?? [])}`,
          lockedSagaBible
            ? `- VisualBible BLOQUEADO: usa EXACTAMENTE "${lockedSagaBible.fixedPrefixPrompt}" en visualBible.fixedPrefixPrompt.`
            : '',
          includeMicroRecap
            ? '- MICRO-RECAP DE 2 SEGUNDOS ACTIVO: El Beat 1 DEBE abrir con un micro-recap relámpago de máximo 9-11 palabras estilo "En la parte anterior..." que enlace de inmediato con la acción.'
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

  const commercialBriefBlock = isCommercial
    ? [
        'DATOS REALES DEL BRIEF COMERCIAL (USA SOLO LO PROPORCIONADO; JAMÁS INVENTES TELÉFONOS NI PRECIOS FALSOS):',
        `- Sector: ${commercialSector!.label}`,
        commercialBrief?.businessOrPropertyName
          ? `- Nombre propiedad/negocio: ${commercialBrief.businessOrPropertyName}`
          : '',
        commercialBrief?.priceText ? `- Precio / Rango: ${commercialBrief.priceText}` : '',
        commercialBrief?.areaText ? `- Superficie / Metraje: ${commercialBrief.areaText}` : '',
        commercialBrief?.roomsBathsText
          ? `- Habitaciones / Baños / Capacidad: ${commercialBrief.roomsBathsText}`
          : '',
        commercialBrief?.locationText ? `- Ubicación / Zona: ${commercialBrief.locationText}` : '',
        commercialBrief?.promoOrHoursText
          ? `- Horario / Oferta: ${commercialBrief.promoOrHoursText}`
          : '',
        commercialBrief?.ctaHeadline ? `- CTA deseado: ${commercialBrief.ctaHeadline}` : '',
        commercialBrief?.ctaContact ? `- Contacto / WhatsApp / Web: ${commercialBrief.ctaContact}` : '',
        `- Tarjeta CTA final: ${commercialBrief?.includeCtaCard === false ? 'DESACTIVADA (isCtaBeat: false en todos los beats)' : 'ACTIVADA (marca isCtaBeat: true y rellena ctaOverlay en el último beat)'}.`,
        '- REGLA CRÍTICA DE VERACIDAD: Si un campo (como teléfono, WhatsApp, precio o dirección) NO fue proporcionado en el brief ni en la premisa, NO inventes un número ni una dirección falsa.',
        '- FICHAS TÉCNICAS (`commercialSpecs`): En los beats donde aparezca un dato real del brief (precio, m², habitaciones, ubicación, horario u oferta), añade 1 a 2 badges limpios en `commercialSpecs: [{ icon: "price"|"area"|"rooms"|"location"|"hours"|"discount"|"highlight", label, value }]`.',
        '- FOLEY COMERCIAL ELEGANTE: Usa ÚNICAMENTE `none`, `whoosh_cut`, `hud_click` o `riser_tension`. PROHIBIDO usar `heartbeat`, `thunder_impact`, `analog_glitch` o `sub_drop`.',
        '- CÁMARA EDITORIAL SUAVE: Usa ÚNICAMENTE `dolly_in`, `dolly_out`, `orbit_left`, `orbit_right` o `rack_focus_reveal`.',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const multimodalVisionBlock = hasMultimodalPhotos
    ? [
        `VISIÓN MULTIMODAL ACTIVA — ${multimodalPhotos!.length} FOTOS REALES ADJUNTAS EN ORDEN EXACTO (Foto 0 .. Foto ${multimodalPhotos!.length - 1}):`,
        '- Observa con atención cada fotografía real adjunta (espacios, arquitectura, iluminación natural, materiales, mobiliario, comida, producto o fachada).',
        `- Genera EXACTAMENTE ${multimodalPhotos!.length} beats mapeados 1-a-1 con cada foto en el mismo orden (Beat 1 narra lo que se ve en Foto 0, Beat 2 narra lo que se ve en Foto 1, ..., Beat ${multimodalPhotos!.length} narra Foto ${multimodalPhotos!.length - 1}).`,
        '- Cada narración debe describir y vender con precisión lo que REALMENTE aparece en esa foto concreta (8 a 13 palabras por beat, 3 a 4.5s), sin inventar habitaciones ni elementos que no estén visibles.',
        '- Si `includeCtaCard` está activo, el último beat (sobre la foto más emblemática o última foto) debe incluir `isCtaBeat: true` y `ctaOverlay`.',
      ].join('\n')
    : '';

  const systemInstruction = [
    isCommercial
      ? 'Eres una agencia de producción audiovisual inmobiliaria y comercial de alto nivel trabajando en UNA sola llamada JSON: [1. COPYWRITER DE CONVERSIÓN -> 2. AUDITOR DE RITMO COMERCIAL -> 3. DIRECTOR DE FOTOGRAFÍA EDITORIAL].'
      : 'Eres una sala de producción integrada de 3 especialistas trabajando en UNA sola llamada JSON: [1. ESCRITOR VIRAL -> 2. CRÍTICO DE RETENCIÓN -> 3. DIRECTOR CINEMATOGRÁFICO Y PROSÓDICO].',
    'ARQUITECTURA DE RAZONAMIENTO INTERNO EN UNA SOLA LLAMADA:',
    '1) PRIMERO define `visualBible` y `retentionAudit` ANTES de redactar `escenas`:',
    '   - `retentionAudit.hookVelocityScore` (0-100): valida que Beat 1 enganche en <2.2 segundos sin saludos ni clichés.',
    '   - `retentionAudit.reHookBeatIndex`: punto de mayor interés visual/oferta ubicado entre el 35% y 45% de los beats.',
    '   - `retentionAudit.patternInterruptCheck`: verifica que alternes planos, `commercialSpecs`/`hudData` o transiciones cada 1-2 beats.',
    '   - `retentionAudit.loopSeamVerification`: demuestra la fluidez de cierre o puente de repetición.',
    '2) SEGUNDO aplica el BLUEPRINT y la DISCIPLINA DE MICRO-BEATS:',
    blueprintDirective,
    `- REGLA DE ORO DE RITMO (8 A 12 PALABRAS POR BEAT): Genera entre ${beatRange.min} y ${beatRange.max} micro-escenas consecutivas (3 a 4.5s cada una). PROHIBIDO agrupar en párrafos largos.`,
    '3) TERCERO actúa como DIRECTOR DE FOTOGRAFÍA Y PROSODIA en cada beat:',
    '- SHOT CONTINUITY GRAPH: PROHIBIDO repetir el mismo `shotType` en dos beats consecutivos.',
    '- DIRECCIÓN PROSÓDICA (`pacingProfile`): varía `speedMultiplier` (0.90 a 1.15), `prePauseMs` (0 a 300ms) y `musicDuckLevel` (0.06 a 0.14).',
    '- ETIQUETADO SEMÁNTICO (`wordTags`): etiqueta cifras (`stat`), beneficios clave (`emphasis`) y palabras destacadas.',
    isCommercial
      ? '- ESTÉTICA FOTOGRÁFICA COMERCIAL REALISTA: Todos los `imagePrompt` (en INGLÉS) deben describir fotografía real arquitectónica/comercial (luz natural golden hour o luz diurna equilibrada, lentes rectilíneos 16mm/24mm sin distorsión ojo de pez, interiores editoriales Architectural Digest, vistas aéreas limpias con dron, materiales cálidos auténticos), NUNCA estética cartoon, 3D oscuro ni terror.'
      : '- PROPAGACIÓN DE `worldStateDelta`, `foleyCue` cinematográfico y `hudData` cuando existan cifras/códigos.',
    'REGLA SUPREMA — FIDELIDAD TEMÁTICA ABSOLUTA:',
    '- CADA micro-escena gira 100% alrededor de la idea, propiedad o negocio exacto del usuario.',
    `DIRECTRIZ DE ENFOQUE: ${audienceRule}`,
    narrationLangDirective,
    ANTI_CLICHE_DIRECTIVE,
    commercialBriefBlock,
    multimodalVisionBlock,
    sagaContextBlock,
    'CONSISTENCIA GLOBAL (visualBible) + PROMPTS EN INGLÉS:',
    '- En cada beat, `imagePrompt` (25-45 palabras en INGLÉS) y `visualSpec.flowPrompt` (35-60 palabras en INGLÉS) inician con `visualBible.fixedPrefixPrompt`, respetan ' +
      framingSafeZoneRule +
      ', dirección visual: ' +
      styleDesc +
      ', y cierran con "no text, no watermark".',
    '- Genera exactamente 3 `ganchosAlternativos` con IDs exactos: "dato_perturbador", "escenario_pov" e "intriga_psicologica", además de `metadatosPublicacion` con `promptPortada` y `sagaMemoryUpdate`.',
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [
    `MODO DE ESTUDIO: ${isCommercial ? 'COMERCIAL & BIENES RAÍCES' : 'VIRAL / STORYTELLING'}`,
    `TEMA / PROPIEDAD / NEGOCIO DEL USUARIO: ${trimmedPremise}`,
    `Nicho o sector: ${String(niche || (commercialSector?.nicheName ?? 'Idea personalizada'))}`,
    `Blueprint seleccionado: ${resolvedBlueprint}`,
    `Formato elegido: ${frameFormatText}`,
    hasMultimodalPhotos
      ? `FOTOS REALES ADJUNTAS: ${multimodalPhotos!.length} fotografías -> GENERA EXACTAMENTE ${multimodalPhotos!.length} MICRO-ESCENAS sincronizadas 1-a-1 con Foto 0 .. Foto ${multimodalPhotos!.length - 1}.`
      : `Duración exacta: ${safeDuration} segundos -> GENERA ENTRE ${beatRange.min} Y ${beatRange.max} MICRO-ESCENAS (8 a 12 palabras por micro-escena, 3 a 4.5 segundos cada una).`,
    `Dirección visual obligatoria: ${styleDesc}`,
    `Plataforma objetivo: ${platformDesc}`,
    `Objetivo: ${String(monetizationGoal || (commercialSector?.monetizationGoal ?? 'Maximizar retención y conversión'))}`,
    `Entrega el JSON completo con visualBible, retentionAudit, sagaMemoryUpdate, las micro-escenas BeatV2 contiguas, los 3 ganchos alternativos y el kit de publicación.`,
  ].join('\n');

  // Construir payload multimodal real si el usuario adjuntó fotos antes de redactar el guion
  const contents: Parameters<typeof generateJsonWithGemini>[0]['contents'] = hasMultimodalPhotos
    ? {
        parts: [
          ...multimodalPhotos!.flatMap((photo) => [
            {
              text: `Foto ${photo.index}${photo.fileName ? ` (${photo.fileName})` : ''}:`,
            },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: photo.base64Jpeg,
              },
            },
          ]),
          { text: userPrompt },
        ],
      }
    : userPrompt;

  const parsed = await generateJsonWithGemini<Record<string, unknown>>({
    contents,
    systemInstruction,
    responseSchema: scriptResponseSchema,
  });

  const visualBible = lockedSagaBible ?? normalizeVisualBible(parsed.visualBible, styleDesc);
  const rawScenes = Array.isArray(parsed.escenas)
    ? (parsed.escenas as Record<string, unknown>[])
    : [];
  const normalizedScenes = enforceMicroSceneBeats(
    rawScenes,
    safeDuration,
    visualBible,
    styleDesc,
    trimmedPremise,
    {
      studioMode,
      commercialBrief,
      preserveBeatCountForPhotos: hasMultimodalPhotos,
      photoCount: multimodalPhotos?.length ?? 0,
    }
  );
  const retentionAudit = normalizeRetentionAudit(parsed.retentionAudit, normalizedScenes);
  const sagaMemoryUpdate = normalizeSagaMemoryUpdate(parsed.sagaMemoryUpdate);

  const hookSlotOrder: HookStyleId[] = [
    'dato_perturbador',
    'escenario_pov',
    'intriga_psicologica',
  ];
  const hookIdMap: Record<string, HookStyleId> = {
    dato_perturbador: 'dato_perturbador',
    escenario_pov: 'escenario_pov',
    intriga_psicologica: 'intriga_psicologica',
    curiosidad: 'dato_perturbador',
    polemica: 'escenario_pov',
    humor: 'intriga_psicologica',
  };
  const hookDefaultLabels: Record<string, { label: string; subtitle: string }> = isCommercial
    ? {
        dato_perturbador: {
          label: 'Dato Diferencial / Cifra',
          subtitle: 'Abre con precio, metraje o ventaja medible',
        },
        escenario_pov: {
          label: 'Recorrido en Primera Persona',
          subtitle: 'Invita al cliente a imaginarse dentro del espacio',
        },
        intriga_psicologica: {
          label: 'Pregunta de Deseo / Solución',
          subtitle: 'Conecta directo con lo que busca tu cliente ideal',
        },
      }
    : {
        dato_perturbador: {
          label: 'Dato Perturbador',
          subtitle: 'Cifra o hecho real imposible de ignorar',
        },
        escenario_pov: {
          label: 'Escenario POV Inmersivo',
          subtitle: 'Coloca al espectador dentro de la escena',
        },
        intriga_psicologica: {
          label: 'Pregunta de Intriga Psicológica',
          subtitle: 'Bucle mental abierto desde el segundo 0',
        },
      };

  const parsedHook =
    parsed.ganchoInicial3Seg && typeof parsed.ganchoInicial3Seg === 'object'
      ? (parsed.ganchoInicial3Seg as Record<string, unknown>)
      : {};

  const rawAltHooks = Array.isArray(parsed.ganchosAlternativos)
    ? (parsed.ganchosAlternativos as Record<string, unknown>[])
    : [];
  const normalizedAltHooks: AlternativeHookItem[] = rawAltHooks
    .filter((h) => h && typeof h.fraseApertura === 'string' && h.fraseApertura.trim())
    .slice(0, 3)
    .map((h, idx) => {
      const fallbackId = hookSlotOrder[idx] ?? 'dato_perturbador';
      const mappedId = hookIdMap[String(h.id || '').toLowerCase()] ?? fallbackId;
      const rawHookImgPrompt =
        typeof h.imagePrompt === 'string' && h.imagePrompt.trim() ? h.imagePrompt.trim() : '';
      const hookImagePrompt = rawHookImgPrompt
        ? rawHookImgPrompt
            .toLowerCase()
            .includes(visualBible.fixedPrefixPrompt.slice(0, 24).toLowerCase())
          ? rawHookImgPrompt
          : `${visualBible.fixedPrefixPrompt}, ${rawHookImgPrompt}`
        : undefined;
      return {
        id: mappedId,
        label: hookDefaultLabels[mappedId]?.label || 'Gancho Alternativo',
        subtitle: String(h.subtitle || hookDefaultLabels[mappedId]?.subtitle || '').trim(),
        fraseApertura: String(h.fraseApertura).trim(),
        impactoVisual:
          String(h.impactoVisual || parsedHook.impactoVisual || '').trim() ||
          'Plano editorial de apertura en 0:00',
        sonidoRompeScroll:
          String(h.sonidoRompeScroll || parsedHook.sonidoRompeScroll || '').trim() ||
          (isCommercial ? 'Transición suave de aire' : 'Pulso grave cinematográfico'),
        ...(hookImagePrompt ? { imagePrompt: hookImagePrompt } : {}),
      };
    });

  const rawMeta =
    parsed.metadatosPublicacion && typeof parsed.metadatosPublicacion === 'object'
      ? (parsed.metadatosPublicacion as Record<string, unknown>)
      : {};
  const tituloViral = String(parsed.tituloViral || trimmedPremise).trim();
  const fallbackCoverPrompt = isCommercial
    ? `${visualBible.fixedPrefixPrompt}, editorial architectural hero cover photo for "${tituloViral.slice(0, 80)}", warm golden-hour sunlight, rectilinear wide angle, clean balanced exposure, no text, no watermark`
    : `${visualBible.fixedPrefixPrompt}, iconic viral thumbnail keyframe for "${tituloViral.slice(0, 80)}", dramatic high-contrast rim light, extreme depth of field, centered hero focal composition, ultra-clean 8K cinema render, no text, no watermark`;
  const normalizedMeta = {
    titulosAlternativos:
      Array.isArray(rawMeta.titulosAlternativos) && rawMeta.titulosAlternativos.length > 0
        ? rawMeta.titulosAlternativos
            .slice(0, 3)
            .map((t: unknown) => String(t).trim())
            .filter(Boolean)
        : [tituloViral],
    descripcionSeo: String(rawMeta.descripcionSeo || '').trim(),
    hashtags: Array.isArray(rawMeta.hashtags)
      ? rawMeta.hashtags.map((h: unknown) => String(h).trim()).filter(Boolean)
      : [],
    promptPortada:
      typeof rawMeta.promptPortada === 'string' && rawMeta.promptPortada.trim().length > 18
        ? rawMeta.promptPortada.trim()
        : fallbackCoverPrompt,
  };

  const rawMonet =
    parsed.estrategiaMonetizacion && typeof parsed.estrategiaMonetizacion === 'object'
      ? (parsed.estrategiaMonetizacion as Record<string, unknown>)
      : {};

  return {
    id: `script-${Date.now()}`,
    creadoEn: new Date().toISOString(),
    tituloViral,
    premisa: trimmedPremise,
    nicho: String(niche || (commercialSector?.nicheName ?? 'Personalizado')),
    publicoObjetivo: safeAudience,
    duracionSegundos: safeDuration,
    estilo3D: styleKey,
    plataforma: platformKey,
    formatoVideo: safeAspectRatio,
    vozPreferidaId: typeof voiceProfileId === 'string' ? voiceProfileId : undefined,
    idioma: requestedEnglish ? 'en' : requestedPortuguese ? 'pt' : 'es',
    studioMode,
    ...(isCommercial && commercialBrief ? { commercialBrief } : {}),
    ganchoInicial3Seg: {
      impactoVisual: String(parsedHook.impactoVisual || 'Plano de impacto inmediato en 0:00'),
      fraseApertura: String(parsedHook.fraseApertura || normalizedScenes[0]?.narracion || ''),
      sonidoRompeScroll: String(
        parsedHook.sonidoRompeScroll ||
          (isCommercial ? 'Transición limpia' : 'Sub-drop cinematográfico')
      ),
    },
    ...(normalizedAltHooks.length > 0 ? { ganchosAlternativos: normalizedAltHooks } : {}),
    guiaEstilo3D: String(parsed.guiaEstilo3D || visualBible.fixedPrefixPrompt),
    visualBible,
    narrativeBlueprint: resolvedBlueprint,
    retentionAudit,
    ...(sagaMemoryUpdate ? { sagaMemoryUpdate } : {}),
    ...(sagaBible?.sagaId ? { sagaId: String(sagaBible.sagaId) } : {}),
    estrategiaMonetizacion: {
      anguloRpm: String(
        rawMonet.anguloRpm ||
          monetizationGoal ||
          (isCommercial ? 'Captación de clientes y visitas calificadas' : 'Alto RPM y retención orgánica')
      ),
      nichoMonetizador: String(
        rawMonet.nichoMonetizador || niche || (isCommercial ? 'Comercial & Bienes Raíces' : 'Contenido Viral')
      ),
      retencionObjetivo: String(
        rawMonet.retencionObjetivo || (isCommercial ? 'Conversión directa y mensajes' : '+75% retención en bucle')
      ),
      ctaOrganico: String(
        rawMonet.ctaOrganico ||
          commercialBrief?.ctaHeadline ||
          (isCommercial ? 'Agenda tu visita hoy.' : 'Comenta qué harías tú en esa situación.')
      ),
      planEjecucionRapida: Array.isArray(rawMonet.planEjecucionRapida)
        ? rawMonet.planEjecucionRapida.map((x: unknown) => String(x)).filter(Boolean)
        : [],
    },
    escenas: normalizedScenes,
    loopFinal: String(parsed.loopFinal || ''),
    metadatosPublicacion: normalizedMeta,
  };
}

// ---------- 2. CONTINUACIÓN DE SERIE / SAGABIBLE ----------

export async function generateSeriesNextEpisode(params: {
  script: ViralScript;
  sagaBible?: SagaBible;
  includeMicroRecap?: boolean;
}): Promise<ViralScript> {
  const { script: previousScript, sagaBible, includeMicroRecap } = params;
  if (!previousScript || !previousScript.tituloViral) {
    throw new GeminiApiError(
      'Se requiere un guion base para crear la siguiente parte de la serie.',
      { status: 400 }
    );
  }

  const prevPart = Number(previousScript.episodeNumber || previousScript.serieNumero) || 1;
  const nextPart = prevPart + 1;
  const safeDuration: DurationOption = ([30, 60, 90, 120, 180].includes(
    Number(previousScript.duracionSegundos)
  )
    ? Number(previousScript.duracionSegundos)
    : 90) as DurationOption;
  const safeAspectRatio: VideoAspectRatio =
    previousScript.formatoVideo === '16:9' ? '16:9' : '9:16';
  const frameFormatText =
    safeAspectRatio === '16:9' ? '16:9 horizontal widescreen' : '9:16 vertical';
  const resolvedBlueprint = resolveNarrativeBlueprint(
    previousScript.narrativeBlueprint,
    String(previousScript.nicho || ''),
    String(previousScript.publicoObjetivo || 'general')
  );
  const blueprintDirective = BLUEPRINT_DIRECTIVES[resolvedBlueprint] ?? '';

  const prevSummary = Array.isArray(previousScript.escenas)
    ? previousScript.escenas
        .map((s) => String(s.narracion || ''))
        .join(' ')
        .slice(0, 1200)
    : String(previousScript.premisa || '');

  const fallbackStyleStr = String(
    previousScript.guiaEstilo3D ||
      STYLE_LABELS[String(previousScript.estilo3D || 'soft_storybook')] ||
      STYLE_LABELS.soft_storybook
  );
  const inheritedBible = sagaBible?.visualBible
    ? normalizeVisualBible(sagaBible.visualBible, fallbackStyleStr)
    : previousScript.visualBible
      ? normalizeVisualBible(previousScript.visualBible, fallbackStyleStr)
      : null;

  const sequelBeatRange = getTargetBeatRange(safeDuration);
  const recurringCharacters = Array.isArray(sagaBible?.recurringCharacters)
    ? sagaBible.recurringCharacters
    : [];
  const establishedLore = Array.isArray(sagaBible?.establishedLore)
    ? sagaBible.establishedLore
    : [];
  const unresolvedLoops = Array.isArray(sagaBible?.unresolvedLoops)
    ? sagaBible.unresolvedLoops
    : [];

  const systemInstruction = [
    `Eres el showrunner y director cinematográfico de una serie viral con universo persistente (SagaBible). Estás creando el EPISODIO ${nextPart} en arquitectura [Escritor -> Crítico de Retención -> Director] y formato de MICRO-ESCENAS BeatV2 (8 a 12 palabras por beat, 3 a 4.5s).`,
    `- PROHIBIDO agrupar en 4-5 bloques largos: genera entre ${sequelBeatRange.min} y ${sequelBeatRange.max} micro-escenas consecutivas alternando shotType SIN repetir dos seguidos.`,
    blueprintDirective,
    ANTI_CLICHE_DIRECTIVE,
    includeMicroRecap
      ? `MICRO-RECAP DE 2 SEGUNDOS OBLIGATORIO EN BEAT 1: Empieza Beat 1 con un micro-recap relámpago de máximo 9-11 palabras estilo "En la parte anterior..." que recuerde la tensión exacta del Episodio ${prevPart} y dispare de golpe la acción del Episodio ${nextPart}.`
      : `Empieza en 0:00 con una consecuencia directa o acción inmediata del Episodio ${prevPart} que enganche tanto a seguidores de la saga como a espectadores nuevos.`,
    inheritedBible
      ? `VISUAL BIBLE BLOQUEADO DE LA SAGA (OBLIGATORIO): Conserva EXACTAMENTE este visualBible.fixedPrefixPrompt al inicio de cada imagePrompt y flowPrompt: "${inheritedBible.fixedPrefixPrompt}".`
      : `Usa formato ${frameFormatText} en todos los imagePrompt, promptVisual3D y flowPrompt en inglés, reutilizando la guía visual existente.`,
    'CONTINUIDAD DE SAGA OBLIGATORIA:',
    '- Preserva a los personajes recurrentes y todo el lore establecido sin contradecirlo.',
    unresolvedLoops.length > 0
      ? `- RESUELVE EXPLÍCITAMENTE uno de estos bucles pendientes: ${JSON.stringify(unresolvedLoops)} (indica cuál resolviste en sagaMemoryUpdate.resolvedLoop) y ABRE un nuevo misterio aún mayor en sagaMemoryUpdate.newUnresolvedLoop.`
      : '- Resuelve el gancho pendiente del episodio anterior y abre un nuevo bucle en sagaMemoryUpdate.newUnresolvedLoop.',
    '- Completa `retentionAudit` ANTES de las escenas, propaga `worldStateDelta`, varía `pacingProfile`, `foleyCue`, `hudData` y `wordTags`.',
  ]
    .filter(Boolean)
    .join('\n');

  const sagaTitle = String(
    sagaBible?.title || previousScript.serieTitulo || previousScript.tituloViral
  );
  const userPrompt = [
    `Saga / Serie: "${sagaTitle}"`,
    `Episodio anterior (Episodio ${prevPart}): "${String(previousScript.tituloViral)}"`,
    `Nicho: ${String(previousScript.nicho || 'Serie original')}`,
    `Blueprint narrativo: ${resolvedBlueprint}`,
    `Público: ${String(previousScript.publicoObjetivo || 'general')}`,
    `Duración exacta: ${safeDuration} segundos -> GENERA ENTRE ${sequelBeatRange.min} Y ${sequelBeatRange.max} MICRO-ESCENAS (8-12 palabras cada una, 3-4.5s por beat).`,
    recurringCharacters.length > 0
      ? `Personajes recurrentes bloqueados: ${JSON.stringify(recurringCharacters)}`
      : '',
    establishedLore.length > 0 ? `Lore establecido: ${JSON.stringify(establishedLore)}` : '',
    unresolvedLoops.length > 0
      ? `Bucles sin resolver de la SagaBible: ${JSON.stringify(unresolvedLoops)}`
      : '',
    inheritedBible ? `VisualBible bloqueado a heredar: ${JSON.stringify(inheritedBible)}` : '',
    `Resumen narrativo del episodio anterior: ${prevSummary}`,
    `Crea el EPISODIO ${nextPart} completo con título que indique Parte ${nextPart} / Ep. ${nextPart}, narración BeatV2 contigua de 0 a ${safeDuration}s y prompts visuales heredando el universo exacto.`,
  ]
    .filter(Boolean)
    .join('\n');

  const parsed = await generateJsonWithGemini<Record<string, unknown>>({
    contents: userPrompt,
    systemInstruction,
    responseSchema: scriptResponseSchema,
  });

  const finalVisualBible =
    inheritedBible ?? normalizeVisualBible(parsed.visualBible, fallbackStyleStr);
  const rawScenes = Array.isArray(parsed.escenas)
    ? (parsed.escenas as Record<string, unknown>[])
    : [];
  const normalizedScenes = enforceMicroSceneBeats(
    rawScenes,
    safeDuration,
    finalVisualBible,
    fallbackStyleStr,
    `Continuación Episodio ${nextPart}`
  );
  const retentionAudit = normalizeRetentionAudit(parsed.retentionAudit, normalizedScenes);
  const sagaMemoryUpdate = normalizeSagaMemoryUpdate(parsed.sagaMemoryUpdate);

  const parsedHook =
    parsed.ganchoInicial3Seg && typeof parsed.ganchoInicial3Seg === 'object'
      ? (parsed.ganchoInicial3Seg as Record<string, unknown>)
      : {};
  const rawMeta =
    parsed.metadatosPublicacion && typeof parsed.metadatosPublicacion === 'object'
      ? (parsed.metadatosPublicacion as Record<string, unknown>)
      : {};
  const rawMonet =
    parsed.estrategiaMonetizacion && typeof parsed.estrategiaMonetizacion === 'object'
      ? (parsed.estrategiaMonetizacion as Record<string, unknown>)
      : {};

  return {
    id: `script-ep${nextPart}-${Date.now()}`,
    creadoEn: new Date().toISOString(),
    tituloViral: String(parsed.tituloViral || `${sagaTitle} — Parte ${nextPart}`),
    premisa: `Episodio ${nextPart} de la saga: ${sagaTitle}`,
    nicho: String(previousScript.nicho || 'Serie'),
    publicoObjetivo: previousScript.publicoObjetivo || 'general',
    duracionSegundos: safeDuration,
    estilo3D: previousScript.estilo3D || 'soft_storybook',
    plataforma: previousScript.plataforma || 'tiktok_creativity',
    formatoVideo: safeAspectRatio,
    vozPreferidaId: previousScript.vozPreferidaId,
    idioma: previousScript.idioma || 'es',
    serieNumero: nextPart,
    serieTitulo: sagaTitle,
    sagaId: String(sagaBible?.sagaId || previousScript.sagaId || `saga-${Date.now()}`),
    episodeNumber: nextPart,
    ganchoInicial3Seg: {
      impactoVisual: String(parsedHook.impactoVisual || 'Plano de impacto inmediato en 0:00'),
      fraseApertura: String(parsedHook.fraseApertura || normalizedScenes[0]?.narracion || ''),
      sonidoRompeScroll: String(parsedHook.sonidoRompeScroll || 'Sub-drop cinematográfico'),
    },
    guiaEstilo3D: String(parsed.guiaEstilo3D || finalVisualBible.fixedPrefixPrompt),
    visualBible: finalVisualBible,
    narrativeBlueprint: resolvedBlueprint,
    retentionAudit,
    ...(sagaMemoryUpdate ? { sagaMemoryUpdate } : {}),
    estrategiaMonetizacion: {
      anguloRpm: String(rawMonet.anguloRpm || previousScript.estrategiaMonetizacion?.anguloRpm || ''),
      nichoMonetizador: String(rawMonet.nichoMonetizador || previousScript.nicho || 'Serie'),
      retencionObjetivo: String(rawMonet.retencionObjetivo || '+78% retención de serie'),
      ctaOrganico: String(rawMonet.ctaOrganico || '¿Quieres la siguiente parte? Coméntalo.'),
      planEjecucionRapida: Array.isArray(rawMonet.planEjecucionRapida)
        ? rawMonet.planEjecucionRapida.map((x: unknown) => String(x)).filter(Boolean)
        : [],
    },
    escenas: normalizedScenes,
    loopFinal: String(parsed.loopFinal || ''),
    metadatosPublicacion: {
      titulosAlternativos: Array.isArray(rawMeta.titulosAlternativos)
        ? rawMeta.titulosAlternativos.map((t: unknown) => String(t)).filter(Boolean)
        : [],
      descripcionSeo: String(rawMeta.descripcionSeo || ''),
      hashtags: Array.isArray(rawMeta.hashtags)
        ? rawMeta.hashtags.map((h: unknown) => String(h)).filter(Boolean)
        : [],
      promptPortada: typeof rawMeta.promptPortada === 'string' ? rawMeta.promptPortada : undefined,
    },
  };
}

// ---------- 3. OPTIMIZADOR QUIRÚRGICO DE BEATS DÉBILES ----------

export async function optimizeWeakBeats(params: {
  script: ViralScript;
  weakBeatIndices: number[];
}): Promise<{
  script: ViralScript;
  escenas: ScriptScene[];
  retentionAudit: RetentionAudit;
  optimizedIndices: number[];
}> {
  const { script, weakBeatIndices } = params;
  if (!script || !Array.isArray(script.escenas) || script.escenas.length === 0) {
    throw new GeminiApiError(
      'Se requiere un guion válido con micro-escenas para optimizar.',
      { status: 400 }
    );
  }

  const targetIndices = Array.from(
    new Set(
      weakBeatIndices
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < script.escenas.length)
    )
  ).slice(0, 6);

  if (targetIndices.length === 0) {
    throw new GeminiApiError('No se indicaron beats débiles para optimizar.', { status: 400 });
  }

  const styleDesc =
    STYLE_LABELS[String(script.estilo3D || 'soft_storybook')] ?? STYLE_LABELS.soft_storybook;
  const visualBible = normalizeVisualBible(
    script.visualBible,
    String(script.guiaEstilo3D || styleDesc)
  );

  const optimizeSchema = {
    type: Type.OBJECT,
    properties: {
      retentionAudit: retentionAuditSchema,
      optimizedBeats: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.INTEGER },
            narracion: { type: Type.STRING },
            wordTags: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  style: { type: Type.STRING },
                },
                required: ['word', 'style'],
              },
            },
            subtituloDinamico: { type: Type.STRING },
            palabraDestacada: { type: Type.STRING },
            visualKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            shotType: { type: Type.STRING },
            cameraMotion: { type: Type.STRING },
            foleyCue: { type: Type.STRING },
            hudData: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.STRING },
                unit: { type: Type.STRING },
              },
              required: ['label', 'value'],
            },
            pacingProfile: {
              type: Type.OBJECT,
              properties: {
                speedMultiplier: { type: Type.NUMBER },
                prePauseMs: { type: Type.INTEGER },
                musicDuckLevel: { type: Type.NUMBER },
              },
              required: ['speedMultiplier', 'prePauseMs', 'musicDuckLevel'],
            },
            worldStateDelta: { type: Type.STRING },
            retentionRole: { type: Type.STRING },
            imagePrompt: { type: Type.STRING },
            promptVisual3D: { type: Type.STRING },
          },
          required: [
            'index',
            'narracion',
            'wordTags',
            'subtituloDinamico',
            'palabraDestacada',
            'shotType',
            'cameraMotion',
            'foleyCue',
            'pacingProfile',
            'worldStateDelta',
            'retentionRole',
            'imagePrompt',
            'promptVisual3D',
          ],
        },
      },
    },
    required: ['retentionAudit', 'optimizedBeats'],
  };

  const fullContext = script.escenas.map((sc, idx) => ({
    index: idx,
    id: sc.id,
    needsOptimization: targetIndices.includes(idx),
    narracion: sc.narracion,
    shotType: sc.shotType || null,
    foleyCue: sc.foleyCue || null,
    retentionRole: sc.retentionRole || null,
    worldStateDelta: sc.worldStateDelta || '',
  }));

  const prompt = [
    'Actúa como Crítico de Retención y Director Cinematográfico. Optimiza ÚNICAMENTE los beats marcados con `needsOptimization: true` manteniendo intacta la continuidad narrativa con los beats vecinos.',
    `Título: "${String(script.tituloViral || '')}"`,
    `Premisa: "${String(script.premisa || '')}"`,
    `VisualBible fijo obligatorio: "${visualBible.fixedPrefixPrompt}"`,
    ANTI_CLICHE_DIRECTIVE,
    'REGLAS ESTRICTAS PARA CADA BEAT OPTIMIZADO:',
    '- Exactamente entre 8 y 12 palabras en `narracion`, con mayor tensión, claridad sensorial o cifra memorable.',
    '- El `shotType` DEBE ser diferente al del beat anterior (index - 1) y diferente al del beat siguiente (index + 1).',
    '- Incluye `wordTags` semánticos (emphasis, danger, stat, whisper), `foleyCue` distinto a "none" si aporta pattern interrupt, `pacingProfile` expresivo (ej. `prePauseMs: 180-320` en giros) y `imagePrompt` iniciando con visualBible.fixedPrefixPrompt.',
    'Contexto completo del guion:',
    JSON.stringify(fullContext),
  ].join('\n');

  const parsed = await generateJsonWithGemini<{
    retentionAudit?: unknown;
    optimizedBeats?: Record<string, unknown>[];
  }>({
    contents: prompt,
    responseSchema: optimizeSchema,
  });

  const patches = Array.isArray(parsed.optimizedBeats) ? parsed.optimizedBeats : [];
  const patchByIndex = new Map<number, Record<string, unknown>>();
  for (const p of patches) {
    const idx = Number(p?.index);
    if (targetIndices.includes(idx)) {
      patchByIndex.set(idx, p);
    }
  }

  const mergedScenes: ScriptScene[] = script.escenas.map((orig, idx) => {
    const patch = patchByIndex.get(idx);
    if (!patch) return orig;

    const prevShot = idx > 0 ? String(script.escenas[idx - 1]?.shotType || '') : '';
    const nextShot =
      idx < script.escenas.length - 1 ? String(script.escenas[idx + 1]?.shotType || '') : '';
    let nextShotType: ShotType = VALID_SHOT_TYPES.has(String(patch.shotType || ''))
      ? (String(patch.shotType) as ShotType)
      : SHOT_TYPE_CYCLE[idx % SHOT_TYPE_CYCLE.length];
    if (nextShotType === prevShot || nextShotType === nextShot) {
      const alt = SHOT_TYPE_CYCLE.find((st) => st !== prevShot && st !== nextShot);
      if (alt) nextShotType = alt;
    }

    const narr = String(patch.narracion || orig.narracion || '').trim();
    const kwList = Array.isArray(patch.visualKeywords)
      ? patch.visualKeywords
          .map((x: unknown) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 4)
      : orig.visualKeywords ?? [];
    const role: BeatRetentionRole = VALID_RETENTION_ROLES.has(String(patch.retentionRole || ''))
      ? (String(patch.retentionRole) as BeatRetentionRole)
      : orig.retentionRole || 'escalation';
    const pacing = normalizePacingProfile(patch.pacingProfile, role, Boolean(orig.esGiro30s));
    const foley: FoleyCueType = VALID_FOLEY_CUES.has(String(patch.foleyCue || ''))
      ? (String(patch.foleyCue) as FoleyCueType)
      : orig.foleyCue || 'whoosh_cut';
    const motion: CameraMotionPreset = VALID_CAMERA_MOTIONS.has(String(patch.cameraMotion || ''))
      ? (String(patch.cameraMotion) as CameraMotionPreset)
      : orig.cameraMotion || 'dolly_in';
    const hud = normalizeHudData(patch.hudData) ?? orig.hudData;
    const delta = String(patch.worldStateDelta ?? orig.worldStateDelta ?? '').trim();
    const imgPrompt = injectVisualBiblePrefix(
      String(patch.imagePrompt || orig.imagePrompt || ''),
      visualBible.fixedPrefixPrompt
    );
    const visual3d = injectVisualBiblePrefix(
      String(patch.promptVisual3D || orig.promptVisual3D || ''),
      visualBible.fixedPrefixPrompt
    );

    return {
      ...orig,
      narracion: narr,
      subtituloDinamico: String(patch.subtituloDinamico || orig.subtituloDinamico || ''),
      palabraDestacada: String(patch.palabraDestacada || orig.palabraDestacada || ''),
      visualKeywords: kwList,
      wordTags: normalizeWordTagsForNarration(patch.wordTags, narr, kwList),
      shotType: nextShotType,
      cameraMotion: motion,
      foleyCue: foley,
      pacingProfile: pacing,
      ...(hud ? { hudData: hud } : {}),
      worldStateDelta: delta,
      retentionRole: role,
      imagePrompt: imgPrompt,
      promptVisual3D: visual3d,
      movimientoCamara: SHOT_TYPE_EN_FRAMING[nextShotType].es,
    };
  });

  const updatedAudit = normalizeRetentionAudit(parsed.retentionAudit, mergedScenes);
  const optimizedIndices = Array.from(patchByIndex.keys());
  const updatedScript: ViralScript = {
    ...script,
    escenas: mergedScenes,
    retentionAudit: updatedAudit,
  };

  return {
    script: updatedScript,
    escenas: mergedScenes,
    retentionAudit: updatedAudit,
    optimizedIndices,
  };
}

// ---------- 4. REFINAMIENTO QUIRÚRGICO DE UNA ESCENA ----------

export async function refineSingleScene(payload: RefineScenePayload): Promise<ScriptScene> {
  const { scriptTitle, style3DLabel, guide3D, scene, instruction, prevNarration, nextNarration } =
    payload;
  if (!scene || !instruction.trim()) {
    throw new GeminiApiError('Faltan datos de la escena o la instrucción de mejora.', {
      status: 400,
    });
  }

  const prompt = [
    `Estás editando quirúrgicamente UNA sola escena del guion "${String(scriptTitle || '')}".`,
    `Estilo visual obligatorio: ${String(style3DLabel || '')}`,
    `Guía de consistencia visual: ${String(guide3D || '')}`,
    prevNarration ? `Narración anterior: ${String(prevNarration)}` : '',
    `Escena actual (conserva EXACTAMENTE id, orden, tiempoInicio, tiempoFin, segundoInicio, segundoFin, fase y esGiro30s): ${JSON.stringify(scene)}`,
    nextNarration ? `Narración siguiente: ${String(nextNarration)}` : '',
    `Instrucción del director: ${String(instruction)}`,
    'Devuelve la escena mejorada en JSON manteniendo continuidad narrativa perfecta, subtítulo dinámico ultracorto, promptVisual3D en inglés respetando el estilo visual elegido y transición ágil.',
  ]
    .filter(Boolean)
    .join('\n');

  const updated = await generateJsonWithGemini<ScriptScene>({
    contents: prompt,
    responseSchema: sceneSchema,
  });

  return {
    ...scene,
    ...updated,
    id: scene.id,
    orden: scene.orden,
    tiempoInicio: scene.tiempoInicio,
    tiempoFin: scene.tiempoFin,
    segundoInicio: scene.segundoInicio,
    segundoFin: scene.segundoFin,
    esGiro30s: scene.esGiro30s,
  };
}

// ---------- 5. TRADUCCIÓN / DOBLAJE CULTURAL DE GUION ----------

export async function translateViralScript(params: {
  script: ViralScript;
  targetLanguage: ScriptLanguage;
}): Promise<ViralScript> {
  const { script, targetLanguage } = params;
  if (!script || !Array.isArray(script.escenas) || script.escenas.length === 0) {
    throw new GeminiApiError('Se requiere un guion válido para traducir.', { status: 400 });
  }

  const langLabel =
    targetLanguage === 'en'
      ? 'natural, engaging everyday American English (high-RPM US audience)'
      : targetLanguage === 'pt'
        ? 'natural, engaging everyday Brazilian Portuguese'
        : 'natural, engaging everyday neutral Spanish';

  const translationSchema = {
    type: Type.OBJECT,
    properties: {
      tituloViral: { type: Type.STRING },
      fraseApertura: { type: Type.STRING },
      loopFinal: { type: Type.STRING },
      titulosAlternativos: { type: Type.ARRAY, items: { type: Type.STRING } },
      descripcionSeo: { type: Type.STRING },
      hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
      escenas: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            narracion: { type: Type.STRING },
            subtituloDinamico: { type: Type.STRING },
            palabraDestacada: { type: Type.STRING },
          },
          required: ['id', 'narracion', 'subtituloDinamico', 'palabraDestacada'],
        },
      },
    },
    required: [
      'tituloViral',
      'fraseApertura',
      'loopFinal',
      'titulosAlternativos',
      'descripcionSeo',
      'hashtags',
      'escenas',
    ],
  };

  const compactInput = {
    tituloViral: script.tituloViral,
    fraseApertura: script.ganchoInicial3Seg?.fraseApertura || '',
    loopFinal: script.loopFinal || '',
    titulosAlternativos: script.metadatosPublicacion?.titulosAlternativos ?? [],
    descripcionSeo: script.metadatosPublicacion?.descripcionSeo || '',
    hashtags: script.metadatosPublicacion?.hashtags ?? [],
    escenas: script.escenas.map((s) => ({
      id: s.id,
      narracion: s.narracion,
      subtituloDinamico: s.subtituloDinamico,
      palabraDestacada: s.palabraDestacada,
    })),
  };

  const prompt = [
    `Adapt and translate this video script into ${langLabel}.`,
    'Make it sound like a native top creator speaking naturally to viewers (never stiff literal translation).',
    'Keep the EXACT same scene IDs, similar spoken length per scene, punchy 3-6 word uppercase dynamic subtitles, and 1-2 exact highlight words inside each subtituloDinamico.',
    'Input JSON:',
    JSON.stringify(compactInput),
  ].join('\n');

  const translated = await generateJsonWithGemini<{
    tituloViral?: string;
    fraseApertura?: string;
    loopFinal?: string;
    titulosAlternativos?: string[];
    descripcionSeo?: string;
    hashtags?: string[];
    escenas?: Array<{
      id: string;
      narracion: string;
      subtituloDinamico: string;
      palabraDestacada: string;
    }>;
  }>({
    contents: prompt,
    responseSchema: translationSchema,
  });

  const translatedById = new Map<
    string,
    { narracion: string; subtituloDinamico: string; palabraDestacada: string }
  >();
  if (Array.isArray(translated.escenas)) {
    for (const item of translated.escenas) {
      if (item?.id) translatedById.set(String(item.id), item);
    }
  }

  const mergedScenes: ScriptScene[] = script.escenas.map((orig, idx) => {
    const hit =
      translatedById.get(orig.id) ??
      (Array.isArray(translated.escenas) ? translated.escenas[idx] : undefined);
    const nextNarr = String(hit?.narracion || orig.narracion || '');
    return {
      ...orig,
      narracion: nextNarr,
      subtituloDinamico: String(hit?.subtituloDinamico || orig.subtituloDinamico || ''),
      palabraDestacada: String(hit?.palabraDestacada || orig.palabraDestacada || ''),
      wordTags: normalizeWordTagsForNarration(undefined, nextNarr, orig.visualKeywords ?? []),
    };
  });

  return {
    ...script,
    id: `script-${targetLanguage}-${Date.now()}`,
    creadoEn: new Date().toISOString(),
    idioma: targetLanguage,
    tituloViral: String(translated.tituloViral || script.tituloViral),
    ganchoInicial3Seg: {
      ...script.ganchoInicial3Seg,
      fraseApertura: String(
        translated.fraseApertura || script.ganchoInicial3Seg?.fraseApertura || ''
      ),
    },
    loopFinal: String(translated.loopFinal || script.loopFinal || ''),
    metadatosPublicacion: {
      ...script.metadatosPublicacion,
      titulosAlternativos:
        Array.isArray(translated.titulosAlternativos) && translated.titulosAlternativos.length > 0
          ? translated.titulosAlternativos
          : script.metadatosPublicacion?.titulosAlternativos ?? [],
      descripcionSeo: String(
        translated.descripcionSeo || script.metadatosPublicacion?.descripcionSeo || ''
      ),
      hashtags:
        Array.isArray(translated.hashtags) && translated.hashtags.length > 0
          ? translated.hashtags
          : script.metadatosPublicacion?.hashtags ?? [],
    },
    escenas: mergedScenes,
  };
}

// ---------- 6. PROMPTS OPTIMIZADOS PARA GOOGLE FLOW ----------

export async function generateFlowPromptsForScript(params: {
  script: ViralScript;
  aspectRatio: VideoAspectRatio;
}): Promise<Record<string, string>> {
  const { script, aspectRatio } = params;
  if (!script || !Array.isArray(script.escenas) || script.escenas.length === 0) {
    throw new GeminiApiError(
      'Se requiere un guion con escenas para optimizar los prompts de Google Flow.',
      { status: 400 }
    );
  }

  const ratioStr =
    aspectRatio === '16:9'
      ? '16:9 horizontal widescreen'
      : '9:16 vertical short-form (TikTok/Shorts/Reels)';
  const chosenStyleDesc =
    STYLE_LABELS[String(script.estilo3D || 'soft_storybook')] ?? STYLE_LABELS.soft_storybook;

  const scenesDigest = script.escenas
    .map((sc) => {
      const vs = sc.visualSpec;
      const vsLine = vs
        ? `\n- VisualSpec: env=${vs.environment}, subject=${vs.mainSubject}, prop=${vs.propIcon}, mood=${vs.moodPalette}`
        : '';
      return `Scene ${sc.orden} (id: "${sc.id}", phase: "${sc.fase}", camera: "${sc.movimientoCamara}"):\n- Narration: ${sc.narracion}\n- Visual base: ${sc.promptVisual3D}${vsLine}`;
    })
    .join('\n\n');

  const flowSchema = {
    type: Type.OBJECT,
    properties: {
      prompts: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            sceneId: { type: Type.STRING },
            promptEn: { type: Type.STRING },
          },
          required: ['sceneId', 'promptEn'],
        },
      },
    },
    required: ['prompts'],
  };

  const prompt = [
    'You are an elite 3D animation director writing production-ready video generation prompts in ENGLISH exclusively for Google Flow.',
    `Video title: "${script.tituloViral}"`,
    `User's exact core premise: "${script.premisa}"`,
    `Chosen visual style (MUST follow strictly): ${chosenStyleDesc}`,
    `Target framing: ${ratioStr}`,
    'STRICT RULES FOR EVERY PROMPT:',
    '- Illustrate ONLY the exact action, setting, numbers, anatomy, objects, and emotion described in THAT scene narration and visualSpec.',
    '- Make every scene visually distinct in setting, focal object, lighting palette, and camera framing so consecutive clips show clear progression.',
    '- Specify rich volumetric 3D lighting, depth of field, tactile shaders, and continuous dynamic camera motion (tracking, dolly push-in, POV, orbital pan — zero static frames).',
    '- Explicitly include vertical 9:16 (or 16:9 widescreen) composition and "no on-screen text, no watermarks".',
    'Return strictly valid JSON with one specific English prompt (65-95 words each) for EVERY sceneId listed below:',
    scenesDigest,
  ].join('\n');

  const parsed = await generateJsonWithGemini<{
    prompts?: Array<{ sceneId?: string; promptEn?: string }>;
  }>({
    contents: prompt,
    responseSchema: flowSchema,
  });

  const promptsBySceneId: Record<string, string> = {};
  for (const item of parsed.prompts ?? []) {
    if (item?.sceneId && typeof item.promptEn === 'string' && item.promptEn.trim()) {
      promptsBySceneId[String(item.sceneId)] = item.promptEn.trim();
    }
  }
  return promptsBySceneId;
}

// ---------- 7. RADAR DE TENDENCIAS VIRALES (con Google Search Grounding) ----------

export async function scanViralTrends(params: {
  region: string;
  category: string;
}): Promise<TrendRadarResult> {
  const targetRegion = String(params.region || 'Hispanoamérica y EE.UU. (Mercado Bilingüe)');
  const targetCategory = String(
    params.category || 'Historias 3D virales y nichos de alto RPM'
  );

  const prompt = [
    'Actúa como un analista de monetización de video corto y largo (YouTube Shorts, TikTok Creator Rewards, Reels) enfocado en canales automatizados de historias animadas para público general, infantil y entretenimiento.',
    `Investiga en la web las tendencias ACTUALES y temas de mayor RPM y retención orgánica para la región "${targetRegion}" y categoría "${targetCategory}".`,
    'Devuelve ÚNICAMENTE un objeto JSON válido (sin texto fuera del JSON) con esta estructura exacta:',
    `{
  "resumenMercado": "Resumen ejecutivo de 2 frases sobre qué está pagando mejor y reteniendo más ahora mismo en videos animados.",
  "tendencias": [
    {
      "id": "trend-1",
      "tema": "Nombre concreto del formato o tendencia actual",
      "nicho": "Nicho comercial",
      "porQueMonetiza": "Explicación directa de por qué atrae alto RPM, patrocinios o tráfico orgánico rápido",
      "rpmEstimado": "Ej. $4 - $9 USD / 1k vistas en largo · Alto alcance en Shorts",
      "anguloViral3D": "Cómo ejecutarlo con estética animada clara y atractiva",
      "ganchoEjemplo": "Frase exacta de los primeros 3 segundos",
      "duracionRecomendada": 90,
      "estiloRecomendado": "soft_storybook",
      "premisaLista": "Premisa completa de 2 frases lista para generar un guion viral, útil o informativo con gancho inmediato y ritmo natural"
    }
  ]
}`,
    'Incluye exactamente 5 tendencias diversas y muy accionables. Usa solo estos valores en estiloRecomendado: "soft_storybook", "flat_kids", "paper_diorama", "viral_meme_3d", "pixar_dark", "ue5_realism", "clay_suspense", "stylized_thriller". Usa solo 60, 90, 120 o 180 en duracionRecomendada.',
  ].join('\n');

  let response;
  try {
    response = await generateContentWithGemini({
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
  } catch (err) {
    // Si Google Search grounding no está habilitado para la clave, degradar limpiamente a JSON estructurado estándar
    if (err instanceof GeminiApiError && (err.isAuthError || err.isRateLimit || err.isMissingKey)) {
      throw err;
    }
    response = await generateContentWithGemini({
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });
  }

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new GeminiApiError(
      'No se pudieron obtener tendencias actualizadas en este momento.',
      { status: 502 }
    );
  }

  const parsed = JSON.parse(extractJsonString(rawText)) as {
    resumenMercado?: string;
    tendencias?: TrendItem[];
  };

  const groundingChunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seenUris = new Set<string>();
  const fuentes: GroundingSource[] = [];

  for (const chunk of groundingChunks) {
    const web = (chunk as { web?: { uri?: string; title?: string } }).web;
    if (web?.uri && !seenUris.has(web.uri)) {
      seenUris.add(web.uri);
      fuentes.push({
        title: web.title || web.uri,
        uri: web.uri,
      });
    }
  }

  return {
    actualizadoEn: new Date().toISOString(),
    region: targetRegion,
    categoria: targetCategory,
    resumenMercado: String(parsed.resumenMercado || ''),
    tendencias: Array.isArray(parsed.tendencias) ? parsed.tendencias : [],
    fuentes,
  };
}

// ---------- 8. DADO DE IDEA ALEATORIA VIRAL ----------

export async function generateRandomViralIdea(): Promise<{
  premise: string;
  niche: string;
  audience: AudienceId;
  style3D: Style3DId;
}> {
  const randomIdeaSchema = {
    type: Type.OBJECT,
    properties: {
      premise: { type: Type.STRING },
      niche: { type: Type.STRING },
      audience: { type: Type.STRING },
      style3D: { type: Type.STRING },
    },
    required: ['premise', 'niche', 'audience', 'style3D'],
  };

  const prompt = [
    'Eres un director creativo experto en videos virales de TikTok, YouTube Shorts y Reels con altísima retención.',
    'Inventa UNA premisa viral completa, específica y cinematográfica en ESPAÑOL siguiendo OBLIGATORIAMENTE esta fórmula de 3 partes:',
    '[Escenario extremo o dato real poco conocido con cifra/fecha concreta] + [Consecuencia física o psicológica impactante] + [Misterio sin resolver o pregunta inquietante].',
    'Nichos permitidos: Historia Absurda (What If), Psicología Oscura, Dinero en 60s, Ciencia Extrema, Lore y Misterios, Supervivencia POV, Marcas Rivales o Cuerpo Humano.',
    'PROHIBIDO usar frases cliché como "En un mundo donde", "¿Alguna vez te has preguntado?", "Prepárate para" o temas planos genéricos.',
    `Semilla creativa aleatoria: ${Date.now() % 99991}.`,
    'Devuelve estrictamente JSON válido.',
  ].join('\n');

  const parsed = await generateJsonWithGemini<{
    premise?: string;
    niche?: string;
    audience?: string;
    style3D?: string;
  }>({
    contents: prompt,
    responseSchema: randomIdeaSchema,
  });

  const validAudiences = new Set<string>(['viral_meme', 'educational', 'suspense', 'general', 'kids']);
  const validStyles = new Set<string>(Object.keys(STYLE_LABELS));

  return {
    premise: String(parsed.premise || '').trim(),
    niche: String(parsed.niche || 'Idea Aleatoria Viral').trim(),
    audience: (validAudiences.has(String(parsed.audience))
      ? parsed.audience
      : 'viral_meme') as AudienceId,
    style3D: (validStyles.has(String(parsed.style3D))
      ? parsed.style3D
      : 'viral_meme_3d') as Style3DId,
  };
}

// ---------- 9. ILUSTRACIÓN SVG DE ESCENA (INDIVIDUAL, LOTE Y EDICIÓN) ----------

function resolveAspectFrame(aspectRatio?: VideoAspectRatio | ImageAspectRatio) {
  const ratioStr = String(aspectRatio || '9:16');
  const viewBox =
    ratioStr === '16:9'
      ? '0 0 960 540'
      : ratioStr === '1:1'
        ? '0 0 720 720'
        : '0 0 540 960';
  const frameLabel =
    ratioStr === '16:9'
      ? '16:9 horizontal widescreen'
      : ratioStr === '1:1'
        ? '1:1 square'
        : '9:16 vertical';
  return { viewBox, frameLabel };
}

export async function generateSceneSvgArt(params: {
  promptVisual3D?: string;
  narration?: string;
  style3D?: Style3DId;
  audience?: AudienceId;
  sceneOrder?: number;
  shotType?: ShotVariationType;
  aspectRatio?: VideoAspectRatio | ImageAspectRatio;
  variationIndex?: number;
}): Promise<string> {
  if (!params.promptVisual3D && !params.narration) {
    throw new GeminiApiError('Se requiere la descripción visual de la escena.', { status: 400 });
  }

  const styleKey = String(params.style3D || 'soft_storybook');
  const styleDesc = STYLE_LABELS[styleKey] ?? STYLE_LABELS.soft_storybook;
  const safeAudience = String(params.audience || 'general');
  const { viewBox, frameLabel } = resolveAspectFrame(params.aspectRatio);

  const shotDirectives: Record<string, string> = {
    principal:
      'Main storytelling medium shot showing the protagonist and the exact key object or moment described in the narration.',
    reaccion:
      'Distinct close-up / reaction cut focusing tightly on a character reaction or the crucial object/detail from a completely different angle and color accent.',
    plano_abierto:
      'Distinct wide environmental establishing shot showing the full setting, background characters, and scale of what is happening.',
  };
  const shotRule = shotDirectives[String(params.shotType || 'principal')] ?? shotDirectives.principal;
  const isViralMeme = styleKey === 'viral_meme_3d' || safeAudience === 'viral_meme';

  const artPrompt = [
    isViralMeme
      ? `Create a bold, hilarious, cartoonish 3D-meme style ${frameLabel} illustration as a single self-contained SVG (\`viewBox="${viewBox}"\`).`
      : `Create a clean, charming, non-realistic ${frameLabel} storybook illustration as a single self-contained SVG (\`viewBox="${viewBox}"\`).`,
    'VISUAL DIRECTIVES:',
    `- Composition & Framing (MUST look distinctly different from other scenes): ${shotRule} (variation #${Number(params.variationIndex || 1)}).`,
    isViralMeme
      ? '- Cartoonish Blender / Source Filmmaker comedy meme aesthetic with bold saturated colors, dramatic comic speed/shock lines, funny contrast between historical/serious setting and out-of-place modern technology.'
      : '- Non-realistic, calm, simplified geometric/storybook vector art suitable for general audiences and children.',
    isViralMeme
      ? '- Characters MUST have comically exaggerated cartoon expressions (huge wide bulging eyes, dropped jaws, raised eyebrows, funny startled poses) and stunned secondary characters reacting in the background.'
      : '- Characters (if present) MUST have calm, minimal, understated expressions (simple dot eyes, gentle neutral or subtle smile, never exaggerated or scary faces).',
    '- Rich layered visual storytelling: expressive sky/backdrop linearGradient or radialGradient, distinct scenery matching the exact moment of the story, clear focal subject, foreground depth.',
    '- NEVER include any `<text>` elements, words, letters, watermarks, scripts, or external URLs.',
    '- Keep the SVG clean, valid XML, and visually rich (~40 to 70 clean vector shapes/paths/gradients).',
    `Style reference: ${styleDesc}`,
    `Audience mode: ${safeAudience} (scene #${Number(params.sceneOrder || 1)})`,
    `Scene visual brief: ${String(params.promptVisual3D || '')}`,
    `Exact narration for this shot: ${String(params.narration || '')}`,
    `Return ONLY the raw \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">...</svg>\` code with zero markdown prose outside it.`,
  ].join('\n');

  const response = await generateContentWithGemini({ contents: artPrompt });
  const safeSvg = extractAndSanitizeSvg((response.text ?? '').trim());
  return `data:image/svg+xml;base64,${utf8ToBase64(safeSvg)}`;
}

export async function generateBatchSceneSvgArt(params: {
  scenes: Array<{ id: string; orden: number; promptVisual3D: string; narracion: string }>;
  style3D?: Style3DId;
  audience?: AudienceId;
  aspectRatio?: VideoAspectRatio | ImageAspectRatio;
}): Promise<Record<string, string>> {
  const safeScenes = (params.scenes ?? []).slice(0, 4);
  if (safeScenes.length === 0) {
    throw new GeminiApiError('Se requiere al menos una escena para ilustrar.', { status: 400 });
  }

  const styleKey = String(params.style3D || 'soft_storybook');
  const styleDesc = STYLE_LABELS[styleKey] ?? STYLE_LABELS.soft_storybook;
  const safeAudience = String(params.audience || 'general');
  const { viewBox, frameLabel } = resolveAspectFrame(params.aspectRatio);
  const isViralMeme = styleKey === 'viral_meme_3d' || safeAudience === 'viral_meme';

  const batchArtSchema = {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            sceneId: { type: Type.STRING },
            svg: { type: Type.STRING },
          },
          required: ['sceneId', 'svg'],
        },
      },
    },
    required: ['items'],
  };

  const sceneSpecs = safeScenes.map((s, idx) => ({
    sceneId: String(s.id || `sc-${idx + 1}`),
    order: Number(s.orden || idx + 1),
    shotFraming:
      idx % 3 === 0
        ? 'Medium storytelling shot focusing on main character and key object'
        : idx % 3 === 1
          ? 'Distinct close-up / reaction angle with contrasting color accent'
          : 'Distinct wide environmental shot showing the full setting and depth',
    promptVisual3D: String(s.promptVisual3D || '').slice(0, 450),
    narration: String(s.narracion || '').slice(0, 300),
  }));

  const batchPrompt = [
    `Generate ${sceneSpecs.length} distinctly different, rich ${frameLabel} SVG illustrations (viewBox="${viewBox}") in ONE JSON response.`,
    isViralMeme
      ? 'Style: Cartoonish 3D viral meme comedy (Blender/SFM vibe) with bold saturated colors, comic exaggeration (wide eyes, dropped jaws), and hilarious visual contrast.'
      : 'Style: Clean, charming, non-realistic storybook vector art with calm understated expressions, soft gradients, and layered depth suitable for general audiences.',
    `Visual style reference: ${styleDesc}`,
    'STRICT RULES FOR EVERY SVG:',
    '- Each scene MUST look visibly distinct in composition, color mood, and camera angle.',
    '- Include expressive <defs> gradients, background scenery, focal subject, and foreground depth (~35-55 clean shapes/paths per SVG).',
    '- NEVER include <text>, words, letters, watermarks, <script>, <foreignObject>, or external URLs.',
    '- Return the exact sceneId for each item.',
    'Scenes to illustrate:',
    JSON.stringify(sceneSpecs),
  ].join('\n');

  const parsed = await generateJsonWithGemini<{
    items?: Array<{ sceneId?: string; svg?: string }>;
  }>({
    contents: batchPrompt,
    responseSchema: batchArtSchema,
  });

  const imagesBySceneId: Record<string, string> = {};
  for (const item of parsed.items ?? []) {
    if (!item?.sceneId || typeof item.svg !== 'string') continue;
    try {
      const safeSvg = extractAndSanitizeSvg(item.svg);
      imagesBySceneId[String(item.sceneId)] = `data:image/svg+xml;base64,${utf8ToBase64(safeSvg)}`;
    } catch {
      // Omitir si alguna entrada vino malformada
    }
  }

  if (Object.keys(imagesBySceneId).length === 0) {
    throw new GeminiApiError(
      'No se pudieron construir las ilustraciones del lote. Intenta nuevamente.',
      { status: 502 }
    );
  }

  return imagesBySceneId;
}

export async function editSceneSvgArt(params: {
  imageDataUrl: string;
  editInstruction: string;
  aspectRatio?: VideoAspectRatio | ImageAspectRatio;
  style3D?: Style3DId;
}): Promise<string> {
  const { imageDataUrl, editInstruction, aspectRatio, style3D } = params;
  if (!imageDataUrl) {
    throw new GeminiApiError('Selecciona o sube una imagen para editar.', { status: 400 });
  }
  if (!editInstruction || !editInstruction.trim()) {
    throw new GeminiApiError('Escribe la instrucción de cambio que deseas aplicar.', {
      status: 400,
    });
  }

  const styleKey = String(style3D || 'soft_storybook');
  const styleDesc = STYLE_LABELS[styleKey] ?? STYLE_LABELS.soft_storybook;
  const { viewBox, frameLabel } = resolveAspectFrame(aspectRatio);

  const isSvgInput = imageDataUrl.startsWith('data:image/svg+xml;base64,');

  let contents: Parameters<typeof generateContentWithGemini>[0]['contents'];
  if (isSvgInput) {
    const existingSvg = base64ToUtf8(imageDataUrl.replace('data:image/svg+xml;base64,', ''));
    contents = [
      `Edit this existing ${frameLabel} SVG illustration according to the user's instruction while preserving the recognizable core composition and upgrading visual richness.`,
      `User edit instruction: ${editInstruction.trim()}`,
      `Target art style: ${styleDesc}`,
      `RULES: Never include <text>, scripts, foreignObject, or external URLs. Output ONLY the complete updated raw \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">...</svg>\` markup.`,
      'Current SVG:',
      existingSvg.slice(0, 18000),
    ].join('\n');
  } else {
    const dataMatch = imageDataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
    if (!dataMatch) {
      throw new GeminiApiError(
        'Formato de imagen no compatible. Usa PNG, JPG, WEBP o una ilustración del estudio.',
        { status: 400 }
      );
    }
    const mimeType = dataMatch[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataMatch[1];
    const base64Data = dataMatch[2];

    contents = {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: [
            `Look closely at the uploaded reference image and recreate it as a rich, stylized ${frameLabel} SVG artwork (\`viewBox="${viewBox}"\`) applying the requested edit.`,
            `Requested edit: ${editInstruction.trim()}`,
            `Target style: ${styleDesc}`,
            `RULES: Keep the main subject and mood recognizable from the photo while visibly applying the edit. Use layered gradients, lighting, and ~45-75 clean vector paths/shapes. NEVER include <text>, words, scripts, or external URLs. Return ONLY the raw \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">...</svg>\` code.`,
          ].join('\n'),
        },
      ],
    };
  }

  const response = await generateContentWithGemini({ contents });
  const safeSvg = extractAndSanitizeSvg((response.text ?? '').trim());
  return `data:image/svg+xml;base64,${utf8ToBase64(safeSvg)}`;
}
