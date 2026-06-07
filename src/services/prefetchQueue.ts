import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { getChapterById } from '../db/database';
import { translateChapter } from './translationService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueueItem = {
  chapterId: number;
  novelId: number;
  chapterIndex: number;
  text: string;
  priority: 'normal' | 'high';
};

export type PauseReason =
  | 'app_background'
  | 'no_network'
  | 'rate_limit_429'
  | 'quota_exceeded';

export type QueueEvent =
  | { type: 'progress'; chapterId: number; current: number; total: number }
  | { type: 'done'; chapterId: number }
  | { type: 'error'; chapterId: number; message: string }
  | { type: 'quota_exceeded' }
  | { type: 'pause'; reasons: PauseReason[] }
  | { type: 'resume' };

export type QueueStatus = {
  pending: number;
  current: number | null;
  paused: boolean;
  reasons: PauseReason[];
};

// ─── State ────────────────────────────────────────────────────────────────────

const queue: QueueItem[] = [];
const inFlight = new Set<number>();
const pauseReasons = new Set<PauseReason>();
const listeners = new Set<(e: QueueEvent) => void>();
const retryCount = new Map<number, number>();
let isProcessing = false;
let rateLimitTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Emit ─────────────────────────────────────────────────────────────────────

function emit(event: QueueEvent): void {
  for (const l of listeners) {
    try {
      l(event);
    } catch (err) {
      console.warn('[PrefetchQueue] Listener error:', err);
    }
  }
}

// ─── Error handling ───────────────────────────────────────────────────────────

function handleError(err: any, item: QueueItem): void {
  const status: number | undefined = err?.response?.status;

  if (status === 429) {
    // Rate limited — pause 60s, put item back at front
    console.log('[PrefetchQueue] 429 rate limit, pausing 60s');
    if (rateLimitTimer) clearTimeout(rateLimitTimer);
    queue.unshift(item);
    pause('rate_limit_429');
    rateLimitTimer = setTimeout(() => {
      rateLimitTimer = null;
      resume('rate_limit_429');
    }, 60_000);
    return;
  }

  if (status === 456) {
    // Quota exceeded — stop queue until app restart
    console.log('[PrefetchQueue] 456 quota exceeded, stopping queue');
    pause('quota_exceeded');
    emit({ type: 'quota_exceeded' });
    retryCount.delete(item.chapterId);
    return;
  }

  if (status === 503 || status == null) {
    // Server error or network error — exponential backoff (1s, 2s, 4s)
    const attempts = (retryCount.get(item.chapterId) ?? 0) + 1;
    if (attempts <= 3) {
      const delay = Math.pow(2, attempts - 1) * 1000;
      console.log(
        `[PrefetchQueue] Chapter ${item.chapterId} transient error (attempt ${attempts}), retrying in ${delay}ms`
      );
      retryCount.set(item.chapterId, attempts);
      setTimeout(() => {
        queue.unshift(item);
        startProcessing();
      }, delay);
      return;
    }
    console.log(
      `[PrefetchQueue] Chapter ${item.chapterId} failed after 3 retries, dropping`
    );
    retryCount.delete(item.chapterId);
    emit({ type: 'error', chapterId: item.chapterId, message: err?.message ?? 'Max retries exceeded' });
    return;
  }

  // Other HTTP errors (4xx etc.) — drop immediately
  console.log(
    `[PrefetchQueue] Chapter ${item.chapterId} unrecoverable error (status ${status}), dropping`
  );
  retryCount.delete(item.chapterId);
  emit({ type: 'error', chapterId: item.chapterId, message: err?.message ?? 'Unknown error' });
}

// ─── Processing ───────────────────────────────────────────────────────────────

async function processItem(item: QueueItem): Promise<void> {
  // Skip if already translated
  const chapter = await getChapterById(item.chapterId);
  if (chapter?.isTranslated && chapter.translatedText) {
    console.log(`[PrefetchQueue] Chapter ${item.chapterId} already translated, skipping`);
    emit({ type: 'done', chapterId: item.chapterId });
    return;
  }

  inFlight.add(item.chapterId);
  console.log(`[PrefetchQueue] Translating chapter ${item.chapterId}`);

  try {
    await translateChapter(item.chapterId, item.text, (current, total) => {
      emit({ type: 'progress', chapterId: item.chapterId, current, total });
    });
    retryCount.delete(item.chapterId);
    console.log(`[PrefetchQueue] Done chapter ${item.chapterId}`);
    emit({ type: 'done', chapterId: item.chapterId });
  } catch (err: any) {
    handleError(err, item);
  } finally {
    // Always remove from inFlight even if handleError re-enqueues the item
    inFlight.delete(item.chapterId);
  }
}

