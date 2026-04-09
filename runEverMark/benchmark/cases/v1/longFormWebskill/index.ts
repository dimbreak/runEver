import type { BenchmarkCase } from '../../../types';
import { ExecutorLlmResultSchema } from '../../../../../src/agentic/execution.schema';
import { standardSystemPrompt, standardUserPromptPrefix } from '../prompt';

type PrepareOrderArg = {
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  address?: string;
  city?: string;
  region?: string;
  postal?: string;
  deliveryDate?: string;
  remark?: string;
  lines?: Array<{
    productId?: string;
    productName?: string;
    quantity?: number | string;
  }>;
};

const normalizeText = (value: string) => value.trim().toLowerCase();
const templatePlaceholder = (path: string) => `\${${path}}`;
const benchmarkToday = new Date();
const earliestDeliveryDate = new Date(benchmarkToday);
earliestDeliveryDate.setMonth(earliestDeliveryDate.getMonth() + 11);

const matchesExpectedString = (
  value: unknown,
  expectedValues: Array<string | undefined>,
) =>
  typeof value === 'string' &&
  expectedValues.filter(Boolean).some((expected) => value === expected);

const includesExpectedFragments = (
  value: unknown,
  expectedFragments: string[],
) =>
  typeof value === 'string' &&
  expectedFragments.every((fragment) =>
    normalizeText(value).includes(normalizeText(fragment)),
  );

const matchesExpectedQuantity = (
  value: unknown,
  expected: number,
  expectedTemplates: string[] = [],
) => {
  if (typeof value === 'number') {
    return value === expected;
  }
  if (typeof value === 'string') {
    return value === `${expected}` || expectedTemplates.includes(value);
  }
  return false;
};

const parseIsoDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const toUtcDayStart = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

const isValidDeliveryDate = (value: unknown) => {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return false;
  }

  if (
    toUtcDayStart(parsed).getTime() <
    toUtcDayStart(earliestDeliveryDate).getTime()
  ) {
    return false;
  }

  const weekday = parsed.getUTCDay();
  return weekday !== 1 && weekday !== 6 && weekday !== 0;
};

const normalizeTemplateJson = (value: string) => {
  let normalized = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];

    if (inString) {
      normalized += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      normalized += char;
      continue;
    }

    if (char === '$' && value[i + 1] === '{') {
      let end = i + 2;
      while (end < value.length && value[end] !== '}') {
        end += 1;
      }
      if (end < value.length) {
        normalized += JSON.stringify(value.slice(i, end + 1));
        i = end;
        continue;
      }
    }

    normalized += char;
  }

  return normalized;
};

const parseWebSkillArg = (value: unknown): PrepareOrderArg | null => {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value) as PrepareOrderArg;
  } catch {
    try {
      return JSON.parse(normalizeTemplateJson(value)) as PrepareOrderArg;
    } catch {
      return null;
    }
  }
};

