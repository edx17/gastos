import { describe, expect, it } from 'vitest';
import { computeHouseholdBalance, settleBalances } from './local';
import type { HouseholdMember } from '@/types/user';

const member = (id: string, name: string, share: number): HouseholdMember => ({
  id,
  household_id: 'h1',
  user_id: null,
  role: 'member',
  display_name: name,
  color: '#2f9e8f',
  share,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
});

describe('household balance', () => {
  const members = [member('a', 'Ana', 0.5), member('b', 'Beto', 0.5)];

  it('splits shared spending and shows who is ahead', () => {
    const rows = [
      { paid_by: 'a', base_amount: 600_000 },
      { paid_by: 'b', base_amount: 450_000 },
    ];
    const [ana, beto] = computeHouseholdBalance(members, rows).sort((x, y) => y.paid - x.paid);

    expect(ana.paid).toBe(600_000);
    expect(ana.owed).toBe(525_000);
    expect(ana.balance).toBe(75_000);
    expect(beto.balance).toBe(-75_000);
  });

  it('honours uneven shares', () => {
    const uneven = [member('a', 'Ana', 0.7), member('b', 'Beto', 0.3)];
    const balance = computeHouseholdBalance(uneven, [{ paid_by: 'a', base_amount: 100_000 }]);
    expect(balance.find((row) => row.display_name === 'Ana')?.owed).toBe(70_000);
    expect(balance.find((row) => row.display_name === 'Beto')?.balance).toBe(-30_000);
  });

  it('counts unattributed expenses in the total but not for anyone', () => {
    const balance = computeHouseholdBalance(members, [{ paid_by: null, base_amount: 100_000 }]);
    expect(balance.every((row) => row.paid === 0)).toBe(true);
    expect(balance.every((row) => row.owed === 50_000)).toBe(true);
  });

  it('is empty-safe', () => {
    expect(computeHouseholdBalance(members, [])).toHaveLength(2);
    expect(computeHouseholdBalance([], [{ paid_by: 'a', base_amount: 10 }])).toHaveLength(0);
  });
});

describe('settleBalances', () => {
  it('proposes the transfer that squares the accounts', () => {
    const settlements = settleBalances([
      { member_id: 'a', display_name: 'Ana', color: '#000', share: 0.5, paid: 600_000, owed: 525_000, balance: 75_000 },
      { member_id: 'b', display_name: 'Beto', color: '#000', share: 0.5, paid: 450_000, owed: 525_000, balance: -75_000 },
    ]);
    expect(settlements).toEqual([{ from: 'Beto', to: 'Ana', amount: 75_000 }]);
  });

  it('splits one debtor across several creditors', () => {
    const settlements = settleBalances([
      { member_id: 'a', display_name: 'Ana', color: '#000', share: 0.33, paid: 0, owed: 60_000, balance: -60_000 },
      { member_id: 'b', display_name: 'Beto', color: '#000', share: 0.33, paid: 100_000, owed: 60_000, balance: 40_000 },
      { member_id: 'c', display_name: 'Caro', color: '#000', share: 0.33, paid: 80_000, owed: 60_000, balance: 20_000 },
    ]);
    expect(settlements).toEqual([
      { from: 'Ana', to: 'Beto', amount: 40_000 },
      { from: 'Ana', to: 'Caro', amount: 20_000 },
    ]);
  });

  it('says nothing when everyone is square', () => {
    expect(
      settleBalances([
        { member_id: 'a', display_name: 'Ana', color: '#000', share: 0.5, paid: 500, owed: 500, balance: 0 },
      ]),
    ).toHaveLength(0);
  });
});
