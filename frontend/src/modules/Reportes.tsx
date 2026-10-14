import { useEffect, useState } from "react";
import { Insights, req, money, monthName } from "../shared/api";
export default function Reportes() {
  const [months, setMonths] = useState(6),
    [data, setData] = useState<Insights | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    req<Insights>(`/insights?months=${months}`)
      .then((x) => {
        if (active) setData(x);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [months]);
  const max = Math.max(
      1,
      ...(data?.monthly.flatMap((m) => [m.income_cents, m.expense_cents]) ||
        []),
    ),
    catMax = Math.max(
      1,
      ...(data?.categories.map((c) => c.amount_cents) || []),
    );
  return (
    <div className="stack reports-reference">
      <div className="page-actions align-end">
        <div className="filter-chips" aria-label="Periodo del reporte">
          {[3, 6, 12].map((n) => (
            <button
              key={n}
              aria-pressed={months === n}
              className={months === n ? "selected" : ""}
              onClick={() => setMonths(n)}
            >
              {n === 12 ? "Año" : `${n} meses`}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!data && !error && <p role="status">Preparando tus reportes…</p>}
      {data && (
        <>
          <section className="panel">
            <h2>Ingresos y gastos</h2>
            <div className="reference-report-chart">
              {data.monthly.map((m) => (
                <div className="reference-report-month" key={m.month}>
                  <div className="report-bar-pair">
                    <i
                      className="income"
                      style={{ height: (m.income_cents / max) * 100 + "%" }}
                      title={`Ingresos: ${money(m.income_cents)}`}
                    />
                    <i
                      className="expense"
                      style={{ height: (m.expense_cents / max) * 100 + "%" }}
                      title={`Gastos: ${money(m.expense_cents)}`}
                    />
                  </div>
                  <small>
                    {monthName(m.month + "-01").slice(
                      0,
                      months === 12 ? 3 : undefined,
                    )}
                  </small>
                  <span className="sr-only">
                    Ingresos {money(m.income_cents)}, gastos{" "}
                    {money(m.expense_cents)}
                  </span>
                </div>
              ))}
            </div>
            <p className="hint">Verde claro: ingresos · Verde oscuro: gastos</p>
          </section>
          <div className="report-bottom-grid">
            <section className="panel">
              <h2>Gasto por categoría ({monthName()})</h2>
              {data.categories.length ? (
                data.categories.map((c) => (
                  <div className="reference-category" key={c.category}>
                    <span>{c.category}</span>
                    <div className="progress">
                      <i
                        style={{ width: (c.amount_cents / catMax) * 100 + "%" }}
                      />
                    </div>
                    <b>{money(c.amount_cents)}</b>
                  </div>
                ))
              ) : (
                <p className="muted">Aún no registras gastos este mes.</p>
              )}
            </section>
            <section className="panel margin-card">
              <small>
                {data.margin_percent !== null && data.margin_percent < 0
                  ? "Gastaste más de lo que ingresó"
                  : "Te quedó este mes"}
              </small>
              <strong>
                {data.margin_percent === null ? "—" : `${data.margin_percent}%`}
              </strong>
              <p>
                {data.margin_percent === null
                  ? "Registra ingresos para calcular el margen."
                  : "de tus ingresos, después de gastos y comisiones."}
                {data.previous_margin_percent !== null
                  ? ` Mes anterior: ${data.previous_margin_percent}%.`
                  : ""}
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
