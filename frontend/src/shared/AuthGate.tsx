import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Wallet, LockKeyhole } from "lucide-react";
import { req } from "./api";
import { setCsrfToken } from "./session";
type Session = { username: string; csrf_token: string };
export default function AuthGate({
  children,
}: {
  children: (username: string, logout: () => void) => ReactNode;
}) {
  const [user, setUser] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const expired = () => {
      setCsrfToken("");
      setUser(null);
      setPassword("");
    };
    window.addEventListener("finanzas-session-expired", expired);
    req<Session>("/auth/me")
      .then((session) => {
        if (active) {
          setCsrfToken(session.csrf_token);
          setUser(session);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.removeEventListener("finanzas-session-expired", expired);
    };
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const session = await req<Session>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setCsrfToken(session.csrf_token);
      setPassword("");
      setUser(session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await req("/auth/logout", { method: "POST" });
      setCsrfToken("");
      setUser(null);
      setPassword("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="login-page">
        <p role="status">Abriendo tu espacio…</p>
      </main>
    );
  if (user)
    return (
      <>
        {error && (
          <div className="session-error" role="alert">
            {error}
          </div>
        )}
        {children(user.username, () => void logout())}
      </>
    );
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <Wallet size={30} />
          <strong>
            finanzas<span>app</span>
          </strong>
        </div>
        <h1>Tu dinero, a tu ritmo</h1>
        <p className="muted">
          Entra a tu espacio para ver tus gastos, ahorrar y recordar tus pagos.
        </p>
        <form className="form" onSubmit={(e) => void login(e)}>
          <label>
            Usuario
            <input
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={64}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              required
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="hint">
          <LockKeyhole size={15} /> Tus datos y tu cuenta Google son personales.
        </p>
        <p className="hint">
          ¿No tienes acceso? Pídele un usuario a la persona que administra la
          app.
        </p>
      </section>
    </main>
  );
}
