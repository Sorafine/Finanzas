import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCheck,
  Circle,
  Leaf,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { req } from "../shared/api";
import Modal from "../shared/Modal";
import { Course, studentApi } from "../shared/student";

type Area = "study" | "personal" | "home";
type Task = {
  id: number;
  title: string;
  area: Area;
  due_on: string | null;
  priority: "normal" | "high";
  completed: number;
  course_id: number | null;
  course_title: string | null;
  course_color: string | null;
};
type Habit = { id: number; title: string; days: string[] };
type Overview = {
  today: string;
  week: string[];
  tasks: Task[];
  habits: Habit[];
};
type Editor = {
  kind: "tasks" | "habits";
  id?: number;
  title: string;
  area: Area;
  due_on: string;
  priority: "normal" | "high";
  course_id: string;
};
const areaNames: Record<Area, string> = {
  study: "Estudios",
  personal: "Personal",
  home: "Casa",
};
const shortDate = (day: string) =>
  new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    timeZone: "America/Lima",
  }).format(new Date(day + "T12:00:00-05:00"));
export default function MiDia() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("pending");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [removing, setRemoving] = useState<{
    kind: "tasks" | "habits";
    id: number;
    title: string;
  } | null>(null);
  const [formError, setFormError] = useState("");
  async function load() {
    try {
      const [overview, subjects] = await Promise.all([
        req<Overview>("/organizer"),
        studentApi<Course[]>("/courses"),
      ]);
      setData(overview);
      setCourses(subjects);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !busy) void load();
    };
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, [busy]);
  async function mutate(
    path: string,
    method: string,
    payload?: unknown,
    close?: () => void,
  ) {
    setBusy(true);
    setError("");
    setFormError("");
    try {
      await req(path, {
        method,
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
      close?.();
      await load();
    } catch (e) {
      if (editor || removing) setFormError((e as Error).message);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(kind: "tasks" | "habits", item?: Task | Habit) {
    setFormError("");
    setEditor({
      kind,
      course_id:
        item && "course_id" in item && item.course_id
          ? String(item.course_id)
          : "",
      id: item?.id,
      title: item?.title || "",
      area: item && "area" in item ? item.area : "study",
      due_on: item && "due_on" in item ? item.due_on || "" : "",
      priority: item && "priority" in item ? item.priority : "normal",
    });
  }
  const tasks = data?.tasks || [],
    habits = data?.habits || [];
  const pending = tasks.filter((t) => !t.completed);
  const due = pending.filter(
    (t) => t.due_on && t.due_on <= (data?.today || ""),
  );
  const checked = habits.filter((h) =>
    h.days.includes(data?.today || ""),
  ).length;
  const shown = tasks.filter((t) =>
    filter === "done"
      ? !!t.completed
      : !t.completed &&
        (filter !== "today" || (!!t.due_on && t.due_on <= (data?.today || ""))),
  );
  return (
    <div className="stack day-space">
      <section className="panel day-intro">
        <div>
          <span className="day-eyebrow">Tu espacio para organizarte</span>
          <h2>Un paso a la vez</h2>
          <p className="muted">
            Ordena tus pendientes, prepara tus estudios y construye una rutina a
            tu ritmo.
          </p>
        </div>
        <Leaf size={38} aria-hidden="true" />
      </section>
      {error && (
        <div className="error" role="alert">
          {error}{" "}
          <button className="link" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {!data ? (
        <p role="status">
          {error ? "No se pudo cargar tu día." : "Cargando tu día…"}
        </p>
      ) : (
        <>
          <div className="day-summary" aria-label="Resumen del día">
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
                {checked} / {habits.length}
              </strong>
              <span>{shortDate(data.today)} · horario de Perú</span>
            </div>
          </div>
          <section className="panel">
            <div className="day-section-heading">
              <h2>
                <BookOpen size={21} aria-hidden="true" /> Tareas y estudios
              </h2>
              <button
                className="primary"
                disabled={busy}
                onClick={() => open("tasks")}
              >
                <Plus size={16} /> Nueva tarea
              </button>
            </div>
            <div className="filter-row" aria-label="Filtrar tareas">
              {[
                ["pending", "Pendientes"],
                ["today", "Para hoy"],
                ["done", "Completadas"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={filter === value ? "active" : ""}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {!shown.length && (
              <p className="empty">
                {filter === "done"
                  ? "Aquí aparecerán las tareas que completes."
                  : filter === "today"
                    ? "No tienes tareas pendientes con fecha para hoy o antes."
                    : "Empieza con algo pequeño: una tarea, un examen o un pendiente personal."}
              </p>
            )}
            <ul className="day-list">
              {shown.map((task) => (
                <li
                  key={task.id}
                  className={task.completed ? "day-task done" : "day-task"}
                >
                  <button
                    className="day-check"
                    role="checkbox"
                    aria-checked={!!task.completed}
                    aria-label={
                      (task.completed ? "Reabrir " : "Completar ") + task.title
                    }
                    disabled={busy}
                    onClick={() =>
                      void mutate(`/organizer/tasks/${task.id}`, "PATCH", {
                        completed: !task.completed,
                      })
                    }
                  >
                    {task.completed ? (
                      <CheckCheck size={23} />
                    ) : (
                      <Circle size={23} />
                    )}
                  </button>
                  <div className="grow">
                    <strong>{task.title}</strong>
                    <div className="day-task-meta">
                      <span>{task.course_title || areaNames[task.area]}</span>
                      {task.priority === "high" && (
                        <span className="day-priority">Prioridad alta</span>
                      )}
                      <span>
                        {task.due_on
                          ? (task.due_on < data.today && !task.completed
                              ? "Pendiente desde "
                              : task.due_on === data.today
                                ? "Hoy · "
                                : "Para el ") + shortDate(task.due_on)
                          : "Sin fecha"}
                      </span>
                    </div>
                  </div>
                  <div className="day-item-actions">
                    <button
                      className="icon-button"
                      aria-label={"Editar " + task.title}
                      disabled={busy}
                      onClick={() => open("tasks", task)}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={"Eliminar " + task.title}
                      disabled={busy}
                      onClick={() => {
                        setFormError("");
                        setRemoving({
                          kind: "tasks",
                          id: task.id,
                          title: task.title,
                        });
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <div className="day-section-heading">
              <h2>
                <Leaf size={21} aria-hidden="true" /> Hábitos diarios
              </h2>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => open("habits")}
              >
                <Plus size={16} /> Nuevo hábito
              </button>
            </div>
            <p className="muted">
              Marca lo que hiciste hoy. Cada día es una nueva oportunidad; aquí
              puedes ver tus últimos siete días.
            </p>
            {!habits.length && (
              <p className="empty">
                ¿Leer un rato, preparar la mochila o salir a caminar? Elige una
                rutina que te sirva.
              </p>
            )}
            <ul className="day-list">
              {habits.map((habit) => (
                <li key={habit.id} className="day-habit">
                  <div className="day-habit-heading">
                    <strong>{habit.title}</strong>
                    <div className="day-item-actions">
                      <button
                        className="icon-button"
                        aria-label={"Editar " + habit.title}
                        disabled={busy}
                        onClick={() => open("habits", habit)}
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={"Eliminar " + habit.title}
                        disabled={busy}
                        onClick={() => {
                          setFormError("");
                          setRemoving({
                            kind: "habits",
                            id: habit.id,
                            title: habit.title,
                          });
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                  <div className="day-habit-progress">
                    <div
                      className="habit-week"
                      aria-label={"Últimos siete días de " + habit.title}
                    >
                      {data.week.map((day) => (
                        <span
                          key={day}
                          className={habit.days.includes(day) ? "checked" : ""}
                          title={shortDate(day)}
                          aria-label={
                            shortDate(day) +
                            (habit.days.includes(day)
                              ? ": realizado"
                              : ": sin marcar")
                          }
                        >
                          <small>
                            {new Intl.DateTimeFormat("es-PE", {
                              weekday: "narrow",
                              timeZone: "America/Lima",
                            }).format(new Date(day + "T12:00:00-05:00"))}
                          </small>
                          <span>
                            {habit.days.includes(day) ? (
                              <Check size={15} />
                            ) : (
                              Number(day.slice(8))
                            )}
                          </span>
                        </span>
                      ))}
                    </div>
                    <button
                      className={
                        habit.days.includes(data.today)
                          ? "secondary"
                          : "primary"
                      }
                      aria-pressed={habit.days.includes(data.today)}
                      aria-label={
                        (habit.days.includes(data.today)
                          ? "Hecho hoy: "
                          : "Marcar hoy: ") + habit.title
                      }
                      disabled={busy}
                      onClick={() =>
                        void mutate(`/organizer/habits/${habit.id}`, "PATCH", {
                          completed: !habit.days.includes(data.today),
                        })
                      }
                    >
                      {habit.days.includes(data.today)
                        ? "Hecho hoy"
                        : "Marcar hoy"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {editor && (
        <Modal
          title={
            (editor.id ? "Editar " : "Nueva ") +
            (editor.kind === "tasks"
              ? "tarea"
              : editor.id
                ? "hábito"
                : "rutina diaria")
          }
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editor.title.trim()) {
                setFormError("Escribe un nombre");
                return;
              }
              void mutate(
                `/organizer/${editor.kind}${editor.id ? "/" + editor.id : ""}`,
                editor.id ? "PUT" : "POST",
                editor.kind === "tasks"
                  ? {
                      title: editor.title,
                      area: editor.area,
                      course_id: editor.course_id
                        ? Number(editor.course_id)
                        : null,
                      due_on: editor.due_on || null,
                      priority: editor.priority,
                    }
                  : { title: editor.title },
                () => setEditor(null),
              );
            }}
          >
            <label>
              Nombre
              <input
                required
                maxLength={150}
                value={editor.title}
                onChange={(e) =>
                  setEditor({ ...editor, title: e.target.value })
                }
                placeholder={
                  editor.kind === "tasks"
                    ? "Preparar el examen de matemática"
                    : "Leer 15 minutos"
                }
              />
            </label>
            {editor.kind === "tasks" && (
              <>
                <label>
                  Área
                  <select
                    aria-label="Área"
                    value={editor.area}
                    onChange={(e) =>
                      setEditor({ ...editor, area: e.target.value as Area })
                    }
                  >
                    {Object.entries(areaNames).map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Curso (opcional)
                  <select
                    aria-label="Curso de la tarea"
                    value={editor.course_id}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        course_id: e.target.value,
                        area: e.target.value ? "study" : editor.area,
                      })
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
                <label>
                  Fecha límite (opcional)
                  <input
                    type="date"
                    min="2000-01-01"
                    max="2100-12-31"
                    value={editor.due_on}
                    onChange={(e) =>
                      setEditor({ ...editor, due_on: e.target.value })
                    }
                  />
                </label>
                <label>
                  Prioridad
                  <select
                    aria-label="Prioridad"
                    value={editor.priority}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        priority: e.target.value as "normal" | "high",
                      })
                    }
                  >
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                  </select>
                </label>
              </>
            )}
            {editor.kind === "habits" && (
              <p className="muted">
                Se repite cada día. Podrás marcarlo o desmarcarlo durante el día
                actual, en horario de Perú.
              </p>
            )}
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          title={
            removing.kind === "tasks" ? "Eliminar tarea" : "Eliminar hábito"
          }
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <div className="stack">
            <p>
              Se eliminará «{removing.title}»
              {removing.kind === "habits"
                ? " y sus marcas de los días anteriores"
                : ""}
              . Esta acción no se puede deshacer.
            </p>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void mutate(
                  `/organizer/${removing.kind}/${removing.id}`,
                  "DELETE",
                  undefined,
                  () => setRemoving(null),
                )
              }
            >
              {busy ? "Eliminando…" : "Eliminar definitivamente"}
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
