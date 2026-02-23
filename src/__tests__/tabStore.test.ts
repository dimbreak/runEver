import { WebTab, useTabStore } from '../renderer/state/tabStore';

describe('tabStore', () => {
  beforeEach(() => {
    const tab1 = new WebTab({ id: 1, title: 'One', url: 'https://one' });
    const tab2 = new WebTab({ id: 2, title: 'Two', url: 'https://two' });
    useTabStore.setState({
      tabs: [tab1, tab2],
      activeTabId: 2,
    });
  });

  it('removes tab by frameId without IPC', async () => {
    useTabStore.getState().closeTab(2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const state = useTabStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual([1]);
    expect(state.activeTabId).toBe(1);
  });
});
