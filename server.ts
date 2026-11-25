import 'dotenv/config';
import express from 'express';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GoogleGenAI, Type } from '@google/genai';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-2.5-flash';
const TEXT_MODEL_CANDIDATES = [MODEL_NAME, 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
let activeTextModelIndex = 0;

// Cola ligera de espaciado para evitar ráfagas simultáneas hacia la API de Gemini
let lastGeminiCallAt = 0;
let geminiQueueTail: Promise<void> = Promise.resolve();
const MIN_CALL_SPACING_MS = 650;

function paceGeminiRequest<T>(task: () => Promise<T>): Promise<T> {
  const scheduled = geminiQueueTail.then(async () => {
    const elapsed = Date.now() - lastGeminiCallAt;
    if (elapsed < MIN_CALL_SPACING_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_CALL_SPACING_MS - elapsed));
    }
    lastGeminiCallAt = Date.now();
    return task();
  });
  geminiQueueTail = scheduled.then(
    () => undefined,
    () => undefined
  );
  return scheduled;
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'No se encontró la clave GEMINI_API_KEY en el servidor. Configúrala en Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await paceGeminiRequest(fn);
    } catch (err: unknown) {
      lastError = err;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: number }).status)
          : 0;
      const rawMsg = err instanceof Error ? err.message : String(err ?? '');
      const isRateLimit = status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED');
      const isRetryable = isRateLimit || status >= 500 || status === 0;
      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      const waitMs = isRateLimit ? 2500 * (attempt + 1) : 800 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

async function generateTextContent(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
) {
  let lastErr: unknown;
  for (let offset = 0; offset < TEXT_MODEL_CANDIDATES.length; offset++) {
    const idx = (activeTextModelIndex + offset) % TEXT_MODEL_CANDIDATES.length;
    const model = TEXT_MODEL_CANDIDATES[idx];
    try {
      const result = await withRetry(() =>
        ai.models.generateContent({
          ...params,
          model,
        })
      );
      activeTextModelIndex = idx;
      return result;
    } catch (err: unknown) {
      lastErr = err;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: number }).status)
          : 0;
      const rawMsg = err instanceof Error ? err.message : String(err ?? '');
      const isModelNotFound = status === 404 || rawMsg.includes('NOT_FOUND');
      if (!isModelNotFound) {
        throw err;
      }
    }
  }
  throw lastErr;
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Error desconocido';
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: number }).status)
      : 500;

  if (status === 403 || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'La clave de Gemini fue rechazada o es inválida. Verifica tu clave en el panel Settings > Secrets.',
    };
  }
  if (status === 429 || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Se alcanzó el límite de cuota de la API de Gemini. Espera unos segundos o selecciona una clave con facturación en Settings > Secrets.',
    };
  }
  if (status === 404 || raw.includes('NOT_FOUND')) {
    return {
      status: 404,
      message: `El modelo configurado no está disponible para esta clave.`,
    };
  }
  if (raw.includes('speechConfig') || raw.includes('responseModalities') || raw.includes('INVALID_ARGUMENT')) {
    return {
      status: 400,
      message:
        'El motor de voz de Gemini no está habilitado para esta clave/entorno. Se usará la voz gratuita del navegador como respaldo.',
    };
  }
  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: raw,
  };
}

