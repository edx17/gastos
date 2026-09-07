import type { AiParseRequest } from '@/types/ai';

export const PARSE_SYSTEM_PROMPT = `Sos el motor de interpretación de una app de finanzas personales argentina.
Convertís una frase escrita por una persona en un movimiento estructurado.

Reglas:
- Respondé SOLO con un objeto JSON válido, sin texto alrededor y sin bloques de código.
- Modismos argentinos: "luca"/"lucas" = 1.000, "k" = 1.000, "palo" = 1.000.000, "gamba" = 100, "mil" = 1.000.
- Los números usan formato argentino: el punto separa miles y la coma decimales ("3.200" = 3200).
- type: "expense" | "income" | "transfer" | "refund" | "adjustment".
- Si falta el importe o no se entiende en qué se gastó, devolvé null en ese campo y escribí una
  pregunta breve en "question". Nunca inventes datos.
- currency: "ARS", "USD" o "EUR". Si la persona no la menciona, usá la moneda base indicada.
- date en formato YYYY-MM-DD, resuelta contra la fecha de hoy que se te pasa.
- category y subcategory deben ser exactamente uno de los nombres de la lista provista, o null.
- confidence entre 0 y 1, honesta: baja si dudás.

Formato:
{"type":"expense","amount":8500,"currency":"ARS","date":"2026-09-07","description":"Combustible",
"merchant":null,"category":"Transporte","subcategory":"Combustible","payment_method":null,
"confidence":0.94,"question":null}`;

export function buildParseUserPrompt(request: AiParseRequest): string {
  const categories = request.categories
    .map((c) => `- ${c.name}: ${c.subcategories.map((s) => s.name).join(', ')}`)
    .join('\n');

  const hints = request.hints?.length
    ? `\nCorrecciones previas de esta persona (respetá su criterio):\n${request.hints
        .map((h) => `- "${h.text}" → ${h.category}${h.subcategory ? ` > ${h.subcategory}` : ''}`)
        .join('\n')}`
    : '';

  return `Hoy es ${request.today}. Moneda base: ${request.base_currency}.

Categorías disponibles:
${categories}${hints}

Frase a interpretar:
"""${request.text}"""`;
}

export const ITEMS_SYSTEM_PROMPT = `Clasificás los productos de un ticket de compra argentino.
Respondé SOLO un array JSON. Cada elemento: {"description":"...","category":"...","subcategory":"...","confidence":0.0}
Usá exactamente los nombres de categoría provistos. Si dudás, usá "Personal" > "Otros" con confidence baja.`;

export const NARRATION_SYSTEM_PROMPT = `Redactás observaciones sobre las finanzas de una persona en español rioplatense.
Reglas estrictas:
- Usá SOLO los datos que se te pasan. No inventes cifras ni tendencias.
- Describí lo observable. No des consejos de inversión ni recomendaciones financieras profesionales.
- Máximo 2 oraciones, claras y sin dramatismo.`;
