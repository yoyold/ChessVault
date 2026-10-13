import type { BatchParser, GameIndexer } from "./batch-parser";
import type { WorkerRequest, WorkerResponse } from "./import-worker-protocol";

/** The part of a worker the clients use, so tests can stand in for one. */
export interface ImportWorker {
  postMessage(message: WorkerRequest): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

/** A request as sent, before it is given an id — per variant, keeping each one's fields. */
type WithoutId<Request> = Request extends unknown ? Omit<Request, "id"> : never;
type WorkerRequestBody = WithoutId<WorkerRequest>;

function startWorker(): ImportWorker {
  return new Worker(new URL("./import.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as ImportWorker;
}

/**
 * A conversation with the worker: each request answered by the response with
 * its id.
 *
 * If the worker itself fails — it could not load, or crashed — every waiting
 * request is rejected rather than left hanging.
 */
function connect(create: () => ImportWorker) {
  const worker = create();
  const waiting = new Map<
    number,
    { resolve: (response: WorkerResponse) => void; reject: (error: Error) => void }
  >();
  let nextId = 1;

  worker.onmessage = (event) => {
    const entry = waiting.get(event.data.id);
    if (!entry) return;
    waiting.delete(event.data.id);
    entry.resolve(event.data);
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || "The import worker stopped unexpectedly.");
    for (const entry of waiting.values()) entry.reject(error);
    waiting.clear();
  };

  return {
    request(message: WorkerRequestBody): Promise<WorkerResponse> {
      const id = nextId++;
      return new Promise<WorkerResponse>((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ ...message, id } as WorkerRequest);
      }).then((response) => {
        if (response.type === "error") throw new Error(response.message);
        return response;
      });
    },
    close() {
      worker.terminate();
      waiting.clear();
    },
  };
}

const OUT_OF_TURN = "The import worker answered out of turn.";

/** Parse an import in a dedicated worker, so a large file does not freeze the page. */
export function workerParser(create: () => ImportWorker = startWorker): BatchParser {
  const worker = connect(create);

  return {
    async open(text, options) {
      const response = await worker.request({ type: "open", text, options });
      if (response.type !== "opened") throw new Error(OUT_OF_TURN);
      return response.total;
    },
    async parse(start, count) {
      const response = await worker.request({ type: "parse", start, count });
      if (response.type !== "parsed") throw new Error(OUT_OF_TURN);
      return response.batch;
    },
    close: worker.close,
  };
}

/** Index stored games in a dedicated worker, so a restore does not freeze the page. */
export function workerIndexer(create: () => ImportWorker = startWorker): GameIndexer {
  const worker = connect(create);

  return {
    async index(games) {
      const response = await worker.request({ type: "index", games: [...games] });
      if (response.type !== "indexed") throw new Error(OUT_OF_TURN);
      return response.games;
    },
    close: worker.close,
  };
}
