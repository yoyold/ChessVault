import { createWorkerHandler, type WorkerRequest, type WorkerResponse } from "./import-worker-protocol";

/**
 * Parses PGN for an import, off the main thread.
 *
 * Only parsing happens here. The database stays with the page, which already
 * holds the connection and the live queries that update as games arrive.
 */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

const handle = createWorkerHandler();

scope.onmessage = (event) => {
  void handle(event.data).then((response) => scope.postMessage(response));
};
