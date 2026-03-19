import { longTask, amazon, spark } from './config.js';
import {
  TimelineEvent,
  ZoomEvent,
  SpeedEvent,
  TextEvent,
  PauseEvent,
  MaskEvent,
} from './types.js';
import type { VideoConfig } from './types.js';

// ===========================================================================
// Presentation Engine – parses start-in/start-out/in/out attributes on
// .player-container.slide and video containers, then orchestrates a single
// global timeline that is kicked off on click.
// ===========================================================================

// ---- Animation DSL parser ----
// Parses strings like "delay(.3).move-from(0, 50%).easeOut(0.3)"
// into a list of animation commands.

interface AnimCommand {
  name: string; // e.g. "fade-in", "move-from", "move-by", "fade-out", "delay"
  args: number[]; // numeric arguments (percentages have the % stripped)
  easing?: string; // e.g. "ease-out"
  easeDuration?: number; // easing duration in seconds
}

function parseAnimString(raw: string | null): AnimCommand[] {
  if (!raw) return [];
  const commands: AnimCommand[] = [];
  // Tokenize: split on '.' but keep grouped (function calls might have dots in args)
  // Pattern: name(args)  or  easeOut(duration)  or  delay(secs)
  const pattern = /([\w-]+)\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  const tokens: { name: string; argsRaw: string }[] = [];

  while ((match = pattern.exec(raw)) !== null) {
    tokens.push({ name: match[1], argsRaw: match[2] });
  }

  let currentCmd: AnimCommand | null = null;

  for (const tok of tokens) {
    if (
      tok.name === 'easeOut' ||
      tok.name === 'easeIn' ||
      tok.name === 'easeInOut'
    ) {
      // Attach easing to the previous command
      if (currentCmd) {
        const easingMap: Record<string, string> = {
          easeOut: 'ease-out',
          easeIn: 'ease-in',
          easeInOut: 'ease-in-out',
        };
        currentCmd.easing = easingMap[tok.name] || 'ease-out';
        currentCmd.easeDuration = tok.argsRaw ? parseFloat(tok.argsRaw) : 0.3;
      }
    } else {
      // This is a new command
      if (currentCmd) commands.push(currentCmd);
      const args = tok.argsRaw
        .split(',')
        .map((s) => s.trim().replace('%', ''))
        .filter((s) => s !== '')
        .map((s) => parseFloat(s));
      currentCmd = { name: tok.name, args };
    }
  }
  if (currentCmd) commands.push(currentCmd);

  return commands;
}

// ---- Build CSS keyframes + animation from parsed commands ----

function buildAnimation(
  commands: AnimCommand[],
  direction: 'in' | 'out',
): { css: Partial<CSSStyleDeclaration>; delay: number } {
  let delay = 0;
  let transform = '';
  let opacity: [number, number] = direction === 'in' ? [0, 1] : [1, 0];
  let duration = 0.3;
  let easing = 'ease-out';

  for (const cmd of commands) {
    switch (cmd.name) {
      case 'delay':
        delay = cmd.args[0] || 0;
        break;

      case 'fade-in':
        opacity = [0, 1];
        if (cmd.easeDuration) duration = cmd.easeDuration;
        if (cmd.easing) easing = cmd.easing;
        break;

      case 'fade-out':
        opacity = [1, 0];
        if (cmd.easeDuration) duration = cmd.easeDuration;
        if (cmd.easing) easing = cmd.easing;
        break;

      case 'move-from':
        // move-from(x%, y%) – element starts displaced, animates to natural position
        // This is an "in" animation
        {
          const x = cmd.args[0] || 0;
          const y = cmd.args[1] || 0;
          // We'll use a CSS transition from this offset to 0
          transform = `translate(${x}%, ${y}%)`;
          if (cmd.easeDuration) duration = cmd.easeDuration;
          if (cmd.easing) easing = cmd.easing;
        }
        break;

      case 'move-by':
        // move-by(x%, y%) – element animates FROM current position BY this offset
        // This is an "out" animation
        {
          const x = cmd.args[0] || 0;
          const y = cmd.args[1] || 0;
          transform = `translate(${x}%, ${y}%)`;
          if (cmd.easeDuration) duration = cmd.easeDuration;
          if (cmd.easing) easing = cmd.easing;
        }
        break;
    }
  }

  return {
    css: {
      transitionProperty: 'opacity, transform',
      transitionDuration: `${duration}s`,
      transitionTimingFunction: easing,
      transitionDelay: `${delay}s`,
    } as any,
    delay,
  };
}

