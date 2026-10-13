import { createWorkerHandler, type WorkerRequest, type WorkerResponse } from "./import-worker-protocol";
import type { ImportWorker } from "./worker-parser";

export interface FakeImportWorker extends ImportWorker {
  terminated: boolean;
  /** Make the worker fail from now on, as one that crashed or never loaded. */
  crash(message: string): void;
}

/**
 * A stand-in for the import worker, for tests: the real handler behind the
 * same message boundary, answering asynchronously and through structured
 * clones, as a browser worker does.
 */
export function fakeImportWorker(): FakeImportWorker {
  const handle = createWorkerHandler();
  let failure: string | null = null;

  const worker: FakeImportWorker = {
    onmessage: null,
    onerror: null,
    terminated: false,
    postMessage(message: WorkerRequest) {
      if (failure !== null) {
        const message = failure;
        queueMicrotask(() => worker.onerror?.({ message } as ErrorEvent));
        return;
      }
      void handle(structuredClone(message)).then((response) =>
        worker.onmessage?.({ data: structuredClone(response) } as MessageEvent<WorkerResponse>),
      );
    },
    terminate() {
      worker.terminated = true;
    },
    crash(message) {
      failure = message;
    },
  };
  return worker;
}
