type Props = {
  value: string;
  onChange: (time24: string) => void;
};

/**
 * Render a time input field bound to a 24-hour time value.
 * @param props - Input value and change handler.
 * @returns Time input element.
 */
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
