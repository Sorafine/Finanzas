import { useEffect, useState } from "react";
import {
  Account,
  HistoryResult,
  HistoryItem,
  req,
  money,
  dateLabel,
  localToday,
  dateShift,
} from "../shared/api";
import MovementRow, { movementKind } from "../shared/MovementRow";
import Modal from "../shared/Modal";
type Filters = {
  q: string;
  kind: string;
  account: string;
  from: string;
  to: string;
};
export default function Historial({
  accounts,
  initialAccount = "",
  initialKind = "all",
}: {
  accounts: Account[];
  initialAccount?: string;
  initialKind?: string;
}) {
  const month = localToday().slice(0, 7) + "-01";
  const initial = {
    q: "",
    kind: initialKind,
    account: initialAccount,
    from: initialAccount || initialKind === "payment" ? "" : month,
    to: initialAccount || initialKind === "payment" ? "" : localToday(),
  };
  const [draft, setDraft] = useState<Filters>(initial),
    [filters, setFilters] = useState<Filters>(initial),
    [page, setPage] = useState(1),
    [data, setData] = useState<HistoryResult | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<HistoryItem | null>(null),
    [retry, setRetry] = useState(0),
    [showFilters, setShowFilters] = useState(false),
    [period, setPeriod] = useState(initial.from ? "month" : "all");
  function params() {
    const p = new URLSearchParams({ kind: filters.kind, q: filters.q });
    if (filters.account) p.set("account_id", filters.account);
    if (filters.from) p.set("date_from", filters.from);
    if (filters.to) p.set("date_to", filters.to);
    return p;
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    req<HistoryResult>("/history?" + params() + "&page=" + page)
      .then((x) => {
        if (active) setData(x);
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
  }, [filters, page, retry]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((f) => (f.q === draft.q ? f : { ...f, q: draft.q }));
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft.q]);
  function dates(value: string) {
    const today = localToday();
    const from =
      value === "month"
        ? month
        : value === "today"
          ? today
          : value === "week"
            ? dateShift(today, -6)
            : "";
    const patch = { from, to: from ? today : "" };
    setPeriod(value);
    setDraft((d) => ({ ...d, ...patch }));
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }
  function kind(value: string) {
    setDraft((d) => ({ ...d, kind: value }));
    setFilters((f) => ({ ...f, kind: value }));
    setPage(1);
  }
  function reset() {
    const f = { q: "", kind: "all", account: "", from: "", to: "" };
    setDraft(f);
    setFilters(f);
    setPeriod("all");
    setPage(1);
  }
  const groups = new Map<string, HistoryItem[]>();
  data?.items.forEach((item) => {
    const day = new Date(Date.parse(item.created_at) - 5 * 3600000)
      .toISOString()
      .slice(0, 10);
    groups.set(day, [...(groups.get(day) || []), item]);
  });
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 30));
  return (
    <div className="stack history-reference">
      <div className="page-actions align-end">
        <a
          className="secondary"
          href={"/api/history?" + params() + "&format=csv"}
          download
        >
          Exportar
        </a>
      </div>
      <div className="filter-chips" aria-label="Filtros rápidos">
        {[
          ["month", "Este mes"],
          ["today", "Hoy"],
          ["week", "Semana"],
          ["all", "Todo"],
        ].map(([id, name]) => (
          <button
            key={id}
            aria-pressed={period === id}
            className={period === id ? "selected" : ""}
            onClick={() => dates(id)}
          >
            {name}
          </button>
        ))}
        {[
          ["expense", "Gastos"],
          ["income", "Ingresos"],
          ["transfer", "Transferencias"],
        ].map(([id, name]) => (
          <button
            key={id}
            aria-pressed={filters.kind === id}
            className={filters.kind === id ? "selected" : ""}
            onClick={() => kind(filters.kind === id ? "all" : id)}
          >
            {name}
          </button>
        ))}
        <button
          aria-expanded={showFilters}
          onClick={() => setShowFilters((x) => !x)}
        >
          Más filtros
        </button>
      </div>
      <label className="history-search">
        <span className="sr-only">Buscar movimiento</span>
        <input
          aria-label="Buscar movimiento"
          maxLength={150}
          placeholder="Buscar: internet, comida…"
          value={draft.q}
          onChange={(e) => setDraft({ ...draft, q: e.target.value })}
        />
      </label>
      {showFilters && (
        <form
          className="panel form history-advanced"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ ...draft });
            setPeriod("custom");
            setPage(1);
          }}
        >
          <div className="filter-grid">
            <label>
              Tipo
              <select
                aria-label="Tipo"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              >
                <option value="all">Todos</option>
                <option value="payment">Pagos confirmados</option>
                <option value="expense">Gastos</option>
                <option value="income">Ingresos</option>
                <option value="transfer">Transferencias</option>
              </select>
            </label>
            <label>
              Cuenta
              <select
                aria-label="Cuenta"
                value={draft.account}
                onChange={(e) =>
                  setDraft({ ...draft, account: e.target.value })
                }
              >
                <option value="">Todas las cuentas</option>
                {accounts.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Desde
              <input
                type="date"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                min={draft.from || undefined}
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </label>
          </div>
          <div className="filter-actions">
            <button className="primary">Aplicar filtros</button>
            <button type="button" className="link" onClick={reset}>
              Limpiar filtros
            </button>
          </div>
        </form>
      )}
      {filters.account && (
        <p className="hint">
          Cuenta: {accounts.find((a) => String(a.id) === filters.account)?.name}{" "}
          <button className="link" onClick={reset}>
            Ver todo
          </button>
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button className="link" onClick={() => setRetry((x) => x + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Cargando historial…</p>
      ) : (
        !error &&
        data && (
          <>
            <div className="history-summary">
              <div>
                <small>Ingresos</small>
                <strong className="positive">
                  {money(data.totals.income_cents)}
                </strong>
              </div>
              <div>
                <small>Gastos</small>
                <strong>{money(data.totals.expense_cents)}</strong>
              </div>
              <div>
                <small>Neto del periodo</small>
                <strong
                  className={
                    data.totals.income_cents >= data.totals.expense_cents
                      ? "positive"
                      : ""
                  }
                >
                  {money(data.totals.income_cents - data.totals.expense_cents)}
                </strong>
              </div>
            </div>
            <section className="panel history-entries">
              {[...groups].map(([day, items]) => (
                <div className="history-day" key={day}>
                  <h2>
                    {day === localToday()
                      ? "HOY"
                      : day === dateShift(localToday(), -1)
                        ? "AYER"
                        : dateLabel(day)}
                  </h2>
                  {items.map((m) => (
                    <MovementRow
                      compact
                      key={m.id}
                      item={m}
                      onOpen={() => setSelected(m)}
                    />
                  ))}
                </div>
              ))}
              {!data.items.length && (
                <div className="empty">
                  <h3>Sin movimientos en este periodo</h3>
                  <p>Prueba otras fechas o consulta todo el historial.</p>
                  <button className="link" onClick={reset}>
                    Ver todo el historial
                  </button>
                </div>
              )}
              {data.total > 30 && (
                <div className="pagination">
                  <button
                    className="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {page} de {pages}
                  </span>
                  <button
                    className="secondary"
                    disabled={page >= pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </section>
            <p className="hint">
              {data.total} movimientos · Las transferencias no son gastos; sus
              comisiones sí.
            </p>
          </>
        )
      )}
      {selected && (
        <Modal title="Detalle del movimiento" onClose={() => setSelected(null)}>
          <div className="detail-amount">{money(selected.amount_cents)}</div>
          <h3>{selected.concept}</h3>
          <dl className="detail-list">
            <dt>Tipo</dt>
            <dd>{movementKind(selected.kind)}</dd>
            <dt>Fecha del movimiento</dt>
            <dd>{dateLabel(selected.created_at)}</dd>
            <dt>Cuenta</dt>
            <dd>{selected.account_name}</dd>
            {selected.destination_name && (
              <>
                <dt>Destino</dt>
                <dd>{selected.destination_name}</dd>
              </>
            )}
            {selected.fee_cents > 0 && (
              <>
                <dt>Comisión</dt>
                <dd>{money(selected.fee_cents)}</dd>
              </>
            )}
            <dt>Categoría</dt>
            <dd>{selected.category || "Sin categoría"}</dd>
            <dt>Origen</dt>
            <dd>
              {
                {
                  manual: "Registrado por ti",
                  gmail: "Comprobante de Gmail",
                  payment: "Pago programado confirmado",
                }[selected.source]
              }
            </dd>
            {selected.payment_due_date && (
              <>
                <dt>Vencimiento pagado</dt>
                <dd>{dateLabel(selected.payment_due_date)}</dd>
                <dt>Estado</dt>
                <dd>Pagado</dd>
              </>
            )}
            <dt>Referencia</dt>
            <dd>Registro #{selected.id}</dd>
          </dl>
          <button
            className="secondary full-width"
            onClick={() => setSelected(null)}
          >
            Cerrar detalle
          </button>
        </Modal>
      )}
    </div>
  );
}
