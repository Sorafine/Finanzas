import { useEffect, useState } from "react";
import { Target, Plus } from "lucide-react";
import { req, money, cents, dateLabel } from "../shared/api";
import Modal from "../shared/Modal";
type Goal = {
  id: number;
  name: string;
  target_cents: number;
  saved_cents: number;
  target_date: string | null;
};
export default function Metas() {
  const [goals, setGoals] = useState<Goal[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [create, setCreate] = useState(false),
    [selected, setSelected] = useState<Goal | null>(null),
    [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [due, setDue] = useState(""),
    [formError, setFormError] = useState("");
  const refresh = async () => setGoals(await req<Goal[]>("/goals"));
  useEffect(() => {
    void refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError("");
    try {
      if (selected) {
        await req(`/goals/${selected.id}/contribute`, {
          method: "POST",
          body: JSON.stringify({ amount_cents: cents(amount) }),
        });
        setNotice("Progreso actualizado. El saldo de tus cuentas no cambió.");
      } else {
        await req("/goals", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            target_cents: cents(amount),
            target_date: due || null,
          }),
        });
        setNotice("Meta creada.");
      }
      setSelected(null);
      setCreate(false);
      setAmount("");
      setName("");
      setDue("");
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="page-actions">
        <p className="muted">
          Tus objetivos de ahorro, separados de los pagos.
        </p>
        <button
          className="primary"
          onClick={() => {
            setCreate(true);
            setAmount("");
            setFormError("");
          }}
        >
          <Plus size={17} /> Nueva meta
        </button>
      </div>
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
      <div className="account-grid">
        {goals.map((g) => (
          <article className="panel" key={g.id}>
            <h2>{g.name}</h2>
            <strong>
              {money(g.saved_cents)}{" "}
              <span className="muted">de {money(g.target_cents)}</span>
            </strong>
            <div
              className="progress"
              role="progressbar"
              aria-label={g.name}
              aria-valuenow={Math.min(
                100,
                Math.round((g.saved_cents / g.target_cents) * 100),
              )}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i
                style={{
                  width:
                    Math.min(100, (g.saved_cents / g.target_cents) * 100) + "%",
                }}
              />
            </div>
            <p className="hint">
              {g.target_date
                ? `Objetivo: ${dateLabel(g.target_date)}`
                : "Sin fecha límite"}
            </p>
            <button
              className="secondary"
              onClick={() => {
                setSelected(g);
                setAmount("");
                setFormError("");
              }}
            >
              Actualizar progreso
            </button>
          </article>
        ))}
      </div>
      {loading ? (
        <p role="status">Cargando metas…</p>
      ) : (
        !goals.length && (
          <div className="panel empty">
            <Target size={34} />
            <h3>¿Para qué te gustaría ahorrar?</h3>
            <p>Crea una meta para un viaje, estudios o tu próxima compra.</p>
            <button
              className="primary"
              onClick={() => {
                setCreate(true);
                setFormError("");
              }}
            >
              Crear mi primera meta
            </button>
          </div>
        )
      )}
      <p className="hint">
        El progreso es informativo: no aparta dinero ni descuenta el saldo de
        tus cuentas.
      </p>
      {(create || selected) && (
        <Modal
          title={selected ? "Actualizar progreso" : "Nueva meta de ahorro"}
          onClose={() => {
            if (!busy) {
              setCreate(false);
              setSelected(null);
            }
          }}
        >
          <form className="form" onSubmit={submit}>
            {formError && (
              <div className="error" role="alert">
                {formError}
              </div>
            )}
            {selected ? (
              <p>
                Registrar ahorro adicional para <strong>{selected.name}</strong>
                .
              </p>
            ) : (
              <label>
                ¿Para qué ahorrarás?
                <input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Mi próxima laptop"
                />
              </label>
            )}
            <label>
              {selected ? "Ahorro adicional (S/)" : "Objetivo (S/)"}
              <input
                required
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {!selected && (
              <label>
                Fecha objetivo (opcional)
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setCreate(false);
                  setSelected(null);
                }}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy
                  ? "Guardando…"
                  : selected
                    ? "Guardar progreso"
                    : "Crear meta"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
