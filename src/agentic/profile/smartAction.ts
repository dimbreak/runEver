import { type ExecutionSession } from '../session';
import { RiskOrComplexityLevel } from '../execution.schema';

export namespace SmartAction {
  export type IAction<A extends { k: string } = { k: string }> = {
    intent: string;
    action: A;
    risk: RiskOrComplexityLevel;
    cp?: number[] | null;
  };
  type Handler = (
    action: IAction,
    parent: ExecutionSession,
  ) => Promise<ExecutionSession | null>;

  const handlers: Handler[] = [];
  export const register = (handler: Handler) => {
    handlers.push(handler);
  };
  export const buildSubtask = async (
    action: IAction,
    parent: ExecutionSession,
  ) => {
    let sess: ExecutionSession | null = null;
    for (const handler of handlers) {
      sess = await handler(action, parent);
      if (sess) {
        break;
      }
    }
    return sess;
  };
}
