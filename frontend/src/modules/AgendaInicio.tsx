import { useEffect, useState } from "react";
import { Availability, money, req } from "../shared/api";
import {
  ClassTime,
  Course,
  DayOverview,
  dateText,
  studentApi,
  WellbeingData,
} from "../shared/student";
import MoodPicker from "../shared/MoodPicker";
export default function AgendaInicio({
  onTasks,
  onSchedule,
  onCourses,
  onFinance,
  onFocus,
  onWellbeing,
}: {
  onTasks: () => void;
  onSchedule: () => void;
  onCourses: () => void;
  onFinance: () => void;
  onFocus: () => void;
  onWellbeing: () => void;
}) {
  const [day, setDay] = useState<DayOverview | null>(null),
    [classes, setClasses] = useState<ClassTime[]>([]),
    [courses, setCourses] = useState<Course[]>([]),
    [wellbeing, setWellbeing] = useState<WellbeingData | null>(null),
    [moneyData, setMoneyData] = useState<Availability | null>(null),
    [error, setError] = useState(""),
    [moneyError, setMoneyError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [d, c, w, g] = await Promise.all([
        req<DayOverview>("/organizer"),
        studentApi<ClassTime[]>("/classes"),
        studentApi<WellbeingData>("/wellbeing"),
        studentApi<Course[]>("/courses"),
      ]);
      setDay(d);
      setClasses(c);
      setWellbeing(w);
      setCourses(g);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    void req<Availability>("/availability")
      .then(setMoneyData)
      .catch((e) => setMoneyError(e.message));
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => clearInterval(id);
  }, []);
  const pending = day?.tasks.filter((t) => !t.completed) || [],
    due = pending.filter((t) => t.due_on && t.due_on <= day!.today),
    checked = day?.habits.filter((h) => h.days.includes(day.today)).length || 0;
  const weekday = day
      ? (new Date(day.today + "T12:00:00Z").getUTCDay() + 6) % 7
      : -1,
    todayClasses = classes.filter((c) => c.weekday === weekday),
    upcoming = pending.filter((t) => t.due_on).slice(0, 4),
    risk = courses.filter((c) =>
      ["at_risk", "unreachable", "failed"].includes(c.projection.status),
    );
  return (
    <div className="stack">
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button className="link" onClick={() => void load()}>
            Reintentar
          </button>
        </p>
      )}
      {!day ? (
        <p role="status">
          {error ? "No se pudo cargar tu agenda." : "Cargando tu espacio…"}
        </p>
      ) : (
        <>
          <section className="panel day-intro">
            <div>
              <span className="day-eyebrow">Tu espacio para organizarte</span>
              <h2>Un paso a la vez</h2>
              <p className="muted">
                Hoy tienes {todayClasses.length} clases, {due.length} pendientes
                para hoy o antes y {checked} de {day.habits.length} hábitos
                hechos.
              </p>
            </div>
            <span className="student-leaf" aria-hidden="true">
              🌿
            </span>
          </section>
          <div className="student-button-row">
            <button className="secondary" onClick={onFocus}>
              Sesión de enfoque
            </button>
            <button className="secondary" onClick={onWellbeing}>
              Mi bienestar
            </button>
          </div>
          <div className="day-summary">
            <div className="panel">
              <small>Pendientes</small>
              <strong>{pending.length}</strong>
              <span>En todas tus áreas</span>
            </div>
            <div className="panel">
              <small>Para hoy o antes</small>
              <strong>{due.length}</strong>
              <span>Elige por dónde empezar</span>
            </div>
            <div className="panel">
              <small>Hábitos de hoy</small>
              <strong>
                {checked} / {day.habits.length}
              </strong>
              <span>{dateText(day.today)} · Perú</span>
            </div>
          </div>
          <div className="student-two-columns">
            <section className="panel">
              <div className="day-section-heading">
                <h2>Tu día</h2>
                <button className="link" onClick={onSchedule}>
                  Ver horario
                </button>
              </div>
              {todayClasses.length ? (
                <ul className="student-home-list">
                  {todayClasses.map((c) => (
                    <li key={c.id}>
                      <strong>{c.starts}</strong>
                      <div>
                        <b>{c.course_title}</b>
                        <small>
                          {c.room || "Sin aula"} · hasta las {c.ends}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No tienes clases registradas para hoy.</p>
              )}
            </section>
            <section className="panel">
              <div className="day-section-heading">
                <h2>Próximas entregas</h2>
                <button className="link" onClick={onTasks}>
                  Ver agenda
                </button>
              </div>
              {upcoming.length ? (
                <ul className="student-home-list">
                  {upcoming.map((t) => (
                    <li key={t.id}>
                      <button
                        className="day-check"
                        aria-label={"Completar " + t.title}
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await req("/organizer/tasks/" + t.id, {
                              method: "PATCH",
                              body: JSON.stringify({ completed: true }),
                            });
                            await load();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        ○
                      </button>
                      <div>
                        <b>{t.title}</b>
                        <small>
                          {t.course_title || "Personal"} ·{" "}
                          {t.due_on! < day.today
                            ? "Venció el "
                            : t.due_on === day.today
                              ? "Hoy · "
                              : "Para el "}
                          {dateText(t.due_on!)}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  No tienes entregas con fecha pendientes.
                </p>
              )}
            </section>
          </div>
          {!!risk.length && (
            <section className="panel">
              <div className="day-section-heading">
                <h2>Revisa tus cursos</h2>
                <button className="secondary" onClick={onCourses}>
                  Ver notas y cálculo
                </button>
              </div>
              <p>
                {risk.map((c) => c.title).join(", ")}: revisa las notas
                registradas y lo que necesitas en las evaluaciones pendientes.
              </p>
            </section>
          )}
          <div className="student-two-columns">
            <section className="panel">
              <h2>¿Cómo te sientes hoy?</h2>
              <MoodPicker
                value={
                  wellbeing?.moods.find((m) => m.day === day.today)?.mood ??
                  null
                }
                busy={busy}
                onChange={async (mood) => {
                  setBusy(true);
                  try {
                    await req("/student/mood", {
                      method: "PUT",
                      body: JSON.stringify({ mood }),
                    });
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </section>
            <section className="panel">
              <h2>Tu dinero</h2>
              {moneyData ? (
                <>
                  <strong className="student-large-number">
                    {money(moneyData.balance_cents)}
                  </strong>
                  <p className="muted">
                    Libre para gastar: {money(moneyData.available_cents)}
                  </p>
                </>
              ) : (
                <p className="muted">
                  {moneyError
                    ? "No se pudo consultar el resumen financiero."
                    : "Consultando tu resumen…"}
                </p>
              )}
              <button className="secondary" onClick={onFinance}>
                Ver en Mis finanzas
              </button>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
