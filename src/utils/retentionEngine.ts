import type {
  AudienceId,
  BeatPacingProfile,
  BeatRetentionRole,
  BeatV2,
  CameraMotionPreset,
  FoleyCueType,
  NarrativeBlueprint,
  NarrativeBlueprintSelection,
  ScriptScene,
  ShotType,
  ViralScript,
} from '../types';

export interface NarrativeBlueprintOption {
  id: NarrativeBlueprintSelection;
  label: string;
  shortLabel: string;
  description: string;
  cadenceHint: string;
}

export const VIRAL_BLUEPRINTS: NarrativeBlueprintOption[] = [
  {
    id: 'auto',
    label: 'Automático según nicho',
    shortLabel: 'Auto',
    description: 'Selecciona el blueprint de mayor retención según tu tema y público.',
    cadenceHint: 'Adaptativo',
  },
  {
    id: 'pov_immersive',
    label: 'POV Inmersivo',
    shortLabel: 'POV Inmersivo',
    description: 'Primera persona presente: mete al espectador dentro de la crisis en 0:00.',
    cadenceHint: 'Tensión sensorial',
  },
  {
    id: 'classified_mystery',
    label: 'Misterio Clasificado',
    shortLabel: 'Archivo Secreto',
    description: 'Expediente real con fechas exactas, anomalías técnicas y evidencia sin explicar.',
    cadenceHint: 'Forense / HUD',
  },
  {
    id: 'historical_what_if',
    label: 'What If Histórico',
    shortLabel: 'What If',
    description: 'Choque contrafactual extremo con consecuencias físicas en cadena.',
    cadenceHint: 'Reacción rápida',
  },
  {
    id: 'escalation_ladder',
    label: 'Escalera de Escalada',
    shortLabel: 'Escalada',
    description: 'Niveles crecientes (de lo sutil a lo irreversible) con un golpe por peldaño.',
    cadenceHint: 'Progresivo',
  },
  {
    id: 'psychological_lore',
    label: 'Lore Psicológico',
    shortLabel: 'Psicológico',
    description: 'Inquietud mental íntima, paradojas perceptivas y revelación introspectiva.',
    cadenceHint: 'Hipnótico / Pausas',
  },
];

export const COMMERCIAL_BLUEPRINTS: NarrativeBlueprintOption[] = [
  {
    id: 'real_estate_tour',
    label: 'Recorrido Inmobiliario',
    shortLabel: 'Tour Inmueble',
    description: 'Gancho visual con dato diferencial -> recorrido espacio por espacio -> ficha técnica -> CTA de visita.',
    cadenceHint: 'Editorial / Gimbal',
  },
  {
    id: 'local_business_ad',
    label: 'Anuncio de Negocio Local',
    shortLabel: 'Negocio Local',
    description: 'Problema o deseo cotidiano -> atmósfera del lugar -> producto/servicio estrella -> horario, ubicación y CTA.',
    cadenceHint: 'Conversión Local',
  },
  {
    id: 'commercial_promo',
    label: 'Promo / Oferta Comercial',
    shortLabel: 'Promo / Oferta',
    description: 'Propuesta de valor directa -> prueba visual del espacio o producto -> beneficio de oferta -> CTA inmediato.',
    cadenceHint: 'Directo / Oferta',
  },
];

export const NARRATIVE_BLUEPRINTS: NarrativeBlueprintOption[] = [
  ...VIRAL_BLUEPRINTS,
  ...COMMERCIAL_BLUEPRINTS,
];

export const SHOT_TYPE_LABELS: Record<ShotType, string> = {
  WIDE_ESTABLISHING: 'Plano General',
  MEDIUM_ACTION: 'Plano Medio',
  CLOSE_UP_EMOTION: 'Primer Plano',
  EXTREME_CLOSE_UP: 'Macro / Detalle',
  LOW_ANGLE_DRAMATIC: 'Contrapicado',
  OVER_THE_SHOULDER: 'Sobre el Hombro',
  POV_FIRST_PERSON: 'Subjetivo POV',
};

export const CAMERA_MOTION_LABELS: Record<CameraMotionPreset, string> = {
  dolly_in: 'Dolly In',
  dolly_out: 'Dolly Out',
  orbit_left: 'Órbita Izq',
  orbit_right: 'Órbita Der',
  handheld_tension: 'Cámara en Mano',
  rack_focus_reveal: 'Rack Focus',
  push_impact: 'Push Impacto',
};

