"use client";
import { useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { closestCenter, closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, useDndContext, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, Check, Columns3, GripVertical, Layers3, Plus, X, Pencil, ArrowUpRight, Sparkles, Calendar, Tag, Flag } from "lucide-react";
import { moveCard, type Card, type Column } from "./board";
import { AccountMenu, type User } from "./auth";
import { useBoard } from "./use-board";
import { ChatPanel } from "./chat-panel";

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

function CardForm({ card, pending, onSave, onCancel }: { card?: Card; pending: boolean; onSave: (title: string, details: string, priority: Card["priority"], labels: string[], due_date: string | null) => Promise<boolean>; onCancel: () => void }) {
  return <form className="add-form" aria-label={card ? "Edit card" : "New card"} onKeyDown={event => { if (event.key === "Escape" && !pending) onCancel(); }} onSubmit={async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title")).trim();
    const priority = (String(data.get("priority")) || "none") as Card["priority"];
    const labelsRaw = String(data.get("labels") ?? "").trim();
    const labels = labelsRaw ? labelsRaw.split(",").map(l => l.trim()).filter(Boolean) : [];
    const due = String(data.get("due_date") ?? "").trim() || null;
    if (title && await onSave(title, String(data.get("details")), priority, labels, due)) onCancel();
  }}><fieldset disabled={pending}>
    <label>Title<input autoFocus name="title" defaultValue={card?.title} placeholder="What needs to be done?" required pattern={String.raw`.*\S.*`} /></label>
    <label>Details <span>(optional)</span><textarea name="details" defaultValue={card?.details} placeholder="Add a little context..." rows={3} /></label>
    <div className="card-meta-fields">
      <label className="meta-field"><Flag size={13} /> Priority
        <select name="priority" defaultValue={card?.priority ?? "none"}>
          <option value="none">None</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label className="meta-field"><Calendar size={13} /> Due date
        <input type="date" name="due_date" defaultValue={card?.due_date ?? ""} />
      </label>
      <label className="meta-field"><Tag size={13} /> Labels <span>(comma-separated)</span>
        <input name="labels" defaultValue={card?.labels?.join(", ") ?? ""} placeholder="e.g. bug, urgent" />
      </label>
    </div>
    <div className="form-actions"><button className="primary-button" type="submit">{card ? <Check size={14} /> : <Plus size={14} />}{card ? "Save changes" : "Add card"}</button><button className="text-button" type="button" onClick={onCancel}>Cancel</button></div>
  </fieldset></form>;
}

const PRIORITY_CLASSES: Record<string, string> = { high: "priority-high", medium: "priority-medium", low: "priority-low" };

function TaskCard({ card, onDelete, onEdit, busy = false, editRef, overlay = false, dragging = false, handleProps }: { card: Card; onDelete?: () => void; onEdit?: () => void; busy?: boolean; editRef?: ComponentProps<"button">["ref"]; overlay?: boolean; dragging?: boolean; handleProps?: ComponentProps<"button"> }) {
  const priorityClass = card.priority && card.priority !== "none" ? PRIORITY_CLASSES[card.priority] ?? "" : "";
  return <article aria-hidden={overlay || undefined} className={`task-card ${dragging ? "dragging" : ""} ${overlay ? "overlay" : ""} ${priorityClass}`}>
    <div className="card-header">
      <button className="icon-button drag-handle" aria-label={`Move ${card.title}`} disabled={overlay} {...handleProps}><GripVertical size={14} /></button>
      <h3>{card.title}</h3>
      <div className="card-tools">
        {onEdit && <button ref={editRef} className="icon-button edit" aria-label={`Edit ${card.title}`} onClick={onEdit} disabled={busy}><Pencil size={13} /></button>}
        {onDelete && <button className="icon-button delete" aria-label={`Delete ${card.title}`} onClick={onDelete} disabled={busy}><X size={14} /></button>}
      </div>
    </div>
    {card.details && <p>{card.details}</p>}
    {((card.labels && card.labels.length > 0) || card.due_date || (card.priority && card.priority !== "none")) && (
      <div className="card-meta">
        {card.priority && card.priority !== "none" && <span className={`card-priority ${priorityClass}`}><Flag size={11} /> {card.priority}</span>}
        {card.due_date && <span className="card-due"><Calendar size={11} /> {card.due_date}</span>}
        {card.labels && card.labels.length > 0 && <div className="card-labels">{card.labels.map(label => <span key={label} className="card-label">{label}</span>)}</div>}
      </div>
    )}
  </article>;
}

