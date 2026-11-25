import { useState } from 'react';
import { Building2, Clapperboard, Loader2, Shuffle, Sparkles } from 'lucide-react';
import {
  COMMERCIAL_SECTORS,
  DEFAULT_COMMERCIAL_BRIEF,
  getCommercialSectorById,
  isCommercialStudioMode,
  pickNextCommercialIdea,
} from '../data/commercialPresets';
import {
  AUDIENCES,
  DURATIONS,
  MONETIZATION_NICHES,
  PLATFORMS,
  STYLES_3D,
  WHAT_IF_ERAS,
  WHAT_IF_MODERN_OBJECTS,
} from '../data/presets';
import type {
  AudienceId,
  CommercialBrief,
  CommercialSector,
  DurationOption,
  GenerateScriptPayload,
  NarrativeBlueprintSelection,
  PlatformId,
  StudioMode,
  Style3DId,
} from '../types';
import {
  COMMERCIAL_BLUEPRINTS,
  getBlueprintInfo,
  VIRAL_BLUEPRINTS,
} from '../utils/retentionEngine';
import { CommercialBriefPanel } from './CommercialBriefPanel';

interface ScriptGeneratorPanelProps {
  studioMode?: StudioMode;
  commercialSector?: CommercialSector;
  commercialBrief?: CommercialBrief;
  premise: string;
  niche: string;
  audience: AudienceId;
  durationSec: DurationOption;
  style3D: Style3DId;
  platform: PlatformId;
  monetizationGoal: string;
  narrativeBlueprint: NarrativeBlueprintSelection;
  isGenerating: boolean;
  cooldownSec: number;
  errorMessage: string | null;
  onChangeStudioMode?: (mode: StudioMode) => void;
  onChangeCommercialSector?: (sector: CommercialSector) => void;
  onChangeCommercialBrief?: (brief: CommercialBrief) => void;
  onChangePremise: (val: string) => void;
  onChangeNiche: (val: string) => void;
  onChangeAudience: (val: AudienceId) => void;
  onChangeDuration: (val: DurationOption) => void;
  onChangeStyle3D: (val: Style3DId) => void;
  onChangePlatform: (val: PlatformId) => void;
  onChangeMonetizationGoal: (val: string) => void;
  onChangeNarrativeBlueprint: (val: NarrativeBlueprintSelection) => void;
  onSubmit: (payload: GenerateScriptPayload) => void;
}

type StyleGroupTab = 'familiar' | 'viral' | 'cinematografico';

function resolveStyleGroup(style: Style3DId): StyleGroupTab {
  if (style === 'viral_meme_3d') return 'viral';
  if (['soft_storybook', 'flat_kids', 'paper_diorama'].includes(style)) return 'familiar';
  return 'cinematografico';
}