// ---- Presentation State ----

interface SlideInfo {
  el: HTMLElement;
  delayIn: number;
  stay: number;
  afterOut: number;
  startIn: number; // calculated seconds – when to show
  startOut: number; // calculated seconds – when to hide
  childAnimations: {
    el: HTMLElement;
    inCmds: AnimCommand[];
    outCmds: AnimCommand[];
    removeCmds: AnimCommand[];
  }[];
  state: 'hidden' | 'entering' | 'visible' | 'exiting' | 'exited';
  isVideoSlide: boolean;
  videoPlayerInstance?: PlayerInstance;
}

let slides: SlideInfo[] = [];
let presentationStartTime = 0;
let presentationTimerHandle = 0;
let presentationRunning = false;

// Time accumulated by videos between their start-in and start-out
// (video real playback time replaces wall-clock during their section)
let globalTime = 0;

function initPresentation() {
  const containers = document.querySelectorAll('.player-container');
  slides = [];

  containers.forEach((container) => {
    const el = container as HTMLElement;
    const delayIn = el.hasAttribute('delayIn')
      ? parseFloat(el.getAttribute('delayIn')!)
      : 0;
    const stay = el.hasAttribute('stay')
      ? parseFloat(el.getAttribute('stay')!)
      : Infinity;
    const afterOut = el.hasAttribute('afterOut')
      ? parseFloat(el.getAttribute('afterOut')!)
      : 0;

    const isVideoSlide = !!el.querySelector('.video-player');

    // Gather child animations
    const childAnimations: SlideInfo['childAnimations'] = [];
    const children = el.querySelectorAll('[in],[out]');
    children.forEach((child) => {
      const childEl = child as HTMLElement;
      childAnimations.push({
        el: childEl,
        inCmds: parseAnimString(childEl.getAttribute('in')),
        outCmds: parseAnimString(childEl.getAttribute('out')),
        removeCmds: parseAnimString(childEl.getAttribute('remove')),
      });
    });

    // Also capture elements that are direct children of the slide but have
    // no in/out — they should just appear/disappear with the slide
    const allDirectChildren = el.children;
    for (let i = 0; i < allDirectChildren.length; i++) {
      const child = allDirectChildren[i] as HTMLElement;
      if (child.classList.contains('text-overlay-container')) continue;
      if (child.classList.contains('video-player')) continue;
      if (
        !child.hasAttribute('in') &&
        !child.hasAttribute('out') &&
        !child.hasAttribute('remove')
      ) {
        // Wrap implicitly – they fade in/out with the slide
        childAnimations.push({
          el: child,
          inCmds: [
            {
              name: 'fade-in',
              args: [],
              easing: 'ease-out',
              easeDuration: 0.3,
            },
          ],
          outCmds: [
            {
              name: 'fade-out',
              args: [],
              easing: 'ease-out',
              easeDuration: 0.3,
            },
          ],
          removeCmds: [],
        });
      }
    }

    // Initially hide everything (use opacity+visibility so videos stay preloaded)
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
    el.style.pointerEvents = 'none';
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';

    // Set child elements to their initial hidden state
    childAnimations.forEach(({ el: childEl }) => {
      childEl.style.opacity = '0';
      childEl.style.transform = '';
      childEl.style.transition = 'none';
    });

    let videoPlayerInstance: PlayerInstance | undefined;
    if (isVideoSlide) {
      const { id } = el;
      if (id === 'player-longTask') videoPlayerInstance = players.longTask;
      else if (id === 'player-amazon') videoPlayerInstance = players.amazon;
      else if (id === 'player-spark') videoPlayerInstance = players.spark;
    }

    slides.push({
      el,
      delayIn,
      stay,
      afterOut,
      startIn: 0,
      startOut: Infinity,
      childAnimations,
      state: 'hidden',
      isVideoSlide,
      videoPlayerInstance,
    });
  });

  let currentTime = 0;
  for (const slide of slides) {
    slide.startIn = currentTime + slide.delayIn;
    slide.startOut = slide.startIn + slide.stay;

    // calculate maxOutDuration
    let maxOutDuration = 0;
    if (slide.childAnimations.length > 0) {
      maxOutDuration = slide.childAnimations.reduce((max, { outCmds }) => {
        let d = 0;
        let dur = 0.3; // default easeDuration
        if (outCmds.length === 0) return Math.max(max, 0.3); // default fade-out takes 0.3s
        for (const cmd of outCmds) {
          if (cmd.name === 'delay') d = cmd.args[0] || 0;
          if (cmd.easeDuration) dur = cmd.easeDuration;
        }
        return Math.max(max, d + dur);
      }, 0);
    }

    if (slide.stay !== Infinity) {
      currentTime = slide.startOut + maxOutDuration;
    }
  }

  // Sort slides by startIn just in case
  slides.sort((a, b) => a.startIn - b.startIn);
}

