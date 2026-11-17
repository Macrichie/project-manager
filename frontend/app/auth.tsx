"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Layers3, LoaderCircle, LogOut, KeyRound, Check } from "lucide-react";

export type User = { id: number; username: string };
type Session = { user: User; expires_in: number };

export function AuthGate({ children }: { children: (user: User, onSignedOut: () => void) => ReactNode }) {
  const [session, setSession] = useState<Session | null>();
  const [error, setError] = useState("");
  const signedOut = useCallback(() => setSession(null), []);
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

  if (session) return children(session.user, signedOut);
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
      {session === undefined ? <div className="auth-loading" role="status">{error ? <><p role="alert">{error}</p><button className="primary-button" onClick={() => void checkSession()}>Try again</button></> : <><LoaderCircle className="spinning" size={18} /> Opening your workspace...</>}</div> : <AuthForms onSignedIn={setSession} />}
    </section>
  </div>;
}

function AuthForms({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  if (mode === "register") return <Register onSignedIn={onSignedIn} onBack={() => setMode("signin")} />;
  return <SignIn onSignedIn={onSignedIn} onCreateAccount={() => setMode("register")} />;
}

function SignIn({ onSignedIn, onCreateAccount }: { onSignedIn: (session: Session) => void; onCreateAccount: () => void }) {
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
    <p className="signin-note">Don&apos;t have an account? <button type="button" className="text-link" onClick={onCreateAccount}>Create one</button></p>
  </form>;
}

function Register({ onSignedIn, onBack }: { onSignedIn: (session: Session) => void; onBack: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: String(data.get("username")).trim(),
          password: String(data.get("password")),
          display_name: String(data.get("display_name")).trim(),
        }),
      });
      if (response.status === 409) setError("That username is already taken. Try another.");
      else if (response.status === 422) setError("Please check your details. Username must not be blank, password must be at least 8 characters.");
      else if (!response.ok) setError("We couldn't create your account. Please try again.");
      else onSignedIn(await response.json());
    } catch { setError("We couldn't reach the server. Please try again."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} aria-busy={pending}>
    <label htmlFor="reg-display">Display name <span className="label-hint">(optional)</span></label>
    <input id="reg-display" name="display_name" autoComplete="name" placeholder="How should we greet you?" disabled={pending} />
    <label htmlFor="reg-username">Username</label>
    <input id="reg-username" name="username" autoComplete="username" placeholder="Pick a username" required pattern=".*\S.*" disabled={pending} />
    <label htmlFor="reg-password">Password</label>
    <input id="reg-password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" required minLength={8} disabled={pending} />
    {error && <p role="alert" className="auth-error">{error}</p>}
    <button className="primary-button signin-submit" disabled={pending}>{pending ? <><LoaderCircle className="spinning" size={17} /> Creating account...</> : <>Create account <ArrowRight size={17} /></>}</button>
    <p className="signin-note">Already have an account? <button type="button" className="text-link" onClick={onBack}>Sign in</button></p>
  </form>;
}

function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true); setError(""); setSuccess(false);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: String(data.get("current_password")),
          new_password: String(data.get("new_password")),
        }),
      });
      if (response.status === 403) setError("Current password is incorrect.");
      else if (response.status === 422) setError("New password must be at least 8 characters.");
      else if (!response.ok) setError("Could not change password. Please try again.");
      else { setSuccess(true); setTimeout(onClose, 1500); }
    } catch { setError("Could not reach the server. Please try again."); }
    finally { setPending(false); }
  }
  return <div className="password-dialog" role="dialog" aria-label="Change password">
    <form onSubmit={submit}>
      <h3>Change password</h3>
      <label>Current password<input name="current_password" type="password" autoComplete="current-password" required disabled={pending || success} /></label>
      <label>New password<input name="new_password" type="password" autoComplete="new-password" placeholder="At least 8 characters" required minLength={8} disabled={pending || success} /></label>
      {error && <p role="alert" className="auth-error">{error}</p>}
      {success && <p className="password-success"><Check size={14} /> Password updated!</p>}
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={pending || success}>{pending ? <><LoaderCircle className="spinning" size={14} /> Updating...</> : "Update password"}</button>
        <button className="text-button" type="button" onClick={onClose}>Cancel</button>
      </div>
    </form>
  </div>;
}

export function AccountMenu({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  async function signOut() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok && response.status !== 401) throw new Error("Logout failed");
      onSignedOut();
    } catch { setError("Could not sign out. Please try again."); }
    finally { setPending(false); }
  }
  return <div className="account-menu">
    <div className="session-indicator"><span /> {user.username}&apos;s workspace</div>
    <button className="account-action-button" onClick={() => setShowPasswordChange(true)} aria-label="Change password" title="Change password"><KeyRound size={14} /></button>
    <button className="logout-button" onClick={signOut} disabled={pending}>{pending ? <LoaderCircle className="spinning" size={14} /> : <LogOut size={14} />} {pending ? "Signing out..." : "Sign out"}</button>
    {error && <span className="account-error" role="alert">{error}</span>}
    {showPasswordChange && <ChangePasswordForm onClose={() => setShowPasswordChange(false)} />}
  </div>;
}
