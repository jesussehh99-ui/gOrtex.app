export type Style3DId =
  | 'soft_storybook'
  | 'flat_kids'
  | 'paper_diorama'
  | 'viral_meme_3d'
  | 'pixar_dark'
  | 'ue5_realism'
  | 'clay_suspense'
  | 'stylized_thriller';

export type AudienceId = 'general' | 'educational' | 'kids' | 'viral_meme' | 'suspense';

export type PlatformId =
  | 'youtube_shorts'
  | 'tiktok_creativity'
  | 'instagram_reels'
  | 'youtube_long';

export type DurationOption = 30 | 60 | 90 | 120 | 180;

export type VideoAspectRatio = '9:16' | '16:9';

export type ImageAspectRatio = '9:16' | '16:9' | '1:1';

export type ShotVariationType = 'principal' | 'reaccion' | 'plano_abierto';

export type VoiceName = 'Kore' | 'Puck' | 'Zephyr' | 'Charon' | 'Fenrir';

export type PhotoMotionPreset = 'zoom_cine' | 'pan_horizontal' | 'pov_impacto' | 'flotante_suave';

export type ColorGradePreset = 'original' | 'calido' | 'cine' | 'vibrante';

export type BackgroundMusicId =
  | 'none'
  | 'commercial_lounge'
  | 'suspenso_abisal'
  | 'misterio_espacial'
  | 'tension_cinematografica'
  | 'curiosidad'
  | 'suspenso'
  | 'alegre'
  | 'epico'
  | 'comedia';

export type SafeZonePlatform = 'none' | 'tiktok' | 'shorts' | 'reels';

export type SubtitleStyleId = 'impacto' | 'cine' | 'contraste';

export type SubtitlePositionY = 'bottom' | 'lower_mid' | 'center';

export type SubtitleSize = 'sm' | 'md' | 'lg';

export type ScriptLanguage = 'es' | 'en' | 'pt';

export type VideoExportFormat = 'mp4' | 'webm';

export type RenderQualityMode = 'cine_3d' | 'classic_2d';

export type DepthMapSource = 'ai_truedepth' | 'heuristic';

export type DepthEngineBackend = 'webgpu' | 'wasm' | 'heuristic';

export interface SubtitleConfig {
  style: SubtitleStyleId;
  positionY: SubtitlePositionY;
  size: SubtitleSize;
  accentColor: string;
}

export type StudioMode = 'viral_storytelling' | 'commercial_real_estate';

export type CommercialBlueprint =
  | 'real_estate_tour'
  | 'local_business_ad'
  | 'commercial_promo';

export type CommercialSector =
  | 'luxury_home_apartment'
  | 'real_estate_development'
  | 'restaurant_cafe'
  | 'retail_storefront'
  | 'office_coworking'
  | 'commercial_service';

export interface CommercialBrief {
  businessOrPropertyName?: string;
  sector?: CommercialSector;
  priceText?: string;
  areaText?: string;
  roomsBathsText?: string;
  locationText?: string;
  promoOrHoursText?: string;
  ctaHeadline?: string;
  ctaContact?: string;
  includeCtaCard?: boolean;
}

export type BeatMediaSource = 'ai_generated' | 'user_photo' | 'user_video';

export type CommercialSpecIcon =
  | 'price'
  | 'area'
  | 'rooms'
  | 'location'
  | 'hours'
  | 'discount'
  | 'highlight';

export interface CommercialSpecBadge {
  icon: CommercialSpecIcon;
  label: string;
  value: string;
}

export interface CommercialCtaOverlay {
  headline: string;
  subheadline?: string;
  contactLine?: string;
  badge?: string;
}

export interface MultimodalPhotoInput {
  index: number;
  label?: string;
  fileName?: string;
  base64Jpeg: string;
  aspectRatio?: number;
}

export interface ChannelPreset {
  id: string;
  name: string;
  studioMode?: StudioMode;
  audience: AudienceId;
  style3D: Style3DId;
  aspectRatio: VideoAspectRatio;
  platform: PlatformId;
  durationSec: DurationOption;
  voiceProfileId: string;
  musicId: BackgroundMusicId;
  subtitleConfig: SubtitleConfig;
}

export interface HumanVoiceProfile {
  id: string;
  name: string;
  voiceName: VoiceName;
  label: string;
  description: string;
  speechStyle: string;
  sampleLine: string;
}

export type ScenePhase =
  | 'Gancho'
  | 'Desarrollo'
  | 'Dato clave'
  | 'Tensión'
  | 'Giro'
  | 'Giro 30s'
  | 'Escalada'
  | 'Cierre y Loop'
  | 'Clímax y Loop';

