import { useEffect, useState } from "react";
import {
  Account,
  Scheduled,
  Insights,
  req,
  money,
  localToday,
  dueLabel,
  monthName,
} from "../shared/api";
import { DateBadge } from "../shared/FinanceUI";
import GmailNotice from "./GmailNotice";
export default function Dashboard({
  accounts,
  plans,
  onRegister,
  onMoney,
  onPayments,
  onReview,
  onReports,
}: {
  accounts: Account[];
  plans: Scheduled[];
  onRegister: (kind: "expense" | "income" | "transfer") => void;
  onMoney: () => void;
  onPayments: () => void;
  onReview: () => void;
  onReports: () => void;
}) {
  const [insights, setInsights] = useState<Insights | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    req<Insights>("/insights?months=6")
      .then((r) => {
        if (active) setInsights(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const today = localToday(),
    monthEnd = today.slice(0, 7) + "-31",
    pending = plans.filter((p) => p.active),
    committed = pending
      .filter((p) => p.due_date <= monthEnd)
      .reduce((n, p) => n + p.amount_cents, 0),
    total = accounts.reduce((n, a) => n + a.balance_cents, 0),
    free = total - committed,
    next = pending[0];
  const max = Math.max(
    1,
    ...(insights?.monthly.map((m) => m.expense_cents) || []),
  );
  return (
    <div className="stack home-reference">
      <div className="home-top-grid">
        <section className="spend-card">
          <div className="overline">LIBRE PARA GASTAR</div>
          <strong className="spend-value">{money(free)}</strong>
          <div
            className="balance-track"
            role="img"
            aria-label={`Total ${money(total)}, comprometido ${money(committed)}`}
          >
            <i
              style={{
                width:
                  (total
                    ? Math.max(0, Math.min(100, (free / total) * 100))
                    : 0) + "%",
              }}
            />
          </div>
          <div className="spend-breakdown">
            <span>
              Total en cuentas <b>{money(total)}</b>
            </span>
            <span>
              Comprometido <b>{money(committed)}</b>
            </span>
          </div>
          <p className="spend-hint">
            Saldo menos pagos pendientes hasta fin de mes, incluidos vencidos.
          </p>
        </section>
        <section className="panel home-accounts">
          <h2>Mis cuentas</h2>
          {accounts.slice(0, 3).map((a) => (
            <div className="account-line" key={a.id}>
              <span>{a.name}</span>
              <b>{money(a.balance_cents)}</b>
            </div>
          ))}
          {accounts.length > 3 && (
            <button className="link" onClick={onMoney}>
              Ver las {accounts.length} cuentas
            </button>
          )}
          <button
            className="secondary full-width"
            onClick={() => onRegister("transfer")}
          >
            Pasar dinero entre cuentas
          </button>
        </section>
      </div>
      <div className="home-quick-actions">
        <button className="primary" onClick={() => onRegister("expense")}>
          − Gasto
        </button>
        <button className="secondary" onClick={() => onRegister("income")}>
          + Ingreso
        </button>
        <button className="secondary" onClick={() => onRegister("transfer")}>
          ⇄ Transferir
        </button>
      </div>
      <div className="home-bottom-grid">
        <section className="panel">
          <div className="section-head">
            <h2>Próximo pago</h2>
            <button className="link" onClick={onPayments}>
              Ver pagos
            </button>
          </div>
          {next ? (
            <button className="next-payment-button" onClick={onPayments}>
              <DateBadge day={next.due_date} />
              <span className="grow">
                <strong>{next.name}</strong>
                <small>
                  {dueLabel(next.due_date)} ·{" "}
                  {accounts.find((a) => a.id === next.account_id)?.name}
                </small>
              </span>
              <b>{money(next.amount_cents)}</b>
            </button>
          ) : (
            <div className="home-empty">
              <p>No tienes pagos pendientes.</p>
              <button className="link" onClick={onPayments}>
                Programar un pago
              </button>
            </div>
          )}
        </section>
        <section className="panel home-expense-chart">
          <div className="section-head">
            <h2>Gasto de {monthName()}</h2>
            <button className="link" onClick={onReports}>
              Ver reportes
            </button>
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : insights ? (
            <>
              <p className="muted">
                {insights.current.expense_cents
                  ? `${money(insights.current.expense_cents)} registrados este mes`
                  : "Aún no registras gastos este mes"}
              </p>
              <div
                className="mini-chart"
                aria-label="Gastos de los últimos seis meses"
              >
                {insights.monthly.map((m, i) => (
                  <div key={m.month}>
                    <i
                      title={`${monthName(m.month + "-01")}: ${money(m.expense_cents)}`}
                      style={{ height: (m.expense_cents / max) * 100 + "%" }}
                      className={
                        i === insights.monthly.length - 1 ? "current" : ""
                      }
                    />
                    <small>{monthName(m.month + "-01").slice(0, 3)}</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p role="status">Cargando resumen…</p>
          )}
        </section>
      </div>
      <GmailNotice onOpen={onReview} />
      {!total && !committed && (
        <p className="hint">
          ¿Estás empezando? Añade un ingreso para registrar el dinero que tienes
          disponible.
        </p>
      )}
    </div>
  );
}
