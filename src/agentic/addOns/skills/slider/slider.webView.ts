import { BrowserActionRisk } from '../../../../main/llm/roles/system/planner.schema';
import { dummyCursor } from '../../../../webView/cursor/cursor';
import { BrowserActions, WireActionToExec } from '../../../../webView/actions';
import { Util } from '../../../../webView/util';

export namespace SliderSkill {
  export const slideToVal = async (
    action: Extract<WireActionToExec, { k: 'slideToVal' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const slideEl =
      action.el ?? BrowserActions.getElementById(action.q, risk, args);
    const vMinStr = slideEl.getAttribute('aria-valuemin');
    const vMaxStr = slideEl.getAttribute('aria-valuemax');

    if (
      (slideEl.getAttribute('role') !== 'slider' &&
        slideEl.getAttribute('type') !== 'range') ||
      !vMaxStr ||
      !vMinStr
    ) {
      throw new Error('Element is not a slider');
    }
    const vMin = parseFloat(vMinStr);
    const vMax = parseFloat(vMaxStr);
    const slideRect = slideEl.getBoundingClientRect();
    const isHorizontalBar = slideRect.width / slideRect.height > 2;
    const isVerticalBar = slideRect.height / slideRect.width > 2;

    if (isHorizontalBar || isVerticalBar) {
      // The slider element is the track bar; its handle is likely a
      // pseudo-element. Use aria-valuenow to find the handle position.
      const vNowStr = slideEl.getAttribute('aria-valuenow');
      const vNow = vNowStr ? parseFloat(vNowStr) : vMin;
      const nowRatio = (vNow - vMin) / (vMax - vMin);
      let target = action.num;

      // If aria-valuetext exists and its numeric content differs from
      // aria-valuenow, the text value is the real one (e.g. Amazon sliders
      // where valuetext="$50" but valuenow is an internal index).
      const valueText = slideEl.getAttribute('aria-valuetext');
      if (valueText) {
        const textNum = parseFloat(valueText.replace(/[^0-9.\-]/g, ''));
        if (!Number.isNaN(textNum) && textNum !== vNow) {
          target += vNow - textNum;
          console.log('textNum', textNum, vNow, target);
        }
      }

      const targetRatio = (target - vMin) / (vMax - vMin);
      // Move cursor to where the handle currently is
      let handleX: number;
      let handleY: number;
      let size: number;
      if (isHorizontalBar) {
        handleX = slideRect.x + nowRatio * slideRect.width;
        if (nowRatio > 0.5) {
          handleX -= 10;
        } else {
          handleX += 10;
        }
        handleY = slideRect.y + slideRect.height / 2;
        size = slideRect.height;
      } else {
        handleX = slideRect.x + slideRect.width / 2;
        handleY = slideRect.y + nowRatio * slideRect.height;
        if (nowRatio > 0.5) {
          handleY -= 10;
        } else {
          handleY += 10;
        }
        size = slideRect.width;
      }

      // Drag to the target value position
      let moveX = handleX;
      let moveY = handleY;
      if (isHorizontalBar) {
        moveX = slideRect.x + targetRatio * slideRect.width;
      } else {
        moveY = slideRect.y + targetRatio * slideRect.height;
      }
      await BrowserActions.dndByPx(
        new DOMRect(handleX, handleY, size, size),
        moveX,
        moveY,
        true,
      );

      // Fine-tune with arrow keys
      await Util.sleep(100 + Math.random() * 100);
      let valNow = parseFloat(slideEl.getAttribute('aria-valuenow') ?? '0');
      let toTry = vMax - vMin;
      while (toTry !== 0) {
        let keyCode: string;
        if (isHorizontalBar) {
          keyCode = valNow > target ? 'Left' : 'Right';
        } else {
          keyCode = valNow > target ? 'Down' : 'Up';
        }
        await BrowserActions.key(
          { k: 'key', a: 'keyDownUp', key: keyCode, q: action.q, el: slideEl },
          risk,
          args,
        );
        toTry--;
        await Util.sleep(20 + Math.random() * 20);

        const thisValueText = slideEl.getAttribute('aria-valuetext');
        if (thisValueText) {
          valNow = parseFloat(thisValueText.replace(/[^0-9.\-]/g, ''));
          if (!Number.isNaN(valNow)) {
            if (valNow === action.num) {
              break;
            }
            continue;
          }
        }
        valNow = parseFloat(slideEl.getAttribute('aria-valuenow') ?? '0');
        if (valNow === target) {
          break;
        }
      }
      return;
    }
    const container = slideEl.parentElement;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      await dummyCursor.moveToRect(slideEl);
      let pxPerVal = 0;
      let moveX = dummyCursor.x;
      let moveY = dummyCursor.y;
      if (containerRect.width > containerRect.height) {
        pxPerVal = containerRect.width / (vMax - vMin);
        moveX = pxPerVal * (action.num - vMin) + containerRect.x;
      } else {
        pxPerVal = containerRect.height / (vMax - vMin);
        moveY = pxPerVal * (action.num - vMin) + containerRect.y;
      }
      await BrowserActions.dndByPx(slideEl, moveX, moveY, true);

      await Util.sleep(200 + Math.random() * 200);
      // adjust to the val
      let valNow = parseFloat(slideEl.getAttribute('aria-valuenow') ?? '0');
      let toTry = 2;
      let keyCode = 'ArrowRight';
      while (valNow !== action.num && toTry !== 0) {
        if (containerRect.width > containerRect.height) {
          if (valNow > action.num) {
            keyCode = 'Left';
          } else {
            keyCode = 'Right';
          }
        } else if (valNow > action.num) {
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
