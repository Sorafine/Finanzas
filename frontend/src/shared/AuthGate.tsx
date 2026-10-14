import { FormEvent, ReactNode, useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { req } from "./api";
import BrandMark from "./BrandMark";
import { setCsrfToken } from "./session";
type Session = { username: string; csrf_token: string; is_admin: boolean };
export default function AuthGate({
  children,
}: {
  children: (
    username: string,
    logout: () => void,
    isAdmin: boolean,
  ) => ReactNode;
}) {
  const [user, setUser] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [registering, setRegistering] = useState(false),
    [registrationEnabled, setRegistrationEnabled] = useState(false),
    [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    let active = true;
    const expired = () => {
      setCsrfToken("");
      setUser(null);
      setPassword("");
    };
    window.addEventListener("finanzas-session-expired", expired);
    req<{ registration_enabled: boolean }>("/auth/options")
      .then((options) => {
        if (active) setRegistrationEnabled(options.registration_enabled);
      })
      .catch(() => {});
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
      if (registering && password !== confirmation)
        throw new Error("Las contraseñas no coinciden");
      const session = await req<Session>(
        registering ? "/auth/register" : "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ username, password }),
        },
      );
      setCsrfToken(session.csrf_token);
      setPassword("");
      setConfirmation("");
      setRegistering(false);
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
        {children(user.username, () => void logout(), user.is_admin === true)}
      </>
    );
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <BrandMark decorative />
          <strong>Balance</strong>
        </div>
        <h1>{registering ? "Crea tu espacio" : "Tu dinero, a tu ritmo"}</h1>
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
              autoComplete={registering ? "new-password" : "current-password"}
              minLength={registering ? 12 : 1}
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
          {registering && (
            <>
              <p className="hint">
                Usa al menos 12 caracteres. El usuario admite letras, números,
                punto, @, guion y guion bajo.
              </p>
              <label>
                Repite la contraseña
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
            </>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Guardando…" : registering ? "Crear mi cuenta" : "Entrar"}
          </button>
        </form>
        <p className="hint">
          <LockKeyhole size={15} /> Tus datos y tu cuenta Google son personales.
        </p>
        {registrationEnabled ? (
          <button
            type="button"
            className="register-switch"
            disabled={busy}
            onClick={() => {
              setRegistering((value) => !value);
              setError("");
              setPassword("");
              setConfirmation("");
            }}
          >
            {registering ? "Ya tengo cuenta: entrar" : "Crear cuenta"}
          </button>
        ) : (
          <p className="hint">
            El registro de cuentas está pausado. Pide acceso al administrador.
          </p>
        )}
      </section>
    </main>
  );
}
