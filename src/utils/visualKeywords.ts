import type { ScriptScene, SemanticWordStyle } from '../types';

export type KeywordSfxType = 'sonar' | 'em_pulse' | 'bass_impact';

export interface TimedWordToken {
  word: string;
  index: number;
  charStart: number;
  charEnd: number;
  startSec: number;
  endSec: number;
  isKeyword: boolean;
  sfxType: KeywordSfxType;
  semanticStyle: SemanticWordStyle;
}

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Extrae las palabras clave visuales de una escena combinando `visualKeywords`,
 * `palabraDestacada` y términos clave numéricos/propios detectados automáticamente.
 */
export function getSceneVisualKeywords(scene: ScriptScene): string[] {
  const collected: string[] = [];
  if (Array.isArray(scene.visualKeywords)) {
    for (const kw of scene.visualKeywords) {
      const cleaned = kw.trim();
      if (cleaned) collected.push(cleaned);
    }
  }
  if (scene.palabraDestacada && scene.palabraDestacada.trim()) {
    collected.push(scene.palabraDestacada.trim());
  }
  if (collected.length === 0) {
    // Extracción automática para guiones sin visualKeywords explícitas: cifras, códigos o sustantivos largos
    const matches = scene.narracion.match(/\b([A-Z0-9]{3,}|\d{2,}(?:\s+\w+)?)\b/g);
    if (matches) {
      collected.push(...matches.slice(0, 4));
    }
  }
  return Array.from(new Set(collected));
}

/**
 * Determina el SFX cinematográfico exacto según la naturaleza semántica de la palabra clave.
 */
export function resolveKeywordSfxType(phrase: string): KeywordSfxType {
  const norm = normalizeToken(phrase);
  if (
    /sonar|sagitario|silencio|observatorio|telescopio|auxilio|faro|bigear|vacio|abisal|profund/.test(
      norm
    )
  ) {
    return 'sonar';
  }
  if (
    /6equj5|banda|estrecha|pulso|electromagnet|civilizacion|avanzada|72|segundos|frecuencia|wow|senal|anomalia|osciloscopio/.test(
      norm
    )
  ) {
    return 'em_pulse';
  }
  return 'bass_impact';
}

/**
 * Estima la duración real de habla de una escena en segundos según sílabas, cifras y pausas de puntuación.
 */
export function estimateSpeechDurationSec(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 3;
  let weight = 0;
  for (const w of words) {
    const clean = normalizeToken(w);
    const lenFactor = Math.max(0.7, Math.min(2.2, clean.length / 5.2));
    const numBonus = /\d/.test(w) ? 0.55 : 0;
    const pauseBonus = /[.!?…]$/.test(w) ? 0.95 : /[,;:]$/.test(w) ? 0.45 : 0;
    weight += lenFactor + numBonus + pauseBonus;
  }
  // Calibrado a ritmo natural en español/inglés (~2.65 unidades/seg)
  const rawSec = weight / (2.65 * Math.max(0.7, rate));
  return Math.max(2.2, Number(rawSec.toFixed(2)));
}

/**
 * Construye una línea de tiempo milimétrica palabra por palabra distribuida por peso fonético
 * (longitud de palabra, números y pausas de puntuación) dentro de la duración real de la escena.
 */
