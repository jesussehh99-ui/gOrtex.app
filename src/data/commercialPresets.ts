import type {
  CommercialBlueprint,
  CommercialBrief,
  CommercialSector,
  FoleyCueType,
  StudioMode,
} from '../types';

export interface CommercialSectorPreset {
  id: CommercialSector;
  label: string;
  shortLabel: string;
  nicheName: string;
  defaultBlueprint: CommercialBlueprint;
  description: string;
  visualDirectionEn: string;
  monetizationGoal: string;
  ideas: string[];
  sampleBrief: Partial<CommercialBrief>;
}

export const COMMERCIAL_SECTORS: CommercialSectorPreset[] = [
  {
    id: 'luxury_home_apartment',
    label: 'Casas y Apartamentos',
    shortLabel: 'Residencial',
    nicheName: 'Bienes Raíces · Casas y Apartamentos',
    defaultBlueprint: 'real_estate_tour',
    description: 'Recorridos editoriales de casas, penthouses y apartamentos con ficha técnica.',
    visualDirectionEn:
      'Architectural Digest luxury residential photography, warm golden-hour sunlight streaming through floor-to-ceiling glass, rectilinear 16mm wide-angle lens without fisheye distortion, natural oak wood, brushed stone and travertine textures, staged modern minimalist furniture, crisp balanced interior exposure',
    monetizationGoal: 'Generar citas calificadas de visita presencial y consultas directas por WhatsApp',
    ideas: [
      'Recorrido de apartamento moderno de 185 m² con terraza panorámica, cocina italiana con isla de cuarzo y 3 habitaciones con luz natural.',
      'Casa minimalista recién estrenada con doble altura en sala, jardín interior, piscina climatizada y vista despejada al atardecer.',
      'Penthouse dúplex con ventanales de piso a techo, vestidor walk-in y terraza privada lista para entregas inmediatas.',
    ],
    sampleBrief: {
      businessOrPropertyName: 'Residencia Vista Parque',
      priceText: '$345,000 USD',
      areaText: '185 m²',
      roomsBathsText: '3 Hab · 2.5 Baños',
      locationText: 'Zona Norte · Frente al parque',
      ctaHeadline: 'Agenda tu visita privada',
    },
  },
  {
    id: 'real_estate_development',
    label: 'Edificios y Proyectos',
    shortLabel: 'Desarrollos',
    nicheName: 'Bienes Raíces · Edificios y Proyectos',
    defaultBlueprint: 'real_estate_tour',
    description: 'Preventas, torres residenciales, amenidades y rentabilidad para inversionistas.',
    visualDirectionEn:
      'High-end architectural real estate development photography, golden-hour drone aerial facade and lush landscaped amenities, clean glass and concrete geometry, balanced natural daylight, luxury rooftop pool and lobby staging, 24mm tilt-shift architectural lens',
    monetizationGoal: 'Captar leads de preventa e inversionistas interesados en lista de precios y planos',
    ideas: [
      'Torre residencial en preventa con rooftop panorámico, gimnasio equipado, coworking privado y departamentos desde 1 y 2 recámaras.',
      'Nuevo proyecto arquitectónico de uso mixto a pasos del corredor financiero con enganche flexible y entrega garantizada.',
      'Desarrollo de condominios boutique con jardines elevados, seguridad 24/7 y alta plusvalía proyectada en la zona.',
    ],
    sampleBrief: {
      businessOrPropertyName: 'Torre Mirador 42',
      priceText: 'Desde $198,000 USD',
      areaText: '78 a 142 m²',
      roomsBathsText: '1–3 Hab · Rooftop',
      locationText: 'Distrito Financiero',
      ctaHeadline: 'Solicita planos y disponibilidad',
    },
  },
  {
    id: 'restaurant_cafe',
    label: 'Restaurantes y Cafés',
    shortLabel: 'Gastronomía',
    nicheName: 'Comercial · Restaurantes y Cafés',
    defaultBlueprint: 'local_business_ad',
    description: 'Ambiente acogedor, platos estrella, café de especialidad y reservas directas.',
    visualDirectionEn:
      'Editorial hospitality and food photography, warm golden natural window light, shallow depth of field on artisanal plated dish and specialty espresso pour, textured wood tables and ceramic dishware, welcoming upscale bistro ambiance, 35mm cinema lens',
    monetizationGoal: 'Aumentar reservas de mesa, pedidos locales y visitas en fin de semana',
    ideas: [
      'Bistró artesanal con masa madre horneada cada mañana, café de especialidad tostado en casa y brunch todo el fin de semana.',
      'Restaurante de cocina de autor al fuego vivo con terraza iluminada al atardecer y carta de temporada.',
      'Cafetería minimalista en esquina luminosa con matcha ceremonial, repostería francesa recién salida del horno y barra de espresso.',
    ],
    sampleBrief: {
      businessOrPropertyName: 'Bistró Casa Olivo',
      locationText: 'Calle Central 214',
      promoOrHoursText: 'Mar–Dom 8:00 a 22:00',
      ctaHeadline: 'Reserva tu mesa hoy',
    },
  },
  {
    id: 'retail_storefront',
    label: 'Locales Comerciales',
    shortLabel: 'Tiendas y Locales',
    nicheName: 'Comercial · Locales y Tiendas',
    defaultBlueprint: 'commercial_promo',
    description: 'Showrooms, boutiques, locales en renta o venta y campañas de temporada.',
    visualDirectionEn:
      'Upscale retail showroom and storefront commercial photography, clean architectural lighting, curated display shelving with warm accent spots, polished concrete and timber finishes, inviting wide-angle interior view with natural daylight',
    monetizationGoal: 'Atraer tráfico calificado a tienda física y consultas por catálogo o renta de local',
    ideas: [
      'Local comercial a pie de calle con 12 metros de vitrina panorámica, doble altura y alto flujo peatonal listo para estrenar.',
      'Showroom de mobiliario de diseño contemporáneo con colección de temporada y asesoría personalizada sin costo.',
      'Boutique de moda local presentando cápsula limitada de materiales naturales con atención directa en tienda.',
    ],
    sampleBrief: {
      businessOrPropertyName: 'Showroom Atelier Norte',
      areaText: '140 m² · Pie de calle',
      promoOrHoursText: '20% OFF esta semana',
      ctaHeadline: 'Visítanos hoy en tienda',
    },
  },
  {
    id: 'office_coworking',
    label: 'Oficinas y Coworking',
    shortLabel: 'Oficinas',
    nicheName: 'Comercial · Oficinas y Coworking',
    defaultBlueprint: 'real_estate_tour',
    description: 'Espacios corporativos equipados, salas de juntas y oficinas privadas listas.',
    visualDirectionEn:
      'Contemporary architectural office and coworking photography, bright balanced daylight through glass curtain walls, clean oak workstations, acoustic glass meeting rooms, greenery accents, rectilinear 16mm interior lens, crisp editorial clarity',
    monetizationGoal: 'Agendar recorridos corporativos y cotizaciones de oficinas privadas o membresías',
    ideas: [
      'Piso corporativo AAA listo para ocupar con 4 salas de juntas acristaladas, fibra óptica redundante y terraza ejecutiva.',
      'Espacio de coworking luminoso con oficinas privadas para equipos de 4 a 20 personas, café incluido y ubicación céntrica.',
      'Oficina boutique recién remodelada con recepción, luz natural en todo el perímetro y estacionamiento subterráneo.',
    ],
    sampleBrief: {
      businessOrPropertyName: 'Hub Ejecutivo Alamedas',
      priceText: 'Desde $1,450/mes',
      areaText: '220 m² equipados',
      locationText: 'Av. Reforma · Piso 14',
      ctaHeadline: 'Agenda un tour corporativo',
    },
  },
  {
    id: 'commercial_service',
    label: 'Servicios / Negocios',
    shortLabel: 'Servicios',
    nicheName: 'Comercial · Servicios y Negocios Locales',
    defaultBlueprint: 'local_business_ad',
    description: 'Clínicas, estudios de arquitectura, gimnasios boutique, spas y talleres.',
    visualDirectionEn:
      'Clean editorial commercial brand photography, bright airy modern studio space, authentic warm daylight, crisp architectural lines, calm luxury service environment, 35mm documentary commercial lens, realistic textures and natural skin tones',
    monetizationGoal: 'Convertir espectadores locales en citas agendadas y solicitudes de cotización',
    ideas: [
      'Clínica dental estética con escáner 3D sin molestias, salas luminosas relajantes y diagnóstico integral en la primera cita.',
      'Estudio de arquitectura e interiorismo que transforma viviendas antiguas en espacios luminosos llave en mano.',
      'Estudio boutique de pilates reformer con grupos reducidos, luz natural de mañana y primera clase de evaluación.',
    ],
    sampleBrief: {
      businessOrPropertyName: 'Estudio Lumina',
      locationText: 'Colonia Jardines',
      promoOrHoursText: 'Primera evaluación incluida',
      ctaHeadline: 'Reserva tu cita directa',
    },
  },
];

