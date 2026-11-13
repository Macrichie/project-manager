import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageSquare, Sparkles, X } from "lucide-react";
import type { ChatMessage } from "./use-board";

type Props = {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  messages: ChatMessage[];
  pendingMessage: string | null;
  error: string;
  onSend: (message: string) => Promise<boolean>;
};

export function ChatPanel({ open, onClose, busy, messages, pendingMessage, error, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, pendingMessage, open]);

  return <aside id="board-assistant" className="chat-panel" aria-label="AI assistant" hidden={!open}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="chat-heading"><span className="assistant-icon"><Sparkles size={18} /></span><div><h2>Forma assistant</h2><p>A little help. More room to move.</p></div><button className="icon-button" aria-label="Close assistant" onClick={onClose}><X size={17} /></button></div>
    <div ref={log} className="chat-messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text">
      {messages.length === 0 && !pendingMessage && <div className="chat-empty"><span><MessageSquare size={25} /></span><h3>Make your next move.</h3><p>Ask a question, shape an idea, or tell me what to change on your board.</p><p className="chat-example">Try: “Move the welcome card to Done.”</p></div>}
      {messages.map((message, index) => <div key={index} className={`chat-message ${message.role}`}><span className="chat-speaker">{message.role === "user" ? "You" : "Forma"}</span><p>{message.content}</p></div>)}
      {pendingMessage && <><div className="chat-message user"><span className="chat-speaker">You</span><p>{pendingMessage}</p></div><div className="chat-thinking" role="status"><span /><span /><span /> Thinking through your next move...</div></>}
    </div>
    <form className="chat-composer" onSubmit={async event => {
      event.preventDefault();
      const message = draft.trim();
      if (!busy && message && await onSend(message)) {
        setDraft("");
        requestAnimationFrame(() => input.current?.focus());
      }
    }}>
      {error && <p className="chat-error" role="alert">{error}</p>}
      <label htmlFor="assistant-message">Message your assistant</label>
      <textarea id="assistant-message" ref={input} value={draft} onChange={event => setDraft(event.target.value)} rows={3}
        placeholder="What would you like to work on?" disabled={busy}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault(); event.currentTarget.form?.requestSubmit();
          }
        }} />
      <div className="chat-send-row"><span>Enter to send · Shift+Enter for a new line</span><button className="primary-button" type="submit" disabled={busy || !draft.trim()} aria-label="Send message"><ArrowUp size={17} /></button></div>
      <p className="chat-note">Board changes save automatically. Chat clears on refresh or sign-out.</p>
    </form>
  </aside>;
}
