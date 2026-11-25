import { useEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Loader2, Monitor, Smartphone, Upload } from 'lucide-react';
import type { SceneMediaMap, VideoAspectRatio, ViralScript } from '../types';
import { slugifyFilename } from '../utils/exportScript';
import { renderThumbnailDataUrl } from '../utils/thumbnailExporter';

interface ThumbnailStudioToolProps {
  script: ViralScript;
  sceneMedia: SceneMediaMap;
  fallbackImageUrl: string;
  defaultAspectRatio: VideoAspectRatio;
}

const ACCENT_SWATCHES = ['#F97316', '#FACC15', '#22C55E', '#38BDF8', '#F43F5E', '#FFFFFF'];

export function ThumbnailStudioTool({
  script,
  sceneMedia,
  fallbackImageUrl,
  defaultAspectRatio,
}: ThumbnailStudioToolProps) {
  const sceneImages = script.escenas
    .map((sc) => ({
      id: sc.id,
      label: `Escena ${sc.orden}`,
      url: sceneMedia[sc.id]?.imageDataUrl,
    }))
    .filter((item): item is { id: string; label: string; url: string } => Boolean(item.url));

  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(defaultAspectRatio);
  const [sourceImage, setSourceImage] = useState<string>(
    sceneImages[0]?.url || fallbackImageUrl
  );
  const [headline, setHeadline] = useState<string>(() => {
    const words = script.tituloViral.split(/\s+/).slice(0, 6).join(' ');
    return words.toUpperCase();
  });
  const [badgeText, setBadgeText] = useState<string>(() =>
    script.serieNumero ? `PARTE ${script.serieNumero}` : '¿SABÍAS QUÉ?'
  );
  const [accentColor, setAccentColor] = useState<string>('#F97316');
  const [darkenLevel, setDarkenLevel] = useState<number>(52);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHeadline(script.tituloViral.split(/\s+/).slice(0, 6).join(' ').toUpperCase());
    setBadgeText(script.serieNumero ? `PARTE ${script.serieNumero}` : script.nicho.split(' ')[0].toUpperCase());
    if (sceneImages[0]?.url) {
      setSourceImage(sceneImages[0].url);
    } else {
      setSourceImage(fallbackImageUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script.id]);

  useEffect(() => {
    let cancelled = false;
    setIsRendering(true);
    const timer = window.setTimeout(async () => {
      try {
        const out = await renderThumbnailDataUrl({
          imageDataUrl: sourceImage,
          aspectRatio,
          headline,
          badgeText,
          accentColor,
          darkenLevel,
        });
        if (!cancelled) setPreviewUrl(out);
      } catch {
        // Ignorar errores transitorios al escribir
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sourceImage, aspectRatio, headline, badgeText, accentColor, darkenLevel]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setSourceImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `${slugifyFilename(script.tituloViral)}-portada-${aspectRatio.replace(':', 'x')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Vista previa de portada */}
      <div className="xl:col-span-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Portada / Miniatura de alto CTR ({aspectRatio})
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {aspectRatio === '16:9'
                ? '1280×720 HD lista para YouTube'
                : '1080×1920 HD lista para portada de TikTok, Shorts y Reels'}
            </p>
          </div>
          <div className="flex items-center p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
            {(['16:9', '9:16'] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono font-medium rounded-md transition-colors cursor-pointer ${
                  aspectRatio === ratio
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {ratio === '16:9' ? (
                  <Monitor className="w-3 h-3 text-[#F97316]" />
                ) : (
                  <Smartphone className="w-3 h-3 text-[#F97316]" />
                )}
                <span>{ratio}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <div
            className={`relative w-full rounded-xl overflow-hidden border border-[#2A3142] bg-[#07090D] flex items-center justify-center ${
              aspectRatio === '9:16' ? 'max-w-[290px] aspect-[9/16]' : 'aspect-video'
            }`}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Vista previa de portada"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-xs text-[#94A3B8]">
                <Loader2 className="w-5 h-5 animate-spin text-[#F97316]" />
                <span>Generando portada...</span>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={!previewUrl || isRendering}
          onClick={handleDownload}
          className="min-h-[44px] w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Descargar portada HD (.PNG)</span>
        </button>
      </div>

      {/* Controles de diseño CTR */}
      <div className="xl:col-span-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Diseño rápido de portada</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Usa 3 a 6 palabras de alto contraste para disparar los clics antes de reproducir.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#F97316]" />
            <span>Subir fondo</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="thumb-headline" className="block text-xs font-medium text-[var(--text-body)]">
            Titular principal en portada
          </label>
          <input
            id="thumb-headline"
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Ej. LO QUE HACE TU CEREBRO AL DORMIR"
            className="w-full min-h-[44px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3.5 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
          />
          {script.metadatosPublicacion.titulosAlternativos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {script.metadatosPublicacion.titulosAlternativos.slice(0, 3).map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setHeadline(t.split(/\s+/).slice(0, 6).join(' ').toUpperCase())}
                  className="px-2 py-1 rounded bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] truncate max-w-full cursor-pointer"
                >
                  Usar: {t.slice(0, 36)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="thumb-badge" className="block text-xs font-medium text-[var(--text-body)]">
              Etiqueta superior (opcional)
            </label>
            <input
              id="thumb-badge"
              type="text"
              value={badgeText}
              onChange={(e) => setBadgeText(e.target.value)}
              placeholder="Ej. ¿SABÍAS QUÉ? · PARTE 1"
              className="w-full min-h-[42px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
            />
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-[var(--text-body)]">Color de acento CTR</span>
            <div className="flex items-center gap-2 pt-1.5">
              {ACCENT_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setAccentColor(hex)}
                  aria-label={`Color ${hex}`}
                  style={{ backgroundColor: hex }}
                  className={`w-7 h-7 rounded-md border-2 transition-transform cursor-pointer ${
                    accentColor === hex
                      ? 'border-[var(--text-primary)] ring-2 ring-[#F97316]/40 scale-110'
                      : 'border-[var(--border-strong)] opacity-85 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-[var(--text-secondary)] tabular-nums">
            <span>Contraste / oscurecimiento de fondo</span>
            <span className="font-mono">{darkenLevel}%</span>
          </div>
          <input
            type="range"
            min={20}
            max={85}
            value={darkenLevel}
            onChange={(e) => setDarkenLevel(Number(e.target.value))}
            className="w-full accent-[#F97316]"
          />
        </div>

        {sceneImages.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <ImageIcon className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Elegir imagen de tus escenas:</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sceneImages.map((item) => (
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
    </div>
  );
}
