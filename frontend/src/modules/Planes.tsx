import { useEffect, useState } from "react";
import { Account, req, money, cents } from "../shared/api";
type Scheduled = {
  id: number;
  name: string;
  amount_cents: number;
  due_date: string;
  frequency: string;
  account_id: number;
  category: string;
  active: number;
};
type Goal = {
  id: number;
  name: string;
  target_cents: number;
  saved_cents: number;
  target_date: string | null;
};
export default function Planes({ accounts }: { accounts: Account[] }) {
  const [plans, setPlans] = useState<Scheduled[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [busy, setBusy] = useState(false);
  const [sync, setSync] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [account, setAccount] = useState("");
  const [goalName, setGoalName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [contributions, setContributions] = useState<Record<number, string>>(
    {},
  );
  const refresh = async () => {
    const [p, g] = await Promise.all([
      req<Scheduled[]>("/scheduled"),
      req<Goal[]>("/goals"),
    ]);
    setPlans(p);
    setGoals(g);
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!account && accounts.length) setAccount(String(accounts[0].id));
  }, [accounts, account]);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      setError("");
      setNotice("");
      await action();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="plans-module">
      <h2>Pagos y metas</h2>
      <p className="muted">
        Ten a mano tus suscripciones, próximos pagos y objetivos. Programar un
        pago no descuenta tu saldo.
      </p>
      {error && <p className="error">{error}</p>}
      {notice && <p className="success-msg">{notice}</p>}
      <section className="panel">
        <h2>Próximos pagos y membresías</h2>
        {plans.length ? (
          plans.map((p) => (
            <div className="movement" key={p.id}>
              <div className="grow">
                <strong>{p.name}</strong>
                <small>
                  {p.due_date} ·{" "}
                  {
                    (
                      {
                        once: "Único",
                        weekly: "Semanal",
                        monthly: "Mensual",
                        yearly: "Anual",
                      } as Record<string, string>
                    )[p.frequency]
                  }{" "}
                  · {p.active ? "Activo" : "Pausado"}
                </small>
              </div>
              <b>{money(p.amount_cents)}</b>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (p.active)
                      await req(`/google/calendar/reminder/${p.id}`, {
                        method: "DELETE",
                      });
                    await req(`/scheduled/${p.id}/toggle`, { method: "PATCH" });
                    setNotice(
                      p.active
                        ? "Pago pausado y recordatorio quitado de Calendar."
                        : "Pago activado. Pulsa Recordar en Calendar para sincronizarlo.",
                    );
                  })
                }
              >
                {p.active ? "Pausar" : "Activar"}
              </button>
              <button
                className="secondary"
                disabled={busy || !p.active}
                type="button"
                onClick={() =>
                  void run(async () => {
                    await req(`/google/calendar/reminder`, {
                      method: "POST",
                      body: JSON.stringify({ scheduled_id: p.id }),
                    });
                    setNotice(
                      "Recordatorio recurrente sincronizado con Calendar",
                    );
                  })
                }
              >
                Recordar en Calendar
              </button>
            </div>
          ))
        ) : (
          <p className="muted">Aún no tienes pagos programados.</p>
        )}
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const plan = await req<Scheduled>("/scheduled", {
                method: "POST",
                body: JSON.stringify({
                  name,
                  amount_cents: cents(amount),
                  due_date: due,
                  frequency,
                  account_id: Number(account),
                  category: "Otros",
                }),
              });
              setName("");
              setAmount("");
              setDue("");
              setNotice("Próximo pago guardado");
              if (sync) {
                try {
                  await req("/google/calendar/reminder", {
                    method: "POST",
                    body: JSON.stringify({ scheduled_id: plan.id }),
                  });
                  setNotice("Pago guardado y recordatorio añadido a Calendar");
                } catch {
                  setNotice(
                    "Pago guardado. Conecta Google y pulsa Recordar en Calendar para completar la sincronización.",
                  );
                }
              }
            });
          }}
        >
          <h3>Agregar gasto fijo o próximo pago</h3>
          <label>
            Concepto
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Gimnasio"
            />
          </label>
          <div className="field-pair">
            <label>
              Importe S/
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Próximo vencimiento
              <input
                required
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
          </div>
          <div className="field-pair">
            <label>
              Frecuencia
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                <option value="once">Una vez</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
            </label>
            <label>
              Cuenta
              <select
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              >
                {accounts.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={sync}
              onChange={(e) => setSync(e.target.checked)}
            />{" "}
            Añadir recordatorio a Google Calendar
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar próximo pago"}
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Metas de ahorro</h2>
        {goals.map((g) => (
          <div className="goal-entry" key={g.id}>
            <strong>
              {g.name} — {money(g.saved_cents)} / {money(g.target_cents)}
            </strong>
            <div className="progress">
              <i
                style={{
                  width: `${Math.min(100, (100 * g.saved_cents) / g.target_cents)}%`,
                }}
              />
            </div>
            <small>
              {g.target_date
                ? `Objetivo: ${g.target_date}`
                : "Sin fecha límite"}
            </small>
            <div className="quick-line">
              <input
                aria-label={`Aporte a ${g.name}`}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Aporte S/"
                value={contributions[g.id] || ""}
                onChange={(e) =>
                  setContributions({ ...contributions, [g.id]: e.target.value })
                }
              />
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await req(`/goals/${g.id}/contribute`, {
                      method: "POST",
                      body: JSON.stringify({
                        amount_cents: cents(contributions[g.id]),
                      }),
                    });
                    setContributions({ ...contributions, [g.id]: "" });
                  })
                }
              >
                Registrar aporte
              </button>
            </div>
          </div>
        ))}
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await req("/goals", {
                method: "POST",
                body: JSON.stringify({
                  name: goalName,
                  target_cents: cents(target),
                  target_date: deadline || null,
                }),
              });
              setGoalName("");
              setTarget("");
              setDeadline("");
            });
          }}
        >
          <h3>Nueva meta</h3>
          <label>
            ¿Para qué ahorrarás?
            <input
              required
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              placeholder="Ej. Laptop"
            />
          </label>
          <div className="field-pair">
            <label>
              Objetivo S/
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </label>
            <label>
              Fecha opcional
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
          </div>
          <button className="primary" disabled={busy}>
            Crear meta
          </button>
        </form>
        <p className="hint">
          Los aportes reflejan progreso, pero aún no trasladan fondos de una
          cuenta. Esa conexión se desarrollará después.
        </p>
      </section>
    </div>
  );
}
