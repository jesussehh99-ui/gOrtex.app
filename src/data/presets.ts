import type {
  AudienceId,
  DurationOption,
  PlatformId,
  Style3DId,
  ViralScript,
  VoiceName,
} from '../types';

export interface Style3DConfig {
  id: Style3DId;
  label: string;
  shortLabel: string;
  audienceTag: 'familiar' | 'viral' | 'cinematografico';
  description: string;
  promptSuffix: string;
  imageUrl: string;
  recommendedTools: string;
}

export const AUDIENCES: Array<{
  id: AudienceId;
  label: string;
  description: string;
}> = [
  {
    id: 'educational',
    label: '¿Sabías qué? / Útil',
    description: 'Datos curiosos, consejos prácticos que ayudan, salud, finanzas, ciencia y tecnología.',
  },
  {
    id: 'general',
    label: 'Público general',
    description: 'Historias, curiosidades y temas interesantes aptos para toda la familia.',
  },
  {
    id: 'kids',
    label: 'Infantil',
    description: 'Aventuras amigables, personajes serenos, cero sustos y finales positivos.',
  },
  {
    id: 'viral_meme',
    label: 'Viral / Meme',
    description: 'Comedia 3D exagerada tipo Blender/SFM con escenarios absurdos "¿Qué pasaría si...?".',
  },
  {
    id: 'suspense',
    label: 'Suspenso',
    description: 'Narrativa intensa de misterio, finanzas oscuras y alto contraste.',
  },
];

export const WHAT_IF_ERAS = [
  'la Antigua Roma en pleno discurso del Senado',
  'el Titanic diez minutos antes del iceberg',
  'un torneo medieval frente al rey',
  'la sala del trono del Antiguo Egipto',
  'el centro de control de la NASA en 1969',
  'una batalla de piratas en el siglo XVII',
  'la firma de la paz en un palacio del siglo XVIII',
];

export const WHAT_IF_MODERN_OBJECTS = [
  'una bocina Bluetooth gigante a todo volumen',
  'un patinete eléctrico con luces LED neón',
  'una freidora de aire cocinando alitas picantes',
  'un dron con cámara persiguiendo al emperador',
  'un celular reproduciendo memes y filtros faciales',
  'una pistola de agua motorizada de alta presión',
  'una bebida energética y música electrónica de fondo',
];

export const STYLES_3D: Style3DConfig[] = [
  {
    id: 'soft_storybook',
    label: '3D Suave Familiar',
    shortLabel: '3D Suave',
    audienceTag: 'familiar',
    description:
      'Figuras 3D redondeadas mate con expresiones serenas y luz cálida ideal para todo público y niños.',
    promptSuffix:
      'Gentle non-realistic matte 3D storybook illustration, rounded toy-like characters with calm understated minimal expressions, soft pastel daylight, friendly cozy shapes, uncluttered composition, 9:16 vertical',
    imageUrl: '/src/assets/images/style_soft_storybook_1795575968523.jpg',
    recommendedTools: 'Ilustración IA integrada · Midjourney · Kling',
  },
  {
    id: 'flat_kids',
    label: 'Ilustración Infantil Plana',
    shortLabel: 'Infantil Plano',
    audienceTag: 'familiar',
    description:
      'Estilo libro ilustrado moderno con formas limpias, ojos simples y colores suaves sin sobrecarga.',
    promptSuffix:
      'Clean modern flat 2D picture-book illustration for kids and general audiences, simple geometric shapes, calm dot-eye understated expression, soft matte gouache colors, gentle daylight, 9:16 vertical',
    imageUrl: '/src/assets/images/style_flat_kids_1795575968968.jpg',
    recommendedTools: 'Ilustración IA integrada · Canva · Midjourney',
  },
  {
    id: 'paper_diorama',
    label: 'Diorama Papel y Madera',
    shortLabel: 'Diorama Papel',
    audienceTag: 'familiar',
    description:
      'Escenarios minimalistas en papel recortado y figuras simples de madera con tono tranquilo.',
    promptSuffix:
      'Minimalist handcrafted layered paper-cut and smooth wooden peg toy diorama, calm neutral understated faces, warm studio daylight, matte cardstock paper grain, friendly all-ages storybook look, 9:16 vertical',
    imageUrl: '/src/assets/images/style_paper_diorama_1795575971631.jpg',
    recommendedTools: 'Ilustración IA integrada · Midjourney · Runway',
  },
  {
    id: 'viral_meme_3d',
    label: 'Animación 3D Viral / Meme',
    shortLabel: '3D Viral / Meme',
    audienceTag: 'viral',
    description:
      'Estilo 3D caricaturesco tipo Blender/SFM con caras exageradas, físicas cómicas, planos POV y caos en pantalla.',
    promptSuffix:
      'Cartoonish stylized 3D viral meme animation in Blender / Source Filmmaker comedy style, exaggerated bulging eyes and dropped-jaw facial expressions, slapstick ragdoll physics, dynamic first-person POV and dramatic crash zoom camera, chaotic crowd reactions in background, bright saturated 3D shaders, 9:16 vertical',
    imageUrl: '/src/assets/images/style_viral_meme_3d_1795577034928.jpg',
    recommendedTools: 'Google Flow · Blender · Motor 2.5D/3D integrado',
  },
  {
    id: 'pixar_dark',
    label: 'Pixar Oscuro Cinematográfico',
    shortLabel: 'Pixar Oscuro',
    audienceTag: 'cinematografico',
    description:
      'Personajes 3D con iluminación volumétrica de thriller y alto contraste emocional.',
    promptSuffix:
      'Dark stylized Pixar-grade 3D animation, volumetric amber rim lighting, shallow 35mm depth of field, PBR wet textures, moody shadows and warm highlights, 9:16 vertical frame',
    imageUrl: '/src/assets/images/style_pixar_dark_1795574273992.jpg',
    recommendedTools: 'Google Flow · Blender · Motor 2.5D/3D integrado',
  },
  {
    id: 'ue5_realism',
    label: 'Unreal Engine 5 Realista',
    shortLabel: 'UE5 Realismo',
    audienceTag: 'cinematografico',
    description:
      'Escala monumental y atmósfera cinematográfica para misterios y ciencia ficción.',
    promptSuffix:
      'Photorealistic Unreal Engine 5 cinematic 3D render, Lumen global illumination, anamorphic 35mm lens, atmospheric fog, 8k film grain, 9:16 vertical',
    imageUrl: '/src/assets/images/style_ue5_realism_1795574273630.jpg',
    recommendedTools: 'Google Flow · Unreal Engine 5 · Motor 2.5D/3D integrado',
  },
  {
    id: 'clay_suspense',
    label: 'Stop-Motion Claymation',
    shortLabel: 'Claymation',
    audienceTag: 'cinematografico',
    description:
      'Texturas táctiles de arcilla esculpida a mano con iluminación dramática de estudio.',
    promptSuffix:
      'Tactile 3D stop-motion claymation frame, handcrafted clay details, warm tungsten key light, miniature cinema macro lens, 9:16 vertical',
    imageUrl: '/src/assets/images/style_clay_suspense_1795574274130.jpg',
    recommendedTools: 'Google Flow · Blender · Motor 2.5D/3D integrado',
  },
  {
    id: 'stylized_thriller',
    label: '3D Estilizado Noir',
    shortLabel: 'Estilizado Noir',
    audienceTag: 'cinematografico',
    description:
      'Sombreado pictórico de alto impacto y ángulos forzados para casos y dilemas.',
    promptSuffix:
      'Painterly 3D stylized noir animation, sharp geometric key lighting, moody shadows with amber highlights, dynamic camera angle, 9:16 vertical',
    imageUrl: '/src/assets/images/style_stylized_thriller_1795574272450.jpg',
    recommendedTools: 'Google Flow · Blender · Motor 2.5D/3D integrado',
  },
];

export const HUMAN_VOICE_PROFILES: Array<{
  id: string;
  name: string;
  voiceName: VoiceName;
  label: string;
  description: string;
  speechStyle: string;
  sampleLine: string;
}> = [
  {
    id: 'lucia_cotidiana',
    name: 'Lucía',
    voiceName: 'Kore',
    label: 'Lucía · Natural cotidiana',
    description: 'Voz femenina común y cercana, como alguien contándote una historia en persona.',
    speechStyle:
      'Everyday natural Spanish woman in her late 20s speaking conversationally to a friend, warm authentic cadence, natural subtle breaths, completely non-robotic, never sounding like a formal TV announcer',
    sampleLine:
      'Oye, imagínate por un segundo que abres esa puerta y te encuentras algo que nadie se esperaba.',
  },
  {
    id: 'mateo_cercano',
    name: 'Mateo',
    voiceName: 'Puck',
    label: 'Mateo · Amigo espontáneo',
    description: 'Voz joven cotidiana, expresiva y ágil ideal para curiosidades y memes.',
    speechStyle:
      'Everyday relatable young Spanish-speaking guy telling a funny or surprising story to friends, natural casual rhythm, real human intonation, slightly playful, zero robotic stiffness',
    sampleLine:
      'En serio, nadie en toda la plaza sabía qué estaba pasando cuando empezó a sonar esa música.',
  },
  {
    id: 'sofia_familiar',
    name: 'Sofía',
    voiceName: 'Zephyr',
    label: 'Sofía · Cálida familiar',
    description: 'Tono amable, tranquilo y humano ideal para cuentos infantiles y todo público.',
    speechStyle:
      'Warm, kind everyday Spanish storyteller speaking gently to children and families, natural human pauses, smiling relaxed voice, clear and comforting without sounding artificial',
    sampleLine:
      'Aquella tarde, junto al pequeño puente de madera, Milo descubrió un secreto muy especial.',
  },
  {
    id: 'diego_sereno',
    name: 'Diego',
    voiceName: 'Charon',
    label: 'Diego · Sereno y real',
    description: 'Voz masculina común y pausada para historias reales, misterios y datos.',
    speechStyle:
      'Grounded everyday adult Spanish male speaking calmly and naturally as if chatting over coffee, authentic low-key conversational realism, steady pacing, no theatrical radio voice',
    sampleLine:
      'Lo más curioso de esta historia no es cómo empezó, sino lo que descubrieron treinta segundos después.',
  },
  {
    id: 'bruno_dinamico',
    name: 'Bruno',
    voiceName: 'Fenrir',
    label: 'Bruno · Ágil conversacional',
    description: 'Voz natural con energía cotidiana para mantener el ritmo en videos cortos.',
    speechStyle:
      'Energetic everyday Spanish speaker with crisp natural conversational flow, authentic human emphasis on surprising twists, engaging and real, never monotone or synthetic',
    sampleLine:
      'Espera a ver lo que pasa justo cuando creen que todo está bajo control.',
  },
];

