import { estimatePromptComplexity } from '../utils/llm';
import { Network } from '../webView/network';
import { Util } from '../webView/util';
import { PlanAfterNavigation, PlanAfterRerender } from './constants';
import {
  ExecutorLlmResult,
  WireActionWithWait,
  WireSubTask,
} from './execution.schema';
import { PromptRun } from './promptRun';
import { Prompt } from './types';

// LlmApi.addDummyReturn(
//   `{
//   "shouldSpiltTask": "yes: form has multiple fields and calendar interaction (likely >5 actions and uncertain UI)",
//   "a": [
//     {
//       "subTaskPrompt": "Fill full name and work email with provided values",
//       "addArgs": {
//         "fullName": "Jamie Parker",
//         "workEmail": "jamie.parker+742@example.com"
//       },
//       "complexity": "m"
//     },
//     {
//       "subTaskPrompt": "Set birthday in the calendar to \${birthYear}-\${birthMonth}-\${birthDay}",
//       "addArgs": {
//         "birthYear": "2000",
//         "birthMonth": "01",
//         "birthDay": "15"
//       },
//       "complexity": "h"
//     },
//     {
//       "subTaskPrompt": "Fill password and confirm password with the provided password",
//       "addArgs": {
//         "password": "S3cureP@ssw0rd!"
//       },
//       "complexity": "m"
//     }
//   ],
//   "todo": {
//     "sc": false,
//     "rc": "Verify that inputs fullName, workEmail, birthYear/birthMonth/birthDay, and password were filled correctly; if correct, click the 'Create account' button to submit."
//   },
//   "clearQueue": false
// }`,
// );
// LlmApi.addDummyReturn(`{
//   "shouldSpiltTask": "no - only two obvious input fields to fill",
//   "a": [
//     {
//       "intent": "fill Full name with \${args.fullName}",
//       "risk": "m",
//       "action": {
//         "k": "input",
//         "q": {
//           "id": "__7",
//           "argKeys": [
//             "fullName"
//           ]
//         },
//         "v": "\${args.fullName}"
//       }
//     },
//     {
//       "intent": "fill Work email with \${args.workEmail}",
//       "risk": "m",
//       "action": {
//         "k": "input",
//         "q": {
//           "id": "__9",
//           "argKeys": [
//             "workEmail"
//           ]
//         },
//         "v": "\${args.workEmail}"
//       }
//     }
//   ],
//   "clearQueue": false
// }`);
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
// LlmApi.addDummyReturn('null');
//
// LlmApi.addDummyReturn(
//   JSON.stringify({
//     a: [
//       {
//         intent:
//           'click the first result link that goes to Wikipedia (use anchor id __78)',
//         risk: 'l',
//         action: {
//           k: 'mouse',
//           a: 'click',
//           q: '__78',
//         },
//         post: {
//           t: 'navigation',
//         },
//       },
//     ],
//     clearQueue: true,
//   }),
// );

