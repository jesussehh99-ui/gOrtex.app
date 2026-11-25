import type {
  SceneMediaMap,
  ScriptScene,
  VideoAspectRatio,
  ViralScript,
  VisualEnvironmentId,
  VisualPropIcon,
  VisualSubjectAction,
} from '../types';

const STYLE_FLOW_DIRECTIVES: Record<string, string> = {
  viral_meme_3d:
    'Stylized 3D viral internet animation in Blender Cycles / Source Filmmaker comedy aesthetic, expressive 3D cartoon characters with bold facial expressions, comical squash-and-stretch physics, vivid saturated PBR shaders, volumetric lighting, crisp rim light',
  soft_storybook:
    'Warm matte 3D animated short in Pixar / modern Blender storybook style, appealing expressive 3D characters, tactile subsurface scattering materials, golden cinematic lighting, rich layered parallax depth',
  flat_kids:
    'Clean colorful glossy 3D vinyl-toy cartoon animation in Blender, friendly rounded characters with lively bouncy motion, bright soft global illumination, crisp depth of field',
  paper_diorama:
    'Tactile handcrafted 3D miniature layered paper-cut and clay diorama animation, warm studio key light, shallow macro depth of field, lively animated elements',
  pixar_dark:
    'Dramatic Pixar-grade stylized 3D cinematic animation, expressive character acting, deep volumetric amber and cyan rim light, atmospheric mist, 35mm cinematic bokeh',
  ue5_realism:
    'Photorealistic Unreal Engine 5 cinematic 3D render, Lumen volumetric lighting, natural expressive human/character motion, subtle handheld camera lens',
  clay_suspense:
    'Handcrafted 3D stop-motion claymation animation with tactile sculpted details, dramatic tungsten studio key lighting, miniature set depth',
  stylized_thriller:
    'Painterly stylized 3D comic-noir animation in Spider-Verse hybrid look, bold directional rim lighting, graphic shadows, snappy kinetic camera motion',
};

const ENVIRONMENT_DESCRIPTIONS_EN: Record<VisualEnvironmentId, string> = {
  park_walking:
    'Sunlit urban park walking trail lined with swaying green trees in layered parallax, warm morning sunbeams filtering through foliage, clear depth perspective',
  brain_neurons:
    'Luminous 3D scientific cutaway inside a glowing human brain network, pulsing electric blue and violet synapses firing across floating neural pathways',
  heart_bloodflow:
    'Dramatic translucent 3D biological macro environment showing a glowing stylized heart and arterial pathways filled with luminous red and golden oxygen particles streaming smoothly',
  muscles_gym:
    'Modern high-contrast fitness studio illuminated by dramatic volumetric spotlights, athletic floor perspective, subtle glowing vitality energy around the active subject',
  sleep_bedroom:
    'Cozy peaceful bedroom at night with moonlight streaming through a window, soft warm bedside lamp glow, floating dreamlike stardust particles',
  ancient_rome:
    'Monumental Ancient Roman Senate hall with towering fluted marble columns, warm golden sunlight shafts, classical marble tiles in perspective',
  medieval_castle:
    'Torch-lit medieval stone fortress hall with gothic arches, flickering warm firelight, dramatic atmospheric haze',
  space_cosmos:
    'Expansive deep space cosmos with luminous swirling nebula clouds, ringed 3D planet on the horizon, parallax starfield',
  money_charts:
    'Sleek dark financial command stage with glowing emerald and 24k gold 3D bar charts rising in perspective and floating holographic coins',
  office_desk:
    'Clean modern creator workspace desk with glowing monitors, soft volumetric desk lamp lighting, floating productivity cards',
  city_street:
    'Dynamic city avenue in deep perspective with parallax skyscrapers, warm streetlamps, cinematic shallow depth of field',
  tech_studio:
    'Futuristic 3D tech studio with sleek glowing cyan holographic panels, volumetric rim lighting, reflective dark floor',
  forest_stream:
    'Enchanting sunlit woodland clearing with a curved wooden bridge over a crystal-clear blue stream, layered hills, warm golden light',
  ocean_deep:
    'Deep underwater 3D world with shimmering caustic sunbeams piercing down from the surface, rising bubbles, layered oceanic depth',
  survival_wild:
    'Dramatic rugged wilderness landscape with misty mountain peaks, intense atmospheric weather, glowing campfire or horizon light',
  mystery_vault:
    'Atmospheric noir underground chamber with a monumental circular steel vault door, dramatic single overhead spotlight beam, floating dust motes',
};