// ---- Slide Enter / Exit ----

function enterSlide(slide: SlideInfo) {
  slide.state = 'entering';
  slide.el.style.visibility = 'visible';
  slide.el.style.pointerEvents = '';
  slide.el.style.opacity = '1';

  // Animate children IN
  slide.childAnimations.forEach(({ el, inCmds }) => {
    if (inCmds.length === 0) {
      // No in animation – just show immediately
      el.style.transition = 'none';
      el.style.opacity = '1';
      el.style.transform = '';
      return;
    }

    const { css, delay } = buildAnimation(inCmds, 'in');

    // First, set the START state (before animation)
    el.style.transition = 'none';

    // Determine start state based on commands
    let startTransform = '';
    let startOpacity = '0';

    for (const cmd of inCmds) {
      if (cmd.name === 'move-from') {
        startTransform += ` translate(${cmd.args[0] || 0}%, ${cmd.args[1] || 0}%)`;
      }
      if (cmd.name === 'zoomTo') {
        startTransform += ` translate(${cmd.args[0] || 0}%, ${cmd.args[1] || 0}%)`;
        startTransform += ` scale(${(cmd.args[2] !== undefined ? cmd.args[2] : 100) / 100})`;
      }
      if (cmd.name === 'fade-in') {
        startOpacity = '0';
      }
    }

    // Inline elements (e.g. <span>) ignore transforms – promote to inline-block
    if (startTransform && getComputedStyle(el).display === 'inline') {
      el.style.display = 'inline-block';
    }

    el.style.opacity = startOpacity;
    el.style.transform = startTransform;

    // Force reflow so the browser registers the initial state before transition
    // eslint-disable-next-line no-void
    void el.offsetWidth;

    // Now apply the transition to END state
    Object.assign(el.style, css);
    el.style.opacity = '1';
    el.style.transform = 'translate(0, 0)';
  });

  // Start video if this is a video slide
  if (slide.isVideoSlide && slide.videoPlayerInstance) {
    const player = slide.videoPlayerInstance;
    let configFn = amazon;
    if (player === players.longTask) configFn = longTask;
    else if (player === players.amazon) configFn = amazon;
    else if (player === players.spark) configFn = spark;

    startVideoPlayer(player, configFn);
  }

  // After animations complete, mark as visible
  const maxDelay = slide.childAnimations.reduce((max, { inCmds }) => {
    let d = 0;
    let dur = 0.3;
    for (const cmd of inCmds) {
      if (cmd.name === 'delay') d = cmd.args[0] || 0;
      if (cmd.easeDuration) dur = cmd.easeDuration;
    }
    return Math.max(max, d + dur);
  }, 0.3);

  setTimeout(
    () => {
      if (slide.state === 'entering') {
        slide.state = 'visible';
      }
    },
    maxDelay * 1000 + 50,
  );
}

