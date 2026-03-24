import type { BenchmarkCase } from '../../../types';
import { ExecutorLlmResultSchema } from '../../../../../src/agentic/execution.schema';
import { standardSystemPrompt, standardUserPromptPrefix } from '../prompt';

const matchesActionQueryId = (
  query: string | { id?: string } | undefined,
  expectedId: string,
) => {
  return (
    query === expectedId ||
    (typeof query === 'object' && query !== null && query.id === expectedId)
  );
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const matchesExpectedValue = (
  value: string | number | boolean | undefined,
  expectedValues: string[],
) => {
  return (
    typeof value === 'string' &&
    expectedValues.some((expected) => value === expected)
  );
};

type FillFormDatum = {
  f?: string;
  k?: string;
  key?: string;
  field?: string;
  label?: string;
  v?: string | number | boolean;
  value?: string | number | boolean;
};

const hasFillFormField = (
  data: FillFormDatum[],
  fieldKeys: string[],
  expectedValues: string[],
) => {
  const normalizedKeys = fieldKeys.map(normalizeText);

  return data.some((entry) => {
    const entryKeys = [entry.f, entry.k, entry.key, entry.field, entry.label]
      .filter((value): value is string => typeof value === 'string')
      .map(normalizeText);

    const matchesField = entryKeys.some((key) => normalizedKeys.includes(key));
    if (!matchesField) {
      return false;
    }

    return (
      matchesExpectedValue(entry.v, expectedValues) ||
      matchesExpectedValue(entry.value, expectedValues)
    );
  });
};

export const longFormFillingTest: BenchmarkCase = {
  id: 'long-form-filling',
  name: 'Long Form Filling',
  systemPrompt: standardSystemPrompt,
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
remark: We are not open on monday, please do not delivery on monday
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
add by **setArg**

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
Fill the form at ®91, context: Fill the create order form using order details in arguments: set client name, email, phone, delivery address fields, order lines (product, qty, unit price) for each item, totals, and remark.
**ignore submit request, you never submit**
**ignore if it request you to fill something not exists**

[filling guide]
- forms may have dynamic fields added from button or search field. Pay special attention to keyword **add line / add item / add product** etc, **PREPARE SUFFICIENT FIELDS FOR DATA BEFORE FILLING**.
- **MUST review filled form HTML** is the value match expectation. you are giving higher reasoning effort, try to consider all info like [GOAL], [arguments] and page status.
- avoid using enter key when filling form
- the submit/next-stage button must be clicked by parent executor, your duty is only filling the form.
- group ordinary input filling into one check point, isolate check point for special widget like calendar/combobox etc, and must add a check point to review the values at the end.
- previous executor may miss necessary info from files, re-read to check, and describe the file as CONFIRM MISSING XXX DATA if still not found.
- fill in existing fields with appropriate values, ignore differences in fields and value if it meet minimal form requirements, assign data to argument if not added.
- in case of missing data, check all source includes **FILES again if data missing** before botherUser.
- **REVIEW BLANK INPUTS**, check if it is reasonable to left blank

**make sure you filled all possible fields, and checked the values**
[/GOAL]

[checklist 0/0]
0.TODO:Fill the create order form's client name, email, and phone,
1.TODO:Fill the create order form's delivery address fields (Street, City, Region, Postal Code),
2.TODO:Prepare sufficient order line items by clicking + Add Line Item for each item in order_form.pdf,
3.TODO:Fill Order Lines with product, qty, and unit price for each item from order_form.pdf,
4.TODO:Fill Remark with remark from order_form.pdf and review all filled values in the form at ®91
**you are first executor**, you must use [checklist.add] action to add check points unless you can finish it in few actions
**reading order_form.pdf, save data valuable to [GOAL] in attached files with setArgs avoid re-read**`,
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
          const fillFormAction = actions.find(
            (item) =>
              item.action.k === 'fillForm' &&
              matchesActionQueryId(item.action.q, '®91') &&
              Array.isArray(item.action.data),
          );

          if (
            fillFormAction &&
            Array.isArray((fillFormAction.action as any).data)
          ) {
            const expectedFillFields = [
              {
                keys: ['clientName'],
                // eslint-disable-next-line no-template-curly-in-string
                values: ['${args.clientName}', 'Northwind Travel'],
              },
              {
                keys: ['clientEmail'],
                // eslint-disable-next-line no-template-curly-in-string
                values: ['${args.clientEmail}', 'contact@client.com'],
              },
              {
                keys: ['clientPhone'],
                // eslint-disable-next-line no-template-curly-in-string
                values: ['${args.clientPhone}', '555-0100'],
              },
              {
                keys: ['address'],
                // eslint-disable-next-line no-template-curly-in-string
                values: ['${args.address}', '123 Client St'],
              },
              {
                keys: ['city'],
                // eslint-disable-next-line no-template-curly-in-string
                values: ['${args.city}', 'Business City'],
              },
              {
                keys: ['region'],
                // eslint-disable-next-line no-template-curly-in-string
                values: ['${args.region}', 'ST'],
              },
              {
                keys: ['postal'],
                // eslint-disable-next-line no-template-curly-in-string
                values: ['${args.postal}', '12345'],
              },
              {
                keys: ['remark'],
                values: [
                  // eslint-disable-next-line no-template-curly-in-string
                  '${args.remark}',
                  'We are not open on monday, please do not delivery on monday',
                ],
              },
            ];
            const matchedFillFields = expectedFillFields.filter((field) =>
              hasFillFormField(
                (fillFormAction.action as any).data,
                field.keys,
                field.values,
              ),
            );

            if (matchedFillFields.length >= expectedFillFields.length - 2) {
              score++;
            }
            if (matchedFillFields.length === expectedFillFields.length) {
              score++;
            }
          }

          const addLineItemAction = actions.find(
            (item) =>
              item.action.k === 'mouse' &&
              item.action.a === 'click' &&
              matchesActionQueryId(item.action.q, '®87'),
          );

          if (addLineItemAction) {
            score++;
            if ((addLineItemAction.action as any).repeat === 2) {
              score++;
            }
          }

          const firstProductAction = actions.find(
            (item) =>
              item.action.k === 'combobox' &&
              matchesActionQueryId(item.action.q, '®8a') &&
              [
                'Laptop Pro',
                // eslint-disable-next-line no-template-curly-in-string
                '${items.0.name}',
                'Desk Chair',
                // eslint-disable-next-line no-template-curly-in-string
                '${items.1.name}',
                'Keyboard',
                // eslint-disable-next-line no-template-curly-in-string
                '${items.2.name}',
              ].includes(item.action.v),
          );

          if (firstProductAction) {
            score++;
          }
        }
      }
    } catch (e) {}
    return {
      score,
      highlights,
    };
  },
};