export type VisualEnvironmentId =
  | 'park_walking'
  | 'brain_neurons'
  | 'heart_bloodflow'
  | 'muscles_gym'
  | 'sleep_bedroom'
  | 'ancient_rome'
  | 'medieval_castle'
  | 'space_cosmos'
  | 'money_charts'
  | 'office_desk'
  | 'city_street'
  | 'tech_studio'
  | 'forest_stream'
  | 'ocean_deep'
  | 'survival_wild'
  | 'mystery_vault';

export type VisualSubjectAction =
  | 'walking_happy'
  | 'running_fast'
  | 'flexing_muscles'
  | 'stressed_head'
  | 'sleeping_peaceful'
  | 'thinking_curious'
  | 'triumphant_celebrate'
  | 'shocked_crowd'
  | 'holding_speaker'
  | 'working_focused'
  | 'counting_money'
  | 'exploring_pov';

export type VisualPropIcon =
  | 'sneakers_steps'
  | 'brain_glow'
  | 'heart_pulse'
  | 'dumbbell'
  | 'clock_calendar'
  | 'bluetooth_speaker'
  | 'coin_chart'
  | 'smartphone_glow'
  | 'compass_map'
  | 'planet_rocket'
  | 'warning_bolt'
  | 'energy_sun'
  | 'paper_boat'
  | 'coffee_cup'
  | 'shield_lock';

export type VisualMoodPalette =
  | 'warm_energy'
  | 'neon_science'
  | 'crimson_pulse'
  | 'emerald_vitality'
  | 'golden_history'
  | 'alert_stress'
  | 'cosmic_indigo'
  | 'wealth_gold'
  | 'calm_storybook'
  | 'cyber_cyan';

export interface SceneVisualSpec {
  environment: VisualEnvironmentId;
  mainSubject: VisualSubjectAction;
  propIcon: VisualPropIcon;
  moodPalette: VisualMoodPalette;
  flowPrompt: string;
}

export type NarrativeBlueprint =
  | 'pov_immersive'
  | 'classified_mystery'
  | 'historical_what_if'
  | 'escalation_ladder'
  | 'psychological_lore'
  | CommercialBlueprint;

export type NarrativeBlueprintSelection = 'auto' | NarrativeBlueprint;

export type ShotType =
  | 'WIDE_ESTABLISHING'
  | 'MEDIUM_ACTION'
  | 'CLOSE_UP_EMOTION'
  | 'EXTREME_CLOSE_UP'
  | 'LOW_ANGLE_DRAMATIC'
  | 'OVER_THE_SHOULDER'
  | 'POV_FIRST_PERSON';

export type CameraMotionPreset =
  | 'dolly_in'
  | 'dolly_out'
  | 'orbit_left'
  | 'orbit_right'
  | 'handheld_tension'
  | 'rack_focus_reveal'
  | 'push_impact';

export type FoleyCueType =
  | 'none'
  | 'sub_drop'
  | 'riser_tension'
  | 'hud_click'
  | 'whoosh_cut'
  | 'heartbeat'
  | 'thunder_impact'
  | 'analog_glitch';

export type SemanticWordStyle = 'normal' | 'emphasis' | 'danger' | 'stat' | 'whisper';

export interface SemanticWordTag {
  word: string;
  style: SemanticWordStyle;
}

export interface BeatPacingProfile {
  speedMultiplier: number; // 0.85 (pausa tensa) a 1.25 (urgencia)
  prePauseMs: number;      // silencio dramático previo al beat (0 a 450ms)
  musicDuckLevel: number;  // 0.05 (revelación) a 0.25 (normal)
}

export interface BeatHudData {
  label: string;
  value: string;
  unit?: string;
}

export type BeatRetentionRole =
  | 'hook'
  | 'setup'
  | 'escalation'
  | 're_hook'
  | 'climax'
  | 'loop_close';

export interface BeatV2 {
  id: string;
  index: number;
  narration: string;
  wordTags: SemanticWordTag[];
  visualPrompt: string;
  shotType: ShotType;
  cameraMotion: CameraMotionPreset;
  depthTitleText?: string;
  hudData?: BeatHudData;
  foleyCue: FoleyCueType;
  pacingProfile: BeatPacingProfile;
  worldStateDelta: string;
  retentionRole: BeatRetentionRole;
}

export interface RetentionAudit {
  hookVelocityScore: number; // 0-100
  reHookBeatIndex: number;
  patternInterruptCheck: string;
  loopSeamVerification: string;
}

export interface SagaMemoryUpdate {
  recurringCharacters?: string[];
  establishedLore?: string[];
  resolvedLoop?: string;
  newUnresolvedLoop?: string;
}

export interface SagaBible {
  sagaId: string;
  title: string;
  visualBible: VisualBible;
  recurringCharacters: string[];
  establishedLore: string[];
  unresolvedLoops: string[];
  episodeIds: string[];
  updatedAt: string;
}

