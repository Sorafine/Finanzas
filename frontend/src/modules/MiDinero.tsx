import { useEffect, useState } from "react";
import { Account, Card, money, dateLabel, localToday } from "../shared/api";
import { banks, detectBank } from "../shared/banks";
import CardModal from "./mi-dinero/CardModal";
import AccountModal from "./mi-dinero/AccountModal";
import CardReport from "./mi-dinero/CardReport";
type Props = {
  accounts: Account[];
  cards: Card[];
  reload: () => Promise<void>;
  onWithdraw: () => void;
  onIncome: () => void;
  onTransfer: (from: number, to?: number) => void;
  onHistory: (id: number) => void;
  notify: (s: string) => void;
};
function nextDate(day: number | null) {
  if (!day) return null;
  const [year, month] = localToday().split("-").map(Number);
  const build = (y: number, m: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate())).padStart(2, "0")}`;
  let value = build(year, month);
  if (value < localToday())
    value = build(year + (month === 12 ? 1 : 0), month === 12 ? 1 : month + 1);
  return value;
}
export default function MiDinero({
  accounts,
  cards,
  reload,
  onTransfer,
  onHistory,
  notify,
}: Props) {
  const [accountForm, setAccountForm] = useState<Account | null | undefined>(),
    [cardForm, setCardForm] = useState<Card | null | undefined>(),
    [reportId, setReportId] = useState<number | null>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [reportId]);
  async function saved() {
    await reload();
    notify("Cambios guardados correctamente.");
  }
  if (reportId !== null)
    return (
      <CardReport
        cardId={reportId}
        onBack={() => setReportId(null)}
        onHistory={onHistory}
      />
    );
  const total = accounts.reduce((n, a) => n + a.balance_cents, 0),
    bank = accounts
      .filter((a) => a.kind === "bank")
      .reduce((n, a) => n + a.balance_cents, 0),
    cash = accounts
      .filter((a) => a.kind === "cash")
      .reduce((n, a) => n + a.balance_cents, 0),
    wallet = total - bank - cash;
  return (
    <div className="stack money-reference">
      <div className="page-actions align-end">
        <button className="primary" onClick={() => setAccountForm(null)}>
          + Agregar cuenta
        </button>
      </div>
      <section className="panel account-total">
        <small>Total en cuentas</small>
        <strong>{money(total)}</strong>
        <div
          className="account-distribution"
          role="img"
          aria-label={`Banco ${money(bank)}, efectivo ${money(cash)}, billeteras ${money(wallet)}`}
        >
          <i style={{ width: (total ? (bank / total) * 100 : 0) + "%" }} />
          <i style={{ width: (total ? (cash / total) * 100 : 0) + "%" }} />
          <i style={{ width: (total ? (wallet / total) * 100 : 0) + "%" }} />
        </div>
        <small>
          Banco {total ? Math.round((bank / total) * 100) : 0}% · Efectivo{" "}
          {total ? Math.round((cash / total) * 100) : 0}%
          {wallet ? ` · Billeteras ${Math.round((wallet / total) * 100)}%` : ""}
        </small>
      </section>
      <div className="account-grid">
        {accounts.map((a) => {
          const dest =
            accounts.find(
              (b) =>
                b.id !== a.id &&
                (a.kind === "cash" ? b.kind === "bank" : b.kind === "cash"),
            ) || accounts.find((b) => b.id !== a.id);
          return (
            <article className="panel account-tile" key={a.id}>
              <div className="account-heading">
                <div className="grow">
                  <h2>{a.name}</h2>
                  <small>
                    {
                      {
                        bank: "Cuenta bancaria",
                        cash: "Efectivo",
                        wallet: "Billetera digital",
                      }[a.kind]
                    }
                  </small>
                </div>
                <button
                  className="link subtle-edit"
                  onClick={() => setAccountForm(a)}
                  aria-label={`Editar ${a.name}`}
                >
                  Editar
                </button>
              </div>
              <strong className="account-value">
                {money(a.balance_cents)}
              </strong>
              <div className="connection-actions">
                <button className="secondary" onClick={() => onHistory(a.id)}>
                  Ver movimientos
                </button>
                <button
                  className="secondary"
                  disabled={!dest}
                  onClick={() => onTransfer(a.id, dest?.id)}
                >
                  {a.kind === "cash"
                    ? "Depositar al banco"
                    : dest?.kind === "cash"
                      ? "Pasar a efectivo"
                      : "Transferir"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <section className="my-cards">
        <div className="section-head">
          <h2>Mis tarjetas</h2>
          <button className="secondary" onClick={() => setCardForm(null)}>
            + Agregar tarjeta
          </button>
        </div>
        <div className="reference-card-list">
          {cards.map((c) => {
            const account = accounts.find((a) => a.id === c.account_id),
              close = nextDate(c.closing_day),
              due = nextDate(c.due_day);
            return (
              <article className="reference-card-row" key={c.id}>
                <div className="reference-card-face">
                  <div>
                    <strong>{c.name}</strong>
                    <span>•••• {c.last_four}</span>
                  </div>
                  <small>
                    {
                      banks[detectBank(c.name, account?.name || "", c.issuer)]
                        .name
                    }{" "}
                    · {c.card_type === "credit" ? "Crédito" : "Débito"} ·{" "}
                    {c.brand}
                  </small>
                  <footer>
                    <small>
                      {c.card_type === "credit"
                        ? "Deuda actual"
                        : "Saldo de la cuenta"}
                    </small>
                    <b>
                      {money(
                        c.card_type === "credit"
                          ? c.debt_cents
                          : account?.balance_cents || 0,
                      )}
                    </b>
                  </footer>
                </div>
                <div className="panel card-reference-details">
                  {c.card_type === "credit" ? (
                    <>
                      <div className="account-line">
                        <span>Cierre de ciclo</span>
                        <b>{close ? dateLabel(close) : "Sin configurar"}</b>
                      </div>
                      <div className="account-line">
                        <span>Fecha de pago</span>
                        <b>{due ? dateLabel(due) : "Sin configurar"}</b>
                      </div>
                      <p className="hint">
                        La deuda no se suma a tu saldo disponible. Se actualiza
                        al editar la tarjeta.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3>{account?.name}</h3>
                      <p className="muted">
                        Esta tarjeta usa el saldo de su cuenta.
                      </p>
                    </>
                  )}
                  <div className="connection-actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        notify("");
                        setReportId(c.id);
                      }}
                    >
                      Ver informe
                    </button>
                    <button
                      className="link"
                      onClick={() => setCardForm(c)}
                      aria-label={`Editar tarjeta ${c.name}`}
                    >
                      Editar tarjeta
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {!cards.length && (
          <div className="panel empty compact">
            <p>
              Añade una tarjeta para tener a mano su estado, fechas e informe.
            </p>
            <button className="link" onClick={() => setCardForm(null)}>
              Agregar mi primera tarjeta
            </button>
          </div>
        )}
      </section>
      {accountForm !== undefined && (
        <AccountModal
          account={accountForm ?? undefined}
          onClose={() => setAccountForm(undefined)}
          onSaved={saved}
        />
      )}
      {cardForm !== undefined && (
        <CardModal
          accounts={accounts}
          card={cardForm ?? undefined}
          onClose={() => setCardForm(undefined)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
