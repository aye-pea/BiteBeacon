import type { Person } from '../domain/allergens';

// The seven fictional demo profiles. Each demo start signs in as a random one of them and lists
// the other six in a fresh random order.
export const DEMO_PEOPLE: readonly Person[] = [
  { id: 'demo-alex', name: 'Alex', allergies: ['peanuts', 'tree-nuts'] },
  { id: 'demo-kha', name: 'Kha', allergies: ['milk', 'eggs'] },
  { id: 'demo-dfk', name: 'DFK', allergies: ['sesame'] },
  { id: 'demo-jonathan', name: 'Jonathan', allergies: ['tree-nuts', 'soy'] },
  { id: 'demo-nafis', name: 'Nafis', allergies: ['gluten', 'mustard'] },
  { id: 'demo-banjo', name: 'Banjo', allergies: ['eggs', 'shellfish', 'mollusks'] },
  { id: 'demo-bitebeacon', name: 'BiteBeacon', allergies: ['peanuts', 'sesame'] },
];

// Set on the web (localStorage) by the end-to-end tests so every demo opens as Alex with the list in the order above.
export const DEMO_FIXED_KEY = 'bitebeacon.demoFixedOrder';

// Fisher-Yates shuffle; the first person is the one signed in, the rest are the household.
// random = null keeps the order above (Alex signed in).
export function demoLineup(random: (() => number) | null = Math.random): { me: Person; household: Person[] } {
  const people = DEMO_PEOPLE.map(p => ({ ...p, allergies: [...p.allergies] }));
  for (let i = people.length - 1; random && i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [people[i], people[j]] = [people[j], people[i]];
  }
  const [me, ...household] = people;
  return { me, household };
}

