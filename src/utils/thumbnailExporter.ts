import type { VideoAspectRatio } from '../types';

export interface ThumbnailRenderOptions {
  imageDataUrl: string;
  aspectRatio: VideoAspectRatio;
  headline: string;
  badgeText: string;
  accentColor: string;
  darkenLevel: number; // 0..100
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function renderThumbnailDataUrl(options: ThumbnailRenderOptions): Promise<string> {
  const { imageDataUrl, aspectRatio, headline, badgeText, accentColor, darkenLevel } = options;
  const isLandscape = aspectRatio === '16:9';
  const width = isLandscape ? 1280 : 1080;
  const height = isLandscape ? 720 : 1920;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el lienzo de portada.');

  ctx.fillStyle = '#0B0D11';
  ctx.fillRect(0, 0, width, height);

  const img = await loadImg(imageDataUrl);
  if (img) {
    const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
    const canvasRatio = width / height;
    let drawW = width;
    let drawH = height;
    if (imgRatio > canvasRatio) {
      drawH = height;
      drawW = height * imgRatio;
    } else {
      drawW = width;
      drawH = width / imgRatio;
    }
    const x = (width - drawW) / 2;
    const y = (height - drawH) / 2;
    ctx.drawImage(img, x, y, drawW, drawH);
  }

  // Viñeta + contraste profesional para alto CTR
  const darkAlpha = Math.max(0.15, Math.min(0.88, darkenLevel / 100));
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, `rgba(0,0,0,${(darkAlpha * 0.55).toFixed(2)})`);
  grad.addColorStop(0.45, `rgba(0,0,0,${(darkAlpha * 0.18).toFixed(2)})`);
  grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.94, darkAlpha + 0.25).toFixed(2)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Marco editorial sutil en color de acento
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = isLandscape ? 14 : 16;
  ctx.strokeRect(
    ctx.lineWidth / 2,
    ctx.lineWidth / 2,
    width - ctx.lineWidth,
    height - ctx.lineWidth
  );

  // Etiqueta superior limpia (si existe)
  const cleanBadge = badgeText.trim().toUpperCase();
  if (cleanBadge) {
    const badgeFontSize = isLandscape ? 32 : 38;
    ctx.font = `800 ${badgeFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    const metrics = ctx.measureText(cleanBadge);
    const padX = 28;
    const padY = 16;
    const bw = metrics.width + padX * 2;
    const bh = badgeFontSize + padY * 2;
    const bx = isLandscape ? 64 : (width - bw) / 2;
    const by = isLandscape ? 58 : 220;

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(bx, by, bw, bh, 12);
    } else {
      ctx.rect(bx, by, bw, bh);
    }
    ctx.fill();

    ctx.fillStyle = '#0B0D11';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cleanBadge, bx + bw / 2, by + bh / 2 + 2);
  }

  // Titular de alto CTR con wrap inteligente
  const cleanHeadline = headline.trim().toUpperCase();
  if (cleanHeadline) {
    const fontSize = isLandscape ? 88 : 96;
    ctx.font = `900 ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.textAlign = isLandscape ? 'left' : 'center';
    ctx.textBaseline = 'middle';

    const maxTextWidth = isLandscape ? width - 140 : width - 140;
    const words = cleanHeadline.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (ctx.measureText(test).width > maxTextWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);

    const visibleLines = lines.slice(0, 4);
    const lineHeight = fontSize * 1.12;
    const totalH = visibleLines.length * lineHeight;
    const startY = isLandscape ? height - 90 - totalH + lineHeight / 2 : height * 0.66 - totalH / 2;
    const drawX = isLandscape ? 68 : width / 2;

    visibleLines.forEach((line, idx) => {
      const y = startY + idx * lineHeight;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.lineWidth = isLandscape ? 14 : 16;
      ctx.strokeStyle = 'rgba(0,0,0,0.92)';
      ctx.strokeText(line, drawX, y);
      ctx.fillStyle = idx === visibleLines.length - 1 ? accentColor : '#FFFFFF';
      ctx.fillText(line, drawX, y);
      ctx.restore();
    });
  }

  return canvas.toDataURL('image/png');
}
