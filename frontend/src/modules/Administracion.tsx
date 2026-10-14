import { useEffect, useState } from "react";
import { req } from "../shared/api";
type User = {
  id: string;
  username: string;
  created_at: number;
  is_active: number;
  is_admin: number;
  google_connected: number;
};
type Overview = {
  users: User[];
  registration_enabled: boolean;
  google_enabled: boolean;
  oauth_configured: boolean;
  callback_url: string;
};
export default function Administracion() {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setData(await req<Overview>("/admin/overview"));
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function settings(field: "registration_enabled" | "google_enabled") {
    if (!data) return;
    await req("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({
        registration_enabled: data.registration_enabled,
        google_enabled: data.google_enabled,
        [field]: !data[field],
      }),
    });
  }
  return (
    <div className="admin-module">
      <p className="muted">
        Solo tu cuenta administradora puede entrar aquí. Gestiona el acceso y
        las conexiones de la app.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-msg" role="status">
          {notice}
        </p>
      )}
      {!data && !error && <p role="status">Cargando administración…</p>}
      {data && (
        <>
          <section className="panel">
            <h2>Registro y conexiones</h2>
            <div className="admin-setting">
              <div>
                <strong>Crear cuentas desde la web</strong>
                <p>{data.registration_enabled ? "Habilitado" : "Pausado"}</p>
              </div>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void action(
                    () => settings("registration_enabled"),
                    "Configuración del registro actualizada",
                  )
                }
              >
                {data.registration_enabled
                  ? "Pausar registros"
                  : "Habilitar registros"}
              </button>
            </div>
            <div className="admin-setting">
              <div>
                <strong>Servicio Google</strong>
                <p>{data.google_enabled ? "Habilitado" : "Pausado"}</p>
              </div>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void action(
                    () => settings("google_enabled"),
                    "Configuración de Google actualizada",
                  )
                }
              >
                {data.google_enabled ? "Pausar Google" : "Habilitar Google"}
              </button>
            </div>
            <p className="hint">
              OAuth:{" "}
              {data.oauth_configured
                ? "Configurado"
                : "Pendiente de configurar en la computadora"}
            </p>
            <p className="hint">Dirección de retorno autorizada en Google:</p>
            <code className="callback-address">{data.callback_url}</code>
            <p className="hint">
              El Client Secret se configura desde la terminal con
              google-configure. En modo de prueba, añade los correos de los
              nuevos usuarios a la lista de pruebas en Google Cloud.
            </p>
          </section>
          <section className="panel">
            <h2>Usuarios ({data.users.length})</h2>
            <p className="muted">
              Se muestran estados de acceso y conexión. Cada persona conserva
              sus propios gastos.
            </p>
            {data.users.map((user) => (
              <article className="admin-user" key={user.id}>
                <div className="grow">
                  <strong>
                    {user.username}
                    {user.is_admin ? " · Administrador" : ""}
                  </strong>
                  <small>
                    {user.is_active ? "Cuenta activa" : "Cuenta pausada"} ·
                    Google{" "}
                    {user.google_connected ? "conectado" : "desconectado"}
                  </small>
                </div>
                <div className="connection-actions">
                  {user.google_connected === 1 && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `¿Desconectar Google de ${user.username}? Tendrá que volver a autorizarlo.`,
                          )
                        )
                          void action(
                            () =>
                              req(`/admin/users/${user.id}/disconnect-google`, {
                                method: "POST",
                              }),
                            "Conexión retirada de la aplicación",
                          );
                      }}
                    >
                      Desconectar Google
                    </button>
                  )}
                  {!user.is_admin && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          user.is_active &&
                          !window.confirm(
                            `¿Pausar el acceso de ${user.username}? Sus sesiones se cerrarán.`,
                          )
                        )
                          return;
                        void action(
                          () =>
                            req(`/admin/users/${user.id}/active`, {
                              method: "PATCH",
                              body: JSON.stringify({
                                is_active: !user.is_active,
                              }),
                            }),
                          "Estado del usuario actualizado",
                        );
                      }}
                    >
                      {user.is_active ? "Pausar usuario" : "Activar usuario"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
