import { useEffect, useState } from "react";
import { Search, ReceiptText } from "lucide-react";
import {
  Account,
  HistoryResult,
  HistoryItem,
  req,
  money,
  dateLabel,
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
  const initial = {
    q: "",
    kind: initialKind,
    account: initialAccount,
    from: "",
    to: "",
  };
  const [draft, setDraft] = useState<Filters>(initial),
    [filters, setFilters] = useState<Filters>(initial),
    [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryResult | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<HistoryItem | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      kind: filters.kind,
      q: filters.q,
    });
    if (filters.account) params.set("account_id", filters.account);
    if (filters.from) params.set("date_from", filters.from);
    if (filters.to) params.set("date_to", filters.to);
    req<HistoryResult>("/history?" + params)
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
  function reset() {
    const empty = { q: "", kind: "all", account: "", from: "", to: "" };
    setDraft(empty);
    setFilters(empty);
    setPage(1);
  }
  const [showFilters, setShowFilters] = useState(Boolean(initialAccount));
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 30));
  return (
    <div className="stack">
      <form
        className="panel history-filters form"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ ...draft });
          setPage(1);
        }}
      >
        <label className="search-field">
          <span>
            <Search size={16} /> Buscar movimiento
          </span>
          <input
            placeholder="Ej. Internet, comida…"
            maxLength={150}
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="link filter-toggle"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((x) => !x)}
        >
          {showFilters ? "Ocultar filtros" : "Filtrar por tipo, cuenta o fecha"}
        </button>
        {showFilters && (
          <div className="filter-grid">
            <label>
              Tipo
              <select
                aria-label="Tipo"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              >
                <option value="all">Todos los movimientos</option>
                <option value="payment">Pagos confirmados</option>
                <option value="expense">Gastos</option>
                <option value="income">Ingresos</option>
                <option value="withdrawal">Retiros de efectivo</option>
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
        )}
        <div className="filter-actions">
          <button className="primary" type="submit">
            Aplicar filtros
          </button>
          <button className="link" type="button" onClick={reset}>
            Limpiar filtros
          </button>
        </div>
      </form>
      {(filters.kind !== "all" ||
        filters.account ||
        filters.from ||
        filters.to) && (
        <div className="active-filters">
          <span className="badge">
            {filters.kind === "payment"
              ? "Pagos confirmados"
              : filters.kind === "expense"
                ? "Gastos"
                : filters.kind === "income"
                  ? "Ingresos"
                  : filters.kind === "withdrawal"
                    ? "Retiros"
                    : "Todos los tipos"}
            {filters.account
              ? ` · ${accounts.find((a) => String(a.id) === filters.account)?.name || "Cuenta"}`
              : ""}
            {filters.from || filters.to ? " · Fechas filtradas" : ""}
          </span>
        </div>
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
        <div className="panel empty" role="status">
          Cargando historial…
        </div>
      ) : (
        !error &&
        data && (
          <>
            <div className="history-summary">
              <div>
                <small>Movimientos encontrados</small>
                <strong>{data.total}</strong>
              </div>
              <div>
                <small>Ingresos</small>
                <strong className="positive">
                  {money(data.totals.income_cents)}
                </strong>
              </div>
              <div>
                <small>Gastos y comisiones</small>
                <strong>{money(data.totals.expense_cents)}</strong>
              </div>
            </div>
            <section className="panel">
              <div className="section-head">
                <h2>
                  {filters.kind === "payment"
                    ? "Pagos confirmados"
                    : "Movimientos"}
                </h2>
                <span className="muted">Más recientes primero</span>
              </div>
              {data.items.length ? (
                data.items.map((m) => (
                  <MovementRow
                    key={m.id}
                    item={m}
                    onOpen={() => setSelected(m)}
                  />
                ))
              ) : (
                <div className="empty">
                  <ReceiptText size={32} />
                  <h3>Sin movimientos en esta búsqueda</h3>
                  <p>Prueba otras fechas o limpia los filtros.</p>
                </div>
              )}
              {data.total > 30 && (
                <div className="pagination">
                  <button
                    className="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((x) => x - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {page} de {pages}
                  </span>
                  <button
                    className="secondary"
                    disabled={page >= pages}
                    onClick={() => setPage((x) => x + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </section>
            <p className="hint">
              Las fechas corresponden a Perú. Los retiros trasladan dinero; solo
              su comisión cuenta como gasto.
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
            <dt>Registrado</dt>
            <dd>
              {dateLabel(selected.created_at)} ·{" "}
              {new Date(selected.created_at).toLocaleTimeString("es-PE", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Lima",
              })}
            </dd>
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
