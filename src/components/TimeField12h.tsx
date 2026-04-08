type Props = {
  value: string;
  onChange: (time24: string) => void;
};

export function TimeField12h({ value, onChange }: Props) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="timeField12h"
    />
  );
}
