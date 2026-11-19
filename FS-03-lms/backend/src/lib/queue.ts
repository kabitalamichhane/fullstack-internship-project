import { Queue } from 'bullmq';
import { createBullConnection } from './redis';

export const TRANSCODE_QUEUE = 'video-transcode';

export type TranscodeJob = { lessonId: string; rawKey: string };

let queue: Queue<TranscodeJob> | null = null;

/** Lazily created so tests and scripts don't open a Redis connection on import. */
export function transcodeQueue() {
  if (!queue) {
    queue = new Queue<TranscodeJob>(TRANSCODE_QUEUE, {
      connection: createBullConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return queue;
}
