import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import { req, localToday } from "../shared/api";
import { ClassTime, Course, studentApi, weekdays } from "../shared/student";
import Modal from "../shared/Modal";
import StudentCalendar, {
  StudentCalendarStatus,
} from "../shared/StudentCalendar";
type Editor = {
  id?: number;
  course_id: string;
  weekday: string;
  starts: string;
  ends: string;
  room: string;
};
export default function Horario({ onConnect }: { onConnect: () => void }) {
  const [revision, setRevision] = useState(0),
    [calendar, setCalendar] = useState<StudentCalendarStatus | null>(null),
    [notice, setNotice] = useState("");
  const [classes, setClasses] = useState<ClassTime[]>([]),
    [courses, setCourses] = useState<Course[]>([]),
    [editor, setEditor] = useState<Editor | null>(null),
    [removing, setRemoving] = useState<ClassTime | null>(null),
    [error, setError] = useState(""),
    [formError, setFormError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  async function load() {
    try {
      const [c, s] = await Promise.all([
        studentApi<Course[]>("/courses"),
        studentApi<ClassTime[]>("/classes"),
      ]);
      setCourses(c);
      setClasses(s);
      setRevision((v) => v + 1);
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
  function open(c?: ClassTime) {
    setFormError("");
    setEditor({
      id: c?.id,
      course_id: String(c?.course_id || courses[0]?.id || ""),
      weekday: String(c?.weekday ?? 0),
      starts: c?.starts || "08:00",
      ends: c?.ends || "10:00",
      room: c?.room || "",
    });
  }
  async function save() {
    if (!editor) return;
    setBusy(true);
    setFormError("");
    try {
      const result = await req<{
        calendar_sync?: { pending: boolean; message?: string };
      }>("/student/classes" + (editor.id ? "/" + editor.id : ""), {
        method: editor.id ? "PUT" : "POST",
        body: JSON.stringify({
          course_id: Number(editor.course_id),
          weekday: Number(editor.weekday),
          starts: editor.starts,
          ends: editor.ends,
          room: editor.room,
        }),
      });
      setEditor(null);
      setNotice(
        result.calendar_sync?.pending
          ? "Guardado en Balance. Calendar pendiente: " +
              (result.calendar_sync.message || "reintenta la sincronización")
          : "Clase guardada.",
      );
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportCalendar() {
    const esc = (s: string) =>
      s
        .replace(/\\/g, "\\\\")
        .replace(/\r?\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
    const today = new Date(localToday() + "T12:00:00Z");
    const weekday = (today.getUTCDay() + 6) % 7;
    const events = classes.map((c) => {
      const day = new Date(today);
      day.setUTCDate(day.getUTCDate() + ((c.weekday - weekday + 7) % 7));
      const stamp = day.toISOString().slice(0, 10).replace(/-/g, "");
      return [
        "BEGIN:VEVENT",
        "UID:" + crypto.randomUUID() + "@balance.local",
        "DTSTAMP:" +
          new Date()
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}/, ""),
        "DTSTART;TZID=America/Lima:" +
          stamp +
          "T" +
          c.starts.replace(":", "") +
          "00",
        "DTEND;TZID=America/Lima:" +
          stamp +
          "T" +
          c.ends.replace(":", "") +
          "00",
        "RRULE:FREQ=WEEKLY;COUNT=16",
        "SUMMARY:" + esc(c.course_title),
        "LOCATION:" + esc(c.room),
        "END:VEVENT",
      ].join("\r\n");
    });
    const file = new Blob(
      [
        [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//Balance//Horario//ES",
          "CALSCALE:GREGORIAN",
          ...events,
          "END:VCALENDAR",
          "",
        ].join("\r\n"),
      ],
      { type: "text/calendar;charset=utf-8" },
    );
    const url = URL.createObjectURL(file),
      a = document.createElement("a");
    a.href = url;
    a.download = "balance-horario-16-semanas.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const todayWeekday =
    (new Date(localToday() + "T12:00:00Z").getUTCDay() + 6) % 7;
  return (
    <div className="stack">
      <StudentCalendar
        revision={revision}
        onConnect={onConnect}
        onStatus={setCalendar}
      />
      {notice && (
        <p className="success-msg" role="status">
          {notice}
        </p>
      )}
      <div className="student-toolbar">
        <p className="muted">
          Clases semanales · horario de Perú. Crea tus cursos antes de añadir
          clases.
        </p>
        <div className="student-button-row">
          <button
            className="secondary"
            disabled={!classes.length}
            onClick={exportCalendar}
          >
            <Download size={16} /> Exportar 16 semanas
          </button>
          <button
            className="primary"
            disabled={!courses.length}
            onClick={() => open()}
          >
            <Plus size={16} /> Agregar clase
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button className="link" onClick={() => void load()}>
            Reintentar
          </button>
        </p>
      )}
      {!courses.length && !loading && (
        <p className="panel empty">
          Primero añade una materia en Cursos y notas.
        </p>
      )}
      {loading ? (
        <p role="status">Cargando horario…</p>
      ) : (
        <div className="student-timetable">
          {weekdays.map((name, i) => (
            <section
              key={name}
              className={
                "student-weekday " + (todayWeekday === i ? "is-today" : "")
              }
            >
              <h2>
                {name}
                {todayWeekday === i ? " · hoy" : ""}
              </h2>
              {classes
                .filter((c) => c.weekday === i)
                .map((c) => (
                  <article
                    className="panel student-class"
                    key={c.id}
                    style={{ borderLeftColor: c.color }}
                  >
                    <strong>{c.course_title}</strong>
                    {calendar?.enabled && (
                      <small className="student-calendar-class-state">
                        {calendar.connected &&
                        calendar.classes.some(
                          (s) => s.class_id === c.id && s.synced,
                        )
                          ? "Calendar: sincronizado"
                          : "Calendar: pendiente"}
                      </small>
                    )}
                    <p>
                      {c.starts}–{c.ends}
                    </p>
                    {c.room && <small>{c.room}</small>}
                    <div className="student-button-row">
                      <button
                        className="icon-button"
                        aria-label={
                          "Editar clase " + c.course_title + " " + name
                        }
                        onClick={() => open(c)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={
                          "Eliminar clase " + c.course_title + " " + name
                        }
                        onClick={() => {
                          setFormError("");
                          setRemoving(c);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              {!classes.some((c) => c.weekday === i) && (
                <p className="muted student-caption">Sin clases</p>
              )}
            </section>
          ))}
        </div>
      )}
      <p className="muted student-caption">
        La exportación crea un archivo .ics con 16 ocurrencias por clase. Puedes
        importarlo en Google Calendar u otro calendario. Si activas la conexión,
        no importes también el archivo: duplicaría las clases. Los eventos
        importados por archivo no se vinculan automáticamente.
      </p>
      {editor && (
        <Modal
          title={editor.id ? "Editar clase" : "Nueva clase"}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label>
              Curso
              <select
                aria-label="Curso"
                required
                value={editor.course_id}
                onChange={(e) =>
                  setEditor({ ...editor, course_id: e.target.value })
                }
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Día
              <select
                aria-label="Día"
                value={editor.weekday}
                onChange={(e) =>
                  setEditor({ ...editor, weekday: e.target.value })
                }
              >
                {weekdays.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Inicio
              <input
                type="time"
                required
                value={editor.starts}
                onChange={(e) =>
                  setEditor({ ...editor, starts: e.target.value })
                }
              />
            </label>
            <label>
              Fin
              <input
                type="time"
                required
                value={editor.ends}
                onChange={(e) => setEditor({ ...editor, ends: e.target.value })}
              />
            </label>
            <label>
              Aula o enlace (opcional)
              <input
                maxLength={100}
                value={editor.room}
                onChange={(e) => setEditor({ ...editor, room: e.target.value })}
              />
            </label>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Guardando…" : "Guardar clase"}
            </button>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Eliminar clase"
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <div className="stack">
            <p>
              ¿Eliminar esta clase de {removing.course_title} del horario? Si
              está vinculada a Google Calendar, también se retirará su serie de
              clases.
            </p>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await req("/student/classes/" + removing.id, {
                    method: "DELETE",
                  });
                  setRemoving(null);
                  await load();
                } catch (e) {
                  setFormError((e as Error).message);
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
