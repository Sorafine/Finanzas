import { useEffect, useState } from "react";
import {
  Wallet,
  Plus,
  PenLine,
  CreditCard,
  BarChart3,
  Coins,
  Landmark,
  Smartphone,
  ArrowLeftRight,
} from "lucide-react";
import { Account, Card, money } from "../shared/api";
import CardModal from "./mi-dinero/CardModal";
import AccountModal from "./mi-dinero/AccountModal";
import CardVisual from "./mi-dinero/CardVisual";
import CardReport from "./mi-dinero/CardReport";
import { banks, detectBank } from "../shared/banks";
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
  return (
    <div className="stack">
      <div className="money-balance">
        <div>
          <small>
            <Coins size={16} /> Saldo en tus cuentas
          </small>
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
          const bank = detectBank("", a.name);
          return (
            <article className="panel account-tile" key={a.id}>
              <div className="account-heading">
                <span className="account-icon">
                  {a.kind === "bank" && bank !== "other" ? (
                    <b className={"bank-badge bank-" + bank}>
                      {banks[bank].short}
                    </b>
                  ) : (
                    <Icon size={23} />
                  )}
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
      <section className="my-cards" aria-labelledby="my-cards-title">
        <div className="section-head">
          <div>
            <h2 id="my-cards-title">Mis tarjetas</h2>
            <p className="muted">
              Tu crédito y tus cuentas, con una cara más familiar.
            </p>
          </div>
          <button className="secondary" onClick={() => setCardForm(null)}>
            <Plus size={16} /> Agregar tarjeta
          </button>
        </div>
        <div className="bank-card-grid">
          {cards.map((c) => {
            const account = accounts.find((a) => a.id === c.account_id);
            const usage = c.credit_limit_cents
              ? (c.debt_cents / c.credit_limit_cents) * 100
              : 0;
            return (
              <article className="card-tile" key={c.id}>
                <CardVisual card={c} account={account} />
                <div className="card-tile-body">
                  {c.card_type === "credit" ? (
                    <>
                      <div className="card-mini-stats">
                        <span>
                          <small>Disponible</small>
                          <b>
                            {money(
                              Math.max(0, c.credit_limit_cents - c.debt_cents),
                            )}
                          </b>
                        </span>
                        <span>
                          <small>Límite utilizado</small>
                          <b>
                            {c.credit_limit_cents
                              ? `${Math.round(usage)}%`
                              : "Sin límite"}
                          </b>
                        </span>
                      </div>
                      <div className="progress">
                        <i style={{ width: Math.min(100, usage) + "%" }} />
                      </div>
                    </>
                  ) : (
                    <p className="hint">Vinculada a {account?.name}</p>
                  )}
                  <div className="card-tile-actions">
                    <button
                      className="primary"
                      onClick={() => setReportId(c.id)}
                    >
                      <BarChart3 size={17} /> Ver informe
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setCardForm(c)}
                      aria-label={`Editar tarjeta ${c.name}`}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {!cards.length && (
          <div className="panel empty empty-cards">
            <CreditCard size={36} />
            <h3>Dale un lugar a tus tarjetas</h3>
            <p>
              Agrega una tarjeta de débito o crédito para consultar su estado y
              ver el informe de su cuenta.
            </p>
            <button className="primary" onClick={() => setCardForm(null)}>
              Agregar mi primera tarjeta
            </button>
          </div>
        )}
        <p className="hint">
          Ilustraciones referenciales según el banco; el modelo físico puede
          variar. Los datos se registran manualmente.
        </p>
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
