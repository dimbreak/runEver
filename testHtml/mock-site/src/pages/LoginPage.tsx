import { useState } from 'react';
import LoginLayout from '../components/flows/LoginLayout';

export default function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <LoginLayout
      step={step}
      onNext={() => setStep(2)}
      onBack={() => setStep(1)}
    />
  );
}
