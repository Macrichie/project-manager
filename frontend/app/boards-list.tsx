"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Columns3, Layers3, LayoutGrid, Plus, Trash2, LoaderCircle, Pencil, Check, X } from "lucide-react";
import type { BoardMeta } from "./board";
import { AccountMenu, type User } from "./auth";

function formatDate(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function BoardCard({ board, onSelect, onRename, onDelete }: { board: BoardMeta; onSelect: () => void; onRename: (name: string) => void; onDelete: () => void }) {
  const [renaming, setRenaming] = useState(false);
  return <article className="board-card" onClick={() => { if (!renaming) onSelect(); }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" && !renaming) onSelect(); }}>
    <div className="board-card-header">
      <Columns3 size={16} />
      {renaming ? (
        <form className="board-rename-form" onSubmit={e => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("name")).trim(); if (name) { onRename(name); setRenaming(false); } }} onClick={e => e.stopPropagation()}>
          <input autoFocus name="name" defaultValue={board.name} required pattern={String.raw`.*\S.*`} onKeyDown={e => { if (e.key === "Escape") setRenaming(false); }} />
          <button type="submit" className="icon-button" aria-label="Save name"><Check size={14} /></button>
          <button type="button" className="icon-button" aria-label="Cancel rename" onClick={() => setRenaming(false)}><X size={14} /></button>
        </form>
      ) : (
        <>
          <h2>{board.name}</h2>
          <button className="icon-button board-card-edit" aria-label={`Rename ${board.name}`} onClick={e => { e.stopPropagation(); setRenaming(true); }}><Pencil size={13} /></button>
        </>
      )}
      <button className="icon-button board-card-delete" aria-label={`Delete ${board.name}`}
        onClick={e => { e.stopPropagation(); void onDelete(); }}>
        <Trash2 size={14} />
      </button>
    </div>
    {board.description && <p className="board-card-desc">{board.description}</p>}
    <div className="board-card-meta">
      <span>{board.card_count} cards</span>
      <span>Updated {formatDate(board.updated_at)}</span>
    </div>
  </article>;
}

export function BoardsList({ user, onSignedOut, onSelectBoard }: {
  user: User;
  onSignedOut: () => void;
  onSelectBoard: (boardId: number) => void;
}) {
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadBoards = useCallback(async () => {
    try {
      const response = await fetch("/api/boards", { cache: "no-store" });
      if (response.status === 401) { onSignedOut(); return; }
      if (!response.ok) throw new Error("Failed to load boards");
      setBoards(await response.json());
      setError("");
    } catch {
      setError("Couldn't load your boards. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [onSignedOut]);

  useEffect(() => { void loadBoards(); }, [loadBoards]);

  async function createBoard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    if (!name) return;
    setCreating(true);
    try {
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: String(data.get("description") ?? "").trim() }),
      });
      if (!response.ok) throw new Error("Failed to create board");
      setShowForm(false);
      await loadBoards();
    } catch {
      setError("Couldn't create the board. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function renameBoard(boardId: number, name: string) {
    try {
      const response = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error("Failed to rename");
      await loadBoards();
    } catch {
      setError("Couldn't rename the board. Please try again.");
    }
  }

  async function deleteBoard(boardId: number, boardName: string) {
    if (!confirm(`Delete "${boardName}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/boards/${boardId}`, { method: "DELETE" });
      if (response.status === 400) {
        setError("You can't delete your only board.");
        return;
      }
      if (!response.ok) throw new Error("Failed to delete");
      await loadBoards();
    } catch {
      setError("Couldn't delete the board. Please try again.");
    }
  }

  return <>
    <header className="app-header">
      <Link className="brand" href="/" aria-label="Forma home">
        <span className="brand-icon"><Layers3 size={21} /></span>forma<span className="brand-period">.</span>
      </Link>
      <div className="header-divider" />
      <span className="workspace-label">{user.username}&apos;s workspace</span>
      <AccountMenu user={user} onSignedOut={onSignedOut} />
    </header>
    <main>
      <div className="breadcrumb">Workspace <span>/</span> <span>Boards</span></div>
      <section className="board-intro">
        <div>
          <div className="eyebrow"><span /> YOUR PROJECTS, ALL IN ONE PLACE.</div>
          <h1>Your boards<span>.</span></h1>
          <p>Each board is a workspace for a project, a goal, or an idea worth pursuing.</p>
        </div>
        <div className="board-symbol" aria-hidden="true"><LayoutGrid size={30} /></div>
      </section>

      {error && <div className="board-error" role="alert"><span>{error}</span>
        <button className="text-button" onClick={() => { setError(""); void loadBoards(); }}>Dismiss</button>
      </div>}

      {loading ? (
        <div className="board-loading" role="status"><LoaderCircle className="spinning" size={18} /> Loading your boards...</div>
      ) : (
        <>
          <div className="boards-grid">
            {boards.map(board => (
              <BoardCard key={board.id} board={board} onSelect={() => onSelectBoard(board.id)} onRename={(name) => renameBoard(board.id, name)} onDelete={() => deleteBoard(board.id, board.name)} />
            ))}

            {showForm ? (
              <form className="board-card board-card-form" onSubmit={createBoard} onKeyDown={e => { if (e.key === "Escape") setShowForm(false); }}>
                <fieldset disabled={creating}>
                  <label>Board name <input autoFocus name="name" placeholder="e.g. Sprint 1" required pattern=".*\S.*" /></label>
                  <label>Description <span>(optional)</span><input name="description" placeholder="A short description..." /></label>
                  <div className="form-actions">
                    <button className="primary-button" type="submit"><Plus size={14} /> Create board</button>
                    <button className="text-button" type="button" onClick={() => setShowForm(false)}>Cancel</button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <button className="board-card board-card-new" onClick={() => setShowForm(true)} aria-label="Create new board">
                <Plus size={24} />
                <span>New board</span>
              </button>
            )}
          </div>
        </>
      )}

      <footer><span><LayoutGrid size={14} /> Your boards. Your way forward.</span></footer>
    </main>
  </>;
}
