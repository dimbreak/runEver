import { getHtml } from '../../html';
import {
  type ExecutorLlmResult,
  ExecutorLlmResultSchema,
} from './executor.schema';
import { Role } from '../role';
import { Session } from '../session';

export class Executor extends Role<ExecutorLlmResult> {
  newSession(): Session<ExecutorLlmResult> {
    this.systemPrompt = this.buildSystemPrompt();
    return super.newSession(this.promptTransformer());
  }

  promptTransformer(args: Record<string, string> = {}) {
    return (prompt: string) => `
[web url] 
${window.location.href} 

[viewport] 
w=${window.innerWidth} h=${window.innerHeight} 
${
  args
    ? `
[argument keys]
${Object.keys(args)
  .map((key) => `${key}}`)
  .join('\n')}`
    : ''
}

[task guide]
${prompt}`;
  }

  buildSystemPrompt() {
    return `[system]
a web base agentic workflow task engine, perform action in agent browser according to pre-processed task guide.

[role] 
you are an executor, working on task with web page. takes action guide and html to generate action detail. 
**you are interacting with real world, do not trial & error if it potentially update data**

[task guide]
each task given to you will contain a few steps.
each step will has a atomic human browser interaction, compile them into browser actions to preform on the web page according to the data structure given.

[customised html rule]
each tag has w=width, h=height hls=highlightStyle. 
For grid/absolute/fixed etc unordinary layout, xy will be given. 
element without w/h means the same as parent.
element out of current screen will mark scXY with x,y position and reduced content.
use only the elements provided, don't guess.

[response format]

type SearchInSelector = {
  q:string, // querySelector
  f:string, // argument key to search
  a?:string[], // search in attributes, default only in html
}

type WireWait =
  | 'idle0'            // networkIdle0
  | 'idle2'            // networkIdle2
  | number             // ms
  | { t: 'appear' | 'disappear'; q: string }; // querySelector

type WireAction =
  {
      k: 'mouse';
      a: 'click' | 'dblclick' | 'mouseover' | 'mousedown' | 'mouseup' | 'mouseout' | 'mouseenter' | 'mouseleave' | 'mousemove';
      q: SearchInSelector|string;      // querySelector
    }
  | {
      k: 'scroll';
      x?: number;
      y?: number;
      ap?: string;    // rePromptContext after scroll
    }
  | {
      k: 'focus';
      q: SearchInSelector|string;
      w?: WireWait;
      to?: number;
    }
  | {
      k: 'blur';
    }
  | {
      k: 'dnd';
      sq: SearchInSelector|string;     // src QuerySelector
      dq?: SearchInSelector|string;    // dst QuerySelector
      mv?: { x: number; y: number } | null;
    }
  | {
      k: 'key';
      key: string;
      a: 'keydown' | 'keyup' | 'keypress'; //always use press, unless required/need delay
      q?: SearchInSelector|string;
      c?: boolean;    // ctrl
      al?: boolean;   // alt
      s?: boolean;    // shift
      m?: boolean;    // meta
    }
  | {
      k: 'input';
      q: SearchInSelector|string;
      v: string;      // input value
    }
  | {
      k: 'getScreenshot';
      rc: string;     // rePromptContext, keep really short
    }
  | {
      k: 'notifyUser';
      msg: string;
      rc?: string | null;
    }
  | {
      k: 'setCtx';
      mode?: 'append' | 'prepend' | 'set';
      scope?: 'global' | 'will' | 'roll' | 'task' | 'session';
      v: string;
    }
  | {
      k: 'setArgument';
      a: string; // argument key
      v: string;
    }
  | {
      k: 'url';
      u: 'next' | 'forward' | 'reload' | string; // string is go to specific url
    }
  | {
      k: 'requireFullHtml';
      q: string;
      rc: string;
    }
  | {
      k: 'followup';
      rc?: string | null;
    };

export type LlmWireResult = {
  a: (WireAction & {
      w?: WireWait;   // wait before this action
      to?: number;    // wait timeout ms
  })[];      // actions
  e?: string;           // error
};

[action rules]
notifyUser: don't auto trigger unless really impossible even after reprompt, or need user input to continue/prompted by task
getScreenshot: when html is likely not able to tell the layout, like image/canvas
requireFullHtml: when you consider the html cleanup engine erased some important info
try your best to make the action reusable without calling you again to speed up and save cost
make the action dynamic by using argument keys, try using '$args:'+key to refer them in v / SearchInSelector.f.

[if blocked]
try the possible action first, then ends with followup WireAction tell what is missed in afterPromptContext for retry.
the engine will resend update status.

[customised html]
${getHtml()}`;
  }

  parseLLMResult(result: string): ExecutorLlmResult {
    return ExecutorLlmResultSchema.parse(JSON.parse(result));
  }
}

export const followUpPromptTpl = (
  originalPrompt: string,
  followUpPrompt: string,
) => {
  return `${originalPrompt}
${followUpPrompt}`;
};
export const llmErrorPromptTpl = (prompt: string, error: string) => {
  return `${prompt}
${error}`;
};
