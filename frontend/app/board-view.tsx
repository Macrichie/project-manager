"use client";
import { useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { closestCenter, closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, useDndContext, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Columns3, GripVertical, Layers3, Plus, Trash2, X, Pencil, ArrowUpRight } from "lucide-react";
import { initialBoard, moveCard, type Card, type Column } from "./board";
import { AccountMenu, type User } from "./auth";

const boardCollisions: CollisionDetection = args => {
  if (!args.pointerCoordinates) return closestCorners(args);
  // The pointer identifies the intended column even when the overlay spans several.
  const hits = pointerWithin(args);
  const cardHits = hits.filter(hit => args.droppableContainers.find(container => container.id === hit.id)?.data.current?.sortable);
  if (cardHits.length) return cardHits;
  const column = hits[0];
  if (!column) return [];
  const cards = args.droppableContainers.filter(container => container.data.current?.sortable?.containerId === column.id);
  const last = cards.find(container => container.data.current?.sortable.index === cards.length - 1);
  const lastRect = last && args.droppableRects.get(last.id);
  if (!lastRect || args.pointerCoordinates.y >= lastRect.bottom) return [column];
  return closestCenter({ ...args, droppableContainers: cards });
};

function TaskCard({ card, onDelete, overlay = false, dragging = false, handleProps }: { card: Card; onDelete?: () => void; overlay?: boolean; dragging?: boolean; handleProps?: ComponentProps<"button"> }) {
  return <article aria-hidden={overlay || undefined} className={`task-card ${dragging ? "dragging" : ""} ${overlay ? "overlay" : ""}`}>
    <div className="card-top"><span className="card-mark" /><div className="card-tools"><button className="icon-button drag-handle" aria-label={`Move ${card.title}`} disabled={overlay} {...handleProps}><GripVertical size={16} /></button>{onDelete && <button className="icon-button delete" aria-label={`Delete ${card.title}`} onClick={onDelete}><Trash2 size={14} /></button>}</div></div>
    <h3>{card.title}</h3>{card.details && <p>{card.details}</p>}
  </article>;
}
function SortableTaskCard({ card, onDelete }: { card: Card; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, transform, transition } = useSortable({ id: card.id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
    <TaskCard card={card} onDelete={onDelete} dragging={isDragging} handleProps={{ ...attributes, ...listeners, ref: setActivatorNodeRef }} />
  </div>;
}
function BoardColumn({ column, index, onRename, onAdd, onDelete }: { column: Column; index: number; onRename: (name: string) => void; onAdd: (title: string, details: string) => void; onDelete: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const { over } = useDndContext();
  const isTarget = isOver || over?.data.current?.sortable?.containerId === column.id;
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  function closeAdd() { setAdding(false); requestAnimationFrame(() => addButton.current?.focus()); }
  function closeRename() { setRenaming(false); requestAnimationFrame(() => renameButton.current?.focus()); }
  return <section ref={setNodeRef} aria-label={column.name} className={`column column-${index} ${isTarget ? "drop-target" : ""}`}>
    <div className="column-heading"><span className="status-dot">{index === 4 && <Check size={10} />}</span>{renaming ? <form className="rename-form" onSubmit={event => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name")).trim(); if (name) { onRename(name); closeRename(); } }}><input name="name" aria-label="Column name" defaultValue={column.name} autoFocus required pattern=".*\S.*" onKeyDown={event => { if (event.key === "Escape") closeRename(); }} /><button className="icon-button" aria-label="Save column name"><Check size={15} /></button><button type="button" className="icon-button" aria-label="Cancel rename" onClick={closeRename}><X size={15} /></button></form> : <><h2><button ref={renameButton} className="rename-button" aria-label={`Rename ${column.name}`} onClick={() => setRenaming(true)}>{column.name}<Pencil size={12} /></button></h2><span className="column-count">{column.cards.length}</span><button className="icon-button column-add" aria-label={`Add card to ${column.name}`} onClick={() => setAdding(true)}><Plus size={17} /></button></>}</div>
    <SortableContext id={column.id} items={column.cards.map(card => card.id)} strategy={verticalListSortingStrategy}><div className="card-list">{column.cards.map(card => <SortableTaskCard key={card.id} card={card} onDelete={() => onDelete(card.id)} />)}{column.cards.length === 0 && !adding && <div className="empty-column">Room for your next idea.<br /><span>Add a card or drop one here.</span></div>}</div></SortableContext>
    {adding ? <form className="add-form" onKeyDown={event => { if (event.key === "Escape") closeAdd(); }} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const title = String(data.get("title")).trim(); if (title) { onAdd(title, String(data.get("details")).trim()); closeAdd(); } }}><label>Title<input autoFocus name="title" placeholder="What needs to be done?" required pattern=".*\S.*" /></label><label>Details <span>(optional)</span><textarea name="details" placeholder="Add a little context…" rows={3} /></label><div className="form-actions"><button className="primary-button" type="submit"><Plus size={14} /> Add card</button><button className="text-button" type="button" onClick={closeAdd}>Cancel</button></div></form> : <button ref={addButton} className="add-card" onClick={() => setAdding(true)} aria-label={`New card in ${column.name}`}><Plus size={16} /> Add card</button>}
  </section>;
}
export function ProjectBoard({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const [board, setBoard] = useState(initialBoard);
  const [active, setActive] = useState<Card | null>(null);
  // Follow board order rather than the rotated overlay's geometry.
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) return;
    event.preventDefault();
    const id = context.over?.id ?? context.active?.id;
    const columnIndex = board.findIndex(column => column.id === id || column.cards.some(card => card.id === id));
    if (columnIndex < 0) return;
    const column = board[columnIndex];
    const index = column.cards.findIndex(card => card.id === id);
    let targetId: string | undefined;
    if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      targetId = column.cards[index + (event.code === "ArrowDown" ? 1 : -1)]?.id;
    } else {
      const target = board[columnIndex + (event.code === "ArrowRight" ? 1 : -1)];
      if (target) targetId = target.cards[Math.max(0, Math.min(index, target.cards.length - 1))]?.id ?? target.id;
    }
    const rect = targetId && context.droppableRects.get(targetId);
    return rect ? { x: rect.left, y: rect.top } : undefined;
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }));
  function finishDrag({ active, over }: DragEndEvent) {
    if (over) setBoard(current => {
      const target = current.find(column => column.id === over.id || column.cards.some(card => card.id === over.id));
      if (!target) return current;
      const index = target.cards.findIndex(card => card.id === over.id);
      return moveCard(current, String(active.id), target.id, index < 0 ? target.cards.length : index);
    });
    setActive(null);
  }
  const total = board.reduce((sum, column) => sum + column.cards.length, 0);
  const done = board[4].cards.length;
  return <><header className="app-header"><Link className="brand" href="/" aria-label="Forma home"><span className="brand-icon"><Layers3 size={21} /></span>forma<span className="brand-period">.</span></Link><div className="header-divider" /><span className="workspace-label">Your workspace</span><AccountMenu user={user} onSignedOut={onSignedOut} /></header>
    <main><div className="breadcrumb">Workspace <span>/</span> <span>Project board</span></div><section className="board-intro"><div><div className="eyebrow"><span /> A LITTLE STRUCTURE. A LOT OF POSSIBILITIES.</div><h1>Great work starts here<span>.</span></h1><p>A clear space for your ideas, your progress, and your next big thing.</p></div><div className="board-symbol" aria-hidden="true"><Columns3 size={30} /><ArrowUpRight size={18} /></div></section>
    <div className="board-toolbar"><div className="board-tab"><Columns3 size={17} /> Project board</div><div className="board-summary"><span>{total} cards</span><span className="summary-divider" /><span className="completion"><span style={{ width: `${total ? done / total * 100 : 0}%` }} /></span><span>{done} of {total} complete</span></div></div>
    <DndContext id="kanban" sensors={sensors} collisionDetection={boardCollisions} onDragStart={event => setActive(board.flatMap(column => column.cards).find(card => card.id === event.active.id) ?? null)} onDragEnd={finishDrag} onDragCancel={() => setActive(null)}><div className="board-scroll"><div className="board">{board.map((column, index) => <BoardColumn key={column.id} column={column} index={index} onRename={name => setBoard(current => current.map(item => item.id === column.id ? { ...item, name } : item))} onAdd={(title, details) => setBoard(current => current.map(item => item.id === column.id ? { ...item, cards: [...item.cards, { id: crypto.randomUUID(), title, details }] } : item))} onDelete={id => setBoard(current => current.map(item => ({ ...item, cards: item.cards.filter(card => card.id !== id) })))} />)}</div></div><DragOverlay>{active ? <TaskCard card={active} overlay /> : null}</DragOverlay></DndContext>
    <footer><span><GripVertical size={14} /> Grab a card and make your next move.</span><span>Just a fresh canvas. Changes reset on refresh.</span></footer></main></>;
}
