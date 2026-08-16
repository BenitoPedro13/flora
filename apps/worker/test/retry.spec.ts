import { startTestInfra, type TestInfra } from '@flora/db/test/containers';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The retry path is a test, not a decorator you read (architecture §13,
 * TASK-satellite-pipeline §6 item 7). Against a real Redis (testcontainers,
 * shared with `packages/db`'s suites), not a mock — makes the provider fail
 * and asserts BullMQ actually re-runs the job, and that the "no scene today"
 * outcome (`NoSceneError`, modeled here by a handler that never throws — the
 * exact mechanism `refresh.processor.ts` uses) is never retried.
 */
describe('satellite queue retry behaviour', () => {
  let infra: TestInfra;
  let connection: { host: string; port: number };

  beforeAll(async () => {
    infra = await startTestInfra();
    const url = new URL(infra.redisUrl);
    connection = { host: url.hostname, port: Number(url.port) };
  });

  afterAll(async () => {
    await infra.stop();
  });

  it('retries a failing job per the queue attempts/backoff and succeeds on a later attempt', async () => {
    const queueName = `retry-test-${Date.now()}`;
    const queue = new Queue(queueName, { connection });
    const events = new QueueEvents(queueName, { connection });
    await events.waitUntilReady();
    let attempts = 0;

    const worker = new Worker(
      queueName,
      () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('transient CDSE failure');
        }
        return 'ok';
      },
      { connection, concurrency: 1 },
    );
    await worker.waitUntilReady();

    try {
      const job = await queue.add(
        'refresh',
        {},
        { attempts: 5, backoff: { type: 'fixed', delay: 10 } },
      );
      const result = (await job.waitUntilFinished(events, 15_000)) as string;
      expect(result).toBe('ok');
      expect(attempts).toBe(3);
    } finally {
      await worker.close();
      await events.close();
      await queue.close();
    }
  });

  it('a handler that never throws (the NoSceneError contract) runs exactly once', async () => {
    const queueName = `retry-test-noscene-${Date.now()}`;
    const queue = new Queue(queueName, { connection });
    const events = new QueueEvents(queueName, { connection });
    await events.waitUntilReady();
    let attempts = 0;

    const worker = new Worker(
      queueName,
      () => {
        attempts++;
        // refresh.processor.ts catches NoSceneError internally and returns
        // without rethrowing — modeled directly here, since that's the exact
        // mechanism that makes BullMQ treat it as a normal completion.
        return 'skipped';
      },
      { connection, concurrency: 1 },
    );
    await worker.waitUntilReady();

    try {
      const job = await queue.add(
        'refresh',
        {},
        { attempts: 5, backoff: { type: 'fixed', delay: 10 } },
      );
      const result = (await job.waitUntilFinished(events, 15_000)) as string;
      expect(result).toBe('skipped');
      expect(attempts).toBe(1);
    } finally {
      await worker.close();
      await events.close();
      await queue.close();
    }
  });

  it('exhausts all 5 attempts and ends failed when every attempt throws (§6 item 8)', async () => {
    const queueName = `retry-test-exhausted-${Date.now()}`;
    const queue = new Queue(queueName, { connection });
    const events = new QueueEvents(queueName, { connection });
    await events.waitUntilReady();
    let attempts = 0;

    const worker = new Worker(
      queueName,
      () => {
        attempts++;
        throw new Error('permanent CDSE failure');
      },
      { connection, concurrency: 1 },
    );
    await worker.waitUntilReady();

    try {
      const job = await queue.add(
        'refresh',
        {},
        { attempts: 5, backoff: { type: 'fixed', delay: 10 } },
      );
      await expect(job.waitUntilFinished(events, 15_000)).rejects.toThrow(
        /permanent CDSE failure/,
      );
      expect(attempts).toBe(5);
    } finally {
      await worker.close();
      await events.close();
      await queue.close();
    }
  });
});
