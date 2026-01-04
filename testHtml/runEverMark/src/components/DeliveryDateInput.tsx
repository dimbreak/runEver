import { useState } from 'react';
import Calendar from 'react-calendar';

export default function DeliveryDateInput({
  value,
  onChange,
  useCalendar
}: {
  value: string;
  onChange: (value: string) => void;
  useCalendar: boolean;
}) {
  const [calendarValue, setCalendarValue] = useState<Date | null>(
    value ? new Date(value) : null
  );

  if (useCalendar) {
    return (
      <div className="calendar-input">
        <Calendar
          value={calendarValue}
          onChange={(next) => {
            const selected = Array.isArray(next) ? next[0] : next;
            setCalendarValue(selected);
            if (selected) {
              onChange(selected.toISOString().slice(0, 10));
            }
          }}
        />
        <p className="muted">Selected: {value || 'None'}</p>
      </div>
    );
  }

  return (
    <input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