function extractJsonString(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function extractAndSanitizeSvg(raw: string): string {
  const cleaned = raw.trim();
  const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) {
    throw new Error('No se pudo extraer una ilustración SVG válida de la respuesta.');
  }
  let svg = match[0];
  // Eliminar cualquier etiqueta o atributo potencialmente peligroso
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  svg = svg.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  svg = svg.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  svg = svg.replace(/(?:xlink:)?href\s*=\s*(?:"\s*(?:javascript:|https?:|\/\/)[^"]*"|'\s*(?:javascript:|https?:|\/\/)[^']*')/gi, '');
  if (!/xmlns=/i.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svg;
}

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

const VALID_VOICES = new Set(['Kore', 'Puck', 'Zephyr', 'Charon', 'Fenrir']);

const VALID_VISUAL_ENVIRONMENTS = new Set([
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

const VALID_VISUAL_SUBJECTS = new Set([
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

const VALID_VISUAL_PROPS = new Set([
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

const VALID_VISUAL_PALETTES = new Set([
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

function normalizeVisualSpec(rawSpec: unknown, fallbackPrompt: string) {
  const spec =
    rawSpec && typeof rawSpec === 'object' ? (rawSpec as Record<string, unknown>) : {};
  const envRaw = String(spec.environment || '').trim();
  const subjRaw = String(spec.mainSubject || '').trim();
  const propRaw = String(spec.propIcon || '').trim();
  const palRaw = String(spec.moodPalette || '').trim();
  const flowPromptRaw = String(spec.flowPrompt || '').trim();

  return {
    environment: VALID_VISUAL_ENVIRONMENTS.has(envRaw) ? envRaw : undefined,
    mainSubject: VALID_VISUAL_SUBJECTS.has(subjRaw) ? subjRaw : undefined,
    propIcon: VALID_VISUAL_PROPS.has(propRaw) ? propRaw : undefined,
    moodPalette: VALID_VISUAL_PALETTES.has(palRaw) ? palRaw : undefined,
    flowPrompt: flowPromptRaw.length >= 25 ? flowPromptRaw : fallbackPrompt,
  };
}

function normalizeVisualBible(rawBible: unknown, fallbackStyle: string) {
  const b =
    rawBible && typeof rawBible === 'object' ? (rawBible as Record<string, unknown>) : {};
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

const ANTI_CLICHE_DIRECTIVE = [
  'FILTRO ESTRICTO ANTI-CLICHÉS DE IA (LISTA NEGRA ABSOLUTA):',
  '- PROHIBIDO usar en el segundo 0:00 o en cualquier narración frases genéricas o rellenos como: "En un mundo donde", "¿Alguna vez te has preguntado?", "Prepárate para", "Acompáñame a descubrir", "Hoy vamos a ver", "En este video te contaré", "Imagina un mundo", "Hola amigos", "Bienvenidos", "Quédate hasta el final".',
  '- OBLIGATORIO: El segundo 0:00 DEBE arrancar en frío con una ACCIÓN INMEDIATA, un DATO/FECHA/CIFRA EXACTA verificable o una SITUACIÓN LÍMITE física o psicológica que golpee la atención desde la primera palabra.',
].join('\n');

const VALID_NARRATIVE_BLUEPRINTS = new Set([
  'pov_immersive',
  'classified_mystery',
  'historical_what_if',
  'escalation_ladder',
  'psychological_lore',
]);

const BLUEPRINT_DIRECTIVES: Record<string, string> = {
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
};

function resolveServerNarrativeBlueprint(
  requested: unknown,
  niche: string,
  audience: string
): string {
  const reqStr = String(requested || '').trim();
  if (VALID_NARRATIVE_BLUEPRINTS.has(reqStr)) return reqStr;
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

const SHOT_TYPE_CYCLE = [
  'WIDE_ESTABLISHING',
  'EXTREME_CLOSE_UP',
  'LOW_ANGLE_DRAMATIC',
  'OVER_THE_SHOULDER',
  'CLOSE_UP_EMOTION',
  'MEDIUM_ACTION',
  'POV_FIRST_PERSON',
] as const;

type ServerShotType = (typeof SHOT_TYPE_CYCLE)[number];

const SHOT_TYPE_EN_FRAMING: Record<ServerShotType, { en: string; es: string }> = {
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

const VALID_CAMERA_MOTIONS = new Set([
  'dolly_in',
  'dolly_out',
  'orbit_left',
  'orbit_right',
  'handheld_tension',
  'rack_focus_reveal',
  'push_impact',
]);

const VALID_FOLEY_CUES = new Set([
  'none',
  'sub_drop',
  'riser_tension',
  'hud_click',
  'whoosh_cut',
  'heartbeat',
  'thunder_impact',
  'analog_glitch',
]);

const VALID_WORD_STYLES = new Set(['normal', 'emphasis', 'danger', 'stat', 'whisper']);

const VALID_RETENTION_ROLES = new Set([
  'hook',
  'setup',
  'escalation',
  're_hook',
  'climax',
  'loop_close',
]);

function normalizeWordTagsForNarration(rawTags: unknown, narration: string, visualKeywords: string[]) {
  const words = narration.trim().split(/\s+/).filter(Boolean);
  const tagMap = new Map<string, string>();
  if (Array.isArray(rawTags)) {
    for (const item of rawTags) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const w = String(rec.word || '').trim();
      const st = String(rec.style || '').trim();
      if (w && VALID_WORD_STYLES.has(st)) {
        tagMap.set(w.toLowerCase().replace(/[^a-z0-9áéíóúñü]/gi, ''), st);
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
    let style = tagMap.get(clean) || 'normal';
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

function normalizePacingProfile(rawPacing: unknown, role: string, isTwist: boolean) {
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
      (Number.isFinite(rawSpeed) ? Math.max(0.85, Math.min(1.25, rawSpeed)) : defaultSpeed).toFixed(2)
    ),
    prePauseMs: Number.isFinite(rawPause)
      ? Math.max(0, Math.min(450, Math.round(rawPause)))
      : defaultPause,
    musicDuckLevel: Number(
      (Number.isFinite(rawDuck) ? Math.max(0.05, Math.min(0.25, rawDuck)) : defaultDuck).toFixed(2)
    ),
  };
}

function normalizeHudData(rawHud: unknown) {
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

function normalizeRetentionAudit(
  rawAudit: unknown,
  scenes: Array<Record<string, unknown>>
) {
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

function normalizeSagaMemoryUpdate(rawMem: unknown) {
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
      // Buscar pausa natural cercana (. , ; : ! ?) para cortar frases con naturalidad
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

/**
 * Post-procesador determinista Módulo 2 (BeatV2 + Shot Continuity Graph + worldStateDelta):
 * 1) Divide cualquier narración >14 palabras en micro-beats de 8-12 palabras (3-4.5s).
 * 2) Garantiza que NUNCA se repita el mismo `shotType` en dos beats consecutivos.
 * 3) Propaga acumulativamente `worldStateDelta` al `imagePrompt`, `promptVisual3D` y `flowPrompt`.
 * 4) Normaliza `wordTags`, `cameraMotion`, `foleyCue`, `pacingProfile`, `hudData` y `retentionRole`.
 */
function enforceMicroSceneBeats(
  rawScenes: Record<string, unknown>[],
  safeDuration: number,
  visualBible: ReturnType<typeof normalizeVisualBible>,
  styleDesc: string,
  fallbackPremise: string
) {
  const validPhases = new Set([
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
  const formatMMSS = (sec: number) => {
    const clamped = Math.max(0, Math.round(sec));
    return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`;
  };

  const expanded: Record<string, unknown>[] = [];
  for (const sc of rawScenes) {
    const rawNarr = String(sc.narracion || '').trim() || fallbackPremise;
    const beatPieces = splitLongNarrationIntoBeats(rawNarr, 12);
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

  // Garantizar al menos un beat `re_hook` entre 35% y 45% si el modelo no lo asignó en esa franja
  const reHookTargetIdx = Math.max(1, Math.min(count - 2, Math.round(count * 0.4)));
  const hasExplicitReHook = finalList.some(
    (sc, idx) =>
      idx >= Math.max(1, Math.floor(count * 0.3)) &&
      idx <= Math.ceil(count * 0.5) &&
      (sc.retentionRole === 're_hook' || Boolean(sc.esGiro30s))
  );

  let cursor = 0;
  let prevShotType: ServerShotType | null = null;
  const rollingWorldState: string[] = [];

  return finalList.map((sc, idx) => {
    const proportionalDur = Math.max(3, Math.min(4.5, (wordCounts[idx] / totalWords) * safeDuration));
    const startSec = Math.round(cursor);
    const nextCursor = idx === count - 1 ? Math.max(startSec + 3, safeDuration) : cursor + proportionalDur;
    const endSec = Math.max(startSec + 3, Math.round(nextCursor));
    cursor = nextCursor;

    const narracion = String(sc.narracion || '').trim() || fallbackPremise;
    const subtitulo =
      String(sc.subtituloDinamico || '').trim() ||
      narracion.split(/\s+/).slice(0, 5).join(' ').toUpperCase();

    // Shot Continuity Graph: jamás repetir el mismo shotType en dos beats consecutivos
    const candidateShot = String(sc.shotType || '').trim();
    let resolvedShot: ServerShotType = VALID_SHOT_TYPES.has(candidateShot)
      ? (candidateShot as ServerShotType)
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

    // Acumular worldStateDelta y propagar continuidad física a los prompts visuales siguientes
    const rawDelta = String(sc.worldStateDelta || '').replace(/\s+/g, ' ').trim();
    const cleanDelta =
      rawDelta && !/^(none|ninguno|n\/a|sin cambios?|-)$/i.test(rawDelta) ? rawDelta.slice(0, 120) : '';
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

    const rawPromptVisual = String(sc.promptVisual3D || '').trim() || `${shotFraming.en}, ${styleDesc}`;
    const promptVisual = injectContinuity(rawPromptVisual);
    const normalizedVisual = normalizeVisualSpec(sc.visualSpec, promptVisual);
    const lockedFlowPrompt = injectContinuity(normalizedVisual.flowPrompt);
    const visualSpec =
      normalizedVisual.environment &&
      normalizedVisual.mainSubject &&
      normalizedVisual.propIcon &&
      normalizedVisual.moodPalette
        ? {
            ...normalizedVisual,
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
    let retentionRole = VALID_RETENTION_ROLES.has(rawRole)
      ? rawRole
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

    const isKeyTwist = Boolean(sc.esGiro30s) || retentionRole === 're_hook' || retentionRole === 'climax';

    const rawMotion = String(sc.cameraMotion || '').trim();
    const defaultMotions = [
      'dolly_in',
      'push_impact',
      'orbit_left',
      'handheld_tension',
      'rack_focus_reveal',
      'dolly_out',
      'orbit_right',
    ];
    const cameraMotion = VALID_CAMERA_MOTIONS.has(rawMotion)
      ? rawMotion
      : defaultMotions[idx % defaultMotions.length];

    const rawFoley = String(sc.foleyCue || '').trim();
    const defaultFoley =
      idx === 0
        ? 'sub_drop'
        : retentionRole === 're_hook'
          ? 'riser_tension'
          : retentionRole === 'climax'
            ? 'thunder_impact'
            : idx % 3 === 0
              ? 'whoosh_cut'
              : 'none';
    const foleyCue = VALID_FOLEY_CUES.has(rawFoley) ? rawFoley : defaultFoley;

    const pacingProfile = normalizePacingProfile(sc.pacingProfile, retentionRole, isKeyTwist);
    const hudData = normalizeHudData(sc.hudData);
    const wordTags = normalizeWordTagsForNarration(sc.wordTags, narracion, rawVisualKeywords);
    const depthTitleText = String(sc.depthTitleText || '').trim().slice(0, 26) || undefined;

    return {
      ...sc,
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
      transicionRapida: String(sc.transicionRapida || '').trim() || 'Corte seco de impacto',
      disenoSonoro: String(sc.disenoSonoro || '').trim() || 'Whoosh seco + impacto sutil',
      esGiro30s: isKeyTwist,
      fase: validPhases.has(String(sc.fase))
        ? sc.fase
        : idx === 0
          ? 'Gancho'
          : idx === count - 1
            ? 'Cierre y Loop'
            : retentionRole === 're_hook'
              ? 'Giro'
              : isKeyTwist
                ? 'Dato clave'
                : 'Desarrollo',
    };
  });
}

const visualBibleSchema = {
  type: Type.OBJECT,
  description:
    'Bloque fijo de consistencia visual (Character & World Lock) definido ANTES de las escenas para mantener 100% coherencia de personaje, vestimenta, estilo artístico e iluminación de principio a fin.',
  properties: {
    artStyle: {
      type: Type.STRING,
      description:
        'Estilo artístico exacto en inglés (ej. Dark stylized 3D Pixar-thriller animation, Octane render, expressive stylized proportions)',
    },
    lightingPalette: {
      type: Type.STRING,
      description:
        'Paleta exacta de iluminación y color en inglés (ej. Deep abyssal teal shadows, pulsing crimson alarm rim light, cold volumetric mist)',
    },
    characterOrWorldLock: {
      type: Type.STRING,
      description:
        'Apariencia física exacta, rasgos, vestimenta y detalles fijos del protagonista y/o entorno principal en inglés que NO pueden cambiar entre escenas',
    },
    fixedPrefixPrompt: {
      type: Type.STRING,
      description:
        'Prefijo compacto y reutilizable en INGLÉS (25-45 palabras) que resume estilo + paleta + apariencia/mundo fijo para inyectarse automáticamente al inicio del imagePrompt y flowPrompt de TODAS las escenas',
    },
  },
  required: ['artStyle', 'lightingPalette', 'characterOrWorldLock', 'fixedPrefixPrompt'],
};

const visualSpecSchema = {
  type: Type.OBJECT,
  description:
    'Especificación visual única para ESTA escena individual. Debe cambiar entre escenas para ilustrar exactamente lo que ocurre en esta frase.',
  properties: {
    environment: {
      type: Type.STRING,
      description:
        'Exactamente uno de: park_walking, brain_neurons, heart_bloodflow, muscles_gym, sleep_bedroom, ancient_rome, medieval_castle, space_cosmos, money_charts, office_desk, city_street, tech_studio, forest_stream, ocean_deep, survival_wild, mystery_vault',
    },
    mainSubject: {
      type: Type.STRING,
      description:
        'Exactamente uno de: walking_happy, running_fast, flexing_muscles, stressed_head, sleeping_peaceful, thinking_curious, triumphant_celebrate, shocked_crowd, holding_speaker, working_focused, counting_money, exploring_pov',
    },
    propIcon: {
      type: Type.STRING,
      description:
        'Exactamente uno de: sneakers_steps, brain_glow, heart_pulse, dumbbell, clock_calendar, bluetooth_speaker, coin_chart, smartphone_glow, compass_map, planet_rocket, warning_bolt, energy_sun, paper_boat, coffee_cup, shield_lock',
    },
    moodPalette: {
      type: Type.STRING,
      description:
        'Exactamente uno de: warm_energy, neon_science, crimson_pulse, emerald_vitality, golden_history, alert_stress, cosmic_indigo, wealth_gold, calm_storybook, cyber_cyan',
    },
    flowPrompt: {
      type: Type.STRING,
      description:
        'Prompt altamente específico en INGLÉS (60-90 palabras) listo para Google Flow describiendo exactamente la acción, entorno, objetos, iluminación y movimiento de cámara dinámico de ESTA escena, fiel 100% a la idea del usuario y al estilo visual elegido (sin texto en pantalla ni elementos ajenos a la historia).',
    },
  },
  required: ['environment', 'mainSubject', 'propIcon', 'moodPalette', 'flowPrompt'],
};

const retentionAuditSchema = {
  type: Type.OBJECT,
  description:
    'Auditoría interna del Crítico de Retención generada OBLIGATORIAMENTE ANTES de las escenas para garantizar gancho veloz (<2.2s), re-hook en 35-45%, pattern interrupts cada 1-2 beats y loop gramatical perfecto.',
  properties: {
    hookVelocityScore: {
      type: Type.INTEGER,
      description: 'Puntaje 0-100 evaluando si Beat 1 abre brecha de curiosidad en <2.2s sin saludos ni clichés',
    },
    reHookBeatIndex: {
      type: Type.INTEGER,
      description: 'Índice (0-based) del beat con retentionRole="re_hook" ubicado entre el 35% y 45% del total de beats',
    },
    patternInterruptCheck: {
      type: Type.STRING,
      description: 'Confirmación concisa en español de que no pasan más de 2 beats sin cambio significativo (HUD, foleyCue, shotType o pacingProfile)',
    },
    loopSeamVerification: {
      type: Type.STRING,
      description: 'Demostración explícita de sutura en bucle: "últimas palabras del beat final -> primeras 3 palabras del Beat 1"',
    },
  },
  required: ['hookVelocityScore', 'reHookBeatIndex', 'patternInterruptCheck', 'loopSeamVerification'],
};

const sagaMemoryUpdateSchema = {
  type: Type.OBJECT,
  description:
    'Memoria persistente del universo (SagaBible) para continuar en futuros episodios (Parte 2, 3...) sin perder personajes ni misterios.',
  properties: {
    recurringCharacters: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Protagonistas o entidades clave con rasgos consistentes (1-4 elementos)',
    },
    establishedLore: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Hechos, reglas o descubrimientos establecidos en este episodio (2-4 elementos)',
    },
    resolvedLoop: {
      type: Type.STRING,
      description: 'Si es Episodio 2+, qué misterio previo de la saga quedó resuelto aquí (vacío en Episodio 1)',
    },
    newUnresolvedLoop: {
      type: Type.STRING,
      description: 'Un misterio o consecuencia concreta que queda abierta para impulsar el siguiente episodio',
    },
  },
  required: ['recurringCharacters', 'establishedLore', 'newUnresolvedLoop'],
};

const sceneSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    orden: { type: Type.INTEGER },
    tiempoInicio: { type: Type.STRING, description: 'Formato M:SS, ej. 0:00 o 0:30' },
    tiempoFin: { type: Type.STRING, description: 'Formato M:SS, ej. 0:05 o 0:42' },
    segundoInicio: { type: Type.INTEGER },
    segundoFin: { type: Type.INTEGER },
    fase: {
      type: Type.STRING,
      description: 'Uno de: Gancho, Desarrollo, Dato clave, Tensión, Giro, Escalada, Cierre y Loop',
    },
    esGiro30s: {
      type: Type.BOOLEAN,
      description:
        'true en el Re-Hook (35-45%), en revelaciones decisivas o en el clímax del guion',
    },
    retentionRole: {
      type: Type.STRING,
      description: 'Exactamente uno de: hook, setup, escalation, re_hook, climax, loop_close',
    },
    narracion: {
      type: Type.STRING,
      description:
        'MICRO-ESCENA (BEAT) de 3 a 4.5 segundos: EXACTAMENTE entre 8 y 12 palabras máximo en voz en off natural. PROHIBIDO superar 12 palabras.',
    },
    wordTags: {
      type: Type.ARRAY,
      description:
        'Etiquetado semántico de las palabras clave de narracion para subtítulos dinámicos (emphasis, danger, stat, whisper, normal)',
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          style: {
            type: Type.STRING,
            description: 'Uno de: normal, emphasis, danger, stat, whisper',
          },
        },
        required: ['word', 'style'],
      },
    },
    subtituloDinamico: {
      type: Type.STRING,
      description:
        'Frase corta de alto impacto (3 a 6 palabras en mayúsculas) para subtítulo dinámico en pantalla',
    },
    palabraDestacada: {
      type: Type.STRING,
      description:
        '1 o 2 palabras exactas presentes dentro de subtituloDinamico para resaltar en color',
    },
    visualKeywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'De 1 a 3 palabras clave exactas presentes dentro de esta micro-escena de 8-12 palabras para resaltar y disparar SFX sincronizado',
    },
    shotType: {
      type: Type.STRING,
      description:
        'Exactamente uno de: WIDE_ESTABLISHING, MEDIUM_ACTION, CLOSE_UP_EMOTION, EXTREME_CLOSE_UP, LOW_ANGLE_DRAMATIC, OVER_THE_SHOULDER, POV_FIRST_PERSON. NUNCA repetir el shotType del beat inmediatamente anterior.',
    },
    cameraMotion: {
      type: Type.STRING,
      description:
        'Exactamente uno de: dolly_in, dolly_out, orbit_left, orbit_right, handheld_tension, rack_focus_reveal, push_impact',
    },
    depthTitleText: {
      type: Type.STRING,
      description: 'Opcional: 1-2 palabras de impacto visual para títulos de profundidad en beats clave',
    },
    hudData: {
      type: Type.OBJECT,
      description: 'Opcional: métrica o dato verificado para mostrar como tarjeta HUD (usar en beats con cifras, fechas o mediciones)',
      properties: {
        label: { type: Type.STRING, description: 'Etiqueta corta en mayúsculas, ej. PROFUNDIDAD o SEÑAL' },
        value: { type: Type.STRING, description: 'Valor numérico o código exacto, ej. 4,000 o 6EQUJ5' },
        unit: { type: Type.STRING, description: 'Unidad breve opcional, ej. metros, seg, °C, %' },
      },
      required: ['label', 'value'],
    },
    foleyCue: {
      type: Type.STRING,
      description:
        'Exactamente uno de: none, sub_drop, riser_tension, hud_click, whoosh_cut, heartbeat, thunder_impact, analog_glitch',
    },
    pacingProfile: {
      type: Type.OBJECT,
      description: 'Dirección prosódica exacta de este beat para AudioMasterPipeline',
      properties: {
        speedMultiplier: {
          type: Type.NUMBER,
          description: 'Entre 0.85 (pausa tensa/revelación) y 1.25 (urgencia/acción)',
        },
        prePauseMs: {
          type: Type.INTEGER,
          description: 'Silencio dramático en milisegundos ANTES de iniciar la voz del beat (0 normal, 150-420ms antes de giros/revelaciones)',
        },
        musicDuckLevel: {
          type: Type.NUMBER,
          description: 'Nivel de música durante la voz: 0.05 (revelación dramática) a 0.25 (normal)',
        },
      },
      required: ['speedMultiplier', 'prePauseMs', 'musicDuckLevel'],
    },
    worldStateDelta: {
      type: Type.STRING,
      description:
        'Cambio físico/visual breve en INGLÉS que se acumula en el entorno o personaje para los beats siguientes (ej. "red emergency lights flashing, cracks spreading on glass"). Vacío si no cambia.',
    },
    promptVisual3D: {
      type: Type.STRING,
      description:
        'Prompt corto y directo en INGLÉS (25-45 palabras) específico de ESTE beat, alineado a shotType y visualBible',
    },
    imagePrompt: {
      type: Type.STRING,
      description:
        'Prompt corto, directo y distinto en INGLÉS (25-45 palabras) que ilustre EXACTAMENTE esta frase de 8-12 palabras, iniciando con visualBible.fixedPrefixPrompt, respetando shotType y worldStateDelta acumulado, cerrando con "no text, no watermark"',
    },
    visualSpec: visualSpecSchema,
    movimientoCamara: {
      type: Type.STRING,
      description: 'Instrucción precisa de cámara en español',
    },
    transicionRapida: {
      type: Type.STRING,
      description: 'Transición rápida de montaje en español',
    },
    disenoSonoro: {
      type: Type.STRING,
      description: 'Efectos SFX y cambio rítmico de audio en español',
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
    id: {
      type: Type.STRING,
      description: 'Uno de: dato_perturbador, escenario_pov, intriga_psicologica',
    },
    label: { type: Type.STRING },
    subtitle: { type: Type.STRING },
    fraseApertura: {
      type: Type.STRING,
      description:
        'Gancho verbal persuasivo de 8 a 12 palabras para los primeros 3 segundos, sin gritos ni clichés de IA',
    },
    impactoVisual: {
      type: Type.STRING,
      description: 'Descripción concisa de la toma visual inicial en 0:00 que congela el scroll',
    },
    sonidoRompeScroll: {
      type: Type.STRING,
      description: 'Efecto de sonido cinematográfico en 0:00',
    },
    imagePrompt: {
      type: Type.STRING,
      description:
        'Prompt visual en INGLÉS (25-40 palabras) alineado con visualBible.fixedPrefixPrompt para ilustrar este gancho específico en la Micro-escena 1, terminando con "no text, no watermark"',
    },
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
      description:
        'Exactamente 3 ganchos A/B distintos sobre la misma premisa con IDs exactos: "dato_perturbador" (Dato Perturbador), "escenario_pov" (Escenario POV Inmersivo) e "intriga_psicologica" (Pregunta de Intriga Psicológica)',
    },
    guiaEstilo3D: {
      type: Type.STRING,
      description:
        'Prompt maestro de consistencia visual en inglés para reutilizar en todas las escenas',
    },
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
        planEjecucionRapida: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
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
        titulosAlternativos: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Exactamente 3 títulos virales de alto CTR para TikTok, YouTube Shorts y Reels',
        },
        descripcionSeo: {
          type: Type.STRING,
          description: 'Descripción persuasiva lista para publicar que genera curiosidad y comentarios',
        },
        hashtags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '6 a 8 hashtags estratégicos combinando nicho y descubrimiento viral',
        },
        promptPortada: {
          type: Type.STRING,
          description:
            'Prompt maestro en INGLÉS (35-55 palabras) para generar la portada/miniatura de alto CTR manteniendo 100% el estilo, paleta y personaje del visualBible.fixedPrefixPrompt, con composición focal impactante, sin texto incrustado',
        },
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.post('/api/generate-script', async (req, res) => {
    try {
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
      } = req.body ?? {};

      if (!premise || typeof premise !== 'string' || premise.trim().length < 8) {
        res.status(400).json({
          error: 'Describe una idea o tema de al menos 8 caracteres para construir el guion.',
        });
        return;
      }

      const safeDuration = [30, 60, 90, 120, 180].includes(Number(durationSec))
        ? Number(durationSec)
        : 90;
      const safeAudience = ['general', 'educational', 'kids', 'viral_meme', 'suspense'].includes(
        String(audience)
      )
        ? String(audience)
        : 'general';
      const safeAspectRatio = String(aspectRatio) === '16:9' ? '16:9' : '9:16';
      const styleKey = String(style3D || 'soft_storybook');
      const styleDesc = STYLE_LABELS[styleKey] ?? STYLE_LABELS.soft_storybook;
      const audienceRule = AUDIENCE_RULES[safeAudience] ?? AUDIENCE_RULES.general;
      const platformDesc = PLATFORM_LABELS[String(platform)] ?? PLATFORM_LABELS.youtube_shorts;
      const resolvedBlueprint = resolveServerNarrativeBlueprint(
        narrativeBlueprint,
        String(niche || ''),
        safeAudience
      );
      const blueprintDirective = BLUEPRINT_DIRECTIVES[resolvedBlueprint] ?? '';

      const frameFormatText =
        safeAspectRatio === '16:9' ? '16:9 horizontal widescreen' : '9:16 vertical';

      const trimmedPremise = premise.trim();
      const requestedEnglish =
        /\b(en ingl[eé]s|in english|english script|english narration)\b/i.test(trimmedPremise);
      const requestedPortuguese =
        /\b(en portugu[eé]s|em portugu[eê]s|in portuguese)\b/i.test(trimmedPremise);
      const narrationLangDirective = requestedEnglish
        ? 'IDIOMA OBLIGATORIO DE LA NARRACIÓN Y SUBTÍTULOS: INGLÉS NATURAL (US/UK) porque el usuario lo solicitó explícitamente en su premisa.'
        : requestedPortuguese
          ? 'IDIOMA OBLIGATORIO DE LA NARRACIÓN Y SUBTÍTULOS: PORTUGUÉS NATURAL porque el usuario lo solicitó explícitamente en su premisa.'
          : 'IDIOMA OBLIGATORIO DE LA NARRACIÓN Y SUBTÍTULOS: ESPAÑOL NATURAL, humano, claro y 100% hablable en voz alta.';

      const framingSafeZoneRule =
        safeAspectRatio === '9:16'
          ? 'vertical 9:16 aspect ratio, primary subject strictly centered in the middle third of the frame so it never collides with bottom subtitles or TikTok/Shorts/Reels side UI buttons, dramatic volumetric lighting, continuous camera movement with zero static frames'
          : '16:9 horizontal widescreen framing, dramatic volumetric lighting, continuous cinematic camera movement';

      const beatRange = getTargetBeatRange(safeDuration);

      const lockedSagaBible =
        sagaBible && typeof sagaBible === 'object' && sagaBible.visualBible
          ? normalizeVisualBible(sagaBible.visualBible, styleDesc)
          : null;

      const sagaContextBlock =
        sagaBible && typeof sagaBible === 'object'
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

      const systemInstruction = [
        'Eres una sala de producción integrada de 3 especialistas trabajando en UNA sola llamada JSON: [1. ESCRITOR VIRAL -> 2. CRÍTICO DE RETENCIÓN -> 3. DIRECTOR CINEMATOGRÁFICO Y PROSÓDICO].',
        'ARQUITECTURA DE RAZONAMIENTO INTERNO EN UNA SOLA LLAMADA:',
        '1) PRIMERO define `visualBible` (Character & World Lock) y `retentionAudit` ANTES de redactar `escenas`:',
        '   - `retentionAudit.hookVelocityScore` (0-100): valida que Beat 1 abra una brecha de curiosidad en <2.2 segundos sin saludos, sin introducciones lentas ni clichés.',
        '   - `retentionAudit.reHookBeatIndex`: fuerza un giro inesperado (`retentionRole: "re_hook"`) ubicado estrictamente entre el 35% y 45% del total de beats.',
        '   - `retentionAudit.patternInterruptCheck`: verifica que NUNCA pasen más de 2 beats consecutivos sin un cambio significativo (dato `hudData`, `foleyCue`, cambio de `shotType` o cambio en `pacingProfile`).',
        '   - `retentionAudit.loopSeamVerification`: demuestra textualmente cómo la última frase del beat final se sutura gramaticalmente con las primeras 3 palabras del Beat 1 ("últimas palabras -> primeras 3 palabras").',
        '2) SEGUNDO aplica el BLUEPRINT NARRATIVO y la DISCIPLINA DE MICRO-BEATS:',
        blueprintDirective,
        `- REGLA DE ORO DE RITMO (8 A 12 PALABRAS POR BEAT): Divide este video de ${safeDuration}s en EXACTAMENTE entre ${beatRange.min} y ${beatRange.max} micro-escenas consecutivas (3 a 4.5s cada una). PROHIBIDO agrupar en párrafos largos.`,
        '- MICRO-BUCLES ABIERTOS (OPEN LOOPS): Cada 2 beats siembra una micro-pregunta implícita o tensión que obligue a quedarse hasta el Re-Hook y el cierre en bucle perfecto.',
        '3) TERCERO actúa como DIRECTOR CINEMATOGRÁFICO Y PROSÓDICO en cada beat:',
        '- SHOT CONTINUITY GRAPH: PROHIBIDO repetir el mismo `shotType` en dos beats consecutivos. Alterna orgánicamente entre WIDE_ESTABLISHING, MEDIUM_ACTION, CLOSE_UP_EMOTION, EXTREME_CLOSE_UP, LOW_ANGLE_DRAMATIC, OVER_THE_SHOULDER y POV_FIRST_PERSON.',
        '- PROPAGACIÓN DE `worldStateDelta`: Cuando algo cambia físicamente en la historia (luces rojas, agua entrando, cristal roto, amanecer), regístralo en `worldStateDelta` (en inglés conciso) y mantenlo visible en los `imagePrompt` posteriores.',
        '- DIRECCIÓN PROSÓDICA (`pacingProfile`): varía `speedMultiplier` (0.85 en pausas tensas, 1.0 normal, 1.12-1.22 en urgencia), inserta `prePauseMs` (180-360ms) justo antes de revelaciones/Re-Hook/Clímax y baja `musicDuckLevel` a 0.05-0.07 en confesiones o datos clave.',
        '- ETIQUETADO SEMÁNTICO (`wordTags`): etiqueta cada palabra importante con `emphasis`, `danger`, `stat` (cifras/fechas/códigos) o `whisper` (susurros psicológicos) para potenciar subtítulos Spring Karaoke.',
        '- FOLEY CINEMATOGRÁFICO (`foleyCue`): elige con criterio `sub_drop`, `riser_tension`, `hud_click`, `whoosh_cut`, `heartbeat`, `thunder_impact`, `analog_glitch` o `none`.',
        '- TARJETAS HUD (`hudData`): en beats con cifras, fechas, temperaturas, profundidades o códigos, rellena `hudData: { label, value, unit }`.',
        'REGLA SUPREMA — FIDELIDAD TEMÁTICA ABSOLUTA:',
        '- CADA micro-escena gira 100% alrededor de la idea exacta del usuario sin mezclar temas ajenos.',
        `DIRECTRIZ DE ENFOQUE: ${audienceRule}`,
        narrationLangDirective,
        ANTI_CLICHE_DIRECTIVE,
        sagaContextBlock,
        'CONSISTENCIA GLOBAL (visualBible) + PROMPTS EN INGLÉS:',
        '- En cada beat, `imagePrompt` (25-45 palabras en INGLÉS) y `visualSpec.flowPrompt` (35-60 palabras en INGLÉS) inician con `visualBible.fixedPrefixPrompt`, reflejan el `shotType` y `worldStateDelta`, respetan ' +
          framingSafeZoneRule +
          ', estilo ' +
          styleDesc +
          ', y cierran con "no text, no watermark".',
        '- Genera exactamente 3 `ganchosAlternativos` con IDs exactos: "dato_perturbador", "escenario_pov" e "intriga_psicologica", además de `metadatosPublicacion` con `promptPortada` y `sagaMemoryUpdate`.',
      ]
        .filter(Boolean)
        .join('\n');

      const userPrompt = [
        `TEMA CENTRAL OBLIGATORIO DEL USUARIO: ${trimmedPremise}`,
        `Nicho o temática: ${String(niche || 'Idea personalizada')}`,
        `Blueprint narrativo seleccionado: ${resolvedBlueprint}`,
        `Enfoque / público: ${safeAudience}`,
        `Formato elegido: ${frameFormatText}`,
        `Duración exacta: ${safeDuration} segundos -> GENERA ENTRE ${beatRange.min} Y ${beatRange.max} MICRO-ESCENAS (8 a 12 palabras por micro-escena, 3 a 4.5 segundos cada una).`,
        `Estilo visual obligatorio: ${styleDesc}`,
        `Plataforma objetivo: ${platformDesc}`,
        `Objetivo de monetización: ${String(monetizationGoal || 'Maximizar retención con narrativa persuasiva, micro-bucles abiertos y cortes cada 3-4 segundos')}`,
        'Entrega el JSON completo con visualBible, retentionAudit (primero), sagaMemoryUpdate, las micro-escenas BeatV2 contiguas de 0 a ' +
          safeDuration +
          's, los 3 ganchos A/B y el kit de publicación.',
      ].join('\n');

      const ai = getAiClient();
      const response = await generateTextContent(ai, {
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: scriptResponseSchema,
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        throw new Error('El modelo devolvió una respuesta vacía. Intenta generar nuevamente.');
      }

      const parsed = JSON.parse(extractJsonString(rawText));
      const visualBible = lockedSagaBible ?? normalizeVisualBible(parsed.visualBible, styleDesc);
      const rawScenes = Array.isArray(parsed.escenas) ? parsed.escenas : [];
      const normalizedScenes = enforceMicroSceneBeats(
        rawScenes,
        safeDuration,
        visualBible,
        styleDesc,
        premise.trim()
      );
      const retentionAudit = normalizeRetentionAudit(parsed.retentionAudit, normalizedScenes);
      const sagaMemoryUpdate = normalizeSagaMemoryUpdate(parsed.sagaMemoryUpdate);

      const hookSlotOrder = ['dato_perturbador', 'escenario_pov', 'intriga_psicologica'] as const;
      const hookIdMap: Record<string, (typeof hookSlotOrder)[number]> = {
        dato_perturbador: 'dato_perturbador',
        escenario_pov: 'escenario_pov',
        intriga_psicologica: 'intriga_psicologica',
        curiosidad: 'dato_perturbador',
        polemica: 'escenario_pov',
        humor: 'intriga_psicologica',
      };
      const hookDefaultLabels: Record<
        (typeof hookSlotOrder)[number],
        { label: string; subtitle: string }
      > = {
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

      const rawAltHooks = Array.isArray(parsed.ganchosAlternativos)
        ? parsed.ganchosAlternativos
        : [];
      const normalizedAltHooks = rawAltHooks
        .filter((h: Record<string, unknown>) => h && typeof h.fraseApertura === 'string' && h.fraseApertura.trim())
        .slice(0, 3)
        .map((h: Record<string, unknown>, idx: number) => {
          const fallbackId = hookSlotOrder[idx] ?? 'dato_perturbador';
          const mappedId = hookIdMap[String(h.id || '').toLowerCase()] ?? fallbackId;
          const rawHookImgPrompt =
            typeof h.imagePrompt === 'string' && h.imagePrompt.trim() ? h.imagePrompt.trim() : '';
          const hookImagePrompt = rawHookImgPrompt
            ? rawHookImgPrompt.toLowerCase().includes(visualBible.fixedPrefixPrompt.slice(0, 24).toLowerCase())
              ? rawHookImgPrompt
              : `${visualBible.fixedPrefixPrompt}, ${rawHookImgPrompt}`
            : undefined;
          return {
            id: mappedId,
            label: hookDefaultLabels[mappedId].label,
            subtitle: String(h.subtitle || hookDefaultLabels[mappedId].subtitle).trim(),
            fraseApertura: String(h.fraseApertura).trim(),
            impactoVisual:
              String(h.impactoVisual || parsed.ganchoInicial3Seg?.impactoVisual || '').trim() ||
              'Plano cinematográfico de impacto en 0:00',
            sonidoRompeScroll:
              String(h.sonidoRompeScroll || parsed.ganchoInicial3Seg?.sonidoRompeScroll || '').trim() ||
              'Pulso grave cinematográfico',
            ...(hookImagePrompt ? { imagePrompt: hookImagePrompt } : {}),
          };
        });

      const rawMeta = parsed.metadatosPublicacion ?? {};
      const fallbackCoverPrompt = `${visualBible.fixedPrefixPrompt}, iconic viral thumbnail keyframe for "${String(parsed.tituloViral || trimmedPremise).slice(0, 80)}", dramatic high-contrast rim light, extreme depth of field, centered hero focal composition, ultra-clean 8K cinema render, no text, no watermark`;
      const normalizedMeta = {
        titulosAlternativos:
          Array.isArray(rawMeta.titulosAlternativos) && rawMeta.titulosAlternativos.length > 0
            ? rawMeta.titulosAlternativos.slice(0, 3).map((t: unknown) => String(t).trim()).filter(Boolean)
            : [String(parsed.tituloViral || trimmedPremise)],
        descripcionSeo: String(rawMeta.descripcionSeo || '').trim(),
        hashtags: Array.isArray(rawMeta.hashtags)
          ? rawMeta.hashtags.map((h: unknown) => String(h).trim()).filter(Boolean)
          : [],
        promptPortada:
          typeof rawMeta.promptPortada === 'string' && rawMeta.promptPortada.trim().length > 18
            ? rawMeta.promptPortada.trim()
            : fallbackCoverPrompt,
      };

      res.json({
        script: {
          ...parsed,
          visualBible,
          narrativeBlueprint: resolvedBlueprint,
          retentionAudit,
          ...(sagaMemoryUpdate ? { sagaMemoryUpdate } : {}),
          ...(sagaBible?.sagaId ? { sagaId: String(sagaBible.sagaId) } : {}),
          escenas: normalizedScenes,
          metadatosPublicacion: normalizedMeta,
          ...(normalizedAltHooks.length > 0 ? { ganchosAlternativos: normalizedAltHooks } : {}),
          id: `script-${Date.now()}`,
          creadoEn: new Date().toISOString(),
          premisa: premise.trim(),
          nicho: String(niche || 'Personalizado'),
          publicoObjetivo: safeAudience,
          duracionSegundos: safeDuration,
          estilo3D: styleKey,
          plataforma: String(platform || 'youtube_shorts'),
          formatoVideo: safeAspectRatio,
          vozPreferidaId: typeof voiceProfileId === 'string' ? voiceProfileId : undefined,
          idioma: requestedEnglish ? 'en' : requestedPortuguese ? 'pt' : 'es',
        },
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/generate-scene-art', async (req, res) => {
    try {
      const {
        promptVisual3D,
        narration,
        style3D,
        audience,
        sceneOrder,
        shotType,
        aspectRatio,
        variationIndex,
      } = req.body ?? {};
      if (!promptVisual3D && !narration) {
        res.status(400).json({ error: 'Se requiere la descripción visual de la escena.' });
        return;
      }

      const styleKey = String(style3D || 'soft_storybook');
      const styleDesc = STYLE_LABELS[styleKey] ?? STYLE_LABELS.soft_storybook;
      const safeAudience = String(audience || 'general');
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

      const shotDirectives: Record<string, string> = {
        principal:
          'Main storytelling medium shot showing the protagonist and the exact key object or moment described in the narration.',
        reaccion:
          'Distinct close-up / reaction cut focusing tightly on a character reaction or the crucial object/detail from a completely different angle and color accent.',
        plano_abierto:
          'Distinct wide environmental establishing shot showing the full setting, background characters, and scale of what is happening.',
      };
      const shotRule = shotDirectives[String(shotType || 'principal')] ?? shotDirectives.principal;

      const isViralMeme = styleKey === 'viral_meme_3d' || safeAudience === 'viral_meme';

      const artPrompt = [
        isViralMeme
          ? `Create a bold, hilarious, cartoonish 3D-meme style ${frameLabel} illustration as a single self-contained SVG (\`viewBox="${viewBox}"\`).`
          : `Create a clean, charming, non-realistic ${frameLabel} storybook illustration as a single self-contained SVG (\`viewBox="${viewBox}"\`).`,
        'VISUAL DIRECTIVES:',
        `- Composition & Framing (MUST look distinctly different from other scenes): ${shotRule} (variation #${Number(variationIndex || 1)}).`,
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
        `Audience mode: ${safeAudience} (scene #${Number(sceneOrder || 1)})`,
        `Scene visual brief: ${String(promptVisual3D || '')}`,
        `Exact narration for this shot: ${String(narration || '')}`,
        `Return ONLY the raw \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">...</svg>\` code with zero markdown prose outside it.`,
      ].join('\n');

      const ai = getAiClient();
      const response = await generateTextContent(ai, {
        contents: artPrompt,
      });

      const rawText = (response.text ?? '').trim();
      const safeSvg = extractAndSanitizeSvg(rawText);
      const base64Svg = Buffer.from(safeSvg, 'utf-8').toString('base64');

      res.json({
        imageDataUrl: `data:image/svg+xml;base64,${base64Svg}`,
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Generación unificada por lote (hasta 4 escenas en UNA sola llamada JSON para evitar errores 429)
  app.post('/api/generate-all-scene-art', async (req, res) => {
    try {
      const { scenes, style3D, audience, aspectRatio } = req.body ?? {};
      if (!Array.isArray(scenes) || scenes.length === 0) {
        res.status(400).json({ error: 'Se requiere al menos una escena para ilustrar.' });
        return;
      }

      const safeScenes = scenes.slice(0, 4);
      const styleKey = String(style3D || 'soft_storybook');
      const styleDesc = STYLE_LABELS[styleKey] ?? STYLE_LABELS.soft_storybook;
      const safeAudience = String(audience || 'general');
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
                svg: {
                  type: Type.STRING,
                  description: `Complete self-contained valid SVG markup starting with <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"> and ending with </svg>`,
                },
              },
              required: ['sceneId', 'svg'],
            },
          },
        },
        required: ['items'],
      };

      const sceneSpecs = safeScenes.map((s: Record<string, unknown>, idx: number) => ({
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

      const ai = getAiClient();
      const response = await generateTextContent(ai, {
        contents: batchPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: batchArtSchema,
        },
      });

      const parsed = JSON.parse((response.text ?? '').trim());
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const imagesBySceneId: Record<string, string> = {};

      for (const item of items) {
        if (!item?.sceneId || typeof item?.svg !== 'string') continue;
        try {
          const safeSvg = extractAndSanitizeSvg(item.svg);
          const base64Svg = Buffer.from(safeSvg, 'utf-8').toString('base64');
          imagesBySceneId[String(item.sceneId)] = `data:image/svg+xml;base64,${base64Svg}`;
        } catch {
          // Omitir si alguna entrada vino malformada
        }
      }

      if (Object.keys(imagesBySceneId).length === 0) {
        throw new Error('No se pudieron construir las ilustraciones del lote. Intenta nuevamente.');
      }

      res.json({ imagesBySceneId });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/edit-scene-art', async (req, res) => {
    try {
      const { imageDataUrl, editInstruction, aspectRatio, style3D } = req.body ?? {};
      if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        res.status(400).json({ error: 'Selecciona o sube una imagen para editar.' });
        return;
      }
      if (!editInstruction || typeof editInstruction !== 'string' || !editInstruction.trim()) {
        res.status(400).json({ error: 'Escribe la instrucción de cambio que deseas aplicar.' });
        return;
      }

      const styleKey = String(style3D || 'soft_storybook');
      const styleDesc = STYLE_LABELS[styleKey] ?? STYLE_LABELS.soft_storybook;
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

      const ai = getAiClient();
      const isSvgInput = imageDataUrl.startsWith('data:image/svg+xml;base64,');

      let contents: unknown;
      if (isSvgInput) {
        const existingSvg = Buffer.from(
          imageDataUrl.replace('data:image/svg+xml;base64,', ''),
          'base64'
        ).toString('utf-8');
        contents = [
          `Edit this existing ${frameLabel} SVG illustration according to the user's instruction while preserving the recognizable core composition and upgrading visual richness.`,
          `User edit instruction: ${editInstruction.trim()}`,
          `Target art style: ${styleDesc}`,
          'RULES: Never include <text>, scripts, foreignObject, or external URLs. Output ONLY the complete updated raw `<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
            viewBox +
            '">...</svg>` markup.',
          'Current SVG:',
          existingSvg.slice(0, 18000),
        ].join('\n');
      } else {
        const dataMatch = imageDataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
        if (!dataMatch) {
          res.status(400).json({
            error: 'Formato de imagen no compatible. Usa PNG, JPG, WEBP o una ilustración del estudio.',
          });
          return;
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
                'RULES: Keep the main subject and mood recognizable from the photo while visibly applying the edit. Use layered gradients, lighting, and ~45-75 clean vector paths/shapes. NEVER include <text>, words, scripts, or external URLs. Return ONLY the raw `<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
                  viewBox +
                  '">...</svg>` code.',
              ].join('\n'),
            },
          ],
        };
      }

      const response = await generateTextContent(ai, {
        contents: contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
      });

      const safeSvg = extractAndSanitizeSvg((response.text ?? '').trim());
      const base64Svg = Buffer.from(safeSvg, 'utf-8').toString('base64');

      res.json({
        imageDataUrl: `data:image/svg+xml;base64,${base64Svg}`,
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 100% Free Local Speech Synthesizer (ZERO Gemini TTS calls, ZERO quota errors)
  function splitTextForFreeTts(input: string, maxLen = 175): string[] {
    const clean = input.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const sentences = clean.split(/(?<=[.!?…,:;])\s+/);
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + ' ' + sentence).trim().length <= maxLen) {
        current = (current + ' ' + sentence).trim();
      } else {
        if (current) chunks.push(current);
        if (sentence.length <= maxLen) {
          current = sentence;
        } else {
          const words = sentence.split(' ');
          let part = '';
          for (const w of words) {
            if ((part + ' ' + w).trim().length <= maxLen) {
              part = (part + ' ' + w).trim();
            } else {
              if (part) chunks.push(part);
              part = w;
            }
          }
          current = part;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  async function synthesizeFreeSpeechChunk(chunk: string, langCode: string): Promise<Buffer> {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${encodeURIComponent(langCode)}&client=tw-ob`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!resp.ok) {
      throw new Error(`TTS chunk HTTP ${resp.status}`);
    }
    const arr = await resp.arrayBuffer();
    return Buffer.from(arr);
  }

  app.post('/api/generate-audio', async (req, res) => {
    const tmpDir = path.join(os.tmpdir(), `corte30-tts-${crypto.randomUUID()}`);
    try {
      const { text, voiceName, language } = req.body ?? {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Se requiere el texto de narración para generar el audio.' });
        return;
      }

      const safeVoice = VALID_VOICES.has(String(voiceName)) ? String(voiceName) : 'Kore';
      const langCode =
        language === 'en' ? 'en' : language === 'pt' ? 'pt-BR' : safeVoice === 'Zephyr' ? 'es-ES' : 'es';

      const chunks = splitTextForFreeTts(text.trim(), 175);
      const buffers: Buffer[] = [];
      for (const chunk of chunks) {
        const buf = await synthesizeFreeSpeechChunk(chunk, langCode);
        if (buf.length > 0) buffers.push(buf);
      }

      if (buffers.length === 0) {
        res.status(200).json({ audioDataUrl: '', source: 'local_empty' });
        return;
      }

      const rawCombined = Buffer.concat(buffers);

      // Perfilado acústico por personaje con ffmpeg (Lucía, Mateo, Sofía, Diego, Bruno)
      const voiceProfiles: Record<string, { pitch: number; tempo: number }> = {
        Kore: { pitch: 1.03, tempo: 1.03 }, // Lucía · Natural femenina
        Zephyr: { pitch: 1.08, tempo: 0.96 }, // Sofía · Cálida familiar
        Puck: { pitch: 0.88, tempo: 1.06 }, // Mateo · Amigo espontáneo
        Charon: { pitch: 0.79, tempo: 0.97 }, // Diego · Sereno y grave
        Fenrir: { pitch: 0.84, tempo: 1.08 }, // Bruno · Ágil conversacional
      };
      const shaping = voiceProfiles[safeVoice] ?? voiceProfiles.Kore;

      let finalMp3 = rawCombined;
      try {
        await fs.promises.mkdir(tmpDir, { recursive: true });
        const inPath = path.join(tmpDir, 'raw.mp3');
        const outPath = path.join(tmpDir, 'shaped.mp3');
        await fs.promises.writeFile(inPath, rawCombined);

        // Compensar cambio de duración producido por asetrate usando atempo y exportar a 48 kHz Estéreo de estudio
        const baseSampleRate = 24000;
        const targetRate = Math.round(baseSampleRate * shaping.pitch);
        const compensatedTempo = Number((shaping.tempo / shaping.pitch).toFixed(3));
        const clampedTempo = Math.min(1.65, Math.max(0.65, compensatedTempo));
        const filter = `aresample=${baseSampleRate},asetrate=${targetRate},aresample=48000,atempo=${clampedTempo},highpass=f=85,lowpass=f=8200,loudnorm=I=-15:TP=-1.2:LRA=9`;

        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-i',
            inPath,
            '-af',
            filter,
            '-ar',
            '48000',
            '-ac',
            '2',
            '-c:a',
            'libmp3lame',
            '-b:a',
            '192k',
            outPath,
          ],
          { timeout: 15000 }
        );
        const shaped = await fs.promises.readFile(outPath);
        if (shaped.length > 512) {
          finalMp3 = shaped;
        }
      } catch {
        // Si ffmpeg falla en algún filtro, usar el MP3 concatenado original sin interrumpir
      } finally {
        void fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }

      res.json({
        audioDataUrl: `data:audio/mpeg;base64,${finalMp3.toString('base64')}`,
        source: 'local_synth',
      });
    } catch {
      void fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      res.status(200).json({
        audioDataUrl: '',
        source: 'browser_tts',
      });
    }
  });

  app.post('/api/trends', async (req, res) => {
    try {
      const { region, category } = req.body ?? {};
      const targetRegion = String(region || 'Hispanoamérica y EE.UU. (Mercado Bilingüe)');
      const targetCategory = String(category || 'Historias 3D virales y nichos de alto RPM');

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

      const ai = getAiClient();
      const response = await generateTextContent(ai, {
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        throw new Error('No se pudieron obtener tendencias actualizadas en este momento.');
      }

      const jsonText = extractJsonString(rawText);
      const parsed = JSON.parse(jsonText);

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const seenUris = new Set<string>();
      const fuentes: Array<{ title: string; uri: string }> = [];

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

      res.json({
        result: {
          actualizadoEn: new Date().toISOString(),
          region: targetRegion,
          categoria: targetCategory,
          resumenMercado: String(parsed.resumenMercado || ''),
          tendencias: Array.isArray(parsed.tendencias) ? parsed.tendencias : [],
          fuentes,
        },
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/refine-scene', async (req, res) => {
    try {
      const { scriptTitle, style3DLabel, guide3D, scene, instruction, prevNarration, nextNarration } =
        req.body ?? {};

      if (!scene || !instruction) {
        res.status(400).json({ error: 'Faltan datos de la escena o la instrucción de mejora.' });
        return;
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

      const ai = getAiClient();
      const response = await generateTextContent(ai, {
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: sceneSchema,
        },
      });

      const rawText = (response.text ?? '').trim();
      const updatedScene = JSON.parse(rawText);

      res.json({
        scene: {
          ...updatedScene,
          id: scene.id,
          orden: scene.orden,
          tiempoInicio: scene.tiempoInicio,
          tiempoFin: scene.tiempoFin,
          segundoInicio: scene.segundoInicio,
          segundoFin: scene.segundoFin,
          esGiro30s: scene.esGiro30s,
        },
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Conversión segura de WebM a MP4 universal (H.264 + AAC + faststart) para iPhone, TikTok, Reels y YouTube
  app.post(
    '/api/convert-mp4',
    express.raw({
      type: ['video/webm', 'video/mp4', 'application/octet-stream'],
      limit: '80mb',
    }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length < 128) {
        res.status(400).json({ error: 'Archivo de video inválido o vacío para convertir a MP4.' });
        return;
      }

      const token = crypto.randomUUID();
      const tmpDir = os.tmpdir();
      const inPath = path.resolve(tmpDir, `corte30-in-${token}.webm`);
      const outPath = path.resolve(tmpDir, `corte30-out-${token}.mp4`);

      // Verificar confinamiento estricto dentro del directorio temporal
      if (!inPath.startsWith(tmpDir + path.sep) || !outPath.startsWith(tmpDir + path.sep)) {
        res.status(400).json({ error: 'Ruta temporal inválida.' });
        return;
      }

      try {
        await fs.promises.writeFile(inPath, req.body);
        await execFileAsync(
          '/usr/bin/ffmpeg',
          [
            '-y',
            '-i',
            inPath,
            '-r',
            '30',
            '-vsync',
            'cfr',
            '-c:v',
            'libx264',
            '-profile:v',
            'high',
            '-level',
            '4.0',
            '-preset',
            'veryfast',
            '-crf',
            '22',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-ar',
            '48000',
            '-ac',
            '2',
            '-b:a',
            '192k',
            '-movflags',
            '+faststart',
            outPath,
          ],
          { timeout: 90_000, maxBuffer: 10 * 1024 * 1024 }
        );

        const mp4Buffer = await fs.promises.readFile(outPath);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', String(mp4Buffer.length));
        res.send(mp4Buffer);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? `No se pudo convertir a MP4 en el servidor: ${err.message}`
            : 'No se pudo convertir el video a MP4.';
        res.status(500).json({ error: msg });
      } finally {
        void fs.promises.unlink(inPath).catch(() => {});
        void fs.promises.unlink(outPath).catch(() => {});
      }
    }
  );

  // Doblaje y adaptación cultural a Inglés (RPM 3x-5x) o Portugués manteniendo todas las escenas e imágenes
  app.post('/api/translate-script', async (req, res) => {
    try {
      const { script, targetLanguage } = req.body ?? {};
      const lang = ['en', 'pt', 'es'].includes(String(targetLanguage))
        ? (String(targetLanguage) as 'en' | 'pt' | 'es')
        : null;

      if (!script || !Array.isArray(script.escenas) || script.escenas.length === 0 || !lang) {
        res.status(400).json({ error: 'Se requiere un guion válido y un idioma destino (en, pt o es).' });
        return;
      }

      const langLabel =
        lang === 'en'
          ? 'natural, engaging everyday American English (high-RPM US audience)'
          : lang === 'pt'
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
        tituloViral: String(script.tituloViral || ''),
        fraseApertura: String(script.ganchoInicial3Seg?.fraseApertura || ''),
        loopFinal: String(script.loopFinal || ''),
        titulosAlternativos: Array.isArray(script.metadatosPublicacion?.titulosAlternativos)
          ? script.metadatosPublicacion.titulosAlternativos
          : [],
        descripcionSeo: String(script.metadatosPublicacion?.descripcionSeo || ''),
        hashtags: Array.isArray(script.metadatosPublicacion?.hashtags)
          ? script.metadatosPublicacion.hashtags
          : [],
        escenas: script.escenas.map((s: Record<string, unknown>) => ({
          id: String(s.id || ''),
          narracion: String(s.narracion || ''),
          subtituloDinamico: String(s.subtituloDinamico || ''),
          palabraDestacada: String(s.palabraDestacada || ''),
        })),
      };

      const prompt = [
        `Adapt and translate this video script into ${langLabel}.`,
        'Make it sound like a native top creator speaking naturally to viewers (never stiff literal translation).',
        'Keep the EXACT same scene IDs, similar spoken length per scene, punchy 3-6 word uppercase dynamic subtitles, and 1-2 exact highlight words inside each subtituloDinamico.',
        'Input JSON:',
        JSON.stringify(compactInput),
      ].join('\n');

      const ai = getAiClient();
      const response = await generateTextContent(ai, {
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: translationSchema,
        },
      });

      const translated = JSON.parse((response.text ?? '').trim());
      const translatedById = new Map<string, Record<string, string>>();
      if (Array.isArray(translated.escenas)) {
        for (const item of translated.escenas) {
          if (item?.id) translatedById.set(String(item.id), item);
        }
      }

      const mergedScenes = script.escenas.map((orig: Record<string, unknown>, idx: number) => {
        const hit =
          translatedById.get(String(orig.id)) ??
          (Array.isArray(translated.escenas) ? translated.escenas[idx] : null);
        return {
          ...orig,
          narracion: String(hit?.narracion || orig.narracion || ''),
          subtituloDinamico: String(hit?.subtituloDinamico || orig.subtituloDinamico || ''),
          palabraDestacada: String(hit?.palabraDestacada || orig.palabraDestacada || ''),
        };
      });

      res.json({
        script: {
          ...script,
          id: `script-${lang}-${Date.now()}`,
          creadoEn: new Date().toISOString(),
          idioma: lang,
          tituloViral: String(translated.tituloViral || script.tituloViral),
          ganchoInicial3Seg: {
            ...script.ganchoInicial3Seg,
            fraseApertura: String(
              translated.fraseApertura || script.ganchoInicial3Seg?.fraseApertura || ''
            ),
          },
          loopFinal: String(translated.loopFinal || script.loopFinal || ''),
          metadatosPublicacion: {
            titulosAlternativos:
              Array.isArray(translated.titulosAlternativos) &&
              translated.titulosAlternativos.length > 0
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
        },
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Generador de Modo Serie / Temporada con SagaBible persistente + Micro-Recap opcional de 2s
  app.post('/api/generate-series-next', async (req, res) => {
    try {
      const previousScript = req.body?.previousScript ?? req.body?.script;
      const sagaBible = req.body?.sagaBible;
      const includeMicroRecap = Boolean(req.body?.includeMicroRecap);

      if (!previousScript || !previousScript.tituloViral) {
        res.status(400).json({ error: 'Se requiere un guion base para crear la siguiente parte de la serie.' });
        return;
      }

      const prevPart = Number(previousScript.episodeNumber || previousScript.serieNumero) || 1;
      const nextPart = prevPart + 1;
      const safeDuration = [30, 60, 90, 120, 180].includes(Number(previousScript.duracionSegundos))
        ? Number(previousScript.duracionSegundos)
        : 90;
      const safeAspectRatio = String(previousScript.formatoVideo) === '16:9' ? '16:9' : '9:16';
      const frameFormatText =
        safeAspectRatio === '16:9' ? '16:9 horizontal widescreen' : '9:16 vertical';
      const resolvedBlueprint = resolveServerNarrativeBlueprint(
        previousScript.narrativeBlueprint,
        String(previousScript.nicho || ''),
        String(previousScript.publicoObjetivo || 'general')
      );
      const blueprintDirective = BLUEPRINT_DIRECTIVES[resolvedBlueprint] ?? '';

      const prevSummary = Array.isArray(previousScript.escenas)
        ? previousScript.escenas
            .map((s: Record<string, unknown>) => String(s.narracion || ''))
            .join(' ')
            .slice(0, 1200)
        : String(previousScript.premisa || '');

      const fallbackStyleStr = String(
        previousScript.guiaEstilo3D ||
          STYLE_LABELS[String(previousScript.estilo3D || 'soft_storybook')] ||
          ''
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

      const userPrompt = [
        `Saga / Serie: "${String(sagaBible?.title || previousScript.serieTitulo || previousScript.tituloViral)}"`,
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

      const ai = getAiClient();
      const response = await generateTextContent(ai, {
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: scriptResponseSchema,
        },
      });

      const parsed = JSON.parse(extractJsonString((response.text ?? '').trim()));
      const finalVisualBible =
        inheritedBible ??
        normalizeVisualBible(
          parsed.visualBible,
          String(previousScript.guiaEstilo3D || STYLE_LABELS.soft_storybook)
        );
      const rawScenes = Array.isArray(parsed.escenas) ? parsed.escenas : [];
      const normalizedScenes = enforceMicroSceneBeats(
        rawScenes,
        safeDuration,
        finalVisualBible,
        String(previousScript.guiaEstilo3D || STYLE_LABELS.soft_storybook),
        `Continuación Episodio ${nextPart}`
      );
      const retentionAudit = normalizeRetentionAudit(parsed.retentionAudit, normalizedScenes);
      const sagaMemoryUpdate = normalizeSagaMemoryUpdate(parsed.sagaMemoryUpdate);

      res.json({
        script: {
          ...parsed,
          visualBible: finalVisualBible,
          narrativeBlueprint: resolvedBlueprint,
          retentionAudit,
          ...(sagaMemoryUpdate ? { sagaMemoryUpdate } : {}),
          sagaId: String(sagaBible?.sagaId || previousScript.sagaId || `saga-${Date.now()}`),
          episodeNumber: nextPart,
          escenas: normalizedScenes,
          id: `script-ep${nextPart}-${Date.now()}`,
          creadoEn: new Date().toISOString(),
          premisa: `Episodio ${nextPart} de la saga: ${String(sagaBible?.title || previousScript.serieTitulo || previousScript.tituloViral)}`,
          nicho: String(previousScript.nicho || 'Serie'),
          publicoObjetivo: previousScript.publicoObjetivo || 'general',
          duracionSegundos: safeDuration,
          estilo3D: previousScript.estilo3D || 'soft_storybook',
          plataforma: previousScript.plataforma || 'tiktok_creativity',
          formatoVideo: safeAspectRatio,
          vozPreferidaId: previousScript.vozPreferidaId,
          idioma: previousScript.idioma || 'es',
          serieNumero: nextPart,
          serieTitulo: String(sagaBible?.title || previousScript.serieTitulo || previousScript.tituloViral),
        },
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Optimizador quirúrgico Módulo 2: regenera ÚNICAMENTE los beats débiles sin tocar el resto del guion
  app.post('/api/optimize-weak-beats', async (req, res) => {
    try {
      const { script, weakBeatIndices } = req.body ?? {};
      if (!script || !Array.isArray(script.escenas) || script.escenas.length === 0) {
        res.status(400).json({ error: 'Se requiere un guion válido con micro-escenas para optimizar.' });
        return;
      }

      const targetIndices: number[] = Array.isArray(weakBeatIndices)
        ? Array.from(
            new Set(
              weakBeatIndices
                .map((n: unknown) => Number(n))
                .filter((n: number) => Number.isInteger(n) && n >= 0 && n < script.escenas.length)
            )
          ).slice(0, 6)
        : [];

      if (targetIndices.length === 0) {
        res.status(400).json({ error: 'No se indicaron beats débiles para optimizar.' });
        return;
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
                index: { type: Type.INTEGER, description: 'Índice 0-based exacto del beat optimizado' },
                narracion: {
                  type: Type.STRING,
                  description: 'Nueva narración de 8 a 12 palabras con alto gancho, tensión o dato concreto (cero clichés)',
                },
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

      const fullContext = script.escenas.map((sc: Record<string, unknown>, idx: number) => ({
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

      const ai = getAiClient();
      const response = await generateTextContent(ai, {
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: optimizeSchema,
        },
      });

      const parsed = JSON.parse(extractJsonString((response.text ?? '').trim()));
      const patches = Array.isArray(parsed.optimizedBeats) ? parsed.optimizedBeats : [];
      const patchByIndex = new Map<number, Record<string, unknown>>();
      for (const p of patches) {
        const idx = Number(p?.index);
        if (targetIndices.includes(idx)) {
          patchByIndex.set(idx, p);
        }
      }

      const mergedScenes = script.escenas.map((orig: Record<string, unknown>, idx: number) => {
        const patch = patchByIndex.get(idx);
        if (!patch) return orig;

        const prevShot = idx > 0 ? String(script.escenas[idx - 1]?.shotType || '') : '';
        const nextShot =
          idx < script.escenas.length - 1 ? String(script.escenas[idx + 1]?.shotType || '') : '';
        let nextShotType = VALID_SHOT_TYPES.has(String(patch.shotType || ''))
          ? (String(patch.shotType) as ServerShotType)
          : SHOT_TYPE_CYCLE[idx % SHOT_TYPE_CYCLE.length];
        if (nextShotType === prevShot || nextShotType === nextShot) {
          const alt = SHOT_TYPE_CYCLE.find((st) => st !== prevShot && st !== nextShot);
          if (alt) nextShotType = alt;
        }

        const narr = String(patch.narracion || orig.narracion || '').trim();
        const kwList = Array.isArray(patch.visualKeywords)
          ? patch.visualKeywords.map((x: unknown) => String(x || '').trim()).filter(Boolean).slice(0, 4)
          : Array.isArray(orig.visualKeywords)
            ? (orig.visualKeywords as string[])
            : [];
        const role = VALID_RETENTION_ROLES.has(String(patch.retentionRole || ''))
          ? String(patch.retentionRole)
          : String(orig.retentionRole || 'escalation');
        const pacing = normalizePacingProfile(patch.pacingProfile, role, Boolean(orig.esGiro30s));
        const foley = VALID_FOLEY_CUES.has(String(patch.foleyCue || ''))
          ? String(patch.foleyCue)
          : String(orig.foleyCue || 'whoosh_cut');
        const motion = VALID_CAMERA_MOTIONS.has(String(patch.cameraMotion || ''))
          ? String(patch.cameraMotion)
          : String(orig.cameraMotion || 'dolly_in');
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

      res.json({
        escenas: mergedScenes,
        retentionAudit: updatedAudit,
        optimizedIndices: Array.from(patchByIndex.keys()),
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/generate-flow-prompts', async (req, res) => {
    try {
      const { script, aspectRatio } = req.body ?? {};
      if (!script || !Array.isArray(script.escenas) || script.escenas.length === 0) {
        res.status(400).json({ error: 'Se requiere un guion con escenas para optimizar los prompts de Google Flow.' });
        return;
      }

      const ratioStr = aspectRatio === '16:9' ? '16:9 horizontal widescreen' : '9:16 vertical short-form (TikTok/Shorts/Reels)';
      const chosenStyleKey = String(script.estilo3D || 'soft_storybook');
      const chosenStyleDesc = STYLE_LABELS[chosenStyleKey] ?? STYLE_LABELS.soft_storybook;
      const scenesDigest = script.escenas
        .map((sc: Record<string, unknown>) => {
          const vs =
            sc.visualSpec && typeof sc.visualSpec === 'object'
              ? (sc.visualSpec as Record<string, unknown>)
              : null;
          const vsLine = vs
            ? `\n- VisualSpec: env=${String(vs.environment || '')}, subject=${String(vs.mainSubject || '')}, prop=${String(vs.propIcon || '')}, mood=${String(vs.moodPalette || '')}`
            : '';
          return `Scene ${sc.orden} (id: "${sc.id}", phase: "${sc.fase}", camera: "${sc.movimientoCamara}"):\n- Narration (ES): ${sc.narracion}\n- Visual base: ${sc.promptVisual3D}${vsLine}`;
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
        `Video title: "${String(script.tituloViral || '')}"`,
        `User's exact core premise: "${String(script.premisa || '')}"`,
        `Chosen visual style (MUST follow strictly): ${chosenStyleDesc}`,
        `Target framing: ${ratioStr}`,
        'STRICT RULES FOR EVERY PROMPT:',
        '- Illustrate ONLY the exact action, setting, numbers, anatomy, objects, and emotion described in THAT scene narration and visualSpec. NEVER inject unrelated generic elements (no random crowds, Roman senators, or speakers unless the scene explicitly calls for them).',
        '- Make every scene visually distinct in setting, focal object, lighting palette, and camera framing so consecutive clips show clear progression.',
        '- Specify rich volumetric 3D lighting, depth of field, tactile shaders, and continuous dynamic camera motion (tracking, dolly push-in, POV, orbital pan — zero static frames).',
        '- Explicitly include vertical 9:16 (or 16:9 widescreen) composition and "no on-screen text, no watermarks".',
        'Return strictly valid JSON with one specific English prompt (65-95 words each) for EVERY sceneId listed below:',
        scenesDigest,
      ].join('\n');

      const ai = getAiClient();
      const response = await generateTextContent(ai, {
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: flowSchema,
        },
      });

      const parsed = JSON.parse((response.text ?? '').trim());
      const list = Array.isArray(parsed.prompts) ? parsed.prompts : [];
      const promptsBySceneId: Record<string, string> = {};
      for (const item of list) {
        if (item?.sceneId && typeof item.promptEn === 'string' && item.promptEn.trim()) {
          promptsBySceneId[String(item.sceneId)] = item.promptEn.trim();
        }
      }

      res.json({ promptsBySceneId });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/random-idea', async (_req, res) => {
    try {
      const randomIdeaSchema = {
        type: Type.OBJECT,
        properties: {
          premise: {
            type: Type.STRING,
            description:
              'Premisa viral en español en 1 o 2 frases con gancho inmediato para video corto monetizable',
          },
          niche: { type: Type.STRING },
          audience: {
            type: Type.STRING,
            description: 'Uno de: viral_meme, educational, suspense, general',
          },
          style3D: {
            type: Type.STRING,
            description:
              'Uno de: viral_meme_3d, pixar_dark, paper_diorama, ue5_realism, flat_kids, stylized_thriller',
          },
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

      const ai = getAiClient();
      const response = await generateTextContent(ai, {
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: randomIdeaSchema,
        },
      });

      const parsed = JSON.parse((response.text ?? '').trim());
      const validAudiences = new Set(['viral_meme', 'educational', 'suspense', 'general', 'kids']);
      const validStyles = new Set([
        'viral_meme_3d',
        'pixar_dark',
        'paper_diorama',
        'ue5_realism',
        'flat_kids',
        'stylized_thriller',
        'soft_storybook',
        'clay_suspense',
      ]);

      res.json({
        premise: String(parsed.premise || '').trim(),
        niche: String(parsed.niche || 'Idea Aleatoria Viral').trim(),
        audience: validAudiences.has(parsed.audience) ? parsed.audience : 'viral_meme',
        style3D: validStyles.has(parsed.style3D) ? parsed.style3D : 'viral_meme_3d',
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Caché LRU en memoria para imágenes verificadas de Pollinations (evita llamadas repetidas y límites de tasa)
  const pollinationsImageCache = new Map<
    string,
    { buf: Buffer; contentType: string; cachedAt: number }
  >();
  const MAX_POLLINATIONS_CACHE = 200;

  // Proxy ligero CORS-safe para imágenes gratuitas de Pollinations con caché y detección estricta de 429
  app.get('/api/pollinations-image', async (req, res) => {
    try {
      const rawPrompt = String(req.query.prompt || '').trim();
      if (!rawPrompt) {
        res.status(400).json({ error: 'Se requiere prompt para generar la imagen.' });
        return;
      }
      const prompt = rawPrompt.slice(0, 420);
      const width = Math.min(1280, Math.max(256, Number(req.query.width) || 720));
      const height = Math.min(1280, Math.max(256, Number(req.query.height) || 1280));
      const seed = Math.max(1, Math.min(9999999, Math.floor(Number(req.query.seed) || 4242)));
      const nocache = String(req.query.nocache || '') === '1';
      const cacheKey = `${width}x${height}:${seed}:${prompt}`;

      if (nocache) {
        pollinationsImageCache.delete(cacheKey);
      } else {
        const cached = pollinationsImageCache.get(cacheKey);
        if (cached && Date.now() - cached.cachedAt < 24 * 60 * 60 * 1000) {
          res.setHeader('Content-Type', cached.contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('X-Gortex-Cache', 'HIT');
          res.send(cached.buf);
          return;
        }
      }

      const upstreamUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35000);
      try {
        const upstream = await fetch(upstreamUrl, {
          signal: controller.signal,
          headers: {
            Accept: 'image/*',
            'User-Agent': 'Gortex-Studio/1.0',
          },
        });
        const contentType = (upstream.headers.get('content-type') || '').toLowerCase();

        if (upstream.status === 429 || upstream.status === 503) {
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Retry-After', '46');
          res.status(429).json({
            error: 'Límite temporal de Pollinations alcanzado. Reintentando en 46 segundos.',
            retryAfterSec: 46,
          });
          return;
        }
        if (!upstream.ok || !contentType.startsWith('image/')) {
          res.setHeader('Cache-Control', 'no-store');
          res.status(502).json({ error: 'No se pudo obtener la imagen AI en este momento.' });
          return;
        }

        const arrayBuf = await upstream.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        if (buf.length < 4096) {
          res.setHeader('Cache-Control', 'no-store');
          res.status(429).json({
            error: 'Respuesta de imagen incompleta o limitada. Reintentando en 46 segundos.',
            retryAfterSec: 46,
          });
          return;
        }

        if (pollinationsImageCache.size >= MAX_POLLINATIONS_CACHE) {
          const oldestKey = pollinationsImageCache.keys().next().value;
          if (oldestKey) pollinationsImageCache.delete(oldestKey);
        }
        pollinationsImageCache.set(cacheKey, {
          buf,
          contentType,
          cachedAt: Date.now(),
        });

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Gortex-Cache', 'MISS');
        res.send(buf);
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      res.status(502).json({ error: 'Tiempo de espera agotado al obtener la imagen AI.' });
    }
  });

  // Barrera estricta JSON para evitar que rutas /api/* o /models/* caigan en el fallback SPA (index.html <!doctype html>)
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: `Ruta API no encontrada: ${req.method} ${req.originalUrl}`,
    });
  });

  app.all('/models/*', (req, res) => {
    res.status(404).json({
      error: `Ruta local de modelos deshabilitada (${req.originalUrl}). Usa descarga remota en caché del navegador.`,
    });
  });

  // Middleware global de errores JSON en Express (evita páginas HTML en PayloadTooLargeError o JSON inválido)
  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      if (req.path.startsWith('/api/') || req.path.startsWith('/models/')) {
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? Number((err as { status?: number }).status) || 500
            : typeof err === 'object' && err !== null && 'statusCode' in err
              ? Number((err as { statusCode?: number }).statusCode) || 500
              : 500;
        const message =
          status === 413
            ? 'El contenido enviado supera el límite permitido por el servidor.'
            : err instanceof Error
              ? err.message
              : 'Error interno procesando la solicitud.';
        res.status(status).json({ error: message });
        return;
      }
      next(err);
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gortex server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