export const longFormWebskillTest: BenchmarkCase = {
  id: 'long-form-webskill',
  name: 'Long Form Webskill',
  maxScore: 8,
  systemPrompt: standardSystemPrompt.replace(
    'type WireAction=',
    `type WireAction=
|{
  k:'activateWebSkill';//no other action after this
  mdUrl:'';
}|{
  k:'callWebSkill';//no other action after this
  href:'https://uat.fotopia.com.hk/skills/fotopiastore/SKILL.md';
  fnName:string;//include window._web_skills prefix
  arg?:string;//json 
}|{
  k:'fillForm';
  q:'®91'|Selector;//form id
  data:{f:string|Selector;v:string|string[]}[];//field name or selector and value to fill, string or js argument tpl'
}|{
  k:'combobox';
  q:'®8a'|Selector;//combobox id
  v:string;//value
}|{
  k:'calendar'; **you have no knowledge to pick date, no date & argument with date**
  q:'®83'|Selector;//calendar id
  ctx:{//give only full context, **you have no knowledge to pick date, no date & argument with date**
   goalHint:string|null;//guide from [GOAL], original word only
   argValHint:string|null;//give argument values that may related to this date picking, not only the key
   pageHint:string|null;//any content on the page related?
  };
}`,
  ),
  userPrompt: `${standardUserPromptPrefix}

  [url]
runever://benchmark/#/pos/create

[opened tabs]
3:[Order Request: Office Setup - Rmail email] runever://benchmark/#/email/email-pos-pro-order: Opened POS in new tab; current email page left in place with opened order email and attachment downloaded (order_form.pdf-file)
5:[Create Order - POS - RunEverMark] runever://benchmark/#/pos/create [focus]

[viewport]
w=1494 h=851

[html]
<script>const font = {\\"ff0\\":\\"\\\\\\"Fira Sans\\\\\\", \\\\\\"Gill Sans\\\\\\", \\\\\\"Trebuchet MS\\\\\\", sans-serif\\",\\"ff1\\":\\"-apple-system, BlinkMacSystemFont, \\\\\\"Segoe UI\\\\\\", Roboto, Helvetica, Arial, sans-serif\\",\\"ff2\\":\\"Arial, Helvetica, sans-serif\\"};
  const hls = {\\"#0\\":\\"13px / 19.5px ff0 #000\\",\\"#1\\":\\"12px / 18px ff0 #766\\",\\"#2\\":\\"500 16px / 24px ff0 #fff\\",\\"#3\\":\\"700 18px / 27px ff1 #024\\",\\"#4\\":\\"700 14px / 21px ff1 #333\\",\\"#5\\":\\"14px / 21px ff1 #333\\",\\"#6\\":\\"700 18px / 27px ff1 #fff\\",\\"#7\\":\\"500 13px / 19.5px ff1 #07d\\",\\"#8\\":\\"700 16px / 24px ff1 #333\\",\\"#9\\":\\"12px / 18px ff1 #766\\",\\"#10\\":\\"300 24px / 36px ff1 #07d\\",\\"#11\\":\\"700 28px / 42px ff1 #333\\",\\"#12\\":\\"16px / 24px ff1 #eb3\\",\\"#13\\":\\"16px / 24px ff1 #080\\",\\"#14\\":\\"700 18px / 27px ff1 #000\\",\\"#15\\":\\"16px / 24px ff1 #333\\",\\"#16\\":\\"700 13px / 19.5px ff1 #07d\\",\\"#17\\":\\"500 13px / 19.5px ff1 #fff\\",\\"#18\\":\\"600 14px / 21px ff1 #07d\\",\\"#19\\":\\"12px / 18px ff1 #000\\",\\"#20\\":\\"500 12px / 18px ff1 #07d\\",\\"#21\\":\\"13px / 19.5px ff1 #000\\",\\"#22\\":\\"13px / 19.5px ff1 #555\\",\\"#23\\":\\"16px / 24px ff1 #000\\",\\"#24\\":\\"16px / 18px ff2 rgba(16, 16, 16, 0.3)\\",\\"#25\\":\\"16px / 18px ff2 #000\\",\\"#26\\":\\"16px / 24px ff1 #555\\",\\"#27\\":\\"700 18px / 27px ff1 #07d\\",\\"#28\\":\\"500 14px / 21px ff1 #fff\\",\\"#29\\":\\"13.328px / 18px ff2 #ccc\\",\\"#30\\":\\"13.328px / 18px ff2 #aaa\\",\\"#31\\":\\"18px / 27px ff1 #333\\",\\"#32\\":\\"700 12px / 18px ff2 #333\\",\\"#33\\":\\"16px / 18px ff2 #333\\"};</script><div id=®94 hls=15><span id=®4c hls=3>Sellforce POS</span><div id=®93><nav id=®4j><a id=®4d hls=5>Dashboard</a><a id=®4e hls=5>Orders</a><a id=®4f hls=5>Customers</a><a id=®4g hls=5>Inventory</a><a id=®4h hls=5>Reports</a><a id=®4i hls=5>Settings</a></nav><main id=®92><div id=®4o><div id=®4m hls=14><span id=®4k hls=6>📄</span><span id=®4l>Create Order</span></div><button id=®4n hls=7>Refresh</button></div><form id=®91 label=fields:12><div id=®86><div id=®4z><h3 id=®4p hls=8>Client Information</h3><div id=®4s><label id=®4q hls=9>Client Name</label><input id=®4r val= name=clientName required=1 hls=21 /></div><div id=®4v><label id=®4t hls=9>Email</label><input id=®4u val= name=clientEmail required=1 type=email hls=21 /></div><div id=®4y><label id=®4w hls=9>Phone</label><input id=®4x val= name=clientPhone required=1 hls=21 /></div></div><div id=®85><h3 id=®50 hls=8>Delivery Address</h3><div id=®53><label id=®51 hls=9>Street</label><input id=®52 val= name=address required=1 hls=21 /></div><div id=®5a><div id=®56><label id=®54 hls=9>City</label><input id=®55 val= name=city required=1 hls=21 /></div><div id=®59><label id=®57 hls=9>Region</label><input id=®58 val= name=region required=1 hls=21 /></div></div><div id=®5d><label id=®5b hls=9>Postal Code</label><input id=®5c val= name=postal required=1 hls=21 /></div><div id=®84><label id=®5e hls=9>Delivery Date - order takes 11 months to produce</label><div id=®83 label=role:calendar hls=33><div id=®5l><button id=®5f disabled=1 hls=24>«</button><button id=®5g disabled=1 hls=24>‹</button><button id=®5i hls=25><span id=®5h>2026年2月</span></button><button id=®5j hls=25>›</button><button id=®5k hls=25>»</button></div><div id=®82><div id=®81><div id=®80><div id=®60 label=role:calendar hls=32><div id=®5n><abbr id=®5m label=星期一>週一</abbr></div><div id=®5p><abbr id=®5o label=星期二>週二</abbr></div><div id=®5r><abbr id=®5q label=星期三>週三</abbr></div><div id=®5t><abbr id=®5s label=星期四>週四</abbr></div><div id=®5v><abbr id=®5u label=星期五>週五</abbr></div><div id=®5x><abbr id=®5w label=星期六>週六</abbr></div><div id=®5z><abbr id=®5y label=星期日>週日</abbr></div></div><div id=®7z label=role:calendar><button id=®62 disabled=1 hls=29><abbr disabled=1 id=®61 label=2026年1月26日>26日</abbr></button><button id=®64 disabled=1 hls=29><abbr disabled=1 id=®63 label=2026年1月27日>27日</abbr></button><button id=®66 disabled=1 hls=29><abbr disabled=1 id=®65 label=2026年1月28日>28日</abbr></button><button id=®68 disabled=1 hls=29><abbr disabled=1 id=®67 label=2026年1月29日>29日</abbr></button><button id=®6a disabled=1 hls=29><abbr disabled=1 id=®69 label=2026年1月30日>30日</abbr></button><button id=®6c disabled=1 hls=29><abbr disabled=1 id=®6b label=2026年1月31日>31日</abbr></button><button id=®6e disabled=1 hls=30><abbr disabled=1 id=®6d label=2026年2月1日>1日</abbr></button><button id=®6g disabled=1 hls=30><abbr disabled=1 id=®6f label=2026年2月2日>2日</abbr></button><button id=®6i disabled=1 hls=30><abbr disabled=1 id=®6h label=2026年2月3日>3日</abbr></button><button id=®6k disabled=1 hls=30><abbr disabled=1 id=®6j label=2026年2月4日>4日</abbr></button><button id=®6m disabled=1 hls=30><abbr disabled=1 id=®6l label=2026年2月5日>5日</abbr></button><button id=®6o disabled=1 hls=30><abbr disabled=1 id=®6n label=2026年2月6日>6日</abbr></button><button id=®6q disabled=1 hls=30><abbr disabled=1 id=®6p label=2026年2月7日>7日</abbr></button><button id=®6s disabled=1 hls=30><abbr disabled=1 id=®6r label=2026年2月8日>8日</abbr></button><button id=®6u disabled=1 hls=30><abbr disabled=1 id=®6t label=2026年2月9日>9日</abbr></button><button id=®6w disabled=1 hls=30><abbr disabled=1 id=®6v label=2026年2月10日>10日</abbr></button><button id=®6y disabled=1 hls=30><abbr disabled=1 id=®6x label=2026年2月11日>11日</abbr></button><button id=®70 disabled=1 hls=30><abbr disabled=1 id=®6z label=2026年2月12日>12日</abbr></button><button id=®72 disabled=1 hls=30><abbr disabled=1 id=®71 label=2026年2月13日>13日</abbr></button><button id=®74 disabled=1 hls=30><abbr disabled=1 id=®73 label=2026年2月14日>14日</abbr></button><button id=®76 disabled=1 hls=30><abbr disabled=1 id=®75 label=2026年2月15日>15日</abbr></button><button id=®78 disabled=1 hls=30><abbr disabled=1 id=®77 label=2026年2月16日>16日</abbr></button><button id=®7a disabled=1 hls=30><abbr disabled=1 id=®79 label=2026年2月17日>17日</abbr></button><button id=®7c disabled=1 hls=30><abbr disabled=1 id=®7b label=2026年2月18日>18日</abbr></button><button id=®7e disabled=1 hls=30><abbr disabled=1 id=®7d label=2026年2月19日>19日</abbr></button><button id=®7g disabled=1 hls=30><abbr disabled=1 id=®7f label=2026年2月20日>20日</abbr></button><button id=®7i disabled=1 hls=30><abbr disabled=1 id=®7h label=2026年2月21日>21日</abbr></button><button id=®7k disabled=1 hls=30><abbr disabled=1 id=®7j label=2026年2月22日>22日</abbr></button><button id=®7m disabled=1 hls=30><abbr disabled=1 id=®7l label=2026年2月23日>23日</abbr></button><button id=®7o disabled=1 hls=30><abbr disabled=1 id=®7n label=2026年2月24日>24日</abbr></button><button id=®7q disabled=1 hls=30><abbr disabled=1 id=®7p label=2026年2月25日>25日</abbr></button><button id=®7s disabled=1 hls=30><abbr disabled=1 id=®7r label=2026年2月26日>26日</abbr></button><button id=®7u disabled=1 hls=30><abbr disabled=1 id=®7t label=2026年2月27日>27日</abbr></button><button id=®7w disabled=1 hls=30><abbr disabled=1 id=®7v label=2026年2月28日>28日</abbr></button><button id=®7y disabled=1 hls=29><abbr disabled=1 id=®7x label=2026年3月1日>1日</abbr></button></div></div></div></div></div></div></div></div><div id=®8r><h3 id=®88 hls=8>Order Lines<button id=®87 xywh=1287,764,129,32 hls=7>+ Add Line Item</button></h3><div id=®8q><div id=®8b><label id=®89 hls=9>Product</label><input id=®8a label=role:combobox val= placeholder=\\"Select a product...\\" hls=21 /></div><div id=®8g><label id=®8c hls=9>Unit Price</label><div id=®8f><span id=®8d xywh=1015,860,9,24 hls=26>$</span><input id=®8e val=0 disabled=1 type=number hls=22 /></div></div><div id=®8j><label id=®8h hls=9>Qty</label><input id=®8i val=1 disabled=1 type=number hls=22 /></div><div id=®8m><label id=®8k hls=9>Disc %</label><input id=®8l val=0 disabled=1 type=number hls=22 /></div><div id=®8p><div id=®8n hls=9>Subtotal</div><strong id=®8o hls=8>$0.00</strong></div></div></div><div id=®8w><h3 id=®8s hls=8>Additional Information</h3><div id=®8v><label id=®8t hls=9>Remark</label><textarea id=®8u val= name=remark hls=23 /></div></div><div id=®90><div id=®8y hls=31>Total:<strong id=®8x hls=27>$0.00</strong></div><button id=®8z type=submit hls=28>Preview Order</button></div></form></main></div></div><ul label=role:listbox size0><li label=role:option><span>Desk Chair - $350</span></li><li label=role:option><span>Keyboard - $80</span></li><li label=role:option><span>Laptop Pro - $1200</span></li><li label=role:option><span>Travel Item 4 - $26.4</span></li><li label=role:option><span>Office Item 5 - $31.2</span></li><li label=role:option><span>Wellness Item 6 - $36</span></li><li label=role:option><span>Home Item 7 - $40.8</span></li><li label=role:option><span>Garden Item 8 - $45.6</span></li><li label=role:option><span>Tech Item 9 - $50.4</span></li><li label=role:option><span>Travel Item 10 - $55.2</span></li></ul><ul label=role:listbox size0><li label=role:option><span>Desk Chair - $350</span></li><li label=role:option><span>Keyboard - $80</span></li><li label=role:option><span>Laptop Pro - $1200</span></li><li label=role:option><span>Travel Item 4 - $26.4</span></li><li label=role:option><span>Office Item 5 - $31.2</span></li><li label=role:option><span>Wellness Item 6 - $36</span></li><li label=role:option><span>Home Item 7 - $40.8</span></li><li label=role:option><span>Garden Item 8 - $45.6</span></li><li label=role:option><span>Tech Item 9 - $50.4</span></li><li label=role:option><span>Travel Item 10 - $55.2</span></li></ul> //15

[readable file]
- ATTACHED order_form.pdf: application/pdf desc from previous read:PDF order form attachment containing customer name, line items, quantities, prices, and requested delivery date.


[arguments]
order_form.pdf-file: order_form.pdf
clientName: Northwind Travel
clientEmail: contact@client.com
clientPhone: 555-0100
address: 123 Client St
city: Business City
region: ST
postal: 12345
remark: Deliver ASAP, but we are not open on monday, please do not delivery on monday
itemsCount: 3
items.0.name: Laptop Pro
items.0.qty: 5
items.0.unit_price: 1200.00
items.0.total: 6000.00
items.1.name: Desk Chair
items.1.qty: 1
items.1.unit_price: 350.00
items.1.total: 350.00
items.2.name: Keyboard
items.2.qty: 3
items.2.unit_price: 80.00
items.2.total: 240.00
orderDate: ${new Date().toISOString().split('T')[0]}
today: ${new Date().toISOString().split('T')[0]}
add by **setArg**


[webskill]
- webskills are instructions given to the current website, let you work with exact direct function instead of DOM action.
- work as ordinary agent skills, with discovered, activated, and called stage. should end action chain when advance stage, use next.tip to remind next executor.
- Prioritise to work with there when available and suit the GOAL, dom operation involve multiple turns, **they are slow and expensive even the dom is obvious**.
- when [webSkill called] return, use setArg to keep the data required in the goal if you cannot consume them in the turn.
- limit query to reasonable size, and consume the response in the response turn if possible to avoid holding long context in argument.


[Activated WebSkill]
call window._web_skills functions with callWebSkill, should not mix with other action.
<webSill href='/skills/posorderprep/SKILL.md' offical>
---
name: posorderprep
description: "Task-level action for preparing a create-order workflow. Prefer one prepareOrder call over manual DOM actions when order details are already available, especially when calendars or comboboxes would otherwise make the task slower and less certain."
---

# POS order preparation API for filling the create order form

Use the browser console entrypoint:

\`\`\`js
window._web_skills.posOrderPrep
\`\`\`

Available functions:

## \`prepareOrder(input)\`

Purpose: Use this task-level action when the order details are already available. Prefer it over decomposing the workflow into DOM form filling, add-line clicks, combobox selection, or calendar handling.

Operating complicated DOM widgets such as calendars and comboboxes is expensive and uncertain, and manual completion can easily take 10 or more turns. This function is usually the safer and faster one-shot path.

Populate the Create Order form, including client fields, delivery details, and line items, then leave the page ready for review before proceeding to the order confirmation page.

This function already handles delivery-date selection and line-item preparation. Prefer one complete \`prepareOrder\` call whenever the required order data is available from the prompt, arguments, or files.

Delivery date rules:
Use \`YYYY-MM-DD\` for \`deliveryDate\`.
The order takes 11 months to produce.
Do not choose a Saturday or Sunday delivery date.

Available products (\`productId\` | name | price | category):
- \`sku-chair\` | Desk Chair | $350.00 | Office
- \`sku-keyboard\` | Keyboard | $80.00 | Tech
- \`sku-laptop\` | Laptop Pro | $1200.00 | Tech
- \`sku-4\` | Travel Item 4 | $26.40 | Travel
- \`sku-5\` | Office Item 5 | $31.20 | Office
- \`sku-6\` | Wellness Item 6 | $36.00 | Wellness
- \`sku-7\` | Home Item 7 | $40.80 | Home
- \`sku-8\` | Garden Item 8 | $45.60 | Garden
- \`sku-9\` | Tech Item 9 | $50.40 | Tech
- \`sku-10\` | Travel Item 10 | $55.20 | Travel
- \`sku-11\` | Office Item 11 | $20.00 | Office
- \`sku-12\` | Wellness Item 12 | $24.80 | Wellness
- \`sku-13\` | Home Item 13 | $29.60 | Home
- \`sku-14\` | Garden Item 14 | $34.40 | Garden
- \`sku-15\` | Tech Item 15 | $39.20 | Tech
- \`sku-16\` | Travel Item 16 | $44.00 | Travel
- \`sku-17\` | Office Item 17 | $48.80 | Office
- \`sku-18\` | Wellness Item 18 | $53.60 | Wellness
- \`sku-19\` | Home Item 19 | $58.40 | Home
- \`sku-20\` | Garden Item 20 | $63.20 | Garden
- \`sku-21\` | Tech Item 21 | $28.00 | Tech
- \`sku-22\` | Travel Item 22 | $32.80 | Travel
- \`sku-23\` | Office Item 23 | $37.60 | Office
- \`sku-24\` | Wellness Item 24 | $42.40 | Wellness
- \`sku-25\` | Home Item 25 | $47.20 | Home
- \`sku-26\` | Garden Item 26 | $52.00 | Garden
- \`sku-27\` | Tech Item 27 | $56.80 | Tech
- \`sku-28\` | Travel Item 28 | $61.60 | Travel
- \`sku-29\` | Office Item 29 | $66.40 | Office
- \`sku-30\` | Wellness Item 30 | $71.20 | Wellness
- \`sku-31\` | Home Item 31 | $36.00 | Home
- \`sku-32\` | Garden Item 32 | $40.80 | Garden
- \`sku-33\` | Tech Item 33 | $45.60 | Tech
- \`sku-34\` | Travel Item 34 | $50.40 | Travel
- \`sku-35\` | Office Item 35 | $55.20 | Office
- \`sku-36\` | Wellness Item 36 | $60.00 | Wellness
- \`sku-37\` | Home Item 37 | $64.80 | Home
- \`sku-38\` | Garden Item 38 | $69.60 | Garden
- \`sku-39\` | Tech Item 39 | $74.40 | Tech
- \`sku-40\` | Travel Item 40 | $79.20 | Travel
- \`sku-41\` | Office Item 41 | $44.00 | Office
- \`sku-42\` | Wellness Item 42 | $48.80 | Wellness
- \`sku-43\` | Home Item 43 | $53.60 | Home
- \`sku-44\` | Garden Item 44 | $58.40 | Garden
- \`sku-45\` | Tech Item 45 | $63.20 | Tech
- \`sku-46\` | Travel Item 46 | $68.00 | Travel
- \`sku-47\` | Office Item 47 | $72.80 | Office
- \`sku-48\` | Wellness Item 48 | $77.60 | Wellness
- \`sku-49\` | Home Item 49 | $82.40 | Home
- \`sku-50\` | Garden Item 50 | $87.20 | Garden
- \`sku-51\` | Tech Item 51 | $52.00 | Tech
- \`sku-52\` | Travel Item 52 | $56.80 | Travel
- \`sku-53\` | Office Item 53 | $61.60 | Office
- \`sku-54\` | Wellness Item 54 | $66.40 | Wellness
- \`sku-55\` | Home Item 55 | $71.20 | Home
- \`sku-56\` | Garden Item 56 | $76.00 | Garden
- \`sku-57\` | Tech Item 57 | $80.80 | Tech
- \`sku-58\` | Travel Item 58 | $85.60 | Travel
- \`sku-59\` | Office Item 59 | $90.40 | Office
- \`sku-60\` | Wellness Item 60 | $95.20 | Wellness
- \`sku-61\` | Home Item 61 | $60.00 | Home
- \`sku-62\` | Garden Item 62 | $64.80 | Garden
- \`sku-63\` | Tech Item 63 | $69.60 | Tech
- \`sku-64\` | Travel Item 64 | $74.40 | Travel
- \`sku-65\` | Office Item 65 | $79.20 | Office
- \`sku-66\` | Wellness Item 66 | $84.00 | Wellness
- \`sku-67\` | Home Item 67 | $88.80 | Home
- \`sku-68\` | Garden Item 68 | $93.60 | Garden
- \`sku-69\` | Tech Item 69 | $98.40 | Tech
- \`sku-70\` | Travel Item 70 | $103.20 | Travel
- \`sku-71\` | Office Item 71 | $68.00 | Office
- \`sku-72\` | Wellness Item 72 | $72.80 | Wellness
- \`sku-73\` | Home Item 73 | $77.60 | Home
- \`sku-74\` | Garden Item 74 | $82.40 | Garden
- \`sku-75\` | Tech Item 75 | $87.20 | Tech
- \`sku-76\` | Travel Item 76 | $92.00 | Travel
- \`sku-77\` | Office Item 77 | $96.80 | Office
- \`sku-78\` | Wellness Item 78 | $101.60 | Wellness
- \`sku-79\` | Home Item 79 | $106.40 | Home
- \`sku-80\` | Garden Item 80 | $111.20 | Garden
- \`sku-81\` | Tech Item 81 | $76.00 | Tech
- \`sku-82\` | Travel Item 82 | $80.80 | Travel
- \`sku-83\` | Office Item 83 | $85.60 | Office
- \`sku-84\` | Wellness Item 84 | $90.40 | Wellness
- \`sku-85\` | Home Item 85 | $95.20 | Home
- \`sku-86\` | Garden Item 86 | $100.00 | Garden
- \`sku-87\` | Tech Item 87 | $104.80 | Tech
- \`sku-88\` | Travel Item 88 | $109.60 | Travel
- \`sku-89\` | Office Item 89 | $114.40 | Office
- \`sku-90\` | Wellness Item 90 | $119.20 | Wellness
- \`sku-91\` | Home Item 91 | $84.00 | Home
- \`sku-92\` | Garden Item 92 | $88.80 | Garden
- \`sku-93\` | Tech Item 93 | $93.60 | Tech
- \`sku-94\` | Travel Item 94 | $98.40 | Travel
- \`sku-95\` | Office Item 95 | $103.20 | Office
- \`sku-96\` | Wellness Item 96 | $108.00 | Wellness
- \`sku-97\` | Home Item 97 | $112.80 | Home
- \`sku-98\` | Garden Item 98 | $117.60 | Garden
- \`sku-99\` | Tech Item 99 | $122.40 | Tech
- \`sku-100\` | Travel Item 100 | $127.20 | Travel
- \`sku-101\` | Office Item 101 | $92.00 | Office
- \`sku-102\` | Wellness Item 102 | $96.80 | Wellness
- \`sku-103\` | Home Item 103 | $101.60 | Home
- \`sku-104\` | Garden Item 104 | $106.40 | Garden
- \`sku-105\` | Tech Item 105 | $111.20 | Tech
- \`sku-106\` | Travel Item 106 | $116.00 | Travel
- \`sku-107\` | Office Item 107 | $120.80 | Office
- \`sku-108\` | Wellness Item 108 | $125.60 | Wellness
- \`sku-109\` | Home Item 109 | $130.40 | Home
- \`sku-110\` | Garden Item 110 | $135.20 | Garden
- \`sku-111\` | Tech Item 111 | $100.00 | Tech
- \`sku-112\` | Travel Item 112 | $104.80 | Travel
- \`sku-113\` | Office Item 113 | $109.60 | Office
- \`sku-114\` | Wellness Item 114 | $114.40 | Wellness
- \`sku-115\` | Home Item 115 | $119.20 | Home
- \`sku-116\` | Garden Item 116 | $124.00 | Garden
- \`sku-117\` | Tech Item 117 | $128.80 | Tech
- \`sku-118\` | Travel Item 118 | $133.60 | Travel
- \`sku-119\` | Office Item 119 | $138.40 | Office
- \`sku-120\` | Wellness Item 120 | $143.20 | Wellness

Prefer \`productId\` for exact matching. \`productName\` is available when the caller only knows the display name.

Input:

\`\`\`ts
{
  clientName: string; // minLength: 1
  clientEmail: string; // format: email
  clientPhone: string; // minLength: 1
  address: string; // minLength: 1
  city: string; // minLength: 1
  region: string; // minLength: 1
  postal: string; // minLength: 1
  deliveryDate: string; // minLength: 1
  remark?: string;
  lines: ({
    productId?: string; // minLength: 1
    productName?: string; // minLength: 1
    quantity: number; // int, gt: 0
    unitPrice?: number; // min: 0
    discount?: number; // min: 0, max: 50
  })[];
}
\`\`\`

Output:

\`\`\`ts
{
  route: string;
  lineCount: number; // int, gt: 0
  orderTotal: number; // min: 0
  readyForPreview: boolean;
}
\`\`\`
</webSkill>

[calendar guide]
- **MUST BE IN ISOLATED CHECK POINT**, cancel the original one and add seperated check points with pos to replace if it mix with other tasks before calling calendar.
- assign check point id to cp, the check point status will be handled.
- if the calendar do not come with input then use calendar action to set date.
- if calendar is in a form, do fillForm and see if it works first.
- the calendar executor is way more professional on calendar, do not give date & how-to & argument unless **the [GOAL] explicitly mentioned**.
- Give only what [GOAL] said and full related context in i, like rules & preferences from [GOAL] or argument.
- let calendar executor do the job! your calculation, infer, guess in action.i will block executor, just put context & words from [GOAL]. no arguments having date value.


[combobox guide]
- use combobox action to set value.
- if combobox is in a long form, do fill form see if it works first.
- combobox action **MUST BE IN ISOLATED CHECK POINT**, cancel the original one and add seperated check points with pos to replace if it mix with other tasks before calling combobox.
- assign check point id to cp, the check point status will be handled.
- combobox may not have the exact value, action will try to find the closest one.
- MUST USE CLICK TO PICK VALUE, **enter key may accidentally submit the form, it is danger**

[form guide]
- always use fillForm over input 1 by 1


[GOAL]
Create order using details in arguments extracted from order_form.pdf: set client name, email, phone, delivery address fields, order lines (product, qty, unit price) for each item, totals, and remark.
delivery date is up to the production lead time shown on the page & client instruction.
[/GOAL]

[checklist 0/0]
0.TODO:Complete the create order form,
1.TODO:Verify the inputs
  **checklist is from executor may not be 100% correct, stick to guide and rules**
  **WORK IN ORDER one by one, skipping/shuffle absolutely not allowed, repeat ORDER IS IMPORTANT**`,
  score: ({ result, firstTokenMs, totalTimeMs }) => {
    let score = 0;
    const highlights: string[] = [];
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
          score++;
          const actions = parsedResult.data.a;
          const webSkillAction = actions.find(
            (item) =>
              item.action.k === 'callWebSkill' &&
              item.action.fnName ===
                'window._web_skills.posOrderPrep.prepareOrder',
          );

          if (webSkillAction) {
            score++;
            const parsedArg = parseWebSkillArg(
              (webSkillAction.action as { arg?: string }).arg,
            );

            if (!parsedArg) {
              highlights.push('prepareOrder arg is not valid json');
            } else {
              const clientInfoOk =
                matchesExpectedString(parsedArg.clientName, [
                  templatePlaceholder('args.clientName'),
                  'Northwind Travel',
                ]) &&
                matchesExpectedString(parsedArg.clientEmail, [
                  templatePlaceholder('args.clientEmail'),
                  'contact@client.com',
                ]) &&
                matchesExpectedString(parsedArg.clientPhone, [
                  templatePlaceholder('args.clientPhone'),
                  '555-0100',
                ]) &&
                (matchesExpectedString(parsedArg.remark, [
                  templatePlaceholder('args.remark'),
                  'Deliver ASAP, but we are not open on monday, please do not delivery on monday',
                  'We are not open on monday, please do not delivery on monday',
                ]) ||
                  includesExpectedFragments(parsedArg.remark, [
                    'not open on monday',
                    'do not delivery on monday',
                  ]));
              const addressOk =
                matchesExpectedString(parsedArg.address, [
                  templatePlaceholder('args.address'),
                  '123 Client St',
                ]) &&
                matchesExpectedString(parsedArg.city, [
                  templatePlaceholder('args.city'),
                  'Business City',
                ]) &&
                matchesExpectedString(parsedArg.region, [
                  templatePlaceholder('args.region'),
                  'ST',
                ]) &&
                matchesExpectedString(parsedArg.postal, [
                  templatePlaceholder('args.postal'),
                  '12345',
                ]);

              if (clientInfoOk && addressOk) {
                score++;
              } else {
                highlights.push('client, address, or remark mismatch');
              }

              const expectedLines = [
                {
                  productId: 'sku-laptop',
                  productName: 'Laptop Pro',
                  productNameTemplates: [
                    templatePlaceholder('args.items.0.name'),
                    templatePlaceholder("args['items.0.name']"),
                  ],
                  quantity: 5,
                  quantityTemplates: [
                    templatePlaceholder('args.items.0.qty'),
                    templatePlaceholder("args['items.0.qty']"),
                  ],
                },
                {
                  productId: 'sku-chair',
                  productName: 'Desk Chair',
                  productNameTemplates: [
                    templatePlaceholder('args.items.1.name'),
                    templatePlaceholder("args['items.1.name']"),
                  ],
                  quantity: 1,
                  quantityTemplates: [
                    templatePlaceholder('args.items.1.qty'),
                    templatePlaceholder("args['items.1.qty']"),
                  ],
                },
                {
                  productId: 'sku-keyboard',
                  productName: 'Keyboard',
                  productNameTemplates: [
                    templatePlaceholder('args.items.2.name'),
                    templatePlaceholder("args['items.2.name']"),
                  ],
                  quantity: 3,
                  quantityTemplates: [
                    templatePlaceholder('args.items.2.qty'),
                    templatePlaceholder("args['items.2.qty']"),
                  ],
                },
              ];

              expectedLines.forEach((expectedLine) => {
                const matchedLine = parsedArg.lines?.find(
                  (line) =>
                    (line.productId === expectedLine.productId ||
                      line.productName === expectedLine.productName ||
                      expectedLine.productNameTemplates.includes(
                        line.productName || '',
                      )) &&
                    matchesExpectedQuantity(
                      line.quantity,
                      expectedLine.quantity,
                      expectedLine.quantityTemplates,
                    ),
                );

                if (matchedLine) {
                  score += 0.8;
                }
              });

              if (
                !expectedLines.every((expectedLine) =>
                  parsedArg.lines?.some(
                    (line) =>
                      (line.productId === expectedLine.productId ||
                        line.productName === expectedLine.productName ||
                        expectedLine.productNameTemplates.includes(
                          line.productName || '',
                        )) &&
                      matchesExpectedQuantity(
                        line.quantity,
                        expectedLine.quantity,
                        expectedLine.quantityTemplates,
                      ),
                  ),
                )
              ) {
                highlights.push('line items productId or quantity mismatch');
              }

              if (isValidDeliveryDate(parsedArg.deliveryDate)) {
                score += 0.6;
              } else {
                highlights.push(
                  'delivery date must be at least 11 months after today and not monday/saturday/sunday',
                );
              }
            }
          } else {
            highlights.push('missing prepareOrder webskill call');
          }
        }
      }
    } catch (e) {}
    return {
      score: Math.round(score * 10) / 10,
      highlights,
    };
  },
};
