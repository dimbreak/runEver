import FlowFrame from '../FlowFrame';

type LoginLayoutProps = {
  step: 1 | 2;
  onNext: () => void;
  onBack: () => void;
};

export default function LoginLayout({ step, onNext, onBack }: LoginLayoutProps) {
  return (
    <FlowFrame title="Sign in to SignalStack" subtitle="Flow: login" theme="login">
      <div className="login">
        <div className="login__panel">
          <h3>Welcome back</h3>
          <p className="muted">Use any credentials to continue.</p>
          {step === 1 ? (
            <>
              <label className="field">
                Email address
                <input type="email" placeholder="you@signalstack.io" />
              </label>
              <button className="btn btn--primary btn--full" type="button" onClick={onNext}>
                Continue
              </button>
            </>
          ) : (
            <>
              <label className="field">
                Password
                <input type="password" placeholder="Enter password" />
              </label>
              <div className="login__actions">
                <button className="btn btn--ghost btn--full" type="button" onClick={onBack}>
                  Back
                </button>
                <button className="btn btn--primary btn--full" type="button">
                  Sign in
                </button>
              </div>
            </>
          )}
          <div className="login__links">
            <button className="link" type="button">
              Forgot password?
            </button>
            <button className="link" type="button">
              Create account
            </button>
          </div>
        </div>
      </div>
    </FlowFrame>
  );
}
