import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Film,
  ImagePlus,
  Loader2,
  Mic,
  Monitor,
  Smartphone,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { HUMAN_VOICE_PROFILES, STYLES_3D } from '../data/presets';
import type {
  BackgroundMusicId,
  ColorGradePreset,
  GeneratedVideoItem,
  HumanVoiceProfile,
  ImageAspectRatio,
  PhotoMotionPreset,
  SceneMediaMap,
  StudioImageItem,
  Style3DId,
  VideoAspectRatio,
  VideoExportFormat,
  ViralScript,
} from '../types';
import { downloadImageAsPng, slugifyFilename } from '../utils/exportScript';
import { editSceneSvgArt, generateSceneSvgArt } from '../services/geminiClient';
import { BACKGROUND_MUSIC_TRACKS } from '../utils/soundtrackEngine';
import { renderPhotoToVideoWebm } from '../utils/videoExporter';

interface PhotoToVideoToolProps {
  script: ViralScript;
  sceneMedia: SceneMediaMap;
  selectedVoiceId: string;
  initialImageUrl?: string | null;
  onChangeVoiceId: (id: string) => void;
  onGenerateVoiceAudio: (text: string, voice: HumanVoiceProfile) => Promise<string>;
  onVideoCreated: (video: GeneratedVideoItem, blob: Blob) => void;
}

const MOTION_OPTIONS: Array<{ id: PhotoMotionPreset; label: string; hint: string }> = [
  { id: 'zoom_cine', label: 'Zoom cinematográfico', hint: 'Acercamiento suave de alto impacto' },
  { id: 'pan_horizontal', label: 'Paneo panorámico', hint: 'Desplazamiento lateral fluido' },
  { id: 'pov_impacto', label: 'Impacto POV / Viral', hint: 'Entrada enérgica con micro-sacudida' },
  { id: 'flotante_suave', label: 'Flotación suave', hint: 'Movimiento orgánico tranquilo' },
];

const GRADE_OPTIONS: Array<{ id: ColorGradePreset; label: string }> = [
  { id: 'original', label: 'Original' },
  { id: 'calido', label: 'Cálido' },
  { id: 'cine', label: 'Cine' },
  { id: 'vibrante', label: 'Vibrante' },
];

