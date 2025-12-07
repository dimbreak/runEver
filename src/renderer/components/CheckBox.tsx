import * as React from 'react';
import { Square, SquareCheck } from 'lucide-react';

export const CheckBox: React.FC<{
  name: string;
  defaultChecked?: boolean;
  label?: React.ReactNode;
}> = ({ defaultChecked, name, label }) => {
  const [checked, setChecked] = React.useState(defaultChecked === true);
  const onClick = React.useCallback(() => {
    setChecked((s) => !s);
  }, []);
  return (
    <a href="#" onClick={onClick} className="checkbox">
      <input type="hidden" name={name} value={checked ? 'on' : 'off'} />
      {checked ? <SquareCheck /> : <Square />}
      {label ?? null}
    </a>
  );
};