export const PLATFORMS: Array<{
  id: PlatformId;
  label: string;
  defaultRatio: '9:16' | '16:9';
  monetizationNote: string;
}> = [
  {
    id: 'tiktok_creativity',
    label: 'TikTok +60s (Creator Rewards)',
    defaultRatio: '9:16',
    monetizationNote: 'Paga por retención >60s y búsquedas orgánicas',
  },
  {
    id: 'youtube_shorts',
    label: 'YouTube Shorts + Embudo',
    defaultRatio: '9:16',
    monetizationNote: 'Alcance masivo hacia tu canal principal',
  },
  {
    id: 'youtube_long',
    label: 'YouTube Horizontal 16:9 (Alto RPM)',
    defaultRatio: '16:9',
    monetizationNote: 'Mayor ingreso por cada mil vistas y compilaciones',
  },
  {
    id: 'instagram_reels',
    label: 'Instagram Reels + Patrocinios',
    defaultRatio: '9:16',
    monetizationNote: 'Crecimiento rápido por compartidos y marcas',
  },
];

export const DURATIONS: Array<{
  value: DurationOption;
  label: string;
  twistsSummary: string;
  monetizationBadge: string;
}> = [
  {
    value: 30,
    label: '30 seg',
    twistsSummary: 'Ritmo exprés directo al punto',
    monetizationBadge: 'Shorts / Reels exprés',
  },
  {
    value: 60,
    label: '60 seg',
    twistsSummary: 'Desarrollo claro +60s',
    monetizationBadge: 'Apto TikTok +60s',
  },
  {
    value: 90,
    label: '90 seg',
    twistsSummary: 'Ritmo natural de alta retención',
    monetizationBadge: 'Óptimo Creator Rewards',
  },
  {
    value: 120,
    label: '120 seg',
    twistsSummary: 'Desarrollo profundo de alto RPM',
    monetizationBadge: 'Alta retención RPM',
  },
  {
    value: 180,
    label: '180 seg',
    twistsSummary: 'Formato largo narrativo',
    monetizationBadge: 'Ideal YouTube 16:9',
  },
];

export const MONETIZATION_NICHES: Array<{
  id: string;
  label: string;
  audience: AudienceId;
  defaultStyle: Style3DId;
  premiseTemplate: string;
  goal: string;
}> = [
  {
    id: 'sabias_que_curiosidades',
    label: '¿Sabías qué? y Datos Curiosos',
    audience: 'educational',
    defaultStyle: 'flat_kids',
    premiseTemplate:
      '¿Sabías qué? Tu cerebro realiza una limpieza profunda mientras duermes: explica de forma sencilla qué ocurre cada noche y 3 hábitos prácticos para descansar mejor.',
    goal: 'Alto alcance orgánico y guardados masivos en público general de todas las edades',
  },
  {
    id: 'consejos_finanzas_utiles',
    label: 'Consejos Prácticos y Ahorro',
    audience: 'educational',
    defaultStyle: 'soft_storybook',
    premiseTemplate:
      '3 gastos pequeños diarios que vacían tu bolsillo sin que lo notes y la regla sencilla de 1 minuto para ahorrar más cada mes sin complicarte.',
    goal: 'RPM muy alto en finanzas personales con enorme tasa de guardados y compartidos',
  },
  {
    id: 'salud_habitos_bienestar',
    label: 'Salud, Hábitos y Bienestar',
    audience: 'educational',
    defaultStyle: 'flat_kids',
    premiseTemplate:
      'Qué cambia realmente en tu cuerpo y en tu mente si caminas solo 20 minutos al día durante 30 días, explicado con ejemplos claros y visuales.',
    goal: 'Nicho evergreen de millones de vistas, 100% seguro para anunciantes y marcas de bienestar',
  },
  {
    id: 'tecnologia_trucos_ia',
    label: 'Trucos de Tecnología e IA Útil',
    audience: 'educational',
    defaultStyle: 'paper_diorama',
    premiseTemplate:
      '5 ajustes ocultos en tu celular que casi nadie activa pero que ahorran batería, liberan espacio y protegen tu privacidad en menos de un minuto.',
    goal: 'Alto valor percibido, alto RPM tecnológico y repetición constante por utilidad real',
  },
  {
    id: 'psicologia_relaciones',
    label: 'Psicología y Vida Diaria',
    audience: 'general',
    defaultStyle: 'soft_storybook',
    premiseTemplate:
      'Por qué tu mente siempre recuerda lo que dejaste sin terminar (el efecto Zeigarnik) y cómo usar este truco psicológico para vencer la procrastinación hoy mismo.',
    goal: 'Retención sobresaliente por identificación personal y alto volumen de comentarios',
  },
  {
    id: 'que_pasaria_si_meme',
    label: '¿Qué pasaría si...? (Meme 3D)',
    audience: 'viral_meme',
    defaultStyle: 'viral_meme_3d',
    premiseTemplate:
      '¿Qué pasaría si aparecieras en la Antigua Roma en pleno discurso del Senado con una bocina Bluetooth gigante a todo volumen reproduciendo música electrónica?',
    goal: 'Viralidad explosiva en TikTok, Shorts y Reels mediante humor absurdo y reacciones 3D',
  },
  {
    id: 'cuentos_infantiles',
    label: 'Cuentos y Aventuras Infantiles',
    audience: 'kids',
    defaultStyle: 'soft_storybook',
    premiseTemplate:
      'Un pequeño repartidor de cartas descubre un puente de madera que solo aparece cuando alguien pierde un objeto importante, y al cruzar conoce a una tortuga cartero.',
    goal: 'Audiencia familiar e infantil con altísima repetición y compilaciones largas en YouTube',
  },
  {
    id: 'misterio_historico',
    label: 'Historia y Misterios Reales',
    audience: 'general',
    defaultStyle: 'paper_diorama',
    premiseTemplate:
      'Cómo una ciudad antigua del desierto construyó aire acondicionado natural hace 2.000 años sin electricidad y por qué los arquitectos modernos siguen estudiando su diseño.',
    goal: 'Audiencia amplia internacional con alto tiempo de visualización en YouTube y TikTok',
  },
  {
    id: 'finanzas_oscuras',
    label: 'Casos y Decisiones Extremas',
    audience: 'suspense',
    defaultStyle: 'pixar_dark',
    premiseTemplate:
      'Un relojero al borde de la quiebra acepta reparar un reloj detenido en 1989 sin saber que el mecanismo interno guarda la pista hacia una fortuna familiar.',
    goal: 'RPM alto en audiencia interesada en historias de intriga, negocios y decisiones bajo presión',
  },
];