const SUBJECT_DESCRIPTIONS_EN: Record<VisualSubjectAction, string> = {
  walking_happy: 'an energetic smiling 3D character striding briskly forward with natural arm swing',
  running_fast: 'a determined athletic 3D character jogging dynamically forward with motion energy',
  flexing_muscles: 'a confident energized 3D character flexing both arms with a glowing aura of strength',
  stressed_head: 'a visibly stressed 3D character holding their head as tension sparks dissolve into clarity',
  sleeping_peaceful: 'a calm resting 3D character sleeping peacefully with relaxed expression',
  thinking_curious: 'an inquisitive 3D character leaning forward with raised eyebrow examining the key discovery',
  triumphant_celebrate: 'a joyful 3D character raising both arms in celebration of a visible transformation',
  shocked_crowd: 'a 3D protagonist and stunned background characters reacting in wide-eyed comedic disbelief',
  holding_speaker: 'a mischievous 3D character activating a massive modern Bluetooth speaker blasting bass waves',
  working_focused: 'a focused 3D character actively working at their task with sharp concentration',
  counting_money: 'an expressive 3D character reacting to rising financial savings and golden coins',
  exploring_pov: 'an immersive first-person POV exploration pushing forward toward the central focal point',
};

const PROP_DESCRIPTIONS_EN: Record<VisualPropIcon, string> = {
  sneakers_steps: 'highlighted bright athletic sneakers in mid-stride with a glowing animated step counter ring',
  brain_glow: 'a luminous 3D stylized brain pulsing with vibrant synaptic energy waves',
  heart_pulse: 'a glowing glossy 3D heart beating rhythmically with luminous pulse rings',
  dumbbell: 'a sleek metallic 3D dumbbell radiating subtle vitality sparks',
  clock_calendar: 'a floating 3D stopwatch and 30-day calendar dial spinning smoothly to show daily consistency',
  bluetooth_speaker: 'an oversized glossy Bluetooth boombox vibrating with visible acoustic shockwave rings',
  coin_chart: 'spinning 3D golden coins beside a rising neon green financial growth arrow',
  smartphone_glow: 'a sleek glowing 3D smartphone displaying clean luminous holographic interface rings',
  compass_map: 'an ornate brass 3D compass with spinning needle over an illustrated adventure map',
  planet_rocket: 'a stylized 3D spacecraft gliding smoothly past a glowing ringed planet',
  warning_bolt: 'a glowing high-contrast 3D energy lightning bolt pulsing with urgency',
  energy_sun: 'a radiant golden 3D vitality orb emitting warm sunlit energy rays',
  paper_boat: 'a charming folded 3D paper boat gliding smoothly along shimmering ripples',
  coffee_cup: 'a warm ceramic 3D coffee mug with graceful curling aromatic steam',
  shield_lock: 'a glossy metallic 3D security shield and padlock glowing with protective light',
};

const CAMERA_MOTION_MAP: Array<{ pattern: RegExp; en: string }> = [
  {
    pattern: /pov|primera persona/i,
    en: 'immersive first-person POV handheld tracking shot moving smoothly forward',
  },
  {
    pattern: /zoom|acercamiento|crash|impacto/i,
    en: 'punchy dynamic push-in zoom toward the focal subject with subtle handheld energy',
  },
  {
    pattern: /abierto|panor|multitud|caos/i,
    en: 'sweeping wide-angle tracking shot showcasing layered foreground and background parallax',
  },
  {
    pattern: /dolly|travelling|paneo|barrido/i,
    en: 'fluid cinematic dolly tracking shot with continuous parallax motion',
  },
];

function resolveCameraEnglish(scene: ScriptScene): string {
  const camText = `${scene.movimientoCamara || ''} ${scene.transicionRapida || ''}`;
  for (const item of CAMERA_MOTION_MAP) {
    if (item.pattern.test(camText)) return item.en;
  }
  if (scene.orden === 1) {
    return 'immediate engaging push-in camera move with subtle handheld energy from frame one';
  }
  if (scene.esGiro30s) {
    return 'expressive whip-pan into a dynamic medium close-up revealing the key visual beat';
  }
  return 'continuous smooth 3D camera tracking with natural parallax and zero static frames';
}

/**
 * Construye un prompt en inglés altamente específico para Google Flow
 * fiel 100% a la escena individual, su visualSpec y el estilo elegido por el usuario.
 */
