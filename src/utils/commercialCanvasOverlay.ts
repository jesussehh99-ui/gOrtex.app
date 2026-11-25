import type { CommercialSpecBadge, CommercialSpecIcon, ScriptScene, ViralScript } from '../types';

function easeOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

/**
 * Dibuja un icono vectorial minimalista sobre Canvas 2D para las fichas comerciales
 * (sin depender de emojis ni fuentes externas que varíen entre sistemas operativos).
 */
function drawCommercialSpecIcon(
  ctx: CanvasRenderingContext2D,
  icon: CommercialSpecIcon,
  cx: number,
  cy: number,
  size: number,
  color: string
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, size * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const r = size * 0.42;
  switch (icon) {
    case 'price': {
      // Etiqueta de precio / moneda
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `700 ${Math.round(size * 0.62)}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', cx, cy + size * 0.03);
      break;
    }
    case 'area': {
      // Marco cuadrado de metraje m²
      const s = r * 1.65;
      ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.25, cy + s * 0.25);
      ctx.lineTo(cx + s * 0.25, cy - s * 0.25);
      ctx.stroke();
      break;
    }
    case 'rooms': {
      // Silueta de casa / habitación
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r * 0.05);
      ctx.lineTo(cx, cy - r * 0.9);
      ctx.lineTo(cx + r, cy - r * 0.05);
      ctx.moveTo(cx - r * 0.72, cy - r * 0.1);
      ctx.lineTo(cx - r * 0.72, cy + r * 0.8);
      ctx.lineTo(cx + r * 0.72, cy + r * 0.8);
      ctx.lineTo(cx + r * 0.72, cy - r * 0.1);
      ctx.stroke();
      break;
    }
    case 'location': {
      // Pin de ubicación
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.18, r * 0.56, Math.PI, 0, false);
      ctx.lineTo(cx, cy + r * 0.92);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.18, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'hours': {
      // Reloj minimalista
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - r * 0.55);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * 0.45, cy + r * 0.2);
      ctx.stroke();
      break;
    }
    case 'discount': {
      // Porcentaje / promo
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.6, cy + r * 0.6);
      ctx.lineTo(cx + r * 0.6, cy - r * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - r * 0.45, cy - r * 0.45, r * 0.22, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.45, cy + r * 0.45, r * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    default: {
      // Destacado editorial (rombo limpio)
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.9);
      ctx.lineTo(cx + r * 0.78, cy);
      ctx.lineTo(cx, cy + r * 0.9);
      ctx.lineTo(cx - r * 0.78, cy);
      ctx.closePath();
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

function buildEffectiveSpecs(scene?: ScriptScene): CommercialSpecBadge[] {
  if (!scene) return [];
  if (Array.isArray(scene.commercialSpecs) && scene.commercialSpecs.length > 0) {
    return scene.commercialSpecs.slice(0, 3);
  }
  if (scene.hudData?.label && scene.hudData?.value) {
    const labelLower = scene.hudData.label.toLowerCase();
    const icon: CommercialSpecIcon = /precio|usd|\$|mxn|eur|desde/.test(labelLower + scene.hudData.value.toLowerCase())
      ? 'price'
      : /m²|m2|área|area|terreno|superficie/.test(labelLower + (scene.hudData.unit || '').toLowerCase())
        ? 'area'
        : /hab|rec[aá]mara|ba[ñn]o|cuarto/.test(labelLower)
          ? 'rooms'
          : /ubicaci|zona|direcci|calle|av\./.test(labelLower)
            ? 'location'
            : /horario|hora|abierto/.test(labelLower)
              ? 'hours'
              : /desc|off|promo|oferta/.test(labelLower)
                ? 'discount'
                : 'highlight';
    return [
      {
        icon,
        label: scene.hudData.label,
        value: scene.hudData.unit
          ? `${scene.hudData.value} ${scene.hudData.unit}`
          : scene.hudData.value,
      },
    ];
  }
  return [];
}

/**
 * Renderiza fichas técnicas y precios editoriales (HUD comercial limpio)
 * estrictamente dentro de las Safe Zones de TikTok / Shorts / Reels (9:16 y 16:9).
 */
export function drawCommercialSpecsHud(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: ScriptScene | undefined,
  script: ViralScript | undefined,
  localElapsed: number,
  sceneDuration: number
): boolean {
  if (!scene || script?.studioMode !== 'commercial_real_estate') return false;
  if (scene.isCtaBeat && scene.ctaOverlay?.headline) return false;

  const specs = buildEffectiveSpecs(scene);
  if (specs.length === 0) return false;

  const isLandscape = width > height;
  const scaleRef = isLandscape ? width / 1280 : width / 720;

  const enterT = easeOutCubic(Math.min(1, Math.max(0, localElapsed / 0.38)));
  const exitT =
    sceneDuration > 1.0 && localElapsed > sceneDuration - 0.25
      ? Math.max(0, (sceneDuration - localElapsed) / 0.25)
      : 1;
  const alpha = enterT * exitT;
  if (alpha <= 0.02) return false;

  const labelFontSize = Math.round((isLandscape ? 11.5 : 12) * scaleRef);
  const valueFontSize = Math.round((isLandscape ? 18 : 19.5) * scaleRef);
  const iconSize = Math.round(18 * scaleRef);
  const padX = Math.round(16 * scaleRef);
  const padY = Math.round(10 * scaleRef);
  const gap = Math.round(10 * scaleRef);
  const radius = Math.round(12 * scaleRef);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Safe Zone superior-izquierda: respeta barra superior de TikTok/Shorts/Reels (y >= 13.5% en 9:16)
  // y margen derecho libre de botones de interacción (~16% en 9:16).
  const safeLeft = isLandscape ? Math.round(width * 0.045) : Math.round(width * 0.055);
  const safeTop = isLandscape ? Math.round(height * 0.085) : Math.round(height * 0.145);
  const maxAvailableWidth = isLandscape ? width * 0.72 : width * 0.76;

  // Medir cada tarjeta comercial
  const cardMetrics = specs.map((spec) => {
    const labelText = spec.label.toUpperCase().slice(0, 22);
    const valueText = spec.value.slice(0, 28);
    ctx.font = `600 ${labelFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    const lw = ctx.measureText(labelText).width;
    ctx.font = `700 ${valueFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    const vw = ctx.measureText(valueText).width;
    const textW = Math.max(lw, vw);
    const cardW = Math.min(maxAvailableWidth, padX * 2 + iconSize + Math.round(12 * scaleRef) + textW);
    const cardH = Math.round(padY * 2 + labelFontSize + valueFontSize + 5 * scaleRef);
    return { spec, labelText, valueText, cardW, cardH };
  });

  // Posicionamiento horizontal en 16:9 o apilado limpio (máx 2 filas) en 9:16
  let cursorX = safeLeft;
  let cursorY = safeTop + (1 - enterT) * (-14 * scaleRef);

  for (let i = 0; i < cardMetrics.length; i++) {
    const item = cardMetrics[i];
    if (cursorX + item.cardW > safeLeft + maxAvailableWidth && cursorX > safeLeft) {
      cursorX = safeLeft;
      cursorY += item.cardH + gap;
    }

    const bx = cursorX;
    const by = cursorY;

    // Tarjeta blanca translúcida editorial con sombra suave y borde fino 1px
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.22)';
    ctx.shadowBlur = Math.round(18 * scaleRef);
    ctx.shadowOffsetY = Math.round(6 * scaleRef);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
    drawRoundedRectPath(ctx, bx, by, item.cardW, item.cardH, radius);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
    ctx.lineWidth = Math.max(1, 1.2 * scaleRef);
    drawRoundedRectPath(ctx, bx, by, item.cardW, item.cardH, radius);
    ctx.stroke();

    // Cápsula sutil para el icono vectorial
    const iconBoxSize = Math.round(30 * scaleRef);
    const iconBoxX = bx + padX * 0.72;
    const iconBoxY = by + (item.cardH - iconBoxSize) / 2;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
    drawRoundedRectPath(ctx, iconBoxX, iconBoxY, iconBoxSize, iconBoxSize, Math.round(8 * scaleRef));
    ctx.fill();

    drawCommercialSpecIcon(
      ctx,
      item.spec.icon,
      iconBoxX + iconBoxSize / 2,
      iconBoxY + iconBoxSize / 2,
      iconSize,
      '#0F172A'
    );

    const textX = iconBoxX + iconBoxSize + Math.round(10 * scaleRef);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = `600 ${labelFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.fillStyle = '#475569';
    ctx.fillText(item.labelText, textX, by + padY);

    ctx.font = `700 ${valueFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.fillStyle = '#0F172A';
    ctx.fillText(item.valueText, textX, by + padY + labelFontSize + Math.round(4 * scaleRef));

    cursorX += item.cardW + gap;
  }

  ctx.restore();
  return true;
}

/**
 * Renderiza la Tarjeta de Cierre CTA Comercial sobre el beat final cuando `isCtaBeat` y `ctaOverlay` están activos.
 * Diseñada con estética editorial de agencia inmobiliaria/marca y respetando Safe Zones (9:16 y 16:9).
 */
export function drawCommercialCtaOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: ScriptScene | undefined,
  script: ViralScript | undefined,
  localElapsed: number,
  sceneDuration: number
): boolean {
  if (!scene || script?.studioMode !== 'commercial_real_estate') return false;
  if (script.commercialBrief?.includeCtaCard === false) return false;

  const cta = scene.ctaOverlay;
  if (!scene.isCtaBeat || !cta?.headline) return false;

  const isLandscape = width > height;
  const scaleRef = isLandscape ? width / 1280 : width / 720;

  const enterT = easeOutCubic(Math.min(1, Math.max(0, localElapsed / 0.45)));
  const exitT =
    sceneDuration > 1.2 && localElapsed > sceneDuration - 0.2
      ? Math.max(0.85, (sceneDuration - localElapsed) / 0.2)
      : 1;
  const alpha = enterT * exitT;
  if (alpha <= 0.02) return false;

  const cardW = isLandscape ? Math.round(width * 0.56) : Math.round(width * 0.78);
  const padX = Math.round(28 * scaleRef);
  const padY = Math.round(22 * scaleRef);
  const badgeFontSize = Math.round(12 * scaleRef);
  const headlineFontSize = Math.round((isLandscape ? 28 : 26) * scaleRef);
  const subFontSize = Math.round((isLandscape ? 16 : 15) * scaleRef);
  const contactFontSize = Math.round((isLandscape ? 17 : 16) * scaleRef);

  const badgeText = (
    cta.badge ||
    script.commercialBrief?.businessOrPropertyName ||
    ''
  )
    .trim()
    .slice(0, 36);
  const headlineText = cta.headline.trim().slice(0, 56);
  const subText = (cta.subheadline || script.commercialBrief?.locationText || '').trim().slice(0, 64);
  const contactText = (cta.contactLine || script.commercialBrief?.ctaContact || '').trim().slice(0, 52);

  let innerH = headlineFontSize * 1.25;
  if (badgeText) innerH += badgeFontSize + 12 * scaleRef;
  if (subText) innerH += subFontSize * 1.3 + 8 * scaleRef;
  if (contactText) innerH += contactFontSize * 1.35 + 16 * scaleRef;
  const cardH = Math.round(padY * 2 + innerH);

  // Centrado limpio dentro del tercio medio-superior seguro (jamás colisiona con subtítulos inferiores ni UI derecha)
  const centerX = isLandscape ? width * 0.5 : width * 0.46;
  const centerY = isLandscape ? height * 0.46 : height * 0.36;
  const slideY = (1 - enterT) * (18 * scaleRef);

  const bx = Math.round(centerX - cardW / 2);
  const by = Math.round(centerY - cardH / 2 + slideY);
  const radius = Math.round(18 * scaleRef);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Fondo blanco editorial frosted + sombra cálida
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
  ctx.shadowBlur = Math.round(32 * scaleRef);
  ctx.shadowOffsetY = Math.round(12 * scaleRef);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.93)';
  drawRoundedRectPath(ctx, bx, by, cardW, cardH, radius);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
  ctx.lineWidth = Math.max(1, 1.5 * scaleRef);
  drawRoundedRectPath(ctx, bx, by, cardW, cardH, radius);
  ctx.stroke();

  let cursorY = by + padY;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const textCenterX = bx + cardW / 2;

  if (badgeText) {
    ctx.font = `700 ${badgeFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.fillStyle = '#B45309';
    ctx.fillText(badgeText.toUpperCase(), textCenterX, cursorY, cardW - padX * 2);
    cursorY += badgeFontSize + Math.round(11 * scaleRef);
  }

  ctx.font = `800 ${headlineFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.fillStyle = '#0F172A';
  ctx.fillText(headlineText, textCenterX, cursorY, cardW - padX * 2);
  cursorY += Math.round(headlineFontSize * 1.25);

  if (subText) {
    cursorY += Math.round(6 * scaleRef);
    ctx.font = `500 ${subFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.fillStyle = '#475569';
    ctx.fillText(subText, textCenterX, cursorY, cardW - padX * 2);
    cursorY += Math.round(subFontSize * 1.3);
  }

  if (contactText) {
    cursorY += Math.round(14 * scaleRef);
    const pillH = Math.round(contactFontSize * 1.85);
    ctx.font = `700 ${contactFontSize}px "JetBrains Mono", "Plus Jakarta Sans", monospace`;
    const cw = Math.min(cardW - padX * 2, ctx.measureText(contactText).width + Math.round(32 * scaleRef));
    const px = textCenterX - cw / 2;
    ctx.fillStyle = '#0F172A';
    drawRoundedRectPath(ctx, px, cursorY, cw, pillH, Math.round(10 * scaleRef));
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(contactText, textCenterX, cursorY + pillH / 2, cw - Math.round(16 * scaleRef));
  }

  ctx.restore();
  return true;
}
