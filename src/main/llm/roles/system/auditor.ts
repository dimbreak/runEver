import { NativeImage } from 'electron';
import { AuditResult, AuditResultSchema } from './auditor.schema';
import { LlmApi } from '../../api';
import { WireActionWithWaitAndRiskAndRec } from '../../../webView/session';

export class AuditorSession {
  runner: ReturnType<typeof LlmApi.queryLLMSession>;
  constructor() {
    this.runner = LlmApi.queryLLMSession(this.systemPrompt, 'auditor_');
  }

  async auditAction(
    plannerPrompt: string,
    steps: string[],
    action: WireActionWithWaitAndRiskAndRec,
    elementHtml: string,
    screenshot: NativeImage,
    args: Record<string, string> = {},
    extraInfo: Record<string, string> = {},
  ): Promise<AuditResult> {
    const pureAction: Partial<WireActionWithWaitAndRiskAndRec> = { ...action };
    delete pureAction.stepPrompt;
    delete pureAction.planId;
    delete pureAction.risk;
    delete pureAction.error;
    delete pureAction.id;
    const stram = this.runner(
      `[planner prompt]
${plannerPrompt}

[planned steps]
-${steps.join('\n-')}

[current action]
step prompt:${action.stepPrompt}
action: ${JSON.stringify(pureAction)}

[selected element html]
${elementHtml}${
        Object.keys(args).length
          ? `
[arguments]
${Object.entries(args)
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n')}`
          : ''
      }${
        Object.keys(extraInfo).length
          ? `
[extra info]
${Object.entries(extraInfo)
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n')}`
          : ''
      }

**attached screenshot jpeg**
`,
      [
        {
          type: 'image',
          image: screenshot.toJPEG(80),
          mediaType: 'image/jpeg',
        },
      ],
    );
    return AuditResultSchema.parse(JSON.parse(await LlmApi.wrapStream(stram)));
  }
  systemPrompt = `[system]
a web base agentic task running engine, perform action in agent browser according to user task prompt.

[role] 
You are an auditor.  
Your job is to strictly evaluate high-risk browser actions before they are executed on a live production website.

You will receive:
- the user task prompt representing the user's true intention
- the planner-generated step description (atomic action + risk level)
- the executor-generated action detail (querySelector, event type)
- surrounding HTML (at least 2 levels of outerHTML)
- a screenshot showing the target element and its context

Your duty:
- ONLY verify the correctness and safety of this single action.
- Ensure the selected element and suggested event EXACTLY match the user's intention and the planner's step description.
- If any mismatch exists — including intention mismatch, wrong element — you must reject.

Risk rules:
- All actions sent to you are high-risk.
- "Very high risk" actions trigger the requirement of user approval ONLY IF the user did not explicitly ask for such an irreversible or costly action.
- Very high risk includes: payments > USD $10, deleting accounts, deleting/batch-updating important data, irreversible submissions, or anything clearly destructive.
- If the action is very high risk and user task prompt not explicitly said no need approval, you must request explicit user approval.

Auditing principles:
- Never approve based solely on executor confidence or the existence of a matching querySelector.
- Use screenshot + html semantics to independently verify the correctness.
- If context is insufficient (e.g., multi-step destructive flows, ambiguous buttons like “Continue” or “Confirm”), request extra HTML levels or a larger screenshot.
- If ambiguity persists and action appears very high risk, request explicit user approval.

[Response format]
type AuditResult =
  {'result':'approved'} |
  {'result':'reject', 'reason':string} |
  {'result':'requireExtraDetail', 'htmlExtraLevel'?:true, 'largerScreenshot'?:true} |
  {'result':'requireUserApproval', 'messageToUser':string};
`;
}

export class Auditor {
  newAuditorSession(): AuditorSession {
    return new AuditorSession();
  }
}
