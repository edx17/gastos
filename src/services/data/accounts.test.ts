import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDataClient } from './local';

const client = new LocalDataClient();
let userId = '';

beforeEach(async () => {
  localStorage.clear();
  const user = await client.signUp(`cuentas-${Math.random()}@crocante.test`, 'crocante-demo', 'Test');
  userId = user.id;
});

describe('cuentas', () => {
  it('guarda dónde está la plata y deja el primer saldo en el historial', async () => {
    const account = await client.createAccount(userId, {
      name: 'FIMA Premium',
      currency: 'ARS',
      kind: 'investment',
      balance: 2_500_000,
      institution: 'Galicia',
    });

    expect(account.balance).toBe(2_500_000);
    expect(account.balance_updated_at).toBeTruthy();
    expect(await client.listAccountBalances(account.id)).toHaveLength(1);
  });

  it('corregir el saldo el mismo día pisa el punto en vez de duplicarlo', async () => {
    const account = await client.createAccount(userId, {
      name: 'Reservas',
      currency: 'ARS',
      kind: 'wallet',
      balance: 300_000,
    });

    await client.updateAccount(account.id, { balance: 380_000 });
    const history = await client.listAccountBalances(account.id);
    expect(history).toHaveLength(1);
    expect(history[0].balance).toBe(380_000);
  });

  it('renombrar no toca el historial ni la fecha del saldo', async () => {
    const account = await client.createAccount(userId, {
      name: 'Caja de ahorro',
      currency: 'ARS',
      kind: 'savings',
      balance: 100_000,
    });

    const updated = await client.updateAccount(account.id, { name: 'Caja de ahorro Galicia' });
    expect(updated.name).toBe('Caja de ahorro Galicia');
    expect(updated.balance).toBe(100_000);
    expect(await client.listAccountBalances(account.id)).toHaveLength(1);
  });

  it('suma el patrimonio pasando cada moneda a la base', async () => {
    await client.upsertExchangeRate(userId, 'USD', 1500);
    await client.createAccount(userId, { name: 'Pesos', currency: 'ARS', kind: 'savings', balance: 1_000_000 });
    await client.createAccount(userId, { name: 'Dólares', currency: 'USD', kind: 'cash', balance: 1_000 });

    expect(await client.getNetWorth(userId)).toBe(2_500_000);
  });

  it('respeta las cuentas que se pidió dejar fuera del total', async () => {
    await client.createAccount(userId, { name: 'Mía', currency: 'ARS', kind: 'savings', balance: 500_000 });
    await client.createAccount(userId, {
      name: 'De mi vieja',
      currency: 'ARS',
      kind: 'savings',
      balance: 900_000,
      include_in_net_worth: false,
    });

    expect(await client.getNetWorth(userId)).toBe(500_000);
  });

  it('archivar la saca de la lista y del total', async () => {
    const account = await client.createAccount(userId, {
      name: 'Vieja cuenta',
      currency: 'ARS',
      kind: 'checking',
      balance: 250_000,
    });

    await client.archiveAccount(account.id);
    expect(await client.listAccounts(userId)).toHaveLength(0);
    expect(await client.getNetWorth(userId)).toBe(0);
  });
});
