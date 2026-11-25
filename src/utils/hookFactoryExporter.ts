import { buildHookOptionsForScript } from '../data/viralIdeasBank';
import type {
  BackgroundMusicId,
  FoleyCueType,
  HookFactoryVariant,
  HookVariantId,
  HumanVoiceProfile,
  RenderQualityMode,
  SceneMediaMap,
  ScriptScene,
  SubtitleConfig,
  VideoAspectRatio,
  ViralScript,
} from '../types';
import {
  buildSceneArtCacheKey,
  loadCachedSceneArtBlobWithFallback,
} from './aiImageQueue';
import { dataUrlToCompressedWebpBlob } from './bitmapWindowCache';
import { buildClientZipBlob } from './clientZipBuilder';
import { slugifyFilename } from './exportScript';
import { isLegacyFlatSvgDataUrl } from './flowPromptBuilder';
import {
  exportNativeMp4WithMuxer,
  type CachedEncodedBodySegment,
  type MuxerTimelineClip,
  WebCodecsMp4UnsupportedError,
} from './mp4MuxerExporter';
import { getEffectivePacingProfile } from './retentionEngine';
import { createStudioAudioContext } from './studioAudioMixer';
import { synthesizeUnifiedVoiceBuffer } from './unifiedVoiceEngine';
import {
  drawCoverVideo,
  drawDynamicSubtitles,
  renderAudiovisualWebm,
} from './videoExporter';
import { buildTimedWordTokens, estimateSpeechDurationSec } from './visualKeywords';

export interface HookFactoryExportItem {
  id: HookVariantId;
  label: string;
  angleTag: string;
  filename: string;
  blob: Blob;
  videoUrl: string;
  durationSec: number;
  reusedBodyFrames: number;
  extension: 'mp4' | 'webm';
}

export interface HookFactoryBatchProgress {
  variantIndex: number;
  totalVariants: number;
  variantId: HookVariantId;
  overallPercent: number;
  variantPercent: number;
  label: string;
  reusingBody: boolean;
}

export interface HookFactoryBatchResult {
  items: HookFactoryExportItem[];
  totalReusedBodyFrames: number;
  createZipBlob: () => Promise<Blob>;
  kitText: string;
}

