import type { BenchmarkCase } from '../../../types';
import {
  ExecutorLlmResultSchema,
  WireAction,
} from '../../../../../src/agentic/execution.schema';
import { standardSystemPrompt, standardUserPromptPrefix } from '../prompt';

const calendarQueryIds = ['®9u', '®9q'];

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const includesAllTokens = (value: string, tokens: string[]) => {
  const normalized = normalizeText(value);
  return tokens.every((token) => normalized.includes(normalizeText(token)));
};

export const reasoningCalendarTest: BenchmarkCase = {
  id: 'reasoning-calendar',
  name: 'Reasoning Calendar',
  maxScore: 5,
  systemPrompt: standardSystemPrompt.replace(
    'type WireAction=',
    `type WireAction=
|{
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
3:[Order Request: Office Setup - Rmail email] runever://benchmark/#/email/email-pos-pro-order: Opened POS in new tab from email read view to continue creating order
5:[Create Order - POS - RunEverMark] runever://benchmark/#/pos/create [focus]

[viewport]
w=1538 h=989

[html]
<script>const font = {\\"ff0\\":\\"\\\\\\"Fira Sans\\\\\\", \\\\\\"Gill Sans\\\\\\", \\\\\\"Trebuchet MS\\\\\\", sans-serif\\",\\"ff1\\":\\"-apple-system, BlinkMacSystemFont, \\\\\\"Segoe UI\\\\\\", Roboto, Helvetica, Arial, sans-serif\\",\\"ff2\\":\\"Arial, Helvetica, sans-serif\\"};
  const hls = {\\"#0\\":\\"13px / 19.5px ff0 #000\\",\\"#1\\":\\"12px / 18px ff0 #766\\",\\"#2\\":\\"500 16px / 24px ff0 #fff\\",\\"#3\\":\\"700 18px / 27px ff1 #024\\",\\"#4\\":\\"700 14px / 21px ff1 #333\\",\\"#5\\":\\"14px / 21px ff1 #333\\",\\"#6\\":\\"700 18px / 27px ff1 #fff\\",\\"#7\\":\\"500 13px / 19.5px ff1 #07d\\",\\"#8\\":\\"700 16px / 24px ff1 #333\\",\\"#9\\":\\"12px / 18px ff1 #766\\",\\"#10\\":\\"300 24px / 36px ff1 #07d\\",\\"#11\\":\\"700 28px / 42px ff1 #333\\",\\"#12\\":\\"16px / 24px ff1 #eb3\\",\\"#13\\":\\"16px / 24px ff1 #080\\",\\"#14\\":\\"700 18px / 27px ff1 #000\\",\\"#15\\":\\"16px / 24px ff1 #333\\",\\"#16\\":\\"700 13px / 19.5px ff1 #07d\\",\\"#17\\":\\"500 13px / 19.5px ff1 #fff\\",\\"#18\\":\\"600 14px / 21px ff1 #07d\\",\\"#19\\":\\"12px / 18px ff1 #000\\",\\"#20\\":\\"500 12px / 18px ff1 #07d\\",\\"#21\\":\\"13px / 19.5px ff1 #000\\",\\"#22\\":\\"13px / 19.5px ff1 #555\\",\\"#23\\":\\"16px / 24px ff1 #000\\",\\"#24\\":\\"16px / 18px ff2 rgba(16, 16, 16, 0.3)\\",\\"#25\\":\\"16px / 18px ff2 #000\\",\\"#26\\":\\"16px / 24px ff1 #555\\",\\"#27\\":\\"700 18px / 27px ff1 #07d\\",\\"#28\\":\\"500 14px / 21px ff1 #fff\\",\\"#29\\":\\"13.328px / 18px ff2 #ccc\\",\\"#30\\":\\"13.328px / 18px ff2 #aaa\\",\\"#31\\":\\"18px / 27px ff1 #333\\",\\"#32\\":\\"700 12px / 18px ff2 #333\\",\\"#33\\":\\"16px / 18px ff2 #333\\",\\"#34\\":\\"500 13px / 19.5px ff1 #f00\\",\\"#35\\":\\"700 13.6px / 20.4px ff0 #111\\",\\"#36\\":\\"13.6px / 20.4px ff0 #111\\"};</script><div id=®av xywh=28,-77,1465,1431 hls=15><span id=®63 hls=3>Sellforce POS</span><div id=®au xywh=28,-27,1465,1381><nav id=®6a><a id=®64 hls=5>Dashboard</a><a id=®65 hls=5>Orders</a><a id=®66 hls=5>Customers</a><a id=®67 hls=5>Inventory</a><a id=®68 hls=5>Reports</a><a id=®69 hls=5>Settings</a></nav><main id=®at xywh=268,-27,1225,1381><div id=®6f xywh=284,-11,1193,66><div id=®6d xywh=301,6,148,32 hls=14><span id=®6b hls=6>📄</span><span id=®6c>Create Order</span></div><button id=®6e hls=7>Refresh</button></div><form id=®as label=fields:12><div id=®9x><div id=®6q><h3 id=®6g hls=8>Client Information</h3><div id=®6j><label id=®6h hls=9>Client Name</label><input id=®6i val=\\"Northwind Travel\\" name=clientName required=1 hls=21 /></div><div id=®6m><label id=®6k hls=9>Email</label><input id=®6l val=contact@client.com name=clientEmail required=1 type=email hls=21 /></div><div id=®6p><label id=®6n hls=9>Phone</label><input id=®6o val=555-0100 name=clientPhone required=1 hls=21 /></div></div><div id=®9w><h3 id=®6r hls=8>Delivery Address</h3><div id=®6u><label id=®6s hls=9>Street</label><input id=®6t val=\\"123 Client St, Business City, ST 12345\\" name=address required=1 hls=21 /></div><div id=®71 xywh=893,194,568,62><div id=®6x xywh=893,194,476,62><label id=®6v hls=9>City</label><input id=®6w val=\\"Business City\\" name=city required=1 hls=21 /></div><div id=®70><label id=®6y hls=9>Region</label><input id=®6z val=ST name=region required=1 hls=21 /></div></div><div id=®74><label id=®72 hls=9>Postal Code</label><input id=®73 val=12345 name=postal required=1 hls=21 /></div><div id=®9v><label id=®75 hls=9>Delivery Date - order takes 11 months to produce</label><div id=®9u label=role:calendar hls=33><div id=®7c xywh=894,345,348,44><button id=®76 disabled=1 hls=24>«</button><button id=®77 disabled=1 hls=24>‹</button><button id=®79 hls=25><span id=®78>2026年2月</span></button><button id=®7a hls=25>›</button><button id=®7b hls=25>»</button></div><div id=®9t><div id=®9s><div id=®9r><div id=®7r label=role:calendar xywh=894,405,348,30 hls=32><div id=®7e xywh=894,405,50,30><abbr id=®7d label=星期一>週一</abbr></div><div id=®7g xywh=943,405,50,30><abbr id=®7f label=星期二>週二</abbr></div><div id=®7i xywh=993,405,50,30><abbr id=®7h label=星期三>週三</abbr></div><div id=®7k xywh=1043,405,50,30><abbr id=®7j label=星期四>週四</abbr></div><div id=®7m xywh=1092,405,50,30><abbr id=®7l label=星期五>週五</abbr></div><div id=®7o xywh=1142,405,50,30><abbr id=®7n label=星期六>週六</abbr></div><div id=®7q xywh=1192,405,50,30><abbr id=®7p label=星期日>週日</abbr></div></div><div id=®9q label=role:calendar xywh=894,435,348,190><button id=®7t xywh=894,435,50,38 disabled=1 hls=29><abbr disabled=1 id=®7s label=2026年1月26日>26日</abbr></button><button id=®7v xywh=943,435,50,38 disabled=1 hls=29><abbr disabled=1 id=®7u label=2026年1月27日>27日</abbr></button><button id=®7x xywh=993,435,50,38 disabled=1 hls=29><abbr disabled=1 id=®7w label=2026年1月28日>28日</abbr></button><button id=®7z xywh=1043,435,50,38 disabled=1 hls=29><abbr disabled=1 id=®7y label=2026年1月29日>29日</abbr></button><button id=®81 xywh=1092,435,50,38 disabled=1 hls=29><abbr disabled=1 id=®80 label=2026年1月30日>30日</abbr></button><button id=®83 xywh=1142,435,50,38 disabled=1 hls=29><abbr disabled=1 id=®82 label=2026年1月31日>31日</abbr></button><button id=®85 xywh=1192,435,50,38 disabled=1 hls=30><abbr disabled=1 id=®84 label=2026年2月1日>1日</abbr></button><button id=®87 xywh=894,473,50,38 disabled=1 hls=30><abbr disabled=1 id=®86 label=2026年2月2日>2日</abbr></button><button id=®89 xywh=943,473,50,38 disabled=1 hls=30><abbr disabled=1 id=®88 label=2026年2月3日>3日</abbr></button><button id=®8b xywh=993,473,50,38 disabled=1 hls=30><abbr disabled=1 id=®8a label=2026年2月4日>4日</abbr></button><button id=®8d xywh=1043,473,50,38 disabled=1 hls=30><abbr disabled=1 id=®8c label=2026年2月5日>5日</abbr></button><button id=®8f xywh=1092,473,50,38 disabled=1 hls=30><abbr disabled=1 id=®8e label=2026年2月6日>6日</abbr></button><button id=®8h xywh=1142,473,50,38 disabled=1 hls=30><abbr disabled=1 id=®8g label=2026年2月7日>7日</abbr></button><button id=®8j xywh=1192,473,50,38 disabled=1 hls=30><abbr disabled=1 id=®8i label=2026年2月8日>8日</abbr></button><button id=®8l xywh=894,511,50,38 disabled=1 hls=30><abbr disabled=1 id=®8k label=2026年2月9日>9日</abbr></button><button id=®8n xywh=943,511,50,38 disabled=1 hls=30><abbr disabled=1 id=®8m label=2026年2月10日>10日</abbr></button><button id=®8p xywh=993,511,50,38 disabled=1 hls=30><abbr disabled=1 id=®8o label=2026年2月11日>11日</abbr></button><button id=®8r xywh=1043,511,50,38 disabled=1 hls=30><abbr disabled=1 id=®8q label=2026年2月12日>12日</abbr></button><button id=®8t xywh=1092,511,50,38 disabled=1 hls=30><abbr disabled=1 id=®8s label=2026年2月13日>13日</abbr></button><button id=®8v xywh=1142,511,50,38 disabled=1 hls=30><abbr disabled=1 id=®8u label=2026年2月14日>14日</abbr></button><button id=®8x xywh=1192,511,50,38 disabled=1 hls=30><abbr disabled=1 id=®8w label=2026年2月15日>15日</abbr></button><button id=®8z xywh=894,549,50,38 disabled=1 hls=30><abbr disabled=1 id=®8y label=2026年2月16日>16日</abbr></button><button id=®91 xywh=943,549,50,38 disabled=1 hls=30><abbr disabled=1 id=®90 label=2026年2月17日>17日</abbr></button><button id=®93 xywh=993,549,50,38 disabled=1 hls=30><abbr disabled=1 id=®92 label=2026年2月18日>18日</abbr></button><button id=®95 xywh=1043,549,50,38 disabled=1 hls=30><abbr disabled=1 id=®94 label=2026年2月19日>19日</abbr></button><button id=®97 xywh=1092,549,50,38 disabled=1 hls=30><abbr disabled=1 id=®96 label=2026年2月20日>20日</abbr></button><button id=®99 xywh=1142,549,50,38 disabled=1 hls=30><abbr disabled=1 id=®98 label=2026年2月21日>21日</abbr></button><button id=®9b xywh=1192,549,50,38 disabled=1 hls=30><abbr disabled=1 id=®9a label=2026年2月22日>22日</abbr></button><button id=®9d xywh=894,587,50,38 disabled=1 hls=30><abbr disabled=1 id=®9c label=2026年2月23日>23日</abbr></button><button id=®9f xywh=943,587,50,38 disabled=1 hls=30><abbr disabled=1 id=®9e label=2026年2月24日>24日</abbr></button><button id=®9h xywh=993,587,50,38 disabled=1 hls=30><abbr disabled=1 id=®9g label=2026年2月25日>25日</abbr></button><button id=®9j xywh=1043,587,50,38 disabled=1 hls=30><abbr disabled=1 id=®9i label=2026年2月26日>26日</abbr></button><button id=®9l xywh=1092,587,50,38 disabled=1 hls=30><abbr disabled=1 id=®9k label=2026年2月27日>27日</abbr></button><button id=®9n xywh=1142,587,50,38 disabled=1 hls=30><abbr disabled=1 id=®9m label=2026年2月28日>28日</abbr></button><button id=®9p xywh=1192,587,50,38 disabled=1 hls=29><abbr disabled=1 id=®9o label=2026年3月1日>1日</abbr></button></div></div></div></div></div></div></div></div><div id=®ai><h3 id=®9z hls=8>Order Lines<button id=®9y xywh=1331,663,129,32 hls=7>+ Add Line Item</button></h3><div id=®ah xywh=301,712,1159,88><div id=®a2 xywh=314,725,670,62><label id=®a0 hls=9>Product</label><input id=®a1 label=role:combobox val=\\"Laptop Pro\\" placeholder=\\"Select a product...\\" hls=21 /></div><div id=®a7><label id=®a3 hls=9>Unit Price</label><div id=®a6><span id=®a4 xywh=1004,759,9,24 hls=26>$</span><input id=®a5 val=1200 type=number hls=21 /></div></div><div id=®aa><label id=®a8 hls=9>Qty</label><input id=®a9 val=2 type=number hls=21 /></div><div id=®ad><label id=®ab hls=9>Disc %</label><input id=®ac val=0 type=number hls=21 /></div><div id=®ag><div id=®ae hls=9>Subtotal</div><strong id=®af hls=8>$0.001200.002400.00</strong></div><button id=®br hls=34>✕</button></div><div id=®ca xywh=301,828,1159,88><div id=®bu xywh=314,841,670,62><label id=®bs hls=9>Product</label><input id=®bt label=role:combobox val=\\"Desk Chair\\" placeholder=\\"Select a product...\\" hls=21 /></div><div id=®bz><label id=®bv hls=9>Unit Price</label><div id=®by><span id=®bw xywh=1004,875,9,24 hls=26>$</span><input id=®bx val=350 type=number hls=21 /></div></div><div id=®c2><label id=®c0 hls=9>Qty</label><input id=®c1 val=3 type=number hls=21 /></div><div id=®c5><label id=®c3 hls=9>Disc %</label><input id=®c4 val=0 type=number hls=21 /></div><div id=®c8><div id=®c6 hls=9>Subtotal</div><strong id=®c7 hls=8>$0.00350.001050.00</strong></div><button id=®c9 hls=34>✕</button></div><div id=®dy xywh=301,944,1159,88><div id=®di xywh=314,957,670,62><label id=®dg hls=9>Product</label><input id=®dh label=role:combobox val=Keyboard placeholder=\\"Select a product...\\" hls=21 /></div><div id=®dn><label id=®dj hls=9>Unit Price</label><div id=®dm><span id=®dk xywh=1004,991,9,24 hls=26>$</span><input id=®dl val=80 type=number hls=21 /></div></div><div id=®dq><label id=®do hls=9>Qty</label><input id=®dp val=1 type=number hls=21 /></div><div id=®dt><label id=®dr hls=9>Disc %</label><input id=®ds val=0 type=number hls=21 /></div><div id=®dw><div id=®du hls=9>Subtotal</div><strong id=®dv hls=8>$0.0080.00</strong></div><button id=®dx hls=34>✕</button></div></div><div id=®an><h3 id=®aj hls=8>Additional Information</h3><div id=®am><label id=®ak hls=9>Remark</label><textarea id=®al val=\\"We are not open on monday, please do not delivery on monday\\" name=remark hls=23>We are not open on monday, please do not delivery on monday</textarea></div></div><div id=®ar xywh=301,1251,1159,54><div id=®ap sw=124 hls=31>Total:<strong id=®ao hls=27>$0.001200.001550.001630.002830.003530.00</strong></div><button id=®aq type=submit hls=28>Preview Order</button></div></form></main></div></div><ul label=role:listbox size0><li label=role:option><span>Laptop Pro - $1200</span></li></ul><ul label=role:listbox size0><li label=role:option><span>Laptop</span><span>Pro</span><span /><span>- $1200</span></li></ul><ul label=role:listbox size0><li label=role:option><span>Desk Chair - $350</span></li></ul><ul label=role:listbox size0><li label=role:option><span>Desk</span><span>Chair</span><span /><span>- $350</span></li></ul><ul label=role:listbox size0><li label=role:option><span>Keyboard - $80</span></li></ul><ul label=role:listbox size0><li label=role:option><span>Keyboard</span><span>- $80</span></li></ul> //165

[readable file]
- ATTACHED order_form.pdf: application/pdf desc from previous read:PDF purchase order with PO-5214, 3 line items, total $3530.00, and delivery remark about not delivering on Monday.


[arguments]
new_arg_1770940290032: **SECRET**
order_form.pdf-filename: order_form.pdf
po-number: PO-5214
po-date: 25 Feb 2026
client-name: Northwind Travel
client-address: 123 Client St, Business City, ST 12345
client-phone: 555-0100
client-email: contact@client.com
vendor-name: SalesForce POS System
items.0.name: Laptop Pro
items.0.qty: 2
items.0.price: 1200
items.0.total: 2400
items.1.name: Desk Chair
items.1.qty: 3
items.1.price: 350
items.1.total: 1050
items.2.name: Keyboard
items.2.qty: 1
items.2.price: 80
items.2.total: 80
order-total: 3530.00
remarks: We are not open on monday, please do not delivery on monday
attachment-filename: order_form.pdf
productLine2-search: Desk
add by **setArg**

[calendar guide]
- **MUST BE IN ISOLATED CHECK POINT**, cancel the original one and add seperated check points with pos to replace if it mix with other tasks before calling calendar.
- assign check point id to cp, the check point status will be handled.
- if the calendar do not come with input then use calendar action to set date.
- if calendar is in a form, do fillForm and see if it works first.
- the calendar executor is way more professional on calendar, do not give date & how-to & argument unless **the [GOAL] explicitly mentioned**.
- Give only what [GOAL] said and full related context in i, like rules & preferences from [GOAL] or [argument], pay more attention to those mentioned date/weekday.
- let calendar executor do the job! your calculation, infer, guess in action.i will block executor, just put context & words from [GOAL]. no arguments having date value.


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

[checklist 4/10]
0:Verified:Login to email account with email: pikachu@pokemon.com and password: P@ssword321,
1:Verified:Read new order email and extract order detail,
2:Verified:Login to POS system with email: pikachu@pokemon.com and password: P@ssword321,
3:Verified:Create order in POS using details from the order email,
4:Todo:Set earliest delivery date in POS create order form,
5:Todo:In preview, if order amount > 1000, capture screenshot and send order detail & screenshot to messenger for manager dillion's approval,
6:Todo:Follow manager dillion's advice and apply it in POS,
7:Todo:Save the order in POS,
8:Todo:Download the invoice from order list,
9:Todo:Reply to client email with order id, details & attached invoice
**checklist is from executor may not be 100% correct, stick to guide and rules**
**WORK IN ORDER one by one, skipping/shuffle absolutely not allowed, repeat ORDER IS IMPORTANT**

[tip from last executor]
**tip from last executor maybe outdated as page state changed, stick to the [GOAL] and current [HTML] page status and [performed actions] for what have been completed**
Set earliest delivery date next.



[performed actions]
**last 10 actions**
- open POS in new tab-Done
- set check point #2 to working - no actual action
- fill POS login form with credentials-Done
- click the Log In button-Done
- set check point #2 to verified - no actual action
- open Orders page-Done
- set check point #3 to working - no actual action
- click Create Order link-Done
- fill create order form:
- set check point #3 to verified - no actual action
**identify job status, move forward to goal**

[action error]
**consider redo**
Cannot mark checkpoint#3 as done as it's not working status
**reading order_form.pdf, save data valuable to [GOAL] in attached files with setArgs avoid re-read**`,
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
          score++;
          const action = parsedResult.data.a.find(
            (a) =>
              a.action.k === 'calendar' &&
              ((typeof a.action.q === 'string' &&
                calendarQueryIds.includes(a.action.q)) ||
                (typeof a.action.q === 'object' &&
                  calendarQueryIds.includes(a.action.q.id ?? ''))),
          )?.action as Extract<WireAction, { k: 'calendar' }> | undefined;
          if (action) {
            score++;
            const goalHint = action.ctx?.goalHint ?? '';
            const argValHint = action.ctx?.argValHint ?? '';
            const pageHint = action.ctx?.pageHint ?? '';
            const combinedHint = [argValHint, pageHint].join(' ');
            if (
              includesAllTokens(goalHint, ['delivery']) &&
              includesAllTokens(combinedHint, ['11', 'months', 'produce']) &&
              includesAllTokens(combinedHint, ['monday'])
            ) {
              score++;
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
