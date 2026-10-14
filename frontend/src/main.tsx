import RevisionGastos from "./modules/RevisionGastos";
import Administracion from "./modules/Administracion";
import AuthGate from "./shared/AuthGate";
import GmailNotice from "./modules/GmailNotice";
import Reportes from "./modules/Reportes";
import Planes from "./modules/Planes";
import MiDinero from "./modules/MiDinero";
import Conexiones from "./modules/Conexiones";
import { Card, req } from "./shared/api";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Wallet,
  Home,
  PlusCircle,
  CalendarDays,
  BarChart3,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Mail,
  Settings,
} from "lucide-react";
import "./styles.css";

type Account = {
  id: number;
  name: string;
  kind: "bank" | "cash" | "wallet";
  balance_cents: number;
};
type Move = {
  id: number;
  kind: string;
  amount_cents: number;
  concept: string;
  created_at: string;
  classification: string | null;
  category: string | null;
};
type Summary = {
  balance_cents: number;
  income_cents: number;
  expense_cents: number;
};
const money = (c: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    c / 100,
  );
const concepts: Record<string, string[]> = {
  fijo: [
    "Vivienda",
    "Servicios",
    "Internet",
    "Suscripciones",
    "Educación",
    "Transporte",
  ],
  variable: ["Comida", "Compras", "Salidas", "Salud", "Movilidad", "Otros"],
};
function App({
  username,
  onLogout,
  isAdmin,
}: {
  username: string;
  onLogout: () => void;
  isAdmin: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [due, setDue] = useState("");
  const [calendar, setCalendar] = useState(true);
  const [cards, setCards] = useState<Card[]>([]);
  const [notice, setNotice] = useState("");
  const [view, setView] = useState("Inicio");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [summary, setSummary] = useState<Summary>({
    balance_cents: 0,
    income_cents: 0,
    expense_cents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"income" | "expense" | "withdrawal">(
    "expense",
  );
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [accountId, setAccountId] = useState("");
  const [destId, setDestId] = useState("");
  const [fee, setFee] = useState("0");
  const [classification, setClassification] = useState("variable");
  const [category, setCategory] = useState("Comida");
  const [frequency, setFrequency] = useState("mensual");
  const [expanded, setExpanded] = useState(false);
  const load = async () => {
    try {
      setError("");
      const [a, m, s, c] = await Promise.all([
        req<Account[]>("/accounts"),
        req<Move[]>("/movements"),
        req<Summary>("/summary"),
        req<Card[]>("/cards"),
      ]);
      setAccounts(a);
      setMoves(m);
      setSummary(s);
      setCards(c);
      setAccountId((x) => x || String(a[0]?.id ?? ""));
      setDestId((x) => x || String(a.find((v) => v.kind === "cash")?.id ?? ""));
    } catch (e) {
      setError(
        (e as Error).message +
          " — No pudimos cargar tus datos. Intenta actualizar.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const cents = (n: string) => Math.round(Number(n.replace(",", ".")) * 100);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      setError("");
      const value = cents(amount);
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("Ingresa un importe válido");
      const result = await req<{ scheduled_id: number | null }>("/movements", {
        method: "POST",
        body: JSON.stringify({
          kind,
          amount_cents: value,
          concept:
            concept.trim() ||
            {
              expense: "Gasto",
              income: "Ingreso",
              withdrawal: "Retiro de efectivo",
            }[kind],
          account_id: Number(accountId),
          destination_id: kind === "withdrawal" ? Number(destId) : null,
          fee_cents: kind === "withdrawal" ? cents(fee) : 0,
          classification: kind === "expense" ? classification : null,
          category: kind === "expense" ? category : null,
          frequency:
            kind === "expense" && classification === "fijo" ? frequency : null,
          recurring_due_date:
            kind === "expense" && classification === "fijo"
              ? due || null
              : null,
        }),
      });
      setAmount("");
      setConcept("");
      setFee("0");
      setDue("");
      setView("Inicio");
      setNotice("Movimiento guardado. Tu saldo está al día.");
      if (result.scheduled_id && calendar) {
        try {
          await req("/google/calendar/reminder", {
            method: "POST",
            body: JSON.stringify({ scheduled_id: result.scheduled_id }),
          });
          setNotice(
            "Gasto guardado y recordatorio recurrente añadido a Calendar.",
          );
        } catch {
          setNotice(
            "Gasto y próximo pago guardados. Conecta Google y sincroniza el recordatorio desde Pagos.",
          );
        }
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const menus = [
    { name: "Inicio", icon: Home },
    { name: "Mi dinero", icon: Wallet },
    { name: "Pagos", icon: CalendarDays },
    { name: "Reportes", icon: BarChart3 },
    { name: "Revisar gastos", icon: Mail },
    { name: "Conexiones", icon: RefreshCw },
  ];
  if (isAdmin) menus.push({ name: "Administración", icon: Settings });
  const kindText = (k: string) =>
    k === "income" ? "Ingreso" : k === "expense" ? "Gasto" : "Retiro";
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">
            <Wallet size={22} />
          </div>
          <div>
            finanzas<span>app</span>
            <small>Tu dinero, más claro</small>
          </div>
        </div>
        <nav>
          {menus.map((m) => (
            <button
              key={m.name}
              className={view === m.name ? "active" : ""}
              onClick={() => setView(m.name)}
            >
              <m.icon size={20} />
              {m.name}
            </button>
          ))}
        </nav>
        <div className="aside-note">
          Empieza con pequeños pasos. Cada sol cuenta. 🌱
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">FINANZAS DE {username}</div>
            <h1>{view === "Inicio" ? "Hola, ¿cómo va tu dinero? 👋" : view}</h1>
            <p className="muted">
              {view === "Inicio"
                ? "Este es tu panorama financiero."
                : view === "Mi dinero"
                  ? "Tus cuentas, billeteras y efectivo en un lugar."
                  : "Organiza tu dinero sin complicaciones."}
            </p>
          </div>
          <button
            className="refresh"
            onClick={() => void load()}
            title="Actualizar"
            aria-label="Actualizar datos"
          >
            <RefreshCw size={19} />
          </button>
          <button className="secondary logout-button" onClick={onLogout}>
            Salir
          </button>
        </header>
        {notice && (
          <div className="success-msg" role="status">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {loading ? (
          <p>Cargando tus datos...</p>
        ) : view === "Inicio" ? (
          <>
            <section className="hero">
              <div>
                <div className="overline">SALDO TOTAL DISPONIBLE</div>
                <div className="total">{money(summary.balance_cents)}</div>
                <p>El dinero registrado en todas tus cuentas</p>
              </div>
              <Wallet size={54} opacity={0.25} />
            </section>
            <div className="home-actions">
              <button
                className="primary"
                onClick={() => {
                  setKind("expense");
                  setView("Registrar");
                }}
              >
                + Registrar gasto
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setKind("income");
                  setView("Registrar");
                }}
              >
                + Añadir ingreso
              </button>
            </div>
            <section className="two">
              <article className="stat">
                <div className="stat-label">
                  <ArrowDownLeft color="#11996c" />
                  Ingresos registrados
                </div>
                <strong>{money(summary.income_cents)}</strong>
              </article>
              <article className="stat">
                <div className="stat-label">
                  <ArrowUpRight color="#e07660" />
                  Gastos registrados
                </div>
                <strong>{money(summary.expense_cents)}</strong>
              </article>
            </section>
            <GmailNotice onOpen={() => setView("Revisar gastos")} />
            <button
              className="link report-shortcut"
              onClick={() => setView("Reportes")}
            >
              Ver mis reportes
            </button>
            <div className="section-head">
              <h2>Últimos movimientos</h2>
              <button className="link" onClick={() => setView("Registrar")}>
                + Registrar
              </button>
            </div>
            <div className="panel">
              {moves.length ? (
                moves.slice(0, 6).map((m) => (
                  <div className="movement" key={m.id}>
                    <span className={"mov-icon " + m.kind}>
                      {m.kind === "income" ? (
                        <ArrowDownLeft />
                      ) : m.kind === "expense" ? (
                        <ArrowUpRight />
                      ) : (
                        <Banknote />
                      )}
                    </span>
                    <div className="grow">
                      <strong>{m.concept}</strong>
                      <small>
                        {kindText(m.kind)} ·{" "}
                        {new Date(m.created_at).toLocaleDateString("es-PE")}
                      </small>
                    </div>
                    <b>
                      {m.kind === "income"
                        ? "+"
                        : m.kind === "expense"
                          ? "-"
                          : "↔ "}
                      {money(m.amount_cents)}
                    </b>
                  </div>
                ))
              ) : (
                <div className="empty">
                  Todavía no registras movimientos. ¡Empieza con tu primer
                  ingreso!
                </div>
              )}
            </div>
          </>
        ) : view === "Mi dinero" ? (
          <MiDinero
            accounts={accounts}
            cards={cards}
            reload={load}
            notify={setNotice}
            onWithdraw={() => {
              setKind("withdrawal");
              setView("Registrar");
            }}
            onIncome={() => {
              setKind("income");
              setView("Registrar");
            }}
          />
        ) : view === "Registrar" ? (
          <>
            <div className="panel form-panel">
              <div className="tabs">
                <button
                  className={kind === "expense" ? "chosen" : ""}
                  onClick={() => setKind("expense")}
                >
                  Gasté
                </button>
                <button
                  className={kind === "income" ? "chosen" : ""}
                  onClick={() => setKind("income")}
                >
                  Recibí
                </button>
                <button
                  className={kind === "withdrawal" ? "chosen" : ""}
                  onClick={() => setKind("withdrawal")}
                >
                  Retiré
                </button>
              </div>
              <form onSubmit={save} className="form">
                <label>
                  ¿Cuánto? (S/)
                  <input
                    className="amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>
                <label>
                  Concepto
                  <input
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    placeholder={
                      kind === "withdrawal"
                        ? "Retiro de cajero"
                        : kind === "income"
                          ? "Sueldo, propina..."
                          : "Almuerzo, transporte..."
                    }
                  />
                </label>
                <label>
                  {kind === "withdrawal"
                    ? "Desde la cuenta"
                    : "Cuenta o medio de pago"}
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    {accounts
                      .filter((a) => kind !== "withdrawal" || a.kind !== "cash")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {money(a.balance_cents)}
                        </option>
                      ))}
                  </select>
                </label>
                {kind === "withdrawal" ? (
                  <>
                    <label>
                      Destino
                      <select
                        value={destId}
                        onChange={(e) => setDestId(e.target.value)}
                      >
                        {accounts
                          .filter((a) => a.kind === "cash")
                          .map((a) => (
                            <option value={a.id} key={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Comisión bancaria (S/)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={fee}
                        onChange={(e) => setFee(e.target.value)}
                      />
                    </label>
                    <p className="hint">
                      El retiro mueve dinero hacia efectivo: no cuenta como
                      gasto, salvo la comisión.
                    </p>
                  </>
                ) : kind === "expense" ? (
                  <>
                    <button
                      type="button"
                      className="details"
                      onClick={() => setExpanded((v) => !v)}
                    >
                      {expanded
                        ? "Ocultar clasificación"
                        : "Clasificar gasto (opcional)"}{" "}
                      <span>{expanded ? "−" : "+"}</span>
                    </button>
                    {expanded && (
                      <>
                        <label>
                          Tipo de gasto
                          <select
                            value={classification}
                            onChange={(e) => {
                              setClassification(e.target.value);
                              setCategory(concepts[e.target.value][0]);
                            }}
                          >
                            <option value="variable">Variable</option>
                            <option value="fijo">Fijo</option>
                          </select>
                        </label>
                        <label>
                          Categoría
                          <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                          >
                            {concepts[classification].map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                        {classification === "fijo" && (
                          <>
                            <label>
                              Frecuencia
                              <select
                                value={frequency}
                                onChange={(e) => setFrequency(e.target.value)}
                              >
                                <option value="mensual">Mensual</option>
                                <option value="semanal">Semanal</option>
                                <option value="anual">Anual</option>
                              </select>
                            </label>
                            <label>
                              ¿Cuándo será el próximo pago?
                              <input
                                required
                                type="date"
                                value={due}
                                onChange={(e) => setDue(e.target.value)}
                              />
                            </label>
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={calendar}
                                onChange={(e) => setCalendar(e.target.checked)}
                              />{" "}
                              Recordármelo en Google Calendar
                            </label>
                            <p className="hint">
                              Registras el gasto de hoy y preparas el siguiente
                              pago. Calendar te recordará cada vencimiento.
                            </p>
                          </>
                        )}
                      </>
                    )}
                  </>
                ) : null}
                <button
                  className="primary submit"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Guardando…" : "Guardar movimiento"}
                </button>
              </form>
            </div>
          </>
        ) : view === "Pagos" ? (
          <Planes accounts={accounts} />
        ) : view === "Conexiones" ? (
          <Conexiones
            onReview={() => setView("Revisar gastos")}
            onAdmin={() => setView("Administración")}
            isAdmin={isAdmin}
          />
        ) : view === "Revisar gastos" ? (
          <RevisionGastos
            accounts={accounts}
            reload={load}
            onConnect={() => setView("Conexiones")}
          />
        ) : view === "Administración" && isAdmin ? (
          <Administracion />
        ) : (
          <Reportes />
        )}
      </main>
      <div className="mobile-nav">
        {menus
          .filter((m) => m.name !== "Reportes" && m.name !== "Administración")
          .map((m) => (
            <button
              key={m.name}
              className={view === m.name ? "active" : ""}
              onClick={() => setView(m.name)}
            >
              <m.icon size={20} />
              <small>{m.name}</small>
            </button>
          ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate>
      {(username, logout, isAdmin) => (
        <App
          key={username}
          username={username}
          onLogout={logout}
          isAdmin={isAdmin}
        />
      )}
    </AuthGate>
  </React.StrictMode>,
);
