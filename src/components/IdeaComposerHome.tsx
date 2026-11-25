import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Clapperboard,
  Dices,
  Film,
  ImagePlus,
  Loader2,
  Mic,
  Monitor,
  Radar,
  Shuffle,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import {
  speakWithBrowserTts,
  stopCurrentAudio,
  unlockAudioPlayback,
} from '../utils/audioPlayer';
import { generateRandomViralIdea } from '../services/geminiClient';
import {
  COMMERCIAL_SECTORS,
  getCommercialSectorById,
  isCommercialStudioMode,
  pickNextCommercialIdea,
} from '../data/commercialPresets';
import {
  AUDIENCES,
  DURATIONS,
  HUMAN_VOICE_PROFILES,
  MONETIZATION_NICHES,
  PLATFORMS,
  STYLES_3D,
  WHAT_IF_ERAS,
  WHAT_IF_MODERN_OBJECTS,
} from '../data/presets';
import {
  buildRandomConceptMashup,
  pickNextViralIdea,
  VIRAL_NICHE_BANKS,
} from '../data/viralIdeasBank';
import type { PendingBatchMediaItem } from '../services/userMediaIngestionService';
import type {
  AudienceId,
  ChannelPreset,
  CommercialBrief,
  CommercialSector,
  DurationOption,
  GenerateScriptPayload,
  HumanVoiceProfile,
  NarrativeBlueprintSelection,
  PlatformId,
  StudioMode,
  Style3DId,
  VideoAspectRatio,
  ViralScript,
} from '../types';
import {
  COMMERCIAL_BLUEPRINTS,
  getBlueprintInfo,
  VIRAL_BLUEPRINTS,
} from '../utils/retentionEngine';
import { BatchMediaDropzone } from './BatchMediaDropzone';
import { CommercialBriefPanel } from './CommercialBriefPanel';

interface IdeaComposerHomeProps {
  studioMode: StudioMode;
  commercialSector: CommercialSector;
  commercialBrief: CommercialBrief;
  pendingComposerMedia: PendingBatchMediaItem[];
  premise: string;
  niche: string;
  audience: AudienceId;
  durationSec: DurationOption;
  style3D: Style3DId;
  platform: PlatformId;
  aspectRatio: VideoAspectRatio;
  selectedVoiceId: string;
  monetizationGoal: string;
  narrativeBlueprint: NarrativeBlueprintSelection;
  isGenerating: boolean;
  cooldownSec: number;
  errorMessage: string | null;
  recentScripts: ViralScript[];
  channelPresets: ChannelPreset[];
  onChangeStudioMode: (mode: StudioMode) => void;
  onChangeCommercialSector: (sector: CommercialSector) => void;
  onChangeCommercialBrief: (brief: CommercialBrief) => void;
  onChangePendingComposerMedia: (items: PendingBatchMediaItem[]) => void;
  onChangePremise: (val: string) => void;
  onChangeNiche: (val: string) => void;
  onChangeAudience: (val: AudienceId) => void;
  onChangeDuration: (val: DurationOption) => void;
  onChangeStyle3D: (val: Style3DId) => void;
  onChangePlatform: (val: PlatformId) => void;
  onChangeAspectRatio: (val: VideoAspectRatio) => void;
  onChangeVoiceId: (val: string) => void;
  onChangeMonetizationGoal: (val: string) => void;
  onChangeNarrativeBlueprint: (val: NarrativeBlueprintSelection) => void;
  onSaveChannelPreset: (name: string) => void;
  onApplyChannelPreset: (preset: ChannelPreset) => void;
  onDeleteChannelPreset: (id: string) => void;
  onGenerateOnly: (payload: GenerateScriptPayload) => void;
  onGenerateAndProduce: (payload: GenerateScriptPayload) => void;
  onOpenTool: (tool: 'photo_video' | 'image_studio' | 'trends') => void;
  onOpenProGuide: () => void;
  onSelectRecentScript: (script: ViralScript, goToVideo?: boolean) => void;
}

