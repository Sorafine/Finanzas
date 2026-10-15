import { useEffect, useState } from "react";
import CategoryDonut from "../shared/CategoryDonut";
import { Insights, req, money, monthName } from "../shared/api";
export default function Reportes({
  selectedMonth,
  onSelectMonth,
}: {
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
}) {
  const [months, setMonths] = useState(6),
    [data, setData] = useState<Insights | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    req<Insights>(`/insights?months=${months}&month=${selectedMonth}`)
      .then((x) => {
        if (active) setData(x);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [months, selectedMonth]);
  const max = Math.max(
    1,
    ...(data?.monthly.flatMap((m) => [m.income_cents, m.expense_cents]) || []),
  );
  return (
    <div className="stack reports-reference">
      <div className="page-actions align-end">
        <label className="report-month-selector">
          Mes del detalle
          <input
            aria-label="Mes del detalle"
            type="month"
            min="2000-01"
            max="2100-12"
            value={selectedMonth}
            onChange={(e) => {
              if (e.target.value) onSelectMonth(e.target.value);
            }}
          />
        </label>
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
                <button
                  type="button"
                  className={
                    "reference-report-month " +
                    (selectedMonth === m.month ? "selected" : "")
                  }
                  key={m.month}
                  onClick={() => onSelectMonth(m.month)}
                  aria-pressed={selectedMonth === m.month}
                  aria-label={
                    "Ver detalle de " +
                    monthName(m.month + "-01") +
                    " " +
                    m.month.slice(0, 4)
                  }
                >
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
                </button>
              ))}
            </div>
            <p className="hint">Verde: ingresos · Azul: gastos</p>
          </section>
          <div className="report-bottom-grid">
            <section className="panel">
              <h2>
                Gasto por categoría ({monthName(selectedMonth + "-01")}{" "}
                {selectedMonth.slice(0, 4)})
              </h2>
              <CategoryDonut categories={data.categories} />
            </section>
            <section className="panel margin-card">
              <small>
                {data.selected.expense_cents > data.selected.income_cents
                  ? "Gastaste más de lo que ingresó"
                  : "Te quedó en este mes"}
              </small>
              <strong>
                {money(
                  data.selected.income_cents - data.selected.expense_cents,
                )}
              </strong>
              <p>
                {data.margin_percent === null
                  ? "Registra ingresos para calcular el margen."
                  : `${data.margin_percent}% de tus ingresos, después de gastos y comisiones.`}
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
