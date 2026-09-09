import type { CategoryKind } from '@/types/category';

export interface SeedSubcategory {
  slug: string;
  name: string;
  /** Lowercase, accent-free tokens used by the deterministic classifier. */
  keywords: string[];
}

export interface SeedCategory {
  slug: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  subcategories: SeedSubcategory[];
}

/**
 * Default taxonomy, tuned for Argentina. Users can rename, reorder, deactivate
 * or add their own — this is only the starting point copied into their account.
 */
export const DEFAULT_CATEGORIES: SeedCategory[] = [
  {
    slug: 'alimentacion',
    name: 'Alimentación',
    kind: 'expense',
    icon: 'ShoppingCart',
    color: '#2f9e8f',
    subcategories: [
      {
        slug: 'supermercado',
        name: 'Supermercado',
        keywords: [
          'super', 'supermercado', 'carrefour', 'coto', 'jumbo', 'disco', 'vea', 'dia', 'chango mas',
          'changomas', 'walmart', 'la anonima', 'toledo', 'libertad', 'makro', 'vital', 'mayorista',
          'diarco', 'maxiconsumo', 'compras del super', 'mandados',
        ],
      },
      { slug: 'almacen', name: 'Almacén', keywords: ['almacen', 'kiosco', 'kiosko', 'despensa', 'autoservicio', 'chino'] },
      { slug: 'carniceria', name: 'Carnicería', keywords: ['carniceria', 'carne', 'asado', 'pollo', 'milanesas', 'cerdo', 'achuras'] },
      { slug: 'verduleria', name: 'Verdulería', keywords: ['verduleria', 'verdura', 'fruta', 'frutas', 'frutera', 'huerta'] },
      { slug: 'panaderia', name: 'Panadería', keywords: ['panaderia', 'pan', 'facturas', 'medialunas', 'confiteria'] },
      { slug: 'delivery', name: 'Delivery', keywords: ['delivery', 'pedidosya', 'pedidos ya', 'rappi', 'ubereats', 'uber eats', 'mandaditos'] },
      {
        slug: 'restaurante',
        name: 'Restaurante',
        keywords: ['restaurante', 'resto', 'cena', 'almuerzo', 'parrilla', 'sushi', 'bodegon', 'cervezeria', 'bar', 'pizzeria', 'pizza', 'empanadas'],
      },
      { slug: 'cafe', name: 'Café', keywords: ['cafe', 'starbucks', 'cafeteria', 'havanna', 'merienda', 'cafecito'] },
      { slug: 'comida-rapida', name: 'Comida rápida', keywords: ['mcdonalds', 'mc donalds', 'burger king', 'mostaza', 'wendys', 'subway', 'hamburguesa', 'lomito', 'pancho'] },
    ],
  },
  {
    slug: 'transporte',
    name: 'Transporte',
    kind: 'expense',
    icon: 'Car',
    color: '#5b8def',
    subcategories: [
      { slug: 'combustible', name: 'Combustible', keywords: ['nafta', 'combustible', 'gasoil', 'gnc', 'ypf', 'shell', 'axion', 'puma energy', 'puma', 'estacion de servicio', 'surtidor', 'cargue nafta', 'carga de nafta'] },
      { slug: 'transporte-publico', name: 'Transporte público', keywords: ['sube', 'colectivo', 'bondi', 'subte', 'tren', 'micro', 'omnibus', 'boleto'] },
      { slug: 'taxi', name: 'Taxi', keywords: ['taxi', 'remis', 'remise'] },
      { slug: 'apps-movilidad', name: 'Uber/Cabify', keywords: ['uber', 'cabify', 'didi', 'beat', 'viaje en uber'] },
      { slug: 'estacionamiento', name: 'Estacionamiento', keywords: ['estacionamiento', 'cochera', 'parking', 'parquimetro'] },
      { slug: 'peajes', name: 'Peajes', keywords: ['peaje', 'telepase', 'autopista', 'ausa'] },
      { slug: 'mantenimiento-auto', name: 'Mantenimiento', keywords: ['taller', 'mecanico', 'service del auto', 'cubiertas', 'neumaticos', 'lavadero', 'vtv', 'patente', 'seguro del auto', 'gomeria'] },
    ],
  },
  {
    slug: 'hogar',
    name: 'Hogar',
    kind: 'expense',
    icon: 'Home',
    color: '#8b6fe0',
    subcategories: [
      { slug: 'alquiler', name: 'Alquiler', keywords: ['alquiler', 'renta', 'inmobiliaria', 'garantia del alquiler'] },
      { slug: 'expensas', name: 'Expensas', keywords: ['expensas', 'consorcio', 'administracion del edificio'] },
      { slug: 'electricidad', name: 'Electricidad', keywords: ['luz', 'electricidad', 'edesur', 'edenor', 'edelap', 'epec', 'edea', 'factura de luz'] },
      { slug: 'gas', name: 'Gas', keywords: ['gas', 'metrogas', 'camuzzi', 'naturgy', 'garrafa'] },
      { slug: 'agua', name: 'Agua', keywords: ['agua', 'aysa', 'absa', 'aguas cordobesas'] },
      { slug: 'internet', name: 'Internet', keywords: ['internet', 'fibertel', 'flow', 'telecentro', 'wifi', 'iplan', 'starlink'] },
      { slug: 'telefonia', name: 'Telefonía', keywords: ['celular', 'telefono', 'personal', 'claro', 'movistar', 'tuenti', 'recarga'] },
      { slug: 'limpieza', name: 'Limpieza', keywords: ['limpieza', 'detergente', 'lavandina', 'articulos de limpieza', 'empleada', 'cif', 'ayudin'] },
      { slug: 'mantenimiento-hogar', name: 'Mantenimiento', keywords: ['plomero', 'electricista', 'ferreteria', 'pintura', 'easy', 'sodimac', 'sanitarios', 'arreglo', 'mueble', 'colchon', 'electrodomestico'] },
    ],
  },
  {
    slug: 'salud',
    name: 'Salud',
    kind: 'expense',
    icon: 'HeartPulse',
    color: '#e8697d',
    subcategories: [
      { slug: 'obra-social', name: 'Obra social', keywords: ['obra social', 'prepaga', 'osde', 'swiss medical', 'galeno', 'medife', 'omint', 'sancor salud'] },
      { slug: 'farmacia', name: 'Farmacia', keywords: ['farmacia', 'farmacity', 'remedios', 'medicamento', 'ibuprofeno', 'pharmacy', 'dr ahorro'] },
      { slug: 'medico', name: 'Médico', keywords: ['medico', 'consulta medica', 'clinica', 'guardia', 'turno medico', 'kinesiologia', 'psicologo', 'terapia', 'nutricionista'] },
      { slug: 'odontologia', name: 'Odontología', keywords: ['dentista', 'odontologo', 'ortodoncia', 'muela'] },
      { slug: 'estudios-medicos', name: 'Estudios', keywords: ['analisis', 'laboratorio', 'radiografia', 'resonancia', 'ecografia', 'estudios medicos'] },
    ],
  },
  {
    slug: 'educacion',
    name: 'Educación',
    kind: 'expense',
    icon: 'GraduationCap',
    color: '#43a7c4',
    subcategories: [
      { slug: 'colegio', name: 'Colegio', keywords: ['colegio', 'escuela', 'cuota del colegio', 'jardin', 'guarderia'] },
      { slug: 'universidad', name: 'Universidad', keywords: ['universidad', 'facultad', 'utn', 'uba', 'siglo 21', 'maestria', 'posgrado'] },
      { slug: 'cursos', name: 'Cursos', keywords: ['curso', 'capacitacion', 'udemy', 'platzi', 'coursera', 'taller de', 'ingles', 'idiomas'] },
      { slug: 'libros', name: 'Libros', keywords: ['libro', 'libreria', 'yenny', 'cuspide', 'ateneo', 'apunte'] },
      { slug: 'materiales', name: 'Materiales', keywords: ['utiles', 'utiles escolares', 'cuaderno', 'mochila escolar', 'fotocopias'] },
    ],
  },
  {
    slug: 'entretenimiento',
    name: 'Entretenimiento',
    kind: 'expense',
    icon: 'Clapperboard',
    color: '#d183d8',
    subcategories: [
      { slug: 'streaming', name: 'Streaming', keywords: ['netflix', 'spotify', 'disney', 'hbo', 'max', 'prime video', 'star plus', 'youtube premium', 'apple tv', 'crunchyroll', 'suscripcion', 'paramount'] },
      { slug: 'cine', name: 'Cine', keywords: ['cine', 'cinemark', 'hoyts', 'showcase', 'entradas de cine'] },
      { slug: 'juegos', name: 'Juegos', keywords: ['steam', 'playstation', 'xbox', 'nintendo', 'juego', 'gaming', 'epic games'] },
      { slug: 'salidas', name: 'Salidas', keywords: ['salida', 'boliche', 'birra con', 'joda', 'previa', 'copas'] },
      { slug: 'eventos', name: 'Eventos', keywords: ['recital', 'concierto', 'entradas', 'ticketek', 'teatro', 'festival', 'partido'] },
    ],
  },
  {
    slug: 'ropa',
    name: 'Ropa',
    kind: 'expense',
    icon: 'Shirt',
    color: '#f0955a',
    subcategories: [
      { slug: 'indumentaria', name: 'Indumentaria', keywords: ['ropa', 'remera', 'pantalon', 'campera', 'jean', 'zara', 'h&m', 'kevingston', 'indumentaria', 'buzo', 'vestido'] },
      { slug: 'calzado', name: 'Calzado', keywords: ['zapatillas', 'zapatos', 'botas', 'sandalias', 'calzado', 'grimoldi', 'stock center', 'dexter'] },
      { slug: 'accesorios', name: 'Accesorios', keywords: ['accesorios', 'gorra', 'cinturon', 'mochila', 'lentes', 'reloj', 'bijou'] },
    ],
  },
  {
    slug: 'deporte',
    name: 'Deporte',
    kind: 'expense',
    icon: 'Dumbbell',
    color: '#57b86f',
    subcategories: [
      { slug: 'gimnasio', name: 'Gimnasio', keywords: ['gym', 'gimnasio', 'sportclub', 'megatlon', 'cuota del gym', 'crossfit', 'pilates', 'yoga'] },
      { slug: 'equipamiento', name: 'Equipamiento', keywords: ['pesas', 'mancuernas', 'equipamiento deportivo', 'bicicleta', 'raqueta', 'pelota'] },
      { slug: 'club', name: 'Club', keywords: ['club', 'cuota del club', 'socio'] },
      { slug: 'futbol', name: 'Fútbol/Futsal', keywords: ['futbol', 'futsal', 'cancha', 'partido de futbol', 'papi futbol', 'botines'] },
      { slug: 'entrenamiento', name: 'Entrenamiento', keywords: ['entrenador', 'personal trainer', 'running', 'natacion', 'padel', 'tenis'] },
    ],
  },
  {
    slug: 'finanzas',
    name: 'Finanzas',
    kind: 'expense',
    icon: 'Landmark',
    color: '#8695a8',
    subcategories: [
      { slug: 'comisiones', name: 'Comisiones', keywords: ['comision', 'mantenimiento de cuenta', 'costo bancario', 'sellado'] },
      { slug: 'intereses', name: 'Intereses', keywords: ['interes', 'intereses', 'punitorios', 'financiacion'] },
      { slug: 'impuestos', name: 'Impuestos', keywords: ['impuesto', 'afip', 'arca', 'monotributo', 'ingresos brutos', 'arba', 'agip', 'iva', 'abl', 'inmobiliario', 'ganancias'] },
      { slug: 'prestamos', name: 'Préstamos', keywords: ['prestamo', 'cuota del prestamo', 'credito personal', 'hipoteca'] },
      { slug: 'tarjetas', name: 'Tarjetas', keywords: ['tarjeta', 'resumen de tarjeta', 'visa', 'mastercard', 'amex', 'pago de tarjeta'] },
    ],
  },
  {
    slug: 'personal',
    name: 'Personal',
    kind: 'expense',
    icon: 'Sparkles',
    color: '#e58bb0',
    subcategories: [
      { slug: 'regalos', name: 'Regalos', keywords: ['regalo', 'cumpleanos', 'aguinaldo para', 'presente', 'navidad'] },
      { slug: 'cuidado-personal', name: 'Cuidado personal', keywords: ['peluqueria', 'barberia', 'shampoo', 'perfume', 'cosmetica', 'manicura', 'depilacion', 'crema', 'desodorante', 'higiene'] },
      { slug: 'mascotas', name: 'Mascotas', keywords: ['veterinaria', 'mascota', 'perro', 'gato', 'alimento balanceado', 'pipeta'] },
      { slug: 'otros', name: 'Otros', keywords: ['otros', 'varios', 'sin categoria'] },
    ],
  },
  {
    slug: 'inversiones',
    name: 'Inversiones',
    kind: 'investment',
    icon: 'TrendingUp',
    color: '#3fb0a3',
    subcategories: [
      { slug: 'dolar', name: 'Dólar', keywords: ['dolar', 'dolares', 'compra de dolares', 'mep', 'ccl', 'blue'] },
      { slug: 'acciones', name: 'Acciones', keywords: ['acciones', 'cedear', 'cedears', 'bolsa'] },
      { slug: 'bonos', name: 'Bonos', keywords: ['bono', 'bonos', 'al30', 'gd30', 'lecap'] },
      { slug: 'fondos', name: 'Fondos', keywords: ['fci', 'fondo comun', 'money market', 'plazo fijo'] },
      { slug: 'cripto', name: 'Cripto', keywords: ['cripto', 'bitcoin', 'btc', 'usdt', 'ethereum', 'binance', 'lemon', 'belo'] },
    ],
  },
  {
    slug: 'ingresos',
    name: 'Ingresos',
    kind: 'income',
    icon: 'Wallet',
    color: '#46a86c',
    subcategories: [
      { slug: 'sueldo', name: 'Sueldo', keywords: ['sueldo', 'salario', 'cobre el sueldo', 'aguinaldo', 'quincena', 'haberes'] },
      { slug: 'freelance', name: 'Freelance', keywords: ['freelance', 'factura', 'honorarios', 'changa', 'proyecto', 'cliente'] },
      { slug: 'ventas', name: 'Ventas', keywords: ['venta', 'vendi', 'marketplace', 'mercado libre venta'] },
      { slug: 'rendimientos', name: 'Rendimientos', keywords: ['interes', 'intereses', 'rendimiento', 'rendimientos', 'renta', 'dividendos', 'plazo fijo', 'money market', 'fima', 'reservas'] },
      { slug: 'transferencias', name: 'Transferencias', keywords: ['transferencia recibida', 'me transfirieron', 'me pasaron'] },
      { slug: 'reintegros', name: 'Reintegros', keywords: ['reintegro', 'devolucion', 'me devolvieron', 'cashback', 'reembolso'] },
      { slug: 'otros-ingresos', name: 'Otros', keywords: ['otro ingreso', 'premio', 'regalo recibido', 'alquiler cobrado'] },
    ],
  },
];

export const FALLBACK_CATEGORY_SLUG = 'personal';
export const FALLBACK_SUBCATEGORY_SLUG = 'otros';
export const INCOME_CATEGORY_SLUG = 'ingresos';

export const CATEGORY_COLORS = DEFAULT_CATEGORIES.map((c) => c.color);
