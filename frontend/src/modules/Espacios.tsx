import { ArrowUpRight, CalendarDays, Wallet } from "lucide-react";

export default function Espacios({
  onFinance,
  onAgenda,
}: {
  onFinance: () => void;
  onAgenda: () => void;
}) {
  return (
    <div className="space-launcher">
      <div className="space-intro">
        <span className="day-eyebrow">Tu espacio personal</span>
        <h2>¿Qué quieres organizar hoy?</h2>
        <p className="muted">
          Elige por dónde empezar. Siempre puedes volver aquí tocando el logo de
          Balance.
        </p>
      </div>
      <div className="space-options">
        <button
          className="space-option space-finance"
          aria-label="Abrir mis finanzas"
          onClick={onFinance}
        >
          <span className="space-icon">
            <Wallet size={30} aria-hidden="true" />
          </span>
          <span className="space-option-title">Mis finanzas</span>
          <span className="space-option-description">
            Cuida tu dinero, registra movimientos y avanza hacia tus metas de
            ahorro.
          </span>
          <span className="space-tags" aria-hidden="true">
            Cuentas · Pagos · Reportes · Metas
          </span>
          <span className="space-open">
            Entrar a mis finanzas <ArrowUpRight size={19} aria-hidden="true" />
          </span>
        </button>
        <button
          className="space-option space-agenda"
          aria-label="Abrir mi agenda diaria"
          onClick={onAgenda}
        >
          <span className="space-icon">
            <CalendarDays size={30} aria-hidden="true" />
          </span>
          <span className="space-option-title">Mi agenda diaria</span>
          <span className="space-option-description">
            Organiza tus estudios, resuelve tus pendientes y construye hábitos a
            tu ritmo.
          </span>
          <span className="space-tags" aria-hidden="true">
            Tareas · Estudios · Hábitos
          </span>
          <span className="space-open">
            Entrar a mi agenda <ArrowUpRight size={19} aria-hidden="true" />
          </span>
        </button>
      </div>
      <p className="space-growth muted">
        Un lugar para lo que necesitas hoy, con espacio para nuevas herramientas
        mañana.
      </p>
    </div>
  );
}
