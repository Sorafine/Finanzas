import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Coins,
  Wallet,
  BarChart3,
} from "lucide-react";
import {
  Account,
  Card,
  Movement,
  req,
  money,
  dateLabel,
  localToday,
} from "../../shared/api";
import MovementRow from "../../shared/MovementRow";
import CardVisual from "./CardVisual";
type Report = {
  card: Card;
  account: Account;
  year: number;
  month: number;
  credit: {
    limit_cents: number;
    debt_cents: number;
    available_cents: number;
    used_percent: number | null;
    next_closing_date: string | null;
    next_due_date: string | null;
  } | null;
  account_activity: {
    expense_cents: number;
    income_cents: number;
    withdrawal_cents: number;
    fee_cents: number;
    expense_count: number;
    movement_count: number;
  };
  monthly: { month: number; expense_cents: number; income_cents: number }[];
  categories: { category: string; amount_cents: number }[];
  recent: (Movement & { account_name: string })[];
  card_activity: Report["account_activity"];
  card_monthly: Report["monthly"];
  card_categories: Report["categories"];
  card_recent: Report["recent"];
};
export default function CardReport({
  cardId,
  onBack,
  onHistory,
}: {
  cardId: number;
  onBack: () => void;
  onHistory: (id: number) => void;
}) {
  const [year, setYear] = useState(Number(localToday().slice(0, 4))),
    [month, setMonth] = useState(Number(localToday().slice(5, 7))),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    req<Report>(`/cards/${cardId}/report?year=${year}&month=${month}`)
      .then((r) => {
        if (active)
          setReport({
            ...r,
            account_activity: r.card_activity,
            monthly: r.card_monthly,
            categories: r.card_categories,
            recent: r.card_recent,
          });
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cardId, year, month, retry]);
  const months = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const max = Math.max(
    1,
    ...(report?.monthly.map((m) => m.expense_cents) || []),
  );
  return (
    <div className="stack card-report">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} /> Volver a mis tarjetas
      </button>
      <div className="section-head">
        <h2>Informe de tu tarjeta</h2>
        <BarChart3 size={22} />
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button className="link" onClick={() => setRetry((x) => x + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {report && (
        <>
          <section className="card-report-overview">
            <CardVisual card={report.card} account={report.account} />
            <article className="panel credit-snapshot">
              <h2>
                {report.credit ? "Así está tu crédito" : "Tu tarjeta de débito"}
              </h2>
              {report.credit ? (
                <>
                  <div className="credit-numbers">
                    <div>
                      <small>Deuda registrada</small>
                      <strong>{money(report.credit.debt_cents)}</strong>
                    </div>
                    <div>
                      <small>Crédito disponible</small>
                      <strong className="positive">
                        {money(report.credit.available_cents)}
                      </strong>
                    </div>
                  </div>
                  <div className="utilization-line">
                    <span>Límite: {money(report.credit.limit_cents)}</span>
                    <b>
                      {report.credit.used_percent === null
                        ? "Sin límite registrado"
                        : `${report.credit.used_percent}% utilizado`}
                    </b>
                  </div>
                  <div
                    className="progress credit-progress"
                    role="progressbar"
                    aria-label="Uso del límite de crédito"
                    aria-valuenow={report.credit.used_percent ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <i
                      style={{ width: (report.credit.used_percent ?? 0) + "%" }}
                    />
                  </div>
                  <div className="card-dates">
                    <span>
                      <CalendarDays size={16} />
                      <span>
                        Cierre
                        <small>
                          {report.credit.next_closing_date
                            ? dateLabel(report.credit.next_closing_date)
                            : "Sin configurar"}
                        </small>
                      </span>
                    </span>
                    <span>
                      <CalendarDays size={16} />
                      <span>
                        Pago
                        <small>
                          {report.credit.next_due_date
                            ? dateLabel(report.credit.next_due_date)
                            : "Sin configurar"}
                        </small>
                      </span>
                    </span>
                  </div>
                  <p className="hint">
                    Los consumos registrados con esta tarjeta aumentan la deuda;
                    los pagos la reducen. La deuda inicial y los ajustes se
                    registran al editar la tarjeta.
                  </p>
                </>
              ) : (
                <>
                  <div className="detail-amount">
                    {money(report.account.balance_cents)}
                  </div>
                  <p className="muted">
                    Saldo de {report.account.name}. La tarjeta utiliza el dinero
                    de esa cuenta.
                  </p>
                </>
              )}
            </article>
          </section>
          <section className="panel account-report-intro">
            <div className="section-head">
              <div>
                <h2>Actividad de {report.card.name}</h2>
                <p className="muted">
                  Consumos y pagos asignados expresamente a esta tarjeta.
                </p>
              </div>
              <div className="period-selector">
                <label>
                  Mes
                  <select
                    aria-label="Mes del informe"
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                  >
                    {months.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Año
                  <select
                    aria-label="Año del informe"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                  >
                    {Array.from(
                      { length: 6 },
                      (_, i) => Number(localToday().slice(0, 4)) - i,
                    ).map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <p className="scope-note">
              Las compras antiguas o guardadas sin seleccionar tarjeta
              permanecen en el historial de la cuenta. No se atribuyen
              automáticamente a esta tarjeta.
            </p>
          </section>
          {loading ? (
            <p role="status">Actualizando informe…</p>
          ) : (
            <>
              <div className="card-report-kpis">
                <article className="stat">
                  <Coins size={20} />
                  <small>Consumos de la tarjeta</small>
                  <strong>
                    {money(
                      report.account_activity.expense_cents +
                        report.account_activity.fee_cents,
                    )}
                  </strong>
                </article>
                <article className="stat">
                  <Wallet size={20} />
                  <small>Pagos de la tarjeta</small>
                  <strong className="positive">
                    {money(report.account_activity.income_cents)}
                  </strong>
                </article>
                <article className="stat">
                  <BarChart3 size={20} />
                  <small>Compras registradas</small>
                  <strong>{report.account_activity.expense_count}</strong>
                </article>
              </div>
              <section className="panel">
                <div className="section-head">
                  <h2>Gastos por mes</h2>
                  <span className="badge">{year}</span>
                </div>
                <div className="card-month-chart">
                  {report.monthly.map((m) => (
                    <div
                      key={m.month}
                      className={m.month === month ? "selected" : ""}
                    >
                      <div className="card-chart-track">
                        <span
                          style={{
                            height:
                              Math.max(
                                m.expense_cents ? 3 : 0,
                                (m.expense_cents / max) * 100,
                              ) + "%",
                          }}
                          title={`${months[m.month - 1]}: ${money(m.expense_cents)}`}
                        />
                      </div>
                      <small>{months[m.month - 1].slice(0, 3)}</small>
                      <span className="sr-only">{money(m.expense_cents)}</span>
                    </div>
                  ))}
                </div>
                <p className="hint">
                  Consumos asignados a esta tarjeta. Los pagos de deuda se
                  muestran por separado y no cuentan como compras.
                </p>
              </section>
              <div className="card-report-details">
                <section className="panel">
                  <h2>¿En qué se fue el dinero?</h2>
                  {report.categories.length ? (
                    report.categories.map((c) => (
                      <div className="category-row" key={c.category}>
                        <div>
                          <span>{c.category}</span>
                          <strong>{money(c.amount_cents)}</strong>
                        </div>
                        <div className="progress">
                          <i
                            style={{
                              width:
                                (c.amount_cents /
                                  Math.max(
                                    1,
                                    report.account_activity.expense_cents,
                                  )) *
                                  100 +
                                "%",
                            }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty compact">
                      No registraste compras en este mes.
                    </div>
                  )}
                </section>
                <section className="panel">
                  <div className="section-head">
                    <h2>Movimientos del mes</h2>
                    <button
                      className="link"
                      onClick={() => onHistory(report.account.id)}
                    >
                      Historial de la cuenta →
                    </button>
                  </div>
                  {report.recent.length ? (
                    report.recent.map((m) => (
                      <MovementRow key={m.id} item={m} />
                    ))
                  ) : (
                    <div className="empty compact">
                      No hay movimientos en el periodo seleccionado.
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </>
      )}
      {loading && !report && (
        <div className="panel empty" role="status">
          Preparando tu informe…
        </div>
      )}
    </div>
  );
}
