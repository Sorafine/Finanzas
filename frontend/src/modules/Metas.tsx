import { useEffect, useState } from "react";
import { Target, Plus } from "lucide-react";
import { goalIcons } from "../shared/FinanceUI";
import { req, money, cents, dateLabel } from "../shared/api";
import Modal from "../shared/Modal";
type Goal = {
  id: number;
  name: string;
  target_cents: number;
  saved_cents: number;
  target_date: string | null;
  icon: string;
  reserve: number;
};
export default function Metas({
  onChanged,
}: {
  onChanged?: () => Promise<void>;
}) {
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
  const [icon, setIcon] = useState("travel");
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
            icon,
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
      await onChanged?.();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack metas-reference">
      <div className="page-actions align-end">
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
            <div className="goal-title">
              <span className="goal-symbol">
                {(() => {
                  const Icon =
                    goalIcons.find((i) => i.id === g.icon)?.icon || Target;
                  return <Icon size={23} />;
                })()}
              </span>
              <h2>{g.name}</h2>
            </div>
            <p className="hint">
              Faltan {money(Math.max(0, g.target_cents - g.saved_cents))}
              {g.target_date
                ? ` · meta ${dateLabel(g.target_date)}`
                : " · Sin fecha límite"}
            </p>
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
            <div className="goal-amounts">
              <strong>{money(g.saved_cents)}</strong>
              <small>de {money(g.target_cents)}</small>
            </div>
            <button
              className="link goal-update"
              onClick={() => {
                setSelected(g);
                setAmount("");
                setFormError("");
              }}
            >
              Actualizar progreso
            </button>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!g.reserve}
                disabled={busy}
                onChange={(e) => {
                  setBusy(true);
                  setError("");
                  const reserve = e.target.checked;
                  setGoals((current) =>
                    current.map((goal) =>
                      goal.id === g.id
                        ? { ...goal, reserve: Number(reserve) }
                        : goal,
                    ),
                  );
                  void req(`/goals/${g.id}/reserve`, {
                    method: "PATCH",
                    body: JSON.stringify({ reserve }),
                  })
                    .then(async () => {
                      await refresh();
                      await onChanged?.();
                    })
                    .catch((e) => {
                      setGoals((current) =>
                        current.map((goal) =>
                          goal.id === g.id
                            ? { ...goal, reserve: g.reserve }
                            : goal,
                        ),
                      );
                      setError(e.message);
                    })
                    .finally(() => setBusy(false));
                }}
              />
              Reservar lo ahorrado del dinero disponible
            </label>
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
        Reservar reduce Libre para gastar, sin mover dinero entre cuentas.
        Actívalo solo si lo ahorrado sigue incluido en los saldos de Balance.
        Sin marcarlo, el progreso es informativo.
      </p>
      <section className="panel goal-icon-intro">
        <h2>Nueva meta · elige un icono</h2>
        <p className="muted">
          Toca el que mejor represente lo que quieres lograr
        </p>
        <div className="goal-icon-grid">
          {goalIcons.map((i) => (
            <button
              type="button"
              key={i.id}
              onClick={() => {
                setIcon(i.id);
                setCreate(true);
                setAmount("");
                setFormError("");
              }}
            >
              <span>
                <i.icon size={24} />
              </span>
              <small>{i.name}</small>
            </button>
          ))}
        </div>
      </section>
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
              <div className="goal-icon-grid compact">
                {goalIcons.map((i) => (
                  <button
                    type="button"
                    key={i.id}
                    aria-pressed={icon === i.id}
                    className={icon === i.id ? "selected" : ""}
                    onClick={() => setIcon(i.id)}
                  >
                    <span>
                      <i.icon size={21} />
                    </span>
                    <small>{i.name}</small>
                  </button>
                ))}
              </div>
            )}
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
