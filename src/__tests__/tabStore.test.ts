import { WebTab, useTabStore } from '../renderer/state/tabStore';

describe('tabStore', () => {
  beforeEach(() => {
    const tab1 = new WebTab({ id: 'tab-1', title: 'One', url: 'https://one' });
    const tab2 = new WebTab({ id: 'tab-2', title: 'Two', url: 'https://two' });
    useTabStore.setState({
      tabs: [tab1, tab2],
      activeTabId: 'tab-2',
      frameMap: new Map([
        ['tab-1', 101],
        ['tab-2', 202],
      ]),
    });
  });

  it('removes tab by frameId without IPC', () => {
    useTabStore.getState().removeTabByFrameId(202);
    const state = useTabStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(['tab-1']);
    expect(state.activeTabId).toBe('tab-1');
    expect(state.frameMap.get('tab-2')).toBeUndefined();
  });
});
