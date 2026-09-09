import { describe, expect, it } from 'vitest';
import { describeDbError } from './supabase-client';

describe('describeDbError', () => {
  it('nombra el campo que falta cuando la fila apuntada no existe', () => {
    const message = describeDbError({
      code: '23503',
      message: 'insert or update on table "transactions" violates foreign key constraint "transactions_category_id_fkey"',
      details: 'Key (category_id)=(0d6f7b0e-1b3a-4d2f-9a1e-2f7c8b5e4a10) is not present in table "categories".',
    });
    expect(message).toContain('la categoría');
    expect(message).toContain('Recargá');
  });

  it('distingue el sentido contrario: borrar algo que todavía se usa', () => {
    const message = describeDbError({
      code: '23503',
      message: 'update or delete on table "categories" violates foreign key constraint',
      details: 'Key (id)=(0d6f7b0e-1b3a-4d2f-9a1e-2f7c8b5e4a10) is still referenced from table "transactions".',
    });
    expect(message).toContain('movimientos');
    expect(message).not.toContain('Recargá');
  });

  it('deja pasar el mensaje de los topes de plan tal cual', () => {
    const message = describeDbError({
      code: 'P0001',
      hint: 'PLAN_LIMIT:transactions',
      message: 'Llegaste a los 30 movimientos de este mes que incluye tu plan.',
    });
    expect(message).toBe('Llegaste a los 30 movimientos de este mes que incluye tu plan.');
  });

  it('usa el campo duplicado cuando hay choque de unicidad', () => {
    expect(
      describeDbError({ code: '23505', message: 'duplicate key value', details: 'Key (user_id)=(x) already exists.' }),
    ).toContain('la cuenta');
  });

  it('no se queda mudo ante un código desconocido: devuelve lo que dijo Postgres', () => {
    const message = describeDbError({ code: 'XX000', message: 'algo raro pasó', details: 'en la tabla movimientos' });
    expect(message).toBe('algo raro pasó en la tabla movimientos');
  });

  it('avisa cuando no hubo red', () => {
    expect(describeDbError({ message: 'TypeError: Failed to fetch' })).toContain('conexión');
  });

  it('tiene algo que decir incluso sin error', () => {
    expect(describeDbError(null)).toBeTruthy();
  });
});
