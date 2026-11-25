import type {
  AudienceId,
  DurationOption,
  HookStyleId,
  Style3DId,
  TrendItem,
  ViralScript,
} from '../types';

export interface ViralNicheBank {
  id: string;
  emoji: string;
  label: string;
  nicheName: string;
  audience: AudienceId;
  style3D: Style3DId;
  monetizationGoal: string;
  ideas: string[];
}

export const VIRAL_NICHE_BANKS: ViralNicheBank[] = [
  {
    id: 'historia_absurda',
    emoji: '🏛️',
    label: 'Historia Absurda (What If)',
    nicheName: 'Historia Absurda (What If)',
    audience: 'viral_meme',
    style3D: 'viral_meme_3d',
    monetizationGoal: 'Viralidad orgánica explosiva con humor 3D original y reacciones cómicas',
    ideas: [
      'Año 44 a.C., Senado de Roma: una bocina Bluetooth de 120 decibelios detona música electrónica en plena votación, paralizando de pánico a 300 senadores que creen oír la ira de Júpiter… pero ¿por qué el único senador que no huye empieza a seguir el ritmo?',
      'Torneo medieval de 1386: un caballero con armadura de 30 kilos recibe un celular con TikTok y Wi-Fi satelital, olvida su lanza y provoca un caos en cadena en la tribuna real… hasta que el rey descubre qué video hipnotizó a todo su ejército.',
      'Esparta, año 480 a.C.: aparece un gimnasio con luz neón y batidos de pre-entreno de 400 mg de cafeína; el pulso de trescientos guerreros se dispara al doble y doblan espadas de bronce con las manos… pero ¿qué efecto secundario nadie calculó al caer la noche?',
      'Meseta de Guiza, 2560 a.C.: un auto eléctrico deportivo estaciona en silencio absoluto frente a 10.000 obreros de la Gran Pirámide y proyecta haces láser sobre la piedra… desatando una estampida histórica y un jeroglífico prohibido que aún desconcierta a los arqueólogos.',
      'Florencia, 1503: Leonardo da Vinci bebe cuatro espressos dobles seguidos, su cerebro entra en hiperactividad sin dormir 72 horas y dibuja máquinas imposibles del siglo XXI… pero ¿qué página arrancó de su cuaderno antes de desaparecer esa madrugada?',
      'Mar del Norte, año 995: un dron 4K con luces estroboscópicas desciende sobre un drakkar vikingo en plena tormenta, convenciendo a la tripulación de que Odín los observa desde las nubes… hasta que el capitán dispara una flecha que cambia el destino del barco.',
      'Versalles, 1682: un árbitro moderno interrumpe el baile de Luis XIV pitando un penal con pantalla VAR gigante; la corte entra en histeria por una tarjeta roja al rey… y nadie explica por qué el monarca ordenó construir un estadio secreto al día siguiente.',
      'Waterloo, 18 de junio de 1815: cinco minutos antes de la carga final, Napoleón recibe Google Maps en vivo con tráfico satelital y cambia toda su formación causando un colapso táctico… pero ¿qué punto rojo parpadeaba detrás de su propio campamento?',
      'Londres, 1412: un vigilante nocturno enciende una linterna táctica de 100.000 lúmenes que convierte la medianoche en mediodía y despierta a toda la ciudad aterrorizada… hasta que el haz ilumina algo moviéndose sobre las gárgolas que nadie debía ver.',
      'Alejandría, año 48 a.C.: Cleopatra prueba un taco con salsa habanera de 350.000 unidades Scoville, su ritmo cardíaco se acelera con sudor frío y ordena cerrar el palacio entero… dejando en el aire si lo declaró veneno de guerra o el tesoro más caro del Nilo.',
    ],
  },
  {
    id: 'psicologia_oscura',
    emoji: '🧠',
    label: 'Psicología Oscura',
    nicheName: 'Psicología Oscura y Comportamiento',
    audience: 'suspense',
    style3D: 'pixar_dark',
    monetizationGoal: 'Retención superior al 75% en nicho de alto RPM y guardados masivos',
    ideas: [
      'El silencio táctico de exactamente 4 segundos tras una respuesta dudosa dispara la amígdala del cerebro rival y genera una presión social insoportable que lo obliga a confesar detalles ocultos… pero ¿por qué quienes lo dominan casi nunca muestran emoción al escuchar la verdad?',
      'Experimento real de Stanford sobre el efecto Ben Franklin invertido: pedir un favor minúsculo de 30 segundos reconfigura la disonancia cognitiva de tu rival y lo vuelve tu aliado inconsciente… dejando una pregunta inquietante: ¿cuántas decisiones tuyas fueron sembradas así?',
      'El refuerzo intermitente descubierto por Skinner en 1957 activa más dopamina que una recompensa constante, atrapando el cerebro humano en un bucle de ansiedad idéntico al de un casino… y muy pocos detectan la señal exacta que delata cuando alguien lo usa contigo.',
      'El efecto Zeigarnik bloquea la memoria de trabajo de tu corteza prefrontal cuando alguien corta contacto sin cierre, provocando pensamientos intrusivos cada 11 minutos durante semanas… pero ¿por qué una sola frase de cierre apaga ese circuito casi al instante?',
      'Bajar el volumen de tu voz un 20% en medio de una discusión intensa activa la respuesta de alerta auditiva del cerebro ajeno y te transfiere el dominio de la sala sin levantar la voz… ¿qué ocurre en la pupila de la otra persona en el segundo exacto en que cambia la jerarquía?',
      'El sesgo de anclaje invisible demostró que lanzar una cifra extrema al primer segundo de una negociación distorsiona el juicio lógico hasta en un 42% incluso en expertos… pero ¿cómo lograron los vendedores detectar el momento exacto en que tu cerebro ya aceptó el ancla?',
      'La técnica del espejo verbal de los negociadores del FBI: repetir las últimas 3 palabras con tono descendente reduce el cortisol del interlocutor en segundos y le hace revelar su verdadero motivo… ¿por qué casi nadie nota que está siendo guiado mientras habla?',
      'El efecto Pratfall comprobó que cometer un error inofensivo calculado aumenta la confianza percibida en un 33% porque desactiva las defensas contra la perfección artificial… pero ¿cómo distinguir un tropiezo genuino de una jugada fría de persuasión?',
      'La paradoja de la micro-mirada triangular: cuando alguien alterna la vista entre tus ojos y tus labios durante menos de dos segundos, su sistema nervioso delata intención oculta antes de que diga una palabra… ¿qué tercera señal en los pies confirma si dice la verdad o te manipula?',
      'El síndrome de la ilusión de control: plantar dos opciones falsamente opuestas hace que una persona obstinada defienda con pasión la decisión que tú diseñaste… pero ¿cuántas veces hoy elegiste dentro de un menú que alguien cerró a propósito?',
    ],
  },
  {
    id: 'dinero_60s',
    emoji: '💸',
    label: 'Dinero en 60s',
    nicheName: 'Dinero y Finanzas en 60s',
    audience: 'educational',
    style3D: 'paper_diorama',
    monetizationGoal: 'Máximo RPM financiero apto para todos los anunciantes y alto índice de guardados',
    ideas: [
      'A los 20 años, apartar solo 5 dólares diarios al 9% compuesto supera los 400.000 dólares antes de jubilarte, mientras esperar 10 años te destruye más de la mitad del patrimonio por pura matemática exponencial… pero ¿por qué casi ninguna escuela enseña la curva del año 15?',
      'Las cuotas "sin intereses" esconden un recargo silencioso del 14% al 22% ya incrustado en el precio y disparan el gasto impulsivo del cerebro al anestesiar el dolor de pagar… ¿cuánto dinero real pierden los compradores cada año creyendo que ganaron al banco?',
      'Mantener tus ahorros quietos en cuenta corriente con una inflación del 6% anual te hace perder casi la mitad de tu poder adquisitivo en 12 años sin que el saldo baje un centavo… y el dato oculto que nadie mira está en la letra chica de tu propio banco.',
      'Tres gastos hormiga de menos de 4 dólares diarios drenan 4.380 dólares al año y provocan la sensación crónica de vivir al límite aunque suba tu sueldo… pero ¿cuál de los tres activa el mismo circuito adictivo que una suscripción invisible?',
      'La ingeniería psicológica de los supermercados coloca la leche al fondo y los productos de mayor margen a exactamente 1,50 metros de altura, haciéndote gastar hasta un 40% más por fatiga de decisión… ¿qué truco esconden el tamaño del carrito y la velocidad de la música?',
      'La regla del 72 permite calcular en 3 segundos cuándo se duplicará tu dinero —o cuándo se duplicará tu deuda de tarjeta al 48% anual— revelando una brecha brutal en solo 18 meses… ¿por qué el pago mínimo está diseñado para que nunca salgas del ciclo?',
      'Un auto nuevo financiado a 60 meses pierde el 20% de su valor en el primer minuto fuera de la agencia y te cobra miles en intereses sobre un activo que se encoge cada día… pero ¿qué punto exacto de depreciación usan los millonarios para comprar el mismo vehículo a mitad de precio?',
      'Siete suscripciones "baratas" de 11 dólares al mes secuestran casi 1.000 dólares al año usando cobros automáticos diseñados para pasar bajo el radar cognitivo… y las plataformas saben exactamente en qué día del mes olvidas cancelarlas.',
      'El método avalancha contra bola de nieve en tarjetas de crédito puede ahorrarte años de intereses, pero un sesgo emocional oculto hace que el 68% abandone el plan matemáticamente perfecto al tercer mes… ¿cuál de los dos funciona de verdad con el cerebro humano?',
      'La regla de las 72 horas bloquea el pico de dopamina de la compra en 1 clic y elimina hasta el 78% del arrepentimiento financiero en un mes… pero ¿por qué los algoritmos de las tiendas te envían un cupón justo a la hora 71?',
    ],
  },
  {
    id: 'ciencia_extrema',
    emoji: '🔬',
    label: 'Ciencia Extrema',
    nicheName: 'Ciencia Extrema y Universo',
    audience: 'educational',
    style3D: 'ue5_realism',
    monetizationGoal: 'Alto tiempo de visualización y comentarios curiosos en YouTube y TikTok',
    ideas: [
      'Si la rotación de la Tierra de 1.670 km/h se detuviera un solo segundo, los océanos y todo lo no anclado a la roca saldrían disparados hacia el este generando vientos supersónicos capaces de arrasar continentes… pero ¿qué pasaría en los polos exactos donde la velocidad es casi cero?',
      'Al cruzar el horizonte de sucesos de un agujero negro estelar, la gravedad diferente entre tus pies y tu cabeza te estiraría como un hilo atómico en milisegundos mientras afuera el universo envejecería siglos… pero ¿qué verías realmente si miraras hacia atrás en tu último segundo?',
      'A 10.984 metros en la Fosa de las Marianas, la presión equivale a 1.086 atmósferas capaces de aplastar un submarino común en 2 milisegundos con un destello caliente como el Sol… sin embargo, las cámaras acaban de captar criaturas blandas nadando intactas ahí abajo: ¿cómo sobreviven?',
      'Si el Sol desapareciera en este instante, durante 8 minutos y 20 segundos seguiríamos viendo luz y orbitando con normalidad antes de que la Tierra salga disparada al vacío congelando la superficie en días… pero ¿qué único ecosistema del planeta seguiría vivo durante millones de años?',
      'Una sola cucharadita de una estrella de neutrones pesa 4.000 millones de toneladas —más que el Monte Everest entero— y perforaría la corteza terrestre cayendo directo hacia el núcleo… pero ¿por qué su campo magnético borraría cada tarjeta y satélite a miles de kilómetros antes de tocar suelo?',
      'En 1991 un detector en Utah registró la partícula "Oh-My-God": un solo protón viajando al 99,9999999999999999999995% de la velocidad de la luz con la energía de una pelota de béisbol a 100 km/h… y 35 años después nadie sabe qué monstruo cósmico la disparó.',
      'Si el oxígeno de la Tierra se duplicara al 42% durante 24 horas, tu resistencia física se dispararía al instante, pero los insectos crecerían a escala prehistórica y una sola chispa convertiría bosques húmedos en infiernos imparables… ¿cuántas horas tardaría tu propio cuerpo en sufrir toxicidad pulmonar?',
      'Dentro de Neptuno y Urano, a 7.000 kilómetros de profundidad, la presión descompone el metano haciendo llover diamantes sólidos del tamaño de autos hacia el núcleo… pero ¿qué núcleo ardiente podría estar oculto debajo de un océano entero de diamante líquido?',
      'El desconcertante efecto Mpemba demuestra en laboratorio que el agua hirviendo puede congelarse más rápido que el agua fría rompiendo la intuición termodinámica básica… y casi un siglo después los físicos siguen debatiendo qué mecanismo molecular secreto lo provoca.',
      'Si toda la gravedad terrestre se apagara durante 5 segundos exactos, la atmósfera escaparía al espacio causando descompresión instantánea y al volver la gravedad todo caería desde decenas de metros… pero ¿qué pasaría con el núcleo fundido atrapado bajo presión bajo tus pies?',
    ],
  },
  {
    id: 'lore_misterios',
    emoji: '🎮',
    label: 'Lore y Misterios',
    nicheName: 'Lore, Enigmas y Misterios',
    audience: 'suspense',
    style3D: 'stylized_thriller',
    monetizationGoal: 'Altísima retención hasta el último segundo con teorías que disparan comentarios',
    ideas: [
      '15 de agosto de 1977: el radiotelescopio Big Ear captó durante 72 segundos exactos la señal artificial de banda estrecha 6EQUJ5 desde Sagitario, helando la sangre de los astrofísicos… pero casi 50 años después solo hay silencio sepulcral: ¿quién marcó nuestro número?',
      'Verano de 1997, Pacífico Sur: los hidrófonos militares de la NOAA grabaron el "Bloop", un estruendo submarino detectado a más de 5.000 kilómetros de distancia más potente que cualquier ballena azul… la versión oficial culpa a un iceberg, pero ¿por qué las coordenadas coinciden con una zona abisal inexplorada?',
      'Diciembre de 1900, Islas Flannan: el barco de relevo halló el faro encendido, la cena servida y los relojes detenidos a la misma hora, pero los tres fareros habían desaparecido sin rastro dejando un diario con tormentas que jamás ocurrieron… ¿qué los hizo salir corriendo sin abrigo?',
      'Noviembre de 1872, Atlántico Norte: el bergantín Mary Celeste fue encontrado navegando solo en perfecto estado con comida para seis meses y pertenencias intactas, pero sin un solo tripulante a bordo… ¿qué amenaza invisible los obligó a abandonar un barco que no se hundía?',
      'Desde 1973, la estación rusa UVB-76 transmite un zumbido mecánico de 25 tonos por minuto las 24 horas del día, interrumpido solo unas pocas veces por voces humanas leyendo códigos cifrados… nadie ha confirmado jamás qué ocurre si algún día ese zumbido se detiene.',
      'El Manuscrito Voynich del siglo XV contiene 240 páginas de plantas que no existen en la Tierra y un alfabeto con leyes estadísticas de lenguaje real que ha derrotado a criptógrafos de la NSA y modelos de IA… ¿es un código perdido o el cuaderno de un lugar que desapareció?',
      'En 1901 unos buzos rescataron frente a Grecia el Mecanismo de Anticitera: una computadora analógica de 37 engranajes de bronce de hace 2.100 años capaz de predecir eclipses con precisión astronómica… pero ¿dónde están los cientos de máquinas previas necesarias para haber llegado a esa ingeniería?',
      'Bajo la meseta de Capadocia, Derinkuyu desciende 18 niveles subterráneos capaces de ocultar a 20.000 personas con ventilación, pozos y puertas rodantes de media tonelada cerrables solo desde adentro… ¿de qué amenaza externa necesitaban esconderse bajo tierra durante meses?',
      'El mapa otomano de Piri Reis de 1513 traza con precisión inquietante el contorno de la costa de la Antártida sin hielo —300 años antes de su descubrimiento oficial— usando fuentes más antiguas ya perdidas… ¿quién cartografió el continente helado antes de que existiera la navegación moderna?',
      'En 1990 se instaló la escultura Kryptos en el patio central de la CIA con 4 mensajes cifrados; tres fueron descifrados tras años de obsesión, pero los últimos 97 caracteres siguen invictos tras 35 años… ¿qué secreto contiene la cuarta sección que ni los mejores analistas logran abrir?',
    ],
  },
  {
    id: 'supervivencia_pov',
    emoji: '🚨',
    label: 'Supervivencia POV',
    nicheName: 'Supervivencia POV y Decisiones Extremas',
    audience: 'suspense',
    style3D: 'ue5_realism',
    monetizationGoal: 'Retención extrema en primera persona (POV) con datos que realmente salvan vidas',
    ideas: [
      'POV: tu auto cae a un río congelado y la presión externa bloquea las puertas en 8 segundos; el pánico hace que el 90% intente abrir la manija desperdiciando sus últimos 30 segundos de aire… pero ¿qué pieza metálica detrás de tu cabeza rompe el cristal lateral en un golpe?',
      'POV: caminas en campo abierto y de golpe tu cabello se eriza flotando hacia el cielo con un sabor metálico en la boca; tienes menos de 3 segundos antes de que un rayo de 300 millones de voltios caiga justo donde estás… ¿por qué acostarte en el suelo es el error más fatal?',
      'POV: el cable de tu ascensor falla en el piso 24 y entras en caída libre; saltar justo antes del impacto no reduce tu velocidad ni un 5% y fractura tus piernas al instante… ¿cuál es la única postura horizontal verificada por físicos que multiplica tus probabilidades de sobrevivir?',
      'POV: llegas de noche a casa y percibes un olor penetrante a huevo podrido; el reflejo automático de encender el interruptor de la luz genera una chispa microscópica capaz de volar toda la estructura en medio segundo… ¿qué segundo error con tu celular detona el gas igual de rápido?',
      'POV: el mar en una playa soleada se retira 300 metros de golpe dejando peces saltando en la arena húmeda; tienes entre 4 y 10 minutos antes de una pared de agua a 50 km/h… pero ¿por qué correr en auto por la costa es la trampa mortal que nadie prevé?',
      'POV: una corriente de resaca te arrastra mar adentro a 2 metros por segundo; nadar directo hacia la orilla agota tu oxígeno muscular en menos de 90 segundos provocando ahogamiento incluso en nadadores expertos… ¿en qué ángulo exacto de 90 grados se rompe la corriente en segundos?',
      'POV: el aceite de una sartén prende fuego en tu cocina y alguien arroja un vaso de agua; el agua se vaporiza expandiéndose 1.700 veces al instante y convierte el fuego en una bola explosiva que incendia el techo… ¿qué objeto cotidiano de metal apaga el incendio en 2 segundos?',
      'POV: quedas atrapado en una estampida humana de 20.000 personas donde la presión lateral impide expandir los pulmones provocando asfixia de pie en menos de dos minutos… ¿qué postura exacta de boxeador con los codos crea una cámara de aire vital?',
      'POV: tu avión acuatiza de emergencia en el océano y el agua helada inunda el pasillo; inflar tu chaleco salvavidas dentro de la cabina te clava contra el techo sumergido impidiéndote bucear hacia la salida… ¿en qué segundo exacto debes tirar de la cuerda roja?',
      'POV: te pierdes a -15°C en la montaña sin señal y sientes una sed insoportable; comer nieve directamente desploma tu temperatura interna provocando hipotermia acelerada y confusión mental… ¿cómo obtener agua líquida sin fuego usando únicamente tu propio calor corporal?',
    ],
  },
  {
    id: 'marcas_rivales',
    emoji: '🏢',
    label: 'Marcas Rivales',
    nicheName: 'Marcas Rivales y Guerras de Negocios',
    audience: 'general',
    style3D: 'paper_diorama',
    monetizationGoal: 'Nicho business de altísimo RPM con rivalidades memorables que invitan a opinar',
    ideas: [
      '1963, Maranello: Enzo Ferrari humilla a un fabricante de tractores diciéndole que solo sabe manejar maquinaria agrícola; herido en su orgullo, Ferruccio Lamborghini jura construir un V12 perfecto en 4 meses… pero ¿por qué el primer prototipo en exhibición ocultaba ladrillos bajo el capó?',
      '1948, Herzogenaurach: dos hermanos alemanes rompen relaciones con tal odio que dividen un pueblo entero entre Adidas y Puma, donde los vecinos miraban los zapatos antes de saludarse durante 60 años… y hasta hoy nadie ha revelado cuál fue exactamente la traición en el búnker de 1943.',
      '1989, Guerra Fría: para seguir vendiendo refrescos en la Unión Soviética sin moneda convertible, Pepsi aceptó un trueque demencial de 17 submarinos y 3 buques de guerra, convirtiéndose brevemente en la sexta flota naval del planeta… ¿qué le dijo el CEO de Pepsi a la Casa Blanca cuando lo descubrieron?',
      'Junio de 1991, Las Vegas: Sony anuncia su consola conjunta con Nintendo y, al día siguiente sobre el mismo escenario, Nintendo la traiciona públicamente aliándose con Philips; furioso, Sony lanza la PlayStation y destruye el monopolio rival… ¿cómo habría cambiado el gaming si aquel contrato no se rompía?',
      'Año 2000, Dallas: los fundadores de Netflix ofrecen vender toda su empresa a Blockbuster por 50 millones de dólares y los ejecutivos se ríen en su cara; diez años después Blockbuster quiebra mientras Netflix supera los 200.000 millones… pero ¿qué error interno de 16% de ingresos impidió a Blockbuster copiar el modelo a tiempo?',
      '1996, al borde de la quiebra: Marvel remata los derechos cinematográficos de Spider-Man y X-Men, y se juega su última carta hipotecando a un héroe de segunda fila que nadie quería comprar: Iron Man… ¿qué cláusula arriesgada en aquel préstamo pudo haber hecho desaparecer a Marvel para siempre?',
      '1984: Nike apuesta todo su presupuesto de marketing en un novato de 21 años llamado Michael Jordan rompiendo las reglas de color de la NBA con multas de 5.000 dólares por partido; en 12 meses facturan 126 millones… pero ¿por qué Jordan en realidad quería firmar con Adidas ese mismo día?',
      'Diciembre de 2018: Burger King reprograma su app usando geofencing a menos de 200 metros de cada McDonald’s de EE.UU. para vender Whoppers a un centavo, disparando 1,5 millones de descargas en 48 horas… ¿por qué McDonald’s jamás pudo demandarlos legalmente por ese golpe maestro?',
      '1966, 24 Horas de Le Mans: tras la cancelación humillante de la compra de Ferrari en el último minuto, Henry Ford II firma un cheque en blanco para humillar a los italianos con el GT40 a más de 330 km/h… pero ¿qué foto final en la línea de meta arruinó la gloria del piloto ganador?',
      'Desde 1985, Costco mantiene su famoso combo de hot dog y bebida a 1,50 dólares exactos desafiando 40 años de inflación; cuando un nuevo CEO sugirió subir el precio, el fundador le respondió con una amenaza legendaria… ¿cómo ganan miles de millones perdiendo dinero en su producto estrella?',
    ],
  },
  {
    id: 'cuerpo_humano',
    emoji: '🧬',
    label: 'Cuerpo Humano',
    nicheName: 'Cuerpo Humano y Biología Asombrosa',
    audience: 'educational',
    style3D: 'flat_kids',
    monetizationGoal: 'Alcance masivo evergreen en salud y curiosidades 100% apto para anunciantes',
    ideas: [
      'A los 10 minutos de dormir menos de 6 horas, el sistema glinfático de tu cerebro deja de barrer proteínas tóxicas y tu amígdala emocional se vuelve un 60% más reactiva al estrés… pero ¿por qué tu propio cerebro te convence falsamente de que "dormiste suficiente"?',
      'Al beber una bebida energética con el estómago vacío, en 10 minutos la cafeína bloquea tus receptores de adenosina y a los 45 minutos dispara adrenalina y presión arterial seguidas de un desplome brutal de glucosa… ¿qué ocurre dentro de tu hígado si repites ese pico durante 30 días?',
      'Justo cuando entras en sueño profundo, tu ritmo cardíaco baja de golpe y tu cerebro malinterpreta la relajación como una caída mortal disparando una descarga eléctrica que te hace brincar en la cama… pero ¿por qué los neurocientíficos siguen debatiendo si es un reflejo heredado de primates que dormían en árboles?',
      'Caminar solo 20 minutos diarios durante 30 días aumenta el flujo sanguíneo cerebral, libera factor neurotrófico que regenera neuronas en el hipocampo y reduce el cortisol acumulado… pero ¿en qué día exacto entre el 1 y el 30 ocurre el salto más drástico en tu corazón?',
      'Cuando sumerges los dedos en agua durante 5 minutos, tu piel no absorbe agua como una esponja: tu sistema nervioso contrae vasos sanguíneos a propósito para crear canales de drenaje como neumáticos de lluvia… pero ¿por qué ese reflejo desaparece por completo si se daña un solo nervio del dedo?',
      'Al eliminar el azúcar refinada por 14 días, en las primeras 72 horas tu cerebro sufre síntomas reales de abstinencia dopaminérgica y dolores de cabeza, pero al día 10 tus papilas gustativas se recalibran por completo… ¿por qué el día 4 es el punto donde el 80% recae?',
      'Tu corazón late 100.000 veces al día bombeando 7.500 litros de sangre durante décadas sin fatigarse jamás, mientras tus piernas arden en ácido láctico tras 60 segundos de sprint… ¿qué diferencia microscópica en las mitocondrias cardíacas lo vuelve casi indestructible?',
      'Tu propia voz grabada suena extraña y molesta porque al hablar escuchas vibraciones graves transmitidas por los huesos de tu cráneo, mientras el resto del mundo solo oye la onda aérea… pero ¿por qué el cerebro reacciona con incomodidad instintiva al escuchar su verdadera voz externa?',
      'El nervio vago conecta tu tronco cerebral con el corazón y el intestino; estimularlo con una exhalación lenta o agua fría en el rostro frena tu frecuencia cardíaca en menos de 45 segundos… pero ¿por qué más del 80% de sus señales viajan del intestino al cerebro y no al revés?',
      'Cada 7 a 10 años la mayoría de tus células —piel, sangre e incluso parte de tus huesos— se han reemplazado por átomos completamente nuevos… dejando un enigma biológico y filosófico: si casi ninguna célula tuya es la misma que en tu infancia, ¿dónde permanecen intactos tus recuerdos?',
    ],
  },
];