export interface ScriptScene {
  id: string;
  orden: number;
  tiempoInicio: string;
  tiempoFin: string;
  segundoInicio: number;
  segundoFin: number;
  fase: ScenePhase;
  esGiro30s: boolean;
  narracion: string;
  subtituloDinamico: string;
  palabraDestacada: string;
  visualKeywords?: string[];
  promptVisual3D: string;
  imagePrompt?: string;
  imageSeed?: number;
  visualSpec?: SceneVisualSpec;
  movimientoCamara: string;
  transicionRapida: string;
  disenoSonoro: string;
  // Campos opcionales Módulo 2 (BeatV2, retrocompatibles con proyectos guardados)
  wordTags?: SemanticWordTag[];
  shotType?: ShotType;
  cameraMotion?: CameraMotionPreset;
  depthTitleText?: string;
  hudData?: BeatHudData;
  foleyCue?: FoleyCueType;
  pacingProfile?: BeatPacingProfile;
  worldStateDelta?: string;
  retentionRole?: BeatRetentionRole;
  // Campos opcionales Modo Comercial & Media Real Híbrida (100% retrocompatible)
  mediaSource?: BeatMediaSource;
  userMediaKey?: string;
  userMediaMimeType?: string;
  userMediaAspectRatio?: number;
  commercialSpecs?: CommercialSpecBadge[];
  isCtaBeat?: boolean;
  ctaOverlay?: CommercialCtaOverlay;
}

export type HookStyleId =
  | 'dato_perturbador'
  | 'escenario_pov'
  | 'intriga_psicologica'
  | 'curiosidad'
  | 'polemica'
  | 'humor';

export interface AlternativeHookItem {
  id: HookStyleId;
  label: string;
  subtitle: string;
  fraseApertura: string;
  impactoVisual: string;
  sonidoRompeScroll: string;
  imagePrompt?: string;
}

export interface SceneMediaAsset {
  imageDataUrl?: string;
  imageSeed?: number;
  altImageDataUrls?: string[];
  videoClipUrl?: string;
  videoClipBlob?: Blob;
  videoClipName?: string;
  videoClipDurationSec?: number;
  flowPromptEn?: string;
  audioDataUrl?: string;
  audioDurationSec?: number;
  voiceProfileId?: string;
  audioSource?: 'synth' | 'custom_mic' | 'custom_file';
  audioFileName?: string;
}

export type SceneMediaMap = Record<string, SceneMediaAsset>;

export interface GeneratedVideoItem {
  id: string;
  scriptId?: string;
  title: string;
  scopeLabel: string;
  aspectRatio: VideoAspectRatio;
  videoUrl: string;
  durationSec: number;
  voiceLabel: string;
  createdAt: string;
  extension?: VideoExportFormat;
  mimeType?: string;
}

export interface StudioImageItem {
  id: string;
  prompt: string;
  imageDataUrl: string;
  aspectRatio: ImageAspectRatio;
  style3D: Style3DId;
  createdAt: string;
}

export interface MonetizationStrategy {
  anguloRpm: string;
  nichoMonetizador: string;
  retencionObjetivo: string;
  ctaOrganico: string;
  planEjecucionRapida: string[];
}

export interface InitialHook3s {
  impactoVisual: string;
  fraseApertura: string;
  sonidoRompeScroll: string;
}

export interface PublicationMetadata {
  titulosAlternativos: string[];
  descripcionSeo: string;
  hashtags: string[];
  promptPortada?: string;
}

export interface VisualBible {
  artStyle: string;
  lightingPalette: string;
  characterOrWorldLock: string;
  fixedPrefixPrompt: string;
}

export interface ProjectStorageMeta {
  id: string;
  isFavorite: boolean;
  isDraft: boolean;
  estimatedSizeBytes: number;
  lastOpenedAt: number;
  sagaId?: string;
}

export interface ProjectSummary {
  id: string;
  tituloViral: string;
  premisa: string;
  nicho: string;
  duracionSegundos: DurationOption;
  estilo3D: Style3DId;
  plataforma: PlatformId;
  formatoVideo: VideoAspectRatio;
  creadoEn: string;
  sceneCount: number;
  sagaId?: string;
  episodeNumber?: number;
  serieNumero?: number;
  isFavorite: boolean;
  isDraft: boolean;
  estimatedSizeBytes: number;
  lastOpenedAt: number;
  hasVisualBible: boolean;
}

export interface DeletionReport {
  deletedProjectIds: string[];
  updatedSagaIds: string[];
  deletedSagaIds: string[];
  reclaimedBytes: number;
  deferredOrphans: string[];
}

export interface GarbageCollectionReport {
  orphanedEntriesRemoved: number;
  reclaimedBytes: number;
  brokenSagaRefsFixed: number;
  deferredOrphans: string[];
  sizesBackfilled: number;
}