async function startProcessing(): Promise<void> {
  if (isProcessing || isPaused() || queue.length === 0) return;
  isProcessing = true;
  console.log('[PrefetchQueue] Processing started');

  while (queue.length > 0 && !isPaused()) {
    // Sort: high priority items first, then FIFO
    const highIdx = queue.findIndex((item) => item.priority === 'high');
    const item = highIdx !== -1 ? queue.splice(highIdx, 1)[0] : queue.shift()!;
    await processItem(item);
  }

  isProcessing = false;
  console.log('[PrefetchQueue] Processing stopped');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function enqueue(
  items: QueueItem[],
  novelId: number,
  currentIndex: number
): void {
  // Remove stale items: different novel or too far behind in same novel
  for (let i = queue.length - 1; i >= 0; i--) {
    const existing = queue[i];
    if (
      existing.novelId !== novelId ||
      existing.chapterIndex < currentIndex - 2
    ) {
      retryCount.delete(existing.chapterId);
      queue.splice(i, 1);
    }
  }

  // Add new items with dedup
  let added = 0;
  for (const item of items) {
    if (
      queue.some((q) => q.chapterId === item.chapterId) ||
      inFlight.has(item.chapterId)
    ) {
      continue;
    }
    queue.push(item);
    added++;
    console.log(
      `[PrefetchQueue] Enqueue chapter ${item.chapterId} (novel ${item.novelId}, index ${item.chapterIndex})`
    );
  }

  if (added > 0 && !isProcessing) {
    startProcessing();
  }
}

export function cancel(chapterId: number): void {
  const idx = queue.findIndex((item) => item.chapterId === chapterId);
  if (idx !== -1) {
    queue.splice(idx, 1);
    retryCount.delete(chapterId);
  }
}

export function cancelAllForNovel(novelId: number): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].novelId === novelId) {
      retryCount.delete(queue[i].chapterId);
      queue.splice(i, 1);
    }
  }
}

export function promote(chapterId: number): boolean {
  const idx = queue.findIndex((item) => item.chapterId === chapterId);
  if (idx === -1) return false;
  const [item] = queue.splice(idx, 1);
  queue.unshift({ ...item, priority: 'high' });
  console.log(`[PrefetchQueue] Promoted chapter ${chapterId} to high priority`);
  return true;
}

export function isInFlight(chapterId: number): boolean {
  return inFlight.has(chapterId);
}

export function isPending(chapterId: number): boolean {
  return queue.some((item) => item.chapterId === chapterId);
}

export function pause(reason: PauseReason): void {
  pauseReasons.add(reason);
  console.log(`[PrefetchQueue] Paused (${reason}), active reasons: [${[...pauseReasons].join(', ')}]`);
  emit({ type: 'pause', reasons: [...pauseReasons] });
}

export function resume(reason: PauseReason): void {
  pauseReasons.delete(reason);
  console.log(
    `[PrefetchQueue] Resume (${reason}), remaining: [${[...pauseReasons].join(', ') || 'none'}]`
  );
  if (pauseReasons.size === 0) {
    emit({ type: 'resume' });
    startProcessing();
  }
}

export function isPaused(): boolean {
  return pauseReasons.size > 0;
}

export function getStatus(): QueueStatus {
  return {
    pending: queue.length,
    current: inFlight.size > 0 ? [...inFlight][0] : null,
    paused: isPaused(),
    reasons: [...pauseReasons],
  };
}

export function subscribe(listener: (e: QueueEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ─── AppState listener ────────────────────────────────────────────────────────

AppState.addEventListener('change', (state) => {
  if (state === 'background' || state === 'inactive') {
    pause('app_background');
  } else if (state === 'active') {
    resume('app_background');
  }
});

// ─── NetInfo listener ─────────────────────────────────────────────────────────
// state.isConnected === null means "unknown/initializing" — ignored intentionally

NetInfo.addEventListener((state) => {
  if (state.isConnected === false) {
    pause('no_network');
  } else if (state.isConnected === true) {
    resume('no_network');
  }
});
