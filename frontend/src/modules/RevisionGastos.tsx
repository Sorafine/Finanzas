import { useEffect, useState } from "react";
import { Account, req, money, cents } from "../shared/api";
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
  reload,
  onConnect,
}: {
  accounts: Account[];
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
    const result = await req<{ already_imported?: boolean }>(
      "/google/gmail/import",
      {
        method: "POST",
        body: JSON.stringify({
          gmail_id: selected.gmail_id,
          account_id: Number(account),
          amount_cents: value,
          concept: concept.trim(),
          category: "Otros",
        }),
      },
    );
    setList((previous) =>
      previous.filter((x) => x.gmail_id !== selected.gmail_id),
    );
    setSelected(null);
    setNotice(
      result.already_imported
        ? "Este correo ya estaba registrado."
        : "Gasto registrado. Tu saldo está actualizado.",
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
            <p>{x.snippet}</p>
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
          registrarse una vez; distintos correos sobre la misma compra deben
          descartarse manualmente.
        </p>
      </section>
      {selected && (
        <div className="modal-overlay">
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gmail-confirm"
          >
            <div className="modal-heading">
              <h2 id="gmail-confirm">Revisa tu gasto</h2>
              <button
                className="icon-button"
                aria-label="Cerrar"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
            <p className="hint">Se descontará de la cuenta que elijas.</p>
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
                Cuenta
                <select
                  required
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {money(a.balance_cents)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary" disabled={busy || !account}>
                {busy ? "Guardando…" : "Confirmar gasto"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