function exitSlide(slide: SlideInfo) {
  slide.state = 'exiting';

  // Animate children OUT
  slide.childAnimations.forEach(({ el, outCmds }) => {
    if (outCmds.length === 0) {
      // No out animation – just hide immediately
      el.style.transition = 'opacity 0.3s ease-out';
      el.style.opacity = '0';
      return;
    }

    const { css, delay } = buildAnimation(outCmds, 'out');

    // Determine end state based on commands
    let endTransform = '';
    let endOpacity = '1';

    for (const cmd of outCmds) {
      if (cmd.name === 'move-by') {
        endTransform += ` translate(${cmd.args[0] || 0}%, ${cmd.args[1] || 0}%)`;
      }
      if (cmd.name === 'zoomTo') {
        endTransform += ` translate(${cmd.args[0] || 0}%, ${cmd.args[1] || 0}%)`;
        endTransform += ` scale(${(cmd.args[2] !== undefined ? cmd.args[2] : 100) / 100})`;
      }
      if (cmd.name === 'fade-out') {
        endOpacity = '0';
      }
    }

    // Apply transition and end state
    Object.assign(el.style, css);
    el.style.opacity = endOpacity;
    if (endTransform) {
      // Inline elements (e.g. <span>) ignore transforms – promote to inline-block
      if (getComputedStyle(el).display === 'inline') {
        el.style.display = 'inline-block';
      }
      el.style.transform = endTransform;
    }
  });

  // Pause video if this is a video slide
  if (slide.isVideoSlide && slide.videoPlayerInstance) {
    const player = slide.videoPlayerInstance;
    player.video.pause();
  }

  const maxOutDelay = slide.childAnimations.reduce((max, { outCmds }) => {
    let d = 0;
    let dur = 0.3;
    for (const cmd of outCmds) {
      if (cmd.name === 'delay') d = cmd.args[0] || 0;
      if (cmd.easeDuration) dur = cmd.easeDuration;
    }
    return Math.max(max, d + dur);
  }, 0.3);

  const maxRemoveDelay = slide.childAnimations.reduce((max, { removeCmds }) => {
    let d = 0;
    let dur = 0.3;
    if (!removeCmds || removeCmds.length === 0) return max;
    for (const cmd of removeCmds) {
      if (cmd.name === 'delay') d = cmd.args[0] || 0;
      if (cmd.easeDuration) dur = cmd.easeDuration;
    }
    return Math.max(max, d + dur);
  }, 0.0);

  setTimeout(
    () => {
      if (slide.state !== 'exiting') return;

      slide.childAnimations.forEach(({ el, removeCmds }) => {
        if (!removeCmds || removeCmds.length === 0) return;

        const { css } = buildAnimation(removeCmds, 'out');
        let endTransform = el.style.transform;
        let endOpacity = el.style.opacity;

        for (const cmd of removeCmds) {
          if (cmd.name === 'move-by') {
            endTransform += ` translate(${cmd.args[0] || 0}%, ${cmd.args[1] || 0}%)`;
          }
          if (cmd.name === 'zoomTo') {
            endTransform += ` translate(${cmd.args[0] || 0}%, ${cmd.args[1] || 0}%)`;
            endTransform += ` scale(${(cmd.args[2] !== undefined ? cmd.args[2] : 100) / 100})`;
          }
          if (cmd.name === 'fade-out') endOpacity = '0';
        }

        Object.assign(el.style, css);
        el.style.opacity = endOpacity;
        if (endTransform) {
          if (getComputedStyle(el).display === 'inline') {
            el.style.display = 'inline-block';
          }
          el.style.transform = endTransform;
        }
      });

      setTimeout(
        () => {
          if (slide.state === 'exiting') {
            slide.state = 'exited';
            slide.el.style.opacity = '0';
            slide.el.style.visibility = 'hidden';
            slide.el.style.pointerEvents = 'none';
          }
        },
        maxRemoveDelay * 1000 + 100,
      );
    },
    maxOutDelay * 1000 + slide.afterOut * 1000,
  );
}