function extractCompactTitle(narration: string, fallback: string): string {
  const cleaned = narration
    .replace(/[¿?¡!"“”.,;:()]/g, '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (cleaned.length === 0) return fallback.toUpperCase().slice(0, 18);
  return cleaned.slice(0, 2).join(' ').toUpperCase().slice(0, 18);
}

/**
 * Inicializa 3 variantes A/B/C para la Hook Factory integrándose con los ganchos
 * alternativos existentes (`buildHookOptionsForScript`) y bloqueando Beats 3..N.
 */
export function buildInitialHookFactoryVariants(script: ViralScript): HookFactoryVariant[] {
  const beat1 = script.escenas[0];
  const beat2 = script.escenas[1];
  const hookOptions = buildHookOptionsForScript(script);

  const baseBeat1Text = (beat1?.narracion || script.ganchoInicial3Seg?.fraseApertura || '').trim();
  const baseBeat2Text = (beat2?.narracion || '').trim();
  const baseBeat1Title = (beat1?.depthTitleText || extractCompactTitle(baseBeat1Text, 'ARCHIVO')).trim();
  const baseBeat2Title = (beat2?.depthTitleText || '').trim();

  const optionB = hookOptions[1] ?? hookOptions[0];
  const optionC = hookOptions[2] ?? hookOptions[0];

  const defaultFoleyA: FoleyCueType = beat1?.foleyCue && beat1.foleyCue !== 'none' ? beat1.foleyCue : 'sub_drop';
  const defaultFoleyBeat2: FoleyCueType = beat2?.foleyCue ?? 'riser_tension';

  return [
    {
      id: 'A',
      label: 'Hook A · Original / Dato',
      angleTag: hookOptions[0]?.label || 'Dato Perturbador',
      beat1Narration: baseBeat1Text,
      beat1DepthTitle: baseBeat1Title,
      beat1FoleyCue: defaultFoleyA,
      beat2Narration: baseBeat2Text,
      beat2DepthTitle: baseBeat2Title,
      beat2FoleyCue: defaultFoleyBeat2,
    },
    {
      id: 'B',
      label: 'Hook B · Escenario POV',
      angleTag: optionB?.label || 'Escenario POV',
      beat1Narration: optionB?.fraseApertura || baseBeat1Text,
      beat1DepthTitle: extractCompactTitle(optionB?.fraseApertura || baseBeat1Text, 'POV 0:00'),
      beat1FoleyCue: 'thunder_impact',
      beat2Narration: baseBeat2Text,
      beat2DepthTitle: baseBeat2Title,
      beat2FoleyCue: 'riser_tension',
    },
    {
      id: 'C',
      label: 'Hook C · Intriga Psicológica',
      angleTag: optionC?.label || 'Intriga Psicológica',
      beat1Narration: optionC?.fraseApertura || baseBeat1Text,
      beat1DepthTitle: extractCompactTitle(optionC?.fraseApertura || baseBeat1Text, 'ENIGMA'),
      beat1FoleyCue: 'analog_glitch',
      beat2Narration: baseBeat2Text,
      beat2DepthTitle: baseBeat2Title,
      beat2FoleyCue: 'heartbeat',
    },
  ];
}

export function buildViralPublishingKitText(
  script: ViralScript,
  variants: HookFactoryVariant[],
  baseSlug: string
): string {
  const rawTitles = script.metadatosPublicacion?.titulosAlternativos ?? [];
  const titles = Array.from(
    new Set([script.tituloViral, ...rawTitles].map((t) => (t || '').trim()).filter(Boolean))
  ).slice(0, 3);

  const hashtags = (script.metadatosPublicacion?.hashtags ?? [])
    .map((h) => (h.startsWith('#') ? h : `#${h.replace(/\s+/g, '')}`))
    .filter(Boolean);
  const hashtagsLine =
    hashtags.length > 0 ? hashtags.join(' ') : '#shorts #viral #curiosidades #documental';
  const description =
    (script.metadatosPublicacion?.descripcionSeo || '').trim() ||
    `${script.ganchoInicial3Seg.fraseApertura} ¿Tú qué opinas? Te leemos en los comentarios.`;
  const coverPrompt =
    (script.metadatosPublicacion?.promptPortada || '').trim() ||
    `${script.visualBible?.fixedPrefixPrompt || script.guiaEstilo3D}, iconic viral thumbnail for "${script.tituloViral}", dramatic rim lighting, no text`;

  const lines: string[] = [
    '============================================================',
    'GORTEX · PACK DE PUBLICACIÓN VIRAL & TEST A/B DE GANCHOS',
    '============================================================',
    `Proyecto: ${script.tituloViral}`,
    `Nicho: ${script.nicho}`,
    `Formato: ${script.formatoVideo ?? '9:16'}`,
    '',
    '1) VARIANTES EXPORTADAS (Cuerpo común Beats 3..N idéntico):',
    ...variants.map(
      (v) =>
        `  - ${baseSlug}_hook${v.id}.mp4 (${v.label} · ${v.angleTag})\n    Beat 1: "${v.beat1Narration}"` +
        (v.beat2Narration ? `\n    Beat 2: "${v.beat2Narration}"` : '')
    ),
    '',
    '2) 3 TÍTULOS DE ALTO CTR:',
    ...titles.map((t, idx) => `  ${idx + 1}. ${t}`),
    '',
    '3) DESCRIPCIÓN SEO + HASHTAGS:',
    description,
    '',
    hashtagsLine,
    '',
    '4) PROMPT DE PORTADA / MINIATURA (Visual Bible):',
    coverPrompt,
    '',
    '5) GUÍA DE TEST A/B (TikTok / YouTube Shorts / Reels):',
    '  - Publica Hook A, analiza retención en segundo 0:03 (objetivo > 72%).',
    '  - Si el Hook Hold < 65%, publica Hook B o Hook C sin re-editar el cuerpo del video.',
  ];

  return lines.join('\n');
}

async function decodeAudioDataUrlSafe(
  ctx: AudioContext,
  dataUrl?: string
): Promise<AudioBuffer | null> {
  if (!dataUrl) return null;
  try {
    const res = await fetch(dataUrl);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr.slice(0));
  } catch {
    return null;
  }
}

function loadVideoElementSafe(src: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const vid = document.createElement('video');
    vid.crossOrigin = 'anonymous';
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    let settled = false;
    const done = (r: HTMLVideoElement | null) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    vid.onloadeddata = () => done(vid);
    vid.onerror = () => done(null);
    window.setTimeout(() => done(vid.readyState >= 2 ? vid : null), 3500);
    vid.src = src;
    vid.load();
  });
}

