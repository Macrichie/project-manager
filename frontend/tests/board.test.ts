import { describe, expect, it } from "vitest";
import { initialBoard, moveCard } from "../app/board";
describe("board moves", () => {
  it("moves the complete card, preserving all five columns and unrelated cards", () => {
    const before = structuredClone(initialBoard);
    const next = moveCard(before, "c1", "todo");
    expect(next).toHaveLength(5);
    expect(next[0].cards).toHaveLength(2);
    expect(next[1].cards).toEqual([...before[1].cards, before[0].cards[0]]);
    expect(next[2]).toBe(before[2]);
    expect(before).toEqual(initialBoard);
    expect(next.flatMap(c => c.cards)).toHaveLength(10);
  });
  it("moves into an empty column", () => {
    const board = initialBoard.map(c => c.id === "review" ? { ...c, cards: [] } : c);
    expect(moveCard(board, "c1", "review")[3].cards).toEqual([initialBoard[0].cards[0]]);
  });
  it.each([
    ["c1", 1, ["c2", "c1", "c3"]],
    ["c1", 2, ["c2", "c3", "c1"]],
    ["c3", 0, ["c3", "c1", "c2"]],
    ["c3", 1, ["c1", "c3", "c2"]],
  ])("reorders %s to index %s without changing cards or other columns", (cardId, index, order) => {
    const before = structuredClone(initialBoard);
    const next = moveCard(before, cardId, "ideas", index);
    expect(next[0].cards.map(card => card.id)).toEqual(order);
    expect(next[0].cards.find(card => card.id === cardId)).toEqual(before[0].cards.find(card => card.id === cardId));
    expect(next.slice(1)).toEqual(before.slice(1));
    expect(next[1]).toBe(before[1]);
    expect(before).toEqual(initialBoard);
    expect(next.flatMap(column => column.cards)).toHaveLength(10);
  });
  it.each([0, 1, 2])("inserts a card at position %s in another column", index => {
    const next = moveCard(initialBoard, "c1", "todo", index);
    const expected = [...initialBoard[1].cards];
    expected.splice(index, 0, initialBoard[0].cards[0]);
    expect(next[1].cards).toEqual(expected);
    expect(next[0].cards.map(card => card.id)).toEqual(["c2", "c3"]);
    expect(next.flatMap(column => column.cards)).toHaveLength(10);
  });
  it("preserves the board when dropped back at the original position", () => {
    expect(moveCard(initialBoard, "c2", "ideas", 1)).toBe(initialBoard);
  });
  it.each([["c1", "ideas"], ["c1", "missing"], ["missing", "done"]])("ignores unchanged or invalid moves %s / %s", (card, target) => {
    expect(moveCard(initialBoard, card, target)).toBe(initialBoard);
  });
});
