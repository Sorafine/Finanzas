import { useState } from "react";
import { Account, Card, cents, localToday, money, req } from "../../shared/api";
import Modal from "../../shared/Modal";
export default function CardPayment({
  card,
  accounts,
  onClose,
  onSaved,
}: {
  card: Card;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(card.debt_cents / 100)),
    [account, setAccount] = useState(String(card.account_id)),
    [day, setDay] = useState(localToday()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requestId] = useState(() => crypto.randomUUID());
  const source = accounts.find((a) => a.id === Number(account));
  return (
    <Modal
      title={"Pagar " + card.name}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          void req(`/cards/${card.id}/pay`, {
            method: "POST",
            body: JSON.stringify({
              account_id: Number(account),
              amount_cents: cents(amount),
              occurred_on: day,
              request_id: requestId,
            }),
          })
            .then(async () => {
              await onSaved();
              onClose();
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <p>
          Registra un pago que ya realizaste. Se descontará de tu cuenta y
          reducirá la deuda, sin volver a contar la compra como gasto.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <label>
          Importe del pago (S/)
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            max={card.debt_cents / 100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          Cuenta de pago
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha del pago
          <input
            required
            type="date"
            max={localToday()}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <p role="status">
          Deuda restante: {money(card.debt_cents - (cents(amount) || 0))}
          <br />
          Saldo de {source?.name}:{" "}
          {money((source?.balance_cents || 0) - (cents(amount) || 0))}
        </p>
        <button className="primary" disabled={busy}>
          {busy ? "Registrando…" : "Confirmar pago de tarjeta"}
        </button>
      </form>
    </Modal>
  );
}