export const FOLEY_CUE_LABELS: Record<FoleyCueType, string> = {
  none: 'Sin cue',
  sub_drop: 'Sub Drop',
  riser_tension: 'Riser Tensión',
  hud_click: 'HUD Click',
  whoosh_cut: 'Whoosh Cut',
  heartbeat: 'Latido',
  thunder_impact: 'Impacto Trueno',
  analog_glitch: 'Glitch Analógico',
};

export const RETENTION_ROLE_LABELS: Record<BeatRetentionRole, string> = {
  hook: 'Gancho',
  setup: 'Setup',
  escalation: 'Escalada',
  re_hook: 'Re-Hook',
  climax: 'Clímax',
  loop_close: 'Loop',
};

export const DEFAULT_SHOT_CYCLE: ShotType[] = [
  'WIDE_ESTABLISHING',
  'EXTREME_CLOSE_UP',
  'LOW_ANGLE_DRAMATIC',
  'OVER_THE_SHOULDER',
  'CLOSE_UP_EMOTION',
  'MEDIUM_ACTION',
  'POV_FIRST_PERSON',
];

const AI_CLICHE_PATTERNS: RegExp[] = [
  /\ben un mundo donde\b/i,
  /\ben el mundo de hoy\b/i,
  /\b¿?alguna vez te has preguntado\b/i,
  /\bprep[aá]rate para\b/i,
  /\bacomp[aá][ñn]ame a descubrir\b/i,
  /\bhoy vamos a ver\b/i,
  /\ben este video te contar[eé]\b/i,
  /\bimagina un mundo\b/i,
  /\bhola amigos\b/i,
  /\bbienvenidos\b/i,
  /\bqu[eé]date hasta el final\b/i,
  /\b¿?sab[ií]as que\b/i,
  /\bdescubre un oasis de lujo\b/i,
  /\bno te pierdas esta oportunidad [uú]nica\b/i,
  /\bel hogar de tus sue[ñn]os\b/i,
];

