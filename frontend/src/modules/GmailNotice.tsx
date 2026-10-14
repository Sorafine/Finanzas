import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { req } from "../shared/api";
export default function GmailNotice({ onOpen }: { onOpen: () => void }) {
  const [count, setCount] = useState(0),
    [connected, setConnected] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true,
      running = false;
    async function check() {
      if (running || document.hidden) return;
      running = true;
      try {
        const status = await req<{ connected: boolean; enabled?: boolean }>(
          "/google/status",
        );
        if (!active) return;
        setConnected(status.connected && status.enabled !== false);
        if (status.connected && status.enabled !== false) {
          const data = await req<{ suggestions: unknown[] }>(
            "/google/gmail/suggestions",
          );
          if (active) {
            setCount(data.suggestions.length);
            setFailed(false);
          }
        } else setCount(0);
      } catch {
        if (active) setFailed(true);
      } finally {
        running = false;
      }
    }
    void check();
    const timer = window.setInterval(() => void check(), 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  return (
    <section className="gmail-notice">
      <Mail size={24} />
      <div className="grow">
        <strong>
          {failed
            ? "No pudimos revisar tu Gmail"
            : count
              ? `${count} consumos por revisar en tu correo`
              : connected
                ? "Gmail está al día"
                : "Tus gastos del correo, aquí"}
        </strong>
        <small>
          {count
            ? "Revísalos y confirma para actualizar tu saldo."
            : connected
              ? "Revisamos cada minuto mientras Inicio está visible."
              : "Conecta Google para revisar comprobantes y recordar pagos."}
        </small>
      </div>
      <button className="secondary" onClick={onOpen}>
        {count ? "Revisar gastos" : "Abrir revisión"}
      </button>
    </section>
  );
}
