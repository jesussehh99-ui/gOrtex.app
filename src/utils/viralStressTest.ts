import type {
  BeatEnergyMetric,
  SafeZoneAuditResult,
  SafeZonePlatform,
  ScriptScene,
  SubtitleConfig,
  VideoAspectRatio,
} from '../types';
import { extractSceneHudMetric } from './visualKeywords';

export interface SafeZoneBox {
  id: string;
  label: string;
  /** Coordenadas normalizadas [0..1] relativas al lienzo */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlatformSafeZoneSpec {
  id: Exclude<SafeZonePlatform, 'none'>;
  label: string;
  shortLabel: string;
  /** Límites verticales y derechos seguros (normalizados 0..1) */
  safeTop: number;
  safeBottom: number;
  safeRight: number;
  dangerBoxes: SafeZoneBox[];
}

/**
 * Zonas de interfaz reales calibradas para TikTok, YouTube Shorts e Instagram Reels (9:16).
 */
export const PLATFORM_SAFE_ZONES: Record<Exclude<SafeZonePlatform, 'none'>, PlatformSafeZoneSpec> = {
  tiktok: {
    id: 'tiktok',
    label: 'TikTok Feed',
    shortLabel: 'TikTok',
    safeTop: 0.115,
    safeBottom: 0.77,
    safeRight: 0.815,
    dangerBoxes: [
      { id: 'top', label: 'Siguiendo · Para ti', x: 0, y: 0, w: 1, h: 0.115 },
      { id: 'right', label: 'Likes / Comentarios / Compartir', x: 0.815, y: 0.43, w: 0.185, h: 0.34 },
      { id: 'bottom', label: 'Usuario · Descripción · Audio', x: 0, y: 0.77, w: 1, h: 0.23 },
    ],
  },
  shorts: {
    id: 'shorts',
    label: 'YouTube Shorts',
    shortLabel: 'Shorts',
    safeTop: 0.105,
    safeBottom: 0.785,
    safeRight: 0.825,
    dangerBoxes: [
      { id: 'top', label: 'Shorts · Búsqueda', x: 0, y: 0, w: 1, h: 0.105 },
      { id: 'right', label: 'Me gusta / Remix / Sonido', x: 0.825, y: 0.42, w: 0.175, h: 0.365 },
      { id: 'bottom', label: 'Canal · Suscribirse · Título', x: 0, y: 0.785, w: 1, h: 0.215 },
    ],
  },
  reels: {
    id: 'reels',
    label: 'Instagram Reels',
    shortLabel: 'Reels',
    safeTop: 0.11,
    safeBottom: 0.795,
    safeRight: 0.83,
    dangerBoxes: [
      { id: 'top', label: 'Reels · Cámara', x: 0, y: 0, w: 1, h: 0.11 },
      { id: 'right', label: 'Corazón / Comentar / Enviar', x: 0.83, y: 0.49, w: 0.17, h: 0.305 },
      { id: 'bottom', label: 'Perfil · Caption · Audio', x: 0, y: 0.795, w: 1, h: 0.205 },
    ],
  },
};

function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Detecta colisiones reales entre la posición actual de subtítulos / HUD
 * y las zonas rojas de TikTok, YouTube Shorts o Instagram Reels.
 */
export function auditSafeZoneCollisions(
  platform: SafeZonePlatform,
  aspectRatio: VideoAspectRatio,
  subtitleConfig: SubtitleConfig,
  hasActiveHud: boolean
): SafeZoneAuditResult {
  if (platform === 'none' || aspectRatio === '16:9') {
    return {
      hasCollision: false,
      subtitleCollides: false,
      hudCollides: false,
      warnings: [],
      recommendedSubtitleConfig: subtitleConfig,
    };
  }

  const spec = PLATFORM_SAFE_ZONES[platform];
  const warnings: string[] = [];
  let subtitleCollides = false;
  let hudCollides = false;

  const recommendedSubtitleConfig: SubtitleConfig = { ...subtitleConfig };

  const posYMap: Record<SubtitleConfig['positionY'], number> = {
    center: 0.50,
    lower_mid: 0.67,
    bottom: 0.81,
  };
  const heightMap: Record<SubtitleConfig['size'], number> = {
    sm: 0.095,
    md: 0.118,
    lg: 0.145,
  };
  const widthMap: Record<SubtitleConfig['size'], number> = {
    sm: 0.68,
    md: 0.76,
    lg: 0.84,
  };

  const subH = heightMap[subtitleConfig.size];
  const subW = widthMap[subtitleConfig.size];
  const subCenterY = posYMap[subtitleConfig.positionY];
  const subBox = {
    x: (1 - subW) / 2,
    y: subCenterY - subH / 2,
    w: subW,
    h: subH,
  };

  const hitsBottom = boxesOverlap(subBox, spec.dangerBoxes[2]);
  const hitsTop = boxesOverlap(subBox, spec.dangerBoxes[0]);
  const hitsRight = boxesOverlap(subBox, spec.dangerBoxes[1]);

  if (hitsBottom) {
    subtitleCollides = true;
    warnings.push(`Subtítulos invaden la barra inferior de ${spec.shortLabel} (descripción/audio).`);
    recommendedSubtitleConfig.positionY = 'lower_mid';
  }
  if (hitsTop) {
    subtitleCollides = true;
    warnings.push(`Subtítulos demasiado altos: rozan la cabecera superior de ${spec.shortLabel}.`);
    recommendedSubtitleConfig.positionY = 'center';
  }
  if (hitsRight) {
    subtitleCollides = true;
    warnings.push(`Subtítulos rozan la columna derecha de botones de ${spec.shortLabel}.`);
    if (recommendedSubtitleConfig.size === 'lg') {
      recommendedSubtitleConfig.size = 'md';
    }
    if (recommendedSubtitleConfig.positionY === 'bottom') {
      recommendedSubtitleConfig.positionY = 'lower_mid';
    }
  }

  // Verificar tarjeta HUD superior derecha (en 9:16 se dibuja alrededor de y: 0.115..0.195, x: 0.52..0.95)
  if (hasActiveHud) {
    const hudBox = { x: 0.52, y: 0.115, w: 0.43, h: 0.08 };
    if (boxesOverlap(hudBox, spec.dangerBoxes[0])) {
      hudCollides = true;
      warnings.push(`Tarjeta HUD superior roza la zona superior de ${spec.shortLabel}.`);
    }
  }

  return {
    hasCollision: subtitleCollides || hudCollides,
    subtitleCollides,
    hudCollides,
    warnings,
    recommendedSubtitleConfig,
  };
}

export interface TimelineBeatInput {
  scene: ScriptScene;
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
}

/**
 * Calcula la curva de energía y retención por beat + detección automática de "Zonas Muertas"
 * (> 2 beats consecutivos sin variación visual `shotType`/`cameraMotion` ni sonora `foleyCue`/HUD).
 */
export function analyzeBeatEnergyHeatmap(
  entries: TimelineBeatInput[],
  voiceRmsBySceneId?: Record<string, Float32Array>
): BeatEnergyMetric[] {
  const results: BeatEnergyMetric[] = [];
  let staticStreak = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const prev = i > 0 ? entries[i - 1].scene : null;
    const sc = entry.scene;

    const words = sc.narracion.trim().split(/\s+/).filter(Boolean).length;
    const wps = words / Math.max(0.6, entry.durationSec);
    const hasHud = extractSceneHudMetric(sc) !== null;
    const hasFoley = Boolean(sc.foleyCue && sc.foleyCue !== 'none');
    const shotChanged = Boolean(prev && sc.shotType && prev.shotType && sc.shotType !== prev.shotType);
    const motionChanged = Boolean(
      prev && sc.cameraMotion && prev.cameraMotion && sc.cameraMotion !== prev.cameraMotion
    );
    const hasVisualChange = i === 0 || shotChanged || motionChanged;
    const hasSonicChange = i === 0 || hasFoley || hasHud || Boolean(sc.esGiro30s);

    // Calcular RMS promedio real de voz si existe pista de telemetría
    let avgVoiceRms = 0.42;
    const track = voiceRmsBySceneId?.[sc.id];
    if (track && track.length > 0) {
      let sum = 0;
      for (let k = 0; k < track.length; k++) sum += track[k];
      avgVoiceRms = Math.min(1, sum / track.length);
    }

    // Score compuesto de energía 0..100
    let energy = 34;
    // Densidad de palabras óptima (2.4 - 3.6 WPS)
    if (wps >= 2.2 && wps <= 3.8) energy += 18;
    else if (wps > 3.8) energy += 12;
    else energy += Math.max(0, wps * 7);

    if (hasFoley) energy += 15;
    if (hasHud) energy += 12;
    if (shotChanged) energy += 10;
    if (motionChanged) energy += 6;
    if (sc.retentionRole === 'hook' || sc.retentionRole === 'climax' || sc.retentionRole === 're_hook' || sc.esGiro30s) {
      energy += 14;
    }
    energy += Math.round(avgVoiceRms * 14);
    energy = Math.max(15, Math.min(100, Math.round(energy)));

    const isStaticBeat = i > 0 && !hasVisualChange && !hasSonicChange;
    if (isStaticBeat) {
      staticStreak += 1;
    } else {
      staticStreak = 0;
    }

    const level: BeatEnergyMetric['level'] =
      energy >= 82 ? 'climax' : energy >= 64 ? 'high' : energy >= 45 ? 'medium' : 'low';

    const notes: string[] = [];
    if (sc.retentionRole === 'hook') notes.push('Gancho 0:00');
    if (sc.retentionRole === 're_hook' || sc.esGiro30s) notes.push('Re-Hook');
    if (sc.retentionRole === 'climax') notes.push('Clímax');
    if (hasHud) notes.push('HUD activo');
    if (hasFoley && sc.foleyCue) notes.push(`SFX ${sc.foleyCue}`);
    if (shotChanged) notes.push('Cambio de plano');

    results.push({
      beatIndex: i,
      sceneId: sc.id,
      orden: sc.orden,
      startSec: entry.startSec,
      endSec: entry.endSec,
      energyScore: energy,
      level,
      isDeadZone: false,
      deadZoneReason: undefined,
      wordDensityWps: Number(wps.toFixed(1)),
      hasHud,
      hasFoley,
      summary: notes.length > 0 ? notes.join(' · ') : `${words} palabras (${wps.toFixed(1)} pal/s)`,
    });

    // Marcar toda la racha si supera 2 beats consecutivos (> 2 beats estáticos = racha >= 3)
    if (staticStreak >= 3) {
      for (let j = i - staticStreak + 1; j <= i; j++) {
        if (results[j]) {
          results[j].isDeadZone = true;
          results[j].deadZoneReason =
            'Zona muerta (>2 beats sin cambio de plano/cámara ni SFX/HUD). Añade un foleyCue o cambia el shotType.';
          results[j].energyScore = Math.min(results[j].energyScore, 36);
          results[j].level = 'low';
        }
      }
    }
  }

  return results;
}