function applyVariantToScript(script: ViralScript, variant: HookFactoryVariant): ViralScript {
  const nextScenes: ScriptScene[] = script.escenas.map((sc, idx) => {
    if (idx === 0) {
      return {
        ...sc,
        narracion: variant.beat1Narration.trim() || sc.narracion,
        subtituloDinamico: variant.beat1Narration.trim() || sc.subtituloDinamico,
        depthTitleText: variant.beat1DepthTitle.trim() || undefined,
        foleyCue: variant.beat1FoleyCue,
        imageSeed: variant.imageSeed ?? sc.imageSeed,
      };
    }
    if (idx === 1 && variant.beat2Narration.trim()) {
      return {
        ...sc,
        narracion: variant.beat2Narration.trim(),
        subtituloDinamico: variant.beat2Narration.trim(),
        depthTitleText: variant.beat2DepthTitle.trim() || undefined,
        foleyCue: variant.beat2FoleyCue,
      };
    }
    return sc;
  });

  return {
    ...script,
    escenas: nextScenes,
    ganchoInicial3Seg: {
      ...script.ganchoInicial3Seg,
      fraseApertura: variant.beat1Narration.trim() || script.ganchoInicial3Seg.fraseApertura,
    },
  };
}

/**
 * Motor Optimizado de Hook Factory (Módulo 4):
 * - Prepara y cachea los activos del cuerpo común (Beats 3..N) una sola vez.
 * - Codifica el cuerpo común H.264 una sola vez durante Hook A (`captureBodyFromBeatIndex: 2`).
 * - Para Hook B y Hook C renderiza únicamente Beats 1–2 (+ transición al Beat 3) y empalma
 *   los chunks H.264 cacheados en `mp4-muxer`, acelerando la generación por lotes ~3x.
 * - Empaqueta los 3 `.mp4` + `kit_publicacion_viral.txt` en un `.zip` 100% client-side.
 */