// ---- Presentation Tick ----

function presentationTick() {
  if (!presentationRunning) return;

  const now = (Date.now() - presentationStartTime) / 1000;

  // Use wall clock time as global time
  // (Video containers manage their own internal config timeline separately)
  globalTime = now;

  for (const slide of slides) {
    const shouldBeVisible =
      globalTime >= slide.startIn && globalTime < slide.startOut;

    if (shouldBeVisible && slide.state === 'hidden') {
      enterSlide(slide);
    } else if (
      !shouldBeVisible &&
      (slide.state === 'entering' || slide.state === 'visible')
    ) {
      exitSlide(slide);
    }
  }

  // Check if all slides have exited (presentation is done)
  const allDone = slides.every(
    (s) =>
      s.state === 'exited' ||
      (s.state === 'visible' && s.startOut === Infinity),
  );

  if (!allDone) {
    presentationTimerHandle = requestAnimationFrame(presentationTick);
  }
}

function startPresentation() {
  if (presentationRunning) return;
  presentationRunning = true;
  presentationStartTime = Date.now();
  globalTime = 0;

  // Reset all slides to initial state
  slides.forEach((slide) => {
    slide.state = 'hidden';
    slide.el.style.opacity = '0';
    slide.el.style.visibility = 'hidden';
    slide.el.style.pointerEvents = 'none';
    slide.childAnimations.forEach(({ el }) => {
      el.style.opacity = '0';
      el.style.transform = '';
      el.style.transition = 'none';
    });
  });

  presentationTimerHandle = requestAnimationFrame(presentationTick);
}

function stopPresentation() {
  presentationRunning = false;
  if (presentationTimerHandle) {
    cancelAnimationFrame(presentationTimerHandle);
    presentationTimerHandle = 0;
  }
}

// ===========================================================================
// Video Player Instance (existing logic, slightly refactored)
// ===========================================================================

interface PlayerInstance {
  container: HTMLDivElement;
  video: HTMLVideoElement;
  textContainer: HTMLDivElement;
  timeline: TimelineEvent[];
  executedEvents: Set<TimelineEvent>;
  scheduledTimerId: number | null;
  nextEventIndex: number;
  isInternalSeek: boolean;
  currentTransform: { x: number; y: number; scale: number };
  pendingCanplayHandler: (() => void) | null;
}

function createPlayer(containerId: string): PlayerInstance {
  const container = document.getElementById(containerId) as HTMLDivElement;
  const video = container.querySelector('.video-player') as HTMLVideoElement;
  const textContainer = container.querySelector(
    '.text-overlay-container',
  ) as HTMLDivElement;

  const player: PlayerInstance = {
    container,
    video,
    textContainer,
    timeline: [],
    executedEvents: new Set(),
    scheduledTimerId: null,
    nextEventIndex: 0,
    isInternalSeek: false,
    currentTransform: { x: 50, y: 50, scale: 1 },
    pendingCanplayHandler: null,
  };

  video.addEventListener('play', () => scheduleNextEvent(player));
  video.addEventListener('pause', () => {
    if (player.scheduledTimerId !== null) {
      clearTimeout(player.scheduledTimerId);
      player.scheduledTimerId = null;
    }
  });
  video.addEventListener('ratechange', () => scheduleNextEvent(player));
  video.addEventListener('seeked', () => handleSeekOrReset(player));
  video.addEventListener('ended', () => handleSeekOrReset(player));
  video.addEventListener('play', () => {
    if (video.playbackRate !== video.defaultPlaybackRate) {
      video.playbackRate = video.defaultPlaybackRate;
    }
  });

  return player;
}

