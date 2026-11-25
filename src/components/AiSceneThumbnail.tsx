import { useEffect, useRef, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import type { ScriptScene, VideoAspectRatio, ViralScript } from '../types';
import { useSceneArtQueue } from '../utils/aiImageQueue';
import { getSceneMoodColors } from '../utils/sceneImageUrl';

interface AiSceneThumbnailProps {
  scene: ScriptScene;
  script: ViralScript;
  aspectRatio: VideoAspectRatio;
  overrideSeed?: number;
  customImageUrl?: string;
  alt?: string;
  className?: string;
}

/**
 * Muestra una miniatura WebP ligera de la escena con carga diferida (IntersectionObserver):
 * - Solo crea una Object URL temporal del `thumbBlob` cuando la tarjeta es visible en pantalla.
 * - Revoca inmediatamente (`URL.revokeObjectURL`) la URL cuando sale del viewport o se desmonta,
 *   garantizando que las tarjetas de escena nunca retengan bitmaps globales en memoria.
 */
export function AiSceneThumbnail({
  scene,
  script,
  aspectRatio,
  overrideSeed,
  customImageUrl,
  alt,
  className = 'w-full h-full object-cover',
}: AiSceneThumbnailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(
    () => typeof IntersectionObserver === 'undefined'
  );
  const [thumbObjectUrl, setThumbObjectUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsVisible(entry.isIntersecting);
        }
      },
      { rootMargin: '120px' }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const queueState = useSceneArtQueue(
    scene,
    script,
    aspectRatio,
    overrideSeed,
    Boolean(customImageUrl)
  );

  // Crear y revocar Object URL del Blob WebP ligero únicamente mientras la tarjeta está visible
  useEffect(() => {
    if (!isVisible || customImageUrl || queueState.status !== 'ready' || !queueState.thumbBlob) {
      setThumbObjectUrl(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(queueState.thumbBlob);
    setThumbObjectUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [isVisible, customImageUrl, queueState.status, queueState.thumbBlob]);

  const mood = getSceneMoodColors(scene);
  const resolvedSrc = customImageUrl || thumbObjectUrl;
  const isArtReady = Boolean(customImageUrl) || queueState.status === 'ready';

  const statusText =
    queueState.status === 'generating'
      ? `Generando arte AI... (~${Math.max(5, queueState.waitRemainingSec)}s)`
      : queueState.status === 'retrying'
        ? `En cola (turno ${queueState.queuePosition} de ${queueState.queueTotal}) · ~${queueState.waitRemainingSec}s`
        : `En cola (turno ${queueState.queuePosition} de ${queueState.queueTotal})...`;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{
        background: `radial-gradient(circle at 50% 35%, ${mood.glow}, transparent 68%), linear-gradient(165deg, ${mood.bgTop} 0%, #070B14 55%, ${mood.bgBottom} 100%)`,
      }}
    >
      {/* Partículas sutiles de profundidad mientras la escena espera su turno */}
      {!isArtReady && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span
            className="absolute w-1.5 h-1.5 rounded-full animate-pulse opacity-55"
            style={{ top: '22%', left: '26%', backgroundColor: mood.particle }}
          />
          <span
            className="absolute w-1 h-1 rounded-full animate-pulse opacity-40"
            style={{ top: '62%', left: '72%', backgroundColor: mood.particle, animationDelay: '0.6s' }}
          />
          <span
            className="absolute w-2 h-2 rounded-full blur-[1px] animate-pulse opacity-30"
            style={{ top: '38%', left: '68%', backgroundColor: '#F97316', animationDelay: '1.1s' }}
          />
          <span
            className="absolute w-1 h-1 rounded-full animate-pulse opacity-45"
            style={{ top: '76%', left: '32%', backgroundColor: mood.particle, animationDelay: '0.9s' }}
          />
        </div>
      )}

      {resolvedSrc && (
        <img
          src={resolvedSrc}
          alt={alt ?? `Escena ${scene.orden}: ${scene.subtituloDinamico}`}
          loading="lazy"
          decoding="async"
          className={`${className} transition-opacity duration-500 opacity-100`}
        />
      )}

      {!isArtReady && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center bg-black/20">
          {queueState.status === 'generating' ? (
            <Loader2 className="w-4 h-4 text-[#F97316] animate-spin shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-[#F97316]/90 shrink-0" />
          )}
          <span className="text-[9px] leading-tight font-medium text-white/90 drop-shadow">
            {statusText}
          </span>
        </div>
      )}
    </div>
  );
}
