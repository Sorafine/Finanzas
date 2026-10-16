import { moodNames, moods } from "./student";
export default function MoodPicker({
  value,
  busy,
  onChange,
}: {
  value: number | null;
  busy: boolean;
  onChange: (mood: number) => void;
}) {
  return (
    <div className="student-moods" aria-label="Cómo te sientes hoy">
      {moods.map((emoji, i) => (
        <button
          key={emoji}
          className={value === i + 1 ? "selected" : ""}
          disabled={busy}
          aria-label={moodNames[i]}
          aria-pressed={value === i + 1}
          onClick={() => onChange(i + 1)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
