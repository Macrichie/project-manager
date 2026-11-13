"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Layers3, LoaderCircle, LogOut } from "lucide-react";

export type User = { id: number; username: string };
type Session = { user: User; expires_in: number };

export function AuthGate({ children }: { children: (user: User, onSignedOut: () => void) => ReactNode }) {
  const [session, setSession] = useState<Session | null>();
  const [error, setError] = useState("");
  const checkSession = useCallback((signal?: AbortSignal) => {
    return fetch("/api/auth/me", { cache: "no-store", signal }).then(async response => {
      let next: Session | null;
      if (response.status === 401) next = null;
      else if (response.ok) next = await response.json();
      else throw new Error("Session check failed");
      if (signal?.aborted) return;
      setSession(next);
      setError("");
    }).catch(() => {
      if (!signal?.aborted) setError("We couldn't reach your workspace. Please try again.");
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkSession(controller.signal);
    return () => controller.abort();
  }, [checkSession]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const onFocus = () => { void checkSession(controller.signal); };
    window.addEventListener("focus", onFocus);
    const timer = window.setTimeout(() => setSession(null), session.expires_in * 1000);
    return () => { controller.abort(); window.clearTimeout(timer); window.removeEventListener("focus", onFocus); };
  }, [session, checkSession]);

  if (session) return children(session.user, () => setSession(null));
  return <div className="auth-shell">
    <section className="auth-welcome" aria-label="Welcome to Forma">
      <div className="brand"><span className="brand-icon"><Layers3 size={21} /></span>forma<span className="brand-period">.</span></div>
      <div className="eyebrow"><span /> A LITTLE SPACE. A LOT OF PROGRESS.</div>
      <h1>Make room for<br />your best work<span>.</span></h1>
      <p>Your ideas, your next steps, and the bigger picture.<br />All together in one calm workspace.</p>
      <div className="auth-board-art" aria-hidden="true">{["Ideas", "In progress", "Done"].map((name, index) => <div key={name}><span className={`auth-art-dot dot-${index}`} /><span>{name}</span><i /><i />{index === 0 && <i />}</div>)}</div>
      <span className="auth-footnote">A little structure. More room to create.</span>
    </section>
    <section className="signin-card" aria-label="Sign in">
      <span className="auth-card-accent" />
      <p className="auth-kicker">YOUR WORKSPACE, AWAITING YOU</p>
      <h2>Welcome back</h2><p>Sign in and pick up where you left off.</p>
      {session === undefined ? <div className="auth-loading" role="status">{error ? <><p role="alert">{error}</p><button className="primary-button" onClick={() => void checkSession()}>Try again</button></> : <><LoaderCircle className="spinning" size={18} /> Opening your workspace...</>}</div> : <SignIn onSignedIn={setSession} />}
    </section>
  </div>;
}

function SignIn({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: String(data.get("username")).trim(), password: String(data.get("password")) }) });
      if (response.status === 401) setError("Incorrect username or password. Please try again.");
      else if (!response.ok) setError("We couldn't sign you in. Please try again.");
      else onSignedIn(await response.json());
    } catch { setError("We couldn't reach the server. Please try again."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} aria-busy={pending}>
    <label htmlFor="username">Username</label><input id="username" name="username" autoComplete="username" placeholder="Your username" required pattern=".*\S.*" disabled={pending} />
    <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" placeholder="Your password" required disabled={pending} />
    {error && <p role="alert" className="auth-error">{error}</p>}
    <button className="primary-button signin-submit" disabled={pending}>{pending ? <><LoaderCircle className="spinning" size={17} /> Signing in...</> : <>Sign in <ArrowRight size={17} /></>}</button>
    <p className="signin-note">One board. A clear place to begin.</p>
  </form>;
}

export function AccountMenu({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok && response.status !== 401) throw new Error("Logout failed");
      onSignedOut();
    } catch { setError("Could not sign out. Please try again."); }
    finally { setPending(false); }
  }
  return <div className="account-menu"><div className="session-indicator"><span /> {user.username}&apos;s workspace</div><button className="logout-button" onClick={signOut} disabled={pending}>{pending ? <LoaderCircle className="spinning" size={14} /> : <LogOut size={14} />} {pending ? "Signing out..." : "Sign out"}</button>{error && <span className="account-error" role="alert">{error}</span>}</div>;
}
