import type { BenchmarkCase } from '../../../types';
import { ExecutorLlmResultSchema } from '../../../../../src/agentic/execution.schema';
import { standardSystemPrompt, standardUserPromptPrefix } from '../prompt';

const getAddedCheckpointCount = (action: any) => {
  if (action.k === 'checklist' && action.a === 'add') {
    return action.add?.length ?? 0;
  }

  if (action.k === 'addNewTask') {
    return action.checkPoints?.length ?? 0;
  }

  return 0;
};

const matchesActionQueryId = (
  query: string | { id?: string } | undefined,
  expectedId: string,
) =>
  query === expectedId ||
  (typeof query === 'object' && query !== null && query.id === expectedId);

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const getAllAddedCheckpoints = (actions: any[]) =>
  actions.flatMap((item) => {
    const action = item?.action;
    if (!action) {
      return [];
    }
    if (action.k === 'checklist' && action.a === 'add') {
      return Array.isArray(action.add) ? action.add : [];
    }
    if (action.k === 'addNewTask') {
      return Array.isArray(action.checkPoints) ? action.checkPoints : [];
    }
    return [];
  });

const hasFollowManagerAdviceCheckpoint = (checkpoints: string[]) => {
  const normalized = checkpoints.map(normalizeText);
  return normalized.some((checkpoint) => {
    const mentionsFollow =
      checkpoint.includes('follow') ||
      checkpoint.includes('do what he advise') ||
      checkpoint.includes('do what he advises') ||
      checkpoint.includes('do what manager') ||
      checkpoint.includes('act on') ||
      checkpoint.includes('apply');
    const mentionsAdvice =
      checkpoint.includes('advice') ||
      checkpoint.includes('advise') ||
      checkpoint.includes('reply');
    const mentionsManager =
      checkpoint.includes('dillion') ||
      checkpoint.includes('dillon') ||
      checkpoint.includes('manager') ||
      checkpoint.includes('his');

    return mentionsFollow && mentionsAdvice && mentionsManager;
  });
};

const hasSetArgKey = (actions: any[], key: string) =>
  actions.some((step) => {
    const action = step?.action;
    return (
      action?.k === 'setArg' &&
      action.kv &&
      typeof action.kv === 'object' &&
      Object.prototype.hasOwnProperty.call(action.kv, key)
    );
  });

