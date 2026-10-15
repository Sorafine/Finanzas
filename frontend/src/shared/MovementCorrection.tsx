import { useState } from "react";
import {
  Account,
  HistoryItem,
  cents,
  dateLabel,
  localToday,
  money,
  req,
} from "./api";
export default function MovementCorrection({
  item,
  accounts,
  voiding,
  onSaved,
  onBusy,
}: {
  item: HistoryItem;
  accounts: Account[];
  voiding: boolean;
  onSaved: () => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [amount, setAmount] = useState(String(item.amount_cents / 100)),
    [concept, setConcept] = useState(item.concept),
    [account, setAccount] = useState(String(item.account_id)),
    [destination, setDestination] = useState(String(item.destination_id || "")),
    [fee, setFee] = useState(String(item.fee_cents / 100)),
    [category, setCategory] = useState(item.category || "Otros"),
    [day, setDay] = useState(
      new Date(Date.parse(item.created_at) - 5 * 3600000)
        .toISOString()
        .slice(0, 10),
    ),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const transfer = ["transfer", "withdrawal"].includes(item.kind);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await req(`/movements/${item.id}${voiding ? "/void" : ""}`, {
        method: voiding ? "POST" : "PUT",
        body: JSON.stringify({
          expected_revision: item.revision,
          reason: reason.trim(),
          ...(!voiding
            ? {
                amount_cents: cents(amount),
                concept: concept.trim(),
                account_id: Number(account),
                destination_id: transfer ? Number(destination) : null,
                fee_cents: transfer ? cents(fee) : 0,
                category,
                occurred_on: day,
              }
            : {}),
        }),
      });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      <p>
        {item.concept} · {money(item.amount_cents)} ·{" "}
        {dateLabel(item.created_at)}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="hint">
        {voiding
          ? "Se revertirá el efecto en saldos y deuda. El movimiento saldrá del historial y la anulación quedará en Correcciones. Si es el último pago de una serie, su vencimiento volverá a Pendientes."
          : "Se actualizarán saldos y deuda por la diferencia. Se conserva el origen y la vinculación del movimiento."}{" "}
        Los pagos programados y recordatorios creados desde este gasto se
        gestionan por separado.
      </p>
      {!voiding && (
        <>
          <label>
            Importe (S/)
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Concepto
            <input
              required
              maxLength={150}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
          </label>
          <label>
            Cuenta
            <select
              disabled={!!item.card_id && !item.is_card_payment}
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
          {transfer && (
            <>
              <label>
                Destino
                <select
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                >
                  {accounts
                    .filter((a) => a.id !== Number(account))
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
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
              </label>
            </>
          )}
          <label>
            Categoría
            <input
              maxLength={80}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label>
            Fecha
            <input
              required
              type="date"
              max={localToday()}
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
        </>
      )}
      <label>
        Motivo de la corrección
        <input
          required
          minLength={3}
          maxLength={200}
          placeholder="Por ejemplo: importe equivocado"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button className="primary" disabled={busy}>
        {busy
          ? "Guardando…"
          : voiding
            ? "Confirmar anulación"
            : "Guardar corrección"}
      </button>
    </form>
  );
}