export class ExecutionSession {
  subSessionQueue: ExecutionSession[];
  breakPromptForExeErr = false;
  constructor(
    public id: number,
    public promptQueue: Prompt[],
    private run: PromptRun,
    public parent?: ExecutionSession,
  ) {
    this.subSessionQueue = [];
  }
  async *exec(): AsyncGenerator<
    string | symbol | WireActionWithWait,
    void,
    void
  > {
    console.log('Prompt start:', this.promptQueue[0].goalPrompt);
    let requireScreenshot = false;
    const { run, promptQueue, id } = this;
    const { tab, executionSession, args, actions, browserActionLock } = run;
    let { url } = tab;
    let stepsStream: AsyncGenerator<
      WireActionWithWait | WireSubTask,
      ExecutorLlmResult,
      void
    >;
    const finish = run.setRunningStatus(this);
    if (promptQueue.length === 0) {
      yield* this.execSubSessionQueue();
      finish();
      return;
    }
    while (promptQueue.length) {
      if (run.stopRequested) {
        finish();
        return;
      }
      const promptItem = promptQueue.shift()!;
      const {
        subPrompt: runSubPrompt,
        goalPrompt: runGoalPrompt,
        id: promptId,
        complexity,
      } = promptItem;
      const start = Date.now();
      try {
        stepsStream = executionSession.execPrompt(
          runGoalPrompt,
          args,
          runSubPrompt &&
            runSubPrompt.includes(`[performed actions]
-`)
            ? runSubPrompt.replace(
                `[performed actions]
-`,
                `[performed actions]
- ${actions.map((s) => s.intent).join('\n- ')}`,
              )
            : runSubPrompt,
          requireScreenshot,
          complexity,
        );

        let res:
          | IteratorYieldResult<WireActionWithWait | WireSubTask>
          | IteratorReturnResult<ExecutorLlmResult>;
        while ((res = await stepsStream.next())) {
          if (run.stopRequested) {
            finish();
            return;
          }
          if (res.done) {
            if (run.fixingAction?.promptId === promptId) {
              console.log('Fixing action done');
              run.fixingAction = null;
              run.execActions();
            }
            console.log(Date.now() - start, 'Waiting for complete prompt');
            // todo fix error sometimes block here
            await browserActionLock.wait;
            if (run.stopRequested) {
              finish();
              return;
            }

            yield* this.execSubSessionQueue();
            if (run.stopRequested) {
              finish();
              return;
            }

            if (res.value.todo) {
              console.log('Waiting for potential page load');
              await Promise.race([Util.sleep(2000), tab.pageLoadedLock.wait]);
              if (run.stopRequested) {
                finish();
                return;
              }
              if (tab.url === url) {
                yield PlanAfterRerender;
                console.log(Date.now() - start, 'Waiting for page re-render');
                await Network.waitForNetworkIdle0(
                  tab.networkIdle0,
                  tab.networkIdle2,
                ).then(() => Util.sleep(1000));
              } else {
                yield PlanAfterNavigation;
                console.log(
                  Date.now() - start,
                  'Waiting for page to load:',
                  url,
                );
                await tab.pageLoadedLock.wait;
                executionSession.resetSystemPrompt();
              }
              if (run.stopRequested) {
                finish();
                return;
              }
              if (this.breakPromptForExeErr) {
                console.log(
                  Date.now() - start,
                  'break prompting for exe err todo',
                );
                this.breakPromptForExeErr = false;
                break;
              }
              url = tab.url;
              requireScreenshot = res.value.todo.sc ?? false;
              const subPrompt = `**todo from last executor maybe wrong as page state changed, adjust if it conflict with the [goal]**
${res.value.todo.rc}

[performed actions]
-
`;
              const newPrompt = run.createPrompt(
                runGoalPrompt,
                {},
                id,
                estimatePromptComplexity(runGoalPrompt + subPrompt),
                subPrompt,
              );

              promptQueue.push(newPrompt);
              console.log(
                Date.now() - start,
                'push todo:',
                newPrompt.id,
                promptQueue,
              );
            }
            break;
          } else {
            if (this.breakPromptForExeErr) {
              console.log(Date.now() - start, 'break prompting for exe err');
              this.breakPromptForExeErr = false;
              break;
            }
            if ((res.value as WireActionWithWait).intent) {
              console.log(Date.now() - start, 'exec actions:', res.value);
              run.addAction({
                ...(res.value as WireActionWithWait),
                promptId,
                id: run.allocActionId(),
              });
              run.execActions();
              yield res.value as WireActionWithWait;
            } else {
              console.log(Date.now() - start, 'exec add sub task:', res.value);
              const newPrompt = run.createPrompt(
                `${(res.value as WireSubTask).subTaskPrompt}
**do not add subtask**`,
                (res.value as WireSubTask).addArgs ?? undefined,
                id,
                (res.value as WireSubTask).complexity,
              );
              this.addNewSubSession([newPrompt]);
            }
          }
        }
      } catch (e) {
        console.error('Error in exec prompt:', e);
        finish();
        throw e;
      }
      console.log(Date.now() - start, 'exec done', this.promptQueue.length);
    }
    finish();
  }
  async *execSubSessionQueue() {
    const { subSessionQueue } = this;
    const finished = [];
    while (subSessionQueue.length) {
      const subSession = subSessionQueue.shift()!;
      yield* subSession.exec();
      finished.push(subSession);
    }
    subSessionQueue.push(...finished);
  }
  addNewSubSession(queue: Prompt[]) {
    this.subSessionQueue.push(this.run.createSession(queue, this));
  }
}