export interface ViralNichePlaybook {
  id: string;
  emoji: string;
  title: string;
  rpmLevel: 'Muy Alto' | 'Alto' | 'Viral Masivo';
  rpmRange: string;
  avgRetention: string;
  recommendedDuration: DurationOption;
  recommendedStyle: Style3DId;
  audience: AudienceId;
  scriptStructure: string;
  hookFormulas: string[];
  editingTips3D: string;
  readyTrend: TrendItem;
}

export const VIRAL_NICHE_PLAYBOOKS: ViralNichePlaybook[] = [
  {
    id: 'dinero_60s',
    emoji: '💸',
    title: 'Dinero en 60s',
    rpmLevel: 'Muy Alto',
    rpmRange: '$1.40 – $3.80 RPM',
    avgRetention: '72% – 84%',
    recommendedDuration: 60,
    recommendedStyle: 'paper_diorama',
    audience: 'educational',
    scriptStructure:
      'Error cotidiano con cifra real (0–3s) → Demostración visual con billetes/gráficos (4–42s) → Regla práctica de 1 paso + loop (43–60s).',
    hookFormulas: [
      '“3 gastos pequeños que te quitan $1.500 al año sin que lo notes...”',
      '“Por qué guardar tu dinero en el banco te hace perder poder cada mes.”',
      '“La regla mental de 3 segundos que duplica tus ahorros en 12 meses.”',
    ],
    editingTips3D:
      'Usa Diorama Papel o 3D limpio con billetes, monedas y flechas luminosas; resalta cada cifra en subtítulo naranja.',
    readyTrend: {
      id: 'playbook-dinero-60s',
      tema: '3 gastos silenciosos que vacían tu cuenta cada mes y la regla 50/30/20',
      nicho: 'Dinero y Finanzas en 60s',
      porQueMonetiza:
        'Máximo RPM financiero, 100% apto para anunciantes bancarios/fintech y altísima tasa de guardados.',
      rpmEstimado: '$1.40 – $3.80 RPM',
      anguloViral3D:
        'Diorama 3D en papel con monedas evaporándose y alcancía iluminada en planos distintos por cada consejo.',
      ganchoEjemplo:
        'Si cobras a fin de mes y en 5 días ya no sabes dónde fue tu dinero, estos 3 gastos invisibles son los culpables.',
      duracionRecomendada: 60,
      estiloRecomendado: 'paper_diorama',
      premisaLista:
        '3 gastos hormiga silenciosos que parecen inofensivos pero te quitan más de 1.500 dólares al año sin que lo notes, y la regla práctica del 50/30/20 explicada visualmente en 60 segundos.',
    },
  },
  {
    id: 'psicologia_oscura',
    emoji: '🧠',
    title: 'Psicología Oscura',
    rpmLevel: 'Muy Alto',
    rpmRange: '$1.10 – $2.90 RPM',
    avgRetention: '76% – 88%',
    recommendedDuration: 90,
    recommendedStyle: 'pixar_dark',
    audience: 'suspense',
    scriptStructure:
      'Truco psicológico misterioso en 2.5s → Explicación científica rápida (5–28s) → Ejemplo real de conversación (29–72s) → Cómo protegerte + pregunta (73–90s).',
    hookFormulas: [
      '“Si alguien hace esta pausa de 4 segundos, está intentando que confieses...”',
      '“El efecto psicológico que hace que no puedas dejar de pensar en alguien.”',
      '“3 micro-señales en la mirada que delatan una manipulación al instante.”',
    ],
    editingTips3D:
      'Pixar Oscuro con iluminación lateral dramática, planos cerrados a ojos y manos, y cortes secos en cada revelación.',
    readyTrend: {
      id: 'playbook-psicologia-oscura',
      tema: 'El silencio táctico de 4 segundos y cómo leer micro-señales en una charla',
      nicho: 'Psicología Oscura y Comportamiento',
      porQueMonetiza:
        'Retención altísima en TikTok Creator Rewards (+60s) por curiosidad personal y comentarios contando experiencias.',
      rpmEstimado: '$1.10 – $2.90 RPM',
      anguloViral3D:
        'Animación Pixar Oscuro con sombras cinematográficas, enfoque en gestos faciales y reloj marcando 4 segundos.',
      ganchoEjemplo:
        'La próxima vez que alguien te mienta, no digas ni una palabra durante 4 segundos... y mira lo que ocurre.',
      duracionRecomendada: 90,
      estiloRecomendado: 'pixar_dark',
      premisaLista:
        'El silencio táctico de 4 segundos: el truco psicológico que hace que casi cualquier persona revele lo que oculta sin presionarla, cómo funciona en el cerebro y cómo defenderte si lo usan contigo.',
    },
  },
  {
    id: 'marcas_rivales',
    emoji: '🏢',
    title: 'Marcas Rivales',
    rpmLevel: 'Muy Alto',
    rpmRange: '$1.30 – $3.20 RPM',
    avgRetention: '74% – 85%',
    recommendedDuration: 90,
    recommendedStyle: 'paper_diorama',
    audience: 'general',
    scriptStructure:
      'Conflicto explosivo entre 2 gigantes (0–4s) → El insulto o jugada secreta (5–35s) → Contraataque millonario (36–75s) → ¿De qué lado estás? (76–90s).',
    hookFormulas: [
      '“Un solo insulto hizo que un fabricante de tractores creara a su peor rival...”',
      '“La reunión de 50 millones de dólares que destruyó a un imperio entero.”',
      '“Cómo una pelea entre dos hermanos partió una ciudad entera en dos.”',
    ],
    editingTips3D:
      'Alterna planos amplios de fábricas/tiendas con primeros planos dramáticos de los fundadores y productos icónicos.',
    readyTrend: {
      id: 'playbook-marcas-rivales',
      tema: 'Ferrari vs Lamborghini: el insulto que creó al superdeportivo rival',
      nicho: 'Marcas Rivales y Guerras de Negocios',
      porQueMonetiza:
        'Atrae audiencia de negocios/emprendimiento con alto poder adquisitivo y altísimo debate en comentarios.',
      rpmEstimado: '$1.30 – $3.20 RPM',
      anguloViral3D:
        'Diorama cinematográfico de taller italiano de los 60, contraste entre tractor robusto y superdeportivo rojo.',
      ganchoEjemplo:
        'Enzo Ferrari insultó al cliente equivocado... y 4 meses después nació el único auto capaz de humillarlo.',
      duracionRecomendada: 90,
      estiloRecomendado: 'paper_diorama',
      premisaLista:
        'Ferrari vs Lamborghini: el insulto real de Enzo Ferrari a un fabricante de tractores italiano que lo llevó a diseñar el superdeportivo rival en tiempo récord y cambiar la historia del automovilismo.',
    },
  },
  {
    id: 'historia_absurda',
    emoji: '🏛️',
    title: 'Historia Absurda (What If)',
    rpmLevel: 'Viral Masivo',
    rpmRange: '$0.65 – $1.60 RPM · Millones de vistas',
    avgRetention: '80% – 94%',
    recommendedDuration: 60,
    recommendedStyle: 'viral_meme_3d',
    audience: 'viral_meme',
    scriptStructure:
      'Objeto moderno aparece en época antigua en 0:00 → Reacción exagerada primer plano (4–18s) → Escalada absurda de consecuencias (19–50s) → Remate cómico en loop (51–60s).',
    hookFormulas: [
      '“¿Qué pasaría si aparecieras en la Antigua Roma con una bocina JBL al 100%?”',
      '“Le diste un celular con TikTok a un caballero medieval... esto pasó en 10 segundos.”',
      '“Abres un gimnasio con proteína en Esparta y el rey prueba el pre-entreno.”',
    ],
    editingTips3D:
      'Estilo 3D Viral / Meme: cambia de plano en cada escena (objeto heroico → reacción facial exagerada → caos en plano general).',
    readyTrend: {
      id: 'playbook-historia-absurda',
      tema: '¿Qué pasaría si aparecieras en la Antigua Roma con una bocina JBL gigante?',
      nicho: 'Historia Absurda (What If)',
      porQueMonetiza:
        'Formato con tasa de compartidos récord; ideal para disparar seguidores y calificar rápido a monetización.',
      rpmEstimado: '$0.65 – $1.60 RPM (Volumen masivo)',
      anguloViral3D:
        'Estilo 3D Viral / Meme con senadores romanos en mármol reaccionando a ondas expansivas neón de una bocina Bluetooth.',
      ganchoEjemplo:
        'Imagina aparecer en el Senado de Roma en el año 44 a.C. y subirle el volumen al máximo a una bocina Bluetooth.',
      duracionRecomendada: 60,
      estiloRecomendado: 'viral_meme_3d',
      premisaLista:
        '¿Qué pasaría si aparecieras en la Antigua Roma en pleno discurso del Senado con una bocina JBL gigante a todo volumen reproduciendo música electrónica? Muestra cada reacción y el caos histórico paso a paso.',
    },
  },
  {
    id: 'cuerpo_humano',
    emoji: '🧬',
    title: 'Cuerpo Humano',
    rpmLevel: 'Alto',
    rpmRange: '$0.95 – $2.20 RPM',
    avgRetention: '75% – 86%',
    recommendedDuration: 60,
    recommendedStyle: 'flat_kids',
    audience: 'educational',
    scriptStructure:
      'Promesa de transformación temporal (0–3s) → Cambio día 1 / minuto 10 (4–22s) → Cambio interno en cerebro y sangre (23–48s) → Resultado final + hábito (49–60s).',
    hookFormulas: [
      '“Qué le pasa exactamente a tu cuerpo si caminas 20 minutos durante 30 días.”',
      '“Lo que ocurre dentro de tu cerebro 10 minutos después de dormir mal.”',
      '“Por qué tu piel se arruga en el agua (no es lo que te enseñaron).”',
    ],
    editingTips3D:
      'Alterna escenas exteriores luminosas con planos macro 3D de neuronas, corazón y músculos con paletas contrastantes.',
    readyTrend: {
      id: 'playbook-cuerpo-humano',
      tema: 'Qué le pasa a tu cuerpo y cerebro si caminas 20 minutos diarios por 30 días',
      nicho: 'Cuerpo Humano y Biología Asombrosa',
      porQueMonetiza:
        'Nicho evergreen seguro para todas las marcas de salud y bienestar, con altísima tasa de guardados y reenvíos.',
      rpmEstimado: '$0.95 – $2.20 RPM',
      anguloViral3D:
        'Ilustración 3D limpia alternando parque soleado, corazón latiendo con pulso luminoso y neuronas activándose.',
      ganchoEjemplo:
        'Solo 20 minutos caminando al día cambian la química de tu cerebro más rápido de lo que imaginas.',
      duracionRecomendada: 60,
      estiloRecomendado: 'flat_kids',
      premisaLista:
        'Qué le pasa exactamente a tu cuerpo, tu corazón y tu cerebro si caminas solo 20 minutos al día durante 30 días seguidos: día 1, semana 1, semana 2 y día 30 explicados visualmente.',
    },
  },
  {
    id: 'supervivencia_pov',
    emoji: '🚨',
    title: 'Supervivencia POV',
    rpmLevel: 'Alto',
    rpmRange: '$0.90 – $2.10 RPM',
    avgRetention: '78% – 90%',
    recommendedDuration: 60,
    recommendedStyle: 'ue5_realism',
    audience: 'suspense',
    scriptStructure:
      'Situación límite en 1ra persona "POV:" (0–3s) → El error fatal que comete el 90% (4–20s) → Pasos exactos que te salvan (21–52s) → Dato final memorable (53–60s).',
    hookFormulas: [
      '“POV: tu auto cae al agua y las puertas no abren. Tienes 30 segundos...”',
      '“Si tu cabello se eriza de golpe al aire libre, tienes 3 segundos para hacer esto.”',
      '“El error mortal que casi todos cometen si empieza fuego en la cocina.”',
    ],
    editingTips3D:
      'UE5 Realista con cámara POV en primera persona, iluminación de emergencia dramática y cortes rápidos cada 2.5s.',
    readyTrend: {
      id: 'playbook-supervivencia-pov',
      tema: 'POV: tu auto cae al agua y las puertas no abren — los 30 segundos clave',
      nicho: 'Supervivencia POV y Decisiones Extremas',
      porQueMonetiza:
        'La gente mira hasta el final para saber cómo sobrevivir y lo comparte con familia ("guárdalo por si acaso").',
      rpmEstimado: '$0.90 – $2.10 RPM',
      anguloViral3D:
        'Vista POV cinematográfica realista desde el asiento del conductor, agua subiendo y plano detalle del reposacabezas.',
      ganchoEjemplo:
        'POV: tu auto acaba de caer al río y la presión bloqueó las puertas. Si haces lo que todos intentan, pierdes.',
      duracionRecomendada: 60,
      estiloRecomendado: 'ue5_realism',
      premisaLista:
        'POV: tu auto cae al agua y las puertas no abren por la presión. Explica los 30 segundos exactos que tienes, el error que agota el tiempo y el paso correcto para salir con vida.',
    },
  },
  {
    id: 'ciencia_extrema',
    emoji: '🔬',
    title: 'Ciencia Extrema',
    rpmLevel: 'Alto',
    rpmRange: '$1.00 – $2.40 RPM',
    avgRetention: '75% – 87%',
    recommendedDuration: 90,
    recommendedStyle: 'ue5_realism',
    audience: 'educational',
    scriptStructure:
      'Hipótesis cósmica imposible (0–3s) → Segundo 1 de impacto (4–28s) → Minuto 1 / consecuencia física real (29–68s) → Dato astronómico final (69–90s).',
    hookFormulas: [
      '“¿Qué pasaría segundo a segundo si la Tierra dejara de girar 1 segundo?”',
      '“Si el Sol desapareciera hoy, durante 8 minutos nadie notaría nada...”',
      '“Por qué una sola cucharadita de esta estrella pesa más que la humanidad.”',
    ],
    editingTips3D:
      'Planos espaciales épicos en UE5 con escala gigantesca, contraste de luz estelar y partículas flotantes.',
    readyTrend: {
      id: 'playbook-ciencia-extrema',
      tema: '¿Qué pasaría segundo a segundo si la Tierra dejara de girar 1 segundo?',
      nicho: 'Ciencia Extrema y Universo',
      porQueMonetiza:
        'Excelente tiempo medio de visualización en YouTube Shorts y vídeos largos 16:9 de compilación científica.',
      rpmEstimado: '$1.00 – $2.40 RPM',
      anguloViral3D:
        'Escala planetaria fotorrealista, vientos supersónicos levantando océanos y atmósfera brillante desde órbita.',
      ganchoEjemplo:
        'Si la Tierra frenara de golpe durante un solo segundo, el suelo se detendría... pero tú seguirías viajando a 1.600 km/h.',
      duracionRecomendada: 90,
      estiloRecomendado: 'ue5_realism',
      premisaLista:
        '¿Qué pasaría segundo a segundo si la Tierra dejara de girar de golpe durante un solo segundo? Describe la física real de la inercia, los océanos, la atmósfera y el cielo de forma visual y sorprendente.',
    },
  },
  {
    id: 'lore_misterios',
    emoji: '🎮',
    title: 'Lore y Misterios',
    rpmLevel: 'Alto',
    rpmRange: '$0.85 – $2.00 RPM',
    avgRetention: '78% – 91%',
    recommendedDuration: 90,
    recommendedStyle: 'stylized_thriller',
    audience: 'suspense',
    scriptStructure:
      'Enigma real con año y lugar (0–4s) → Las pistas inquietantes encontradas (5–45s) → Teoría oficial vs teoría viral (46–78s) → Pregunta abierta en comentarios (79–90s).',
    hookFormulas: [
      '“En 1977 un telescopio grabó 72 segundos que jamás se volvieron a repetir...”',
      '“Este libro medieval lleva 600 años sin que nadie ni la IA pueda leerlo.”',
      '“Un barco navegaba intacto con la comida caliente... pero sin un solo tripulante.”',
    ],
    editingTips3D:
      'Thriller estilizado con niebla volumétrica, linternas, mapas antiguos y transiciones rápidas de suspenso.',
    readyTrend: {
      id: 'playbook-lore-misterios',
      tema: 'El misterio del mecanismo de Anticitera: la computadora de hace 2.000 años',
      nicho: 'Lore, Enigmas y Misterios',
      porQueMonetiza:
        'Mantiene el suspenso hasta el segundo final, disparando retención >85% y cientos de teorías en comentarios.',
      rpmEstimado: '$0.85 – $2.00 RPM',
      anguloViral3D:
        'Thriller estilizado submarino en Grecia, buzos encontrando engranajes de bronce milenarios con rayos de luz.',
      ganchoEjemplo:
        'En 1901 unos buzos encontraron bajo el mar una computadora de bronce... que tenía 2.000 años de antigüedad.',
      duracionRecomendada: 90,
      estiloRecomendado: 'stylized_thriller',
      premisaLista:
        'El mecanismo de Anticitera: la misteriosa computadora astronómica de bronce de hace 2.000 años hallada en un naufragio griego que predecía eclipses con precisión imposible para su época.',
    },
  },
];

