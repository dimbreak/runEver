import { Rectangle, WebContentsView } from 'electron';

export class TabWebView {
  id: string;

  url: string;

  webView: WebContentsView;

  constructor(
    public initUrl: string,
    public bounds: Rectangle,
  ) {
    this.id = TabWebView.generateId();
    this.url = initUrl;
    this.webView = new WebContentsView();
    this.initView();
  }

  static generateId(): string {
    return Math.random().toString(36).slice(2);
  }

  initView() {
    const { webContents } = this.webView;
    this.webView.setBounds(this.bounds);
    webContents.loadURL(this.url);
  }
}
