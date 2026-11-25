import { useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Eraser,
  Sparkles,
} from 'lucide-react';
import {
  DEFAULT_COMMERCIAL_BRIEF,
  getCommercialSectorById,
} from '../data/commercialPresets';
import type { CommercialBrief, CommercialSector } from '../types';

interface CommercialBriefPanelProps {
  brief: CommercialBrief;
  sector: CommercialSector;
  onChange: (next: CommercialBrief) => void;
  compact?: boolean;
  defaultOpen?: boolean;
}

export function CommercialBriefPanel({
  brief,
  sector,
  onChange,
  compact = false,
  defaultOpen = true,
}: CommercialBriefPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const sectorPreset = getCommercialSectorById(sector);

  const filledCount = [
    brief.businessOrPropertyName,
    brief.priceText,
    brief.areaText,
    brief.roomsBathsText,
    brief.locationText,
    brief.promoOrHoursText,
    brief.ctaHeadline,
    brief.ctaContact,
  ].filter((v) => typeof v === 'string' && v.trim().length > 0).length;

  const updateField = <K extends keyof CommercialBrief>(key: K, value: CommercialBrief[K]) => {
    onChange({
      ...brief,
      sector,
      [key]: value,
    });
  };

  const handleLoadSectorExample = () => {
    onChange({
      ...DEFAULT_COMMERCIAL_BRIEF,
      ...brief,
      sector,
      businessOrPropertyName: sectorPreset.sampleBrief.businessOrPropertyName ?? '',
      priceText: sectorPreset.sampleBrief.priceText ?? '',
      areaText: sectorPreset.sampleBrief.areaText ?? '',
      roomsBathsText: sectorPreset.sampleBrief.roomsBathsText ?? '',
      locationText: sectorPreset.sampleBrief.locationText ?? '',
      promoOrHoursText: sectorPreset.sampleBrief.promoOrHoursText ?? '',
      ctaHeadline: sectorPreset.sampleBrief.ctaHeadline ?? 'Agenda tu visita privada',
      // Nunca pre-rellenar teléfonos falsos: dejar el contacto limpio para que el usuario ingrese el real
      ctaContact: brief.ctaContact || '',
      includeCtaCard: true,
    });
  };

  const handleClear = () => {
    onChange({
      ...DEFAULT_COMMERCIAL_BRIEF,
      sector,
      includeCtaCard: brief.includeCtaCard,
    });
  };

  return (
    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
        >
          <Building2 className="w-4 h-4 text-[#F97316] shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
              Datos de la Propiedad / Negocio (Brief Comercial)
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] truncate">
              {filledCount > 0
                ? `${filledCount} datos listos para tarjetas HUD y cierre comercial`
                : 'Opcional · Se muestran en fichas limpias y tarjeta CTA final'}
            </div>
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleLoadSectorExample}
            title="Cargar ejemplo orientativo de este sector (sin teléfonos falsos)"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-[11px] font-medium text-[var(--text-body)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-[#F97316]" />
            <span>Ejemplo</span>
          </button>
          {filledCount > 0 && (
            <button
              type="button"
              onClick={handleClear}
              title="Limpiar campos del brief"
              aria-label="Limpiar brief comercial"
              className="p-1.5 rounded-md bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--border-subtle)] space-y-3">
          <div
            className={`grid gap-2.5 ${
              compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
            }`}
          >
            <div className={compact ? 'sm:col-span-2' : 'lg:col-span-2'}>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Nombre de propiedad o negocio
              </label>
              <input
                type="text"
                value={brief.businessOrPropertyName ?? ''}
                onChange={(e) => updateField('businessOrPropertyName', e.target.value)}
                placeholder="Ej. Residencia Vista Parque / Bistró Casa Olivo"
                className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Precio / Desde
              </label>
              <input
                type="text"
                value={brief.priceText ?? ''}
                onChange={(e) => updateField('priceText', e.target.value)}
                placeholder="Ej. $345,000 USD / $1,450/mes"
                className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Superficie / Área
              </label>
              <input
                type="text"
                value={brief.areaText ?? ''}
                onChange={(e) => updateField('areaText', e.target.value)}
                placeholder="Ej. 185 m² · Terraza"
                className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Habitaciones / Baños / Capacidad
              </label>
              <input
                type="text"
                value={brief.roomsBathsText ?? ''}
                onChange={(e) => updateField('roomsBathsText', e.target.value)}
                placeholder="Ej. 3 Hab · 2.5 Baños"
                className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Ubicación / Zona
              </label>
              <input
                type="text"
                value={brief.locationText ?? ''}
                onChange={(e) => updateField('locationText', e.target.value)}
                placeholder="Ej. Zona Norte · Frente al parque"
                className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Horario o promoción vigente
              </label>
              <input
                type="text"
                value={brief.promoOrHoursText ?? ''}
                onChange={(e) => updateField('promoOrHoursText', e.target.value)}
                placeholder="Ej. Mar–Dom 8:00 a 22:00 / 20% OFF"
                className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Llamado a la acción (CTA)
              </label>
              <input
                type="text"
                value={brief.ctaHeadline ?? ''}
                onChange={(e) => updateField('ctaHeadline', e.target.value)}
                placeholder="Ej. Agenda tu visita privada"
                className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <div className={compact ? 'sm:col-span-2' : 'lg:col-span-2'}>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Contacto real (WhatsApp, web o @usuario)
              </label>
              <input
                type="text"
                value={brief.ctaContact ?? ''}
                onChange={(e) => updateField('ctaContact', e.target.value)}
                placeholder="Tu WhatsApp, sitio web o @cuenta (nunca inventamos números)"
                className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <div className={`flex items-end ${compact ? 'sm:col-span-2' : 'lg:col-span-2'}`}>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--text-body)] cursor-pointer select-none py-1.5">
                <input
                  type="checkbox"
                  checked={brief.includeCtaCard}
                  onChange={(e) => updateField('includeCtaCard', e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border-strong)] accent-[#F97316] cursor-pointer"
                />
                <span>Incluir tarjeta CTA comercial limpia en el beat final</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