export const COMMERCIAL_ALLOWED_FOLEY: FoleyCueType[] = [
  'none',
  'whoosh_cut',
  'hud_click',
  'riser_tension',
];

export const DEFAULT_COMMERCIAL_BRIEF: CommercialBrief = {
  businessOrPropertyName: '',
  sector: 'luxury_home_apartment',
  priceText: '',
  areaText: '',
  roomsBathsText: '',
  locationText: '',
  promoOrHoursText: '',
  ctaHeadline: '',
  ctaContact: '',
  includeCtaCard: true,
};

export function getCommercialSectorById(id?: CommercialSector): CommercialSectorPreset {
  return COMMERCIAL_SECTORS.find((s) => s.id === id) ?? COMMERCIAL_SECTORS[0];
}

export function pickNextCommercialIdea(
  sectorId: CommercialSector,
  currentPremise: string
): { sector: CommercialSectorPreset; idea: string } {
  const sector = getCommercialSectorById(sectorId);
  const idx = sector.ideas.findIndex((i) => i.trim() === currentPremise.trim());
  const nextIdea = sector.ideas[(idx + 1) % sector.ideas.length] ?? sector.ideas[0];
  return { sector, idea: nextIdea };
}

export function isCommercialStudioMode(mode?: StudioMode): boolean {
  return mode === 'commercial_real_estate';
}

export function sanitizeCommercialFoleyCue(cue?: FoleyCueType): FoleyCueType {
  if (!cue) return 'none';
  if (COMMERCIAL_ALLOWED_FOLEY.includes(cue)) return cue;
  if (cue === 'sub_drop' || cue === 'thunder_impact') return 'whoosh_cut';
  return 'none';
}
