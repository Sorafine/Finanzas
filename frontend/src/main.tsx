import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Wallet,
  Coins,
  Sparkles,
  Home,
  CalendarDays,
  History,
  MoreHorizontal,
  Mail,
  Settings,
  Target,
  BarChart3,
  ChevronRight,
  Plus,
  ArrowLeft,
  LogOut,
  RefreshCw,
} from "lucide-react";
import AuthGate from "./shared/AuthGate";
import {
  Account,
  Card,
  HistoryItem,
  Scheduled,
  req,
  money,
  dateLabel,
  localToday,
} from "./shared/api";
import MovementRow from "./shared/MovementRow";
import MiDinero from "./modules/MiDinero";
import Planes from "./modules/Planes";
import Historial from "./modules/Historial";
import Registrar from "./modules/Registrar";
import Metas from "./modules/Metas";
import GmailNotice from "./modules/GmailNotice";
import Conexiones from "./modules/Conexiones";
import RevisionGastos from "./modules/RevisionGastos";
import Administracion from "./modules/Administracion";
import Reportes from "./modules/Reportes";
import "./styles.css";
const pages = {
  inicio: {
    title: "Tu dinero, con más calma",
    subtitle: "Tu saldo, próximos pagos y últimos movimientos.",
  },
  dinero: {
    title: "Mi dinero",
    subtitle: "Consulta tus cuentas y el dinero disponible en cada una.",
  },
  pagos: {
    title: "Pagos",
    subtitle: "Organiza vencimientos y registra los pagos que ya realizaste.",
  },
  historial: {
    title: "Historial",
    subtitle: "Consulta tus ingresos, gastos y pagos en un solo lugar.",
  },
  mas: {
    title: "Más opciones",
    subtitle: "Tu correo, objetivos y ajustes, cuando los necesites.",
  },
  registrar: {
    title: "Registrar movimiento",
    subtitle: "Guarda un gasto, ingreso o retiro de efectivo.",
  },
  revisar: {
    title: "Revisar gastos de Gmail",
    subtitle: "Confirma los consumos que quieras registrar.",
  },
  conexiones: {
    title: "Conexiones",
    subtitle: "Conecta tu propia cuenta Google para Gmail y Calendar.",
  },
  metas: {
    title: "Metas de ahorro",
    subtitle: "Haz seguimiento de lo que quieres conseguir.",
  },
  reportes: {
    title: "Reportes",
    subtitle: "Entiende cómo cambian tus ingresos y gastos.",
  },
  admin: {
    title: "Administración",
    subtitle: "Control de usuarios y conexiones, solo para ti.",
  },
};
type View = keyof typeof pages;
const navigation = [
  { id: "inicio", name: "Inicio", icon: Home },
  { id: "dinero", name: "Mi dinero", icon: Wallet },
  { id: "pagos", name: "Pagos", icon: CalendarDays },
  { id: "historial", name: "Historial", icon: History },
  { id: "mas", name: "Más", icon: MoreHorizontal },
] as const;
const extras = [
  {
    id: "revisar",
    name: "Revisar gastos de Gmail",
    text: "Revisa comprobantes antes de registrarlos.",
    icon: Mail,
  },
  {
    id: "metas",
    name: "Metas de ahorro",
    text: "Sigue el progreso de tus objetivos.",
    icon: Target,
  },
  {
    id: "reportes",
    name: "Reportes",
    text: "Compara ingresos y gastos por mes.",
    icon: BarChart3,
  },
  {
    id: "conexiones",
    name: "Conexiones",
    text: "Conecta tu cuenta Google.",
    icon: Settings,
  },
] as const;
type Summary = {
  balance_cents: number;
  month_income_cents: number;
  month_expense_cents: number;
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
  const route = (): View => {
    const id = location.hash.slice(1);
    return Object.prototype.hasOwnProperty.call(pages, id) &&
      (id !== "admin" || isAdmin)
      ? (id as View)
      : "inicio";
  };
  const [view, setView] = useState<View>(route),
    [accounts, setAccounts] = useState<Account[]>([]),
    [cards, setCards] = useState<Card[]>([]),
    [moves, setMoves] = useState<HistoryItem[]>([]),
    [plans, setPlans] = useState<Scheduled[]>([]),
    [summary, setSummary] = useState<Summary>({
      balance_cents: 0,
      month_income_cents: 0,
      month_expense_cents: 0,
    }),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [recordKind, setRecordKind] = useState<"expense" | "income" | "withdrawal">(
      "expense",
    ),
    [historyAccount, setHistoryAccount] = useState("");
  const [pageVersion, setPageVersion] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  async function load() {
    setRefreshing(true);
    try {
      const [a, c, h, p, s] = await Promise.all([
        req<Account[]>("/accounts"),
        req<Card[]>("/cards"),
        req<{ items: HistoryItem[] }>("/history?page_size=5"),
        req<Scheduled[]>("/scheduled"),
        req<Summary>("/summary"),
      ]);
      setAccounts(a);
      setCards(c);
      setMoves(h.items);
      setPlans(p);
      setSummary(s);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const update = () => setView(route());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [isAdmin]);
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [view]);
  function go(id: View, keepNotice = false) {
    if (!keepNotice) setNotice("");
    location.hash = id;
    setView(id);
  }
  function register(kind: "expense" | "income" | "withdrawal" = "expense") {
    setRecordKind(kind);
    go("registrar");
  }
  const extraView =
    !navigation.some((x) => x.id === view) && view !== "registrar";
  const current = extraView ? "mas" : view;
  const upcoming = plans.filter((p) => p.active).slice(0, 3);
  const month = new Intl.DateTimeFormat("es-PE", {
    month: "long",
    year: "numeric",
    timeZone: "America/Lima",
  }).format(new Date());
  return (
    <div className="layout">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          heading.current?.focus();
        }}
      >
        Ir al contenido
      </a>
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">
            <Coins size={23} />
          </div>
          <div>
            finanzas<span>app</span>
            <small>Tu dinero, más claro</small>
          </div>
        </div>
        <nav aria-label="Navegación principal">
          {navigation.map((m) => (
            <button
              key={m.id}
              className={current === m.id ? "active" : ""}
              aria-current={current === m.id ? "page" : undefined}
              onClick={() => {
                if (m.id === "historial") setHistoryAccount("");
                go(m.id);
              }}
            >
              <m.icon size={20} />
              {m.name}
            </button>
          ))}
        </nav>
        <button className="primary sidebar-register" onClick={() => register()}>
          <Plus size={18} /> Registrar movimiento
        </button>
        <div className="sidebar-footer">
          <span className="user-avatar">
            {username.charAt(0).toUpperCase()}
          </span>
          <div className="grow">
            <strong>{username}</strong>
            <small>{isAdmin ? "Administrador" : "Mi espacio personal"}</small>
          </div>
          <button
            className="icon-button"
            onClick={onLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main id="main-content">
        <header className="app-header">
          <div>
            {extraView || view === "registrar" ? (
              <button
                className="back-link"
                onClick={() => go(view === "registrar" ? "inicio" : "mas")}
              >
                <ArrowLeft size={15} />{" "}
                {view === "registrar" ? "Volver al inicio" : "Más opciones"}
              </button>
            ) : (
              <div className="eyebrow">Hola, {username}</div>
            )}
            <h1 ref={heading} tabIndex={-1}>
              {pages[view].title}
            </h1>
            <p className="muted">{pages[view].subtitle}</p>
          </div>
          <div className="header-actions">
            {view !== "registrar" && (
              <button
                className="refresh"
                disabled={refreshing}
                onClick={() => {
                  void load().then(() => setPageVersion((x) => x + 1));
                }}
                aria-label="Actualizar datos"
                title="Actualizar"
              >
                <RefreshCw size={18} />
              </button>
            )}
            {view !== "registrar" && (
              <button
                className="primary header-register"
                onClick={() => register()}
                aria-label="Registrar movimiento"
              >
                <Plus size={18} />
                <span>Registrar</span>
              </button>
            )}
          </div>
        </header>
        {notice && (
          <div className="success-msg" role="status">
            {notice}
            <button onClick={() => setNotice("")} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button className="link" onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        )}
        {loading ? (
          <div className="panel empty" role="status">
            Cargando tu espacio…
          </div>
        ) : view === "inicio" ? (
          <div className="stack dashboard">
            <section className="hero">
              <div>
                <div className="overline">DINERO DISPONIBLE</div>
                <div className="total">{money(summary.balance_cents)}</div>
                <p>Saldo registrado en tus {accounts.length} cuentas</p>
              </div>
              <div className="coin-scene" aria-hidden="true">
                <span className="coin coin-back">S/</span>
                <span className="coin coin-front">S/</span>
                <Sparkles className="coin-sparkle" size={25} />
              </div>
            </section>
            <div className="home-actions">
              <button className="primary" onClick={() => register("expense")}>
                <Plus size={17} /> Registrar gasto
              </button>
              <button className="secondary" onClick={() => register("income")}>
                <Plus size={17} /> Añadir ingreso
              </button>
            </div>
            {!moves.length && summary.balance_cents === 0 && (
              <section className="panel welcome-panel">
                <h2>Empieza con el dinero que tienes</h2>
                <p>
                  Ya tienes una cuenta de banco y otra de efectivo. Registra tu
                  saldo actual como ingreso y después añade tus gastos.
                </p>
                <button className="link" onClick={() => register("income")}>
                  Añadir mi saldo inicial →
                </button>
              </section>
            )}
            <section className="month-summary" aria-label="Resumen de este mes">
              <div className="section-head">
                <h2>Este mes</h2>
                <span className="muted">{month}</span>
              </div>
              <div className="two">
                <article className="stat">
                  <small className="stat-caption">
                    <span className="stat-coin income">
                      <Coins size={17} />
                    </span>
                    Ingresos del mes
                  </small>
                  <strong className="positive">
                    {money(summary.month_income_cents)}
                  </strong>
                </article>
                <article className="stat">
                  <small className="stat-caption">
                    <span className="stat-coin expense">
                      <Wallet size={17} />
                    </span>
                    Gastos del mes
                  </small>
                  <strong>{money(summary.month_expense_cents)}</strong>
                </article>
              </div>
            </section>
            <div className="dashboard-grid">
              <section className="panel">
                <div className="section-head">
                  <h2>Próximos pagos</h2>
                  <button className="link" onClick={() => go("pagos")}>
                    Ver pagos →
                  </button>
                </div>
                {upcoming.length ? (
                  upcoming.map((p) => (
                    <button
                      className="movement movement-button"
                      key={p.id}
                      onClick={() => go("pagos")}
                    >
                      <span className="account-icon">
                        <CalendarDays size={20} />
                      </span>
                      <span className="grow">
                        <strong>{p.name}</strong>
                        <small
                          className={
                            p.due_date < localToday() ? "overdue-text" : ""
                          }
                        >
                          {dateLabel(p.due_date)}
                          {p.due_date < localToday() ? " · Vencido" : ""}
                        </small>
                      </span>
                      <b>{money(p.amount_cents)}</b>
                    </button>
                  ))
                ) : (
                  <div className="empty compact">
                    <p>No tienes pagos pendientes.</p>
                    <button className="link" onClick={() => go("pagos")}>
                      Programar un pago
                    </button>
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="section-head">
                  <h2>Últimos movimientos</h2>
                  <button
                    className="link"
                    onClick={() => {
                      setHistoryAccount("");
                      go("historial");
                    }}
                  >
                    Ver historial →
                  </button>
                </div>
                {moves.length ? (
                  moves.map((m) => (
                    <MovementRow
                      key={m.id}
                      item={m}
                      onOpen={() => {
                        setHistoryAccount("");
                        go("historial");
                      }}
                    />
                  ))
                ) : (
                  <div className="empty compact">
                    <p>Tus movimientos aparecerán aquí.</p>
                  </div>
                )}
              </section>
            </div>
            <GmailNotice onOpen={() => go("revisar")} />
          </div>
        ) : view === "dinero" ? (
          <MiDinero
            accounts={accounts}
            cards={cards}
            reload={load}
            notify={setNotice}
            onWithdraw={() => register("withdrawal")}
            onIncome={() => register("income")}
            onHistory={(id) => {
              setHistoryAccount(String(id));
              go("historial");
            }}
          />
        ) : view === "registrar" ? (
          <Registrar
            key={recordKind}
            accounts={accounts}
            initialKind={recordKind}
            onCancel={() => go("inicio")}
            onSaved={async (message) => {
              setNotice(message);
              await load();
              go("inicio", true);
            }}
          />
        ) : view === "pagos" ? (
          <Planes
            key={pageVersion}
            accounts={accounts}
            reload={load}
            onRegister={() => register()}
          />
        ) : view === "historial" ? (
          <Historial
            key={`${historyAccount}-${pageVersion}`}
            accounts={accounts}
            initialAccount={historyAccount}
          />
        ) : view === "revisar" ? (
          <RevisionGastos
            key={pageVersion}
            accounts={accounts}
            reload={load}
            onConnect={() => go("conexiones")}
          />
        ) : view === "conexiones" ? (
          <Conexiones
            key={pageVersion}
            onReview={() => go("revisar")}
            onAdmin={() => go("admin")}
            isAdmin={isAdmin}
          />
        ) : view === "metas" ? (
          <Metas key={pageVersion} />
        ) : view === "reportes" ? (
          <Reportes key={pageVersion} />
        ) : view === "admin" && isAdmin ? (
          <Administracion key={pageVersion} />
        ) : (
          <div className="stack">
            <div className="panel more-options">
              {extras.map((x) => (
                <button
                  className="option-row"
                  key={x.id}
                  onClick={() => go(x.id)}
                >
                  <span className="account-icon">
                    <x.icon size={22} />
                  </span>
                  <span className="grow">
                    <strong>{x.name}</strong>
                    <small>{x.text}</small>
                  </span>
                  <ChevronRight size={19} />
                </button>
              ))}
              {isAdmin && (
                <button className="option-row" onClick={() => go("admin")}>
                  <span className="account-icon">
                    <Settings size={22} />
                  </span>
                  <span className="grow">
                    <strong>Administración</strong>
                    <small>Usuarios y conexiones de la app.</small>
                  </span>
                  <ChevronRight size={19} />
                </button>
              )}
            </div>
            <div className="panel profile-summary">
              <div className="grow">
                <strong>{username}</strong>
                <small>Tu espacio personal</small>
              </div>
              <button className="secondary" onClick={onLogout}>
                <LogOut size={17} /> Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </main>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {navigation.map((m) => (
          <button
            key={m.id}
            className={current === m.id ? "active" : ""}
            aria-current={current === m.id ? "page" : undefined}
            onClick={() => {
              if (m.id === "historial") setHistoryAccount("");
              go(m.id);
            }}
          >
            <m.icon size={20} />
            <small>{m.name}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <AuthGate>
    {(username, logout, isAdmin) => (
      <App
        key={username}
        username={username}
        onLogout={logout}
        isAdmin={isAdmin}
      />
    )}
  </AuthGate>,
);
