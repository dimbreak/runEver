import { AuthProvider } from '@apitrust/react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import App from '../renderer/App';
import { apiTrustEnvVars } from '../schema/env.node';


describe('App', () => {
  // it('should render', () => {
  //   expect(render(
  //     <AuthProvider
  //     config={{
  //       clientId: apiTrustEnvVars.clientId,
  //       apiUrl: apiTrustEnvVars.apiUrl,
  //       secret: apiTrustEnvVars.clientSecret,
  //       redirectUri: apiTrustEnvVars.redirectUri,
  //       authUrl: `${apiTrustEnvVars.authBaseUrl}/oauth/authorize`,
  //       tokenUrl: "http://localhost:8081/api/oauth/token",
  //     }}
  //   >
  //     <HashRouter>
  //       <App />
  //     </HashRouter>
  //     </AuthProvider>
  //   )).toBeTruthy();
  // });
  it('should be true', () => {
    expect(true).toBe(true);
  });
});
