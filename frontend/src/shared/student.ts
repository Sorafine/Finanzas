import { req } from "./api";
export type Projection = {
  total_weight: number;
  evaluated_weight: number;
  remaining_weight: number;
  earned_points: number;
  average: number | null;
  required_average: number | null;
  maximum_final: number | null;
  final_grade: number | null;
  status: string;
};
export type Assessment = {
  id: number;
  title: string;
  weight: number;
  grade: number | null;
};
export type Course = {
  id: number;
  title: string;
  color: string;
  maximum: number;
  passing: number;
  rounding: "none" | "half_up_integer";
  assessments: Assessment[];
  projection: Projection;
};
export type ClassTime = {
  id: number;
  course_id: number;
  course_title: string;
  color: string;
  weekday: number;
  starts: string;
  ends: string;
  room: string;
};
export type DayTask = {
  id: number;
  title: string;
  due_on: string | null;
  completed: number;
  course_id: number | null;
  course_title: string | null;
  course_color: string | null;
};
export type DayOverview = {
  today: string;
  week: string[];
  tasks: DayTask[];
  habits: { id: number; title: string; days: string[] }[];
};
export type WellbeingData = {
  today: string;
  moods: { day: string; mood: number }[];
  preferences: {
    sleep_hours: number;
    preparation_minutes: number;
    wake_time: string;
  };
  tomorrow_class: { starts: string; title: string } | null;
  bedtime: string;
  wake_at: string;
  habit_marks: number;
  habit_opportunities: number;
};
export const weekdays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
export const moods = ["😞", "😟", "😐", "🙂", "😄"];
export const moodNames = ["Muy bajo", "Bajo", "Neutral", "Bien", "Muy bien"];
export const number = (v: number) =>
  new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(v);
export const dateText = (v: string) =>
  new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    timeZone: "America/Lima",
  }).format(new Date(v + "T12:00:00-05:00"));
export const studentApi = <T>(path: string) => req<T>("/student" + path);
