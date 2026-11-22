import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  markElasticsearchAvailable,
  markElasticsearchUnavailable,
  shouldUseElasticsearch,
} from '../src/lib/elastic';

describe('Elasticsearch retry backoff', () => {
  afterEach(() => {
    markElasticsearchAvailable();
    vi.useRealTimers();
  });

  it('uses the database during backoff and retries Elasticsearch later', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    expect(shouldUseElasticsearch()).toBe(true);

    markElasticsearchUnavailable();
    expect(shouldUseElasticsearch()).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(shouldUseElasticsearch()).toBe(true);

    markElasticsearchUnavailable();
    expect(shouldUseElasticsearch()).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(shouldUseElasticsearch()).toBe(true);

    markElasticsearchUnavailable();
    markElasticsearchAvailable();
    expect(shouldUseElasticsearch()).toBe(true);
  });
});
