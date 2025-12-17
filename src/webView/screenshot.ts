import { ToMainIpc } from '../contracts/toMain';

export const takeScreenshot = async (
  fullPage: boolean = true,
): Promise<Blob> => {
  console.log('takeScreenshot');
  const {
    scrollX,
    scrollY,
    document: {
      body: {
        style: { overflow },
      },
    },
  } = window;
  document.body.style.overflow = 'hidden';
  const vpHeight = window.innerHeight;
  const vpWidth = window.innerWidth;
  const ttlHeight = fullPage
    ? Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      )
    : vpHeight;
  const ttlWidth = fullPage
    ? Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    : vpWidth;

  const slices: { x: number; y: number }[] = [];
  let offsetY = 0;
  let offsetX = 0;

  while (offsetY < ttlHeight) {
    if (vpWidth < ttlWidth) {
      offsetX = 0;
      while (offsetX < ttlWidth) {
        slices.push({ y: offsetY, x: offsetX });
        offsetX += vpWidth;
      }
    } else {
      slices.push({ y: offsetY, x: 0 });
    }
    offsetY += vpHeight;
  }

  const imgs = await ToMainIpc.takeScreenshot.invoke({
    frameId: window.frameId ?? 0,
    ttlHeight,
    ttlWidth,
    vpHeight,
    vpWidth,
    slices,
  });
  window.scrollTo(scrollX, scrollY);
  document.body.style.overflow = overflow;
  if (Array.isArray(imgs)) {
    const canvas = new OffscreenCanvas(ttlWidth, ttlHeight);
    const ctx = canvas.getContext('2d')!;

    // Iterate through each image slice and draw it onto the canvas
    for (let i = 0; i < imgs.length; i++) {
      const slice = slices[i];
      const base64Img = Buffer.from(imgs[i]).toString('base64');
      const img = new Image();
      img.src = `data:image/png;base64,${base64Img}`;
      await new Promise<void>((resolve) => {
        img.onload = () => {
          console.log('img loaded', slice);
          ctx.drawImage(img, slice.x, slice.y);
          resolve();
        };
      });
    }

    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  }
  throw new Error(`Failed to take screenshot: ${imgs.error}`);
};
