import { useEffect, useState } from "react";
import { CalendarDays, Plus, CheckCircle2 } from "lucide-react";
import {
  Account,
  Scheduled,
  req,
  money,
  cents,
  dateLabel,
  localToday,
  frequencyLabel,
} from "../shared/api";
import Modal from "../shared/Modal";
import Historial from "./Historial";
type Plan = Scheduled & { completed?: number };
export default function Planes({
  accounts,
  reload,
  onRegister,
}: {
  accounts: Account[];
  reload: () => Promise<void>;
  onRegister: () => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("pending");
  const [create, setCreate] = useState(false),
    [pay, setPay] = useState<Plan | null>(null),
    [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [due, setDue] = useState(""),
    [frequency, setFrequency] = useState("monthly"),
    [account, setAccount] = useState(String(accounts[0]?.id || "")),
    [sync, setSync] = useState(false),
    [formError, setFormError] = useState("");
  const [paidAmount, setPaidAmount] = useState(""),
    [paidAccount, setPaidAccount] = useState("");
  async function refresh() {
    setPlans(await req<Plan[]>("/scheduled"));
  }
  useEffect(() => {
    void refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setFormError("");
    setNotice("");
    try {
      await action();
      await refresh();
      await reload();
    } catch (e) {
      const message = (e as Error).message;
      if (create || pay) setFormError(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }
  function openPay(p: Plan) {
    setPay(p);
    setPaidAmount(String(p.amount_cents / 100));
    setPaidAccount(String(p.account_id));
    setFormError("");
  }
  async function confirmPay() {
    if (!pay) return;
    const result = await req<{
      already_paid: boolean;
      next_due_date?: string | null;
    }>(`/scheduled/${pay.id}/pay`, {
      method: "POST",
      body: JSON.stringify({
        due_date: pay.due_date,
        account_id: Number(paidAccount),
        amount_cents: cents(paidAmount),
      }),
    });
    let text = result.already_paid
      ? "Este vencimiento ya estaba registrado. No se descontó otra vez."
      : "Pago registrado. El gasto ya aparece en tu historial.";
    if (result.next_due_date)
      text += ` Próximo vencimiento: ${dateLabel(result.next_due_date)}.`;
    if (pay.frequency === "once" && !result.already_paid) {
      try {
        await req(`/google/calendar/reminder/${pay.id}`, { method: "DELETE" });
      } catch {
        text += " No pudimos retirar el recordatorio de Calendar.";
      }
    }
    setPay(null);
    setNotice(text);
  }
  async function savePlan() {
    const plan = await req<Plan>("/scheduled", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        amount_cents: cents(amount),
        due_date: due,
        frequency,
        account_id: Number(account),
        category: "Otros",
      }),
    });
    let message = "Pago programado. Tu saldo no ha cambiado.";
    if (sync) {
      try {
        await req("/google/calendar/reminder", {
          method: "POST",
          body: JSON.stringify({ scheduled_id: plan.id }),
        });
        message += " Recordatorio añadido a Calendar.";
      } catch {
        message +=
          " Calendar quedó pendiente. Conecta Google y usa la opción de recordatorio.";
      }
    }
    setCreate(false);
    setName("");
    setAmount("");
    setDue("");
    setNotice(message);
    setTab("pending");
  }
  const pending = plans.filter((p) => p.active),
    paused = plans.filter((p) => !p.active && !p.completed);
  const visible = tab === "paused" ? paused : pending;
  return (
    <div className="stack">
      <div className="page-actions">
        <div className="segmented" aria-label="Estado de pagos">
          <button
            aria-pressed={tab === "pending"}
            className={tab === "pending" ? "chosen" : ""}
            onClick={() => setTab("pending")}
          >
            Pendientes ({pending.length})
          </button>
          <button
            aria-pressed={tab === "history"}
            className={tab === "history" ? "chosen" : ""}
            onClick={() => setTab("history")}
          >
            Pagados
          </button>
          <button
            aria-pressed={tab === "paused"}
            className={tab === "paused" ? "chosen" : ""}
            onClick={() => setTab("paused")}
          >
            Pausados ({paused.length})
          </button>
        </div>
        <button
          className="primary"
          onClick={() => {
            setCreate(true);
            setFormError("");
          }}
        >
          <Plus size={17} /> Programar pago
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            className="link"
            onClick={() =>
              void refresh()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Reintentar
          </button>
        </div>
      )}
      {notice && (
        <div className="success-msg" role="status">
          {notice}
        </div>
      )}
      {tab === "history" ? (
        <Historial accounts={accounts} initialKind="payment" />
      ) : loading ? (
        <p role="status">Cargando pagos…</p>
      ) : (
        <>
          {tab === "pending" && pending.length > 0 && (
            <div className="payment-overview">
              <CalendarDays size={24} />
              <div className="grow">
                <strong>
                  {money(pending.reduce((n, p) => n + p.amount_cents, 0))} en
                  próximos vencimientos
                </strong>
                <small>
                  {pending.filter((p) => p.due_date < localToday()).length}{" "}
                  vencidos · Cada pago se registra cuando confirmas que lo
                  hiciste.
                </small>
              </div>
            </div>
          )}
          <section className="panel payment-list">
            {visible.length ? (
              visible.map((p) => (
                <article className="payment-entry" key={p.id}>
                  <div className="payment-info">
                    <span
                      className={
                        "status-pill " +
                        (!p.active
                          ? "paused"
                          : p.due_date < localToday()
                            ? "overdue"
                            : "upcoming")
                      }
                    >
                      {!p.active
                        ? "Pausado"
                        : p.due_date < localToday()
                          ? "Vencido"
                          : p.due_date === localToday()
                            ? "Vence hoy"
                            : "Pendiente"}
                    </span>
                    <h3>{p.name}</h3>
                    <p>
                      {dateLabel(p.due_date)} · {frequencyLabel[p.frequency]}
                    </p>
                    <small>
                      {accounts.find((a) => a.id === p.account_id)?.name ||
                        "Cuenta"}
                    </small>
                  </div>
                  <div className="payment-side">
                    <strong>{money(p.amount_cents)}</strong>
                    {p.active && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => openPay(p)}
                      >
                        <CheckCircle2 size={16} /> Ya pagué
                      </button>
                    )}
                  </div>
                  <details className="payment-options">
                    <summary>Opciones del pago</summary>
                    <div className="connection-actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await req(`/scheduled/${p.id}/toggle`, {
                              method: "PATCH",
                            });
                            let text = p.active
                              ? "Pago pausado."
                              : "Pago activado.";
                            if (p.active) {
                              try {
                                await req(`/google/calendar/reminder/${p.id}`, {
                                  method: "DELETE",
                                });
                              } catch {
                                text +=
                                  " No pudimos retirar el recordatorio de Calendar.";
                              }
                            }
                            setNotice(text);
                          })
                        }
                      >
                        {p.active ? "Pausar pago" : "Activar pago"}
                      </button>
                      {p.active && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await req("/google/calendar/reminder", {
                                method: "POST",
                                body: JSON.stringify({ scheduled_id: p.id }),
                              });
                              setNotice(
                                "Recordatorio sincronizado con Calendar.",
                              );
                            })
                          }
                        >
                          Recordar en Calendar
                        </button>
                      )}
                    </div>
                  </details>
                </article>
              ))
            ) : (
              <div className="empty">
                <CalendarDays size={34} />
                <h3>
                  {tab === "paused"
                    ? "No tienes pagos pausados"
                    : "Sin pagos pendientes"}
                </h3>
                <p>
                  {tab === "paused"
                    ? "Los pagos que pauses aparecerán aquí."
                    : "Programa tus suscripciones o próximos recibos para recordar cuándo vencen."}
                </p>
                {tab === "pending" && (
                  <button
                    className="primary"
                    onClick={() => {
                      setCreate(true);
                      setFormError("");
                    }}
                  >
                    Programar mi primer pago
                  </button>
                )}
              </div>
            )}
          </section>
          <p className="hint">
            ¿Ya registraste el gasto manualmente o desde Gmail? Evita
            confirmarlo de nuevo aquí para no duplicarlo.{" "}
            <button className="link" onClick={onRegister}>
              Registrar otro gasto
            </button>
          </p>
        </>
      )}
      {create && (
        <Modal
          title="Programar un pago"
          onClose={() => {
            if (!busy) setCreate(false);
          }}
        >
          <p className="muted">
            Guarda un próximo vencimiento. El saldo cambia cuando confirmas «Ya
            pagué».
          </p>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(savePlan);
            }}
          >
            {formError && (
              <div className="error" role="alert">
                {formError}
              </div>
            )}
            <label>
              ¿Qué vas a pagar?
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Internet o gimnasio"
              />
            </label>
            <div className="field-pair">
              <label>
                Importe previsto (S/)
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                Vencimiento
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
                Repetir
                <select
                  aria-label="Repetir"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                >
                  {Object.entries(frequencyLabel).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cuenta prevista
                <select
                  required
                  aria-label="Cuenta prevista"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
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
              Añadir recordatorio a Calendar
            </label>
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => setCreate(false)}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar próximo pago"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {pay && (
        <Modal
          title="Confirmar pago realizado"
          onClose={() => {
            if (!busy) setPay(null);
          }}
        >
          <h3>{pay.name}</h3>
          <p className="muted">
            Vencimiento: {dateLabel(pay.due_date)}. Confirma solo si ya lo
            pagaste.
          </p>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(confirmPay);
            }}
          >
            {formError && (
              <div className="error" role="alert">
                {formError}
              </div>
            )}
            <label>
              Importe pagado (S/)
              <input
                required
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
              />
            </label>
            <label>
              ¿De qué cuenta salió?
              <select
                required
                aria-label="¿De qué cuenta salió?"
                value={paidAccount}
                onChange={(e) => setPaidAccount(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {money(a.balance_cents)}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">
              Se descontará este importe de la cuenta y se guardará un gasto. La
              app no envía dinero ni realiza el pago por ti.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setPay(null)}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Registrando…" : "Confirmar y registrar pago"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
