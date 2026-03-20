import { type ExecutionTask } from '../task';
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
    parent: ExecutionTask,
  ) => Promise<ExecutionTask | null>;

  const handlers: Handler[] = [];
  export const register = (handler: Handler) => {
    handlers.push(handler);
  };
  export const buildSubtask = async (
    action: IAction,
    parent: ExecutionTask,
  ) => {
    let sess: ExecutionTask | null = null;
    for (const handler of handlers) {
      sess = await handler(action, parent);
      if (sess) {
        break;
      }
    }
    return sess;
  };
}