/**
 * Selecciona una idea aleatoria del nicho sin repetir inmediatamente la anterior.
 */
export function pickNextViralIdea(
  nicheId: string,
  previousIdea?: string
): { bank: ViralNicheBank; idea: string } {
  const bank = VIRAL_NICHE_BANKS.find((b) => b.id === nicheId) ?? VIRAL_NICHE_BANKS[0];
  const candidates = bank.ideas.filter((item) => item !== previousIdea);
  const pool = candidates.length > 0 ? candidates : bank.ideas;
  const idea = pool[Math.floor(Math.random() * pool.length)];
  return { bank, idea };
}

const RANDOM_SCENARIOS = [
  'A 4.000 metros bajo el Atlántico Norte, un sensor submarino detecta una vibración de 18 Hz que no figura en ningún mapa oceanográfico',
  '1979, base científica aislada en la Antártida a -62°C: los relojes atómicos del laboratorio se atrasan exactamente 7 segundos durante una tormenta geomagnética',
  'En la órbita lunar en 1969, el módulo de mando entra en la cara oculta sin radio durante 48 minutos y los auriculares captan un silbido armónico rítmico',
  'En un cuarto anecoico de -20 decibelios diseñado por la NASA, el silencio absoluto obliga a tu oído interno a amplificar el flujo de tu propia sangre',
  'Año 1908, Siberia: un objeto invisible estalla en el aire con la fuerza de 1.000 bombas atómicas aplastando 80 millones de árboles sin dejar un solo cráter',
  'En el desierto de Atacama, un radiotelescopio capta un destello de radio de 3 milisegundos más brillante que 500 millones de soles repetido exactamente cada 16 días',
  'En un experimento psicológico de 1971 en Stanford, asignar roles de autoridad arbitrarios bastó para transformar a voluntarios tranquilos en menos de 36 horas',
  'A 3.800 metros de profundidad junto a una chimenea hidrotermal a 400°C, el agua no hierve y alberga gusanos gigantes que viven sin luz solar ni fotosíntesis',
];

