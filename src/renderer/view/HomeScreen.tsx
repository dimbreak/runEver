import * as React from 'react';
import { ToMianIpc } from '../../ipc/toMain';
import { useLayoutStore } from '../state/layoutStore';

export const HomeScreen: React.FC<{}> = () => {
  const {
    isSidebarOpen: sidebarOpen,
    sidebarWidth,
    collapsedWidth,
    tabbarHeight,
  } = useLayoutStore();
  const createdRef = React.useRef(false);
  const computeBounds = React.useCallback(() => {
    const padding = 12;
    const activeSidebarWidth = sidebarOpen ? sidebarWidth : collapsedWidth;
    const width = Math.max(
      320,
      window.innerWidth - activeSidebarWidth - padding * 2,
    );
    const height = Math.max(
      320,
      window.innerHeight - tabbarHeight - padding * 2,
    );
    return { x: padding, y: tabbarHeight + padding, width, height };
  }, [sidebarOpen, sidebarWidth, collapsedWidth, tabbarHeight]);

  // create webview only once
  React.useEffect(() => {
    // Skip when ipc bridge is unavailable (e.g., tests or non-Electron env)
    const hasIpc = typeof window !== 'undefined' && (window as any).electron?.ipcRenderer;
    if (!hasIpc) return;

    if (createdRef.current) return;
    createdRef.current = true;
    const createTab = async () => {
      try {
        const bounds = computeBounds();
        const tabRes = await ToMianIpc.createTab.invoke({
          url: 'http://www.google.com',
          bounds,
        });
        if ('id' in tabRes) {
          (window as any).lastFrameId = tabRes.id;
          (window as any).lastTabBounds = bounds;
          await ToMianIpc.operateTab.invoke({
            id: tabRes.id,
            bounds,
            sidebarWidth: sidebarOpen ? sidebarWidth : collapsedWidth,
            tabbarHeight,
          });
        }
      } catch (error) {
        console.error('Error creating tab:', error);
      }
    };
    createTab();
  }, [computeBounds, tabbarHeight, sidebarOpen, sidebarWidth, collapsedWidth]);

  // adjust bounds on sidebar/resizes via operateTab
  React.useEffect(() => {
    const applyLayout = () => {
      const hasIpc =
        typeof window !== 'undefined' && (window as any).electron?.ipcRenderer;
      if (!hasIpc) return;
      const frameId = (window as any).lastFrameId;
      if (!frameId) return;
      const bounds = computeBounds();
      ToMianIpc.operateTab.invoke({
        id: frameId,
        sidebarWidth: sidebarOpen ? sidebarWidth : collapsedWidth,
        tabbarHeight,
        bounds,
      });
    };
    applyLayout();
    window.addEventListener('resize', applyLayout);
    return () => window.removeEventListener('resize', applyLayout);
  }, [computeBounds, sidebarOpen, sidebarWidth, collapsedWidth, tabbarHeight]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 font-sans">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center space-y-4">
          <p className="text-sm uppercase tracking-[0.35em] text-slate-300">
            Agentic Browser
          </p>
          <h1 className="text-4xl font-black text-slate-900 drop-shadow-sm">
            Whatever, Whenever, Run.
          </h1>
          <p className="max-w-xl mx-auto text-slate-500">
            Start your own Agent, unified entry, converge complex work
            processes.
          </p>
        </div>
      </div>
    </div>
  );
};
