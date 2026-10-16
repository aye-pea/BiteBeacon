// Letters on household "contact photos". Everyone gets one capital letter unless someone else in the
// household starts with the same letter; then a two-word name shows its initials (Banjo Smith → BS) and a
// one-word name its first two letters (Jayson → Ja, Jeremy → Je). Array.from keeps accents and non-Latin scripts whole.
const chars = (s: string) => Array.from(s);
const firstLetter = (name: string) => (chars(name.trim())[0] ?? '').toLocaleUpperCase();

export function avatarLabels(names: readonly string[]): string[] {
  const firsts = names.map(firstLetter);
  return names.map((name, i) => {
    const first = firsts[i];
    if (!first || firsts.filter(f => f === first).length < 2) return first;
    const words = name.trim().split(/\s+/);
    if (words.length > 1) return first + firstLetter(words[words.length - 1]);
    const second = chars(words[0])[1];
    return second ? first + second.toLocaleLowerCase() : first;
  });
}

// Colour slot per person. Normally people take the colours in order; when two labels still match
// (Jayson and Jaylen are both "Ja"), the later one takes the colour whose hue is furthest from the others with that label.
export function avatarColorSlots(labels: readonly string[], hues: readonly number[]): number[] {
  const slots: number[] = [];
  const hueGap = (a: number, b: number) => { const d = Math.abs(hues[a] - hues[b]) % 360; return Math.min(d, 360 - d); };
  labels.forEach((label, i) => {
    const twins = slots.filter((_, j) => labels[j] === label && label !== '');
    if (!twins.length) { slots.push(i % hues.length); return; }
    let best = 0, bestScore = -1;
    hues.forEach((_, c) => {
      // Furthest hue from every same-label colour first; then a colour nobody else has; then display order.
      const score = Math.min(...twins.map(t => hueGap(c, t))) * 100 + (slots.includes(c) ? 0 : 50) - Math.abs(c - (i % hues.length)) / 10;
      if (score > bestScore) { best = c; bestScore = score; }
    });
    slots.push(best);
  });
  return slots;
}