const players = {
  longTask: createPlayer('player-longTask'),
  amazon: createPlayer('player-amazon'),
  spark: createPlayer('player-spark'),
};

// Preload video sources (but keep paused — only play when slide enters)
players.longTask.video.src = longTask().videoSrc;
players.longTask.video.pause();
players.amazon.video.src = amazon().videoSrc;
players.amazon.video.pause();
players.spark.video.src = spark().videoSrc;
players.spark.video.pause();

// ---- Start a video player with its config ----

function startVideoPlayer(player: PlayerInstance, configFn: () => VideoConfig) {
  const cfg = configFn();

  resetPlayer(player);

  player.timeline = (cfg.timeline || []).filter(
    (e) => typeof e.time === 'number',
  ) as TimelineEvent[];
  player.timeline.sort((a, b) => (a.time as number) - (b.time as number));

  if (cfg.startPoint !== undefined && cfg.startPoint > 0) {
    player.video.currentTime = cfg.startPoint;
  }

  console.log('Config loaded, starting video playback:', cfg.videoSrc);

  if (player.video.readyState >= 3) {
    player.video.play();
  } else {
    // Track the handler so we can remove it if the slide exits before canplay fires
    const handler = () => {
      player.pendingCanplayHandler = null;
      player.video.play();
    };
    player.pendingCanplayHandler = handler;
    player.video.addEventListener('canplay', handler, { once: true });
  }
}

function resetPlayer(player: PlayerInstance) {
  player.video.pause();
  player.video.currentTime = 0;
  player.video.playbackRate = 1;
  player.video.defaultPlaybackRate = 1;
  player.video.muted = false;
  player.video.style.transform = '';
  player.video.style.transition = '';
  player.textContainer.innerHTML = '';
  player.executedEvents.clear();
  player.nextEventIndex = 0;
  if (player.scheduledTimerId !== null) {
    clearTimeout(player.scheduledTimerId);
    player.scheduledTimerId = null;
  }
  // Remove any pending canplay listener to prevent stale .play() calls
  if (player.pendingCanplayHandler) {
    player.video.removeEventListener('canplay', player.pendingCanplayHandler);
    player.pendingCanplayHandler = null;
  }
  player.timeline = [];
  player.currentTransform = { x: 50, y: 50, scale: 1 };
}

function reset() {
  stopPresentation();
  resetPlayer(players.longTask);
  resetPlayer(players.amazon);
  resetPlayer(players.spark);
}

// Expose to window
(window as any).demoVideo = {
  start: startPresentation,
  longTask,
  amazon,
  spark,
  reset,
  players,
};

window.addEventListener('click', () => {
  startPresentation();
});

// ---- Event Scheduling ----

function scheduleNextEvent(player: PlayerInstance) {
  const { video } = player;

  if (player.scheduledTimerId !== null) {
    clearTimeout(player.scheduledTimerId);
    player.scheduledTimerId = null;
  }

  while (player.nextEventIndex < player.timeline.length) {
    const ev = player.timeline[player.nextEventIndex];
    if (ev.time! <= video.currentTime + 0.05) {
      if (!player.executedEvents.has(ev)) {
        player.executedEvents.add(ev);
        executeEvent(player, ev);
      }
      player.nextEventIndex++;
    } else {
      break;
    }
  }

  if (video.paused || player.nextEventIndex >= player.timeline.length) {
    return;
  }

  const nextEvent = player.timeline[player.nextEventIndex];
  const timeDiff = nextEvent.time! - video.currentTime;
  const delayMs = (timeDiff * 1000) / Math.max(video.playbackRate, 0.1);

  player.scheduledTimerId = window.setTimeout(() => {
    scheduleNextEvent(player);
  }, delayMs);
}