export interface StorageTelemetry {
  totalUsageBytes: number;
  quotaBytes: number;
  usagePercent: number;
  projectsBytes: number;
  aiModelsCacheBytes: number;
  isPersisted: boolean;
  storageBackend: 'opfs' | 'indexeddb';
  pressure: 'normal' | 'warning' | 'critical';
  projectSizeMap: Record<string, number>;
}

export interface ViralScript {
  id: string;
  creadoEn: string;
  tituloViral: string;
  premisa: string;
  nicho: string;
  publicoObjetivo: AudienceId;
  duracionSegundos: DurationOption;
  estilo3D: Style3DId;
  plataforma: PlatformId;
  formatoVideo?: VideoAspectRatio;
  vozPreferidaId?: string;
  idioma?: ScriptLanguage;
  serieNumero?: number;
  serieTitulo?: string;
  ganchoInicial3Seg: InitialHook3s;
  ganchosAlternativos?: AlternativeHookItem[];
  guiaEstilo3D: string;
  visualBible?: VisualBible;
  estrategiaMonetizacion: MonetizationStrategy;
  escenas: ScriptScene[];
  loopFinal: string;
  metadatosPublicacion: PublicationMetadata;
  // Campos opcionales Módulo 2 (ProjectScriptV2, 100% retrocompatible)
  narrativeBlueprint?: NarrativeBlueprint;
  retentionAudit?: RetentionAudit;
  sagaId?: string;
  episodeNumber?: number;
  sagaMemoryUpdate?: SagaMemoryUpdate;
  // Campos opcionales de Ciclo de Vida y Almacenamiento (100% retrocompatible)
  isFavorite?: boolean;
  isDraft?: boolean;
  estimatedSizeBytes?: number;
  lastOpenedAt?: number;
  hasBeenExported?: boolean;
  // Campos opcionales Modo Comercial & Bienes Raíces (100% retrocompatible)
  studioMode?: StudioMode;
  commercialSector?: CommercialSector;
  commercialBrief?: CommercialBrief;
}

export interface ProjectScriptV2 extends ViralScript {
  narrativeBlueprint: NarrativeBlueprint;
  retentionAudit: RetentionAudit;
  beatsV2?: BeatV2[];
}

export interface TrendItem {
  id: string;
  tema: string;
  nicho: string;
  porQueMonetiza: string;
  rpmEstimado: string;
  anguloViral3D: string;
  ganchoEjemplo: string;
  duracionRecomendada: DurationOption;
  estiloRecomendado: Style3DId;
  premisaLista: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface TrendRadarResult {
  actualizadoEn: string;
  region: string;
  categoria: string;
  resumenMercado: string;
  tendencias: TrendItem[];
  fuentes: GroundingSource[];
}

export interface GenerateScriptPayload {
  premise: string;
  niche: string;
  audience: AudienceId;
  durationSec: DurationOption;
  style3D: Style3DId;
  platform: PlatformId;
  aspectRatio?: VideoAspectRatio;
  voiceProfileId?: string;
  monetizationGoal: string;
  narrativeBlueprint?: NarrativeBlueprintSelection;
  sagaBible?: SagaBible;
  includeMicroRecap?: boolean;
  studioMode?: StudioMode;
  commercialSector?: CommercialSector;
  commercialBrief?: CommercialBrief;
  multimodalPhotos?: MultimodalPhotoInput[];
}

export interface RefineScenePayload {
  scriptTitle: string;
  style3DLabel: string;
  guide3D: string;
  scene: ScriptScene;
  instruction: string;
  prevNarration?: string;
  nextNarration?: string;
}

export interface FocalPoint {
  x: number;
  y: number;
  confidence: number;
  source: 'ai_depth' | 'heuristic_depth' | 'saliency' | 'default';
}

export interface SafeZoneAuditResult {
  hasCollision: boolean;
  subtitleCollides: boolean;
  hudCollides: boolean;
  warnings: string[];
  recommendedSubtitleConfig: SubtitleConfig;
}

export interface BeatEnergyMetric {
  beatIndex: number;
  sceneId: string;
  orden: number;
  startSec: number;
  endSec: number;
  energyScore: number;
  level: 'low' | 'medium' | 'high' | 'climax';
  isDeadZone: boolean;
  deadZoneReason?: string;
  wordDensityWps: number;
  hasHud: boolean;
  hasFoley: boolean;
  summary: string;
}

export type HookVariantId = 'A' | 'B' | 'C';

export interface HookFactoryVariant {
  id: HookVariantId;
  label: string;
  angleTag: string;
  beat1Narration: string;
  beat1DepthTitle: string;
  beat1FoleyCue: FoleyCueType;
  beat2Narration: string;
  beat2DepthTitle: string;
  beat2FoleyCue: FoleyCueType;
  customImageDataUrl?: string;
  imageSeed?: number;
}

