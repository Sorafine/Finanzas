import { useEffect, useState } from "react";
import {
  Account,
  Card,
  req,
  money,
  cents,
  localToday,
  dateLabel,
} from "../shared/api";
import Modal from "../shared/Modal";
type Status = { configured: boolean; connected: boolean; enabled?: boolean };
type Suggestion = {
  gmail_id: string;
  subject: string;
  sender: string;
  snippet: string;
  amount_cents: number | null;
};
export default function RevisionGastos({
  accounts,
  cards = [],
  reload,
  onConnect,
}: {
  accounts: Account[];
  cards?: Card[];
  reload: () => Promise<void>;
  onConnect: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [list, setList] = useState<Suggestion[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [checked, setChecked] = useState(false);
  const [selected, setSelected] = useState<Suggestion | null>(null),
    [amount, setAmount] = useState(""),
    [concept, setConcept] = useState(""),
    [account, setAccount] = useState("");
  const [day, setDay] = useState(localToday()),
    [cardId, setCardId] = useState(""),
    [existing, setExisting] = useState(""),
    [allowDuplicate, setAllowDuplicate] = useState(false),
    [matches, setMatches] = useState<
      { id: number; concept: string; created_at: string }[]
    >([]),
    [checking, setChecking] = useState(false);
  useEffect(() => {
    let active = true;
    setExisting("");
    setAllowDuplicate(false);
    setMatches([]);
    if (selected && cents(amount) > 0 && account) {
      setChecking(true);
      const q = new URLSearchParams({
        amount_cents: String(cents(amount)),
        account_id: account,
        occurred_on: day,
      });
      if (cardId) q.set("card_id", cardId);
      void req<typeof matches>("/expense-matches?" + q)
        .then((r) => {
          if (active) setMatches(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setChecking(false);
        });
    } else setChecking(false);
    return () => {
      active = false;
    };
  }, [selected?.gmail_id, amount, account, day, cardId]);
  async function read() {
    const response = await req<{ suggestions: Suggestion[] }>(
      "/google/gmail/suggestions",
    );
    setList(response.suggestions);
    setChecked(true);
  }
  useEffect(() => {
    let active = true;
    req<Status>("/google/status")
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  // Poll only while this screen is open; Gmail never modifies money by itself.
  useEffect(() => {
    if (!status?.connected || status.enabled === false) return;
    let running = false;
    const poll = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        await read();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 60000);
    return () => window.clearInterval(timer);
  }, [status?.connected, status?.enabled]);
  async function execute(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function select(x: Suggestion) {
    setSelected(x);
    setDay(localToday());
    setCardId("");
    setExisting("");
    setAllowDuplicate(false);
    setAmount(x.amount_cents ? String(x.amount_cents / 100) : "");
    setConcept((x.subject || "Compra detectada en Gmail").slice(0, 150));
    setAccount(String(accounts[0]?.id || ""));
    setError("");
  }
  async function confirm() {
    if (!selected) return;
    const value = cents(amount);
    if (!Number.isFinite(value) || value <= 0)
      throw new Error("Revisa el importe del gasto");
    const result = await req<{
      already_imported?: boolean;
      linked_existing?: boolean;
    }>("/google/gmail/import", {
      method: "POST",
      body: JSON.stringify({
        gmail_id: selected.gmail_id,
        account_id: Number(account),
        amount_cents: value,
        concept: concept.trim(),
        category: "Otros",
        occurred_on: day,
        card_id: cardId ? Number(cardId) : null,
        existing_movement_id: existing ? Number(existing) : null,
        allow_duplicate: allowDuplicate,
      }),
    });
    setList((previous) =>
      previous.filter((x) => x.gmail_id !== selected.gmail_id),
    );
    setSelected(null);
    setNotice(
      result.already_imported
        ? "Este correo ya estaba registrado."
        : result.linked_existing
          ? "Comprobante vinculado al consumo existente. No se descontó otra vez."
          : "Consumo registrado. Saldo y deuda actualizados según el medio de pago.",
    );
    await reload();
  }
  return (
    <div className="connections-module">
      <p className="muted">
        Revisa los consumos detectados en tu correo, elige la cuenta y confirma
        los que quieras registrar.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-msg" role="status">
          {notice}
        </p>
      )}
      {status?.enabled === false ? (
        <div className="panel">
          <p>El administrador ha pausado las conexiones de Google.</p>
        </div>
      ) : (
        !status?.connected && (
          <div className="panel">
            <p>Conecta tu Gmail para recibir consumos en esta pantalla.</p>
            <button className="secondary" onClick={onConnect}>
              Ir a mis conexiones
            </button>
          </div>
        )
      )}
      <section className="panel">
        <div className="section-head">
          <h2>Gastos en tu Gmail</h2>
          <span className="badge">{list.length} por revisar</span>
        </div>
        <p className="muted">
          Buscamos comprobantes de consumos realizados en soles. Excluimos
          promociones, transferencias y recordatorios de pago.
        </p>
        <div className="connection-actions">
          <button
            className="primary"
            disabled={!status?.connected || status.enabled === false || busy}
            onClick={() => void execute(read)}
          >
            {busy ? "Buscando…" : "Buscar consumos en Gmail"}
          </button>
        </div>
        {checked && !list.length && (
          <p className="empty">
            No hay nuevos comprobantes de consumo por revisar.
          </p>
        )}
        {list.map((x) => (
          <article key={x.gmail_id} className="gmail-suggestion">
            <strong>{x.subject || "Sin asunto"}</strong>
            <small>{x.sender}</small>
            <details className="receipt-preview">
              <summary>Ver comprobante</summary>
              <p>{x.snippet}</p>
            </details>
            <b>
              {x.amount_cents
                ? `Importe sugerido: ${money(x.amount_cents)}`
                : "Revisa el importe en el comprobante"}
            </b>
            <div className="connection-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => select(x)}
              >
                Registrar consumo
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void execute(async () => {
                    await req("/google/gmail/review", {
                      method: "POST",
                      body: JSON.stringify({
                        gmail_id: x.gmail_id,
                        status: "dismissed",
                      }),
                    });
                    setList((previous) =>
                      previous.filter((m) => m.gmail_id !== x.gmail_id),
                    );
                  })
                }
              >
                Descartar
              </button>
            </div>
          </article>
        ))}
        <p className="hint">
          Revisa el importe y la cuenta antes de confirmar. Un correo solo puede
          registrarse una vez. Si hay consumos del mismo importe en fechas
          cercanas, podrás vincular el correo al movimiento existente.
        </p>
      </section>
      {selected && (
        <Modal
          title="Revisa tu gasto"
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <p className="hint">
            Usa la fecha y medio de pago del comprobante. Si ya existe el
            consumo, vincúlalo para evitar duplicarlo.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void execute(confirm);
            }}
          >
            <label>
              Importe (S/)
              <input
                autoFocus
                required
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              ¿En qué gastaste?
              <input
                required
                maxLength={150}
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
              />
            </label>
            <label>
              Fecha del consumo
              <input
                required
                type="date"
                max={localToday()}
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            {cards.length > 0 && (
              <label>
                Medio de pago
                <select
                  value={cardId}
                  onChange={(e) => {
                    setCardId(e.target.value);
                    const card = cards.find(
                      (c) => String(c.id) === e.target.value,
                    );
                    if (card) setAccount(String(card.account_id));
                  }}
                >
                  <option value="">Sin tarjeta · saldo de cuenta</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.last_four}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Cuenta
              <select
                required
                value={account}
                disabled={!!cardId}
                onChange={(e) => setAccount(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {money(a.balance_cents)}
                  </option>
                ))}
              </select>
            </label>
            {checking && <p role="status">Buscando consumos parecidos…</p>}
            {matches.length > 0 && (
              <div className="subform form">
                <p>
                  Hay consumos del mismo importe en esta cuenta y fechas
                  cercanas. No significa necesariamente que sean la misma
                  compra.
                </p>
                <label>
                  Vincular comprobante
                  <select
                    aria-label="Vincular comprobante"
                    value={existing}
                    onChange={(e) => setExisting(e.target.value)}
                  >
                    <option value="">Elegir un consumo existente</option>
                    {matches.map((m) => (
                      <option key={m.id} value={m.id}>
                        #{m.id} · {m.concept} · {dateLabel(m.created_at)}
                      </option>
                    ))}
                  </select>
                </label>
                {!existing && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={allowDuplicate}
                      onChange={(e) => setAllowDuplicate(e.target.checked)}
                    />
                    Es otra compra: registrar un consumo nuevo
                  </label>
                )}
              </div>
            )}
            <button
              className="primary"
              disabled={
                busy ||
                checking ||
                !account ||
                (matches.length > 0 && !existing && !allowDuplicate)
              }
            >
              {busy
                ? "Guardando…"
                : existing
                  ? "Vincular sin descontar"
                  : "Confirmar gasto"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
