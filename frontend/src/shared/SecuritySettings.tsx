import { useEffect, useState } from "react";
import Modal from "./Modal";
import { req } from "./api";
export default function SecuritySettings({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState(""),
    [next, setNext] = useState(""),
    [repeat, setRepeat] = useState(""),
    [code, setCode] = useState(""),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    void req<{ recovery_enabled: boolean }>("/auth/security")
      .then((s) => setEnabled(s.recovery_enabled))
      .catch((e) => setError(e.message));
  }, []);
  async function run(change: boolean) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (change) {
        if (next !== repeat) throw Error("Las contraseñas no coinciden");
        await req("/auth/security/password", {
          method: "POST",
          body: JSON.stringify({
            current_password: password,
            new_password: next,
          }),
        });
        window.dispatchEvent(new Event("finanzas-session-expired"));
      } else {
        const r = await req<{ recovery_code: string }>(
          "/auth/security/recovery-code",
          {
            method: "POST",
            body: JSON.stringify({ current_password: password }),
          },
        );
        setCode(r.recovery_code);
        setEnabled(true);
      }
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Seguridad de tu cuenta"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="form">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <label>
          Contraseña actual
          <input
            autoComplete="current-password"
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <section className="subform form">
          <h3>Recuperación sin correo</h3>
          <p>
            {enabled
              ? "Tienes un código de recuperación configurado."
              : "Genera un código para recuperar tu cuenta si olvidas la contraseña."}{" "}
            Guárdalo fuera de esta computadora. Es de un solo uso; generar otro
            invalida el anterior.
          </p>
          <button
            className="secondary"
            disabled={busy || !password}
            onClick={() => void run(false)}
          >
            {enabled
              ? "Generar nuevo código"
              : "Generar código de recuperación"}
          </button>
          {code && (
            <label>
              Guarda este código; solo se muestra ahora
              <textarea
                readOnly
                aria-label="Código de recuperación generado"
                value={code}
                rows={3}
              />
            </label>
          )}
        </section>
        <form
          className="subform form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(true);
          }}
        >
          <h3>Cambiar contraseña</h3>
          <label>
            Nueva contraseña
            <input
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <label>
            Repite la nueva contraseña
            <input
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              type="password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </label>
          <p className="hint">
            Se cerrarán tus sesiones en todos los dispositivos. Entrarás de
            nuevo con la contraseña nueva.
          </p>
          <button className="primary" disabled={busy || !password}>
            Cambiar contraseña
          </button>
        </form>
      </div>
    </Modal>
  );
}
