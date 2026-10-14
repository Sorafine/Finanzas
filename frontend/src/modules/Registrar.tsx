import { useState } from "react";
import { Account, req, money, cents, localToday } from "../shared/api";
export default function Registrar({
  accounts,
  initialKind,
  onSaved,
  onCancel,
}: {
  accounts: Account[];
  initialKind: "expense" | "income" | "withdrawal";
  onSaved: (notice: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState(initialKind),
    [amount, setAmount] = useState(""),
    [concept, setConcept] = useState(""),
    [account, setAccount] = useState(
      String(
        accounts.find((a) => initialKind !== "withdrawal" || a.kind !== "cash")
          ?.id || "",
      ),
    ),
    [destination, setDestination] = useState(
      String(accounts.find((a) => a.kind === "cash")?.id || ""),
    ),
    [fee, setFee] = useState("0"),
    [category, setCategory] = useState("Otros"),
    [fixed, setFixed] = useState(false),
    [due, setDue] = useState(""),
    [frequency, setFrequency] = useState("mensual"),
    [calendar, setCalendar] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const categories = [
    "Otros",
    "Comida",
    "Transporte",
    "Compras",
    "Salidas",
    "Salud",
    "Vivienda",
    "Servicios",
    "Internet",
    "Suscripciones",
    "Educación",
  ];
  const source = accounts.filter(
    (a) => kind !== "withdrawal" || a.kind !== "cash",
  );
  function changeKind(value: typeof kind) {
    setKind(value);
    setFixed(false);
    setError("");
    if (
      value === "withdrawal" &&
      accounts.find((a) => String(a.id) === account)?.kind === "cash"
    )
      setAccount(String(accounts.find((a) => a.kind !== "cash")?.id || ""));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const value = cents(amount);
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("Ingresa un importe mayor que cero.");
      const result = await req<{ scheduled_id: number | null }>("/movements", {
        method: "POST",
        body: JSON.stringify({
          kind,
          amount_cents: value,
          concept: concept.trim(),
          account_id: Number(account),
          destination_id: kind === "withdrawal" ? Number(destination) : null,
          fee_cents: kind === "withdrawal" ? cents(fee) : 0,
          category: kind === "expense" ? category : null,
          classification:
            kind === "expense" ? (fixed ? "fijo" : "variable") : null,
          frequency: kind === "expense" && fixed ? frequency : null,
          recurring_due_date: kind === "expense" && fixed ? due : null,
        }),
      });
      let message =
        kind === "income"
          ? "Ingreso registrado. Tu saldo está actualizado."
          : kind === "withdrawal"
            ? "Retiro registrado. El dinero está en tu cuenta de efectivo."
            : "Gasto registrado. Puedes verlo en Historial.";
      if (result.scheduled_id) {
        message = "Gasto registrado y siguiente vencimiento añadido a Pagos.";
        if (calendar) {
          try {
            await req("/google/calendar/reminder", {
              method: "POST",
              body: JSON.stringify({ scheduled_id: result.scheduled_id }),
            });
            message += " Recordatorio añadido a Calendar.";
          } catch {
            message +=
              " El recordatorio de Calendar quedó pendiente; podrás sincronizarlo desde Pagos.";
          }
        }
      }
      await onSaved(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel form-panel">
      <div className="tabs" aria-label="Tipo de movimiento">
        {(["expense", "income", "withdrawal"] as const).map((k) => (
          <button
            key={k}
            type="button"
            disabled={busy}
            className={kind === k ? "chosen" : ""}
            aria-pressed={kind === k}
            onClick={() => changeKind(k)}
          >
            {{ expense: "Gasto", income: "Ingreso", withdrawal: "Retiro" }[k]}
          </button>
        ))}
      </div>
      <form className="form" onSubmit={save}>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <label>
          Importe (S/)
          <input
            className="amount"
            required
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          {kind === "expense"
            ? "¿En qué gastaste?"
            : kind === "income"
              ? "¿De dónde vino el dinero?"
              : "Concepto"}
          <input
            required
            maxLength={150}
            placeholder={
              kind === "expense"
                ? "Ej. Almuerzo"
                : kind === "income"
                  ? "Ej. Sueldo"
                  : "Ej. Retiro de cajero"
            }
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
          />
        </label>
        <label>
          {kind === "withdrawal" ? "Cuenta de origen" : "Cuenta"}
          <select
            required
            aria-label={kind === "withdrawal" ? "Cuenta de origen" : "Cuenta"}
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="" disabled>
              Elige una cuenta
            </option>
            {source.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {money(a.balance_cents)}
              </option>
            ))}
          </select>
        </label>
        {kind === "expense" && (
          <>
            <label>
              Categoría
              <select
                aria-label="Categoría"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={fixed}
                onChange={(e) => setFixed(e.target.checked)}
              />{" "}
              Este gasto se repetirá
            </label>
            {fixed && (
              <div className="subform">
                <p className="hint">
                  Este importe registra el gasto de hoy. El siguiente pago
                  quedará pendiente.
                </p>
                <div className="field-pair">
                  <label>
                    Frecuencia
                    <select
                      aria-label="Frecuencia"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                    >
                      <option value="mensual">Mensual</option>
                      <option value="semanal">Semanal</option>
                      <option value="anual">Anual</option>
                    </select>
                  </label>
                  <label>
                    Siguiente vencimiento
                    <input
                      required
                      type="date"
                      min={localToday()}
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                    />
                  </label>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={calendar}
                    onChange={(e) => setCalendar(e.target.checked)}
                  />{" "}
                  Añadir recordatorio a Calendar
                </label>
              </div>
            )}
          </>
        )}
        {kind === "withdrawal" && (
          <>
            <label>
              Cuenta de efectivo
              <select
                required
                aria-label="Cuenta de efectivo"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="" disabled>
                  Elige el destino
                </option>
                {accounts
                  .filter((a) => a.kind === "cash")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Comisión (S/)
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                required
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </label>
            <p className="hint">
              El retiro mueve dinero a efectivo. Solo la comisión es un gasto.
            </p>
          </>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button className="primary" type="submit" disabled={busy}>
            {busy
              ? "Guardando…"
              : kind === "expense"
                ? "Guardar gasto"
                : kind === "income"
                  ? "Guardar ingreso"
                  : "Guardar retiro"}
          </button>
        </div>
      </form>
    </section>
  );
}
