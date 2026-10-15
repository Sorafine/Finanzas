import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  RefreshCw,
  ArrowLeft,
  House,
  Wallet,
  CalendarDays,
  ReceiptText,
  ChartNoAxesCombined,
  Target,
  CircleUserRound,
} from "lucide-react";
import AuthGate from "./shared/AuthGate";
import Modal from "./shared/Modal";
import BrandMark from "./shared/BrandMark";
import {
  Account,
  Card,
  Scheduled,
  Availability,
  req,
  localToday,
} from "./shared/api";
import MiDinero from "./modules/MiDinero";
import Dashboard from "./modules/Dashboard";
import Planes from "./modules/Planes";
import Historial from "./modules/Historial";
import Registrar from "./modules/Registrar";
import "./shared/theme";
import Perfil from "./modules/Perfil";
import Metas from "./modules/Metas";
import Conexiones from "./modules/Conexiones";
import RevisionGastos from "./modules/RevisionGastos";
import Administracion from "./modules/Administracion";
import Reportes from "./modules/Reportes";
import "./styles.css";
import "./reference-theme.css";
const pages = {
  inicio: "Inicio",
  dinero: "Mi dinero",
  pagos: "Pagos",
  historial: "Historial",
  reportes: "Reportes",
  mas: "Perfil y conexiones",
  perfil: "Perfil y conexiones",
  metas: "Metas de ahorro",
  registrar: "Nuevo movimiento",
  revisar: "Revisar gastos de Gmail",
  conexiones: "Cuenta de Google",
  admin: "Usuarios y permisos",
};
type View = keyof typeof pages;
type RecordKind = "expense" | "income" | "transfer";
const navigation = [
  { id: "inicio", name: "Inicio", icon: House },
  { id: "dinero", name: "Mi dinero", icon: Wallet },
  { id: "pagos", name: "Pagos", icon: CalendarDays },
  { id: "historial", name: "Historial", icon: ReceiptText },
  { id: "reportes", name: "Reportes", icon: ChartNoAxesCombined },
  { id: "metas", name: "Metas", icon: Target },
  { id: "perfil", name: "Perfil", icon: CircleUserRound },
] as const;
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
    [plans, setPlans] = useState<Scheduled[]>([]),
    [availability, setAvailability] = useState<Availability | null>(null),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [recordKind, setRecordKind] = useState<RecordKind>("expense"),
    [recordOpen, setRecordOpen] = useState(false),
    [recordBusy, setRecordBusy] = useState(false),
    [recordAccount, setRecordAccount] = useState(""),
    [recordDestination, setRecordDestination] = useState(""),
    [historyAccount, setHistoryAccount] = useState(""),
    [version, setVersion] = useState(0),
    [selectedMonth, setSelectedMonth] = useState(localToday().slice(0, 7)),
    [updated, setUpdated] = useState<Date | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  async function load() {
    setRefreshing(true);
    try {
      const [a, c, p, available] = await Promise.all([
        req<Account[]>("/accounts"),
        req<Card[]>("/cards"),
        req<Scheduled[]>("/scheduled"),
        req<Availability>("/availability"),
      ]);
      setAvailability(available);
      setAccounts(a);
      setCards(c);
      setPlans(p);
      setError("");
      setUpdated(new Date());
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
    const change = () => {
      setView(route());
      setRecordOpen(false);
      setNotice("");
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [isAdmin]);
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [view]);
  function go(id: View) {
    setNotice("");
    location.hash = id;
    setView(id);
  }
  function register(
    kind: RecordKind = "expense",
    source = "",
    destination = "",
  ) {
    setRecordKind(kind);
    setRecordAccount(source);
    setRecordDestination(destination);
    setNotice("");
    setRecordOpen(true);
  }
  async function recorded(message: string) {
    setRecordOpen(false);
    setNotice(message);
    await load();
    setVersion((v) => v + 1);
    if (view === "registrar") go("inicio");
  }
  const active = ["revisar", "conexiones", "admin", "mas"].includes(view)
    ? "perfil"
    : view;
  const date = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Lima",
  }).format(new Date());
  const movement = (
    <Registrar
      accounts={accounts}
      cards={cards}
      initialKind={recordKind}
      initialAccount={recordAccount}
      initialDestination={recordDestination}
      onBusyChange={setRecordBusy}
      onSaved={recorded}
      onCancel={() => {
        setRecordOpen(false);
        if (view === "registrar") go("inicio");
      }}
    />
  );
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
          <BrandMark decorative />
          <span>Balance</span>
        </div>
        <nav aria-label="Navegación principal">
          {navigation.map((m) => (
            <button
              key={m.id}
              className={active === m.id ? "active" : ""}
              aria-current={active === m.id ? "page" : undefined}
              onClick={() => {
                if (m.id === "historial") setHistoryAccount("");
                go(m.id);
              }}
            >
              <m.icon size={18} aria-hidden="true" />
              {m.name}
            </button>
          ))}
        </nav>
        <button className="primary sidebar-register" onClick={() => register()}>
          + Nuevo
        </button>
      </aside>
      <main id="main-content" className={"page-" + view}>
        <header className="app-header">
          <div>
            {view === "inicio" && (
              <div className="today-label">
                {date.charAt(0).toUpperCase() + date.slice(1)}
              </div>
            )}
            {["revisar", "conexiones", "admin"].includes(view) && (
              <button className="back-link" onClick={() => go("perfil")}>
                <ArrowLeft size={14} /> Perfil
              </button>
            )}
            <h1 ref={heading} tabIndex={-1}>
              {view === "inicio" ? `Hola, ${username}` : pages[view]}
            </h1>
          </div>
          <div className="header-actions">
            {view === "inicio" && updated && (
              <span className="updated-label">
                Actualizado{" "}
                {updated.toLocaleTimeString("es-PE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Lima",
                })}
              </span>
            )}
            <button
              className="refresh"
              disabled={refreshing}
              aria-label="Actualizar datos"
              onClick={() => void load().then(() => setVersion((v) => v + 1))}
            >
              <RefreshCw size={16} />
            </button>
            {!["inicio", "registrar"].includes(view) && (
              <button
                className="secondary header-register"
                onClick={() => register()}
              >
                + Nuevo
              </button>
            )}
          </div>
        </header>
        {notice && (
          <div className="success-msg" role="status">
            {notice}
            <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
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
          <Dashboard
            key={version}
            accounts={accounts}
            cards={cards}
            plans={plans}
            availability={availability}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
            onRegister={register}
            onMoney={() => go("dinero")}
            onPayments={() => go("pagos")}
            onReview={() => go("revisar")}
            onReports={() => go("reportes")}
          />
        ) : view === "dinero" ? (
          <MiDinero
            accounts={accounts}
            cards={cards}
            reload={load}
            notify={setNotice}
            onWithdraw={() => register("transfer")}
            onTransfer={(from, to) =>
              register("transfer", String(from), to ? String(to) : "")
            }
            onIncome={() => register("income")}
            onHistory={(id) => {
              setHistoryAccount(String(id));
              go("historial");
            }}
          />
        ) : view === "pagos" ? (
          <Planes
            key={version}
            accounts={accounts}
            reload={load}
            onRegister={() => register()}
          />
        ) : view === "historial" ? (
          <Historial
            key={`${historyAccount}-${version}`}
            accounts={accounts}
            initialAccount={historyAccount}
            reload={load}
          />
        ) : view === "reportes" ? (
          <Reportes
            key={version}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
          />
        ) : view === "revisar" ? (
          <RevisionGastos
            key={version}
            accounts={accounts}
            cards={cards}
            reload={load}
            onConnect={() => go("conexiones")}
          />
        ) : view === "conexiones" ? (
          <Conexiones
            key={version}
            onReview={() => go("revisar")}
            onAdmin={() => go("admin")}
            isAdmin={isAdmin}
          />
        ) : view === "admin" && isAdmin ? (
          <Administracion key={version} />
        ) : view === "registrar" ? (
          movement
        ) : view === "metas" ? (
          <Metas onChanged={load} />
        ) : (
          <Perfil
            key={version}
            username={username}
            isAdmin={isAdmin}
            onReview={() => go("revisar")}
            onConnect={() => go("conexiones")}
            onAdmin={() => go("admin")}
            onLogout={onLogout}
            onPayments={() => go("pagos")}
            onReports={() => go("reportes")}
            onGoals={() => go("metas")}
          />
        )}
      </main>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {navigation
          .filter((m) =>
            ["inicio", "dinero", "pagos", "historial", "perfil"].includes(m.id),
          )
          .map((m) => (
            <button
              key={m.id}
              className={active === m.id ? "active" : ""}
              aria-current={active === m.id ? "page" : undefined}
              onClick={() => {
                if (m.id === "historial") setHistoryAccount("");
                go(m.id);
              }}
            >
              <m.icon size={18} aria-hidden="true" />
              <small>{m.name}</small>
            </button>
          ))}
      </nav>
      {recordOpen && (
        <Modal
          title="Nuevo movimiento"
          variant="drawer"
          onClose={() => {
            if (!recordBusy) setRecordOpen(false);
          }}
        >
          {movement}
        </Modal>
      )}
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