const RANDOM_CONSEQUENCES = [
  'disparando en segundos la adrenalina, la pérdida de orientación espacial y micro-alucinaciones auditivas en cualquiera que lo experimente',
  'sometiendo la estructura y el sistema nervioso humano a una presión extrema más rápida de lo que el cerebro puede procesar el peligro',
  'colapsando la percepción del tiempo hasta que un minuto real se siente como una eternidad de pánico silencioso',
  'provocando un efecto dominó físico y psicológico que obligó a sellar los informes oficiales durante décadas',
  'reconfigurando el ritmo cardíaco y la toma de decisiones lógicas en menos de diez segundos',
];

const RANDOM_MYSTERIES = [
  'pero 40 años después los científicos siguen sin explicar qué activó la anomalía justo en esa coordenada exacta.',
  'dejando una única pregunta sin respuesta: si el fenómeno vuelve a ocurrir hoy, ¿cuántos segundos reales tendríamos para reaccionar?',
  'y hasta hoy ningún modelo físico ni inteligencia artificial ha logrado descifrar por qué se detuvo exactamente en el segundo 72.',
  'pero lo más inquietante apareció en la última fotografía del archivo, un detalle que nadie se atreve a explicar oficialmente.',
  'sin embargo, los registros más recientes acaban de detectar la misma firma exactamente en el lado opuesto del planeta.',
];

