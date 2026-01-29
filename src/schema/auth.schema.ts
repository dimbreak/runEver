import { z } from 'zod';

export const authModeSchema = z.enum(['apitrust', 'apikey']);
export type AuthMode = z.infer<typeof authModeSchema>;
