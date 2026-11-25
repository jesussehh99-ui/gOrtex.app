import type { SceneMediaMap, VideoAspectRatio, ViralScript } from '../types';
import { buildGoogleFlowPrompt } from './flowPromptBuilder';

function formatSrtTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function buildAllOrganizedClipboard(script: ViralScript): string {
  const divider = '==================================================';
  const subDivider = '--------------------------------------------------';

  const lines: string[] = [
    divider,
    'GORTEX — GUION Y PROMPTS ORGANIZADOS',
    `TÍTULO: ${script.tituloViral}`,
    `NICHO: ${script.nicho} | DURACIÓN: ${script.duracionSegundos}s | ESTILO: ${script.estilo3D}`,
    divider,
    '',
    '1. GANCHO INICIAL (0:00 - 0:03)',
    `   Frase: "${script.ganchoInicial3Seg.fraseApertura}"`,
    `   Visual: ${script.ganchoInicial3Seg.impactoVisual}`,
    `   Sonido: ${script.ganchoInicial3Seg.sonidoRompeScroll}`,
    '',
    '2. GUÍA DE ESTILO VISUAL (COPIAR EN CADA GENERACIÓN)',
    `   ${script.guiaEstilo3D}`,
    '',
    '3. GUION Y PROMPTS ORGANIZADOS POR ESCENA',
    subDivider,
  ];

  for (const scene of script.escenas) {
    const twistTag = scene.esGiro30s ? ' [GIRO 30 SEGUNDOS]' : '';
    lines.push(
      `ESCENA ${scene.orden} (${scene.tiempoInicio} - ${scene.tiempoFin}) · ${scene.fase}${twistTag}`
    );
    lines.push(`• Narración: ${scene.narracion}`);
    lines.push(
      `• Subtítulo dinámico: ${scene.subtituloDinamico} (Destacar: ${scene.palabraDestacada})`
    );
    lines.push(`• Prompt visual: ${scene.promptVisual3D}`);
    lines.push(
      `• Producción: Cámara: ${scene.movimientoCamara} | Transición: ${scene.transicionRapida} | SFX: ${scene.disenoSonoro}`
    );
    lines.push(subDivider);
  }

  lines.push('');
  lines.push('4. LOOP FINAL Y PUBLICACIÓN');
  lines.push(`• Loop: ${script.loopFinal}`);
  lines.push(`• Títulos A/B: ${script.metadatosPublicacion.titulosAlternativos.join(' | ')}`);
  lines.push(`• Descripción: ${script.metadatosPublicacion.descripcionSeo}`);
  lines.push(`• Hashtags: ${script.metadatosPublicacion.hashtags.join(' ')}`);
  lines.push('');
  lines.push('5. ESTRATEGIA DE MONETIZACIÓN');
  lines.push(`• Ángulo: ${script.estrategiaMonetizacion.anguloRpm}`);
  lines.push(`• CTA orgánico: ${script.estrategiaMonetizacion.ctaOrganico}`);

  return lines.join('\n');
}

export function buildSrtContent(script: ViralScript): string {
  const blocks: string[] = [];
  let index = 1;

  for (const scene of script.escenas) {
    const words = scene.narracion.trim().split(/\s+/).filter(Boolean);
    const duration = Math.max(1, scene.segundoFin - scene.segundoInicio);
    const chunkSize = 4;
    const chunks: string[] = [];

    for (let i = 0; i < words.length; i += chunkSize) {
      chunks.push(words.slice(i, i + chunkSize).join(' ').toUpperCase());
    }

    if (chunks.length === 0) continue;
    const step = duration / chunks.length;

    chunks.forEach((chunk, cIdx) => {
      const start = scene.segundoInicio + cIdx * step;
      const end = scene.segundoInicio + (cIdx + 1) * step;
      blocks.push(`${index}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${chunk}`);
      index += 1;
    });
  }

  return blocks.join('\n\n') + '\n';
}

