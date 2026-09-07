import type { OcrResult } from '@/types/receipt';
import type { OcrProvider } from '../provider';
import { format, subDays } from 'date-fns';

/**
 * Development OCR. Produces a realistic Argentine ticket so the full pipeline
 * (parse → items → categories → transaction) can be exercised without an API key.
 * Everything it returns is flagged `mock: true` and labelled in the UI.
 */
export class MockOcrProvider implements OcrProvider {
  readonly id = 'mock' as const;
  readonly label = 'Demo (sin proveedor)';
  readonly isMock = true;

  async recognize(file: Blob): Promise<OcrResult> {
    // Deterministic per file so re-running gives the same ticket.
    const seed = file.size % SAMPLES.length;
    const sample = SAMPLES[seed];
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      text: sample(new Date()),
      confidence: 0.82,
      provider: 'mock',
      mock: true,
    };
  }
}

const SAMPLES: ((now: Date) => string)[] = [
  (now) => `CARREFOUR ARGENTINA S.A.
AV. RIVADAVIA 5100 - CABA
CUIT 30-68731043-4
FACTURA B N 0004-00021785
FECHA ${format(subDays(now, 1), 'dd/MM/yyyy')} 19:42

LECHE ENTERA 1L        2 x 1.800,00      3.600,00
PAN LACTAL             1 x 2.450,00      2.450,00
CAFE MOLIDO 500G       1 x 8.900,00      8.900,00
DETERGENTE 750ML       1 x 3.200,00      3.200,00
SHAMPOO 400ML          1 x 6.700,00      6.700,00
CARNE PICADA 1KG       1 x 9.800,00      9.800,00
GASEOSA 2.25L          2 x 2.700,00      5.400,00

SUBTOTAL                              40.050,00
DESCUENTO                                 -550,00
TOTAL                                  39.500,00
TARJETA DEBITO VISA
`,
  (now) => `SUPERMERCADO COTO CICSA
CUIT 30-54808315-4
TICKET 0032-00119874
${format(now, 'dd/MM/yyyy')} 11:07

BANANA X KG            1,240 x 1.900,00   2.356,00
TOMATE PERITA          0,860 x 2.400,00   2.064,00
YERBA 1KG              1 x 7.450,00       7.450,00
FIDEOS 500G            3 x 1.150,00       3.450,00
ACEITE GIRASOL 900ML   1 x 4.980,00       4.980,00
JABON EN POLVO 800G    1 x 5.600,00       5.600,00

SUBTOTAL                               25.900,00
IVA 21%                                     0,00
TOTAL                                  25.900,00
EFECTIVO                               30.000,00
VUELTO                                  4.100,00
`,
  (now) => `YPF FULL - ESTACION SERVICIO
CUIT 30-54668997-9
${format(now, 'dd/MM/yyyy')} 08:15
TICKET 0011-00098123

INFINIA NAFTA     28,45 LT x 1.230,00   34.993,50

TOTAL                                   34.993,50
MERCADO PAGO
`,
];
