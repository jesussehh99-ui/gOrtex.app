import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Film,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  type PendingBatchMediaItem,
  USER_VIDEO_SOFT_LIMIT_BYTES,
} from '../services/userMediaIngestionService';

interface ComposerModeProps {
  mode: 'composer';
  items: PendingBatchMediaItem[];
  onChangeItems: (next: PendingBatchMediaItem[]) => void;
  isCommercial?: boolean;
  isSubmitting?: boolean;
  onGenerateFromMedia?: () => void;
}

interface BeatsModeProps {
  mode: 'beats';
  beatCount: number;
  existingUserMediaCount: number;
  isApplying?: boolean;
  onApplyToBeats: (
    files: File[],
    options: { preserveExistingUserMedia: boolean }
  ) => Promise<void>;
}

type BatchMediaDropzoneProps = ComposerModeProps | BeatsModeProps;

function formatCompactSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function createPendingItemsFromFiles(fileList: FileList | File[]): PendingBatchMediaItem[] {
  const files = Array.from(fileList);
  const created: PendingBatchMediaItem[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) continue;

    const previewUrl = URL.createObjectURL(file);
    const sizeWarning =
      isVideo && file.size > USER_VIDEO_SOFT_LIMIT_BYTES
        ? `Clip pesado (${formatCompactSize(file.size)} > 150 MB). Sigue permitido, pero exportará más lento.`
        : null;

    created.push({
      id: `media-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      kind: isVideo ? 'video' : 'photo',
      name: file.name,
      sizeBytes: file.size,
      previewUrl,
      sizeWarning,
    });
  }
  return created;
}

export function BatchMediaDropzone(props: BatchMediaDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Estado local solo para el modo 'beats' (post-guion)
  const [stagedBeatItems, setStagedBeatItems] = useState<PendingBatchMediaItem[]>([]);
  const [preserveExisting, setPreserveExisting] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const activeItems = props.mode === 'composer' ? props.items : stagedBeatItems;

  const setActiveItems = (next: PendingBatchMediaItem[]) => {
    if (props.mode === 'composer') {
      props.onChangeItems(next);
    } else {
      setStagedBeatItems(next);
    }
  };

  const handleAddFiles = (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    setLocalError(null);
    const added = createPendingItemsFromFiles(fileList);
    if (added.length === 0) {
      setLocalError('Selecciona fotos (JPG, PNG, WebP) o clips de video (MP4, WebM, MOV).');
      return;
    }
    setActiveItems([...activeItems, ...added]);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= activeItems.length) return;
    const copy = [...activeItems];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    setActiveItems(copy);
  };

  const handleRemove = (index: number) => {
    const copy = [...activeItems];
    const [removed] = copy.splice(index, 1);
    if (removed?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    setActiveItems(copy);
  };

  const handleClearAll = () => {
    for (const item of activeItems) {
      if (item.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
    setActiveItems([]);
  };

  const handleApplyStagedToBeats = async () => {
    if (props.mode !== 'beats' || stagedBeatItems.length === 0) return;
    setLocalError(null);
    const files = stagedBeatItems.map((it) => it.file);
    try {
      await props.onApplyToBeats(files, { preserveExistingUserMedia: preserveExisting });
      for (const item of stagedBeatItems) {
        if (item.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
      setStagedBeatItems([]);
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error ? err.message : 'No se pudo asignar el lote multimedia a los beats.'
      );
    }
  };

  const photoCount = activeItems.filter((it) => it.kind === 'photo').length;
  const videoCount = activeItems.filter((it) => it.kind === 'video').length;

  return (
    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-[var(--text-primary)]">
            {props.mode === 'composer'
              ? 'Tus fotos y videos reales (opcional · 100% local en OPFS)'
              : 'Carga en lote de fotos y videos reales para los beats'}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">
            {props.mode === 'composer'
              ? 'Sube fotos de tu propiedad o negocio en orden. Gemini 2.5 Flash analiza las fotos y redacta cada beat a medida; tus fotos reciben profundidad TrueDepth 2.5D.'
              : `Asigna automáticamente un lote ordenado a los ${props.beatCount} beats de este guion sin generar arte AI innecesario.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeItems.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] text-[var(--text-secondary)] hover:text-[#DC2626] transition-colors cursor-pointer"
            >
              Vaciar lote
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#F97316]" />
            <span>Elegir fotos / clips</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            className="sr-only"
            onChange={(e) => {
              handleAddFiles(e.target.files);
              e.currentTarget.value = '';
            }}
          />
        </div>
      </div>

      {/* Zona Drag & Drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleAddFiles(e.dataTransfer.files);
        }}
        onClick={() => {
          if (activeItems.length === 0) fileInputRef.current?.click();
        }}
        className={`rounded-lg border border-dashed transition-colors ${
          isDragging
            ? 'border-[#F97316] bg-[#F97316]/10'
            : 'border-[var(--border-strong)] bg-[var(--bg-card)]'
        } ${activeItems.length === 0 ? 'px-4 py-5 text-center cursor-pointer hover:border-[#F97316]/60' : 'p-2.5'}`}
      >
        {activeItems.length === 0 ? (
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
              <ImageIcon className="w-4 h-4 text-[#F97316]" />
              <span>Arrastra tus fotos (JPG, PNG, WebP) o clips (MP4, WebM, MOV) aquí</span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Las fotos se comprimen a WebP (máx. 1920px) y los clips permanecen en OPFS con recorte 1.0x sin marca de agua.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">
                {activeItems.length} {activeItems.length === 1 ? 'archivo en cola' : 'archivos en orden'}
                {photoCount > 0 ? ` · ${photoCount} fotos` : ''}
                {videoCount > 0 ? ` · ${videoCount} clips` : ''}
              </span>
              <span className="text-[var(--text-muted)]">
                Orden 1 → {activeItems.length} asignado beat a beat
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-0.5">
              {activeItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2"
                >
                  <div className="relative w-12 h-12 rounded-md overflow-hidden bg-black/80 shrink-0 flex items-center justify-center">
                    {item.kind === 'photo' ? (
                      <img
                        src={item.previewUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-white/85">
                        <Film className="w-4 h-4 text-[#F97316]" />
                        <span className="text-[9px] font-mono mt-0.5">CLIP</span>
                      </div>
                    )}
                    <span className="absolute top-0.5 left-0.5 px-1 rounded bg-black/75 text-[9px] font-mono font-semibold text-white">
                      {idx + 1}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1.5">
                      <span>{item.kind === 'photo' ? 'Foto · TrueDepth 2.5D' : 'Video · OPFS'}</span>
                      <span>·</span>
                      <span className="font-mono">{formatCompactSize(item.sizeBytes)}</span>
                    </div>
                    {item.sizeWarning && (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-[#D97706] dark:text-[#FBBF24]">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span className="truncate" title={item.sizeWarning}>
                          &gt;150 MB (lento al exportar)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMove(idx, 'up')}
                      title="Subir en el orden"
                      aria-label={`Subir archivo ${idx + 1}`}
                      className="p-1 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === activeItems.length - 1}
                      onClick={() => handleMove(idx, 'down')}
                      title="Bajar en el orden"
                      aria-label={`Bajar archivo ${idx + 1}`}
                      className="p-1 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    title="Quitar archivo"
                    aria-label={`Quitar ${item.name}`}
                    className="p-1 rounded hover:bg-[#DC2626]/10 text-[var(--text-muted)] hover:text-[#DC2626] transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {localError && (
        <div className="text-xs text-[var(--text-danger)]">{localError}</div>
      )}

      {/* Acciones finales según modo */}
      {props.mode === 'composer' && activeItems.length > 0 && props.onGenerateFromMedia && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-[11px] text-[var(--text-secondary)]">
            Se mapeará 1 a 1 cada archivo al beat correspondiente y se omitirá el arte AI en esos beats.
          </span>
          <button
            type="button"
            disabled={props.isSubmitting}
            onClick={props.onGenerateFromMedia}
            className="min-h-[38px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            {props.isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>
              {props.isCommercial
                ? 'Redactar guion comercial para estas fotos'
                : 'Redactar guion para estas fotos'}
            </span>
          </button>
        </div>
      )}

      {props.mode === 'beats' && activeItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-body)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={preserveExisting}
              onChange={(e) => setPreserveExisting(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-strong)] accent-[#F97316] cursor-pointer"
            />
            <span>
              No sobrescribir beats que ya tienen media real
              {props.existingUserMediaCount > 0 ? ` (${props.existingUserMediaCount} activos)` : ''}
            </span>
          </label>

          <button
            type="button"
            disabled={props.isApplying}
            onClick={() => void handleApplyStagedToBeats()}
            className="min-h-[38px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            {props.isApplying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>Asignar {activeItems.length} archivos a los beats</span>
          </button>
        </div>
      )}
    </div>
  );
}