export function buildTimedWordTokens(
  scene: ScriptScene,
  sceneDurationSec: number,
  options?: { prePauseSec?: number }
): TimedWordToken[] {
  const text = scene.narracion.trim();
  if (!text) return [];

  const tokens: Array<{ word: string; charStart: number; charEnd: number; weight: number }> = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const word = match[0];
    const clean = normalizeToken(word);
    const lenFactor = Math.max(0.65, Math.min(2.3, clean.length / 5.0));
    const numBonus = /\d/.test(word) ? 0.65 : 0;
    const pauseBonus = /[.!?…]$/.test(word) ? 0.9 : /[,;:]$/.test(word) ? 0.42 : 0;
    tokens.push({
      word,
      charStart: match.index,
      charEnd: match.index + word.length,
      weight: lenFactor + numBonus + pauseBonus,
    });
  }

  if (tokens.length === 0) return [];

  const totalWeight = tokens.reduce((acc, t) => acc + t.weight, 0);
  const safeDur = Math.max(0.5, sceneDurationSec);
  const prePauseOffset = Math.max(
    0,
    Math.min(safeDur * 0.45, Number(options?.prePauseSec ?? 0) || 0)
  );
  const speechDur = Math.max(0.35, safeDur - prePauseOffset);
  const keywords = getSceneVisualKeywords(scene);

  // Detectar coincidencias exactas de frases clave (multi-palabra y palabra única)
  const normWords = tokens.map((t) => normalizeToken(t.word));
  const keywordMask: Array<KeywordSfxType | null> = new Array(tokens.length).fill(null);

  for (const phrase of keywords) {
    const phraseWords = phrase
      .split(/\s+/)
      .map(normalizeToken)
      .filter((w) => w.length > 0);
    if (phraseWords.length === 0) continue;

    const sfx = resolveKeywordSfxType(phrase);

    // 1) Coincidencia de frase completa consecutiva
    for (let i = 0; i <= normWords.length - phraseWords.length; i++) {
      let allMatch = true;
      for (let j = 0; j < phraseWords.length; j++) {
        if (normWords[i + j] !== phraseWords[j]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        for (let j = 0; j < phraseWords.length; j++) {
          keywordMask[i + j] = sfx;
        }
      }
    }

    // 2) Respaldo para palabras clave significativas (>= 4 caracteres o códigos/números)
    if (phraseWords.length === 1) {
      const target = phraseWords[0];
      if (target.length >= 3) {
        for (let i = 0; i < normWords.length; i++) {
          if (normWords[i] === target || (target.length >= 5 && normWords[i].includes(target))) {
            keywordMask[i] = sfx;
          }
        }
      }
    }
  }

  // Mapear wordTags semánticos de BeatV2 (respetando orden o coincidencia normalizada)
  const semanticMask: Array<SemanticWordStyle | null> = new Array(tokens.length).fill(null);
  if (Array.isArray(scene.wordTags) && scene.wordTags.length > 0) {
    let searchFrom = 0;
    for (let tIdx = 0; tIdx < scene.wordTags.length; tIdx++) {
      const tag = scene.wordTags[tIdx];
      if (!tag || !tag.word) continue;
      const targetNorm = normalizeToken(tag.word);
      if (!targetNorm) continue;

      if (tIdx < normWords.length && normWords[tIdx] === targetNorm && semanticMask[tIdx] === null) {
        semanticMask[tIdx] = tag.style;
        searchFrom = Math.max(searchFrom, tIdx + 1);
        continue;
      }

      let found = -1;
      for (let k = searchFrom; k < normWords.length; k++) {
        if (normWords[k] === targetNorm && semanticMask[k] === null) {
          found = k;
          break;
        }
      }
      if (found < 0) {
        for (let k = 0; k < normWords.length; k++) {
          if (normWords[k] === targetNorm && semanticMask[k] === null) {
            found = k;
            break;
          }
        }
      }
      if (found >= 0) {
        semanticMask[found] = tag.style;
        searchFrom = Math.max(searchFrom, found + 1);
      }
    }
  }

  let cursor = prePauseOffset;
  return tokens.map((tok, idx) => {
    const segDur = (tok.weight / totalWeight) * speechDur;
    const startSec = cursor;
    const endSec = idx === tokens.length - 1 ? safeDur : cursor + segDur;
    cursor = endSec;

    const matchedSfx = keywordMask[idx];
    const explicitSemantic = semanticMask[idx];
    const isNumericStat = /\d/.test(tok.word) || /^[A-Z]{1,4}\d[A-Z0-9]{2,}$/.test(tok.word);
    const semanticStyle: SemanticWordStyle =
      explicitSemantic ?? (isNumericStat ? 'stat' : matchedSfx !== null ? 'emphasis' : 'normal');

    return {
      word: tok.word,
      index: idx,
      charStart: tok.charStart,
      charEnd: tok.charEnd,
      startSec,
      endSec,
      isKeyword: matchedSfx !== null || semanticStyle === 'danger',
      sfxType: matchedSfx ?? (semanticStyle === 'danger' ? 'bass_impact' : 'bass_impact'),
      semanticStyle,
    };
  });
}