export function resolveAutoBlueprint(niche: string, audience: AudienceId): NarrativeBlueprint {
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

export function getBlueprintInfo(id?: NarrativeBlueprintSelection): NarrativeBlueprintOption {
  return NARRATIVE_BLUEPRINTS.find((b) => b.id === id) ?? NARRATIVE_BLUEPRINTS[0];
}

export function getEffectivePacingProfile(scene?: ScriptScene): BeatPacingProfile {
  const p = scene?.pacingProfile;
  const speed =
    typeof p?.speedMultiplier === 'number' && Number.isFinite(p.speedMultiplier)
      ? Math.max(0.85, Math.min(1.25, p.speedMultiplier))
      : 1.0;
  const prePauseMs =
    typeof p?.prePauseMs === 'number' && Number.isFinite(p.prePauseMs)
      ? Math.max(0, Math.min(450, Math.round(p.prePauseMs)))
      : 0;
  const musicDuckLevel =
    typeof p?.musicDuckLevel === 'number' && Number.isFinite(p.musicDuckLevel)
      ? Math.max(0.05, Math.min(0.25, p.musicDuckLevel))
      : 0.12;
  return { speedMultiplier: speed, prePauseMs, musicDuckLevel };
}

export function toBeatV2(scene: ScriptScene, index: number, total: number): BeatV2 {
  const pacing = getEffectivePacingProfile(scene);
  const defaultRole: BeatRetentionRole =
    index === 0
      ? 'hook'
      : index === total - 1
        ? 'loop_close'
        : scene.esGiro30s
          ? 're_hook'
          : index >= total - 2
            ? 'climax'
            : index <= 2
              ? 'setup'
              : 'escalation';

  return {
    id: scene.id,
    index,
    narration: scene.narracion,
    wordTags: Array.isArray(scene.wordTags) ? scene.wordTags : [],
    visualPrompt: scene.imagePrompt || scene.promptVisual3D,
    shotType: scene.shotType ?? DEFAULT_SHOT_CYCLE[index % DEFAULT_SHOT_CYCLE.length],
    cameraMotion: scene.cameraMotion ?? (index % 2 === 0 ? 'dolly_in' : 'handheld_tension'),
    depthTitleText: scene.depthTitleText,
    hudData: scene.hudData,
    foleyCue: scene.foleyCue ?? (index === 0 || scene.esGiro30s ? 'sub_drop' : 'whoosh_cut'),
    pacingProfile: pacing,
    worldStateDelta: scene.worldStateDelta ?? '',
    retentionRole: scene.retentionRole ?? defaultRole,
  };
}

export interface WeakBeatDiagnosis {
  index: number;
  sceneId: string;
  orden: number;
  score: number;
  reasons: string[];
}

export interface PredictiveRetentionReport {
  overallScore: number;
  hookVelocityScore: number;
  pacingScore: number;
  visualVarietyScore: number;
  patternInterruptScore: number;
  loopScore: number;
  reHookBeatIndex: number;
  reHookInTargetBand: boolean;
  consecutiveShotDuplicates: number;
  patternInterruptGaps: number;
  loopSeamText: string;
  patternInterruptSummary: string;
  weakBeats: WeakBeatDiagnosis[];
  totalWords: number;
  avgWordsPerBeat: number;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Evaluador determinista de Retención Predictiva (0–100):
 * combina `script.retentionAudit` (cuando existe) con reglas objetivas locales sobre
 * conteo real de palabras por beat (8–12), variedad de `shotType`, densidad de HUD/foley,
 * ubicación del Re-Hook (35–45%) y sutura de loop entre el beat final y el Beat 1.
 */
export function evaluatePredictiveRetention(script: ViralScript): PredictiveRetentionReport {
  const scenes = script.escenas ?? [];
  const count = Math.max(1, scenes.length);
  const weakBeats: WeakBeatDiagnosis[] = [];

  const wordCounts = scenes.map((s) => countWords(s.narracion || ''));
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);
  const avgWordsPerBeat = Number((totalWords / count).toFixed(1));

  // 1) Hook Velocity Score (Beat 1)
  const firstNarr = (scenes[0]?.narracion || script.ganchoInicial3Seg?.fraseApertura || '').trim();
  const firstWords = countWords(firstNarr);
  const hasCliche = AI_CLICHE_PATTERNS.some((rx) => rx.test(firstNarr));
  let localHookScore = 88;
  if (hasCliche) localHookScore -= 32;
  if (firstWords < 5 || firstWords > 15) localHookScore -= 16;
  else if (firstWords >= 7 && firstWords <= 12) localHookScore += 6;
  if (/[0-9¿?!…]/.test(firstNarr)) localHookScore += 5;
  if (scenes[0]?.foleyCue && scenes[0].foleyCue !== 'none') localHookScore += 3;
  localHookScore = Math.max(25, Math.min(100, localHookScore));

  const auditHook = script.retentionAudit?.hookVelocityScore;
  const hookVelocityScore =
    typeof auditHook === 'number' && Number.isFinite(auditHook)
      ? Math.round(localHookScore * 0.6 + Math.max(0, Math.min(100, auditHook)) * 0.4)
      : localHookScore;

  // 2) Re-Hook (35% - 45% de los beats)
  const reHookMin = Math.max(1, Math.floor(count * 0.32));
  const reHookMax = Math.max(reHookMin, Math.ceil(count * 0.48));
  let detectedReHookIdx = scenes.findIndex(
    (s, idx) => idx >= 1 && idx < count - 1 && s.retentionRole === 're_hook'
  );
  if (detectedReHookIdx === -1) {
    detectedReHookIdx = scenes.findIndex(
      (s, idx) => idx >= reHookMin && idx <= reHookMax && s.esGiro30s
    );
  }
  if (
    detectedReHookIdx === -1 &&
    typeof script.retentionAudit?.reHookBeatIndex === 'number' &&
    script.retentionAudit.reHookBeatIndex >= 0 &&
    script.retentionAudit.reHookBeatIndex < count
  ) {
    detectedReHookIdx = script.retentionAudit.reHookBeatIndex;
  }
  const reHookInTargetBand =
    count <= 3 || (detectedReHookIdx >= reHookMin && detectedReHookIdx <= reHookMax);

  // 3) Variedad de planos (Shot Continuity Graph) & Pattern Interrupts
  let consecutiveShotDuplicates = 0;
  let patternInterruptGaps = 0;
  let beatsSinceInterrupt = 0;

  let goodWordCountBeats = 0;

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const prev = i > 0 ? scenes[i - 1] : null;
    const wc = wordCounts[i];
    const reasons: string[] = [];
    let beatScore = 92;

    if (wc < 6) {
      beatScore -= 18;
      reasons.push(`Muy corto (${wc} palabras; ideal 8–12)`);
    } else if (wc > 14) {
      beatScore -= 24;
      reasons.push(`Demasiado denso (${wc} palabras; recorta a 8–12)`);
    } else if (wc >= 8 && wc <= 12) {
      goodWordCountBeats += 1;
    } else {
      beatScore -= 6;
    }

    if (i === 0 && hasCliche) {
      beatScore -= 30;
      reasons.push('Usa cliché de apertura en 0:00');
    }

    if (prev && sc.shotType && prev.shotType && sc.shotType === prev.shotType) {
      consecutiveShotDuplicates += 1;
      beatScore -= 18;
      reasons.push(`Repite plano ${SHOT_TYPE_LABELS[sc.shotType]} consecutivo`);
    }

    const hasSignificantChange =
      i === 0 ||
      Boolean(sc.hudData?.value) ||
      Boolean(sc.foleyCue && sc.foleyCue !== 'none') ||
      Boolean(sc.esGiro30s) ||
      sc.retentionRole === 're_hook' ||
      sc.retentionRole === 'climax' ||
      Boolean(sc.pacingProfile && (sc.pacingProfile.prePauseMs >= 100 || Math.abs(sc.pacingProfile.speedMultiplier - 1) >= 0.08)) ||
      Boolean(prev && sc.shotType && prev.shotType && sc.shotType !== prev.shotType);

    if (hasSignificantChange) {
      beatsSinceInterrupt = 0;
    } else {
      beatsSinceInterrupt += 1;
      if (beatsSinceInterrupt > 2) {
        patternInterruptGaps += 1;
        beatScore -= 16;
        reasons.push('Más de 2 beats sin cambio visual/sonoro (pattern interrupt)');
      }
    }

    if (sc.wordTags && sc.wordTags.every((wt) => wt.style === 'normal') && wc >= 7) {
      beatScore -= 8;
      reasons.push('Sin énfasis semántico en subtítulos (wordTags)');
    }

    if (beatScore < 76 || reasons.length > 0) {
      weakBeats.push({
        index: i,
        sceneId: sc.id,
        orden: sc.orden,
        score: Math.max(20, beatScore),
        reasons,
      });
    }
  }

  const pacingScore = Math.max(
    35,
    Math.min(100, Math.round(55 + (goodWordCountBeats / count) * 45))
  );
  const visualVarietyScore = Math.max(
    40,
    Math.min(100, 100 - consecutiveShotDuplicates * 16)
  );
  const patternInterruptScore = Math.max(
    40,
    Math.min(100, 100 - patternInterruptGaps * 15 - (reHookInTargetBand ? 0 : 12))
  );

  // 4) Loop Seam Verification
  const lastNarr = (scenes[count - 1]?.narracion || script.loopFinal || '').trim();
  const lastWords = lastNarr.split(/\s+/).slice(-4).join(' ');
  const firstThreeWords = firstNarr.split(/\s+/).slice(0, 3).join(' ');
  const loopSeamText =
    script.retentionAudit?.loopSeamVerification && script.retentionAudit.loopSeamVerification.length > 6
      ? script.retentionAudit.loopSeamVerification
      : `"${lastWords}" → "${firstThreeWords}"`;

  const endsWithLoopBridge =
    /[…,;:]$/.test(lastNarr) ||
    /\b(y|que|porque|pero|cuando|por eso|as[ií]|entonces|justo|donde)\s*$/i.test(
      lastNarr.replace(/[.,!?…]+$/, '')
    ) ||
    Boolean(script.retentionAudit?.loopSeamVerification);
  const loopScore = endsWithLoopBridge ? 92 : 70;

  const overallScore = Math.max(
    30,
    Math.min(
      100,
      Math.round(
        hookVelocityScore * 0.28 +
          pacingScore * 0.24 +
          visualVarietyScore * 0.18 +
          patternInterruptScore * 0.18 +
          loopScore * 0.12
      )
    )
  );

  const patternInterruptSummary =
    script.retentionAudit?.patternInterruptCheck &&
    script.retentionAudit.patternInterruptCheck.length > 6
      ? script.retentionAudit.patternInterruptCheck
      : patternInterruptGaps === 0
        ? 'Ritmo verificado: cambios visuales/sonoros cada 1–2 beats.'
        : `${patternInterruptGaps} tramo(s) superan 2 beats sin cambio significativo.`;

  return {
    overallScore,
    hookVelocityScore,
    pacingScore,
    visualVarietyScore,
    patternInterruptScore,
    loopScore,
    reHookBeatIndex: detectedReHookIdx >= 0 ? detectedReHookIdx : Math.floor(count * 0.4),
    reHookInTargetBand,
    consecutiveShotDuplicates,
    patternInterruptGaps,
    loopSeamText,
    patternInterruptSummary,
    weakBeats: weakBeats.sort((a, b) => a.score - b.score).slice(0, 6),
    totalWords,
    avgWordsPerBeat,
  };
}
