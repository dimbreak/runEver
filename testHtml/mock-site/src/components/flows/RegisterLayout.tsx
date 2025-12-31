import { useState } from 'react';
import Select from '@rc-component/select';
import '@rc-component/select/assets/index.css';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import FlowFrame from '../FlowFrame';

export default function RegisterLayout() {
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
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
            CV upload
            <input type="file" accept=".pdf,.doc,.docx,.txt" />
          </label>
          <div className="field">
            Gender
            <div className="field__options">
              <label className="field__option">
                <input type="radio" name="gender" value="female" />
                <span>Female</span>
              </label>
              <label className="field__option">
                <input type="radio" name="gender" value="male" />
                <span>Male</span>
              </label>
              <label className="field__option">
                <input type="radio" name="gender" value="non-binary" />
                <span>Non-binary</span>
              </label>
              <label className="field__option">
                <input type="radio" name="gender" value="prefer-not" />
                <span>Prefer not to say</span>
              </label>
            </div>
          </div>
          <label className="field">
            Language
            <select>
              <option value="">Select a language</option>
              <option value="en">English</option>
              <option value="ja">Japanese</option>
              <option value="zh">Chinese</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
            </select>
          </label>
          <label className="field">
            Interested topics
            <Select
              mode="multiple"
              value={topics}
              onChange={(value) => setTopics(value as string[])}
              placeholder="Pick topics"
              options={[
                { value: 'productivity', label: 'Productivity' },
                { value: 'automation', label: 'Automation' },
                { value: 'analytics', label: 'Analytics' },
                { value: 'customer-support', label: 'Customer support' },
                { value: 'engineering', label: 'Engineering' },
                { value: 'design', label: 'Design' },
              ]}
            />
          </label>
          <h4>UK address</h4>
          <label className="field">
            Address line 1
            <input type="text" placeholder="221B Baker Street" />
          </label>
          <label className="field">
            Address line 2
            <input type="text" placeholder="Marylebone" />
          </label>
          <label className="field">
            Town / City
            <input type="text" placeholder="London" />
          </label>
          <label className="field">
            County
            <input type="text" placeholder="Greater London" />
          </label>
          <label className="field">
            Postcode
            <input type="text" placeholder="NW1 6XE" />
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
          <label className="field field--checkbox">
            <input type="checkbox" />
            <span>Accept terms and conditions</span>
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
