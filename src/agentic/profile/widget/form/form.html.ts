import { BrowserActionRisk } from '../../../../main/llm/roles/system/planner.schema';
import { BrowserActions } from '../../../../webView/actions';
import { FillFormAction, FillFormValue } from './form.schema';
import { CommonUtil } from '../../../../utils/common';

export const checkFormAndFieldCount = (element: HTMLFormElement) => {
  const fields = element.querySelectorAll(
    'input:not([type="hidden"]), select, textarea',
  );
  if (fields.length > 0) {
    return `fields:${Array.from(fields).filter((f) => f.clientWidth !== 0 && f.clientHeight !== 0).length}`;
  }
  return null;
};

export const fillFormExec = async (
  action: FillFormAction & { el?: Element },
  risk: BrowserActionRisk,
  args: Record<string, string> = {},
) => {
  const fillFormAction = action;
  if (Array.isArray(fillFormAction.data)) {
    const { webView } = window;
    const formEl = action.el ?? webView.getEl(action.q).element;

    if (formEl instanceof HTMLFormElement) {
      let fieldEls: HTMLElement[];
      let fieldEl: HTMLElement | undefined;
      let strVs: string[];
      let strV: string;
      let typeAttr: string | null;
      let kv: FillFormValue;
      const errors: string[] = [];
      for (kv of fillFormAction.data) {
        fieldEls = (typeof kv.f === 'string'
          ? Array.from(formEl.querySelectorAll(`[name="${kv.f}"]`))
          : null) ?? [webView.getEl(kv.f).element];
        if (fieldEls.length === 0) {
          errors.push(`Cannot find field ${kv.f}`);
          continue;
        }
        typeAttr =
          fieldEls[0].tagName === 'INPUT'
            ? fieldEls[0].getAttribute('type')
            : null;
        if ((typeAttr && typeAttr === 'checkbox') || typeAttr === 'radio') {
          strVs = Array.isArray(kv.v) ? kv.v : [kv.v];
          for (strV of strVs) {
            fieldEl = fieldEls.find(
              (f) =>
                f.getAttribute('value') === CommonUtil.replaceJsTpl(strV, args),
            );
            await BrowserActions.mouse(
              {
                k: 'mouse',
                a: 'click',
                q: kv.f,
                el: fieldEl,
              },
              risk,
              args,
            );
          }
        } else {
          await BrowserActions.input(
            {
              k: 'input',
              q: kv.f,
              v: kv.v,
              el: fieldEls[0],
            },
            risk,
            args,
          );
        }
      }
      if (errors.length) throw new Error(errors.join('\n'));
    } else {
      throw new Error('Element is not a form');
    }
  }
};
