import { useState } from "react";
import {
  Account,
  req,
  money,
  cents,
  localToday,
  dateShift,
} from "../shared/api";
import { expenseCategories } from "../shared/FinanceUI";
type Kind = "expense" | "income" | "transfer";
export default function Registrar({
  accounts,
  initialKind,
  initialAccount = "",
  initialDestination = "",
  onSaved,
  onCancel,
  onBusyChange,
}: {
  accounts: Account[];
  initialKind: Kind;
  initialAccount?: string;
  initialDestination?: string;
  onSaved: (notice: string) => Promise<void>;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [kind, setKind] = useState(initialKind),
    [amount, setAmount] = useState(""),
    [concept, setConcept] = useState(""),
    [account, setAccount] = useState(
      initialAccount || String(accounts[0]?.id || ""),
    ),
    [destination, setDestination] = useState(
      initialDestination ||
        String(
          accounts.find(
            (a) => String(a.id) !== (initialAccount || String(accounts[0]?.id)),
          )?.id || "",
        ),
    ),
    [fee, setFee] = useState("0"),
    [category, setCategory] = useState("Comida"),
    [categoryTouched, setCategoryTouched] = useState(false),
    [day, setDay] = useState(localToday()),
    [repeat, setRepeat] = useState(false),
    [due, setDue] = useState(""),
    [calendar, setCalendar] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requestId] = useState(() => crypto.randomUUID());
  const source = accounts.find((a) => String(a.id) === account),
    target = accounts.find((a) => String(a.id) === destination),
    value = cents(amount),
    charge = Number.isFinite(value) ? value : 0,
    feeValue =
      kind === "transfer" && Number.isFinite(cents(fee)) ? cents(fee) : 0,
    remaining =
      (source?.balance_cents || 0) +
      (kind === "income" ? charge : -charge - feeValue);
  function suggest(text: string) {
    setConcept(text);
    if (categoryTouched) return;
    const match: [RegExp, string][] = [
      [/almuerzo|comida|cena|desayuno|restaurante|cafe|café/i, "Comida"],
      [/taxi|bus|pasaje|uber|movilidad/i, "Transporte"],
      [/luz|agua|internet|telefono|teléfono/i, "Servicios"],
      [/farmacia|medic|salud/i, "Salud"],
      [/alquiler|renta|casa/i, "Casa"],
      [/cine|netflix|spotify|juego/i, "Ocio"],
    ];
    const found = match.find(([pattern]) => pattern.test(text));
    setCategory(found?.[1] || "Otros");
  }
  function changeKind(k: Kind) {
    setKind(k);
    setRepeat(false);
    setError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("Ingresa un importe mayor que cero.");
      let message = "";
      if (kind === "transfer") {
        const result = await req<{ already_transferred: boolean }>(
          "/transfers",
          {
            method: "POST",
            body: JSON.stringify({
              account_id: Number(account),
              destination_id: Number(destination),
              amount_cents: value,
              fee_cents: cents(fee),
              concept: concept.trim() || "Transferencia entre cuentas",
              occurred_on: day,
              request_id: requestId,
            }),
          },
        );
        message = result.already_transferred
          ? "Esta transferencia ya estaba registrada."
          : "Transferencia registrada. El saldo de ambas cuentas está actualizado.";
      } else {
        const result = await req<{ scheduled_id: number | null }>(
          "/movements",
          {
            method: "POST",
            body: JSON.stringify({
              kind,
              account_id: Number(account),
              amount_cents: value,
              concept: concept.trim(),
              category: kind === "expense" ? category : null,
              classification:
                kind === "expense" ? (repeat ? "fijo" : "variable") : null,
              frequency: kind === "expense" && repeat ? "mensual" : null,
              recurring_due_date: kind === "expense" && repeat ? due : null,
              occurred_on: day,
            }),
          },
        );
        message =
          kind === "income"
            ? "Ingreso guardado. Tu saldo está actualizado."
            : "Gasto guardado. Puedes verlo en Historial.";
        if (result.scheduled_id) {
          message += " Próximo vencimiento añadido a Pagos.";
          if (calendar) {
            try {
              await req("/google/calendar/reminder", {
                method: "POST",
                body: JSON.stringify({ scheduled_id: result.scheduled_id }),
              });
              message += " Recordatorio añadido a Calendar.";
            } catch {
              message += " El recordatorio de Calendar quedó pendiente.";
            }
          }
        }
      }
      await onSaved(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <form className="movement-editor" onSubmit={save}>
      <div className="tabs" aria-label="Tipo de movimiento">
        {(["expense", "income", "transfer"] as const).map((k) => (
          <button
            type="button"
            key={k}
            className={kind === k ? "chosen" : ""}
            disabled={busy}
            aria-pressed={kind === k}
            onClick={() => changeKind(k)}
          >
            {{ expense: "Gasto", income: "Ingreso", transfer: "Transferir" }[k]}
          </button>
        ))}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <label className="big-amount">
        <span>Importe</span>
        <div>
          <b>S/</b>
          <input
            aria-label="Importe (S/)"
            required
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </label>
      <input
        className="concept-input"
        aria-label={kind === "income" ? "Origen del ingreso" : "Concepto"}
        required={kind !== "transfer"}
        maxLength={150}
        value={concept}
        onChange={(e) => suggest(e.target.value)}
        placeholder={
          kind === "income"
            ? "Sueldo, propina…"
            : kind === "transfer"
              ? "Transferencia entre cuentas"
              : "¿En qué gastaste?"
        }
      />
      {kind === "expense" && (
        <div className="category-picker">
          <small>
            Categoría{!categoryTouched ? " · sugerida" : ""}: {category}
          </small>
          <div>
            {expenseCategories.map((c) => (
              <button
                type="button"
                key={c.name}
                className={category === c.name ? "selected" : ""}
                aria-pressed={category === c.name}
                onClick={() => {
                  setCategory(c.name);
                  setCategoryTouched(true);
                }}
              >
                <span>
                  <c.icon size={23} />
                </span>
                <small>{c.name}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="editor-fields">
        <label>
          {kind === "transfer" ? "Desde" : "Cuenta"}
          <select
            aria-label={kind === "transfer" ? "Cuenta de origen" : "Cuenta"}
            required
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              if (destination === e.target.value)
                setDestination(
                  String(
                    accounts.find((a) => String(a.id) !== e.target.value)?.id ||
                      "",
                  ),
                );
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input
            aria-label="Fecha del movimiento"
            required
            type="date"
            max={localToday()}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          <span className="date-shortcuts">
            <button type="button" onClick={() => setDay(localToday())}>
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setDay(dateShift(localToday(), -1))}
            >
              Ayer
            </button>
          </span>
        </label>
      </div>
      {kind === "transfer" && (
        <div className="editor-fields">
          <label>
            Hacia
            <select
              aria-label="Cuenta de destino"
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="" disabled>
                Elige destino
              </option>
              {accounts
                .filter((a) => String(a.id) !== account)
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Comisión (S/)
            <input
              required
              aria-label="Comisión (S/)"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </label>
        </div>
      )}
      {kind === "expense" && (
        <>
          <label className="repeat-switch">
            Se repite cada mes
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
            />
            <span aria-hidden="true" />
          </label>
          {repeat && (
            <div className="subform form">
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
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={calendar}
                  onChange={(e) => setCalendar(e.target.checked)}
                />{" "}
                Recordar en Calendar
              </label>
            </div>
          )}
        </>
      )}
      <div className="editor-footer">
        <p role="status">
          {charge > 0 && source
            ? `Tras guardar, ${source.name} quedará en ${money(remaining)}`
            : "Tu saldo se actualizará al guardar."}
          {kind === "transfer" && charge > 0 && target ? (
            <>
              <br />
              {target.name} quedará en {money(target.balance_cents + charge)}
            </>
          ) : null}
        </p>
        {remaining < 0 && (
          <p className="overdue-text">
            El saldo no alcanza para este movimiento.
          </p>
        )}
        <button
          className="primary full-width"
          disabled={
            busy || !accounts.length || (kind === "transfer" && !destination)
          }
        >
          {busy
            ? "Guardando…"
            : kind === "expense"
              ? "Guardar gasto"
              : kind === "income"
                ? "Guardar ingreso"
                : "Guardar transferencia"}
        </button>
        <button
          className="link full-width editor-cancel"
          disabled={busy}
          type="button"
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
