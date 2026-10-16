import { useEffect, useRef, useState } from "react";
import { req } from "../shared/api";
import { Course, number, studentApi } from "../shared/student";
import Modal from "../shared/Modal";
type Timer = {
  token: string;
  course_id: number | null;
  duration: number;
  remaining: number;
  running_since: number | null;
  logged: boolean;
};
type Session = {
  id: number;
  minutes: number;
  course_title: string | null;
  course_id: number | null;
  day: string;
};
type FocusData = { timer: Timer; sessions: Session[] };
export default function Enfoque() {
  const [data, setData] = useState<FocusData | null>(null),
    [courses, setCourses] = useState<Course[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(Date.now()),
    [reset, setReset] = useState<{
      minutes: number;
      course_id: number | null;
    } | null>(null),
    [manual, setManual] = useState<{
      minutes: string;
      course_id: string;
      request_id: string;
    } | null>(null),
    [removing, setRemoving] = useState<Session | null>(null);
  const snapshot = useRef(Date.now());
  async function load() {
    try {
      const [f, c] = await Promise.all([
        studentApi<FocusData>("/focus"),
        studentApi<Course[]>("/courses"),
      ]);
      snapshot.current = Date.now();
      setTick(Date.now());
      setData(f);
      setCourses(c);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const id = setInterval(() => setTick(Date.now()), 1000);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const remaining = data
    ? Math.max(
        0,
        Math.ceil(
          data.timer.remaining -
            (data.timer.running_since
              ? Math.max(0, tick - snapshot.current) / 1000
              : 0),
        ),
      )
    : 1500;
  async function timerAction(
    action: string,
    minutes?: number,
    course_id?: number | null,
  ) {
    if (!data) return;
    setBusy(true);
    try {
      const t = await req<Timer>("/student/timer", {
        method: "POST",
        body: JSON.stringify({
          token: data.timer.token,
          action,
          minutes: minutes ?? data.timer.duration / 60,
          course_id: course_id === undefined ? data.timer.course_id : course_id,
        }),
      });
      snapshot.current = Date.now();
      setTick(Date.now());
      setData({ ...data, timer: t });
      setReset(null);
      if (action === "log") await load();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function changeTimer(minutes: number, course_id: number | null) {
    if (!data) return;
    if (data.timer.running_since || data.timer.remaining < data.timer.duration)
      setReset({ minutes, course_id });
    else void timerAction("reset", minutes, course_id);
  }
  const totals = new Map<number, { title: string; minutes: number }>();
  data?.sessions.forEach((s) => {
    const id = s.course_id ?? 0;
    totals.set(id, {
      title: s.course_title || "Sin curso",
      minutes: (totals.get(id)?.minutes || 0) + s.minutes,
    });
  });
  const total = data?.sessions.reduce((n, s) => n + s.minutes, 0) || 0;
  return (
    <div className="stack">
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button className="link" onClick={() => void load()}>
            Actualizar
          </button>
        </p>
      )}
      {!data ? (
        <p role="status">
          {error ? "No se pudo cargar enfoque." : "Cargando enfoque…"}
        </p>
      ) : (
        <>
          <section className="panel student-focus">
            <div className="student-button-row student-focus-presets">
              {[
                [25, "Enfoque 25 min"],
                [50, "Profundo 50 min"],
                [5, "Descanso 5 min"],
              ].map(([minutes, label]) => (
                <button
                  key={minutes}
                  className={
                    data.timer.duration === Number(minutes) * 60
                      ? "primary"
                      : "secondary"
                  }
                  disabled={busy}
                  aria-pressed={data.timer.duration === Number(minutes) * 60}
                  onClick={() =>
                    changeTimer(Number(minutes), data.timer.course_id)
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              className="student-timer"
              role="timer"
              aria-label="Tiempo restante"
            >
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:
              {String(remaining % 60).padStart(2, "0")}
            </div>
            <label className="student-focus-course">
              <span className="sr-only">Curso de la sesión</span>
              <select
                aria-label="Curso de la sesión"
                value={data.timer.course_id ?? ""}
                disabled={busy}
                onChange={(e) =>
                  changeTimer(
                    data.timer.duration / 60,
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">Sin curso</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="student-button-row">
              <button
                className="primary"
                disabled={busy || remaining === 0}
                onClick={() =>
                  void timerAction(data.timer.running_since ? "pause" : "start")
                }
              >
                {data.timer.running_since && remaining > 0
                  ? "Pausar"
                  : data.timer.remaining < data.timer.duration
                    ? "Continuar"
                    : "Empezar"}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  changeTimer(data.timer.duration / 60, data.timer.course_id)
                }
              >
                Reiniciar
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  setManual({
                    minutes: "25",
                    course_id: String(data.timer.course_id || ""),
                    request_id: crypto.randomUUID(),
                  })
                }
              >
                Registrar minutos estudiados
              </button>
            </div>
            {remaining === 0 && (
              <p role="status">
                {data.timer.duration === 300
                  ? "Terminó tu descanso."
                  : data.timer.logged
                    ? "Sesión guardada en tu semana."
                    : "Sesión terminada. Puedes guardarla una sola vez."}
              </p>
            )}
            {remaining === 0 &&
              data.timer.duration !== 300 &&
              !data.timer.logged && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void timerAction("log")}
                >
                  Guardar sesión terminada
                </button>
              )}
            <p className="muted student-caption">
              El tiempo se conserva al cambiar de pantalla o recargar. No envía
              alarmas con la app cerrada. Los descansos no suman minutos de
              estudio.
            </p>
          </section>
          <section className="panel">
            <h2>
              Esta semana: {Math.floor(total / 60)} h {total % 60} min de
              estudio
            </h2>
            {totals.size ? (
              <ul className="student-study-totals">
                {Array.from(totals).map(([id, { title, minutes }]) => (
                  <li key={id}>
                    <span>{title}</span>
                    <progress
                      max={Math.max(
                        ...Array.from(totals.values()).map((s) => s.minutes),
                        1,
                      )}
                      value={minutes}
                      aria-label={"Minutos de " + title}
                    />
                    <strong>{number(minutes)} min</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                Tus sesiones guardadas de lunes a hoy aparecerán aquí.
              </p>
            )}
            <details>
              <summary>Ver sesiones de la semana</summary>
              <ul className="student-home-list">
                {data.sessions.map((s) => (
                  <li key={s.id}>
                    <div>
                      <b>
                        {s.course_title || "Sin curso"} · {s.minutes} min
                      </b>
                      <small>{s.day}</small>
                    </div>
                    <button className="link" onClick={() => setRemoving(s)}>
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </>
      )}
      {reset && (
        <Modal
          title="Reiniciar temporizador"
          onClose={() => {
            if (!busy) setReset(null);
          }}
        >
          <div className="stack">
            <p>
              Se descartará el tiempo de este temporizador que no hayas
              guardado. ¿Continuar?
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void timerAction("reset", reset.minutes, reset.course_id)
              }
            >
              Reiniciar ahora
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setReset(null)}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
      {manual && (
        <Modal
          title="Registrar estudio realizado"
          onClose={() => {
            if (!busy) setManual(null);
          }}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await req("/student/focus/sessions", {
                  method: "POST",
                  body: JSON.stringify({
                    minutes: Number(manual.minutes),
                    course_id: manual.course_id
                      ? Number(manual.course_id)
                      : null,
                    request_id: manual.request_id,
                  }),
                });
                setManual(null);
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="muted">
              Anota tiempo que ya dedicaste a estudiar. No es una sesión
              programada.
            </p>
            <label>
              Minutos estudiados
              <input
                type="number"
                min="1"
                max="480"
                required
                value={manual.minutes}
                onChange={(e) =>
                  setManual({ ...manual, minutes: e.target.value })
                }
              />
            </label>
            <label>
              Curso
              <select
                aria-label="Curso"
                value={manual.course_id}
                onChange={(e) =>
                  setManual({ ...manual, course_id: e.target.value })
                }
              >
                <option value="">Sin curso</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Guardar estudio
            </button>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Eliminar sesión de estudio"
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <div className="stack">
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <p>
              Se retirarán estos {removing.minutes} minutos del resumen semanal.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await req("/student/focus/sessions/" + removing.id, {
                    method: "DELETE",
                  });
                  setRemoving(null);
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Eliminar definitivamente
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
