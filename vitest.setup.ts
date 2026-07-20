import "@testing-library/jest-dom/vitest";

// jsdom ships no IndexedDB implementation. Dexie needs a real one, so the
// persistence layer is tested against fake-indexeddb rather than a mock — the
// repositories then exercise genuine index and transaction semantics, which is
// where storage bugs actually live.
import "fake-indexeddb/auto";
