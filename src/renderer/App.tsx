import './App.css';
import { useMemo } from 'react';
import { TabBar } from './components/TabBar';
import { HomeScreen } from './view/HomeScreen';
import { ArgumentConfig } from './components/ArgumentConfig';
import { AgentPanel } from './components/AgentPanel';
import { useLayoutStore } from './state/layoutStore';
import { webviewService } from './services/webviewService';

webviewService.registerTabHandler();

export default function App() {
  const {
    isSidebarOpen,
    sidebarWidth,
    collapsedWidth,
    tabbarHeight,
    isConfigOpen,
    toggleConfig,
    bounds,
  } = useLayoutStore();
  const activeSidebarWidth = isSidebarOpen ? sidebarWidth : collapsedWidth;

  const leftWidthStyle = useMemo(
    () => ({ width: `calc(100% - ${activeSidebarWidth}px)` }),
    [activeSidebarWidth],
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
      <div
        className="flex flex-col"
        style={{ width: `${leftWidthStyle.width}` }}
      >
        <div
          className="flex border-b border-slate-200 bg-white"
          style={{ height: `${tabbarHeight}px` }}
        >
          <TabBar />
        </div>
        <div className="flex-1 overflow-hidden">
          <HomeScreen />
        </div>
      </div>
      <div
        className="h-full border-l border-slate-200 bg-white shadow-inner"
        style={{ width: `${activeSidebarWidth}px` }}
      >
        <AgentPanel />
      </div>
      {isConfigOpen && (
        <div
          className="fixed z-50 bg-white shadow-sm"
          style={{
            left: bounds.x,
            top: bounds.y,
            width: bounds.width,
            height: bounds.height,
          }}
        >
          <ArgumentConfig />
        </div>
      )}
    </div>
  );
}
