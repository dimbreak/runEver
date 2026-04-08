import { ToMainIpc } from '../contracts/toMain';

export const takeScreenshot = async (filename: string, el?: Element) => {
  console.log('takeScreenshot');
  const vpHeight = window.innerHeight;
  const vpWidth = window.innerWidth;
  const { x, y, height, width } = el
    ? el.getBoundingClientRect()
    : {
        width: document.body.scrollWidth,
        height: document.body.scrollHeight,
        x: 0,
        y: 0,
      };
  await ToMainIpc.takeScreenshot.invoke({
    sessionId: window.sessionId ?? 0,
    frameId: window.frameId ?? 0,
    x,
    y,
    height,
    width,
    vpHeight,
    vpWidth,
    filename,
  });
};