export function buildAllPromptsText(script: ViralScript): string {
  const lines = [
    `GORTEX — MASTER STYLE GUIDE (${script.tituloViral}):`,
    script.guiaEstilo3D,
    '',
    '--- SCENE PROMPTS (9:16 VERTICAL) ---',
    '',
  ];

  for (const scene of script.escenas) {
    lines.push(
      `[${scene.orden}] ${scene.tiempoInicio} - ${scene.tiempoFin} (${scene.fase}${scene.esGiro30s ? ' - GIRO 30S' : ''})`
    );
    lines.push(`PROMPT: ${scene.promptVisual3D}`);
    lines.push(`CAMERA: ${scene.movimientoCamara} | TRANSITION: ${scene.transicionRapida}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function buildVoiceoverText(script: ViralScript): string {
  return script.escenas
    .map((sc) => `[${sc.tiempoInicio} - ${sc.tiempoFin}] ${sc.narracion}`)
    .join('\n\n');
}

export function buildMarkdownPack(script: ViralScript): string {
  const lines: string[] = [
    `# ${script.tituloViral}`,
    '',
    `- **Estudio:** Gortex`,
    `- **Nicho:** ${script.nicho}`,
    `- **Duración:** ${script.duracionSegundos} segundos`,
    `- **Estilo visual:** ${script.estilo3D}`,
    `- **Plataforma:** ${script.plataforma}`,
    '',
    '## Gancho de Retención Inmediata (0:00 - 0:03)',
    `- **Impacto visual:** ${script.ganchoInicial3Seg.impactoVisual}`,
    `- **Frase de apertura:** ${script.ganchoInicial3Seg.fraseApertura}`,
    `- **Sonido rompe-scroll:** ${script.ganchoInicial3Seg.sonidoRompeScroll}`,
    '',
    '## Guía de Consistencia Visual',
    '```text',
    script.guiaEstilo3D,
    '```',
    '',
    '## Estrategia de Monetización Rápida',
    `- **Ángulo RPM:** ${script.estrategiaMonetizacion.anguloRpm}`,
    `- **Nicho monetizador:** ${script.estrategiaMonetizacion.nichoMonetizador}`,
    `- **Retención objetivo:** ${script.estrategiaMonetizacion.retencionObjetivo}`,
    `- **CTA orgánico:** ${script.estrategiaMonetizacion.ctaOrganico}`,
    '',
    '### Plan de Ejecución Rápida',
    ...script.estrategiaMonetizacion.planEjecucionRapida.map((step, i) => `${i + 1}. ${step}`),
    '',
    '## Guion Cronometrado y Prompts Visuales',
    '',
  ];

  for (const scene of script.escenas) {
    lines.push(
      `### Escena ${scene.orden} · ${scene.tiempoInicio} – ${scene.tiempoFin} (${scene.fase}${scene.esGiro30s ? ' · GIRO 30S' : ''})`
    );
    lines.push(`- **Narración:** ${scene.narracion}`);
    lines.push(
      `- **Subtítulo dinámico:** ${scene.subtituloDinamico} (Destacar: ${scene.palabraDestacada})`
    );
    lines.push(`- **Prompt visual:** \`${scene.promptVisual3D}\``);
    lines.push(`- **Cámara:** ${scene.movimientoCamara}`);
    lines.push(`- **Transición rápida:** ${scene.transicionRapida}`);
    lines.push(`- **Diseño sonoro:** ${scene.disenoSonoro}`);
    lines.push('');
  }

  lines.push('## Loop Final');
  lines.push(script.loopFinal);
  lines.push('');
  lines.push('## Metadatos de Publicación');
  lines.push(
    `- **Títulos alternativos:** ${script.metadatosPublicacion.titulosAlternativos.join(' / ')}`
  );
  lines.push(`- **Descripción:** ${script.metadatosPublicacion.descripcionSeo}`);
  lines.push(`- **Hashtags:** ${script.metadatosPublicacion.hashtags.join(' ')}`);

  return lines.join('\n');
}

/**
 * Construye un paquete completo descargable (.txt) con el guion escena por escena
 * y todos los prompts 3D en inglés listos para pegar en Google Flow.
 */
export function buildCompleteScriptAndFlowPackTxt(
  script: ViralScript,
  sceneMedia: SceneMediaMap,
  aspectRatio: VideoAspectRatio
): string {
  const hr = '====================================================================';
  const subHr = '--------------------------------------------------------------------';

  const lines: string[] = [
    hr,
    `GORTEX — PAQUETE COMPLETO DE PRODUCCIÓN (${aspectRatio})`,
    `TÍTULO: ${script.tituloViral}`,
    `NICHO: ${script.nicho} | DURACIÓN: ${script.duracionSegundos}s | PLATAFORMA: ${script.plataforma}`,
    hr,
    '',
    '1. GANCHO INICIAL (0:00 - 0:03)',
    `   Frase de apertura: "${script.ganchoInicial3Seg.fraseApertura}"`,
    `   Impacto visual: ${script.ganchoInicial3Seg.impactoVisual}`,
    `   Sonido rompe-scroll: ${script.ganchoInicial3Seg.sonidoRompeScroll}`,
    '',
    '2. GUION COMPLETO Y PROMPTS 3D EN INGLÉS PARA GOOGLE FLOW',
    subHr,
  ];

  for (const scene of script.escenas) {
    const flowPromptEn = buildGoogleFlowPrompt(
      scene,
      script,
      aspectRatio,
      sceneMedia[scene.id]?.flowPromptEn
    );
    const keyTag = scene.esGiro30s ? ' [MOMENTO CLAVE]' : '';
    const langTag = (script.idioma ?? 'es').toUpperCase();
    lines.push(
      `ESCENA ${scene.orden} (${scene.tiempoInicio} - ${scene.tiempoFin}) · ${scene.fase}${keyTag}`
    );
    lines.push(`NARRACIÓN (${langTag}): ${scene.narracion}`);
    lines.push(
      `SUBTÍTULO DINÁMICO: ${scene.subtituloDinamico} (Palabra clave: ${scene.palabraDestacada})`
    );
    lines.push(
      `DIRECCIÓN: Cámara: ${scene.movimientoCamara} | Transición: ${scene.transicionRapida} | SFX: ${scene.disenoSonoro}`
    );
    lines.push('');
    lines.push(`PROMPT 3D GOOGLE FLOW (EN - Copiar y pegar tal cual):`);
    lines.push(flowPromptEn);
    lines.push(subHr);
  }

  lines.push('');
  lines.push('3. LOOP FINAL Y PUBLICACIÓN SEO');
  lines.push(`Loop final: ${script.loopFinal}`);
  lines.push(`Títulos A/B: ${script.metadatosPublicacion.titulosAlternativos.join(' | ')}`);
  lines.push(`Descripción: ${script.metadatosPublicacion.descripcionSeo}`);
  lines.push(`Hashtags: ${script.metadatosPublicacion.hashtags.join(' ')}`);
  lines.push('');
  lines.push('4. ESTRATEGIA DE MONETIZACIÓN');
  lines.push(`Ángulo RPM: ${script.estrategiaMonetizacion.anguloRpm}`);
  lines.push(`Retención objetivo: ${script.estrategiaMonetizacion.retencionObjetivo}`);
  lines.push(`CTA orgánico: ${script.estrategiaMonetizacion.ctaOrganico}`);
  lines.push(hr);

  return lines.join('\n');
}

export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadImageAsPng(imageDataUrl: string, filename: string): Promise<void> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('No se pudo preparar la imagen para descarga PNG.'));
    el.src = imageDataUrl;
  });

  const naturalW = img.naturalWidth || 1080;
  const naturalH = img.naturalHeight || 1920;
  const ratio = naturalW / Math.max(1, naturalH);

  let targetW = 1080;
  let targetH = 1920;
  if (ratio > 1.2) {
    targetW = 1920;
    targetH = 1080;
  } else if (ratio >= 0.85 && ratio <= 1.15) {
    targetW = 1080;
    targetH = 1080;
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#0B0D11';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Dibujar cubriendo proporcionalmente sin deformar
  const canvasRatio = targetW / targetH;
  let drawW = targetW;
  let drawH = targetH;
  if (ratio > canvasRatio) {
    drawH = targetH;
    drawW = targetH * ratio;
  } else {
    drawW = targetW;
    drawH = targetW / ratio;
  }
  const offsetX = (targetW - drawW) / 2;
  const offsetY = (targetH - drawH) / 2;
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function slugifyFilename(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'guion-3d'
  );
}
