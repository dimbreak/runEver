import { longTask, amazon } from './config.js';
import {
  TimelineEvent,
  ZoomEvent,
  SpeedEvent,
  TextEvent,
  PauseEvent,
  MaskEvent,
} from './types.js';
import type { VideoConfig } from './types.js';

// ---- Player Instance ----

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
}

// Create player instances for each container
function createPlayer(containerId: string): PlayerInstance {
  const container = document.getElementById(containerId) as HTMLDivElement;
  const video = container.querySelector('.video-player') as HTMLVideoElement;
  const textContainer = container.querySelector('.text-overlay-container') as HTMLDivElement;

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
  };

  // Wire up event listeners per player
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
};

// Preload video sources
players.longTask.video.src = longTask().videoSrc;
players.amazon.video.src = amazon().videoSrc;

// ---- Public API ----

function start(configFn: () => VideoConfig) {
  const cfg = configFn();

  // Find which player matches this config's video
  let player: PlayerInstance;
  if (cfg.videoSrc === longTask().videoSrc) {
    player = players.longTask;
    players.longTask.container.style.display = '';
    players.amazon.container.style.display = 'none';
  } else {
    player = players.amazon;
    players.amazon.container.style.display = '';
    players.longTask.container.style.display = 'none';
  }

  resetPlayer(player);

  // Filter out any purely comment objects and sort by time
  player.timeline = (cfg.timeline || []).filter(
    (e) => typeof e.time === 'number',
  ) as TimelineEvent[];
  player.timeline.sort((a, b) => (a.time as number) - (b.time as number));

  // If startPoint is provided, jump directly to it
  if (cfg.startPoint !== undefined && cfg.startPoint > 0) {
    player.video.currentTime = cfg.startPoint;
  }

  console.log('Config loaded, starting playback:', cfg.videoSrc);

  // Wait for video to be ready, then play
  if (player.video.readyState >= 3) {
    player.video.play();
  } else {
    player.video.addEventListener('canplay', () => {
      player.video.play();
    }, { once: true });
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
  player.timeline = [];
  player.currentTransform = { x: 50, y: 50, scale: 1 };
}

function reset() {
  resetPlayer(players.longTask);
  resetPlayer(players.amazon);
}

// Expose to window for programmatic access
(window as any).demoVideo = {
  start,
  longTask,
  amazon,
  reset,
  players,
};

// ---- Event Scheduling ----

function scheduleNextEvent(player: PlayerInstance) {
  const { video } = player;

  if (player.scheduledTimerId !== null) {
    clearTimeout(player.scheduledTimerId);
    player.scheduledTimerId = null;
  }

  // Fast forward nextEventIndex to process any events we've reached
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

  // Clear currently playing text transitions and masks whenever we seek
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
        if (ev.time !== undefined && ev.time > event.time && ev.time < event.to) {
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

console.log('demoVideo ready. Use: demoVideo.start(demoVideo.longTask) or demoVideo.start(demoVideo.amazon)');