/**
 * Encuentra el índice de palabra exacto a partir de un `charIndex` reportado por `SpeechSynthesisUtterance.onboundary`.
 */
export function findWordIndexForCharOffset(tokens: TimedWordToken[], charIndex: number): number {
  if (tokens.length === 0) return 0;
  for (let i = 0; i < tokens.length; i++) {
    if (charIndex >= tokens[i].charStart && charIndex <= tokens[i].charEnd) {
      return i;
    }
    if (charIndex < tokens[i].charStart) {
      return Math.max(0, i - 1);
    }
  }
  return tokens.length - 1;
}

/**
 * Encuentra el índice de palabra exacto según el segundo local transcurrido dentro de la escena.
 */
export function findWordIndexForTime(tokens: TimedWordToken[], localSec: number): number {
  if (tokens.length === 0) return 0;
  const clamped = Math.max(0, localSec);
  for (let i = 0; i < tokens.length; i++) {
    if (clamped < tokens[i].endSec) return i;
  }
  return tokens.length - 1;
}

export interface SceneHudMetric {
  displayFull: string;
  numericTarget: number | null;
  prefix: string;
  suffix: string;
  decimals: number;
  useThousandsSep: boolean;
  unitLabel: string;
  kickerLabel: string;
  accentType: 'cyan' | 'crimson' | 'amber';
}

