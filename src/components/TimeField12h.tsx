import { partsFromTime24, toTime24 } from "../modules/moduleUtils";

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

type Props = {
  value: string;
  onChange: (time24: string) => void;
};

export function TimeField12h({ value, onChange }: Props) {
  const { hour12, minute, isPm } = partsFromTime24(value);

  const update = (next: { hour12?: number; minute?: number; isPm?: boolean }) => {
    onChange(
      toTime24(
        next.hour12 ?? hour12,
        next.minute ?? minute,
        next.isPm !== undefined ? next.isPm : isPm,
      ),
    );
  };

  return (
    <div className="timeField12h">
      <select
        aria-label="Hour"
        value={hour12}
        onChange={(e) => update({ hour12: Number(e.target.value) })}
      >
        {HOURS_12.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="timeField12h__sep">:</span>
      <select
        aria-label="Minute"
        value={minute}
        onChange={(e) => update({ minute: Number(e.target.value) })}
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        aria-label="AM or PM"
        value={isPm ? "PM" : "AM"}
        onChange={(e) => update({ isPm: e.target.value === "PM" })}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
