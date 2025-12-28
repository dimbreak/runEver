import type { ReactNode } from 'react';

type FlowFrameProps = {
  title: string;
  subtitle: string;
  theme: string;
  children: ReactNode;
};

export default function FlowFrame({ title, subtitle, theme, children }: FlowFrameProps) {
  return (
    <section className={`flow flow--${theme}`}>
      <div className="flow__header flow__header--hidden">
        <div>
          <p className="flow__eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
        <span className="flow__badge">Mock UI</span>
      </div>
      <div className="flow__body">{children}</div>
    </section>
  );
}
