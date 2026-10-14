import {
  Utensils,
  Bus,
  Zap,
  Heart,
  House,
  PlayCircle,
  ShoppingBag,
  MoreHorizontal,
  Plane,
  Car,
  BookOpen,
  Shield,
  Smartphone,
  Gift,
  Plus,
} from "lucide-react";
import { dateLabel } from "./api";
export const expenseCategories = [
  { name: "Comida", icon: Utensils },
  { name: "Transporte", icon: Bus },
  { name: "Servicios", icon: Zap },
  { name: "Salud", icon: Heart },
  { name: "Casa", icon: House },
  { name: "Ocio", icon: PlayCircle },
  { name: "Compras", icon: ShoppingBag },
  { name: "Otros", icon: MoreHorizontal },
];
export const goalIcons = [
  { id: "travel", name: "Viaje", icon: Plane },
  { id: "home", name: "Casa", icon: House },
  { id: "car", name: "Auto", icon: Car },
  { id: "study", name: "Estudios", icon: BookOpen },
  { id: "emergency", name: "Emergencia", icon: Shield },
  { id: "phone", name: "Celular", icon: Smartphone },
  { id: "gift", name: "Regalo", icon: Gift },
  { id: "other", name: "Otra", icon: Plus },
];
export function DateBadge({ day }: { day: string }) {
  return (
    <time className="date-badge" dateTime={day} aria-label={dateLabel(day)}>
      <b>{Number(day.slice(8, 10))}</b>
      <span>
        {new Intl.DateTimeFormat("es-PE", {
          month: "short",
          timeZone: "America/Lima",
        })
          .format(new Date(day + "T12:00:00-05:00"))
          .replace(".", "")}
      </span>
    </time>
  );
}