export const longTaskSplittingTest: BenchmarkCase = {
  id: 'long-task-splitting',
  name: 'Long Task Splitting',
  maxScore: 7,
  weight: 1.5,
  systemPrompt: standardSystemPrompt,
  userPrompt: `${standardUserPromptPrefix}

  [url]
  runever://benchmark/#/email

  [viewport]
  w=1699 h=871

  [html]
  <script>const font = {\"ff0\":\"\\\"Fira Sans\\\", \\\"Gill Sans\\\", \\\"Trebuchet MS\\\", sans-serif\",\"ff1\":\"\\\"Google Sans\\\", Roboto, Arial, sans-serif\"};
  const hls = {\"#0\":\"16px / 24px ff1 #222\",\"#1\":\"24px / 31.9992px ff1 #222\",\"#2\":\"500 14px / 21px ff1 #17e\",\"#3\":\"500 14px / 19.6px ff1 #17e\",\"#4\":\"500 14px / 21px ff1 #fff\",\"#5\":\"14px / 19.6px ff1 #566\",\"#6\":\"16px / 24px ff1 #111\"};</script><div id=®f xywh=616,113,450,692 hls=6><h2 id=®0 hls=1>Sign in</h2><p id=®1 hls=0>to continue to RMail</p><form id=®e label=fields:2 xywh=656,416,370,353><div id=®4><input id=®2 val= name=email placeholder=\" \" required=1 type=email hls=0 /><label covered>Email or phone</label></div><div id=®7><input id=®5 val= name=password placeholder=\" \" required=1 type=password hls=0 /><label covered>Password</label></div><a id=®8 hls=2>Forgot email?</a><div id=®a hls=5>Not your computer? Use Guest mode to sign in privately.<a id=®9 hls=3>Learn more</a></div><div id=®d xywh=656,709,370,61><button id=®b hls=2>Create account</button><button id=®c type=submit hls=4>Next</button></div></form></div> //0

  [arguments]
  new_arg_1770940290032: **SECRET**
  secret_keyword: **SECRET**
  add by **setArg**

  [form guide]
  - always use fillForm over input 1 by 1 except simple search
  - make sure provide all info you know about the form, if data is from files, add them to fs
  - provide any [GOAL] and context if any other task in [GOAL] related to widget within the form0

  [GOAL]
  email platform url: runever://benchmark/#/email

  ordering platform url: runever://benchmark/#/pos

  messager: runever://benchmark/#/im

  do what you can what you want, no botherUser

  login to email / pos account with:

  email: pikachu@pokemon.com

  password: P@ssword321

  read new order email and get order detail from it. then go to pos system, fill create order form with detail from the the order form and set earliest delivery date.

  in preview order step, if order amount > 1000, cap screenshot & go to messager, send him order file/detail & screenshot seek for manager dillion's approve, do what he advise in case

  after that save order, download the invoice in order list. go to email and reply the client with id, detail & invoice
  [/GOAL]

  [checklist 0/0]
  **you are first executor**, you must use [checklist.add] action to add check points unless you can finish it in few actions
  **breakdown conjunctions like and/then to multiple points, lines**, do A (and/then) B means adding ['A', 'B'], long/mixed check point is hard to trace, harmful.
  **follow [checklist rules], CAREFULLY DOUBLE CHECK if you add everything in proper way**`,
  score: ({ result, firstTokenMs, totalTimeMs }) => {
    let score = 0;
    try {
      if (result.startsWith('```json')) {
        // eslint-disable-next-line no-param-reassign
        result = result.slice(7);
        if (result.endsWith('```')) {
          // eslint-disable-next-line no-param-reassign
          result = result.slice(0, result.length - 3);
        }
      } else {
        score++;
      }
      const resultJson = JSON.parse(result);
      score++;
      const parsedResult = ExecutorLlmResultSchema.safeParse(resultJson);
      if (parsedResult.success) {
        if (parsedResult.data.a && parsedResult.data.a.length) {
          const allCheckpoints = getAllAddedCheckpoints(parsedResult.data.a);
          score++;
          const checklistInitStep = parsedResult.data.a.find((step) => {
            const action = step?.action;
            return (
              action &&
              ((action.k === 'checklist' && action.a === 'add') ||
                action.k === 'addNewTask')
            );
          });
          if (checklistInitStep) {
            const { action } = checklistInitStep;
            score += 2;
            if (getAddedCheckpointCount(action) > 10) {
              score += 0.5;
            }
          }
          if (hasFollowManagerAdviceCheckpoint(allCheckpoints)) {
            score += 0.5;
          }
          const loginActions = parsedResult.data.a.filter(
            (step) => step?.action,
          );
          const hasPasswordSetArg = hasSetArgKey(
            loginActions,
            'new_arg_1770940290032',
          );
          const fillFormLogin = loginActions.find((step) => {
            const { action } = step;
            return (
              action.k === 'fillForm' &&
              matchesActionQueryId(action.q, '®e') &&
              Array.isArray(action.data) &&
              action.data.find(
                (vv) => vv.f === 'email' && vv.v === 'pikachu@pokemon.com',
              ) &&
              action.data.find(
                (vv) =>
                  vv.f === 'password' &&
                  (vv.v === 'P@ssword321' ||
                    (hasPasswordSetArg &&
                      // eslint-disable-next-line no-template-curly-in-string
                      vv.v === '${args.new_arg_1770940290032}')),
              )
            );
          });

          if (fillFormLogin) {
            score += 1;
          } else {
            const emailInput = loginActions.find(
              (step) =>
                step.action.k === 'input' &&
                matchesActionQueryId(step.action.q, '®2') &&
                step.action.v === 'pikachu@pokemon.com',
            );
            const passwordInput = loginActions.find(
              (step) =>
                step.action.k === 'input' &&
                matchesActionQueryId(step.action.q, '®5') &&
                (step.action.v === 'P@ssword321' ||
                  (hasPasswordSetArg &&
                    // eslint-disable-next-line no-template-curly-in-string
                    step.action.v === '${args.new_arg_1770940290032}')),
            );
            const submitClick = loginActions.find(
              (step) =>
                step.action.k === 'mouse' &&
                step.action.a === 'click' &&
                matchesActionQueryId(step.action.q, '®c'),
            );

            if (emailInput && passwordInput) {
              score += 1;
            } else if (emailInput && submitClick) {
              score += 0.5;
            }
          }
        }
      }
    } catch (e) {}
    return {
      score,
      highlights: [],
    };
  },
};
