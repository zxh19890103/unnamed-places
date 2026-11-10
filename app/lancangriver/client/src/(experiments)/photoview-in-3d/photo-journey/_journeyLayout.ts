export type JourneyCardBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  selected: boolean;
};

function overlaps(a: JourneyCardBox, b: JourneyCardBox): boolean {
  return a.x - a.anchorX < b.x - b.anchorX + b.width + 12 &&
    a.x - a.anchorX + a.width + 12 > b.x - b.anchorX &&
    a.y - a.anchorY < b.y - b.anchorY + b.height + 12 &&
    a.y - a.anchorY + a.height + 12 > b.y - b.anchorY;
}

export function placeJourneyCards(
  cards: JourneyCardBox[],
  viewport: { width: number; height: number },
): JourneyCardBox[] {
  const placed: JourneyCardBox[] = [];
  const result = cards.map((card) => ({ ...card }));
  const order = cards.map((card, index) => ({ card, index }))
    .sort((a, b) => Number(b.card.selected) - Number(a.card.selected));
  for (const { card, index } of order) {
    if (card.selected || !placed.some((other) => overlaps(card, other))) {
      placed.push(result[index]);
      continue;
    }
    const candidates: JourneyCardBox[] = [];
    for (let ring = 1; ring <= cards.length; ring += 1) {
      for (let row = -ring; row <= ring; row += 1) {
        for (let column = -ring; column <= ring; column += 1) {
          if (Math.max(Math.abs(row), Math.abs(column)) !== ring) continue;
          candidates.push({
            ...card,
            x: card.x + column * (card.width + 16),
            y: card.y + row * (card.height + 16),
          });
        }
      }
    }
    const inView = (candidate: JourneyCardBox) =>
      candidate.x - candidate.anchorX >= 12 &&
      candidate.x - candidate.anchorX + candidate.width <= viewport.width - 12 &&
      candidate.y - candidate.anchorY >= 60 &&
      candidate.y - candidate.anchorY + candidate.height <= viewport.height - 30;
    candidates.sort((a, b) => Number(inView(b)) - Number(inView(a)) ||
      Math.hypot(a.x - card.x, a.y - card.y) - Math.hypot(b.x - card.x, b.y - card.y));
    const position = candidates.find((candidate) => !placed.some((other) => overlaps(candidate, other)));
    if (position) result[index] = position;
    placed.push(result[index]);
  }
  return result;
}