export const STARTER_SCRIPT: ViralScript = {
  id: 'starter-puente-cartas-30',
  creadoEn: '2026-11-24T19:00:00.000Z',
  tituloViral: 'El puente de madera que solo aparece si perdiste algo... hasta que miró debajo',
  premisa:
    'Un pequeño viajero descubre un puente de madera en un bosque tranquilo que solo aparece cuando alguien pierde algo importante, pero a los 30 segundos descubre quién construyó el puente y al minuto encuentra el verdadero tesoro escondido.',
  nicho: 'Cuentos y Aventuras Infantiles',
  publicoObjetivo: 'kids',
  duracionSegundos: 90,
  estilo3D: 'soft_storybook',
  plataforma: 'youtube_shorts',
  ganchoInicial3Seg: {
    impactoVisual:
      'Plano suave de un pequeño viajero con expresión serena frente a un puente de madera iluminado por el sol que aparece de la nada sobre un arroyo tranquilo.',
    fraseApertura:
      'Este puente de madera no está en ningún mapa... porque solo aparece el día en que pierdes algo muy importante.',
    sonidoRompeScroll:
      'Acorde suave de xilófono + crujido ligero de madera acompañado de agua corriendo.',
  },
  guiaEstilo3D:
    'Gentle non-realistic matte 3D storybook illustration for all ages and children: Milo (small friendly traveler wearing a soft blue coat and warm brown knit hat, calm minimal understated expression, simple rounded features), cozy pastel forest, warm afternoon sunlight, wooden bridge over calm blue stream, clean uncluttered shapes, 9:16 vertical.',
  estrategiaMonetizacion: {
    anguloRpm:
      'Contenido apto para toda la familia (100% seguro para anunciantes) con alta repetición infantil y excelente rendimiento en compilaciones de YouTube y TikTok +60s.',
    nichoMonetizador: 'Cuentos animados 3D suaves para público general y niños',
    retencionObjetivo: '70%–82% de retención mediante descubrimientos exactos en 0:30 y 1:00',
    ctaOrganico:
      'Pregunta sencilla al final ("¿Qué objeto perdido te gustaría encontrar en este puente?") ideal para comentarios en familia.',
    planEjecucionRapida: [
      'Genera las ilustraciones suaves de cada escena directamente desde el estudio o copia todo organizado con un clic.',
      'Escoge una voz en español gratuita o graba tu propia voz con micrófono / sube un .MP3 en el panel Audiovisual 9:16.',
      'Renderiza y descarga el video vertical .WEBM con subtítulos dinámicos y transiciones ya integradas.',
      'Publica en YouTube Shorts y TikTok +60s y agrupa 5 historias en un video largo semanal.',
    ],
  },
  escenas: [
    {
      id: 'sc-1',
      orden: 1,
      tiempoInicio: '0:00',
      tiempoFin: '0:08',
      segundoInicio: 0,
      segundoFin: 8,
      fase: 'Gancho',
      esGiro30s: false,
      narracion:
        'Este puente de madera no está en ningún mapa... porque solo aparece el día en que pierdes algo muy importante.',
      subtituloDinamico: 'UN PUENTE QUE NO ESTÁ EN EL MAPA',
      palabraDestacada: 'NO ESTÁ',
      promptVisual3D:
        'Gentle matte 3D storybook illustration, small traveler Milo in soft blue coat and brown knit hat with calm simple expression standing before a cozy curved wooden bridge over a clear pastel stream, warm afternoon light, soft rounded trees, 9:16 vertical',
      visualSpec: {
        environment: 'forest_stream',
        mainSubject: 'exploring_pov',
        propIcon: 'compass_map',
        moodPalette: 'calm_storybook',
        flowPrompt:
          'Gentle matte 3D storybook animation, small traveler Milo in a soft blue coat and warm brown knit hat standing calmly in front of a cozy curved wooden bridge appearing over a clear sunlit forest stream, soft rounded pastel trees and warm golden afternoon light rays, smooth slow dolly-in camera movement, 9:16 vertical aspect ratio, crisp volumetric shadows, 60fps.',
      },
      movimientoCamara: 'Acercamiento suave hacia el puente soleado',
      transicionRapida: 'Corte limpio con brillo cálido suave',
      disenoSonoro: 'Nota de marimba luminosa + sonido suave de arroyo',
    },
    {
      id: 'sc-2',
      orden: 2,
      tiempoInicio: '0:08',
      tiempoFin: '0:19',
      segundoInicio: 8,
      segundoFin: 19,
      fase: 'Tensión',
      esGiro30s: false,
      narracion:
        'Milo había perdido la brújula de madera de su abuelo. Al dar el primer paso sobre las tablas, una pequeña campanita sonó debajo del agua.',
      subtituloDinamico: 'UNA CAMPANITA SONÓ BAJO EL AGUA',
      palabraDestacada: 'BAJO EL AGUA',
      promptVisual3D:
        'Gentle non-realistic matte 3D storybook scene, Milo stepping calmly onto the center of the wooden bridge, peering gently over the rail at soft glowing ripples in the clear blue stream below, pastel pebbles and floating leaves, 9:16 vertical',
      visualSpec: {
        environment: 'ocean_deep',
        mainSubject: 'thinking_curious',
        propIcon: 'compass_map',
        moodPalette: 'cyber_cyan',
        flowPrompt:
          'Gentle matte 3D storybook animation, Milo peering curiously over the wooden bridge railing down into crystal-clear glowing blue water as a tiny brass bell chimes underwater creating shimmering light ripples and rising bubbles, smooth downward tilt camera shot, soft pastel shading, 9:16 vertical, 60fps.',
      },
      movimientoCamara: 'Paneo descendente hacia las ondas del agua',
      transicionRapida: 'Deslizamiento rápido hacia abajo (Whip tilt suave)',
      disenoSonoro: 'Campanita cristalina + burbujas suaves',
    },
    {
      id: 'sc-3',
      orden: 3,
      tiempoInicio: '0:19',
      tiempoFin: '0:30',
      segundoInicio: 19,
      segundoFin: 30,
      fase: 'Tensión',
      esGiro30s: false,
      narracion:
        'Del otro lado del río no había árboles. Había cientos de barquitos de papel navegando en fila como si siguieran una señal secreta.',
      subtituloDinamico: 'CIENTOS DE BARQUITOS EN FILA',
      palabraDestacada: 'SEÑAL SECRETA',
      promptVisual3D:
        'Peaceful non-realistic matte 3D storybook wide shot, a neat line of tiny pastel paper boats gliding gently down the sunlit blue stream past soft rounded bushes and yellow wildflowers, calm uncluttered composition, 9:16 vertical',
      visualSpec: {
        environment: 'forest_stream',
        mainSubject: 'walking_happy',
        propIcon: 'paper_boat',
        moodPalette: 'emerald_vitality',
        flowPrompt:
          'Peaceful matte 3D storybook wide shot, a neat procession of pastel origami paper boats gliding smoothly down a sunlit blue forest stream past soft emerald bushes and yellow wildflowers, lateral tracking camera following the paper boats, warm volumetric sunlight, 9:16 vertical, 60fps.',
      },
      movimientoCamara: 'Desplazamiento lateral siguiendo los barquitos',
      transicionRapida: 'Match cut de un barquito de papel al siguiente',
      disenoSonoro: 'Melodía curiosa de pizzicato aumentando el ritmo',
    },
    {
      id: 'sc-4',
      orden: 4,
      tiempoInicio: '0:30',
      tiempoFin: '0:45',
      segundoInicio: 30,
      segundoFin: 45,
      fase: 'Giro 30s',
      esGiro30s: true,
      narracion:
        'Sorpresa a los treinta segundos: los barquitos no estaban vacíos. Cada uno llevaba un objeto perdido del pueblo... y el capitán era una tortuga con gorro de cartero.',
      subtituloDinamico: 'EL CAPITÁN ERA UNA TORTUGA CARTERO',
      palabraDestacada: 'TORTUGA CARTERO',
      promptVisual3D:
        'Charming matte 3D storybook reveal, a small calm turtle wearing a tiny blue postman cap sailing a larger wooden leaf-boat filled with neat miniature lost objects like a red button and a tiny key, calm gentle smile, warm sunlight, 9:16 vertical',
      visualSpec: {
        environment: 'park_walking',
        mainSubject: 'triumphant_celebrate',
        propIcon: 'paper_boat',
        moodPalette: 'warm_energy',
        flowPrompt:
          'Charming matte 3D storybook reveal shot, a small friendly turtle wearing a tiny blue postman cap steering a carved wooden leaf-boat loaded with miniature lost objects like a red button and tiny brass key along a sunlit riverbank, smooth punch-in zoom, warm golden sunlight, 9:16 vertical, 60fps.',
      },
      movimientoCamara: 'Zoom suave revelando la barca de la tortuga',
      transicionRapida: 'Destello suave + corte directo al detalle',
      disenoSonoro: 'Acorde sorpresa alegre + silbato suave de barquito',
    },
    {
      id: 'sc-5',
      orden: 5,
      tiempoInicio: '0:45',
      tiempoFin: '1:00',
      segundoInicio: 45,
      segundoFin: 60,
      fase: 'Escalada',
      esGiro30s: false,
      narracion:
        'La tortuga le dijo que podía llevarse su brújula gratis, pero solo si antes ayudaba a devolver un último paquete antes de que se escondiera el sol.',
      subtituloDinamico: 'DEVOLVER UN ÚLTIMO PAQUETE ANTES DEL SOL',
      palabraDestacada: 'ÚLTIMO PAQUETE',
      promptVisual3D:
        'Cozy matte 3D storybook medium shot, Milo holding a tiny neatly wrapped brown paper parcel tied with soft orange twine beside the calm postman turtle on the grassy riverbank, golden late-afternoon sky, minimal calm faces, 9:16 vertical',
      visualSpec: {
        environment: 'survival_wild',
        mainSubject: 'running_fast',
        propIcon: 'clock_calendar',
        moodPalette: 'golden_history',
        flowPrompt:
          'Cozy matte 3D storybook medium tracking shot, Milo briskly walking along a sunlit woodland trail carrying a small wrapped brown paper parcel tied with orange twine before sunset, warm amber twilight rays through distant hills, gentle handheld motion, 9:16 vertical, 60fps.',
      },
      movimientoCamara: 'Travelling lateral siguiendo a Milo por el sendero',
      transicionRapida: 'Corte rápido al ritmo de pasos suaves',
      disenoSonoro: 'Reloj de madera suave marcando el atardecer',
    },
    {
      id: 'sc-6',
      orden: 6,
      tiempoInicio: '1:00',
      tiempoFin: '1:16',
      segundoInicio: 60,
      segundoFin: 76,
      fase: 'Giro 30s',
      esGiro30s: true,
      narracion:
        'Segundo giro inesperado: al abrir la casita del árbol donde iba el paquete, no había nadie esperando... el destinatario era el abuelo de Milo, y dentro estaba el mapa del bosque.',
      subtituloDinamico: 'EL PAQUETE ERA PARA SU PROPIO ABUELO',
      palabraDestacada: 'PROPIO ABUELO',
      promptVisual3D:
        'Heartwarming matte 3D storybook scene, Milo standing calmly by a cozy small wooden treehouse mailbox glowing in warm sunset light, inside the open parcel lies a folded illustrated forest map and a small brass compass, peaceful tones, 9:16 vertical',
      visualSpec: {
        environment: 'mystery_vault',
        mainSubject: 'thinking_curious',
        propIcon: 'compass_map',
        moodPalette: 'cosmic_indigo',
        flowPrompt:
          'Heartwarming matte 3D storybook close-up reveal, Milo opening a cozy glowing wooden treehouse mailbox at twilight to discover an illustrated folded forest map and his grandfather brass compass inside the parcel, warm golden rim lighting, slow zoom-in, 9:16 vertical, 60fps.',
      },
      movimientoCamara: 'Acercamiento lento hacia el mapa y la brújula',
      transicionRapida: 'Fundido luminoso rápido de 0.2s',
      disenoSonoro: 'Arpa cálida ascendente + suspiro alegre',
    },
    {
      id: 'sc-7',
      orden: 7,
      tiempoInicio: '1:16',
      tiempoFin: '1:30',
      segundoInicio: 76,
      segundoFin: 90,
      fase: 'Clímax y Loop',
      esGiro30s: false,
      narracion:
        'La brújula nunca se había perdido: era la forma en que su abuelo lo invitaba a caminar juntos. Y si alguna vez ves un arroyo tranquilo, busca bien...',
      subtituloDinamico: 'SI VES UN ARROYO... BUSCA BIEN',
      palabraDestacada: 'BUSCA BIEN',
      promptVisual3D:
        'Peaceful matte 3D storybook closing frame, Milo walking calmly back across the warm sunlit wooden bridge holding his wooden compass while golden fireflies drift gently over the clear stream, serene atmosphere, 9:16 vertical',
      visualSpec: {
        environment: 'sleep_bedroom',
        mainSubject: 'triumphant_celebrate',
        propIcon: 'energy_sun',
        moodPalette: 'calm_storybook',
        flowPrompt:
          'Peaceful matte 3D storybook closing shot, Milo smiling warmly as he walks back across the sunlit wooden bridge holding his wooden compass while golden fireflies drift softly above the calm blue stream, smooth gentle pull-back camera movement, seamless loop feel, 9:16 vertical, 60fps.',
      },
      movimientoCamara: 'Retroceso suave mostrando de nuevo el puente completo',
      transicionRapida: 'Loop limpio conectando directo con el segundo 0:00',
      disenoSonoro: 'Nota de marimba en bucle que enlaza con el inicio',
    },
  ],
  loopFinal:
    '"...Y si alguna vez ves un arroyo tranquilo, busca bien..." -> conecta directo con 0:00: "Este puente de madera no está en ningún mapa..."',
  metadatosPublicacion: {
    titulosAlternativos: [
      'El puente secreto de los objetos perdidos (Historia animada)',
      'Qué hay debajo del puente que solo aparece una vez',
      'La tortuga cartero y el mapa escondido en el bosque',
    ],
    descripcionSeo:
      'Historia animada suave apta para toda la familia y niños sobre un puente mágico de madera y una sorpresa inesperada. ¿Qué objeto perdido te gustaría encontrar?',
    hashtags: [
      '#CuentosAnimados',
      '#HistoriasParaTodos',
      '#Animacion3D',
      '#StorytellingFamiliar',
      '#VideosOriginales',
    ],
  },
};

