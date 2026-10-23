export interface DebounceEntry {
  count: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Простой in-memory debouncer. При первом вызове schedule(key, cb, delay) — стартует таймер.
 * Каждый последующий increment(key) продлевает счётчик; когда таймер выстрелит,
 * cb получает накопленный count и запись удаляется. Не переживает рестарт процесса —
 * этого достаточно для message.new 30-секундного окна в v1.
 */
export class MessageDebouncer {
  private readonly entries = new Map<string, DebounceEntry>();

  schedule(key: string, delayMs: number, cb: (count: number) => void | Promise<void>): void {
    const existing = this.entries.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    const timer = setTimeout(() => {
      const entry = this.entries.get(key);
      if (!entry) return;
      this.entries.delete(key);
      void cb(entry.count);
    }, delayMs);
    this.entries.set(key, { count: 1, timer });
  }

  clear(): void {
    for (const { timer } of this.entries.values()) clearTimeout(timer);
    this.entries.clear();
  }
}
