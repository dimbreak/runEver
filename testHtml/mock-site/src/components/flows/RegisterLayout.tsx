import { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import FlowFrame from '../FlowFrame';

export default function RegisterLayout() {
  const [birthday, setBirthday] = useState<Date | null>(null);
  return (
    <FlowFrame
      title="Create your account"
      subtitle="Flow: register"
      theme="login"
    >
      <div className="register">
        <div className="register__panel">
          <h3>Start your workspace</h3>
          <p className="muted">Set up your profile in under a minute.</p>
          <label className="field">
            Full name
            <input type="text" placeholder="Avery Chen" />
          </label>
          <label className="field">
            Work email
            <input type="email" placeholder="you@company.com" />
          </label>
          <label className="field">
            Birthday
            <div className="calendar">
              <Calendar
                onChange={(date) => setBirthday(date as Date)}
                value={birthday}
              />
            </div>
          </label>
          <label className="field">
            Password
            <input type="password" placeholder="Create a password" />
          </label>
          <label className="field">
            Confirm password
            <input type="password" placeholder="Re-enter password" />
          </label>
          <button className="btn btn--primary btn--full" type="button">
            Create account
          </button>
          <button className="btn btn--ghost btn--full" type="button">
            Sign up with invite code
          </button>
        </div>
        <div className="register__panel register__panel--alt">
          <h4>What you get</h4>
          <ul>
            <li>Custom automations and playbooks</li>
            <li>Shared inbox with routing rules</li>
            <li>Weekly performance summaries</li>
          </ul>
        </div>
      </div>
    </FlowFrame>
  );
}
