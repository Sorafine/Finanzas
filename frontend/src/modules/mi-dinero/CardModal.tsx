import { useState, FormEvent } from "react";
import Modal from "../../shared/Modal";
import { Account, Card, req, cents } from "../../shared/api";
import { banks, detectBank } from "../../shared/banks";
import CardVisual from "./CardVisual";
type Form = {
  name: string;
  card_type: "debit" | "credit";
  account_id: string;
  last_four: string;
  brand: string;
  issuer: Card["issuer"];
  credit_limit: string;
  debt: string;
  closing_day: string;
  due_day: string;
};
export default function CardModal({
  accounts,
  card,
  onClose,
  onSaved,
}: {
  accounts: Account[];
  card?: Card;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const banksAccounts = accounts.filter((a) => a.kind === "bank");
  const [form, setForm] = useState<Form>({
    name: card?.name ?? "",
    card_type: card?.card_type ?? "debit",
    account_id: String(card?.account_id ?? banksAccounts[0]?.id ?? ""),
    last_four: card?.last_four ?? "",
    brand: card?.brand ?? "Visa",
    issuer: card?.issuer ?? "auto",
    credit_limit: String((card?.credit_limit_cents ?? 0) / 100),
    debt: String((card?.debt_cents ?? 0) / 100),
    closing_day: String(card?.closing_day ?? ""),
    due_day: String(card?.due_day ?? ""),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const account = accounts.find((a) => String(a.id) === form.account_id);
  const detected = detectBank(form.name, account?.name || "", form.issuer);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!banksAccounts.some((b) => String(b.id) === form.account_id))
        throw Error("Primero agrega una cuenta bancaria.");
      if (!/^\d{4}$/.test(form.last_four))
        throw Error("Ingresa exactamente los últimos cuatro dígitos.");
      const limit = cents(form.credit_limit),
        debt = cents(form.debt);
      if (
        form.card_type === "credit" &&
        (!Number.isFinite(limit) ||
          !Number.isFinite(debt) ||
          limit < 0 ||
          debt < 0 ||
          debt > limit)
      )
        throw Error("Revisa el límite y la deuda.");
      const body = {
        name: form.name.trim(),
        card_type: form.card_type,
        account_id: Number(form.account_id),
        last_four: form.last_four,
        brand: form.brand,
        issuer: form.issuer,
        credit_limit_cents: form.card_type === "credit" ? limit : 0,
        debt_cents: form.card_type === "credit" ? debt : 0,
        closing_day:
          form.card_type === "credit" && form.closing_day
            ? Number(form.closing_day)
            : null,
        due_day:
          form.card_type === "credit" && form.due_day
            ? Number(form.due_day)
            : null,
      };
      await req(`/cards${card ? `/${card.id}` : ""}`, {
        method: card ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={card ? "Editar tarjeta" : "Agregar tarjeta"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <CardVisual
        compact
        card={{
          ...form,
          debt_cents: Number.isFinite(cents(form.debt)) ? cents(form.debt) : 0,
        }}
        account={account}
      />
      <p className="card-preview-caption">
        Diseño ilustrativo ·{" "}
        {form.issuer === "auto" && detected !== "other"
          ? `${banks[detected].name} detectado por el nombre`
          : banks[detected].name}
      </p>
      <form className="form" onSubmit={save}>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <label>
          Nombre de tu tarjeta
          <input
            required
            maxLength={80}
            placeholder="Ej. BCP Visa clásica"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>
        <div className="field-pair">
          <label>
            Tipo
            <select
              aria-label="Tipo de tarjeta"
              value={form.card_type}
              onChange={(e) => set("card_type", e.target.value)}
            >
              <option value="debit">Débito</option>
              <option value="credit">Crédito</option>
            </select>
          </label>
          <label>
            Banco o entidad
            <select
              aria-label="Banco o entidad"
              value={form.issuer}
              onChange={(e) => set("issuer", e.target.value)}
            >
              <option value="auto">Detectar por el nombre</option>
              {Object.entries(banks).map(([key, b]) => (
                <option key={key} value={key}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-pair">
          <label>
            Marca
            <select
              aria-label="Marca de tarjeta"
              value={form.brand}
              onChange={(e) => set("brand", e.target.value)}
            >
              {["Visa", "Mastercard", "American Express", "Otra"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Últimos 4 dígitos
            <input
              required
              pattern="[0-9]{4}"
              maxLength={4}
              inputMode="numeric"
              placeholder="1234"
              value={form.last_four}
              onChange={(e) =>
                set("last_four", e.target.value.replace(/\D/g, ""))
              }
            />
          </label>
        </div>
        <label>
          Cuenta bancaria asociada
          <select
            aria-label="Cuenta bancaria asociada"
            required
            value={form.account_id}
            onChange={(e) => set("account_id", e.target.value)}
          >
            <option value="">Selecciona cuenta</option>
            {banksAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {form.card_type === "credit" && (
          <div className="subform">
            <h3>Estado de tu crédito</h3>
            <div className="field-pair">
              <label>
                Límite (S/)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  value={form.credit_limit}
                  onChange={(e) => set("credit_limit", e.target.value)}
                />
              </label>
              <label>
                Deuda actual (S/)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  value={form.debt}
                  onChange={(e) => set("debt", e.target.value)}
                />
              </label>
            </div>
            <div className="field-pair">
              <label>
                Día de cierre
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={form.closing_day}
                  onChange={(e) => set("closing_day", e.target.value)}
                  placeholder="Ej. 20"
                />
              </label>
              <label>
                Día de pago
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={form.due_day}
                  onChange={(e) => set("due_day", e.target.value)}
                  placeholder="Ej. 5"
                />
              </label>
            </div>
            <p className="hint">
              Actualiza la deuda cuando cambie. Estos datos describen tu tarjeta
              y no modifican el saldo de la cuenta.
            </p>
          </div>
        )}
        <p className="hint">
          La ilustración cambia según el banco. Solo necesitas los últimos 4
          dígitos; no ingreses número completo, PIN ni CVV.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !banksAccounts.length}
          >
            {busy ? "Guardando…" : "Guardar tarjeta"}
          </button>
        </div>
        {!banksAccounts.length && (
          <p className="hint">
            Agrega primero una cuenta bancaria desde Mi dinero.
          </p>
        )}
      </form>
    </Modal>
  );
}
