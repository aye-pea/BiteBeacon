import { describe, expect, it } from 'vitest';
import { avatarColorSlots, avatarLabels } from '../src/domain/initials';

describe('avatarLabels', () => {
  it('keeps one capital letter when nobody shares it', () => {
    expect(avatarLabels(['alex', 'Banjo', 'Maya'])).toEqual(['A', 'B', 'M']);
  });
  it('uses the first two letters for one-word names that share a letter', () => {
    expect(avatarLabels(['Alex', 'Jayson', 'Jeremy'])).toEqual(['A', 'Ja', 'Je']);
  });
  it('uses initials for two-word names that share a letter', () => {
    expect(avatarLabels(['Jayson', 'Jeremy Smith', 'Mary Ann Lee'])).toEqual(['Ja', 'JS', 'M']);
  });
  it('compares letters without caring about case or spacing', () => {
    expect(avatarLabels(['  jo ', 'Jen'])).toEqual(['Jo', 'Je']);
  });
  it('handles one-letter, empty and non-Latin names', () => {
    expect(avatarLabels(['J', 'Jo', ''])).toEqual(['J', 'Jo', '']);
    expect(avatarLabels(['Émile', 'Élodie', '李雷', '李娜'])).toEqual(['Ém', 'Él', '李雷', '李娜']);
  });
});

describe('avatarColorSlots', () => {
  const hues = [200, 270, 330, 30, 210, 245, 45, 290];
  it('takes colours in order when labels differ', () => {
    expect(avatarColorSlots(['A', 'Ja', 'Je'], hues)).toEqual([0, 1, 2]);
  });
  it('gives matching labels colours far apart on the colour wheel', () => {
    const [a, b] = avatarColorSlots(['Ja', 'Ja'], hues);
    const gap = Math.abs(hues[a] - hues[b]) % 360;
    expect(Math.min(gap, 360 - gap)).toBeGreaterThanOrEqual(120);
  });
});