export async function exportHookFactoryBatch(options: {
  script: ViralScript;
  variants: HookFactoryVariant[];
  sceneMedia: SceneMediaMap;
  fallbackImageUrl: string;
  aspectRatio: VideoAspectRatio;
  subtitleConfig: SubtitleConfig;
  backgroundMusicId: BackgroundMusicId;
  musicVolume: number;
  enableTransitionSfx: boolean;
  sfxVolumeDb: number;
  playbackRate: number;
  renderQuality: RenderQualityMode;
  selectedVoice: HumanVoiceProfile;
  onProgress?: (progress: HookFactoryBatchProgress) => void;
  signal?: AbortSignal;
}): Promise<HookFactoryBatchResult> {
  const {
    script,
    variants,
    sceneMedia,
    fallbackImageUrl,
    aspectRatio,
    subtitleConfig,
    backgroundMusicId,
    musicVolume,
    enableTransitionSfx,
    sfxVolumeDb,
    playbackRate,
    renderQuality,
    selectedVoice,
    onProgress,
    signal,
  } = options;

  const isLandscape = aspectRatio === '16:9';
  const canvasW = isLandscape ? 1280 : 720;
  const canvasH = isLandscape ? 720 : 1280;
  const safePlaybackRate = Math.max(0.75, Math.min(1.5, Number(playbackRate) || 1));
  const baseSlug = slugifyFilename(script.tituloViral || 'proyecto');

  const decodeCtx = createStudioAudioContext();
  const loadedVideos: HTMLVideoElement[] = [];

  // Cachear recursos base de Beats 3..N UNA SOLA VEZ
  interface PreparedBaseClip {
    scene: ScriptScene;
    videoEl: HTMLVideoElement | null;
    imageBlobs: Blob[];
    artCacheKey?: string;
    audioBuffer: AudioBuffer | null;
  }

  const prepareSceneAssets = async (
    scene: ScriptScene,
    variantScript: ViralScript,
    customImageDataUrl?: string,
    reuseExistingAudio = true
  ): Promise<PreparedBaseClip> => {
    const media = sceneMedia[scene.id];
    const videoEl =
      !customImageDataUrl && media?.videoClipUrl
        ? await loadVideoElementSafe(media.videoClipUrl)
        : null;
    if (videoEl) loadedVideos.push(videoEl);

    const imageBlobs: Blob[] = [];
    let resolvedArtCacheKey: string | undefined;

    if (!videoEl) {
      if (customImageDataUrl && !isLegacyFlatSvgDataUrl(customImageDataUrl)) {
        const blob = await dataUrlToCompressedWebpBlob(customImageDataUrl);
        if (blob) {
          imageBlobs.push(blob);
          resolvedArtCacheKey = `hf-custom::${variantScript.id}::${scene.id}::${customImageDataUrl.length}`;
        }
      } else if (media?.imageDataUrl && !isLegacyFlatSvgDataUrl(media.imageDataUrl)) {
        const blob = await dataUrlToCompressedWebpBlob(media.imageDataUrl);
        if (blob) {
          imageBlobs.push(blob);
          resolvedArtCacheKey = `custom::${script.id}::${scene.id}::${media.imageDataUrl.length}::${media.imageDataUrl.slice(-24)}`;
        }
      }

      if (imageBlobs.length === 0) {
        const cached = await loadCachedSceneArtBlobWithFallback(
          scene,
          script,
          aspectRatio,
          media?.imageSeed
        );
        if (cached) {
          imageBlobs.push(cached.blob);
          resolvedArtCacheKey = cached.artCacheKey;
        }
      }
    }

    let audioBuffer: AudioBuffer | null = null;
    if (reuseExistingAudio && media?.audioDataUrl) {
      audioBuffer = await decodeAudioDataUrlSafe(decodeCtx, media.audioDataUrl);
    }
    if (!audioBuffer) {
      const synth = await synthesizeUnifiedVoiceBuffer({
        text: scene.narracion,
        voice: selectedVoice,
        language: script.idioma ?? 'es',
        existingAudioDataUrl: reuseExistingAudio ? media?.audioDataUrl : undefined,
        isCustomUserAudio:
          reuseExistingAudio &&
          (media?.audioSource === 'custom_mic' || media?.audioSource === 'custom_file'),
      });
      audioBuffer = (await decodeAudioDataUrlSafe(decodeCtx, synth.audioDataUrl)) ?? synth.buffer;
    }

    return {
      scene,
      videoEl,
      imageBlobs,
      artCacheKey:
        resolvedArtCacheKey ?? buildSceneArtCacheKey(scene, script, aspectRatio, media?.imageSeed),
      audioBuffer,
    };
  };

  try {
    // 1) Preparar el cuerpo compartido (Beats 3..N) una sola vez
    const sharedBodyScenes = script.escenas.slice(2);
    const sharedBodyPrepared: PreparedBaseClip[] = [];
    for (let i = 0; i < sharedBodyScenes.length; i++) {
      if (signal?.aborted) throw new Error('Renderizado cancelado.');
      onProgress?.({
        variantIndex: 0,
        totalVariants: variants.length,
        variantId: variants[0]?.id ?? 'A',
        overallPercent: Math.round(((i + 1) / Math.max(1, sharedBodyScenes.length)) * 10),
        variantPercent: 5,
        label: `Cacheando cuerpo común (Beat ${i + 3}/${script.escenas.length}) una sola vez...`,
        reusingBody: false,
      });
      const prepared = await prepareSceneAssets(sharedBodyScenes[i], script, undefined, true);
      sharedBodyPrepared.push(prepared);
    }

    const items: HookFactoryExportItem[] = [];
    let cachedBodySegment: CachedEncodedBodySegment | undefined;
    let totalReusedBodyFrames = 0;
    const canSplitAtBeat3 = script.escenas.length >= 3;

    // 2) Renderizar las 3 variantes secuencialmente reutilizando el cuerpo H.264 de la Variante A
    for (let vIdx = 0; vIdx < variants.length; vIdx++) {
      if (signal?.aborted) throw new Error('Renderizado cancelado.');
      const variant = variants[vIdx];
      const variantScript = applyVariantToScript(script, variant);
      const isReusingBody = Boolean(cachedBodySegment && canSplitAtBeat3);

      onProgress?.({
        variantIndex: vIdx,
        totalVariants: variants.length,
        variantId: variant.id,
        overallPercent: Math.round(10 + (vIdx / variants.length) * 85),
        variantPercent: 6,
        label: isReusingBody
          ? `Variante ${variant.id}: sintetizando solo Beats 1–2 (cuerpo 3..N en caché)...`
          : `Variante ${variant.id}: preparando Beats 1–2 y capturando cuerpo común...`,
        reusingBody: isReusingBody,
      });

      const headPrepared: PreparedBaseClip[] = [];
      const headCount = Math.min(2, variantScript.escenas.length);
      for (let h = 0; h < headCount; h++) {
        const sc = variantScript.escenas[h];
        const origSc = script.escenas[h];
        const sameTextAsOriginal =
          origSc && sc.narracion.trim() === origSc.narracion.trim();
        const customImg = h === 0 ? variant.customImageDataUrl : undefined;
        headPrepared.push(
          await prepareSceneAssets(sc, variantScript, customImg, Boolean(sameTextAsOriginal))
        );
      }

      const allPrepared = [...headPrepared, ...sharedBodyPrepared];
      let cursorSec = 0;
      const muxClips: MuxerTimelineClip[] = allPrepared.map((p) => {
        const pacing = getEffectivePacingProfile(p.scene);
        const effRate = Math.max(0.75, Math.min(1.5, safePlaybackRate * pacing.speedMultiplier));
        const prePauseSec = Math.max(0, Math.min(0.45, pacing.prePauseMs / 1000));
        const rawDur = p.audioBuffer
          ? Math.max(p.audioBuffer.duration + 0.08, 1.4)
          : estimateSpeechDurationSec(p.scene.narracion);
        const clipDur = prePauseSec + rawDur / effRate;
        const startSec = cursorSec;
        cursorSec += clipDur;
        return {
          scene: p.scene,
          videoEl: p.videoEl,
          imageBlobs: p.imageBlobs,
          artCacheKey: p.artCacheKey,
          audioBuffer: p.audioBuffer,
          startSec,
          durationSec: clipDur,
          timedTokens: buildTimedWordTokens(p.scene, clipDur, { prePauseSec }),
        };
      });

      const totalDur = Math.max(1, cursorSec);

      let variantBlob: Blob;
      let variantDurationSec = Math.round(totalDur);
      let variantExt: 'mp4' | 'webm' = 'mp4';
      let reusedFramesThisVariant = 0;

      try {
        const nativeResult = await exportNativeMp4WithMuxer({
          script: variantScript,
          clips: muxClips,
          totalDurationSec: totalDur,
          aspectRatio,
          canvasW,
          canvasH,
          subtitleConfig,
          backgroundMusicId,
          musicVolume,
          enableTransitionSfx,
          sfxVolumeDb,
          playbackRate: safePlaybackRate,
          renderQuality,
          captureBodyFromBeatIndex:
            vIdx === 0 && canSplitAtBeat3 ? 2 : undefined,
          reuseEncodedBody:
            vIdx > 0 && cachedBodySegment ? cachedBodySegment : undefined,
          drawSubtitles: drawDynamicSubtitles,
          drawCoverVideo,
          signal,
          onProgress: (pct, label) => {
            const basePct = 10 + (vIdx / variants.length) * 86;
            const spanPct = 86 / variants.length;
            onProgress?.({
              variantIndex: vIdx,
              totalVariants: variants.length,
              variantId: variant.id,
              overallPercent: Math.min(98, Math.round(basePct + (pct / 100) * spanPct)),
              variantPercent: pct,
              label: `Hook ${variant.id} (${vIdx + 1}/${variants.length}) · ${label}`,
              reusingBody: isReusingBody,
            });
          },
        });

        variantBlob = nativeResult.blob;
        variantDurationSec = Math.round(nativeResult.telemetry.totalDurationSec);
        reusedFramesThisVariant = nativeResult.reusedBodyFrames ?? 0;
        totalReusedBodyFrames += reusedFramesThisVariant;

        if (vIdx === 0 && nativeResult.capturedBodySegment) {
          cachedBodySegment = nativeResult.capturedBodySegment;
        }
      } catch (err) {
        if (err instanceof WebCodecsMp4UnsupportedError) {
          // Respaldo transparente si el navegador no soporta WebCodecs
          const fallbackMedia: SceneMediaMap = { ...sceneMedia };
          if (variant.customImageDataUrl && variantScript.escenas[0]) {
            fallbackMedia[variantScript.escenas[0].id] = {
              ...fallbackMedia[variantScript.escenas[0].id],
              imageDataUrl: variant.customImageDataUrl,
            };
          }
          const fbRes = await renderAudiovisualWebm({
            script: variantScript,
            sceneMedia: fallbackMedia,
            fallbackImageUrl,
            aspectRatio,
            subtitleConfig,
            backgroundMusicId,
            musicVolume,
            enableTransitionSfx,
            sfxVolumeDb,
            exportFormat: 'mp4',
            playbackRate: safePlaybackRate,
            renderQuality,
            selectedVoice,
            signal,
            onProgress: (pct, label) => {
              const basePct = 10 + (vIdx / variants.length) * 86;
              const spanPct = 86 / variants.length;
              onProgress?.({
                variantIndex: vIdx,
                totalVariants: variants.length,
                variantId: variant.id,
                overallPercent: Math.min(98, Math.round(basePct + (pct / 100) * spanPct)),
                variantPercent: pct,
                label: `Hook ${variant.id} (${vIdx + 1}/${variants.length}) · ${label}`,
                reusingBody: false,
              });
            },
          });
          variantBlob = fbRes.blob;
          variantDurationSec = fbRes.durationSec;
          variantExt = fbRes.extension;
        } else {
          throw err;
        }
      }

      const filename = `${baseSlug}_hook${variant.id}.${variantExt}`;
      items.push({
        id: variant.id,
        label: variant.label,
        angleTag: variant.angleTag,
        filename,
        blob: variantBlob,
        videoUrl: URL.createObjectURL(variantBlob),
        durationSec: variantDurationSec,
        reusedBodyFrames: reusedFramesThisVariant,
        extension: variantExt,
      });
    }

    onProgress?.({
      variantIndex: variants.length - 1,
      totalVariants: variants.length,
      variantId: variants[variants.length - 1]?.id ?? 'C',
      overallPercent: 100,
      variantPercent: 100,
      label: '3 variantes A/B listas para descargar o empaquetar en .ZIP',
      reusingBody: true,
    });

    const kitText = buildViralPublishingKitText(script, variants, baseSlug);

    return {
      items,
      totalReusedBodyFrames,
      kitText,
      createZipBlob: async () =>
        buildClientZipBlob([
          ...items.map((item) => ({
            name: item.filename,
            data: item.blob,
          })),
          {
            name: `${baseSlug}_kit_publicacion_viral.txt`,
            data: kitText,
          },
        ]),
    };
  } finally {
    loadedVideos.forEach((v) => {
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch {
        // Silencioso
      }
    });
    if (decodeCtx.state !== 'closed') {
      await decodeCtx.close().catch(() => {});
    }
  }
}
