import { useEffect, useState } from "react";
import { req } from "../shared/api";
import {
  dateText,
  moods,
  moodNames,
  number,
  studentApi,
  WellbeingData,
} from "../shared/student";
import MoodPicker from "../shared/MoodPicker";
export default function Bienestar() {
  const [data, setData] = useState<WellbeingData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [prefs, setPrefs] = useState({
      sleep_hours: "8",
      preparation_minutes: "60",
      wake_time: "07:00",
    });
  async function load() {
    try {
      const d = await studentApi<WellbeingData>("/wellbeing");
      setData(d);
      setPrefs({
        sleep_hours: String(d.preferences.sleep_hours),
        preparation_minutes: String(d.preferences.preparation_minutes),
        wake_time: d.preferences.wake_time,
      });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      await req("/student" + path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const clock = (stamp: string) =>
    new Intl.DateTimeFormat("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Lima",
    }).format(new Date(stamp));
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
      {!data ? (
        <p role="status">
          {error ? "No se pudo cargar bienestar." : "Cargando bienestar…"}
        </p>
      ) : (
        <>
          <section className="panel">
            <h2>¿Cómo te sientes hoy?</h2>
            <MoodPicker
              value={data.moods.find((m) => m.day === data.today)?.mood ?? null}
              busy={busy}
              onChange={(mood) => void action("/mood", "PUT", { mood })}
            />
            {data.moods.some((m) => m.day === data.today) && (
              <button
                className="link"
                disabled={busy}
                onClick={() => void action("/mood", "DELETE")}
              >
                Borrar el registro de hoy
              </button>
            )}
            <h3>Tu ánimo de los últimos 7 días</h3>
            <div className="student-mood-week">
              {Array.from({ length: 7 }, (_, i) => {
                const day = new Date(data.today + "T12:00:00Z");
                day.setUTCDate(day.getUTCDate() - 6 + i);
                const iso = day.toISOString().slice(0, 10),
                  m = data.moods.find((m) => m.day === iso);
                return (
                  <div key={iso}>
                    <span
                      aria-label={m ? moodNames[m.mood - 1] : "Sin registro"}
                    >
                      {m ? moods[m.mood - 1] : "·"}
                    </span>
                    <small>{dateText(iso)}</small>
                  </div>
                );
              })}
            </div>
            <p className="muted student-caption">
              Un registro personal para observar cómo te sientes. No asigna
              diagnósticos ni interpreta tu salud.
            </p>
          </section>
          <div className="student-two-columns">
            <section className="panel">
              <h2>Planificador de sueño</h2>
              <p>
                {data.tomorrow_class ? (
                  <>
                    Tu primera clase mañana es{" "}
                    <b>{data.tomorrow_class.title}</b> a las{" "}
                    <b>{data.tomorrow_class.starts}</b>.
                  </>
                ) : (
                  "Mañana no tienes clases registradas."
                )}
              </p>
              <p>
                Para dormir {number(data.preferences.sleep_hours)} horas:
                acuéstate el{" "}
                <b>
                  {new Intl.DateTimeFormat("es-PE", {
                    day: "numeric",
                    month: "short",
                    timeZone: "America/Lima",
                  }).format(new Date(data.bedtime))}{" "}
                  a las {clock(data.bedtime)}
                </b>{" "}
                y levántate a las <b>{clock(data.wake_at)}</b>.
              </p>
              <p className="muted student-caption">
                Usa tu hora habitual de despertar; si hay clase temprano,
                adelanta el despertar para incluir tu preparación y traslado.
              </p>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("/preferences", "PUT", {
                    sleep_hours: Number(prefs.sleep_hours),
                    preparation_minutes: Number(prefs.preparation_minutes),
                    wake_time: prefs.wake_time,
                  });
                }}
              >
                <label>
                  Horas que quieres dormir
                  <input
                    type="number"
                    min="6"
                    max="12"
                    step="0.1"
                    required
                    value={prefs.sleep_hours}
                    onChange={(e) =>
                      setPrefs({ ...prefs, sleep_hours: e.target.value })
                    }
                  />
                </label>
                <label>
                  Hora habitual de despertar
                  <input
                    type="time"
                    required
                    value={prefs.wake_time}
                    onChange={(e) =>
                      setPrefs({ ...prefs, wake_time: e.target.value })
                    }
                  />
                </label>
                <label>
                  Preparación y traslado (minutos)
                  <input
                    type="number"
                    required
                    min="0"
                    max="240"
                    value={prefs.preparation_minutes}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        preparation_minutes: e.target.value,
                      })
                    }
                  />
                </label>
                <button className="secondary" disabled={busy}>
                  Guardar preferencias
                </button>
              </form>
            </section>
            <section className="panel">
              <h2>Tus hábitos, a tu ritmo</h2>
              <strong className="student-large-number">
                {data.habit_opportunities
                  ? Math.round(
                      (100 * data.habit_marks) / data.habit_opportunities,
                    )
                  : 0}
                %
              </strong>
              <p>{data.habit_marks} marcas en los últimos siete días.</p>
              <p className="muted">Un día sin marcar no borra tus avances.</p>
              <p className="muted student-caption">
                Proporción sobre siete días y tus hábitos actuales. No mide tu
                bienestar ni tu valor personal.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
