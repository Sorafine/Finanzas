import { useEffect, useState } from "react";
import {
  CalendarDays,
  Mail,
  ShieldCheck,
  SunMoon,
  LogOut,
  Users,
} from "lucide-react";
import { req } from "../shared/api";
import { savedTheme, setTheme, Theme } from "../shared/theme";
import SecuritySettings from "../shared/SecuritySettings";
type Status = { configured: boolean; connected: boolean; enabled?: boolean };
export default function Perfil({
  username,
  isAdmin,
  onReview,
  onConnect,
  onAdmin,
  onPayments,
  onReports,
  onGoals,
  onLogout,
}: {
  username: string;
  isAdmin: boolean;
  onReview: () => void;
  onConnect: () => void;
  onAdmin: () => void;
  onPayments: () => void;
  onReports: () => void;
  onGoals: () => void;
  onLogout: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [security, setSecurity] = useState(false),
    [appearance, setAppearance] = useState<Theme>(savedTheme);
  useEffect(() => {
    let active = true;
    void req<Status>("/google/status")
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
  return (
    <div className="stack profile-reference">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="profile-shortcuts">
        <button className="secondary" onClick={onGoals}>
          Mis metas de ahorro
        </button>
        <button className="secondary" onClick={onReports}>
          Ver reportes
        </button>
      </div>
      <section className="panel profile-identity">
        <span className="profile-avatar" aria-hidden="true">
          {username.slice(0, 1).toLocaleUpperCase("es-PE")}
        </span>
        <div>
          <h2>{username}</h2>
          <p className="muted">
            {isAdmin ? "Administrador de Balance" : "Tu espacio personal"}
          </p>
        </div>
      </section>
      <section className="panel">
        <h2>Conexiones</h2>
        <div className="settings-line">
          <Mail size={21} />
          <div className="grow">
            <strong>Gmail</strong>
            <small>
              {status === null
                ? "Comprobando conexión…"
                : status.enabled === false
                  ? "Servicio pausado por el administrador"
                  : status.connected
                    ? "Google conectado · revisión de consumos cada minuto mientras la pantalla está visible"
                    : status.configured
                      ? "Conecta Google para revisar los consumos que llegan a tu correo"
                      : "Configuración de Google pendiente"}
            </small>
          </div>
          <button className="secondary" onClick={onReview}>
            Revisar gastos
          </button>
        </div>
        <div className="settings-line">
          <CalendarDays size={21} />
          <div className="grow">
            <strong>Google Calendar</strong>
            <small>
              Recordatorios opcionales para tus pagos. Cada pago se sincroniza
              desde sus opciones.
            </small>
          </div>
          <button className="secondary" onClick={onPayments}>
            Ver pagos
          </button>
        </div>
        <div className="settings-line">
          <div className="grow">
            <strong>Cuenta de Google</strong>
            <small>
              Conecta o desconecta tu cuenta personal de Gmail y Calendar.
            </small>
          </div>
          <button className="secondary" onClick={onConnect}>
            Gestionar
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Cuenta</h2>
        <div className="settings-line">
          <ShieldCheck size={21} />
          <div className="grow">
            <strong>Seguridad de tu cuenta</strong>
            <small>Contraseña y código de recuperación sin correo</small>
          </div>
          <button className="secondary" onClick={() => setSecurity(true)}>
            Gestionar
          </button>
        </div>
        {isAdmin && (
          <div className="settings-line">
            <Users size={21} />
            <div className="grow">
              <strong>Usuarios y permisos</strong>
              <small>Solo visible para el administrador</small>
            </div>
            <button className="secondary" onClick={onAdmin}>
              Abrir
            </button>
          </div>
        )}
        <div className="settings-line">
          <SunMoon size={21} />
          <div className="grow">
            <strong>Apariencia</strong>
            <small>Se guarda en este navegador.</small>
          </div>
          <label className="appearance-picker">
            <span className="sr-only">Apariencia</span>
            <select
              aria-label="Apariencia"
              value={appearance}
              onChange={(e) => {
                const value = e.target.value as Theme;
                setAppearance(value);
                setTheme(value);
              }}
            >
              <option value="dark">Noche</option>
              <option value="light">Día</option>
              <option value="system">Sistema</option>
            </select>
          </label>
        </div>
        <div className="settings-line">
          <LogOut size={21} />
          <div className="grow">
            <strong>Cerrar sesión</strong>
            <small>{username}</small>
          </div>
          <button className="link overdue-text" onClick={onLogout}>
            Salir
          </button>
        </div>
      </section>
      {security && <SecuritySettings onClose={() => setSecurity(false)} />}
    </div>
  );
}
