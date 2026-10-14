import { useState } from "react";
import {
  Wallet,
  Plus,
  PenLine,
  CreditCard,
  Landmark,
  Smartphone,
  ArrowLeftRight,
} from "lucide-react";
import { Account, Card, money } from "../shared/api";
import CardModal from "./mi-dinero/CardModal";
import AccountModal from "./mi-dinero/AccountModal";
type Props = {
  accounts: Account[];
  cards: Card[];
  reload: () => Promise<void>;
  onWithdraw: () => void;
  onIncome: () => void;
  onHistory: (id: number) => void;
  notify: (s: string) => void;
};
export default function MiDinero({
  accounts,
  cards,
  reload,
  onWithdraw,
  onIncome,
  onHistory,
  notify,
}: Props) {
  const [accountForm, setAccountForm] = useState<Account | null | undefined>(),
    [cardForm, setCardForm] = useState<Card | null | undefined>();
  async function saved() {
    await reload();
    notify("Cambios guardados correctamente.");
  }
  return (
    <div className="stack">
      <div className="money-balance">
        <div>
          <small>Saldo en tus cuentas</small>
          <strong>
            {money(accounts.reduce((n, a) => n + a.balance_cents, 0))}
          </strong>
        </div>
        <button className="primary" onClick={onIncome}>
          <Plus size={17} /> Añadir ingreso
        </button>
      </div>
      <div className="section-head">
        <h2>Mis cuentas</h2>
        <button className="secondary" onClick={() => setAccountForm(null)}>
          <Plus size={16} /> Agregar cuenta
        </button>
      </div>
      <div className="account-grid">
        {accounts.map((a) => {
          const Icon =
            a.kind === "cash"
              ? Wallet
              : a.kind === "wallet"
                ? Smartphone
                : Landmark;
          return (
            <article className="panel account-tile" key={a.id}>
              <div className="account-heading">
                <span className="account-icon">
                  <Icon size={23} />
                </span>
                <div className="grow">
                  <h3>{a.name}</h3>
                  <small>
                    {
                      {
                        bank: "Banco",
                        cash: "Efectivo",
                        wallet: "Billetera digital",
                      }[a.kind]
                    }
                  </small>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setAccountForm(a)}
                  aria-label={`Editar ${a.name}`}
                >
                  <PenLine size={17} />
                </button>
              </div>
              <strong className="account-value">
                {money(a.balance_cents)}
              </strong>
              <button className="link" onClick={() => onHistory(a.id)}>
                Ver movimientos →
              </button>
            </article>
          );
        })}
      </div>
      <button className="secondary withdrawal-action" onClick={onWithdraw}>
        <ArrowLeftRight size={17} /> Pasar dinero a efectivo
      </button>
      <details className="panel cards-section">
        <summary>
          Mis tarjetas <span className="badge">{cards.length}</span>
        </summary>
        <p className="hint">
          Las tarjetas de débito usan el saldo de su cuenta. Las de crédito
          muestran la deuda que registres.
        </p>
        {cards.map((c) => (
          <div className="movement" key={c.id}>
            <CreditCard size={22} />
            <div className="grow">
              <strong>{c.name}</strong>
              <small>
                {c.brand} · ···· {c.last_four} ·{" "}
                {c.card_type === "credit" ? "Crédito" : "Débito"}
              </small>
              <small>
                {c.card_type === "credit"
                  ? `Deuda: ${money(c.debt_cents)} · Límite: ${money(c.credit_limit_cents)}`
                  : accounts.find((a) => a.id === c.account_id)?.name}
              </small>
            </div>
            <button className="secondary" onClick={() => setCardForm(c)}>
              Editar
            </button>
          </div>
        ))}
        {!cards.length && (
          <p className="muted">
            Puedes añadir una tarjeta para tener sus datos a mano.
          </p>
        )}
        <button className="secondary" onClick={() => setCardForm(null)}>
          <Plus size={16} /> Agregar tarjeta
        </button>
      </details>
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
