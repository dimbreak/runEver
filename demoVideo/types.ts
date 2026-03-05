export interface VideoConfig {
  videoSrc: string;
  /** 可選：影片初始播放時間（秒），方便測試修改時可以直接跳到該處 */
  startPoint?: number;
  timeline: TimelineEvent[];
}

export type TimelineEvent =
  | ZoomEvent
  | SpeedEvent
  | SkipEvent
  | TextEvent
  | PauseEvent
  | MaskEvent
  | CommentEvent;

export interface BaseEvent {
  time: number;
}

export interface CommentEvent {
  _comment: string;
  time?: never;
  action?: never;
}

export interface ZoomEvent extends BaseEvent {
  action: 'zoom';
  /** X 軸中心點 (0-100) */
  x?: number;
  /** Y 軸中心點 (0-100) */
  y?: number;
  /** 放大倍率 */
  scale: number;
  /** 動畫時間 (秒) */
  duration?: number;
  /** 動畫平滑度，例如 "ease-in-out" */
  ease?: string;
}

export interface SpeedEvent extends BaseEvent {
  action: 'speed';
  /** 影片播放速率，例如 8.0, 16.0 */
  rate: number;
}

export interface SkipEvent extends BaseEvent {
  action: 'skip';
  /** 跳轉至的指定時間點 (秒) */
  to: number;
}

export interface TextEvent extends BaseEvent {
  action: 'text';
  /** 顯示的文字內容 */
  text: string;
  /** 覆寫 CSS 的文字樣式 */
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
  /** CSS 絕對定位設定 */
  position?: Partial<CSSStyleDeclaration> | Record<string, string>;
  /** 出現的動畫效果 */
  animation?: 'typing' | 'fade' | 'none';
  /** 動畫完成後停留時間 (秒) */
  stay?: number;
  /** 打字機效果：逐字打出所需的時間 (秒) */
  typingSpeed?: number;
  /** 動畫淡出離開所需的時間 (秒) */
  fadeOutDuration?: number;
}

export interface PauseEvent extends BaseEvent {
  action: 'pause';
  /** 暫停長度 (秒)。設定 0 代表永久暫停直至手動播放 */
  duration?: number;
}

export interface MaskEvent extends BaseEvent {
  action: 'mask';
  /** Top position as percentage (0-100) */
  top: number;
  /** Left position as percentage (0-100) */
  left: number;
  /** Width as percentage (0-100) */
  width: number;
  /** Height as percentage (0-100) */
  height: number;
  /** Blur strength in pixels, default 20 */
  blur?: number;
  /** How long the mask stays visible (seconds), default 5 */
  stay?: number;
  /** Fade-in/out transition duration (seconds), default 0.5 */
  fadeDuration?: number;
}
