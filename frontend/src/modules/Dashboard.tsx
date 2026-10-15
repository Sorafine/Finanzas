import { useEffect, useState } from "react";
import {
  Account,
  Availability,
  Card,
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
  cards,
  plans,
  availability,
  selectedMonth,
  onSelectMonth,
  onRegister,
  onMoney,
  onPayments,
  onReview,
  onReports,
}: {
  accounts: Account[];
  cards: Card[];
  plans: Scheduled[];
  availability: Availability | null;
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
  onRegister: (kind: "expense" | "income" | "transfer") => void;
  onMoney: () => void;
  onPayments: () => void;
  onReview: () => void;
  onReports: () => void;
}) {
  const [insights, setInsights] = useState<Insights | null>(null),
    [error, setError] = useState(""),
    [simulation, setSimulation] = useState(0);
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
    committed =
      pending
        .filter((p) => !p.card_id && p.due_date <= monthEnd)
        .reduce((n, p) => n + p.amount_cents, 0) +
      cards
        .filter((c) => c.card_type === "credit")
        .reduce((n, c) => n + c.debt_cents, 0),
    total = accounts.reduce((n, a) => n + a.balance_cents, 0),
    free = availability?.available_cents ?? total - committed,
    next = pending[0];
  const selectedExpenses =
    insights?.monthly.find((m) => m.month === selectedMonth)?.expense_cents ??
    0;
  const simulationMax = Math.max(50000, Math.max(0, free));
  const simulated = Math.min(simulation, simulationMax);
  const max = Math.max(
    1,
    ...(insights?.monthly.map((m) => m.expense_cents) || []),
  );
  return (
    <div className="stack home-reference">
      <div className="home-top-grid">
        <section className="spend-card">
          <div className="overline">LIBRE PARA GASTAR</div>
          <p className="spend-subtitle">
            Lo que puedes usar sin descuidar tus pagos ni tus metas
          </p>
          <strong className="spend-value">{money(free)}</strong>
          <div
            className="balance-track"
            role="img"
            aria-label={`Total ${money(total)}, comprometido ${money(availability?.committed_cents ?? committed)}`}
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
              Comprometido{" "}
              <b>{money(availability?.committed_cents ?? committed)}</b>
            </span>
          </div>
          {availability && (
            <details className="spend-hint">
              <summary>Ver cálculo</summary>
              <p className="spend-hint">
                Saldo menos pagos del mes, deuda de crédito y metas que
                decidiste reservar. No duplica los pagos de tarjeta vinculados.
              </p>

              <p>
                Pagos: {money(availability.scheduled_cents)} · Crédito:{" "}
                {money(availability.credit_debt_cents)} · Metas reservadas:{" "}
                {money(availability.reserved_cents)}
              </p>
            </details>
          )}
          <div className="spending-simulator">
            <label htmlFor="simulate-expense">
              ¿Y si gasto <b>{money(simulated)}</b>? Te quedarían{" "}
              <b className={free - simulated < 0 ? "overdue-text" : ""}>
                {money(free - simulated)}
              </b>
            </label>
            <input
              id="simulate-expense"
              type="range"
              min="0"
              max={simulationMax}
              step="100"
              value={simulated}
              onChange={(e) => setSimulation(Number(e.target.value))}
            />
            <small>Solo una simulación; no registra un gasto.</small>
          </div>
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
            <h2>Próximos pagos</h2>
            <button className="link" onClick={onPayments}>
              Ver pagos
            </button>
          </div>
          {next ? (
            pending.slice(0, 3).map((payment) => (
              <button
                key={payment.id}
                className="next-payment-button"
                onClick={onPayments}
              >
                <DateBadge day={payment.due_date} />
                <span className="grow">
                  <strong>{payment.name}</strong>
                  <small>
                    {dueLabel(payment.due_date)} ·{" "}
                    {accounts.find((a) => a.id === payment.account_id)?.name}
                  </small>
                </span>
                <b>{money(payment.amount_cents)}</b>
              </button>
            ))
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
            <h2>Gasto de {monthName(selectedMonth + "-01")}</h2>
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
                {selectedExpenses
                  ? `${money(selectedExpenses)} registrados · toca una barra para cambiar de mes`
                  : "Sin gastos en este mes · toca una barra para cambiar de mes"}
              </p>
              <div
                className="mini-chart"
                aria-label="Gastos de los últimos seis meses"
              >
                {insights.monthly.map((m) => (
                  <button
                    type="button"
                    key={m.month}
                    aria-label={
                      "Ver gastos de " +
                      monthName(m.month + "-01") +
                      " " +
                      m.month.slice(0, 4)
                    }
                    aria-pressed={selectedMonth === m.month}
                    onClick={() => onSelectMonth(m.month)}
                  >
                    <i
                      title={`${monthName(m.month + "-01")}: ${money(m.expense_cents)}`}
                      style={{ height: (m.expense_cents / max) * 100 + "%" }}
                      className={selectedMonth === m.month ? "current" : ""}
                    />
                    <small>{monthName(m.month + "-01").slice(0, 3)}</small>
                  </button>
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