/**
 * Genera una premisa viral de alto impacto con la fórmula:
 * [Escenario extremo o dato real poco conocido] + [Consecuencia física o psicológica impactante] + [Misterio sin resolver].
 */
export function buildRandomConceptMashup(): {
  premise: string;
  niche: string;
  audience: AudienceId;
  style3D: Style3DId;
} {
  const pickRandomBank = Math.random() < 0.65;
  if (pickRandomBank) {
    const bank = VIRAL_NICHE_BANKS[Math.floor(Math.random() * VIRAL_NICHE_BANKS.length)];
    const idea = bank.ideas[Math.floor(Math.random() * bank.ideas.length)];
    return {
      premise: idea,
      niche: bank.nicheName,
      audience: bank.audience,
      style3D: bank.style3D,
    };
  }

  const scenario = RANDOM_SCENARIOS[Math.floor(Math.random() * RANDOM_SCENARIOS.length)];
  const consequence = RANDOM_CONSEQUENCES[Math.floor(Math.random() * RANDOM_CONSEQUENCES.length)];
  const mystery = RANDOM_MYSTERIES[Math.floor(Math.random() * RANDOM_MYSTERIES.length)];
  return {
    premise: `${scenario}, ${consequence}… ${mystery}`,
    niche: 'Misterios y Ciencia Extrema',
    audience: 'suspense',
    style3D: 'pixar_dark',
  };
}