export function IdeaComposerHome({
  studioMode,
  commercialSector,
  commercialBrief,
  pendingComposerMedia,
  premise,
  niche,
  audience,
  durationSec,
  style3D,
  platform,
  aspectRatio,
  selectedVoiceId,
  monetizationGoal,
  narrativeBlueprint,
  isGenerating,
  cooldownSec,
  errorMessage,
  recentScripts,
  channelPresets,
  onChangeStudioMode,
  onChangeCommercialSector,
  onChangeCommercialBrief,
  onChangePendingComposerMedia,
  onChangePremise,
  onChangeNiche,
  onChangeAudience,
  onChangeDuration,
  onChangeStyle3D,
  onChangePlatform,
  onChangeAspectRatio,
  onChangeVoiceId,
  onChangeMonetizationGoal,
  onChangeNarrativeBlueprint,
  onSaveChannelPreset,
  onApplyChannelPreset,
  onDeleteChannelPreset,
  onGenerateOnly,
  onGenerateAndProduce,
  onOpenTool,
  onOpenProGuide,
  onSelectRecentScript,
}: IdeaComposerHomeProps) {
  const [showWhatIfMixer, setShowWhatIfMixer] = useState(false);
  const [showViralMediaDropzone, setShowViralMediaDropzone] = useState(false);
  const [selectedEra, setSelectedEra] = useState(WHAT_IF_ERAS[0]);
  const [selectedObject, setSelectedObject] = useState(WHAT_IF_MODERN_OBJECTS[0]);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);
  const [activeNicheId, setActiveNicheId] = useState<string | null>(null);
  const [isRollingIdea, setIsRollingIdea] = useState(false);
  const [ideaHint, setIdeaHint] = useState<string | null>(null);

  const lastIdeaByNicheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, []);

  const isCommercial = isCommercialStudioMode(studioMode);
  const activeCommercialSector = getCommercialSectorById(commercialSector);
  const availableBlueprints = isCommercial ? COMMERCIAL_BLUEPRINTS : VIRAL_BLUEPRINTS;

  const selectedVoice =
    HUMAN_VOICE_PROFILES.find((v) => v.id === selectedVoiceId) ?? HUMAN_VOICE_PROFILES[0];
  const activeDurationObj = DURATIONS.find((d) => d.value === durationSec) ?? DURATIONS[2];
  const activeStyleObj = STYLES_3D.find((s) => s.id === style3D) ?? STYLES_3D[0];
  const activeBlueprintInfo = getBlueprintInfo(narrativeBlueprint);

  const buildPayload = (): GenerateScriptPayload => {
    const fallbackMediaPremise =
      pendingComposerMedia.length > 0
        ? isCommercial
          ? `Video comercial editorial para ${
              commercialBrief.businessOrPropertyName?.trim() || activeCommercialSector.label
            } usando ${pendingComposerMedia.length} fotos y clips reales en orden.`
          : `Historia audiovisual creada a partir de ${pendingComposerMedia.length} fotos y clips reales en orden.`
        : '';

    return {
      premise: premise.trim().length >= 8 ? premise.trim() : fallbackMediaPremise || premise.trim(),
      niche: isCommercial ? activeCommercialSector.nicheName : niche || 'Idea personalizada',
      audience: isCommercial ? 'general' : audience,
      durationSec,
      style3D,
      platform,
      aspectRatio,
      voiceProfileId: selectedVoiceId,
      narrativeBlueprint,
      studioMode,
      commercialSector: isCommercial ? commercialSector : undefined,
      commercialBrief: isCommercial ? { ...commercialBrief, sector: commercialSector } : undefined,
      monetizationGoal:
        monetizationGoal ||
        (isCommercial
          ? activeCommercialSector.monetizationGoal
          : 'Contenido 100% original apto para anunciantes con gancho inmediato y retención alta'),
    };
  };

  const handleCommercialSectorClick = (sectorId: CommercialSector) => {
    const prevIdea = lastIdeaByNicheRef.current[`comm-${sectorId}`] ?? premise;
    const { sector, idea } = pickNextCommercialIdea(sectorId, prevIdea);
    lastIdeaByNicheRef.current[`comm-${sectorId}`] = idea;
    onChangeCommercialSector(sector.id);
    onChangeCommercialBrief({ ...commercialBrief, sector: sector.id });
    onChangeNiche(sector.nicheName);
    onChangeNarrativeBlueprint(sector.defaultBlueprint);
    onChangeMonetizationGoal(sector.monetizationGoal);
    onChangePremise(idea);
    setIdeaHint(`Enfoque cargado para ${sector.label}. Haz clic de nuevo para rotar otro ángulo comercial.`);
  };

  const handleNicheIdeaRotate = (nicheId: string) => {
    const prevIdea = lastIdeaByNicheRef.current[nicheId] ?? premise;
    const { bank, idea } = pickNextViralIdea(nicheId, prevIdea);
    lastIdeaByNicheRef.current[nicheId] = idea;
    setActiveNicheId(nicheId);
    onChangePremise(idea);
    onChangeAudience(bank.audience);
    onChangeStyle3D(bank.style3D);
    onChangeNiche(bank.nicheName);
    onChangeMonetizationGoal(bank.monetizationGoal);
    setIdeaHint(`Nueva idea cargada de ${bank.label}. Haz clic de nuevo para rotar otra distinta.`);
  };

  const handleDiceRandomIdea = async () => {
    if (isRollingIdea) return;
    setIsRollingIdea(true);
    setActiveNicheId(null);
    setIdeaHint(null);
    try {
      const data = await generateRandomViralIdea();
      if (data?.premise && typeof data.premise === 'string') {
        onChangePremise(data.premise);
        if (data.niche) onChangeNiche(data.niche);
        if (data.audience) onChangeAudience(data.audience);
        if (data.style3D) onChangeStyle3D(data.style3D);
        setIdeaHint('Premisa viral recién inventada con Gemini 2.5 Flash.');
        return;
      }
      throw new Error('fallback');
    } catch {
      const mashup = buildRandomConceptMashup();
      onChangePremise(mashup.premise);
      onChangeNiche(mashup.niche);
      onChangeAudience(mashup.audience);
      onChangeStyle3D(mashup.style3D);
      setIdeaHint('Combinación viral aleatoria lista para producir.');
    } finally {
      setIsRollingIdea(false);
    }
  };

  const handleAuditionVoice = async (profile: HumanVoiceProfile) => {
    if (playingVoiceId === profile.id) {
      stopCurrentAudio();
      setPlayingVoiceId(null);
      return;
    }

    stopCurrentAudio();
    unlockAudioPlayback();
    setPlayingVoiceId(profile.id);

    await speakWithBrowserTts(profile.sampleLine, {
      voiceName: profile.voiceName,
      language: 'es',
      onEnded: () => {
        setPlayingVoiceId((cur) => (cur === profile.id ? null : cur));
      },
    });
  };

  const applyWhatIf = (era: string, obj: string) => {
    onChangeAudience('viral_meme');
    onChangeStyle3D('viral_meme_3d');
    onChangeNiche('Historia Absurda (What If)');
    onChangePremise(
      `¿Qué pasaría si aparecieras en ${era} con ${obj}? Empieza en el segundo 0:00 activando el objeto frente a todos y muestra reacciones 3D exageradas y el caos creciente.`
    );
    onChangeMonetizationGoal(
      'Viralidad orgánica en formato corto con humor 3D original y reacciones cómicas'
    );
  };

  const handleRandomWhatIf = () => {
    const era = WHAT_IF_ERAS[Math.floor(Math.random() * WHAT_IF_ERAS.length)];
    const obj = WHAT_IF_MODERN_OBJECTS[Math.floor(Math.random() * WHAT_IF_MODERN_OBJECTS.length)];
    setSelectedEra(era);
    setSelectedObject(obj);
    applyWhatIf(era, obj);
  };

  const handleAspectSelect = (nextRatio: VideoAspectRatio) => {
    onChangeAspectRatio(nextRatio);
    if (nextRatio === '16:9' && platform !== 'youtube_long') {
      onChangePlatform('youtube_long');
    } else if (nextRatio === '9:16' && platform === 'youtube_long') {
      onChangePlatform('tiktok_creativity');
    }
  };

  const handleAudienceQuickSelect = (nextAud: AudienceId) => {
    onChangeAudience(nextAud);
    if (nextAud === 'viral_meme') {
      onChangeStyle3D('viral_meme_3d');
      onChangeVoiceId('mateo_cercano');
      setShowWhatIfMixer(true);
    } else if (nextAud === 'kids') {
      onChangeStyle3D('soft_storybook');
      onChangeVoiceId('sofia_familiar');
    } else if (nextAud === 'educational') {
      onChangeStyle3D('flat_kids');
      onChangeVoiceId('lucia_cotidiana');
    } else if (nextAud === 'general') {
      onChangeStyle3D('soft_storybook');
      onChangeVoiceId('lucia_cotidiana');
    } else {
      onChangeStyle3D('pixar_dark');
      onChangeVoiceId('diego_sereno');
    }
  };

  const canSubmit =
    !isGenerating &&
    cooldownSec <= 0 &&
    (premise.trim().length >= 8 || pendingComposerMedia.length > 0);

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Encabezado editorial principal */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-1 sm:pt-3">
        <div className="max-w-3xl space-y-2.5">
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.14]">
            {isCommercial
              ? 'Produce recorridos inmobiliarios y anuncios comerciales sin marca de agua'
              : 'Escribe tu idea y produce videos listos para monetizar'}
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">
            {isCommercial
              ? 'Sube fotos o clips reales de tu propiedad o negocio y obtén guion editorial a medida, fichas HUD limpias, paralaje TrueDepth 2.5D y exportación MP4 100% limpia.'
              : 'Describe cualquier historia o elige entre 120+ ideas virales rotativas, y obtén guion, arte AI único por escena con movimiento Ken Burns y prompts para Google Flow.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenProGuide}
          className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] text-xs font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 self-start md:self-auto cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5 text-[#F97316]" />
          <span>Guía Gortex + Google Flow</span>
        </button>
      </section>

      {/* Compositor principal de idea + configuración individual */}
      <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-2xl p-4 sm:p-6 space-y-6">
        {/* Selector de Modo de Estudio: Viral / Storytelling vs Comercial & Bienes Raíces */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
          <div className="inline-grid grid-cols-2 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                onChangeStudioMode('viral_storytelling');
                setIdeaHint(null);
              }}
              className={`min-h-[38px] inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                !isCommercial
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Viral / Storytelling</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onChangeStudioMode('commercial_real_estate');
                setShowWhatIfMixer(false);
                setIdeaHint(null);
              }}
              className={`min-h-[38px] inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                isCommercial
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Comercial &amp; Bienes Raíces</span>
            </button>
          </div>

          <span className="text-[11px] text-[var(--text-secondary)]">
            {isCommercial
              ? 'Estética editorial luminosa · Fichas HUD + Tarjeta CTA · Exportación 100% limpia'
              : 'Motor viral de retención · 8 nichos + Sagas + WebGL2 2.5D'}
          </span>
        </div>

        {/* Presets de marca del canal */}
        <div className="pb-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-body)]">
              <Bookmark className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Presets de mi canal</span>
            </span>
            {channelPresets.length === 0 ? (
              <span className="text-xs text-[var(--text-muted)]">
                Guarda tu formato, voz, estilo, música y subtítulos para reutilizarlos en 1 clic.
              </span>
            ) : (
              channelPresets.map((preset) => {
                const isApplied = appliedPresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`inline-flex items-center rounded-lg border text-xs transition-colors ${
                      isApplied
                        ? 'bg-[#F97316]/10 border-[#F97316] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-body)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onApplyChannelPreset(preset);
                        setAppliedPresetId(preset.id);
                      }}
                      className="px-2.5 py-1.5 font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      {isApplied && <Check className="w-3 h-3 text-[#16A34A]" />}
                      <span>{preset.name}</span>
                      <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                        {preset.aspectRatio}·{preset.durationSec}s
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteChannelPreset(preset.id);
                        if (appliedPresetId === preset.id) setAppliedPresetId(null);
                      }}
                      aria-label={`Eliminar preset ${preset.name}`}
                      className="pr-2 pl-1 py-1.5 text-[var(--text-muted)] hover:text-[#DC2626] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {showPresetForm ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && presetName.trim()) {
                    onSaveChannelPreset(presetName.trim());
                    setPresetName('');
                    setShowPresetForm(false);
                  }
                }}
                placeholder="Ej: Canal Curiosidades"
                maxLength={32}
                className="w-40 sm:w-48 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
              />
              <button
                type="button"
                disabled={!presetName.trim()}
                onClick={() => {
                  if (!presetName.trim()) return;
                  onSaveChannelPreset(presetName.trim());
                  setPresetName('');
                  setShowPresetForm(false);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPresetForm(false);
                  setPresetName('');
                }}
                aria-label="Cancelar"
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPresetForm(true)}
              className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Guardar estilo actual
            </button>
          )}
        </div>

        {/* Paso 1: Caja para describir tu idea/propiedad + Nichos o Sectores Comerciales + Media real */}
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="main-idea-box"
              className="text-sm font-semibold text-[var(--text-primary)] tracking-tight"
            >
              {isCommercial
                ? '01. Describe la propiedad, local o campaña comercial'
                : '01. Escribe tu propia idea o historia'}
            </label>
            <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
              {!isCommercial && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowViralMediaDropzone((v) => !v)}
                    className={`inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      showViralMediaDropzone || pendingComposerMedia.length > 0
                        ? 'text-[#F97316] font-medium'
                        : 'hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5 text-[#F97316]" />
                    <span>
                      {pendingComposerMedia.length > 0
                        ? `Fotos/clips (${pendingComposerMedia.length})`
                        : 'Adjuntar fotos/clips'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWhatIfMixer((v) => !v)}
                    className={`inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      showWhatIfMixer
                        ? 'text-[#F97316] font-medium'
                        : 'hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Shuffle className="w-3.5 h-3.5 text-[#F97316]" />
                    <span>Combinador “¿Qué pasaría si...?”</span>
                  </button>
                </>
              )}
              {premise.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onChangePremise('');
                    setActiveNicheId(null);
                    setIdeaHint(null);
                  }}
                  className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpiar</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <textarea
              id="main-idea-box"
              rows={4}
              value={premise}
              onChange={(e) => onChangePremise(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
                  e.preventDefault();
                  onGenerateOnly(buildPayload());
                }
              }}
              placeholder={
                isCommercial
                  ? 'Describe los puntos fuertes de la propiedad o negocio, o sube tus fotos abajo... Ej: Apartamento de 185 m² con terraza panorámica, cocina italiana y 3 habitaciones frente al parque.'
                  : 'Escribe cualquier idea o haz clic en uno de los 8 nichos virales abajo... Ej: ¿Qué pasaría si aparecieras en la Antigua Roma con una bocina JBL?'
              }
              className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-4 py-3.5 text-sm sm:text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] leading-relaxed focus:outline-none focus:border-[#F97316] transition-colors resize-y min-h-[116px]"
            />

            {isCommercial ? (
              /* 6 Sectores Comerciales & Bienes Raíces */
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--text-body)]">
                    Sector comercial o inmobiliario (clic para cargar enfoque y rotar ejemplos):
                  </span>
                  <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums hidden sm:inline">
                    {premise.trim().length} caracteres · Ctrl+Enter para crear
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {COMMERCIAL_SECTORS.map((sec) => {
                    const isActive = commercialSector === sec.id;
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => handleCommercialSectorClick(sec.id)}
                        className={`min-h-[48px] px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#F97316]/12 border-[#F97316] text-[var(--text-primary)]'
                            : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-body)]'
                        }`}
                      >
                        <div className="text-xs font-semibold truncate">{sec.label}</div>
                        <div className="text-[11px] text-[var(--text-secondary)] truncate">
                          {sec.description}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {ideaHint && (
                  <p className="text-xs text-[var(--text-accent-soft)] font-medium">{ideaHint}</p>
                )}
              </div>
            ) : (
              /* Banco dinámico de 8 nichos virales rotativos + botón 🎲 Idea aleatoria */
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-body)]">
                      Ideas virales por nicho (clic repetido para rotar):
                    </span>
                    <button
                      type="button"
                      disabled={isRollingIdea}
                      onClick={() => void handleDiceRandomIdea()}
                      className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F97316]/12 hover:bg-[#F97316]/20 border border-[#F97316]/45 text-xs font-semibold text-[#EA580C] dark:text-[#FDBA74] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isRollingIdea ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                      ) : (
                        <Dices className="w-3.5 h-3.5 text-[#F97316]" />
                      )}
                      <span>{isRollingIdea ? 'Inventando...' : '🎲 Idea aleatoria'}</span>
                    </button>
                  </div>

                  <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums hidden sm:inline">
                    {premise.trim().length} caracteres · Ctrl+Enter para crear
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {VIRAL_NICHE_BANKS.map((bank) => {
                    const isActive = activeNicheId === bank.id;
                    return (
                      <button
                        key={bank.id}
                        type="button"
                        onClick={() => handleNicheIdeaRotate(bank.id)}
                        title={`Insertar idea viral aleatoria de ${bank.label} (${bank.ideas.length} ideas distintas)`}
                        className={`min-h-[42px] px-3 py-2 rounded-xl border text-left text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                          isActive
                            ? 'bg-[#F97316]/12 border-[#F97316] text-[var(--text-primary)]'
                            : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-body)]'
                        }`}
                      >
                        <span className="text-sm leading-none shrink-0" aria-hidden="true">
                          {bank.emoji}
                        </span>
                        <span className="truncate">{bank.label}</span>
                      </button>
                    );
                  })}
                </div>

                {ideaHint && (
                  <p className="text-xs text-[var(--text-accent-soft)] font-medium">{ideaHint}</p>
                )}
              </div>
            )}
          </div>

          {/* Brief Comercial (solo en modo Comercial & Bienes Raíces) */}
          {isCommercial && (
            <CommercialBriefPanel
              brief={commercialBrief}
              sector={commercialSector}
              onChange={onChangeCommercialBrief}
            />
          )}

          {/* Carga en lote de fotos y videos reales (siempre visible en Comercial, o desplegable en Viral) */}
          {(isCommercial || showViralMediaDropzone || pendingComposerMedia.length > 0) && (
            <BatchMediaDropzone
              mode="composer"
              items={pendingComposerMedia}
              onChangeItems={onChangePendingComposerMedia}
              isCommercial={isCommercial}
              isSubmitting={isGenerating || cooldownSec > 0}
              onGenerateFromMedia={() => {
                if (canSubmit) onGenerateOnly(buildPayload());
              }}
            />
          )}

          {/* Combinador opcional ¿Qué pasaría si...? (solo en modo Viral) */}
          {!isCommercial && showWhatIfMixer && (
            <div className="pt-3 border-t border-[var(--border-subtle)] grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-5 space-y-1">
                <label
                  htmlFor="home-whatif-era"
                  className="block text-xs text-[var(--text-secondary)]"
                >
                  Época histórica o situación seria
                </label>
                <select
                  id="home-whatif-era"
                  value={selectedEra}
                  onChange={(e) => {
                    setSelectedEra(e.target.value);
                    applyWhatIf(e.target.value, selectedObject);
                  }}
                  className="w-full min-h-[44px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                >
                  {WHAT_IF_ERAS.map((era) => (
                    <option key={era} value={era}>
                      {era}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-5 space-y-1">
                <label
                  htmlFor="home-whatif-obj"
                  className="block text-xs text-[var(--text-secondary)]"
                >
                  Objeto moderno o caos viral
                </label>
                <select
                  id="home-whatif-obj"
                  value={selectedObject}
                  onChange={(e) => {
                    setSelectedObject(e.target.value);
                    applyWhatIf(selectedEra, e.target.value);
                  }}
                  className="w-full min-h-[44px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                >
                  {WHAT_IF_MODERN_OBJECTS.map((obj) => (
                    <option key={obj} value={obj}>
                      {obj}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={handleRandomWhatIf}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Shuffle className="w-3.5 h-3.5 text-[#F97316]" />
                  <span>Mezclar</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Paso 2: Configuración individual (Formato, Duración, Voz humana, Estilo) */}
        <div className="pt-5 border-t border-[var(--border-subtle)] grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Columna A: Formato individual + Canal + Duración */}
          <div className="lg:col-span-5 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text-body)]">
                  02. Formato y orientación individual
                </span>
                <span className="text-xs font-mono text-[var(--text-secondary)] tabular-nums">
                  {aspectRatio}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleAspectSelect('9:16')}
                  className={`min-h-[56px] p-3 rounded-xl border text-left transition-colors flex items-center gap-3 cursor-pointer ${
                    aspectRatio === '9:16'
                      ? 'bg-[#F97316]/10 border-[#F97316] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Smartphone
                    className={`w-5 h-5 shrink-0 ${
                      aspectRatio === '9:16' ? 'text-[#F97316]' : 'text-[var(--text-muted)]'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">Vertical 9:16</div>
                    <div className="text-[11px] text-[var(--text-secondary)] truncate">
                      TikTok · Shorts · Reels
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAspectSelect('16:9')}
                  className={`min-h-[56px] p-3 rounded-xl border text-left transition-colors flex items-center gap-3 cursor-pointer ${
                    aspectRatio === '16:9'
                      ? 'bg-[#F97316]/10 border-[#F97316] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Monitor
                    className={`w-5 h-5 shrink-0 ${
                      aspectRatio === '16:9' ? 'text-[#F97316]' : 'text-[var(--text-muted)]'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">Horizontal 16:9</div>
                    <div className="text-[11px] text-[var(--text-secondary)] truncate">
                      YouTube · Alto RPM
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Canal de monetización */}
            <div className="space-y-1.5">
              <label
                htmlFor="home-platform"
                className="block text-xs font-semibold text-[var(--text-body)]"
              >
                Destino de monetización
              </label>
              <select
                id="home-platform"
                value={platform}
                onChange={(e) => {
                  const nextPlat = e.target.value as PlatformId;
                  onChangePlatform(nextPlat);
                  const found = PLATFORMS.find((p) => p.id === nextPlat);
                  if (found) onChangeAspectRatio(found.defaultRatio);
                }}
                className="w-full min-h-[44px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Blueprint Narrativo (Motor Director + Crítico de Retención) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="home-blueprint"
                  className="block text-xs font-semibold text-[var(--text-body)]"
                >
                  Blueprint narrativo
                </label>
                <span className="text-[11px] font-mono text-[#F97316]">
                  {activeBlueprintInfo.cadenceHint}
                </span>
              </div>
              <select
                id="home-blueprint"
                value={narrativeBlueprint}
                onChange={(e) =>
                  onChangeNarrativeBlueprint(e.target.value as NarrativeBlueprintSelection)
                }
                className="w-full min-h-[44px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
              >
                {availableBlueprints.map((bp) => (
                  <option key={bp.id} value={bp.id}>
                    {bp.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                {activeBlueprintInfo.description}
              </p>
            </div>

            {/* Duración exacta */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text-body)]">
                  03. Duración individual
                </span>
                <span className="text-xs font-mono text-[#F97316] tabular-nums">
                  {activeDurationObj.twistsSummary}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl">
                {DURATIONS.map((dur) => {
                  const active = durationSec === dur.value;
                  return (
                    <button
                      key={dur.value}
                      type="button"
                      onClick={() => onChangeDuration(dur.value)}
                      className={`min-h-[40px] py-2 px-1 text-xs font-mono font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer tabular-nums ${
                        active
                          ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {dur.value}s
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {activeDurationObj.monetizationBadge} ·{' '}
                {durationSec >= 60
                  ? 'Cumple duración mínima para monetizar en TikTok Creator Rewards y YouTube.'
                  : 'Formato corto exprés ideal para alcance orgánico rápido y suscriptores.'}
              </p>
            </div>
          </div>

          {/* Columna B: Voz humana natural (individual) + Estilo visual */}
          <div className="lg:col-span-7 space-y-5 lg:border-l lg:border-[var(--border-subtle)] lg:pl-6">
            {/* Selector de voz humana */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text-body)]">
                  04. Escoge tu voz humana natural
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  Activa:{' '}
                  <strong className="text-[var(--text-primary)] font-semibold">
                    {selectedVoice.name}
                  </strong>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {HUMAN_VOICE_PROFILES.map((voice) => {
                  const active = selectedVoiceId === voice.id;
                  const isVoicePlaying = playingVoiceId === voice.id;
                  return (
                    <div
                      key={voice.id}
                      className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                        active
                          ? 'bg-[#F97316]/10 border-[#F97316]'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onChangeVoiceId(voice.id)}
                        className="text-left min-w-0 flex-1 py-0.5 cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {voice.name}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] truncate">
                          {voice.label.split('·')[1]?.trim() || voice.description}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAuditionVoice(voice)}
                        aria-label={
                          isVoicePlaying
                            ? `Detener voz de ${voice.name}`
                            : `Probar voz de ${voice.name}`
                        }
                        title={isVoicePlaying ? 'Detener muestra' : 'Escuchar muestra de voz'}
                        className={`min-h-[34px] px-2 inline-flex items-center justify-center gap-1 rounded-md border text-[11px] font-medium transition-colors shrink-0 cursor-pointer ${
                          isVoicePlaying
                            ? 'bg-[#F97316]/15 border-[#F97316] text-[var(--text-accent-soft)]'
                            : 'bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border-[var(--border-strong)] text-[var(--text-primary)]'
                        }`}
                      >
                        {isVoicePlaying ? (
                          <Square className="w-3 h-3 fill-current text-[#F97316]" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-[#F97316]" />
                        )}
                        <span className="hidden sm:inline">
                          {isVoicePlaying ? 'Parar' : 'Probar'}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Público y Estilo visual (Viral) o Dirección Editorial Fotorrealista (Comercial) */}
            {isCommercial ? (
              <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                    <Camera className="w-4 h-4 text-[#F97316]" />
                    <span>05. Dirección visual editorial · {activeCommercialSector.shortLabel}</span>
                  </span>
                  <span className="text-[11px] font-mono text-[#16A34A] font-medium">
                    0% marca de agua
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Fotografía arquitectónica y comercial luminosa (estilo Architectural Digest) con movimiento
                  gimbal suave, corrección golden-hour limpia y TrueDepth 2.5D en tus fotos reales. Tus fotos
                  y clips se exportan a encuadre completo (1.0x) y el arte AI con micro-encuadre limpio.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--text-body)]">
                    05. Público y estilo visual ({activeStyleObj.shortLabel})
                  </span>
                  <div className="flex items-center gap-1 p-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg overflow-x-auto max-w-full">
                    {AUDIENCES.map((aud) => (
                      <button
                        key={aud.id}
                        type="button"
                        onClick={() => handleAudienceQuickSelect(aud.id)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          audience === aud.id
                            ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {aud.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {STYLES_3D.map((item) => {
                    const active = style3D === item.id;
                    const imgFailed = failedImages[item.id];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onChangeStyle3D(item.id);
                          if (item.id === 'viral_meme_3d') onChangeAudience('viral_meme');
                        }}
                        className={`w-28 sm:w-32 shrink-0 rounded-lg overflow-hidden border text-left transition-colors cursor-pointer ${
                          active
                            ? 'border-[#F97316] ring-1 ring-[#F97316]/40 bg-[#0B0D11]'
                            : 'border-[var(--border-subtle)] bg-[#0B0D11] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="relative h-16 w-full bg-[#0B0D11] overflow-hidden">
                          {!imgFailed ? (
                            <img
                              src={item.imageUrl}
                              alt={item.label}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setFailedImages((prev) => ({ ...prev, [item.id]: true }))
                              }
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-[#161B26] text-[#94A3B8]">
                              <Clapperboard className="w-4 h-4" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                          <div className="absolute bottom-1.5 left-2 right-2 text-[11px] font-semibold text-white truncate">
                            {item.shortLabel}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {isGenerating && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-[#F97316]/40 bg-[#F97316]/10 px-4 py-3 text-xs text-[var(--text-accent-soft)] flex items-center gap-2.5"
          >
            <Loader2 className="w-4 h-4 animate-spin text-[#F97316] shrink-0" />
            <span>
              Generando guion completo, prompts visuales de cada escena y metadatos SEO en una
              sola petición...
            </span>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-3 text-xs text-[var(--text-danger)]"
          >
            {errorMessage}
          </div>
        )}

        {/* Barra de acción final y resumen de monetización */}
        <div className="pt-5 border-t border-[var(--border-subtle)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--text-secondary)] tabular-nums">
            <span className="text-[#16A34A] font-medium">Monetización segura</span>
            <span aria-hidden="true">·</span>
            <span>Guion 100% original</span>
            <span aria-hidden="true">·</span>
            <span>Voz {selectedVoice.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              {aspectRatio} / {durationSec}s
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => onGenerateOnly(buildPayload())}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#F97316]" />
              ) : (
                <Sparkles className="w-4 h-4 text-[#F97316]" />
              )}
              <span>
                {isGenerating
                  ? 'Generando guion y prompts...'
                  : cooldownSec > 0
                    ? `Espera ${cooldownSec}s...`
                    : 'Generar guion y prompts'}
              </span>
            </button>

            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => onGenerateAndProduce(buildPayload())}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Film className="w-4 h-4" />
              )}
              <span>
                {isGenerating
                  ? 'Preparando producción...'
                  : cooldownSec > 0
                    ? `Disponible en ${cooldownSec}s`
                    : 'Crear y producir video'}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Accesos directos del estudio multimedia */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
          Herramientas del estudio audiovisual
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onOpenTool('photo_video')}
            className="group text-left bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-2.5 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <Film className="w-5 h-5 text-[#F97316]" />
              <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Animar foto a video
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Sube una imagen desde tu celular o PC, elige 9:16 o 16:9, agrega movimiento de
                cámara, voz humana, música libre de copyright y descarga en .MP4 universal.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOpenTool('image_studio')}
            className="group text-left bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-2.5 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <ImagePlus className="w-5 h-5 text-[#F97316]" />
              <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Crear y editar imágenes
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Genera ilustraciones desde texto o edita cualquier imagen con instrucciones y
                ajustes de estudio para tus portadas y escenas.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOpenTool('trends')}
            className="group text-left bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-2.5 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <Radar className="w-5 h-5 text-[#F97316]" />
              <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Radar de nichos de alto RPM
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Encuentra tendencias reales en vivo de curiosidades, consejos útiles e historias y
                conviértelas en guion en un toque.
              </p>
            </div>
          </button>
        </div>
      </section>

      {/* Sección inferior: Proyectos recientes + Monetización rápida y segura */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Proyectos recientes
            </h2>
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              {recentScripts.length} guardados
            </span>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {recentScripts.slice(0, 4).map((sc) => (
              <div
                key={sc.id}
                className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {sc.tituloViral}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] tabular-nums">
                    {sc.nicho} · <span className="font-mono">{sc.formatoVideo || '9:16'}</span> ·{' '}
                    <span className="font-mono">{sc.duracionSegundos}s</span> ·{' '}
                    {sc.escenas.length} escenas
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectRecentScript(sc, false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-body)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Abrir guion
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectRecentScript(sc, true)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Ir a video
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Estándar de monetización rápida y segura
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Cada producción de Gortex se estructura para evitar desmonetización y maximizar
              retención orgánica.
            </p>
          </div>
          <ul className="space-y-2.5 text-xs text-[var(--text-body)]">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
              <span>
                <strong className="text-[var(--text-primary)] font-semibold">
                  100% originalidad propia:
                </strong>{' '}
                guion nuevo, animación 2.5D/3D propia o clips de Google Flow y locución natural.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
              <span>
                <strong className="text-[var(--text-primary)] font-semibold">
                  Fiel a tu idea + retención:
                </strong>{' '}
                selector de ganchos de 3 segundos y ritmo adaptado a tu tema sin cortes estáticos.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
              <span>
                <strong className="text-[var(--text-primary)] font-semibold">
                  Apto para todos los nichos:
                </strong>{' '}
                historia absurda, psicología oscura, dinero en 60s, ciencia, supervivencia POV y más.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
              <span>
                <strong className="text-[var(--text-primary)] font-semibold">
                  Listo en minutos:
                </strong>{' '}
                descarga el paquete completo (.txt), subtítulos .SRT o video .MP4 sin APIs de pago.
              </span>
            </li>
          </ul>
          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-[#F97316]" />5 voces humanas cotidianas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-[#F97316]" />
              {MONETIZATION_NICHES.length} nichos rentables
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