export function PhotoToVideoTool({
  script,
  sceneMedia,
  selectedVoiceId,
  initialImageUrl,
  onChangeVoiceId,
  onGenerateVoiceAudio,
  onVideoCreated,
}: PhotoToVideoToolProps) {
  const [sourceImage, setSourceImage] = useState<string | null>(initialImageUrl || null);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(script.formatoVideo || '9:16');
  const [durationSec, setDurationSec] = useState<number>(8);
  const [motionPreset, setMotionPreset] = useState<PhotoMotionPreset>('zoom_cine');
  const [colorGrade, setColorGrade] = useState<ColorGradePreset>('original');
  const [captionText, setCaptionText] = useState('');
  const [includeVoiceover, setIncludeVoiceover] = useState(false);
  const [musicId, setMusicId] = useState<BackgroundMusicId>('none');
  const [exportFormat, setExportFormat] = useState<VideoExportFormat>('mp4');

  const [isGenerating, setIsGenerating] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (initialImageUrl) {
      setSourceImage(initialImageUrl);
      setErrorMsg(null);
    }
  }, [initialImageUrl]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const selectedVoice =
    HUMAN_VOICE_PROFILES.find((v) => v.id === selectedVoiceId) ?? HUMAN_VOICE_PROFILES[0];

  const availableSceneImages = script.escenas
    .map((sc) => ({
      id: sc.id,
      label: `Escena ${sc.orden}`,
      url: sceneMedia[sc.id]?.imageDataUrl,
    }))
    .filter((item): item is { id: string; label: string; url: string } => Boolean(item.url));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Selecciona un archivo de imagen válido (JPG, PNG o WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceImage(reader.result);
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAnimate = async () => {
    if (!sourceImage) {
      setErrorMsg('Sube una foto o elige una imagen del guion para animarla.');
      return;
    }
    setErrorMsg(null);
    setIsGenerating(true);
    setProgressPct(4);
    setProgressLabel('Preparando animación de imagen...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let audioDataUrl: string | undefined;
      if (includeVoiceover && captionText.trim().length > 2) {
        setProgressLabel(`Preparando voz en español (${selectedVoice.name})...`);
        try {
          const generated = await onGenerateVoiceAudio(captionText.trim(), selectedVoice);
          if (generated) audioDataUrl = generated;
        } catch {
          // Silencioso
        }
      }

      const result = await renderPhotoToVideoWebm({
        imageDataUrl: sourceImage,
        aspectRatio,
        durationSec,
        motionPreset,
        colorGrade,
        captionText: captionText.trim() || undefined,
        audioDataUrl,
        backgroundMusicId: musicId,
        exportFormat,
        signal: controller.signal,
        onProgress: (pct, label) => {
          setProgressPct(pct);
          setProgressLabel(label);
        },
      });

      onVideoCreated(
        {
          id: `photo-vid-${Date.now()}`,
          title: captionText.trim()
            ? captionText.trim().slice(0, 54)
            : `Foto animada (${aspectRatio})`,
          scopeLabel: 'Foto a Video',
          aspectRatio: result.aspectRatio,
          videoUrl: result.videoUrl,
          durationSec: result.durationSec,
          voiceLabel: includeVoiceover && captionText.trim() ? selectedVoice.name : 'Sin locución',
          createdAt: new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          extension: result.extension,
          mimeType: result.mimeType,
        },
        result.blob
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== 'Renderizado cancelado.') {
        setErrorMsg(err.message);
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const previewFilterClass =
    colorGrade === 'calido'
      ? 'saturate-115 sepia-[0.14]'
      : colorGrade === 'cine'
        ? 'contrast-115 saturate-90 brightness-95'
        : colorGrade === 'vibrante'
          ? 'saturate-135 contrast-105'
          : '';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Izquierda: Carga de foto y vista previa */}
      <div className="xl:col-span-5 bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Imagen base ({aspectRatio})</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Sube una foto desde tu celular o PC, o usa una escena creada.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#F97316]" />
            <span>Subir foto</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <div className="flex justify-center">
          <div
            className={`relative w-full rounded-xl overflow-hidden border border-[#2A3142] bg-[#07090D] flex items-center justify-center ${
              aspectRatio === '9:16' ? 'max-w-[290px] aspect-[9/16]' : 'aspect-video'
            }`}
          >
            {sourceImage ? (
              <>
                <img
                  src={sourceImage}
                  alt="Imagen seleccionada para animar"
                  referrerPolicy="no-referrer"
                  className={`h-full w-full object-cover ${previewFilterClass}`}
                />
                {captionText.trim() && (
                  <div className="absolute inset-x-4 bottom-6 text-center">
                    <span className="inline-block font-display font-extrabold text-base sm:text-lg uppercase text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)]">
                      {captionText.trim()}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 p-6 text-center text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
              >
                <Upload className="w-7 h-7 text-[#F97316]" />
                <span className="text-xs font-medium">Toca para subir tu foto</span>
                <span className="text-[11px] text-[#64748B]">JPG, PNG o WEBP</span>
              </button>
            )}
          </div>
        </div>

        {availableSceneImages.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-secondary)]">O elige una escena ya ilustrada:</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {availableSceneImages.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSourceImage(item.url)}
                  className={`w-16 shrink-0 rounded-lg overflow-hidden border transition-colors cursor-pointer ${
                    sourceImage === item.url ? 'border-[#F97316] ring-2 ring-[#F97316]/25' : 'border-[var(--border-subtle)]'
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.label}
                    referrerPolicy="no-referrer"
                    className="w-full aspect-[9/16] object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Derecha: Controles de animación a video */}
      <div className="xl:col-span-7 bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 sm:p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Animar imagen a video ({aspectRatio})
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Convierte cualquier fotografía o ilustración en un clip animado en 9:16 o 16:9 con
            movimiento fluido, color, subtítulos y voz humana opcional.
          </p>
        </div>

        {/* Formato 9:16 o 16:9 + Duración */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--text-body)]">Formato de salida</label>
            <div className="grid grid-cols-2 gap-2">
              {(['9:16', '16:9'] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={`min-h-[44px] inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    aspectRatio === ratio
                      ? 'bg-[var(--bg-highlight-row)] border-[#F97316] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {ratio === '9:16' ? (
                    <Smartphone className="w-3.5 h-3.5 text-[#F97316]" />
                  ) : (
                    <Monitor className="w-3.5 h-3.5 text-[#F97316]" />
                  )}
                  <span>{ratio}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--text-body)]">Duración del clip</label>
            <div className="grid grid-cols-4 gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
              {[5, 8, 12, 15].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setDurationSec(sec)}
                  className={`min-h-[38px] text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer tabular-nums ${
                    durationSec === sec
                      ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Movimiento de cámara */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[var(--text-body)]">Movimiento de cámara</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MOTION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMotionPreset(opt.id)}
                className={`min-h-[48px] p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  motionPreset === opt.id
                    ? 'bg-[var(--bg-highlight-row)] border-[#F97316] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-body)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="text-xs font-semibold">{opt.label}</div>
                <div className="text-[11px] text-[var(--text-secondary)]">{opt.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[var(--text-body)]">Acabado de color</label>
          <div className="grid grid-cols-4 gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
            {GRADE_OPTIONS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setColorGrade(g.id)}
                className={`min-h-[38px] text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  colorGrade === g.id
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Texto dinámico y locución opcional */}
        <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
          <label htmlFor="photo-caption-input" className="block text-xs font-medium text-[var(--text-body)]">
            Texto dinámico o frase a narrar (opcional)
          </label>
          <input
            id="photo-caption-input"
            type="text"
            value={captionText}
            onChange={(e) => setCaptionText(e.target.value)}
            placeholder="Ej. Nadie esperaba lo que ocurrió en el segundo 10..."
            className="w-full min-h-[44px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3.5 py-2 text-xs sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-[var(--text-body)] cursor-pointer">
              <input
                type="checkbox"
                checked={includeVoiceover}
                onChange={(e) => setIncludeVoiceover(e.target.checked)}
                className="accent-[#F97316] w-4 h-4"
              />
              <span>Narrar esta frase con voz humana natural</span>
            </label>

            {includeVoiceover && (
              <select
                value={selectedVoiceId}
                onChange={(e) => onChangeVoiceId(e.target.value)}
                className="min-h-[38px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
              >
                {HUMAN_VOICE_PROFILES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Música de fondo y formato de archivo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="photo-music-select" className="block text-xs font-medium text-[var(--text-body)]">
              Música libre de derechos
            </label>
            <select
              id="photo-music-select"
              value={musicId}
              onChange={(e) => setMusicId(e.target.value as BackgroundMusicId)}
              className="w-full min-h-[42px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
            >
              {BACKGROUND_MUSIC_TRACKS.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-[var(--text-body)]">Archivo de exportación</span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
              {(['mp4', 'webm'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setExportFormat(fmt)}
                  className={`min-h-[34px] text-xs font-mono font-semibold uppercase rounded-md transition-colors cursor-pointer ${
                    exportFormat === fmt
                      ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  .{fmt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-3.5 py-2.5 text-xs text-[var(--text-danger)]"
          >
            {errorMsg}
          </div>
        )}

        {isGenerating && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="text-[var(--text-body)]">{progressLabel}</span>
              <span className="font-mono text-[#F97316]">{progressPct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--bg-surface)] overflow-hidden border border-[var(--border-subtle)]">
              <div
                className="h-full bg-[#F97316] transition-all duration-150"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
          {isGenerating ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-[#DC2626]/15 border border-[#DC2626]/40 text-xs font-semibold text-[var(--text-danger)] hover:bg-[#DC2626]/25 cursor-pointer"
            >
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              disabled={!sourceImage}
              onClick={() => void handleAnimate()}
              className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-xs sm:text-sm font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              {includeVoiceover ? <Mic className="w-4 h-4" /> : <Film className="w-4 h-4" />}
              <span>
                Generar video {aspectRatio} (.{exportFormat.toUpperCase()})
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ImageStudioToolProps {
  defaultStyle: Style3DId;
  onSendToPhotoVideo: (imageUrl: string) => void;
}

export function ImageStudioTool({ defaultStyle, onSendToPhotoVideo }: ImageStudioToolProps) {
  const [prompt, setPrompt] = useState('');
  const [style3D, setStyle3D] = useState<Style3DId>(defaultStyle);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('9:16');
  const [isCreating, setIsCreating] = useState(false);

  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);

  const [gallery, setGallery] = useState<StudioImageItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const handleCreateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim().length < 5) {
      setErrorMsg('Describe la imagen que deseas crear (al menos 5 caracteres).');
      return;
    }
    setErrorMsg(null);
    setIsCreating(true);
    try {
      const imageDataUrl = await generateSceneSvgArt({
        promptVisual3D: prompt.trim(),
        narration: prompt.trim(),
        style3D,
        audience: style3D === 'viral_meme_3d' ? 'viral_meme' : 'general',
        sceneOrder: gallery.length + 1,
        shotType: 'principal',
        aspectRatio,
        variationIndex: gallery.length + 1,
      });

      const created: StudioImageItem = {
        id: `img-${Date.now()}`,
        prompt: prompt.trim(),
        imageDataUrl,
        aspectRatio,
        style3D,
        createdAt: new Date().toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setGallery((prev) => [created, ...prev]);
      setActiveImage(created.imageDataUrl);
      setBrightness(100);
      setContrast(100);
      setSaturate(100);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al generar la imagen.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditImageWithPrompt = async () => {
    if (!activeImage || editInstruction.trim().length < 4) {
      setErrorMsg('Selecciona o sube una imagen y escribe qué cambio quieres aplicar.');
      return;
    }
    setErrorMsg(null);
    setIsEditing(true);
    try {
      const imageDataUrl = await editSceneSvgArt({
        imageDataUrl: activeImage,
        editInstruction: editInstruction.trim(),
        aspectRatio,
        style3D,
      });
      const edited: StudioImageItem = {
        id: `img-edit-${Date.now()}`,
        prompt: `Editado: ${editInstruction.trim()}`,
        imageDataUrl,
        aspectRatio,
        style3D,
        createdAt: new Date().toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setGallery((prev) => [edited, ...prev]);
      setActiveImage(edited.imageDataUrl);
      setEditInstruction('');
      setBrightness(100);
      setContrast(100);
      setSaturate(100);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al editar la imagen.');
    } finally {
      setIsEditing(false);
    }
  };

  const handleUploadForEdit = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setActiveImage(reader.result);
        setBrightness(100);
        setContrast(100);
        setSaturate(100);
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const bakeFilteredDataUrl = async (): Promise<string | null> => {
    if (!activeImage) return null;
    if (brightness === 100 && contrast === 100 && saturate === 100) return activeImage;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const w = img.naturalWidth || 720;
        const h = img.naturalHeight || 1280;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(activeImage);
          return;
        }
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(activeImage);
      img.src = activeImage;
    });
  };

  const handleDownloadEdited = async () => {
    const baked = await bakeFilteredDataUrl();
    if (!baked) return;
    downloadImageAsPng(baked, `${slugifyFilename(prompt || 'gortex-imagen')}.png`);
  };

  const handleSendToAnimate = async () => {
    const baked = await bakeFilteredDataUrl();
    if (!baked) return;
    onSendToPhotoVideo(baked);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Izquierda: Crear imagen desde texto */}
        <form
          onSubmit={handleCreateImage}
          className="xl:col-span-5 bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 sm:p-6 space-y-4"
        >
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Crear imagen desde texto</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Crea portadas, personajes o escenas personalizadas en el estilo que elijas.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="img-create-prompt" className="block text-xs font-medium text-[var(--text-body)]">
              Describe tu imagen
            </label>
            <textarea
              id="img-create-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej. Un emperador romano en estilo 3D caricaturesco mirando asustado una bocina gigante con luces..."
              className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="img-style-select" className="block text-xs font-medium text-[var(--text-body)]">
                Estilo visual
              </label>
              <select
                id="img-style-select"
                value={style3D}
                onChange={(e) => setStyle3D(e.target.value as Style3DId)}
                className="w-full min-h-[42px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
              >
                {STYLES_3D.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-body)]">Proporción</label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
                {(['9:16', '16:9', '1:1'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAspectRatio(r)}
                    className={`min-h-[34px] text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                      aspectRatio === r
                        ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isCreating || prompt.trim().length < 5}
            className="min-h-[44px] w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{isCreating ? 'Creando imagen...' : 'Generar imagen'}</span>
          </button>
        </form>

        {/* Derecha: Editor visual + edición con texto */}
        <div className="xl:col-span-7 bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Editar imagen con texto y ajustes
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Modifica una imagen generada o sube una foto propia para reinterpretarla y animarla.
              </p>
            </div>
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Subir imagen</span>
            </button>
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              onChange={handleUploadForEdit}
              className="hidden"
            />
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-3.5 py-2.5 text-xs text-[var(--text-danger)]"
            >
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            <div className="md:col-span-6 flex justify-center">
              <div
                className={`w-full rounded-xl overflow-hidden border border-[#2A3142] bg-[#07090D] flex items-center justify-center ${
                  aspectRatio === '16:9'
                    ? 'aspect-video'
                    : aspectRatio === '1:1'
                      ? 'max-w-[320px] aspect-square'
                      : 'max-w-[280px] aspect-[9/16]'
                }`}
              >
                {activeImage ? (
                  <img
                    src={activeImage}
                    alt="Lienzo de edición"
                    referrerPolicy="no-referrer"
                    style={{
                      filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`,
                    }}
                    className="w-full h-full object-contain bg-black/40"
                  />
                ) : (
                  <div className="p-6 text-center text-xs text-[#94A3B8] space-y-2">
                    <ImagePlus className="w-7 h-7 mx-auto text-[#64748B]" />
                    <p>Genera una imagen a la izquierda o sube una foto para comenzar a editar.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-6 space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="img-edit-instruction"
                  className="block text-xs font-medium text-[var(--text-body)]"
                >
                  Instrucción de edición con IA
                </label>
                <textarea
                  id="img-edit-instruction"
                  rows={3}
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  placeholder="Ej. Cambia el cielo a un atardecer naranja y agrega confeti volando..."
                  className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
                />
                <button
                  type="button"
                  disabled={!activeImage || isEditing || editInstruction.trim().length < 4}
                  onClick={() => void handleEditImageWithPrompt()}
                  className="min-h-[42px] w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] disabled:opacity-50 text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  {isEditing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5 text-[#F97316]" />
                  )}
                  <span>{isEditing ? 'Aplicando edición...' : 'Aplicar edición con texto'}</span>
                </button>
              </div>

              <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-[var(--text-secondary)] tabular-nums">
                    <span>Brillo</span>
                    <span className="font-mono">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min={70}
                    max={135}
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full accent-[#F97316]"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-[var(--text-secondary)] tabular-nums">
                    <span>Contraste</span>
                    <span className="font-mono">{contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min={70}
                    max={145}
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full accent-[#F97316]"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-[var(--text-secondary)] tabular-nums">
                    <span>Saturación</span>
                    <span className="font-mono">{saturate}%</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={160}
                    value={saturate}
                    onChange={(e) => setSaturate(Number(e.target.value))}
                    className="w-full accent-[#F97316]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  disabled={!activeImage}
                  onClick={() => void handleSendToAnimate()}
                  className="min-h-[42px] w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Animar esta imagen a video</span>
                </button>
                <button
                  type="button"
                  disabled={!activeImage}
                  onClick={() => void handleDownloadEdited()}
                  className="min-h-[40px] w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] disabled:opacity-50 text-xs font-medium text-[var(--text-body)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar imagen (.PNG)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {gallery.length > 0 && (
        <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Imágenes creadas y editadas ({gallery.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {gallery.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveImage(item.imageDataUrl)}
                className={`rounded-lg overflow-hidden border text-left transition-colors bg-[var(--bg-surface)] cursor-pointer ${
                  activeImage === item.imageDataUrl ? 'border-[#F97316] ring-2 ring-[#F97316]/25' : 'border-[var(--border-subtle)]'
                }`}
              >
                <div
                  className={`bg-[#07090D] ${
                    item.aspectRatio === '16:9'
                      ? 'aspect-video'
                      : item.aspectRatio === '1:1'
                        ? 'aspect-square'
                        : 'aspect-[9/16]'
                  }`}
                >
                  <img
                    src={item.imageDataUrl}
                    alt={item.prompt}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2 text-[11px] text-[var(--text-body)] truncate">{item.prompt}</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
