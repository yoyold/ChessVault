import {
  indexGames,
  inlineParser,
  type GameText,
  type IndexedGame,
  type ParsedBatch,
  type ParseOptions,
} from "./batch-parser";

/** What the page asks of the import worker. */
export type WorkerRequest =
  | { id: number; type: "open"; text: string; options: ParseOptions }
  | { id: number; type: "parse"; start: number; count: number }
  | { id: number; type: "index"; games: GameText[] };

/** The worker's answer to the request with the same id. */
export type WorkerResponse =
  | { id: number; type: "opened"; total: number }
  | { id: number; type: "parsed"; batch: ParsedBatch }
  | { id: number; type: "indexed"; games: IndexedGame[] }
  | { id: number; type: "error"; message: string };

/**
 * The worker's side of the conversation, apart from the worker itself.
 *
 * It is the inline parser behind a message boundary — the same code parses
 * either way — so this can be tested without a browser worker. Besides
 * parsing a file for import, it indexes stored games again when a backup is
 * restored.
 */
export function createWorkerHandler(): (request: WorkerRequest) => Promise<WorkerResponse> {
  const parser = inlineParser();

  return async (request) => {
    try {
      if (request.type === "open") {
        return { id: request.id, type: "opened", total: await parser.open(request.text, request.options) };
      }
      if (request.type === "index") {
        return { id: request.id, type: "indexed", games: indexGames(request.games) };
      }
      return {
        id: request.id,
        type: "parsed",
        batch: await parser.parse(request.start, request.count),
      };
    } catch (error) {
      return {
        id: request.id,
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