function SortableTaskCard({ card, onDelete, onEdit, busy }: { card: Card; onDelete: () => void; onEdit: (title: string, details: string, priority: Card["priority"], labels: string[], due_date: string | null) => Promise<boolean>; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, transform, transition } = useSortable({ id: card.id, disabled: busy || editing });
  function closeEdit() { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); }
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
    {editing ? <article className="task-card editing"><CardForm card={card} pending={busy} onSave={onEdit} onCancel={closeEdit} /></article> : <TaskCard card={card} onDelete={onDelete} onEdit={() => setEditing(true)} busy={busy} editRef={editButton} dragging={isDragging} handleProps={{ ...attributes, ...listeners, ref: setActivatorNodeRef }} />}
  </div>;
}

function BoardColumn({ column, index, busy, onRename, onAdd, onEdit, onDelete }: { column: Column; index: number; busy: boolean; onRename: (name: string) => Promise<boolean>; onAdd: (title: string, details: string, priority: Card["priority"], labels: string[], due_date: string | null) => Promise<boolean>; onEdit: (id: string, title: string, details: string, priority: Card["priority"], labels: string[], due_date: string | null) => Promise<boolean>; onDelete: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: busy });
  const { over } = useDndContext();
  const isTarget = isOver || over?.data.current?.sortable?.containerId === column.id;
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  function closeAdd() { setAdding(false); requestAnimationFrame(() => addButton.current?.focus()); }
  function closeRename() { setRenaming(false); requestAnimationFrame(() => renameButton.current?.focus()); }
  return <section ref={setNodeRef} aria-label={column.name} className={`column column-${index} ${isTarget ? "drop-target" : ""}`}>
    <div className="column-heading"><span className="status-dot">{index === 4 && <Check size={10} />}</span>{renaming ?
      <form className="rename-form" onSubmit={async event => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get("name")).trim();
        if (name && await onRename(name)) closeRename();
      }}><input disabled={busy} name="name" aria-label="Column name" defaultValue={column.name} autoFocus required pattern={String.raw`.*\S.*`} onKeyDown={event => { if (event.key === "Escape" && !busy) closeRename(); }} /><button disabled={busy} className="icon-button" aria-label="Save column name"><Check size={15} /></button><button disabled={busy} type="button" className="icon-button" aria-label="Cancel rename" onClick={closeRename}><X size={15} /></button></form> :
      <><h2><button disabled={busy} ref={renameButton} className="rename-button" aria-label={`Rename ${column.name}`} onClick={() => setRenaming(true)}>{column.name}<Pencil size={12} /></button></h2><span className="column-count">{column.cards.length}</span><button disabled={busy} className="icon-button column-add" aria-label={`Add card to ${column.name}`} onClick={() => setAdding(true)}><Plus size={17} /></button></>}
    </div>
    <SortableContext id={column.id} items={column.cards.map(card => card.id)} strategy={verticalListSortingStrategy}><div className="card-list">{column.cards.map(card => <SortableTaskCard key={card.id} card={card} busy={busy} onEdit={(title, details, priority, labels, due_date) => onEdit(card.id, title, details, priority, labels, due_date)} onDelete={() => onDelete(card.id)} />)}{column.cards.length === 0 && !adding && <div className="empty-column">Room for your next idea.<br /><span>Add a card or drop one here.</span></div>}</div></SortableContext>
    {adding ? <CardForm pending={busy} onSave={onAdd} onCancel={closeAdd} /> : <button disabled={busy} ref={addButton} className="add-card" onClick={() => setAdding(true)} aria-label={`New card in ${column.name}`}><Plus size={16} /> Add card</button>}
  </section>;
}
export function ProjectBoard({ user, boardId, boardName, onSignedOut, onBack }: { user: User; boardId: number; boardName?: string; onSignedOut: () => void; onBack: () => void }) {
  const { board: savedBoard, save, reload, pending, blocked, error, chat } = useBoard(boardId, onSignedOut);
  const board = savedBoard ?? [];
  const [active, setActive] = useState<Card | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const chatToggle = useRef<HTMLButtonElement>(null);
  function closeChat() { setChatOpen(false); requestAnimationFrame(() => chatToggle.current?.focus()); }
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
  const findCard = (id: string | number) => board.flatMap(c => c.cards).find(c => c.id === id);
  const findColumn = (id: string | number) => board.find(c => c.id === id || c.cards.some(card => card.id === id));
  const dndAnnouncements = {
    onDragStart({ active }: { active: { id: string | number } }) { return `Picked up card "${findCard(active.id)?.title}" from ${findColumn(active.id)?.name}`; },
    onDragOver({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) { const col = over && findColumn(over.id); return col ? `Card "${findCard(active.id)?.title}" over ${col.name}` : undefined; },
    onDragEnd({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) { const col = over && findColumn(over.id); return col ? `Dropped "${findCard(active.id)?.title}" in ${col.name}` : `Cancelled moving "${findCard(active.id)?.title}"`; },
    onDragCancel({ active }: { active: { id: string | number } }) { return `Cancelled moving "${findCard(active.id)?.title}"`; },
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }));
  function finishDrag({ active, over }: DragEndEvent) {
    if (over) {
      const target = board.find(column => column.id === over.id || column.cards.some(card => card.id === over.id));
      if (target) {
        const index = target.cards.findIndex(card => card.id === over.id);
        void save(moveCard(board, String(active.id), target.id, index < 0 ? target.cards.length : index));
      }
    }
    setActive(null);
  }
  const total = board.reduce((sum, column) => sum + column.cards.length, 0);
  const done = board[4]?.cards.length ?? 0;
  return <><header className="app-header"><Link className="brand" href="/" aria-label="Forma home"><span className="brand-icon"><Layers3 size={21} /></span>forma<span className="brand-period">.</span></Link><div className="header-divider" /><button className="back-button" onClick={onBack} aria-label="Back to boards"><ArrowLeft size={16} /> Boards</button><span className="workspace-label">{user.username}&apos;s workspace</span><AccountMenu user={user} onSignedOut={onSignedOut} /></header>
    <main><div className="breadcrumb"><button className="breadcrumb-link" onClick={onBack}>Boards</button> <span>/</span> <span>{boardName ?? "Board"}</span></div><section className="board-intro"><div><div className="eyebrow"><span /> A LITTLE STRUCTURE. A LOT OF POSSIBILITIES.</div><h1>Great work starts here<span>.</span></h1><p>A clear space for your ideas, your progress, and your next big thing.</p></div><div className="board-symbol" aria-hidden="true"><Columns3 size={30} /><ArrowUpRight size={18} /></div></section>
    <div className="board-toolbar"><div className="board-tab"><Columns3 size={17} /> Project board</div><div className="board-summary"><span>{total} cards</span><span className="summary-divider" /><span className="completion"><span style={{ width: `${total ? done / total * 100 : 0}%` }} /></span><span>{done} of {total} complete</span></div><button ref={chatToggle} className={`chat-toggle ${chatOpen ? "selected" : ""}`} aria-label="AI assistant" aria-expanded={chatOpen} aria-controls="board-assistant" onClick={() => chatOpen ? closeChat() : setChatOpen(true)}><Sparkles size={16} /><span>AI assistant</span></button></div>
    {error && <div className="board-error" role="alert"><span>{error}</span>{blocked && <button className="text-button" disabled={pending} onClick={() => void reload()}>Reload board</button>}</div>}
    <div className={`workspace ${chatOpen ? "chat-open" : ""}`}><div className="board-area">{!savedBoard ? <div className="board-loading" role="status">{pending ? "Loading your board..." : "Your saved board is unavailable."}</div> : <DndContext id="kanban" sensors={sensors} collisionDetection={boardCollisions} accessibility={{ announcements: dndAnnouncements }} onDragStart={event => setActive(board.flatMap(column => column.cards).find(card => card.id === event.active.id) ?? null)} onDragEnd={finishDrag} onDragCancel={() => setActive(null)}><div className="board-scroll"><div className="board">{board.map((column, index) => <BoardColumn key={column.id} column={column} index={index} busy={pending || blocked} onRename={name => save(board.map(item => item.id === column.id ? { ...item, name } : item))} onAdd={(title, details, priority, labels, due_date) => save(board.map(item => item.id === column.id ? { ...item, cards: [...item.cards, { id: crypto.randomUUID(), title, details, priority, labels, due_date }] } : item))} onEdit={(id, title, details, priority, labels, due_date) => save(board.map(item => ({ ...item, cards: item.cards.map(card => card.id === id ? { ...card, title, details, priority, labels, due_date } : card) })))} onDelete={id => { if (confirm("Delete this card? This cannot be undone.")) void save(board.map(item => ({ ...item, cards: item.cards.filter(card => card.id !== id) }))); }} />)}</div></div><DragOverlay>{active ? <TaskCard card={active} overlay /> : null}</DragOverlay></DndContext>}</div><ChatPanel open={chatOpen} onClose={closeChat} busy={pending || blocked || Boolean(active)} messages={chat.messages} pendingMessage={chat.pendingMessage} error={chat.error} onSend={chat.send} /></div>
    <footer><span><GripVertical size={14} /> Grab a card and make your next move.</span><span aria-live="polite">{pending ? (chat.pendingMessage ? "Working with your assistant..." : savedBoard ? "Saving changes..." : "Opening your board...") : error ? "Please review the message above." : "All changes saved"}</span></footer></main></>;
}
