import * as React from 'react';
import { CheckBox } from '../components/CheckBox';

export const HomeScreen: React.FC<{}> = () => {
  return (
    <div id="home-screen">
      <div>
        <h1>Whatever, Whenever, RunEver</h1>
        <div className="chatbox">
          <textarea placeholder="Do something..." />
          <ul>
            <li>
              <CheckBox name="promptAgentMode" label="Agent Mode" />
            </li>
            <li>
              <button>Query</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