function handleSeekOrReset(player: PlayerInstance) {
  const { video } = player;

  if (player.isInternalSeek) {
    player.isInternalSeek = false;
    scheduleNextEvent(player);
    return;
  }

  const { currentTime } = video;
  player.executedEvents.clear();
  player.nextEventIndex = 0;

  let lastZoom: ZoomEvent | null = null;
  let lastSpeed: SpeedEvent | null = null;

  for (let i = 0; i < player.timeline.length; i++) {
    const event = player.timeline[i];
    if (event.time === undefined) continue;
    if (event.time <= currentTime) {
      if (event.action === 'zoom') lastZoom = event as ZoomEvent;
      if (event.action === 'speed') lastSpeed = event as SpeedEvent;
      player.executedEvents.add(event);
      player.nextEventIndex = i + 1;
    }
  }

  if (lastZoom) applyZoom(player, lastZoom, true);
  else
    applyZoom(
      player,
      { action: 'zoom', time: 0, scale: 1, x: 50, y: 50, duration: 1 },
      true,
    );
  if (lastSpeed) applySpeed(player, lastSpeed);
  else applySpeed(player, { time: 0, action: 'speed', rate: 1 });

  player.textContainer.innerHTML = '';
  scheduleNextEvent(player);
}

// ---- Event Execution ----

function executeEvent(player: PlayerInstance, event: TimelineEvent) {
  if (event.action === undefined) return;
  console.log('Executing Event at', event.time, ':', event.action);
  switch (event.action) {
    case 'zoom':
      applyZoom(player, event);
      break;
    case 'speed':
      applySpeed(player, event);
      break;
    case 'skip':
      player.isInternalSeek = true;
      player.video.currentTime = event.to;
      for (const ev of player.timeline) {
        if (
          ev.time !== undefined &&
          ev.time > event.time &&
          ev.time < event.to
        ) {
          player.executedEvents.add(ev);
        }
      }
      break;
    case 'text':
      showText(player, event);
      break;
    case 'pause':
      applyPause(player, event);
      break;
    case 'mask':
      showMask(player, event);
      break;
  }
}

// ---- Actions ----

function applyZoom(player: PlayerInstance, event: ZoomEvent, instant = false) {
  const { video } = player;
  const scale = event.scale || 1;
  const x = event.x !== undefined ? event.x : 50;
  const y = event.y !== undefined ? event.y : 50;
  const duration = instant ? 0 : event.duration || 1;
  const ease = event.ease || 'ease-in-out';

  const translateX = ((50 - x) * (scale - 1)) / scale;
  const translateY = ((50 - y) * (scale - 1)) / scale;

  video.style.transformOrigin = `50% 50%`;
  video.style.transition = `transform ${duration}s ${ease}`;
  video.style.transform = `scale(${scale}) translate(${translateX}%, ${translateY}%)`;

  player.currentTransform = { x, y, scale };
}

function applySpeed(player: PlayerInstance, event: SpeedEvent) {
  const { video } = player;
  const rate = event.rate || 1;

  if (rate > 4 || rate < 0.5) {
    (video as any).preservesPitch = false;
    (video as any).mozPreservesPitch = false;
    (video as any).webkitPreservesPitch = false;
  }

  if (rate > 4) {
    video.muted = true;
  } else if (rate === 1) {
    video.muted = false;
  }

  video.playbackRate = rate;
  video.defaultPlaybackRate = rate;
}

function applyPause(player: PlayerInstance, event: PauseEvent) {
  const { video } = player;
  video.pause();
  const pauseDuration = event.duration || 3;

  if (pauseDuration > 0) {
    console.log('Pausing for', pauseDuration, 'seconds');
    setTimeout(() => {
      console.log('resume', video.paused);
      if (video.paused) {
        video.play();
      }
    }, pauseDuration * 1000);
  }
}