export function ScriptGeneratorPanel({
  studioMode = 'viral_storytelling',
  commercialSector = 'luxury_home_apartment',
  commercialBrief = DEFAULT_COMMERCIAL_BRIEF,
  premise,
  niche,
  audience,
  durationSec,
  style3D,
  platform,
  monetizationGoal,
  narrativeBlueprint,
  isGenerating,
  cooldownSec,
  errorMessage,
  onChangeStudioMode,
  onChangeCommercialSector,
  onChangeCommercialBrief,
  onChangePremise,
  onChangeNiche,
  onChangeAudience,
  onChangeDuration,
  onChangeStyle3D,
  onChangePlatform,
  onChangeMonetizationGoal,
  onChangeNarrativeBlueprint,
  onSubmit,
}: ScriptGeneratorPanelProps) {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [styleGroup, setStyleGroup] = useState<StyleGroupTab>(() => resolveStyleGroup(style3D));

  // Estado del combinador "¿Qué pasaría si...?"
  const [selectedEra, setSelectedEra] = useState(WHAT_IF_ERAS[0]);
  const [selectedObject, setSelectedObject] = useState(WHAT_IF_MODERN_OBJECTS[0]);

  const isCommercial = isCommercialStudioMode(studioMode);
  const activeSector = getCommercialSectorById(commercialSector);
  const availableBlueprints = isCommercial ? COMMERCIAL_BLUEPRINTS : VIRAL_BLUEPRINTS;

  const handleAudienceChange = (nextAudience: AudienceId) => {
    onChangeAudience(nextAudience);
    if (nextAudience === 'viral_meme') {
      setStyleGroup('viral');
      onChangeStyle3D('viral_meme_3d');
      onChangeNiche('¿Qué pasaría si...? (Meme 3D)');
      onChangeMonetizationGoal(
        'Viralidad rápida en formato vertical con comedia 3D exagerada, POV y reacciones absurdas'
      );
      if (!premise.toLowerCase().includes('qué pasaría si')) {
        onChangePremise(
          `¿Qué pasaría si aparecieras en ${selectedEra} con ${selectedObject}?`
        );
      }
      return;
    }

    if (nextAudience === 'kids' || nextAudience === 'general' || nextAudience === 'educational') {
      setStyleGroup('familiar');
      if (!['soft_storybook', 'flat_kids', 'paper_diorama'].includes(style3D)) {
        onChangeStyle3D(nextAudience === 'kids' ? 'soft_storybook' : 'flat_kids');
      }
    } else {
      setStyleGroup('cinematografico');
      if (
        ['soft_storybook', 'flat_kids', 'paper_diorama', 'viral_meme_3d'].includes(style3D)
      ) {
        onChangeStyle3D('pixar_dark');
      }
    }
  };

  const handleNicheClick = (item: (typeof MONETIZATION_NICHES)[number]) => {
    onChangeNiche(item.label);
    onChangeAudience(item.audience);
    onChangeStyle3D(item.defaultStyle);
    onChangePremise(item.premiseTemplate);
    onChangeMonetizationGoal(item.goal);
    setStyleGroup(resolveStyleGroup(item.defaultStyle));
  };

  const applyWhatIfCombination = (era: string, obj: string) => {
    const builtPremise = `¿Qué pasaría si aparecieras en ${era} con ${obj}? Empieza en el segundo 0:00 activando el objeto frente a todos y muestra las reacciones 3D exageradas de los personajes secundarios y el caos creciente.`;
    onChangeAudience('viral_meme');
    onChangeStyle3D('viral_meme_3d');
    setStyleGroup('viral');
    onChangeNiche('¿Qué pasaría si...? (Meme 3D)');
    onChangePremise(builtPremise);
    onChangeMonetizationGoal(
      'Viralidad rápida en formato vertical (TikTok/Shorts/Reels) con humor absurdo 3D y reacciones exageradas'
    );
  };

  const handleRandomWhatIf = () => {
    const randomEra = WHAT_IF_ERAS[Math.floor(Math.random() * WHAT_IF_ERAS.length)];
    const randomObj =
      WHAT_IF_MODERN_OBJECTS[Math.floor(Math.random() * WHAT_IF_MODERN_OBJECTS.length)];
    setSelectedEra(randomEra);
    setSelectedObject(randomObj);
    applyWhatIfCombination(randomEra, randomObj);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating || cooldownSec > 0 || premise.trim().length < 8) return;
    onSubmit({
      premise,
      niche: isCommercial ? activeSector.nicheName : niche,
      audience: isCommercial ? 'general' : audience,
      durationSec,
      style3D,
      platform,
      monetizationGoal,
      narrativeBlueprint,
      studioMode,
      commercialSector: isCommercial ? commercialSector : undefined,
      commercialBrief: isCommercial ? { ...commercialBrief, sector: commercialSector } : undefined,
    });
  };

  const activeDurationObj = DURATIONS.find((d) => d.value === durationSec) ?? DURATIONS[1];
  const activeAudienceObj = AUDIENCES.find((a) => a.id === audience) ?? AUDIENCES[0];
  const activeBlueprintInfo = getBlueprintInfo(narrativeBlueprint);
  const visibleStyles = STYLES_3D.filter((s) => s.audienceTag === styleGroup);
  const showWhatIfBuilder = !isCommercial && (audience === 'viral_meme' || style3D === 'viral_meme_3d');

  return (
    <form
      onSubmit={handleFormSubmit}
      className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-5"
    >
      <div className="space-y-2.5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
            {isCommercial ? 'Constructor comercial y bienes raíces' : 'Constructor de guion y prompts'}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {isCommercial
              ? 'Configura el sector, ficha comercial y genera el guion editorial sin marca de agua.'
              : 'Elige el modo de historia, el estilo visual y genera el guion completo con sus prompts en un solo botón.'}
          </p>
        </div>

        {onChangeStudioMode && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
            <button
              type="button"
              onClick={() => onChangeStudioMode('viral_storytelling')}
              className={`py-1.5 px-2 text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                !isCommercial
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Viral</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeStudioMode('commercial_real_estate')}
              className={`py-1.5 px-2 text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                isCommercial
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Comercial</span>
            </button>
          </div>
        )}
      </div>

      {/* Público / Modo (solo Viral) */}
      {!isCommercial && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[var(--text-body)]">Modo y público</label>
          <div className="flex flex-wrap gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
            {AUDIENCES.map((aud) => {
              const active = audience === aud.id;
              return (
                <button
                  key={aud.id}
                  type="button"
                  onClick={() => handleAudienceChange(aud.id)}
                  className={`flex-1 min-w-[104px] py-2 px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F97316] ${
                    active
                      ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {aud.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">{activeAudienceObj.description}</p>
        </div>
      )}

      {/* Blueprint Narrativo */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="panel-blueprint-select" className="text-xs font-medium text-[var(--text-body)]">
            Blueprint narrativo
          </label>
          <span className="text-[10px] font-mono text-[#F97316]">
            {activeBlueprintInfo.cadenceHint}
          </span>
        </div>
        <select
          id="panel-blueprint-select"
          value={narrativeBlueprint}
          onChange={(e) =>
            onChangeNarrativeBlueprint(e.target.value as NarrativeBlueprintSelection)
          }
          className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
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

      {/* Sectores comerciales o plantillas rápidas por formato */}
      {isCommercial ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[var(--text-body)]">
            Sector comercial
          </label>
          <div className="flex flex-wrap gap-1.5">
            {COMMERCIAL_SECTORS.map((sec) => {
              const active = commercialSector === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    const { idea } = pickNextCommercialIdea(sec.id, premise);
                    onChangeCommercialSector?.(sec.id);
                    onChangeCommercialBrief?.({ ...commercialBrief, sector: sec.id });
                    onChangeNiche(sec.nicheName);
                    onChangeNarrativeBlueprint(sec.defaultBlueprint);
                    onChangeMonetizationGoal(sec.monetizationGoal);
                    onChangePremise(idea);
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[var(--bg-highlight-row)] border-[#F97316] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {sec.shortLabel}
                </button>
              );
            })}
          </div>
          {onChangeCommercialBrief && (
            <CommercialBriefPanel
              brief={commercialBrief}
              sector={commercialSector}
              onChange={onChangeCommercialBrief}
              compact
              defaultOpen={false}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[var(--text-body)]">
            Plantillas rápidas por formato
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MONETIZATION_NICHES.map((item) => {
              const active = niche === item.label;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNicheClick(item)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F97316] ${
                    active
                      ? 'bg-[var(--bg-highlight-row)] border-[#F97316] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Combinador dedicado "¿Qué pasaría si...?" (visible en modo Viral / Meme) */}
      {showWhatIfBuilder && (
        <div className="pt-4 pb-4 border-y border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#F97316]">
              Combinador “¿Qué pasaría si...?”
            </span>
            <button
              type="button"
              onClick={handleRandomWhatIf}
              className="inline-flex items-center gap-1 text-xs text-[var(--text-body)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Mezclar al azar</span>
            </button>
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <label htmlFor="whatif-era" className="block text-[11px] text-[var(--text-secondary)]">
                Época histórica o situación seria
              </label>
              <select
                id="whatif-era"
                value={selectedEra}
                onChange={(e) => {
                  const nextEra = e.target.value;
                  setSelectedEra(nextEra);
                  applyWhatIfCombination(nextEra, selectedObject);
                }}
                className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
              >
                {WHAT_IF_ERAS.map((era) => (
                  <option key={era} value={era}>
                    {era}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="whatif-object" className="block text-[11px] text-[var(--text-secondary)]">
                Objeto moderno o caos de internet
              </label>
              <select
                id="whatif-object"
                value={selectedObject}
                onChange={(e) => {
                  const nextObj = e.target.value;
                  setSelectedObject(nextObj);
                  applyWhatIfCombination(selectedEra, nextObj);
                }}
                className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
              >
                {WHAT_IF_MODERN_OBJECTS.map((obj) => (
                  <option key={obj} value={obj}>
                    {obj}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Premisa */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="premise-input" className="text-xs font-medium text-[var(--text-body)]">
            Historia o escenario del video
          </label>
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            {premise.trim().length} caracteres
          </span>
        </div>
        <textarea
          id="premise-input"
          rows={3}
          value={premise}
          onChange={(e) => onChangePremise(e.target.value)}
          placeholder="Ej. ¿Qué pasaría si aparecieras en la Antigua Roma con una bocina Bluetooth gigante?"
          className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] leading-relaxed focus:outline-none focus:border-[#F97316] transition-colors resize-y"
          required
        />
      </div>

      {/* Estilo visual: oculto en modo Comercial (usa fotografía editorial fotorrealista) */}
      {!isCommercial && (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-[var(--text-body)]">Estilo visual</label>
          <div className="flex items-center p-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md">
            <button
              type="button"
              onClick={() => setStyleGroup('familiar')}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                styleGroup === 'familiar'
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Suaves
            </button>
            <button
              type="button"
              onClick={() => {
                setStyleGroup('viral');
                onChangeStyle3D('viral_meme_3d');
              }}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                styleGroup === 'viral'
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Viral / Meme
            </button>
            <button
              type="button"
              onClick={() => setStyleGroup('cinematografico')}
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                styleGroup === 'cinematografico'
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              3D Cine
            </button>
          </div>
        </div>

        <div
          className={`grid gap-2.5 ${
            visibleStyles.length === 1
              ? 'grid-cols-1'
              : visibleStyles.length === 3
                ? 'grid-cols-3'
                : 'grid-cols-2'
          }`}
        >
          {visibleStyles.map((item) => {
            const active = style3D === item.id;
            const imgFailed = failedImages[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChangeStyle3D(item.id);
                  if (item.id === 'viral_meme_3d' && audience !== 'viral_meme') {
                    onChangeAudience('viral_meme');
                  }
                }}
                className={`group text-left rounded-lg overflow-hidden border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F97316] ${
                  active
                    ? 'border-[#F97316] ring-2 ring-[#F97316]/25'
                    : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div
                  className={`relative w-full overflow-hidden bg-[#0B0D11] ${
                    visibleStyles.length === 1 ? 'h-32' : 'h-24'
                  }`}
                >
                  {!imgFailed ? (
                    <img
                      src={item.imageUrl}
                      alt={item.label}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImages((prev) => ({ ...prev, [item.id]: true }))
                      }
                      className="h-full w-full object-cover object-center transition-transform duration-200 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#161B26] to-[#0B0D11] text-[#94A3B8] px-2 text-center">
                      <Clapperboard className="w-5 h-5 mb-1 text-[#94A3B8]" />
                      <span className="text-[11px]">{item.shortLabel}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                  <div className="absolute bottom-2 left-2.5 right-2.5">
                    <div className="text-xs font-semibold text-white truncate">
                      {visibleStyles.length === 1 ? item.label : item.shortLabel}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
          {STYLES_3D.find((s) => s.id === style3D)?.description}
        </p>
      </div>
      )}

      {/* Duración */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-[var(--text-body)]">Duración y ritmo del video</label>
          <span className="text-xs font-mono text-[#F97316] tabular-nums">
            {activeDurationObj.twistsSummary}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
          {DURATIONS.map((dur) => {
            const active = durationSec === dur.value;
            return (
              <button
                key={dur.value}
                type="button"
                onClick={() => onChangeDuration(dur.value)}
                className={`py-2 px-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums focus-visible:outline-2 focus-visible:outline-[#F97316] ${
                  active
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {dur.value}s
              </button>
            );
          })}
        </div>
      </div>

      {/* Canal */}
      <div className="space-y-2">
        <label htmlFor="platform-select" className="block text-xs font-medium text-[var(--text-body)]">
          Canal de publicación
        </label>
        <select
          id="platform-select"
          value={platform}
          onChange={(e) => onChangePlatform(e.target.value as PlatformId)}
          className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
        >
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Enfoque opcional */}
      <div className="space-y-1.5">
        <label htmlFor="goal-input" className="block text-xs font-medium text-[var(--text-body)]">
          Enfoque comercial o viral
        </label>
        <input
          id="goal-input"
          type="text"
          value={monetizationGoal}
          onChange={(e) => onChangeMonetizationGoal(e.target.value)}
          placeholder="Ej. Reacciones cómicas 3D y alta retención en Shorts/TikTok"
          className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316] transition-colors"
        />
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-3.5 py-2.5 text-xs text-[var(--text-danger)] leading-relaxed"
        >
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={isGenerating || cooldownSec > 0 || premise.trim().length < 8}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F97316]"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Generando guion, prompts y metadatos...</span>
          </>
        ) : cooldownSec > 0 ? (
          <>
            <Sparkles className="w-4 h-4" />
            <span>Espera {cooldownSec}s antes de generar otro...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            <span>Generar guion y prompts</span>
          </>
        )}
      </button>
    </form>
  );
}