export interface HookOptionPreview {
  id: HookStyleId;
  label: string;
  subtitle: string;
  fraseApertura: string;
  impactoVisual: string;
  sonidoRompeScroll: string;
  imagePrompt?: string;
}

const HOOK_SLOT_META: Record<
  'dato_perturbador' | 'escenario_pov' | 'intriga_psicologica',
  { label: string; subtitle: string }
> = {
  dato_perturbador: {
    label: 'Dato Perturbador',
    subtitle: 'Cifra o hecho inquietante',
  },
  escenario_pov: {
    label: 'Escenario POV Inmersivo',
    subtitle: 'Te mete dentro de la escena',
  },
  intriga_psicologica: {
    label: 'Pregunta de Intriga Psicológica',
    subtitle: 'Bucle mental abierto',
  },
};

const LEGACY_HOOK_MAP: Record<string, 'dato_perturbador' | 'escenario_pov' | 'intriga_psicologica'> = {
  dato_perturbador: 'dato_perturbador',
  escenario_pov: 'escenario_pov',
  intriga_psicologica: 'intriga_psicologica',
  curiosidad: 'dato_perturbador',
  polemica: 'escenario_pov',
  humor: 'intriga_psicologica',
};

/**
 * Construye 3 variantes de gancho A/B para los primeros 3 segundos:
 * 1. Dato Perturbador
 * 2. Escenario POV Inmersivo
 * 3. Pregunta de Intriga Psicológica
 * Prioriza los 3 ganchos generados por Gemini 2.5 Flash cuando están presentes.
 */
