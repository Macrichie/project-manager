import { useCallback, useEffect, useRef, useState } from "react";
import type { Column } from "./board";

export type BoardDocument = { revision: number; board: { columns: Column[] } };
export type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatReply = BoardDocument & { reply: string; updated: boolean };

class BoardRequestError extends Error {
  constructor(public status: number, detail = "Board request failed") { super(detail); }
}

function boardUrl(boardId: number) {
  return `/api/boards/${boardId}`;
}

async function requestBoard(signal: AbortSignal, boardId: number, document?: BoardDocument): Promise<BoardDocument> {
  const response = await fetch(boardUrl(boardId), {
    cache: "no-store", signal,
    ...(document && { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(document) }),
  });
  if (!response.ok) throw new BoardRequestError(response.status);
  return response.json();
}

export function useBoard(boardId: number, onSignedOut: () => void) {
  const [document, setDocument] = useState<BoardDocument>();
  const current = useRef<BoardDocument>(undefined);
  const controller = useRef<AbortController>(null);
  const writing = useRef(false);
  const [pending, setPending] = useState(true);
  const [blocked, setBlocked] = useState(true);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [chatError, setChatError] = useState("");

  const accept = useCallback((saved: BoardDocument) => {
    current.current = saved;
    setDocument(saved);
    setBlocked(false);
  }, []);

  const load = useCallback(async () => {
    const signal = controller.current!.signal;
    try {
      const saved = await requestBoard(signal, boardId);
      if (!signal.aborted) accept(saved);
    } catch (failure) {
      if (signal.aborted) return;
      if (failure instanceof BoardRequestError && failure.status === 401) onSignedOut();
      else { setBlocked(true); setError("Couldn't load your saved board. Please try again."); }
    } finally { if (!signal.aborted) setPending(false); }
  }, [accept, onSignedOut, boardId]);

  useEffect(() => {
    const lifetime = new AbortController();
    controller.current = lifetime;
    setDocument(undefined);
    setPending(true);
    setBlocked(true);
    setError("");
    setMessages([]);
    setChatError("");
    void load();
    return () => lifetime.abort();
  }, [load]);

  function reload() {
    setPending(true);
    setError("");
    void load();
  }

  async function save(columns: Column[]): Promise<boolean> {
    if (writing.current || pending || blocked || !current.current) return false;
    if (JSON.stringify(columns) === JSON.stringify(current.current.board.columns)) return true;
    const signal = controller.current!.signal;
    writing.current = true;
    setPending(true);
    setError("");
    try {
      const saved = await requestBoard(signal, boardId, { revision: current.current.revision, board: { columns } });
      if (signal.aborted) return false;
      accept(saved);
      return true;
    } catch (failure) {
      if (signal.aborted) return false;
      if (failure instanceof BoardRequestError && failure.status === 401) { onSignedOut(); return false; }
      const message = failure instanceof BoardRequestError && failure.status === 409
        ? "This board changed elsewhere. The latest saved board is loaded. Review it and try your change again."
        : "Couldn't confirm your change. The latest saved board is loaded. Review it before trying again.";
      if (await recover(signal)) setError(message);
      return false;
    } finally {
      writing.current = false;
      if (!signal.aborted) setPending(false);
    }
  }

  async function recover(signal: AbortSignal): Promise<boolean> {
    try {
      const saved = await requestBoard(signal, boardId);
      if (signal.aborted) return false;
      accept(saved);
      return true;
    } catch (failure) {
      if (signal.aborted) return false;
      if (failure instanceof BoardRequestError && failure.status === 401) onSignedOut();
      else { setBlocked(true); setError("Couldn't check whether your change was saved. Reload the board before making more changes."); }
      return false;
    }
  }

  async function sendMessage(message: string): Promise<boolean> {
    if (!message.trim() || writing.current || pending || blocked || !current.current) return false;
    const signal = controller.current!.signal;
    writing.current = true;
    setPending(true);
    setPendingMessage(message);
    setError("");
    setChatError("");
    try {
      const response = await fetch(`/api/boards/${boardId}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ message, history: messagesRef.current }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new BoardRequestError(response.status,
          typeof body?.detail === "string" ? body.detail : "The assistant couldn't complete your request.");
      }
      const saved: ChatReply = await response.json();
      if (signal.aborted) return false;
      accept(saved);
      setMessages(prev => [...prev, { role: "user", content: message }, { role: "assistant", content: saved.reply }]);
      return true;
    } catch (failure) {
      if (signal.aborted) return false;
      if (failure instanceof BoardRequestError && failure.status === 401) { onSignedOut(); return false; }
      const detail = failure instanceof BoardRequestError
        ? failure.message : "Couldn't confirm the assistant's response.";
      const recovered = await recover(signal);
      if (!signal.aborted) setChatError(detail + (recovered
        ? " Latest saved work is loaded. Review it before trying again."
        : " Reload the board before trying again."));
      return false;
    } finally {
      writing.current = false;
      if (!signal.aborted) { setPending(false); setPendingMessage(null); }
    }
  }

  return { board: document?.board.columns, save, reload, pending, blocked, error,
    chat: { messages, pendingMessage, error: chatError, send: sendMessage } };
}