export function buildGoogleFlowPrompt(
  scene: ScriptScene,
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  cachedFlowPromptEn?: string
): string {
  const ratioTag = aspectRatio === '9:16' ? '9:16 vertical' : '16:9 widescreen';

  // Prioridad 1: Prompt optimizado explícitamente por el usuario con Gemini
  if (cachedFlowPromptEn && cachedFlowPromptEn.trim().length > 25) {
    return cachedFlowPromptEn.trim();
  }

  const biblePrefix = script.visualBible?.fixedPrefixPrompt?.replace(/\s+/g, ' ').trim();
  const applyBibleLock = (prompt: string): string => {
    if (!biblePrefix || biblePrefix.length < 12) return prompt;
    if (prompt.toLowerCase().includes(biblePrefix.slice(0, 28).toLowerCase())) return prompt;
    return `${biblePrefix}. ${prompt}`;
  };

  // Prioridad 2: flowPrompt específico generado por Gemini 2.5 Flash dentro de visualSpec
  if (scene.visualSpec?.flowPrompt && scene.visualSpec.flowPrompt.trim().length > 35) {
    const base = applyBibleLock(scene.visualSpec.flowPrompt.trim());
    const hasRatio = /9:16|16:9|vertical|widescreen/i.test(base);
    const hasNoText = /no text|no watermark/i.test(base);
    const suffixParts: string[] = [];
    if (!hasRatio) suffixParts.push(`Framed in ${ratioTag} composition.`);
    if (!hasNoText) suffixParts.push('No on-screen text, no watermarks.');
    return suffixParts.length > 0 ? `${base} ${suffixParts.join(' ')}` : base;
  }

  // Prioridad 3: Ensamblado semántico estricto usando visualBible + visualSpec (si existe) + promptVisual3D de ESTA escena
  const styleDir =
    STYLE_FLOW_DIRECTIVES[script.estilo3D] ?? STYLE_FLOW_DIRECTIVES.soft_storybook;
  const cameraEn = resolveCameraEnglish(scene);
  const ratioDirective =
    aspectRatio === '9:16'
      ? 'vertical 9:16 aspect ratio optimized for TikTok, YouTube Shorts, and Instagram Reels, primary subject strictly centered in the middle third of the frame so it never collides with bottom subtitles or side UI buttons'
      : 'cinematic 16:9 widescreen framing, balanced rule-of-thirds composition';

  const coreBrief = (scene.imagePrompt || scene.promptVisual3D || scene.narracion || script.premisa)
    .replace(/\s+/g, ' ')
    .trim();

  const spec = scene.visualSpec;
  const specSummary = spec
    ? `Environment: ${ENVIRONMENT_DESCRIPTIONS_EN[spec.environment] || spec.environment}. Subject & action: ${SUBJECT_DESCRIPTIONS_EN[spec.mainSubject] || spec.mainSubject}, featuring ${PROP_DESCRIPTIONS_EN[spec.propIcon] || spec.propIcon}.`
    : '';

  return applyBibleLock(
    [
      `${styleDir}.`,
      `Scene ${scene.orden} (${scene.fase}): ${coreBrief}.`,
      specSummary,
      `Camera & motion: ${cameraEn}, continuous lively animation with zero static frames, smooth 24fps 3D motion.`,
      `Lighting & framing: Cinematic three-point volumetric lighting, rich shadows, glowing rim light, ${ratioDirective}.`,
      'No on-screen text, no letters, no watermarks.',
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export function buildAllGoogleFlowPromptsBundle(
  script: ViralScript,
  sceneMedia: SceneMediaMap,
  aspectRatio: VideoAspectRatio
): string {
  const header = [
    `=== GOOGLE FLOW 3D PROMPTS · ${script.tituloViral.toUpperCase()} ===`,
    `Format: ${aspectRatio} | Scenes: ${script.escenas.length} | Style: ${script.estilo3D}`,
    '',
  ].join('\n');

  const body = script.escenas
    .map((scene) => {
      const promptEn = buildGoogleFlowPrompt(
        scene,
        script,
        aspectRatio,
        sceneMedia[scene.id]?.flowPromptEn
      );
      const langTag = (script.idioma ?? 'es').toUpperCase();
      return [
        `[SCENE ${scene.orden} · ${scene.tiempoInicio} - ${scene.tiempoFin} · ${scene.fase}]`,
        `Narration (${langTag}): ${scene.narracion}`,
        `Google Flow Prompt (EN):`,
        promptEn,
      ].join('\n');
    })
    .join('\n\n----------------------------------------\n\n');

  return `${header}${body}\n`;
}

export function isLegacyFlatSvgDataUrl(url?: string): boolean {
  return Boolean(url && url.startsWith('data:image/svg+xml'));
}