export function buildHookOptionsForScript(script: ViralScript): HookOptionPreview[] {
  const slotOrder: Array<'dato_perturbador' | 'escenario_pov' | 'intriga_psicologica'> = [
    'dato_perturbador',
    'escenario_pov',
    'intriga_psicologica',
  ];

  if (Array.isArray(script.ganchosAlternativos) && script.ganchosAlternativos.length >= 3) {
    return script.ganchosAlternativos.slice(0, 3).map((item, idx) => {
      const normalizedId = LEGACY_HOOK_MAP[item.id] ?? slotOrder[idx] ?? 'dato_perturbador';
      return {
        ...item,
        id: normalizedId,
        label: HOOK_SLOT_META[normalizedId].label,
        subtitle: item.subtitle || HOOK_SLOT_META[normalizedId].subtitle,
      };
    });
  }

  const cleanTitle = (script.tituloViral || script.premisa || 'esta historia')
    .replace(/[¿?¡!"]/g, '')
    .trim();
  const shortTopic =
    cleanTitle.length > 48 ? `${cleanTitle.slice(0, 45).trim()}...` : cleanTitle;
  const biblePrefix = script.visualBible?.fixedPrefixPrompt || script.guiaEstilo3D || '';

  const isEnglish = script.idioma === 'en';
  const isPortuguese = script.idioma === 'pt';

  if (isEnglish) {
    return [
      {
        id: 'dato_perturbador',
        label: HOOK_SLOT_META.dato_perturbador.label,
        subtitle: HOOK_SLOT_META.dato_perturbador.subtitle,
        fraseApertura: `In 72 seconds, "${shortTopic}" broke every rule scientists trusted.`,
        impactoVisual:
          'Extreme close-up on the central anomaly with razor-sharp contrast and ominous volumetric light.',
        sonidoRompeScroll: 'Deep sub-bass pulse + metallic ping at 0:00.',
        imagePrompt: `${biblePrefix}, extreme close-up highlighting the disturbing core anomaly of ${shortTopic}, dramatic rim lighting, cinematic depth, no text, no watermark`.trim(),
      },
      {
        id: 'escenario_pov',
        label: HOOK_SLOT_META.escenario_pov.label,
        subtitle: HOOK_SLOT_META.escenario_pov.subtitle,
        fraseApertura: `Imagine standing inside "${shortTopic}" as the lights suddenly die.`,
        impactoVisual:
          'Over-the-shoulder first-person POV pulling the viewer directly into the tense environment.',
        sonidoRompeScroll: 'Low atmospheric breath + sharp ambient cut.',
        imagePrompt: `${biblePrefix}, immersive first-person POV standing inside ${shortTopic}, red emergency accent glow, shallow depth of field, no text, no watermark`.trim(),
      },
      {
        id: 'intriga_psicologica',
        label: HOOK_SLOT_META.intriga_psicologica.label,
        subtitle: HOOK_SLOT_META.intriga_psicologica.subtitle,
        fraseApertura: `Why did everyone quietly stop talking about "${shortTopic}" afterward?`,
        impactoVisual:
          'Slow hypnotic push-in on an eerie unanswered clue emerging from deep shadows.',
        sonidoRompeScroll: 'Subtle tension swell + resonant silence.',
        imagePrompt: `${biblePrefix}, mysterious low-angle shot of an unexplained clue from ${shortTopic} emerging from shadows, moody chiaroscuro, no text, no watermark`.trim(),
      },
    ];
  }

  if (isPortuguese) {
    return [
      {
        id: 'dato_perturbador',
        label: HOOK_SLOT_META.dato_perturbador.label,
        subtitle: HOOK_SLOT_META.dato_perturbador.subtitle,
        fraseApertura: `Em poucos segundos, "${shortTopic}" desafiou tudo o que julgávamos seguro.`,
        impactoVisual: 'Close extremo no detalhe mais perturbador sob luz dramática.',
        sonidoRompeScroll: 'Pulso grave profundo + eco sutil em 0:00.',
        imagePrompt: `${biblePrefix}, extreme close-up of the unsettling core detail of ${shortTopic}, high contrast volumetric light, no text, no watermark`.trim(),
      },
      {
        id: 'escenario_pov',
        label: HOOK_SLOT_META.escenario_pov.label,
        subtitle: HOOK_SLOT_META.escenario_pov.subtitle,
        fraseApertura: `Imagine estar preso dentro de "${shortTopic}" quando o silêncio começa.`,
        impactoVisual: 'Câmera POV em primeira pessoa imergindo o espectador no cenário.',
        sonidoRompeScroll: 'Sopro atmosférico + corte seco de tensão.',
        imagePrompt: `${biblePrefix}, immersive first-person POV inside ${shortTopic}, moody rim lighting, atmospheric mist, no text, no watermark`.trim(),
      },
      {
        id: 'intriga_psicologica',
        label: HOOK_SLOT_META.intriga_psicologica.label,
        subtitle: HOOK_SLOT_META.intriga_psicologica.subtitle,
        fraseApertura: `Por que ninguém nunca conseguiu explicar o que restou de "${shortTopic}"?`,
        impactoVisual: 'Aproximação hipnótica revelando uma pista silenciosa na penumbra.',
        sonidoRompeScroll: 'Riser sutil de suspense + pausa limpa.',
        imagePrompt: `${biblePrefix}, eerie low-angle close-up of a mysterious clue from ${shortTopic}, cinematic shadows, no text, no watermark`.trim(),
      },
    ];
  }

  return [
    {
      id: 'dato_perturbador',
      label: HOOK_SLOT_META.dato_perturbador.label,
      subtitle: HOOK_SLOT_META.dato_perturbador.subtitle,
      fraseApertura: `Un solo detalle de "${shortTopic}" contradice todo lo que creías seguro.`,
      impactoVisual:
        'Primer plano extremo sobre la evidencia más inquietante con iluminación volumétrica contrastada.',
      sonidoRompeScroll: 'Pulso sub-grave limpio + eco metálico en 0:00.',
      imagePrompt: `${biblePrefix}, extreme close-up revealing the unsettling core evidence of ${shortTopic}, dramatic rim light, deep cinematic atmosphere, no text, no watermark`.trim(),
    },
    {
      id: 'escenario_pov',
      label: HOOK_SLOT_META.escenario_pov.label,
      subtitle: HOOK_SLOT_META.escenario_pov.subtitle,
      fraseApertura: `Imagina estar dentro de "${shortTopic}" justo cuando todo queda en silencio.`,
      impactoVisual:
        'Plano subjetivo POV en primera persona sumergiendo al espectador en la escena crítica.',
      sonidoRompeScroll: 'Respiración ambiental tensa + corte inmersivo.',
      imagePrompt: `${biblePrefix}, immersive first-person POV placing the viewer right inside ${shortTopic}, tense volumetric lighting, shallow depth of field, no text, no watermark`.trim(),
    },
    {
      id: 'intriga_psicologica',
      label: HOOK_SLOT_META.intriga_psicologica.label,
      subtitle: HOOK_SLOT_META.intriga_psicologica.subtitle,
      fraseApertura: `¿Por qué nadie volvió a hablar de lo que ocurrió en "${shortTopic}"?`,
      impactoVisual:
        'Acercamiento hipnótico en ángulo bajo hacia el rastro inexplicable entre sombras.',
      sonidoRompeScroll: 'Swell de suspenso psicológico + pausa silenciosa de 0.15s.',
      imagePrompt: `${biblePrefix}, hypnotic low-angle shot of an eerie unanswered clue from ${shortTopic} emerging from deep shadows, chiaroscuro lighting, no text, no watermark`.trim(),
    },
  ];
}

export interface ScriptRetentionAnalysis {
  overallScore: number;
  hookScore: number;
  hookSummary: string;
  wpm: number;
  pacingScore: number;
  pacingSummary: string;
  visualScore: number;
  visualSummary: string;
  commentScore: number;
  commentSummary: string;
  totalWords: number;
  totalDurationSec: number;
  tips: string[];
}

/**
 * Evalúa determinísticamente la fuerza de retención del guion en tiempo real:
 * gancho de 2.5s, ritmo en palabras/minuto (meta 140–175 WPM), claridad/variedad visual y potencial de comentarios/loop.
 */
export function analyzeScriptRetention(script: ViralScript): ScriptRetentionAnalysis {
  const scenes = script.escenas ?? [];
  const totalWords = scenes.reduce(
    (sum, sc) => sum + sc.narracion.trim().split(/\s+/).filter(Boolean).length,
    0
  );
  const lastEnd = scenes.length > 0 ? scenes[scenes.length - 1].segundoFin : script.duracionSegundos;
  const totalDurationSec = Math.max(10, lastEnd || script.duracionSegundos);
  const wpm = Math.round((totalWords / totalDurationSec) * 60);

  // 1. Fuerza del gancho (primeros 2.5 - 3s)
  const firstScene = scenes[0];
  const hookText = (firstScene?.narracion || script.ganchoInicial3Seg?.fraseApertura || '').trim();
  const hookWords = hookText.split(/\s+/).filter(Boolean).length;
  let hookScore = 62;
  if (hookWords >= 7 && hookWords <= 24) hookScore += 16;
  else if (hookWords > 24 && hookWords <= 32) hookScore += 8;
  if (/[¿?!¡]|\d+|nunca|nadie|secreto|error|pasaría|pov|verdad|minutos|segundos/i.test(hookText)) {
    hookScore += 14;
  }
  if (!/^(hola|buenos días|bienvenidos|en este video)/i.test(hookText)) {
    hookScore += 8;
  }
  hookScore = Math.min(100, Math.max(35, hookScore));
  const hookSummary =
    hookScore >= 85
      ? 'Arranque magnético directo en 0:00'
      : hookScore >= 70
        ? 'Buen gancho, puede ser más directo'
        : 'Acorta la apertura para atrapar en 2.5s';

  // 2. Ritmo en palabras por minuto (óptimo viral: 140–175 WPM)
  let pacingScore = 95;
  if (wpm < 110) {
    pacingScore = Math.max(45, Math.round(95 - (140 - wpm) * 0.9));
  } else if (wpm < 135) {
    pacingScore = Math.round(88 - (135 - wpm) * 0.5);
  } else if (wpm > 185) {
    pacingScore = Math.max(55, Math.round(95 - (wpm - 180) * 0.8));
  }
  const pacingSummary =
    wpm >= 135 && wpm <= 180
      ? 'Ritmo ideal para TikTok y Shorts'
      : wpm < 135
        ? 'Un poco pausado: suma más acción'
        : 'Muy denso: recorta frases largas';

  // 3. Claridad y diversidad visual (prompts únicos + cadencia de cambio de escena)
  const uniquePrompts = new Set(
    scenes.map((s) => (s.imagePrompt || s.visualSpec?.flowPrompt || s.promptVisual3D || '').trim().slice(0, 48).toLowerCase())
  ).size;
  const avgSceneDur = scenes.length > 0 ? totalDurationSec / scenes.length : totalDurationSec;
  let visualScore = 64;
  if (scenes.length >= 4 && uniquePrompts === scenes.length) visualScore += 20;
  else if (uniquePrompts >= Math.max(2, Math.floor(scenes.length * 0.7))) visualScore += 12;
  if (avgSceneDur <= 12) visualScore += 16;
  else if (avgSceneDur <= 18) visualScore += 9;
  visualScore = Math.min(100, Math.max(40, visualScore));
  const visualSummary = `${uniquePrompts}/${scenes.length} planos únicos · ~${Math.round(avgSceneDur)}s/escena`;

  // 4. Potencial de comentarios y loop
  const lastSceneText = (scenes[scenes.length - 1]?.narracion || '').trim();
  const loopText = (script.loopFinal || '').trim();
  const ctaText = (script.estrategiaMonetizacion?.ctaOrganico || '').trim();
  let commentScore = 64;
  if (/\?/.test(lastSceneText) || /\?/.test(ctaText)) commentScore += 18;
  if (loopText.length >= 20) commentScore += 10;
  if (/comenta|tú qué|opinas|harías|cual|cuál|equipo|lado|verdad/i.test(`${lastSceneText} ${ctaText}`)) {
    commentScore += 8;
  }
  commentScore = Math.min(100, Math.max(45, commentScore));
  const commentSummary =
    commentScore >= 85
      ? 'Cierre con pregunta y loop fuerte'
      : 'Agrega una pregunta final para comentarios';

  const overallScore = Math.round(
    hookScore * 0.32 + pacingScore * 0.25 + visualScore * 0.23 + commentScore * 0.2
  );

  const tips: string[] = [];
  if (hookScore < 82) {
    tips.push(
      'Prueba uno de los 3 Ganchos arriba o abre con una cifra/pregunta corta en menos de 18 palabras.'
    );
  }
  if (wpm < 135) {
    tips.push(
      `Ritmo actual: ${wpm} pal/min. Acorta la duración de alguna escena o añade un dato sorprendente para acercarte a 145–165 pal/min.`
    );
  } else if (wpm > 182) {
    tips.push(
      `Ritmo muy rápido (${wpm} pal/min). Dale +2s a las escenas más densas para que la voz respire.`
    );
  }
  if (avgSceneDur > 13) {
    tips.push(
      'Divide las escenas largas (más de 13s) para mantener un cambio visual constante y mayor retención.'
    );
  }
  if (commentScore < 82) {
    tips.push(
      'Cierra la última escena con una pregunta directa (ej. "¿Tú qué harías en ese segundo?") para duplicar comentarios.'
    );
  }
  if (tips.length === 0) {
    tips.push(
      'Estructura de alta retención lista: gancho directo, ritmo ágil, planos únicos y cierre con loop.'
    );
  }

  return {
    overallScore,
    hookScore,
    hookSummary,
    wpm,
    pacingScore,
    pacingSummary,
    visualScore,
    visualSummary,
    commentScore,
    commentSummary,
    totalWords,
    totalDurationSec,
    tips,
  };
}