function showText(player: PlayerInstance, event: TextEvent) {
  const { textContainer } = player;
  const el = document.createElement('div');
  el.className = 'text-element';
  el.innerText = event.text || '';

  if (event.style) {
    Object.assign(el.style, event.style as Record<string, string>);
  }

  if (event.position) {
    Object.assign(el.style, event.position as Record<string, string>);
  }

  const stay = event.stay || 3;

  if (event.animation === 'typing') {
    el.classList.add('anim-typing-container');
    const typingSpeed = event.typingSpeed || 1.5;
    const fadeOutDuration = event.fadeOutDuration || 1;

    el.innerText = '';

    const allElements: HTMLElement[] = [];

    const caret = document.createElement('span');
    caret.className = 'anim-typing-caret';
    caret.style.height = '1em';
    if (event.style && 'color' in event.style) {
      caret.style.backgroundColor = (event.style as any).color;
    }

    const textStr = event.text || '';
    const chars = textStr.split('');

    chars.forEach((char) => {
      let node: HTMLElement;
      if (char === '\n') {
        node = document.createElement('br');
      } else {
        node = document.createElement('span');
        node.className = 'anim-typing-char';
        node.innerText = char === ' ' ? '\u00A0' : char;
      }

      node.style.display = 'none';
      el.appendChild(node);
      allElements.push(node);
    });

    if (allElements.length > 0) {
      el.insertBefore(caret, allElements[0]);
    } else {
      el.appendChild(caret);
    }

    const timePerChar = (typingSpeed * 1000) / Math.max(allElements.length, 1);

    allElements.forEach((node, index) => {
      setTimeout(() => {
        if (textContainer.contains(el)) {
          node.style.display = 'inline';
          if (node.tagName !== 'BR') {
            node.style.opacity = '1';
          }
          el.insertBefore(caret, node.nextSibling);
        }
      }, index * timePerChar);
    });

    el.style.setProperty('--stay-duration', `${typingSpeed + stay}s`);
    el.style.setProperty('--fade-out-duration', `${fadeOutDuration}s`);

    setTimeout(() => {
      if (textContainer.contains(el)) {
        caret.classList.add('typing-done');
      }
    }, typingSpeed * 1000);

    const totalLifeMs = (typingSpeed + stay + fadeOutDuration) * 1000 + 200;
    setTimeout(() => el.remove(), totalLifeMs);
  } else if (event.animation === 'fade') {
    el.classList.add('anim-fade');
    const animDuration = stay + 2;
    el.style.setProperty('--anim-duration', `${animDuration}s`);
    setTimeout(() => el.remove(), animDuration * 1000 + 200);
  } else {
    el.style.opacity = '1';
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, stay * 1000);
  }

  textContainer.appendChild(el);
}

function showMask(player: PlayerInstance, event: MaskEvent) {
  const { textContainer } = player;
  const el = document.createElement('div');
  el.className = 'mask-overlay';

  const blur = event.blur || 20;
  const stay = event.stay || 5;
  const fadeDuration = event.fadeDuration || 0.5;

  el.style.top = `${event.top}%`;
  el.style.left = `${event.left}%`;
  el.style.width = `${event.width}%`;
  el.style.height = `${event.height}%`;
  el.style.setProperty('--mask-blur', `${blur}px`);
  el.style.setProperty('--mask-fade', `${fadeDuration}s`);

  textContainer.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add('mask-visible');
  });

  const totalVisibleMs = (stay + fadeDuration) * 1000;
  setTimeout(() => {
    el.classList.remove('mask-visible');
    el.classList.add('mask-hiding');
    setTimeout(() => el.remove(), fadeDuration * 1000 + 100);
  }, totalVisibleMs);
}

// ---- Init ----

initPresentation();

console.log(
  'demoVideo ready. Click anywhere on the page to start the presentation.',
);
