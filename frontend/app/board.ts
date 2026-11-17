export type Card = {
  id: string;
  title: string;
  details: string;
  labels?: string[];
  due_date?: string | null;
  priority?: "none" | "low" | "medium" | "high";
};
export type Column = { id: string; name: string; cards: Card[] };
export type BoardMeta = {
  id: number;
  name: string;
  description: string;
  card_count: number;
  updated_at: number;
};
export const initialBoard: Column[] = [
  { id: "ideas", name: "Ideas", cards: [
    { id: "c1", title: "A warmer welcome", details: "Explore a simpler onboarding experience that helps people feel at home from day one." },
    { id: "c2", title: "Small details, big difference", details: "Collect inspiration for thoughtful interactions and little moments of delight." },
    { id: "c3", title: "Give empty states a voice", details: "Turn blank screens into helpful starting points." }] },
  { id: "todo", name: "To do", cards: [
    { id: "c4", title: "Map the core journey", details: "Sketch the path from a first visit to a first small win. Keep it focused." },
    { id: "c5", title: "Find our visual rhythm", details: "Bring type, spacing, and color together in a lightweight design direction." }] },
  { id: "progress", name: "In progress", cards: [
    { id: "c6", title: "Build a better board", details: "Create a calm, clear place to see what matters and keep work moving." },
    { id: "c7", title: "Make every screen feel right", details: "Fine-tune the experience from a wide desktop to a small phone." }] },
  { id: "review", name: "In review", cards: [
    { id: "c8", title: "A second pair of eyes", details: "Walk through the first prototype. Check the flow, the language, and the little things." }] },
  { id: "done", name: "Done", cards: [
    { id: "c9", title: "Start with a clear purpose", details: "One board. Less noise. More room to do your best work." },
    { id: "c10", title: "Lay the foundation", details: "The project is set up and ready for something great." }] },
];
/**
 * Move a card to a target column at a given position. For intra-column moves,
 * `targetIndex` is the position in the array *after* the card has been removed
 * (matching @dnd-kit's hovered-card index). For inter-column moves, it is the
 * direct insertion index in the target column's array.
 */
export function moveCard(board: Column[], cardId: string, targetId: string, targetIndex?: number): Column[] {
  const source = board.find(column => column.cards.some(card => card.id === cardId));
  const target = board.find(column => column.id === targetId);
  if (!source || !target) return board;
  const sourceIndex = source.cards.findIndex(card => card.id === cardId);
  const index = targetIndex ?? (source.id === target.id ? sourceIndex : target.cards.length);
  if (source.id === target.id && sourceIndex === index) return board;
  const card = source.cards[sourceIndex];
  return board.map(column => {
    if (column.id !== source.id && column.id !== target.id) return column;
    const cards = column.cards.filter(item => item.id !== cardId);
    if (column.id === target.id) cards.splice(index, 0, card);
    return { ...column, cards };
  });
}
