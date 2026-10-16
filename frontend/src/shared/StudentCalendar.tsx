import { useEffect, useRef, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { req } from "./api";
import Modal from "./Modal";
export type StudentCalendarStatus = {
  enabled: boolean;
  connected: boolean;
  identified: boolean;
  configured: boolean;
  google_enabled: boolean;
  busy: boolean;
  synced_count: number;
  pending_count: number;
  other_account_count: number;
  total_classes: number;
  last_error: string | null;
  classes: {
    class_id: number;
    synced: boolean;
    pending_removal: boolean;
    error: string | null;
  }[];
};
export default function StudentCalendar({
  revision,
  onConnect,
  onStatus,
}: {
  revision: number;
  onConnect: () => void;
  onStatus: (status: StudentCalendarStatus) => void;
}) {
  const operation = useRef(false);
  const [status, setStatus] = useState<StudentCalendarStatus | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  async function load() {
    try {
      const s = await req<StudentCalendarStatus>("/student/calendar/status");
      setStatus(s);
      onStatus(s);
      setError("");
      return s;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }
  useEffect(() => {
    void load();
  }, [revision]);
  useEffect(() => {
    const retry = async () => {
      if (document.visibilityState !== "visible" || busy) return;
      const s = await load();
      if (
        s?.pending_count &&
        s.connected &&
        s.identified &&
        s.google_enabled &&
        !s.busy
      )
        await sync(false);
    };
    const timer = window.setInterval(() => void retry(), 60000);
    const visible = () => {
      if (document.visibilityState === "visible") void retry();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [busy, revision]);
  async function sync(enable: boolean, force = false) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      const s = await req<StudentCalendarStatus>(
        "/google/calendar/student/sync",
        { method: "POST", body: JSON.stringify({ enable, force }) },
      );
      setStatus(s);
      onStatus(s);
    } catch (e) {
      setError((e as Error).message);
      await load();
      setError((e as Error).message);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function disable() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      const s = await req<StudentCalendarStatus>("/student/calendar/disable", {
        method: "POST",
        body: "{}",
      });
      setStatus(s);
      onStatus(s);
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel student-calendar-panel">
      <div className="day-section-heading">
        <h2>
          <CalendarDays size={20} aria-hidden="true" /> Google Calendar
        </h2>
        <button
          className="icon-button"
          aria-label="Actualizar estado de Calendar"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {!status ? (
        <p role="status">
          {error ? "No se pudo consultar Calendar." : "Consultando conexión…"}
        </p>
      ) : (
        <>
          <p>
            {status.enabled
              ? "Sincronización del horario activada. Las clases y sus cambios se envían a tu calendario principal."
              : "Activa la conexión para añadir tus clases a tu Google Calendar, sin importar archivos."}
          </p>
          {!status.enabled && (
            <p className="muted student-caption">
              Si ya importaste el archivo .ics, retira esas clases de Calendar
              antes de activar la conexión para evitar duplicarlas.
            </p>
          )}
          <p className="muted student-caption">
            Series de 16 clases semanales · hora de Perú. Solo se envían curso,
            día, horas y aula; no se envían notas, ánimo ni finanzas. El estado
            corresponde a la última sincronización.
          </p>
          {!!status.other_account_count && (
            <p className="error">
              Hay {status.other_account_count} vínculos de otra cuenta Google.
              Para retirarlos, desactiva la sincronización, reconecta esa cuenta
              y reintenta el retiro.
            </p>
          )}
          {!status.google_enabled && (
            <p className="muted">
              El administrador ha pausado Google. Tus clases se conservan y los
              cambios esperan a que se habilite.
            </p>
          )}
          {status.connected && status.identified && (
            <p role="status">
              {status.synced_count}{" "}
              {status.synced_count === 1
                ? "clase sincronizada"
                : "clases sincronizadas"}{" "}
              · {status.pending_count}{" "}
              {status.pending_count === 1
                ? "cambio pendiente"
                : "cambios pendientes"}
              {status.busy ? " · sincronización en curso" : ""}
            </p>
          )}
          {(!status.connected || !status.identified) && (
            <p className="muted">
              Conecta o vuelve a conectar Google para autorizar Calendar.
              {status.pending_count
                ? " Hay cambios o retiros pendientes de completar."
                : ""}
            </p>
          )}
          {status.last_error && (
            <p className="error" role="alert">
              {status.last_error}
            </p>
          )}
          <div className="student-button-row">
            {status.connected && (
              <button className="link" onClick={onConnect}>
                Gestionar conexión Google
              </button>
            )}
            {(!status.connected || !status.identified) && (
              <button className="primary" onClick={onConnect}>
                Conectar Google
              </button>
            )}
            {status.connected && status.identified && !status.enabled && (
              <button
                className="primary"
                disabled={busy || !status.google_enabled || status.busy}
                onClick={() => void sync(true, true)}
              >
                Activar y sincronizar horario
              </button>
            )}
            {status.connected &&
              status.identified &&
              (status.enabled || status.pending_count > 0) && (
                <button
                  className="secondary"
                  disabled={busy || !status.google_enabled || status.busy}
                  onClick={() => void sync(false, true)}
                >
                  {busy
                    ? "Sincronizando…"
                    : status.enabled
                      ? "Sincronizar ahora"
                      : "Reintentar retiro de eventos"}
                </button>
              )}
            {status.enabled && (
              <button
                className="link"
                disabled={busy || status.busy}
                onClick={() => setConfirm(true)}
              >
                Desactivar y retirar clases de Calendar
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {confirm && (
        <Modal
          title="Desactivar Calendar del horario"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <div className="stack">
            <p>
              Se retirarán de Google Calendar las series de clases creadas por
              esta conexión. Tus clases, cursos y notas se conservan en Balance.
              Los recordatorios de pagos y los eventos importados por archivo no
              se eliminan.
            </p>
            <p className="muted">
              Si Google no está disponible, el retiro quedará pendiente para
              reintentarlo.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() => void disable()}
            >
              Desactivar y retirar
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
