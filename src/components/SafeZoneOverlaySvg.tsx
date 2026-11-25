import type { SafeZoneAuditResult, SafeZonePlatform, VideoAspectRatio } from '../types';
import { PLATFORM_SAFE_ZONES } from '../utils/viralStressTest';

interface SafeZoneOverlaySvgProps {
  platform: SafeZonePlatform;
  aspectRatio: VideoAspectRatio;
  audit: SafeZoneAuditResult;
}

/**
 * Superposición SVG translúcida de Zonas Seguras reales para TikTok, YouTube Shorts e Instagram Reels.
 * Exclusiva del reproductor de Vista Previa (NUNCA se dibuja en el Canvas de exportación MP4).
 */
export function SafeZoneOverlaySvg({
  platform,
  aspectRatio,
  audit,
}: SafeZoneOverlaySvgProps) {
  if (platform === 'none' || aspectRatio === '16:9') return null;

  const spec = PLATFORM_SAFE_ZONES[platform];
  const topH = spec.safeTop * 1000;
  const botY = spec.safeBottom * 1000;
  const botH = 1000 - botY;
  const rightX = spec.safeRight * 562.5;
  const rightW = 562.5 - rightX;
  const rightBox = spec.dangerBoxes[1];
  const rightY = rightBox.y * 1000;
  const rightH = rightBox.h * 1000;

  const dangerStroke = audit.hasCollision ? '#EF4444' : 'rgba(248, 113, 113, 0.55)';
  const dangerFill = audit.hasCollision ? 'rgba(239, 68, 68, 0.24)' : 'rgba(239, 68, 68, 0.14)';

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 select-none overflow-hidden"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 562.5 1000"
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        <defs>
          <pattern
            id={`gortex-danger-hatch-${platform}`}
            width="12"
            height="12"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="12"
              stroke="rgba(239, 68, 68, 0.28)"
              strokeWidth="2.5"
            />
          </pattern>
        </defs>

        {/* Zona superior (barra de estado / pestañas de plataforma) */}
        <rect
          x="0"
          y="0"
          width="562.5"
          height={topH}
          fill={dangerFill}
        />
        <rect
          x="0"
          y="0"
          width="562.5"
          height={topH}
          fill={`url(#gortex-danger-hatch-${platform})`}
        />
        <line
          x1="0"
          y1={topH}
          x2="562.5"
          y2={topH}
          stroke={audit.hudCollides ? '#EF4444' : dangerStroke}
          strokeWidth={audit.hudCollides ? '3' : '1.5'}
          strokeDasharray="6 5"
        />

        {/* Mock minimalista de cabecera superior */}
        <text
          x="281.25"
          y={topH * 0.62}
          textAnchor="middle"
          fill="rgba(255,255,255,0.82)"
          fontSize="16"
          fontWeight="700"
          fontFamily="Plus Jakarta Sans, system-ui, sans-serif"
          letterSpacing="0.8"
        >
          {platform === 'tiktok'
            ? 'Siguiendo  |  Para ti'
            : platform === 'shorts'
              ? 'YouTube Shorts'
              : 'Instagram Reels'}
        </text>

        {/* Columna derecha de interacciones (avatar, like, comentarios, compartir, audio) */}
        <rect
          x={rightX}
          y={rightY}
          width={rightW}
          height={rightH}
          rx="12"
          fill={dangerFill}
          stroke={dangerStroke}
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
        {[0.14, 0.34, 0.54, 0.74, 0.9].map((ratio, idx) => {
          const cx = rightX + rightW * 0.52;
          const cy = rightY + rightH * ratio;
          const r = idx === 0 || idx === 4 ? 20 : 16;
          return (
            <g key={idx}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="rgba(255,255,255,0.18)"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth="1.6"
              />
              {idx > 0 && idx < 4 && (
                <rect
                  x={cx - 14}
                  y={cy + r + 5}
                  width="28"
                  height="5"
                  rx="2.5"
                  fill="rgba(255,255,255,0.42)"
                />
              )}
            </g>
          );
        })}

        {/* Barra inferior (usuario, caption, botón suscribirse, pista de audio) */}
        <rect
          x="0"
          y={botY}
          width="562.5"
          height={botH}
          fill={dangerFill}
        />
        <rect
          x="0"
          y={botY}
          width="562.5"
          height={botH}
          fill={`url(#gortex-danger-hatch-${platform})`}
        />
        <line
          x1="0"
          y1={botY}
          x2="562.5"
          y2={botY}
          stroke={audit.subtitleCollides ? '#EF4444' : dangerStroke}
          strokeWidth={audit.subtitleCollides ? '3.5' : '1.5'}
          strokeDasharray="6 5"
        />

        {/* Mock minimalista de bloque de usuario/descripción inferior */}
        <rect x="24" y={botY + 26} width="180" height="14" rx="4" fill="rgba(255,255,255,0.52)" />
        <rect x="24" y={botY + 52} width="320" height="10" rx="3" fill="rgba(255,255,255,0.34)" />
        <rect x="24" y={botY + 72} width="260" height="10" rx="3" fill="rgba(255,255,255,0.26)" />
        <rect x="24" y={botY + 104} width="210" height="12" rx="6" fill="rgba(255,255,255,0.24)" />

        {/* Marco punteado de ZONA SEGURA limpia */}
        <rect
          x="18"
          y={topH + 8}
          width={rightX - 28}
          height={botY - topH - 16}
          rx="10"
          fill="none"
          stroke={audit.hasCollision ? 'rgba(248, 113, 113, 0.72)' : 'rgba(52, 211, 153, 0.62)'}
          strokeWidth="1.8"
          strokeDasharray="8 6"
        />
        <text
          x="28"
          y={topH + 28}
          fill={audit.hasCollision ? '#FCA5A5' : 'rgba(110, 231, 183, 0.9)'}
          fontSize="13"
          fontWeight="700"
          fontFamily="JetBrains Mono, monospace"
        >
          {audit.hasCollision ? 'COLISIÓN DETECTADA' : `ZONA SEGURA · ${spec.shortLabel.toUpperCase()}`}
        </text>
      </svg>
    </div>
  );
}
