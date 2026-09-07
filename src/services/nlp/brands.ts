import { normalizeText } from '@/lib/utils';

/** Merchant aliases → canonical display name. Used for detection and for the merchant rankings. */
export const MERCHANT_ALIASES: Record<string, string> = {
  carrefour: 'Carrefour',
  coto: 'Coto',
  jumbo: 'Jumbo',
  disco: 'Disco',
  vea: 'Vea',
  dia: 'Día%',
  'chango mas': 'ChangoMás',
  changomas: 'ChangoMás',
  'la anonima': 'La Anónima',
  ypf: 'YPF',
  shell: 'Shell',
  axion: 'Axion',
  puma: 'Puma Energy',
  netflix: 'Netflix',
  spotify: 'Spotify',
  disney: 'Disney+',
  hbo: 'HBO Max',
  max: 'HBO Max',
  'prime video': 'Prime Video',
  'star plus': 'Star+',
  'youtube premium': 'YouTube Premium',
  'apple tv': 'Apple TV+',
  'mercado libre': 'Mercado Libre',
  meli: 'Mercado Libre',
  'mercado pago': 'Mercado Pago',
  pedidosya: 'PedidosYa',
  'pedidos ya': 'PedidosYa',
  rappi: 'Rappi',
  uber: 'Uber',
  cabify: 'Cabify',
  didi: 'DiDi',
  sube: 'SUBE',
  mcdonalds: "McDonald's",
  'mc donalds': "McDonald's",
  'burger king': 'Burger King',
  mostaza: 'Mostaza',
  starbucks: 'Starbucks',
  havanna: 'Havanna',
  farmacity: 'Farmacity',
  osde: 'OSDE',
  'swiss medical': 'Swiss Medical',
  galeno: 'Galeno',
  medife: 'Medifé',
  edesur: 'Edesur',
  edenor: 'Edenor',
  metrogas: 'Metrogas',
  aysa: 'AySA',
  personal: 'Personal',
  claro: 'Claro',
  movistar: 'Movistar',
  fibertel: 'Fibertel',
  flow: 'Flow',
  telecentro: 'Telecentro',
  megatlon: 'Megatlón',
  sportclub: 'SportClub',
  easy: 'Easy',
  sodimac: 'Sodimac',
  cinemark: 'Cinemark',
  hoyts: 'Hoyts',
  steam: 'Steam',
  playstation: 'PlayStation',
  ticketek: 'Ticketek',
  afip: 'ARCA (AFIP)',
  arca: 'ARCA',
  binance: 'Binance',
  lemon: 'Lemon',
  belo: 'Belo',
  brubank: 'Brubank',
  uala: 'Ualá',
  naranja: 'Naranja X',
  garbarino: 'Garbarino',
  fravega: 'Frávega',
  musimundo: 'Musimundo',
  zara: 'Zara',
  adidas: 'Adidas',
  nike: 'Nike',
  dexter: 'Dexter',
  'stock center': 'Stock Center',
};

const ALIAS_KEYS = Object.keys(MERCHANT_ALIASES).sort((a, b) => b.length - a.length);

export interface MerchantMatch {
  name: string;
  alias: string;
  start: number;
  end: number;
}

/** Finds the longest known merchant alias inside normalized text. */
export function findMerchant(normalized: string): MerchantMatch | null {
  for (const alias of ALIAS_KEYS) {
    const index = normalized.indexOf(alias);
    if (index === -1) continue;
    const before = normalized[index - 1];
    const after = normalized[index + alias.length];
    const boundedStart = index === 0 || before === ' ' || before === '$';
    const boundedEnd = after === undefined || /[\s.,]/.test(after);
    if (boundedStart && boundedEnd) {
      return { name: MERCHANT_ALIASES[alias], alias, start: index, end: index + alias.length };
    }
  }
  return null;
}

export function canonicalMerchantName(raw: string): string {
  const normalized = normalizeText(raw);
  const match = findMerchant(normalized);
  if (match) return match.name;
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
