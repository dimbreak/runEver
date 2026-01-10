import { BrowserActionRisk } from '../../../main/llm/roles/system/planner.schema';
import { dummyCursor } from '../../../webView/cursor/cursor';
import { BrowserActions, WireActionToExec } from '../../../webView/actions';
import { Util } from '../../../webView/util';

export namespace SliderProfile {
  export const slideToVal = async (
    action: Extract<WireActionToExec, { k: 'slideToVal' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const slideEl =
      action.el ?? BrowserActions.getElementById(action.q, risk, args);
    const vMinStr = slideEl.getAttribute('aria-valuemin');
    const vMaxStr = slideEl.getAttribute('aria-valuemax');

    if (slideEl.getAttribute('role') !== 'slider' || !vMaxStr || !vMinStr) {
      throw new Error('Element is not a slider');
    }
    const container = slideEl.parentElement;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const vMin = parseFloat(vMinStr);
      const vMax = parseFloat(vMaxStr);
      await dummyCursor.moveToRect(slideEl);
      let pxPerVal = 0;
      let moveX = dummyCursor.x;
      let moveY = dummyCursor.y;
      if (containerRect.width > containerRect.height) {
        pxPerVal = containerRect.width / (vMax - vMin);
        moveX = pxPerVal * (action.v - vMin) + containerRect.x;
      } else {
        pxPerVal = containerRect.height / (vMax - vMin);
        moveY = pxPerVal * (action.v - vMin) + containerRect.y;
      }
      await BrowserActions.dndByPx(slideEl, moveX, moveY, true);

      await Util.sleep(200 + Math.random() * 200);
      // adjust to the val
      let valNow = parseFloat(slideEl.getAttribute('aria-valuenow') ?? '0');
      let toTry = 2;
      let keyCode = 'ArrowRight';
      while (valNow !== action.v && toTry !== 0) {
        if (containerRect.width > containerRect.height) {
          if (valNow > action.v) {
            keyCode = 'Left';
          } else {
            keyCode = 'Right';
          }
        } else if (valNow > action.v) {
          keyCode = 'Down';
        } else {
          keyCode = 'Up';
        }
        await BrowserActions.key(
          {
            k: 'key',
            a: 'keyDownUp',
            key: keyCode,
            q: action.q,
          },
          risk,
          args,
        );
        toTry--;
        valNow = parseFloat(slideEl.getAttribute('aria-valuenow') ?? '0');
      }
    }
  };
}
