import { describe, expect, it } from 'vitest';
import { DEMO_PEOPLE, demoLineup } from '../src/data/demo';

describe('demo lineup', () => {
  it('has the seven demo people', () => {
    expect(DEMO_PEOPLE.map(p => p.name)).toEqual(['Alex', 'Kha', 'DFK', 'Jonathan', 'Nafis', 'Banjo', 'BiteBeacon']);
  });

  it('keeps the listed order when not shuffled (tests)', () => {
    const { me, household } = demoLineup(null);
    expect(me.name).toBe('Alex');
    expect(household.map(p => p.name)).toEqual(['Kha', 'DFK', 'Jonathan', 'Nafis', 'Banjo', 'BiteBeacon']);
  });

  it('always uses all seven people exactly once', () => {
    for (let n = 0; n < 50; n++) {
      const { me, household } = demoLineup();
      expect([me, ...household].map(p => p.name).sort()).toEqual(['Alex', 'Banjo', 'BiteBeacon', 'DFK', 'Jonathan', 'Kha', 'Nafis']);
      expect(household).toHaveLength(6);
    }
  });

  it('signs in as each of the seven and varies the order', () => {
    const signedIn = new Set<string>(), orders = new Set<string>();
    for (let n = 0; n < 400; n++) {
      const { me, household } = demoLineup();
      signedIn.add(me.name); orders.add(household.map(p => p.name).join());
    }
    expect(signedIn.size).toBe(7);
    expect(orders.size).toBeGreaterThan(20);
  });

  it('keeps each person with their own allergies and never shares arrays with the list', () => {
    const { me, household } = demoLineup(() => 0);
    expect(me).toEqual({ id: 'demo-kha', name: 'Kha', allergies: ['milk', 'eggs'] });
    expect(household.map(p => p.name)).toEqual(['DFK', 'Jonathan', 'Nafis', 'Banjo', 'BiteBeacon', 'Alex']);
    me.allergies.push('soy');
    expect(DEMO_PEOPLE[1].allergies).toEqual(['milk', 'eggs']);
  });
});
