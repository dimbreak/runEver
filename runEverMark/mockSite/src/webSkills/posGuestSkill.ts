import { z } from 'zod';
import { createWebSkillGenerator } from 'web-skill';

const loginInputSchema = z.object({
  operator: z.string().min(1),
  passcode: z.string().min(1),
});

const loginOutputSchema = z.object({
  authenticated: z.boolean(),
  operator: z.string(),
  route: z.string(),
});

export type PosGuestLoginInput = z.infer<typeof loginInputSchema>;
export type PosGuestLoginOutput = z.infer<typeof loginOutputSchema>;

type LoginHandler = (
  input: PosGuestLoginInput,
) => Promise<PosGuestLoginOutput> | PosGuestLoginOutput;

const unavailableLogin: LoginHandler = async () => {
  throw new Error('POS guest login skill is not available in this context.');
};

export function createPosGuestWebSkillGenerator(
  login: LoginHandler = unavailableLogin,
) {
  const generator = createWebSkillGenerator();
  const guestSkill = generator.newSkill({
    name: 'posGuest',
    title: 'Guest POS login API for staff authentication',
    description:
      'Expose the Sellforce POS pre-login handoff so an agent can authenticate through the normal login form.',
  });

  guestSkill.addFunction(login, 'login', {
    description:
      'Fill the POS operator credentials and submit the login form, returning the route reached after authentication.',
    inputSchema: loginInputSchema,
    outputSchema: loginOutputSchema,
  });

  return generator;
}