export const SUBMARINE_IMPLOSION_SCRIPT: ViralScript = {
  id: 'script-submarine-implosion-4000m',
  creadoEn: new Date().toISOString(),
  tituloViral: '4,000m Submarine Implosion: What Happens in 2 Milliseconds',
  premisa:
    'Video vertical 9:16 de 60 segundos exactos en inglés sobre una implosión submarina a 4,000 metros de profundidad: 5 escenas de alta retención, encuadre en tercio medio para TikTok/Shorts/Reels y cierre en bucle perfecto.',
  nicho: 'Ciencia Extrema',
  publicoObjetivo: 'suspense',
  duracionSegundos: 60,
  estilo3D: 'ue5_realism',
  plataforma: 'youtube_shorts',
  formatoVideo: '9:16',
  vozPreferidaId: 'diego_sereno',
  idioma: 'en',
  ganchoInicial3Seg: {
    impactoVisual:
      'Vertical 9:16 POV inside a cramped submarine cabin bathed in flashing crimson alarms, cutting to a 3D six-ton adult elephant balancing on a single human fingertip centered in the middle third.',
    fraseApertura:
      'The crushing weight of a six-ton adult elephant balancing on one human fingertip.',
    sonidoRompeScroll: 'Deep submarine hull groan + crimson klaxon alarm + sub-bass impact drop',
  },
  ganchosAlternativos: [
    {
      id: 'curiosidad',
      label: 'Gancho Curiosidad',
      subtitle: 'Fuerza física visual inmediata',
      fraseApertura:
        'The crushing weight of a six-ton adult elephant balancing on one human fingertip.',
      impactoVisual:
        'POV cabin with crimson alarms + 3D adult elephant balanced on a human fingertip in the middle third.',
      sonidoRompeScroll: 'Submarine sonar ping + hull stress groan + sub-bass drop',
    },
    {
      id: 'polemica',
      label: 'Gancho Polémica',
      subtitle: 'Dato extremo que desafía la intuición',
      fraseApertura:
        'At four thousand meters down, your brain never even gets time to realize the hull failed.',
      impactoVisual:
        'Split-second micro-crack glowing on steel pressure hull centered in the middle third.',
      sonidoRompeScroll: 'Sharp metallic snap + sudden vacuum silence',
    },
    {
      id: 'humor',
      label: 'Gancho Impacto',
      subtitle: 'Comparación visceral imposible de ignorar',
      fraseApertura:
        'Imagine a hydraulic press crushing a soda can ten thousand times faster than a blink.',
      impactoVisual:
        'Slow-motion hydraulic press smashing an aluminum can morphing into a glowing implosion flash.',
      sonidoRompeScroll: 'Hydraulic crush crunch + blazing plasma flash boom',
    },
  ],
  guiaEstilo3D:
    'Photorealistic Unreal Engine 5 cinematic 3D simulation, vertical 9:16 aspect ratio strictly optimized for YouTube Shorts, TikTok, and Reels, primary focal subject centered in the middle third of the frame to stay completely clear of bottom subtitles and side UI buttons, dramatic volumetric lighting with high-contrast crimson alarms, ice-cyan deep-sea shafts, and solar-white plasma flashes, continuous dynamic camera movement with zero static frames, 60fps, no on-screen text, no watermarks.',
  estrategiaMonetizacion: {
    anguloRpm:
      'English extreme-science & deep-sea engineering storytelling commands top-tier US/UK/CA RPM on YouTube Shorts and TikTok Creativity Program with massive replay velocity.',
    nichoMonetizador: 'Extreme Science & Engineering 3D Simulations (EN)',
    retencionObjetivo: '85%+ average view duration via 2ms physics reveal + seamless infinite loop',
    ctaOrganico:
      'Looping final question ("would you ever dare to endure...") drives instant replays and debate in comments.',
    planEjecucionRapida: [
      'Copia cada uno de los 5 prompts 9:16 (ya encuadrados en el tercio medio) y genéralos en Google Flow si quieres reemplazar cualquier plano con video 3D.',
      'Activa la guía de "Zonas seguras" (Shorts / TikTok) en la vista previa para verificar que el sujeto nunca choque con subtítulos ni botones.',
      'Selecciona la voz en inglés (Diego o Bruno) o sube tu propia locución .MP3 y activa la música "Suspenso".',
      'Pulsa "Producir video completo" para descargar tu .MP4 vertical 9:16 listo para publicar.',
    ],
  },
  escenas: [
    {
      id: 'sub-sc-1',
      orden: 1,
      tiempoInicio: '0:00',
      tiempoFin: '0:10',
      segundoInicio: 0,
      segundoFin: 10,
      fase: 'Gancho',
      esGiro30s: false,
      narracion:
        'The crushing weight of a six-ton adult elephant balancing on one human fingertip. Right now, inside this cramped submarine cabin, crimson alarms scream four thousand meters below the surface.',
      subtituloDinamico: 'SIX-TON ELEPHANT ON ONE FINGERTIP',
      palabraDestacada: 'ELEPHANT',
      promptVisual3D:
        'Vertical 9:16 aspect ratio, POV inside a cramped deep-sea submarine cabin with flashing crimson alarm lights and a 3D visualization of a six-ton adult elephant balancing on a single human fingertip centered in the middle third, dramatic volumetric lighting, continuous tense handheld camera push-in.',
      imagePrompt:
        'Photorealistic Unreal Engine 5 3D cinematic frame in vertical 9:16 aspect ratio, first-person POV inside a cramped metallic deep-sea submarine cabin bathed in flashing crimson emergency alarm light, glowing 3D visualization of a massive six-ton adult elephant balancing precariously on a single human fingertip strictly centered in the middle third of the frame clear of bottom subtitles and side UI buttons, dramatic volumetric red light shafts and cold cyan mist, tense handheld push-in camera perspective',
      imageSeed: 400101,
      visualSpec: {
        environment: 'ocean_deep',
        mainSubject: 'exploring_pov',
        propIcon: 'warning_bolt',
        moodPalette: 'alert_stress',
        flowPrompt:
          'Photorealistic Unreal Engine 5 cinematic 3D animation in vertical 9:16 aspect ratio, first-person POV inside a cramped narrow deep-sea submarine cabin flashing with crimson emergency alarm beacons, transitioning seamlessly to a dramatic 3D holographic visualization of a six-ton adult elephant balancing on a single human fingertip strictly centered in the middle third of the frame so it never collides with bottom subtitles or TikTok/Shorts side UI buttons, dramatic volumetric red and cold abyssal cyan lighting, continuous tense handheld push-in camera movement with subtle hull vibrations and zero static frames, 60fps, no on-screen text, no watermarks.',
      },
      movimientoCamara: 'POV handheld push-in con micro-vibración de cabina',
      transicionRapida: 'Whip-zoom rápido hacia el acero del casco',
      disenoSonoro: 'Alarma roja de submarino + crujido metálico profundo + golpe sub-bass',
    },
    {
      id: 'sub-sc-2',
      orden: 2,
      tiempoInicio: '0:10',
      tiempoFin: '0:22',
      segundoInicio: 10,
      segundoFin: 22,
      fase: 'Tensión',
      esGiro30s: false,
      narracion:
        'Zoom into the hull and spot a microscopic metal fracture thinner than a strand of hair. At four hundred atmospheres, freezing black water never leaks in: it detonates inward.',
      subtituloDinamico: 'WATER NEVER LEAKS: IT DETONATES INWARD',
      palabraDestacada: 'DETONATES',
      promptVisual3D:
        'Vertical 9:16 aspect ratio, extreme vertical macro zoom onto a dark steel submarine hull showing a microscopic hairline metal crack bursting inward with supersonic pressurized abyssal water jets centered in the middle third, dramatic volumetric ice-blue rim lighting, continuous high-speed macro dolly-in.',
      imagePrompt:
        'Photorealistic Unreal Engine 5 extreme vertical macro 3D render in vertical 9:16 aspect ratio, dark pressure-stressed steel submarine hull featuring a razor-thin microscopic metallic fracture thinner than a hair erupting inward with supersonic pressurized black water jets and frosty micro-sparks strictly centered in the middle third of the frame leaving bottom captions and side UI edges completely clear, dramatic volumetric ice-cyan backlighting and intense mist plumes',
      imageSeed: 400202,
      visualSpec: {
        environment: 'ocean_deep',
        mainSubject: 'stressed_head',
        propIcon: 'warning_bolt',
        moodPalette: 'cyber_cyan',
        flowPrompt:
          'Photorealistic Unreal Engine 5 cinematic 3D animation in vertical 9:16 aspect ratio, extreme vertical macro crash-zoom onto a dark submerged steel pressure hull revealing a microscopic metallic fracture thinner than a strand of hair violently splitting as supersonic freezing abyssal water detonates inward, hairline crack strictly centered in the middle third of the frame well clear of bottom subtitles and TikTok/Shorts side UI buttons, dramatic volumetric ice-cyan backlighting and high-pressure mist plumes, continuous relentless macro push-in camera movement with zero static frames, 60fps, no on-screen text, no watermarks.',
      },
      movimientoCamara: 'Zoom macro vertical continuo acelerando hacia la grieta',
      transicionRapida: 'Flash blanco de impacto + corte seco a cámara lenta',
      disenoSonoro: 'Chasquido metálico agudo + silbido supersónico de presión hidráulica',
    },
    {
      id: 'sub-sc-3',
      orden: 3,
      tiempoInicio: '0:22',
      tiempoFin: '0:36',
      segundoInicio: 22,
      segundoFin: 36,
      fase: 'Giro 30s',
      esGiro30s: true,
      narracion:
        "Picture an aluminum can flattened beneath a hydraulic press, then multiply that violence tenfold. The vessel collapses in two milliseconds, faster than any brain registers pain, compressing trapped air into a blinding flash hot as the Sun's surface.",
      subtituloDinamico: '2 MILLISECONDS · HOT AS THE SUN',
      palabraDestacada: '2 MILLISECONDS',
      promptVisual3D:
        'Vertical 9:16 aspect ratio, ultra slow-motion 3D simulation of an aluminum can crushed flat by a giant hydraulic press seamlessly morphing into a submarine hull imploding inward in 2 milliseconds with an incandescent solar-white internal plasma flash centered in the middle third, dramatic volumetric orange-gold explosion light, continuous bullet-time orbital camera movement.',
      imagePrompt:
        'Photorealistic Unreal Engine 5 ultra slow-motion 3D physics render in vertical 9:16 aspect ratio, sleek metallic aluminum can violently crushed under a heavy steel hydraulic press seamlessly transforming into a deep-sea submarine imploding inward with a blinding superheated solar-white and golden plasma core flash surrounded by shockwave bubbles strictly centered in the middle third of the frame clear of bottom captions and side UI buttons, dramatic volumetric fire-orange and pitch-black abyssal lighting',
      imageSeed: 400303,
      visualSpec: {
        environment: 'ocean_deep',
        mainSubject: 'shocked_crowd',
        propIcon: 'energy_sun',
        moodPalette: 'crimson_pulse',
        flowPrompt:
          'Photorealistic Unreal Engine 5 ultra slow-motion 3D physics animation in vertical 9:16 aspect ratio, dramatic morphing simulation starting with an aluminum soda can flattened under a colossal steel hydraulic press and transforming into a deep-sea submarine hull catastrophically imploding inward in two milliseconds, igniting a blinding incandescent internal plasma flash as hot as the surface of the Sun amid underwater shockwave rings, focal implosion strictly centered in the middle third of the frame keeping lower subtitles and TikTok/Shorts side UI buttons completely unobstructed, dramatic volumetric solar-gold and deep-abyss lighting, continuous bullet-time orbital push-in camera movement with zero static frames, 60fps, no on-screen text, no watermarks.',
      },
      movimientoCamara: 'Órbita bullet-time 180° en cámara ultralenta + punch-in al destello',
      transicionRapida: 'Destello solar incandescente hacia despiece 3D limpio',
      disenoSonoro: 'Prensa hidráulica aplastando metal + explosión grave contenida + zumbido solar',
    },
    {
      id: 'sub-sc-4',
      orden: 4,
      tiempoInicio: '0:36',
      tiempoFin: '0:50',
      segundoInicio: 36,
      segundoFin: 50,
      fase: 'Dato clave',
      esGiro30s: false,
      narracion:
        'Only one geometry survives this abyss: a flawless aerospace titanium sphere. While cylinders and flat hulls shatter under giant pressure arrows, its seamless curved shell channels every ounce of load evenly.',
      subtituloDinamico: 'ONLY A TITANIUM SPHERE SURVIVES',
      palabraDestacada: 'TITANIUM SPHERE',
      promptVisual3D:
        'Vertical 9:16 aspect ratio, radiant 3D engineering exploded cutaway of a flawless polished aerospace titanium sphere resisting giant glowing cyan pressure arrows from every direction while shattered cylinders crumble behind it, centered in the middle third, dramatic volumetric metallic rim lighting, continuous smooth 360-degree orbital camera.',
      imagePrompt:
        'Photorealistic Unreal Engine 5 glossy 3D engineering exploded cutaway in vertical 9:16 aspect ratio, radiant seamless aerospace titanium sphere hovering in pitch-black abyssal ocean resisting giant glowing cyan 3D force arrows pressing symmetrically from every direction while broken metal cylinders and flat hull panels shatter in the background, titanium sphere strictly centered in the middle third of the frame clear of bottom captions and side UI edges, dramatic volumetric teal and silver metallic rim lighting',
      imageSeed: 400404,
      visualSpec: {
        environment: 'tech_studio',
        mainSubject: 'working_focused',
        propIcon: 'shield_lock',
        moodPalette: 'neon_science',
        flowPrompt:
          'Photorealistic Unreal Engine 5 glossy 3D engineering exploded-view animation in vertical 9:16 aspect ratio, a radiant seamless aerospace titanium sphere suspended in the dark ocean abyss deflecting giant luminous cyan 3D pressure arrows pushing inward evenly from all angles while nearby cylinders and flat plates buckle and shatter into shards, titanium sphere strictly centered in the middle third of the frame well clear of bottom subtitles and TikTok/Shorts side UI buttons, dramatic volumetric cyan and brushed-titanium rim lighting, continuous fluid 360-degree orbital camera tracking movement with zero static frames, 60fps, no on-screen text, no watermarks.',
      },
      movimientoCamara: 'Travelling orbital 360° alrededor de la esfera de titanio',
      transicionRapida: 'Match-cut circular de la esfera de titanio a la Luna llena',
      disenoSonoro: 'Resonancia pura de titanio + pulso tecnológico ascendente',
    },
    {
      id: 'sub-sc-5',
      orden: 5,
      tiempoInicio: '0:50',
      tiempoFin: '1:00',
      segundoInicio: 50,
      segundoFin: 60,
      fase: 'Cierre y Loop',
      esGiro30s: false,
      narracion:
        "More people have walked on the Moon than reached Earth's abyssal floor. Knowing one tiny flaw seals your fate, would you ever dare to endure...",
      subtituloDinamico: 'MORE WALKED THE MOON THAN THE ABYSS',
      palabraDestacada: 'THE ABYSS',
      promptVisual3D:
        'Vertical 9:16 aspect ratio, cinematic vertical descent from a glowing silver Moon seamlessly plunging into Earth pitch-black abyssal trench where a lone tiny submarine sinks with a narrow volumetric searchlight beam centered in the middle third, dramatic volumetric moonlight and abyssal shafts, continuous downward tracking camera looping back to frame one.',
      imagePrompt:
        'Photorealistic Unreal Engine 5 epic 3D visual contrast in vertical 9:16 aspect ratio, glowing silver cratered Moon smoothly merging downward into Earth pitch-black abyssal ocean trench where a tiny solitary titanium submarine descends with a narrow volumetric spotlight beam into infinite darkness, focal silhouette strictly centered in the middle third of the frame leaving lower captions and side UI buttons completely unobstructed, dramatic volumetric moonlight and deep-sea indigo light shafts',
      imageSeed: 400505,
      visualSpec: {
        environment: 'space_cosmos',
        mainSubject: 'exploring_pov',
        propIcon: 'planet_rocket',
        moodPalette: 'cosmic_indigo',
        flowPrompt:
          'Photorealistic Unreal Engine 5 cinematic 3D seamless loop animation in vertical 9:16 aspect ratio, epic vertical transition plunging from a luminous silver Moon directly down into Earth pitch-black abyssal ocean trench where a lone tiny titanium submersible descends with a piercing volumetric searchlight beam before gliding smoothly back toward the glowing red submarine viewport, focal submersible strictly centered in the middle third of the frame clear of bottom captions and TikTok/Shorts side UI buttons, dramatic volumetric silver moonlight and deep-ocean shafts, continuous downward plunging tracking camera movement linking seamlessly back to frame one with zero static frames, 60fps, no on-screen text, no watermarks.',
      },
      movimientoCamara: 'Descenso vertical continuo conectando en bucle hacia la cabina POV',
      transicionRapida: 'Loop invisible directo al segundo 0:00 (alarma roja)',
      disenoSonoro: 'Eco de sonar abisal + crescendo en bucle que enlaza con la alarma inicial',
    },
  ],
  loopFinal:
    '"...would you ever dare to endure..." -> conecta en bucle perfecto con 0:00: "The crushing weight of a six-ton adult elephant balancing on one human fingertip."',
  metadatosPublicacion: {
    titulosAlternativos: [
      'What Happens Inside a Submarine at 4,000 Meters (2ms Implosion)',
      'Why Only a Titanium Sphere Survives the Ocean Abyss',
      '4,000m Deep: Faster Than Your Brain Can Feel Pain',
    ],
    descripcionSeo:
      'At 4,000 meters underwater, pressure equals a six-ton adult elephant balancing on one fingertip. Watch how a microscopic hairline crack triggers a 2-millisecond implosion hotter than the Sun—and why only a flawless titanium sphere survives. Would you ever dive that deep?',
    hashtags: [
      '#DeepSea',
      '#SubmarineImplosion',
      '#ExtremeScience',
      '#Shorts',
      '#Physics3D',
      '#OceanAbyss',
    ],
  },
};

