import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { req } from "../shared/api";
import { Assessment, Course, number, studentApi } from "../shared/student";
import Modal from "../shared/Modal";
const statusLabels: Record<string, string> = {
  incomplete_plan: "Completa tus evaluaciones",
  no_grades: "Aún sin notas",
  on_track: "Vas encaminado",
  at_risk: "En riesgo: puedes recuperarte",
  unreachable: "No alcanza con lo pendiente",
  secured: "Aprobación asegurada por promedio",
  passed: "Aprobado",
  failed: "Desaprobado",
};
const precise = (value: number) =>
  new Intl.NumberFormat("es-PE", { maximumFractionDigits: 6 }).format(value);
const blankCourse = {
  title: "",
  color: "#5b93da",
  maximum: "20",
  passing: "11",
  rounding: "half_up_integer",
};
type CourseForm = typeof blankCourse & { id?: number };
type AssessmentForm = {
  course: Course;
  id?: number;
  title: string;
  weight: string;
  grade: string;
};
export default function Cursos() {
  const [courses, setCourses] = useState<Course[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [formError, setFormError] = useState(""),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<CourseForm | null>(null),
    [evaluation, setEvaluation] = useState<AssessmentForm | null>(null),
    [removing, setRemoving] = useState<{
      path: string;
      title: string;
      course: boolean;
    } | null>(null);
  async function load() {
    try {
      setCourses(await studentApi<Course[]>("/courses"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(
    path: string,
    method: string,
    body: unknown,
    close: () => void,
  ) {
    setBusy(true);
    setFormError("");
    try {
      const result = await req<{
        calendar_sync?: { pending: boolean; message?: string };
      }>("/student" + path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      setNotice(
        result.calendar_sync?.pending
          ? "Guardado en Balance. Calendar pendiente: " +
              (result.calendar_sync.message || "reintenta desde Horario")
          : "",
      );
      close();
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function editAssessment(course: Course, a?: Assessment) {
    setFormError("");
    setEvaluation({
      course,
      id: a?.id,
      title: a?.title || "",
      weight: a ? String(a.weight) : "",
      grade: a?.grade == null ? "" : String(a.grade),
    });
  }
  return (
    <div className="stack student-courses">
      {notice && (
        <p className="success-msg" role="status">
          {notice}
        </p>
      )}
      <div className="student-toolbar">
        <p className="muted">
          Tu regla inicial: 11 de 20, redondeando desde 10.5. Puedes ajustarla
          por curso.
        </p>
        <button
          className="primary"
          onClick={() => {
            setFormError("");
            setEditor({ ...blankCourse });
          }}
        >
          <Plus size={17} /> Agregar curso
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button className="link" onClick={() => void load()}>
            Reintentar
          </button>
        </p>
      )}
      {loading ? (
        <p role="status">Cargando cursos…</p>
      ) : !courses.length ? (
        <div className="panel empty">
          Añade tu primer curso y sus evaluaciones para calcular cuánto
          necesitas para aprobar.
        </div>
      ) : (
        <div className="student-course-grid">
          {courses.map((c) => {
            const p = c.projection;
            return (
              <section
                key={c.id}
                className="panel student-course"
                style={{ borderTopColor: c.color }}
              >
                <div className="student-course-heading">
                  <h2>
                    <span
                      className="course-dot"
                      style={{ background: c.color }}
                    />
                    {c.title}
                  </h2>
                  <strong>
                    {p.average === null ? "—" : number(p.average)}
                    <small> / {number(c.maximum)}</small>
                  </strong>
                </div>
                <div className="student-course-actions">
                  <button
                    className="link"
                    aria-label={"Editar curso " + c.title}
                    onClick={() => {
                      setFormError("");
                      setEditor({
                        id: c.id,
                        title: c.title,
                        color: c.color,
                        maximum: String(c.maximum),
                        passing: String(c.passing),
                        rounding: c.rounding,
                      });
                    }}
                  >
                    <Pencil size={15} /> Ajustes
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Eliminar curso " + c.title}
                    onClick={() => {
                      setFormError("");
                      setRemoving({
                        path: "/courses/" + c.id,
                        title: c.title,
                        course: true,
                      });
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <progress
                  max={100}
                  value={p.evaluated_weight}
                  aria-label={"Porcentaje evaluado de " + c.title}
                />
                <p className="muted student-caption">
                  {number(p.evaluated_weight)}% evaluado · promedio de lo
                  evaluado
                </p>
                <ul className="student-assessments">
                  {c.assessments.map((a) => (
                    <li key={a.id}>
                      <button
                        className="student-assessment-edit"
                        aria-label={
                          "Editar evaluación " + a.title + " de " + c.title
                        }
                        onClick={() => editAssessment(c, a)}
                      >
                        <span>
                          {a.title} <small>({number(a.weight)}%)</small>
                        </span>
                        <strong>
                          {a.grade === null ? "Pendiente" : number(a.grade)}
                        </strong>
                      </button>
                      <button
                        className="icon-button"
                        aria-label={
                          "Eliminar evaluación " + a.title + " de " + c.title
                        }
                        onClick={() => {
                          setFormError("");
                          setRemoving({
                            path: `/courses/${c.id}/assessments/${a.id}`,
                            title: a.title,
                            course: false,
                          });
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
                <button className="secondary" onClick={() => editAssessment(c)}>
                  <Plus size={15} /> Agregar evaluación
                </button>
                <div className={"grade-result grade-" + p.status} role="status">
                  <strong>{statusLabels[p.status]}</strong>
                  {p.status === "incomplete_plan" ? (
                    <p>
                      Los pesos suman {number(p.total_weight)}%. Completa el
                      100% para calcular la aprobación.
                    </p>
                  ) : p.status === "passed" || p.status === "failed" ? (
                    <p>
                      Promedio final: <b>{number(p.final_grade ?? 0)}</b>.
                      Acumulado sin redondear: {precise(p.earned_points)}.
                    </p>
                  ) : p.status === "secured" ? (
                    <p>
                      Ya acumulaste {precise(p.earned_points)} puntos. Aun con
                      cero en lo pendiente alcanzas la nota mínima por promedio.
                    </p>
                  ) : p.status === "unreachable" ? (
                    <p>
                      Incluso con {number(c.maximum)} en todo lo pendiente
                      llegarías a {precise(p.maximum_final ?? 0)} antes del
                      redondeo. Revisa si tu institución ofrece recuperación.
                    </p>
                  ) : (
                    <p>
                      Para aprobar necesitas{" "}
                      <b>{number(p.required_average ?? 0)}</b> de promedio
                      ponderado en el <b>{number(p.remaining_weight)}%</b> que
                      falta.
                    </p>
                  )}
                  <small>
                    Mínima: {number(c.passing)} ·{" "}
                    {c.rounding === "half_up_integer"
                      ? "Redondeo entero desde .5"
                      : "Sin redondeo"}
                  </small>
                </div>
                <details className="student-caption">
                  <summary>¿Cómo se calcula?</summary>
                  <p>
                    Se suma nota × peso de cada evaluación. Las notas vacías
                    quedan pendientes; un cero cuenta como evaluado. Solo se
                    aplica el redondeo al resultado final. La nota necesaria se
                    muestra redondeada hacia arriba a dos decimales. No incluye
                    reglas adicionales de asistencia, mínimos por examen o
                    sustitutorios.
                  </p>
                </details>
              </section>
            );
          })}
        </div>
      )}
      {editor && (
        <Modal
          title={editor.id ? "Editar curso" : "Nuevo curso"}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save(
                "/courses" + (editor.id ? "/" + editor.id : ""),
                editor.id ? "PUT" : "POST",
                {
                  title: editor.title,
                  color: editor.color,
                  maximum: Number(editor.maximum),
                  passing: Number(editor.passing),
                  rounding: editor.rounding,
                },
                () => setEditor(null),
              );
            }}
          >
            <label>
              Nombre del curso
              <input
                required
                maxLength={150}
                value={editor.title}
                onChange={(e) =>
                  setEditor({ ...editor, title: e.target.value })
                }
              />
            </label>
            <label>
              Color
              <input
                type="color"
                value={editor.color}
                onChange={(e) =>
                  setEditor({ ...editor, color: e.target.value })
                }
              />
            </label>
            <label>
              Nota máxima
              <input
                type="number"
                required
                min="1"
                max="100"
                step="0.01"
                value={editor.maximum}
                onChange={(e) =>
                  setEditor({ ...editor, maximum: e.target.value })
                }
              />
            </label>
            <label>
              Nota para aprobar
              <input
                type="number"
                required
                min="0.01"
                max={editor.maximum}
                step="0.01"
                value={editor.passing}
                onChange={(e) =>
                  setEditor({ ...editor, passing: e.target.value })
                }
              />
            </label>
            <label>
              Redondeo final
              <select
                aria-label="Redondeo final"
                value={editor.rounding}
                onChange={(e) =>
                  setEditor({ ...editor, rounding: e.target.value })
                }
              >
                <option value="half_up_integer">
                  Al entero: 10.5 se convierte en 11
                </option>
                <option value="none">Sin redondeo</option>
              </select>
            </label>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Guardando…" : "Guardar curso"}
            </button>
          </form>
        </Modal>
      )}
      {evaluation && (
        <Modal
          title={evaluation.id ? "Editar evaluación" : "Nueva evaluación"}
          onClose={() => {
            if (!busy) setEvaluation(null);
          }}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save(
                `/courses/${evaluation.course.id}/assessments` +
                  (evaluation.id ? "/" + evaluation.id : ""),
                evaluation.id ? "PUT" : "POST",
                {
                  title: evaluation.title,
                  weight: Number(evaluation.weight),
                  grade:
                    evaluation.grade === "" ? null : Number(evaluation.grade),
                },
                () => setEvaluation(null),
              );
            }}
          >
            <p className="muted">{evaluation.course.title}</p>
            <label>
              Nombre de la evaluación
              <input
                required
                maxLength={150}
                value={evaluation.title}
                onChange={(e) =>
                  setEvaluation({ ...evaluation, title: e.target.value })
                }
              />
            </label>
            <label>
              Peso (%)
              <input
                required
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={evaluation.weight}
                onChange={(e) =>
                  setEvaluation({ ...evaluation, weight: e.target.value })
                }
              />
            </label>
            <label>
              Nota (vacío si está pendiente)
              <input
                type="number"
                min="0"
                max={evaluation.course.maximum}
                step="0.01"
                value={evaluation.grade}
                onChange={(e) =>
                  setEvaluation({ ...evaluation, grade: e.target.value })
                }
              />
            </label>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Guardando…" : "Guardar evaluación"}
            </button>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Confirmar eliminación"
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <div className="stack">
            <p>
              Eliminar «{removing.title}»
              {removing.course
                ? " también elimina sus evaluaciones y clases, y retira sus series vinculadas en Google Calendar. Sus tareas y sesiones de estudio se conservan sin curso"
                : ""}
              . No se puede deshacer.
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
                void save(removing.path, "DELETE", undefined, () =>
                  setRemoving(null),
                )
              }
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
