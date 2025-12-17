import * as React from 'react';

type ButtonVariant = 'default' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

const baseClass =
  'inline-flex items-center justify-center font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 rounded-md';

const variantClass: Record<ButtonVariant, string> = {
  default: 'bg-blue-500 text-white hover:bg-blue-600 border border-blue-500',
  outline:
    'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-sm',
  ghost:
    'bg-transparent text-slate-700 hover:bg-slate-100 border border-transparent',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-3 py-2 text-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'default', size = 'md', type = 'button', ...props },
    ref,
  ) => (
    <button
      ref={ref}
      // eslint-disable-next-line react/button-has-type
      type={type}
      className={cn(
        baseClass,
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = 'Button';