export const WOW_SIGNAL_1977_SCRIPT: ViralScript = {
  id: 'script-wow-signal-1977',
  creadoEn: new Date().toISOString(),
  tituloViral: 'La Señal Wow! (1977) — 15 Micro-Escenas 3D',
  premisa:
    'Historia de suspenso 3D caricaturesco oscuro en vertical 9:16 sobre la Señal Wow! del 15 de agosto de 1977 estructurada en 15 micro-escenas dinámicas de 3 a 4 segundos (8-12 palabras por corte): Big Ear, Jerry Ehman, 6EQUJ5 en círculo rojo, 72 segundos de banda estrecha, silencio sepulcral y loop perfecto.',
  nicho: 'Lore y Misterios',
  publicoObjetivo: 'suspense',
  duracionSegundos: 60,
  estilo3D: 'pixar_dark',
  plataforma: 'tiktok_creativity',
  formatoVideo: '9:16',
  vozPreferidaId: 'diego_sereno',
  idioma: 'es',
  ganchoInicial3Seg: {
    impactoVisual:
      'Radiotelescopio retro gigante Big Ear bajo el cielo nocturno de Sagitario recibiendo un haz electromagnético cian brillante.',
    fraseApertura:
      '15 de agosto de 1977. En plena noche, Big Ear detectó algo imposible.',
    sonidoRompeScroll: 'Ping de sonar abisal + pulso electromagnético + impacto sub-bass',
  },
  ganchosAlternativos: [
    {
      id: 'curiosidad',
      label: 'Gancho Curiosidad',
      subtitle: 'Fecha histórica exacta + anomalía real',
      fraseApertura:
        '15 de agosto de 1977. En plena noche, Big Ear detectó algo imposible.',
      impactoVisual: 'Antena Big Ear nocturna golpeada por un rayo cian desde Sagitario.',
      sonidoRompeScroll: 'Sonar espacial + pulso electromagnético',
    },
    {
      id: 'polemica',
      label: 'Gancho Polémica',
      subtitle: 'Misterio sin explicación oficial en casi 50 años',
      fraseApertura:
        'En 1977 la Tierra recibió una señal imposible de 72 segundos.',
      impactoVisual: 'Círculo rojo brillante rodeando el código 6EQUJ5 con la palabra ¡Wow!',
      sonidoRompeScroll: 'Impacto grave seco + interferencia de radio',
    },
    {
      id: 'humor',
      label: 'Gancho Impacto',
      subtitle: 'Inquietud directa en primera línea',
      fraseApertura:
        'De madrugada en Ohio, una impresora reveló un mensaje desde Sagitario.',
      impactoVisual: 'Astrónomo en shock con ojos grandes iluminados por lámpara de escritorio.',
      sonidoRompeScroll: 'Alarma roja suave + chasquido de impresora matricial',
    },
  ],
  guiaEstilo3D:
    'Dark stylized 3D Pixar-thriller cartoon animation, vertical 9:16 aspect ratio, primary focal subject centered in the middle third clear of bottom subtitles and side UI buttons, 1970s Ohio State Big Ear observatory aesthetic, glowing cyan electromagnetic rim light, sharp crimson red alarm accents, deep eerie shadows, continuous dynamic camera cuts every 3-4 seconds, no watermarks.',
  visualBible: {
    artStyle:
      'Dark stylized 3D Pixar-thriller cartoon animation, expressive oversized eyes, tactile cinematic PBR shading, Octane render',
    lightingPalette:
      'Pitch-black starry Sagittarius sky, glowing cyan electromagnetic rim light, sharp crimson red alarm accents, eerie volumetric shadows',
    characterOrWorldLock:
      '1970s retro Ohio State Big Ear radio observatory and wide-eyed astronomer Jerry Ehman wearing vintage horn-rimmed glasses, cream button-down shirt, and dark wool vest',
    fixedPrefixPrompt:
      'Dark stylized 3D Pixar-thriller cartoon animation, 1970s retro Big Ear observatory aesthetic, deep starry night shadows with glowing cyan electromagnetic rim light and sharp crimson red accents',
  },
  estrategiaMonetizacion: {
    anguloRpm:
      'Misterios astronómicos reales (+60s en TikTok Creator Rewards y YouTube Shorts) con ritmo frenético de 15 micro-cortes de 3 a 4 segundos y cierre en bucle perfecto.',
    nichoMonetizador: 'Misterios Espaciales y Ciencia Real 3D',
    retencionObjetivo: '85%+ de retención promedio mediante 15 cortes visuales dinámicos (3-4s/beat)',
    ctaOrganico:
      'Pregunta en bucle ("¿quién marcó nuestro número aquel 15 de agosto de 1977?") dispara comentarios y reproducciones repetidas.',
    planEjecucionRapida: [
      'La cola adaptativa precarga automáticamente las 15 micro-escenas con caché persistente en IndexedDB.',
      'Reemplaza cualquier corte de 3-4s que quieras potenciar subiendo un clip de Google Flow con ↑ Clip.',
      'Pulsa "Descargar video completo" para exportar directamente tu .MP4 nativo (H.264 30fps + AAC 48 kHz Estéreo).',
    ],
  },
  escenas: [
    {
      id: 'wow-beat-1',
      orden: 1,
      tiempoInicio: '0:00',
      tiempoFin: '0:04',
      segundoInicio: 0,
      segundoFin: 4,
      fase: 'Gancho',
      esGiro30s: false,
      narracion: '15 de agosto de 1977. En plena noche, Big Ear detectó algo imposible.',
      subtituloDinamico: '15 DE AGOSTO 1977 · BIG EAR',
      palabraDestacada: 'Big Ear',
      visualKeywords: ['15 de agosto de 1977', 'Big Ear'],
      promptVisual3D:
        'Wide establishing shot, massive retro 1970s Big Ear steel radio telescope dish under pitch-black starry night sky, glowing cyan rim light',
      imagePrompt:
        'Wide establishing shot, massive retro 1970s Big Ear steel radio telescope dish in a dark Ohio field under starry night sky, moody fog, cyan electromagnetic sheen',
      imageSeed: 197701,
      visualSpec: {
        environment: 'space_cosmos',
        mainSubject: 'exploring_pov',
        propIcon: 'planet_rocket',
        moodPalette: 'cyber_cyan',
        flowPrompt:
          'Wide establishing shot, massive retro 1970s Big Ear steel radio telescope dish under starry night sky, glowing cyan rim light, slow push-in camera, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Plano general nocturno acercándose a Big Ear',
      transicionRapida: 'Corte seco con impacto sub-bass',
      disenoSonoro: 'Ping de sonar abisal + impacto grave',
    },
    {
      id: 'wow-beat-2',
      orden: 2,
      tiempoInicio: '0:04',
      tiempoFin: '0:08',
      segundoInicio: 4,
      segundoFin: 8,
      fase: 'Gancho',
      esGiro30s: false,
      narracion: 'Un pulso electromagnético treinta veces más potente que el ruido espacial.',
      subtituloDinamico: 'TREINTA VECES MÁS POTENTE',
      palabraDestacada: 'pulso electromagnético',
      visualKeywords: ['pulso electromagnético', 'treinta veces'],
      promptVisual3D:
        'Dramatic low-angle upward shot, blazing cyan electromagnetic energy beam crashing straight into the giant steel radio dish, sparks and glowing shockwave rings',
      imagePrompt:
        'Dramatic low-angle shot, intense glowing cyan electromagnetic wave beam striking the giant retro radio telescope dish from outer space, luminous shockwave rings in night fog',
      imageSeed: 197702,
      visualSpec: {
        environment: 'space_cosmos',
        mainSubject: 'exploring_pov',
        propIcon: 'warning_bolt',
        moodPalette: 'cyber_cyan',
        flowPrompt:
          'Dramatic low-angle shot, blazing cyan electromagnetic beam striking giant radio telescope dish with luminous shockwave rings, dynamic whip push-in, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Contrapicado dramático hacia el haz cian',
      transicionRapida: 'Flash cian + corte seco',
      disenoSonoro: 'Pulso electromagnético agudo + whoosh',
    },
    {
      id: 'wow-beat-3',
      orden: 3,
      tiempoInicio: '0:08',
      tiempoFin: '0:12',
      segundoInicio: 8,
      segundoFin: 12,
      fase: 'Tensión',
      esGiro30s: false,
      narracion: 'Venía directo desde las estrellas oscuras de la constelación de Sagitario.',
      subtituloDinamico: 'DESDE LA CONSTELACIÓN DE SAGITARIO',
      palabraDestacada: 'Sagitario',
      visualKeywords: ['Sagitario', 'estrellas'],
      promptVisual3D:
        'Deep space telescopic zoom, glowing Sagittarius constellation stars pulsing with an eerie cyan pinpoint beacon amid dark cosmic dust clouds',
      imagePrompt:
        'Deep space cinematic view of the dark Sagittarius constellation glowing with a piercing cyan star beacon pulsing through cosmic nebula dust, suspenseful depth',
      imageSeed: 197703,
      visualSpec: {
        environment: 'space_cosmos',
        mainSubject: 'exploring_pov',
        propIcon: 'planet_rocket',
        moodPalette: 'cosmic_indigo',
        flowPrompt:
          'Deep space zoom into glowing Sagittarius constellation pulsing with a piercing cyan beacon through dark nebula dust, smooth continuous zoom-in, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Zoom telescópico hacia Sagitario',
      transicionRapida: 'Corte seco a sala de control',
      disenoSonoro: 'Eco estelar + whoosh seco',
    },
    {
      id: 'wow-beat-4',
      orden: 4,
      tiempoInicio: '0:12',
      tiempoFin: '0:16',
      segundoInicio: 12,
      segundoFin: 16,
      fase: 'Desarrollo',
      esGiro30s: false,
      narracion: 'Días después, el astrónomo Jerry Ehman revisaba los datos impresos.',
      subtituloDinamico: 'JERRY EHMAN REVISABA LOS DATOS',
      palabraDestacada: 'Jerry Ehman',
      visualKeywords: ['Jerry Ehman', 'datos impresos'],
      promptVisual3D:
        'Over-the-shoulder POV shot, 1970s astronomer Jerry Ehman with vintage glasses and dark wool vest hunched over stacks of tractor-feed computer printouts under a warm desk lamp',
      imagePrompt:
        'Over-the-shoulder POV of 1970s astronomer Jerry Ehman in vintage horn-rimmed glasses and dark wool vest studying continuous green-bar computer printouts under a glowing desk lamp in a shadowy office',
      imageSeed: 197704,
      visualSpec: {
        environment: 'office_desk',
        mainSubject: 'working_focused',
        propIcon: 'compass_map',
        moodPalette: 'golden_history',
        flowPrompt:
          'Over-the-shoulder POV shot of 1970s astronomer Jerry Ehman in vintage glasses examining continuous tractor-feed computer paper under a glowing desk lamp, moody shadows, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'POV sobre el hombro hacia el escritorio',
      transicionRapida: 'Corte seco al rostro en shock',
      disenoSonoro: 'Crujido de papel continuo + tic-tac tenue',
    },
    {
      id: 'wow-beat-5',
      orden: 5,
      tiempoInicio: '0:16',
      tiempoFin: '0:20',
      segundoInicio: 16,
      segundoFin: 20,
      fase: 'Desarrollo',
      esGiro30s: false,
      narracion: 'De repente su sangre se heló al ver una secuencia anómala.',
      subtituloDinamico: 'SU SANGRE SE HELÓ AL INSTANTE',
      palabraDestacada: 'sangre se heló',
      visualKeywords: ['sangre se heló', 'anómala'],
      promptVisual3D:
        'Tight dramatic close-up of astronomer Jerry Ehman wide expressive cartoon eyes behind horn-rimmed glasses frozen in pure shock, crimson and cyan screen reflection on lenses',
      imagePrompt:
        'Tight dramatic close-up of wide-eyed 1970s astronomer Jerry Ehman behind vintage glasses frozen in breathless shock, sharp red and cyan light reflecting on his lenses, dark office shadows',
      imageSeed: 197705,
      visualSpec: {
        environment: 'office_desk',
        mainSubject: 'shocked_crowd',
        propIcon: 'warning_bolt',
        moodPalette: 'alert_stress',
        flowPrompt:
          'Tight dramatic close-up of wide-eyed 1970s astronomer Jerry Ehman frozen in pure shock behind vintage glasses with glowing red reflection, punch-in zoom, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Primerísimo plano con punch-in a los ojos',
      transicionRapida: 'Impacto seco al bolígrafo rojo',
      disenoSonoro: 'Golpe grave sub-bass + silencio súbito',
    },
    {
      id: 'wow-beat-6',
      orden: 6,
      tiempoInicio: '0:20',
      tiempoFin: '0:24',
      segundoInicio: 20,
      segundoFin: 24,
      fase: 'Desarrollo',
      esGiro30s: false,
      narracion: 'Tomó su bolígrafo y rodeó con un círculo rojo el código 6EQUJ5.',
      subtituloDinamico: 'CÍRCULO ROJO EN 6EQUJ5',
      palabraDestacada: '6EQUJ5',
      visualKeywords: ['círculo rojo', '6EQUJ5'],
      promptVisual3D:
        'Extreme macro close-up of a red ink pen drawing a bold glowing crimson circle around the printed characters 6EQUJ5 on vintage computer printout paper',
      imagePrompt:
        'Extreme macro top-down close-up of a vintage red ink pen circling the bold printed sequence 6EQUJ5 in glowing crimson ink on retro tractor-feed computer paper, dramatic spotlight',
      imageSeed: 197706,
      visualSpec: {
        environment: 'office_desk',
        mainSubject: 'working_focused',
        propIcon: 'warning_bolt',
        moodPalette: 'crimson_pulse',
        flowPrompt:
          'Extreme macro top-down close-up of a red ink pen circling the bold code 6EQUJ5 on vintage computer printout paper with dramatic crimson spotlight, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Plano macro cenital sobre el código 6EQUJ5',
      transicionRapida: 'Destello rojo neón',
      disenoSonoro: 'Trazo de bolígrafo amplificado + pulso electromagnético',
    },
    {
      id: 'wow-beat-7',
      orden: 7,
      tiempoInicio: '0:24',
      tiempoFin: '0:28',
      segundoInicio: 24,
      segundoFin: 28,
      fase: 'Desarrollo',
      esGiro30s: false,
      narracion: 'Era tan imposible que solo escribió una palabra al margen: ¡Wow!',
      subtituloDinamico: 'ESCRIBIÓ AL MARGEN: ¡WOW!',
      palabraDestacada: 'Wow!',
      visualKeywords: ['Wow!', 'imposible'],
      promptVisual3D:
        'Extreme macro tilted close-up of the handwritten red word Wow! glowing dramatically in the paper margin beside circled 6EQUJ5, floating dust motes in desk lamp beam',
      imagePrompt:
        'Extreme macro close-up of the handwritten crimson word Wow! on the margin of vintage computer printout paper beside 6EQUJ5, dramatic warm desk lamp spotlight and dark shadows',
      imageSeed: 197707,
      visualSpec: {
        environment: 'office_desk',
        mainSubject: 'shocked_crowd',
        propIcon: 'warning_bolt',
        moodPalette: 'alert_stress',
        flowPrompt:
          'Extreme macro tilted close-up focusing on the glowing red handwritten word Wow! on vintage computer printout margin, crisp rack focus, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Zoom-in rápido sobre la palabra ¡Wow!',
      transicionRapida: 'Corte seco con flash blanco',
      disenoSonoro: 'Impacto metálico + eco corto',
    },
    {
      id: 'wow-beat-8',
      orden: 8,
      tiempoInicio: '0:28',
      tiempoFin: '0:32',
      segundoInicio: 28,
      segundoFin: 32,
      fase: 'Giro 30s',
      esGiro30s: true,
      narracion: 'Lo más aterrador no fue su fuerza, sino su frecuencia de banda estrecha.',
      subtituloDinamico: 'FRECUENCIA DE BANDA ESTRECHA',
      palabraDestacada: 'banda estrecha',
      visualKeywords: ['banda estrecha', 'frecuencia'],
      promptVisual3D:
        'High-contrast close-up of a retro glowing green-cyan oscilloscope screen displaying a razor-sharp narrowband vertical frequency spike piercing through flat noise',
      imagePrompt:
        'High-contrast close-up of a glowing 1970s laboratory oscilloscope screen showing a razor-sharp neon cyan narrowband frequency spike rising high above static noise, moody dark lab',
      imageSeed: 197708,
      visualSpec: {
        environment: 'tech_studio',
        mainSubject: 'thinking_curious',
        propIcon: 'warning_bolt',
        moodPalette: 'neon_science',
        flowPrompt:
          'High-contrast close-up of a glowing retro oscilloscope screen displaying a sharp neon cyan narrowband vertical spike rising above static, tense dolly push-in, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Travelling tenso sobre el pico del osciloscopio',
      transicionRapida: 'Corte de impacto (Giro 30s)',
      disenoSonoro: 'Acorde de giro dramático + pulso de radio',
    },
    {
      id: 'wow-beat-9',
      orden: 9,
      tiempoInicio: '0:32',
      tiempoFin: '0:36',
      segundoInicio: 32,
      segundoFin: 36,
      fase: 'Giro 30s',
      esGiro30s: false,
      narracion: 'Una firma artificial que ninguna estrella natural puede producir jamás.',
      subtituloDinamico: 'NINGUNA ESTRELLA PRODUCE ESTO',
      palabraDestacada: 'firma artificial',
      visualKeywords: ['firma artificial', 'estrella'],
      promptVisual3D:
        'Epic wide sci-fi angle in deep space, colossal shadowy alien megastructure ring silhouette orbiting a distant dark star emitting a razor-thin cyan laser beam',
      imagePrompt:
        'Epic wide deep-space silhouette of a mysterious ancient alien megastructure ring orbiting a dim star emitting a narrow cyan electromagnetic beam into darkness, neon orange rim light',
      imageSeed: 197709,
      visualSpec: {
        environment: 'space_cosmos',
        mainSubject: 'exploring_pov',
        propIcon: 'planet_rocket',
        moodPalette: 'neon_science',
        flowPrompt:
          'Epic wide deep-space shot of a mysterious shadowed alien megastructure ring emitting a thin cyan beam across the void, slow orbital tracking shot, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Plano épico orbital en el espacio profundo',
      transicionRapida: 'Whip-cut al cronómetro',
      disenoSonoro: 'Zumbido profundo alienígena + whoosh',
    },
    {
      id: 'wow-beat-10',
      orden: 10,
      tiempoInicio: '0:36',
      tiempoFin: '0:40',
      segundoInicio: 36,
      segundoFin: 40,
      fase: 'Escalada',
      esGiro30s: false,
      narracion: 'Duró exactamente 72 segundos. Ni uno más, ni uno menos.',
      subtituloDinamico: 'EXACTAMENTE 72 SEGUNDOS',
      palabraDestacada: '72 segundos',
      visualKeywords: ['72 segundos'],
      promptVisual3D:
        'Extreme close-up of a glowing holographic crimson-orange laboratory countdown timer frozen at 72 seconds above pulsing cyan radio waves',
      imagePrompt:
        'Extreme close-up of a glowing retro-futuristic crimson-orange digital laboratory timer displaying 72 seconds over pulsing cyan waveform lines in pitch-black shadow',
      imageSeed: 197710,
      visualSpec: {
        environment: 'tech_studio',
        mainSubject: 'thinking_curious',
        propIcon: 'clock_calendar',
        moodPalette: 'crimson_pulse',
        flowPrompt:
          'Extreme close-up of a glowing crimson-orange laboratory digital timer freezing at 72 seconds over fading cyan waveform spikes, sharp camera snap, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Plano detalle fijo con micro-temblor al reloj 72s',
      transicionRapida: 'Apagón seco en el segundo 72',
      disenoSonoro: 'Tic-tac tenso + corte seco en silencio',
    },
    {
      id: 'wow-beat-11',
      orden: 11,
      tiempoInicio: '0:40',
      tiempoFin: '0:44',
      segundoInicio: 40,
      segundoFin: 44,
      fase: 'Tensión',
      esGiro30s: false,
      narracion: 'Y entonces se apagó de golpe. Nunca volvió a ocurrir.',
      subtituloDinamico: 'NUNCA VOLVIÓ A OCURRIR',
      palabraDestacada: 'Nunca volvió',
      visualKeywords: ['Nunca volvió', 'se apagó'],
      promptVisual3D:
        'Medium shot inside darkened radio control room, glowing cyan waveform collapsing instantly into a dead flat horizontal line while red standby lamps blink softly',
      imagePrompt:
        'Medium shot inside a shadowy 1970s observatory control room where the oscilloscope beam collapses into a dead flat line, cold eerie blue shadows and dim red console indicators',
      imageSeed: 197711,
      visualSpec: {
        environment: 'mystery_vault',
        mainSubject: 'stressed_head',
        propIcon: 'warning_bolt',
        moodPalette: 'cosmic_indigo',
        flowPrompt:
          'Medium shot in dark observatory control room as glowing cyan oscilloscope signal flatlines completely into stillness, slow eerie pull-back, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Retroceso lento de la pantalla apagada',
      transicionRapida: 'Corte limpio a las antenas modernas',
      disenoSonoro: 'Pitido apagándose en eco vacío',
    },
    {
      id: 'wow-beat-12',
      orden: 12,
      tiempoInicio: '0:44',
      tiempoFin: '0:48',
      segundoInicio: 44,
      segundoFin: 48,
      fase: 'Tensión',
      esGiro30s: false,
      narracion: 'Decenas de radiotelescopios apuntaron hacia Sagitario durante casi cincuenta años.',
      subtituloDinamico: 'APUNTARON DURANTE CINCUENTA AÑOS',
      palabraDestacada: 'radiotelescopios',
      visualKeywords: ['radiotelescopios', 'Sagitario'],
      promptVisual3D:
        'Dramatic wide low-angle shot of an array of giant white modern radio telescope dishes tilted synchronously toward the cold starry night sky',
      imagePrompt:
        'Dramatic wide low-angle view of a desert array of giant modern radio telescopes aiming up together into a freezing dark starry night sky, cold blue moonlight and distant mist',
      imageSeed: 197712,
      visualSpec: {
        environment: 'ocean_deep',
        mainSubject: 'exploring_pov',
        propIcon: 'compass_map',
        moodPalette: 'cosmic_indigo',
        flowPrompt:
          'Dramatic wide low-angle shot of an array of giant modern radio telescopes tilting together toward the starry Sagittarius sky, smooth lateral crane glide, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Travelling lateral bajo las antenas gigantes',
      transicionRapida: 'Paneo ascendente al vacío negro',
      disenoSonoro: 'Viento frío desértico + sonar lejano',
    },
    {
      id: 'wow-beat-13',
      orden: 13,
      tiempoInicio: '0:48',
      tiempoFin: '0:52',
      segundoInicio: 48,
      segundoFin: 52,
      fase: 'Tensión',
      esGiro30s: false,
      narracion: 'Pero solo encontraron el silencio sepulcral del vacío interestelar.',
      subtituloDinamico: 'EL SILENCIO SEPULCRAL DEL VACÍO',
      palabraDestacada: 'silencio sepulcral',
      visualKeywords: ['silencio sepulcral', 'vacío'],
      promptVisual3D:
        'Lonely high-angle cosmic shot of faint dying cyan radio ripples dissolving completely into an endless pitch-black abyss of deep space',
      imagePrompt:
        'Lonely haunting cosmic wide shot of faint fading cyan radio rings dissolving into an empty pitch-black interstellar void, cold blue eerie lighting, total isolation',
      imageSeed: 197713,
      visualSpec: {
        environment: 'ocean_deep',
        mainSubject: 'exploring_pov',
        propIcon: 'planet_rocket',
        moodPalette: 'cosmic_indigo',
        flowPrompt:
          'Lonely haunting deep-space shot of faint cyan radio rings fading completely into an endless pitch-black void, slow upward drift, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Deriva lenta hacia el abismo vacío',
      transicionRapida: 'Corte directo a la Tierra en órbita',
      disenoSonoro: 'Silencio atmosférico + eco sub-bass',
    },
    {
      id: 'wow-beat-14',
      orden: 14,
      tiempoInicio: '0:52',
      tiempoFin: '0:56',
      segundoInicio: 52,
      segundoFin: 56,
      fase: 'Escalada',
      esGiro30s: false,
      narracion: '¿Fue una llamada de auxilio perdida o un faro galáctico?',
      subtituloDinamico: '¿LLAMADA DE AUXILIO O FARO?',
      palabraDestacada: 'llamada de auxilio',
      visualKeywords: ['llamada de auxilio', 'faro'],
      promptVisual3D:
        'Cinematic orbital wide shot pulling away from a glowing blue Earth floating fragilely in pitch-black space while faint red cosmic sparks drift around it',
      imagePrompt:
        'Cinematic orbital pull-back shot from a small glowing blue Earth suspended in pitch-black deep space while distant eerie stars subtly shimmer in the void behind it',
      imageSeed: 197714,
      visualSpec: {
        environment: 'space_cosmos',
        mainSubject: 'exploring_pov',
        propIcon: 'planet_rocket',
        moodPalette: 'crimson_pulse',
        flowPrompt:
          'Cinematic orbital pull-back away from glowing Earth suspended in dark space with subtle crimson rim reflections, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Zoom-out orbital alejándose de la Tierra',
      transicionRapida: 'Corte de suspenso a la alarma roja',
      disenoSonoro: 'Crescendo de suspenso + pulso lejano',
    },
    {
      id: 'wow-beat-15',
      orden: 15,
      tiempoInicio: '0:56',
      tiempoFin: '1:00',
      segundoInicio: 56,
      segundoFin: 60,
      fase: 'Cierre y Loop',
      esGiro30s: false,
      narracion: 'Nadie sabe aún quién marcó nuestro número aquel...',
      subtituloDinamico: '¿QUIÉN MARCÓ NUESTRO NÚMERO?',
      palabraDestacada: 'quién marcó',
      visualKeywords: ['quién marcó'],
      promptVisual3D:
        'Dramatic close-up of a flashing crimson red alarm beacon inside the 1970s Big Ear control room reflecting starry eyes in the dark window glass, suspense loop ending',
      imagePrompt:
        'Dramatic close-up of a flashing crimson red warning beacon inside the dark 1970s Big Ear observatory window reflecting mysterious starlit eyes in the night sky, cinematic loop',
      imageSeed: 197715,
      visualSpec: {
        environment: 'mystery_vault',
        mainSubject: 'exploring_pov',
        propIcon: 'warning_bolt',
        moodPalette: 'crimson_pulse',
        flowPrompt:
          'Dramatic close-up of a flashing crimson red warning light inside the dark 1970s observatory window reflecting starry Sagittarius skies, smooth reverse-dolly loop back to frame one, vertical 9:16, 60fps.',
      },
      movimientoCamara: 'Acercamiento en bucle hacia la luz roja de Big Ear',
      transicionRapida: 'Loop perfecto directo al segundo 0:00',
      disenoSonoro: 'Golpe grave final enlazando con el sonar de 0:00',
    },
  ],
  loopFinal:
    '"...Nadie sabe aún quién marcó nuestro número aquel..." -> enlaza en bucle perfecto con 0:00: "15 de agosto de 1977. En plena noche, Big Ear detectó algo imposible."',
  metadatosPublicacion: {
    titulosAlternativos: [
      'La Señal Wow! de 1977: 72 segundos que congelaron a la NASA',
      '6EQUJ5: El mensaje espacial que nunca volvió a repetirse',
      '¿Quién llamó a la Tierra el 15 de agosto de 1977?',
    ],
    descripcionSeo:
      'El 15 de agosto de 1977 el radiotelescopio Big Ear captó la enigmática Señal Wow! (6EQUJ5) durante exactamente 72 segundos desde Sagitario. ¿Llamada de auxilio o civilización avanzada?',
    hashtags: [
      '#SeñalWow',
      '#6EQUJ5',
      '#MisteriosDelEspacio',
      '#Suspenso3D',
      '#Shorts',
      '#TikTokMisterio',
    ],
  },
};

export function getStyle3DById(id: Style3DId): Style3DConfig {
  return STYLES_3D.find((s) => s.id === id) ?? STYLES_3D[0];
}