const METRIC_UNIT_REGEX =
  /\b(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(%|segundos?|segs?|milisegundos?|ms|minutos?|min|horas?|d[ií]as?|a[ñn]os?|km|kil[oó]metros?|metros?|m|cm|mm|toneladas?|tons?|atm[oó]sferas?|grados?|°C|°F|millones?|mil|veces|x|MHz|GHz|Hz|kHz)\b/i;

const YEAR_REGEX = /\b(1[6-9]\d{2}|20[0-3]\d)\b/;
const CODE_REGEX = /\b([A-Z]{1,4}\d[A-Z0-9]{2,}|\d[A-Z]{2,}[A-Z0-9]{1,})\b/;

const WORD_NUMBERS_ES: Array<{ pattern: RegExp; target: number; unit: string; kicker: string }> = [
  { pattern: /\btreinta\s+veces\b/i, target: 30, unit: 'VECES MÁS POTENTE', kicker: 'INTENSIDAD' },
  { pattern: /\bcincuenta\s+a[ñn]os\b/i, target: 50, unit: 'AÑOS DE BÚSQUEDA', kicker: 'TIEMPO' },
  { pattern: /\bcuatro\s+mil\s+metros\b/i, target: 4000, unit: 'METROS DE PROFUNDIDAD', kicker: 'PROFUNDIDAD' },
  { pattern: /\bseis\s+toneladas\b/i, target: 6, unit: 'TONELADAS DE PRESIÓN', kicker: 'FUERZA' },
  { pattern: /\bdos\s+milisegundos\b/i, target: 2, unit: 'MILISEGUNDOS', kicker: 'IMPACTO' },
];

function inferHudAccent(scene: ScriptScene): 'cyan' | 'crimson' | 'amber' {
  const palette = scene.visualSpec?.moodPalette;
  if (
    scene.esGiro30s ||
    palette === 'crimson_pulse' ||
    palette === 'alert_stress'
  ) {
    return 'crimson';
  }
  if (
    palette === 'cyber_cyan' ||
    palette === 'neon_science' ||
    palette === 'cosmic_indigo'
  ) {
    return 'cyan';
  }
  return 'amber';
}

function normalizeUnitLabel(rawUnit: string): { suffix: string; label: string; kicker: string } {
  const u = rawUnit.toLowerCase();
  if (u === '%') return { suffix: '%', label: 'DATO VERIFICADO', kicker: 'MÉTRICA' };
  if (/^milisegundos?$|^ms$/.test(u)) return { suffix: ' ms', label: 'TIEMPO DE COLAPSO', kicker: 'VELOCIDAD' };
  if (/^segundos?$|^segs?$/.test(u)) return { suffix: 's', label: 'DURACIÓN EXACTA', kicker: 'REGISTRO' };
  if (/^minutos?$|^min$/.test(u)) return { suffix: ' min', label: 'TIEMPO CLAVE', kicker: 'DURACIÓN' };
  if (/^horas?$/.test(u)) return { suffix: ' h', label: 'TIEMPO TRANSCURRIDO', kicker: 'DURACIÓN' };
  if (/^d[ií]as?$/.test(u)) return { suffix: ' días', label: 'CICLO REGISTRADO', kicker: 'PLAZO' };
  if (/^a[ñn]os?$/.test(u)) return { suffix: ' años', label: 'LAPSO HISTÓRICO', kicker: 'ARCHIVO' };
  if (/^km$|^kil[oó]metros?$/.test(u)) return { suffix: ' km', label: 'DISTANCIA', kicker: 'ESCALA' };
  if (/^metros?$|^m$/.test(u)) return { suffix: ' m', label: 'PROFUNDIDAD / ALTURA', kicker: 'ESCALA' };
  if (/^toneladas?$|^tons?$/.test(u)) return { suffix: ' t', label: 'MASA / PRESIÓN', kicker: 'FUERZA' };
  if (/^atm[oó]sferas?$/.test(u)) return { suffix: ' atm', label: 'PRESIÓN EXTREMA', kicker: 'FÍSICA' };
  if (/^veces$|^x$/.test(u)) return { suffix: 'x', label: 'FACTOR DE ESCALA', kicker: 'POTENCIA' };
  if (/hz$/i.test(u)) return { suffix: ` ${rawUnit}`, label: 'FRECUENCIA DETECTADA', kicker: 'SEÑAL' };
  return { suffix: ` ${rawUnit}`, label: 'DATO CLAVE', kicker: 'REGISTRO' };
}

/**
 * Detecta automáticamente cifras, años, medidas o códigos icónicos dentro de una micro-escena
 * para renderizar una tarjeta HUD 3D oscura animada con conteo rápido en la zona superior segura.
 */
export function extractSceneHudMetric(scene?: ScriptScene): SceneHudMetric | null {
  if (!scene) return null;
  const accentType = inferHudAccent(scene);

  // 0) Priorizar BeatV2 `hudData` explícito emitido por el Director Cinematográfico
  if (scene.hudData && scene.hudData.value && scene.hudData.value.trim()) {
    const rawVal = scene.hudData.value.trim();
    const rawUnit = (scene.hudData.unit ?? '').trim();
    const rawLabel = (scene.hudData.label ?? 'DATO CLAVE').trim().toUpperCase();
    const numOnlyMatch = rawVal.match(/^([+-]?)(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(.*)$/);
    if (numOnlyMatch) {
      const signPrefix = numOnlyMatch[1] || '';
      const numPart = numOnlyMatch[2];
      const inlineTrailing = (numOnlyMatch[3] || '').trim();
      const hasThousands = /^\d{1,3}([.,]\d{3})+$/.test(numPart);
      const cleanedNum = hasThousands ? numPart.replace(/[.,]/g, '') : numPart.replace(',', '.');
      const parsed = Number.parseFloat(cleanedNum);
      if (Number.isFinite(parsed)) {
        const decimals =
          !hasThousands && cleanedNum.includes('.') ? cleanedNum.split('.')[1].length : 0;
        const combinedSuffix = [inlineTrailing, rawUnit].filter(Boolean).join(rawUnit === '%' ? '' : ' ');
        const formattedSuffix =
          combinedSuffix && !combinedSuffix.startsWith('%') && !combinedSuffix.startsWith('°')
            ? ` ${combinedSuffix}`
            : combinedSuffix;
        return {
          displayFull: `${signPrefix}${numPart}${formattedSuffix}`,
          numericTarget: parsed,
          prefix: signPrefix,
          suffix: formattedSuffix,
          decimals,
          useThousandsSep: hasThousands || Math.abs(parsed) >= 1000,
          unitLabel: rawLabel,
          kickerLabel: 'TELEMETRÍA',
          accentType,
        };
      }
    }

    return {
      displayFull: rawUnit ? `${rawVal} ${rawUnit}` : rawVal,
      numericTarget: null,
      prefix: '',
      suffix: rawUnit ? ` ${rawUnit}` : '',
      decimals: 0,
      useThousandsSep: false,
      unitLabel: rawLabel,
      kickerLabel: 'TELEMETRÍA',
      accentType,
    };
  }

  const text = `${scene.narracion} ${scene.subtituloDinamico ?? ''}`.trim();
  if (!text) return null;

  // 1) Código alfanumérico icónico (ej. 6EQUJ5)
  const codeMatch = text.match(CODE_REGEX);
  if (codeMatch && codeMatch[1] && codeMatch[1].length >= 5) {
    return {
      displayFull: codeMatch[1],
      numericTarget: null,
      prefix: '',
      suffix: '',
      decimals: 0,
      useThousandsSep: false,
      unitLabel: 'SECUENCIA ANÓMALA',
      kickerLabel: 'CÓDIGO DETECTADO',
      accentType,
    };
  }

  // 2) Número + unidad explícita (ej. "72 segundos", "4,000 metros", "95%", "11 km")
  const unitMatch = text.match(METRIC_UNIT_REGEX);
  if (unitMatch) {
    const rawNumStr = unitMatch[1];
    const rawUnit = unitMatch[2];
    const hasThousands = /^\d{1,3}([.,]\d{3})+$/.test(rawNumStr);
    const cleanedNum = hasThousands
      ? rawNumStr.replace(/[.,]/g, '')
      : rawNumStr.replace(',', '.');
    const parsed = Number.parseFloat(cleanedNum);
    if (Number.isFinite(parsed) && parsed > 0) {
      const decimals = !hasThousands && cleanedNum.includes('.') ? cleanedNum.split('.')[1].length : 0;
      const unitInfo = normalizeUnitLabel(rawUnit);
      return {
        displayFull: `${rawNumStr}${unitInfo.suffix}`,
        numericTarget: parsed,
        prefix: '',
        suffix: unitInfo.suffix,
        decimals,
        useThousandsSep: hasThousands || parsed >= 1000,
        unitLabel: unitInfo.label,
        kickerLabel: unitInfo.kicker,
        accentType,
      };
    }
  }

  // 3) Año histórico exacto (ej. "1977", "1969")
  const yearMatch = text.match(YEAR_REGEX);
  if (yearMatch) {
    const yearVal = Number.parseInt(yearMatch[1], 10);
    return {
      displayFull: String(yearVal),
      numericTarget: yearVal,
      prefix: '',
      suffix: '',
      decimals: 0,
      useThousandsSep: false,
      unitLabel: 'REGISTRO HISTÓRICO',
      kickerLabel: 'ARCHIVO',
      accentType,
    };
  }

  // 4) Cifras escritas en palabras clave (ej. "treinta veces", "cincuenta años")
  for (const item of WORD_NUMBERS_ES) {
    if (item.pattern.test(text)) {
      return {
        displayFull: `${item.target >= 1000 ? item.target.toLocaleString('en-US') : item.target}`,
        numericTarget: item.target,
        prefix: '',
        suffix: item.unit.startsWith('VECES') ? 'x' : '',
        decimals: 0,
        useThousandsSep: item.target >= 1000,
        unitLabel: item.unit,
        kickerLabel: item.kicker,
        accentType,
      };
    }
  }

  return null;
}

