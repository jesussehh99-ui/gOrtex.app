import { useEffect } from 'react';
import { BookOpen, CheckCircle2, Film, Sparkles, TrendingUp, Upload, X } from 'lucide-react';

interface ProFlowGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FLOW_STEPS = [
  {
    step: '01',
    title: 'Genera tu guion con Director de Arte Viral',
    detail:
      'En "Crear", elige un nicho de alto alcance o escribe tu premisa. Gemini 2.5 Flash redacta cada escena con planos distintos, subtítulos, 3 ganchos y arte AI único al instante (100% gratis).',
  },
  {
    step: '02',
    title: 'Pulir retención y variar imágenes AI',
    detail:
      'En "Guion", revisa el Panel de Retención en vivo (meta: 145–165 palabras/minuto), prueba los 3 ganchos y pulsa "Regenerar imagen" en cualquier escena hasta lograr el encuadre perfecto.',
  },
  {
    step: '03',
    title: 'Lleva tus escenas clave a Google Flow (opcional y gratis)',
    detail:
      'En "Video y Fotos", pulsa "Copiar Prompt 3D (Google Flow)" en las escenas que quieras animar con movimiento cinematográfico completo en Google Flow, descarga el clip y súbelo con "↑ Clip".',
  },
  {
    step: '04',
    title: 'Exporta tu .MP4 con voz, Ken Burns y subtítulos',
    detail:
      'Las escenas sin clip se animan automáticamente con zoom Ken Burns, golpes de cámara y partículas. Elige tu voz en español (o graba con micrófono) y pulsa "Producir video completo".',
  },
];

const PLATFORM_TIPS = [
  {
    platform: 'TikTok Creator Rewards (+60s)',
    rpmNote: 'Alto RPM · Retención > 60 seg',
    bullets: [
      'Asegura duración real entre 62s y 90s (el semáforo en "Video y Fotos" te indica si ya calificas).',
      'Usa el gancho visual + verbal en los primeros 2.5 segundos y mete un giro de dato o reacción fuerte alrededor del segundo 25–35.',
      'Cierra conectando la última frase con el inicio (loop invisible) y una pregunta corta para disparar comentarios.',
    ],
  },
  {
    platform: 'YouTube Shorts y Reels',
    rpmNote: 'Alcance masivo · Subscripciones y embudo',
    bullets: [
      'Mantén un cambio de plano o micro-corte cada 2.5 a 3 segundos (ya integrado en el lienzo de Gortex).',
      'Activa la guía de "Zonas seguras" en la vista previa para que ningún botón de UI tape tus subtítulos.',
      'Agrupa 5 guiones del mismo nicho en un video horizontal 16:9 semanal para multiplicar el RPM en YouTube.',
    ],
  },
];

export function ProFlowGuideModal({ isOpen, onClose }: ProFlowGuideModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Guía rápida de flujo profesional Gortex y Google Flow"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88dvh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl p-5 sm:p-7 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F97316]">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Guía Rápida de Flujo Profesional</span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[var(--text-primary)] tracking-tight">
              Cómo crear videos 3D de nivel estudio gratis con Gortex + Google Flow
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Sin APIs de pago ni bloqueos de cuota: combina el motor visual AI de Gortex con clips
              de Google Flow y retención optimizada.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar guía"
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 pasos del flujo Gortex + Google Flow */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <Film className="w-3.5 h-3.5 text-[#F97316]" />
            <span>Flujo de producción en 4 pasos</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FLOW_STEPS.map((item) => (
              <div
                key={item.step}
                className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#F97316]">{item.step}</span>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    {item.title}
                  </h3>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Playbook TikTok +60s y YouTube Shorts */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <TrendingUp className="w-3.5 h-3.5 text-[#F97316]" />
            <span>Claves de retención y monetización</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PLATFORM_TIPS.map((block) => (
              <div
                key={block.platform}
                className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 space-y-2.5"
              >
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {block.platform}
                  </h3>
                  <p className="text-[11px] font-mono text-[#F97316] mt-0.5">{block.rpmNote}</p>
                </div>
                <ul className="space-y-1.5">
                  {block.bullets.map((tip) => (
                    <li
                      key={tip}
                      className="flex items-start gap-2 text-xs text-[var(--text-body)] leading-relaxed"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0 mt-0.5" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Consejo rápido de flujo híbrido */}
        <div className="rounded-xl bg-[#F97316]/8 border border-[#F97316]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
              <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Truco Pro para producir 3x más rápido</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              No necesitas generar todas las escenas en Google Flow: crea solo las 2 primeras
              escenas (gancho 0:00–0:06) en Google Flow, súbelas con <Upload className="inline w-3 h-3 text-[#F97316]" />{' '}
              Clip y deja que Gortex anime el resto con arte AI único + Ken Burns.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
