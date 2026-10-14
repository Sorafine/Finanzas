import { useEffect, useState } from "react";
import { req } from "../shared/api";
type Status = { configured: boolean; connected: boolean; enabled?: boolean };
export default function Conexiones({
  onReview,
  onAdmin,
  isAdmin,
}: {
  onReview: () => void;
  onAdmin: () => void;
  isAdmin: boolean;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function refresh() {
    setStatus(await req<Status>("/google/status"));
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await req("/google/disconnect", { method: "POST" });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="connections-module">
      <p className="muted">
        Estas conexiones son tuyas. Cada persona autoriza su propia cuenta
        Google.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="panel">
        <h2>Mi cuenta Google</h2>
        <p>
          {status?.enabled === false
            ? "Servicio pausado por el administrador"
            : status?.connected
              ? "✓ Conectada"
              : status?.configured
                ? "Lista para conectar"
                : "Configuración de Google pendiente"}
        </p>
        <div className="connection-actions">
          {status?.connected ? (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Desconectar mi Google
            </button>
          ) : status?.configured && status.enabled !== false ? (
            <a className="primary" href="/api/google/connect">
              Conectar mi Google
            </a>
          ) : (
            <p className="hint">
              El administrador debe habilitar y configurar Google para activar
              esta conexión.
            </p>
          )}
        </div>
        <p className="hint">
          Tu cuenta Google y tus gastos se guardan separados de los demás
          usuarios.
        </p>
      </section>
      <section className="panel">
        <h2>Gmail: revisión de gastos</h2>
        <p>
          Los comprobantes tienen su propia pantalla. Allí revisas el importe y
          la cuenta antes de registrar cada consumo.
        </p>
        <button className="primary" onClick={onReview}>
          Abrir revisión de gastos
        </button>
      </section>
      <section className="panel">
        <h2>Calendar: próximos pagos</h2>
        <p>
          Al conectar Google podrás añadir recordatorios recurrentes de tus
          gastos fijos desde Pagos.
        </p>
      </section>
      {isAdmin && (
        <section className="panel">
          <h2>Administración</h2>
          <p>Controla los registros, usuarios y conexiones de la aplicación.</p>
          <button className="secondary" onClick={onAdmin}>
            Abrir administración
          </button>
        </section>
      )}
    </div>
  );
}
