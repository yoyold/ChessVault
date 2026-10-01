import { describe, expect, it } from "vitest";
import {
  buildQueue,
  INITIAL_EASE,
  isDue,
  MAX_INTERVAL_DAYS,
  MIN_EASE,
  newReviewState,
  RELEARN_DELAY_MS,
  review,
  startOfDayAfter,
  type Grade,
  type ReviewState,
} from "./scheduler";

const DAY = 24 * 60 * 60 * 1000;
// A Wednesday afternoon, local time.
const NOW = new Date(2026, 9, 7, 15, 30).getTime();

/** Answer a card several times, a day after each due date. */
function answer(grades: Grade[], start: ReviewState = newReviewState(NOW)): ReviewState {
  let state = start;
  let time = NOW;
  for (const grade of grades) {
    state = review(state, grade, time);
    time = Math.max(time, state.due) + 1;
  }
  return state;
}

describe("review", () => {
  it("brings a first correct answer back tomorrow, at the start of the day", () => {
    const state = review(newReviewState(NOW), "good", NOW);

    expect(state.interval).toBe(1);
    expect(state.due).toBe(startOfDayAfter(NOW, 1));
    expect(new Date(state.due).getHours()).toBe(0);
  });

  it("spaces correct answers further and further apart", () => {
    const intervals: number[] = [];
    let state = newReviewState(NOW);
    let time = NOW;
    for (let i = 0; i < 6; i++) {
      state = review(state, "good", time);
      intervals.push(state.interval);
      time = state.due + 1;
    }

    expect(intervals.slice(0, 2)).toEqual([1, 3]);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
  });

  it("brings a wrong answer back within the session, not tomorrow", () => {
    const state = review(answer(["good", "good"]), "again", NOW);

    expect(state.due).toBe(NOW + RELEARN_DELAY_MS);
    expect(state.interval).toBe(0);
    expect(state.streak).toBe(0);
  });

  it("makes a forgotten card harder, but never below the floor", () => {
    const once = review(newReviewState(NOW), "again", NOW);
    expect(once.ease).toBeCloseTo(INITIAL_EASE - 0.2);

    const many = answer(Array(20).fill("again"));
    expect(many.ease).toBe(MIN_EASE);
  });

  it("counts a lapse only for a card that had been learned", () => {
    // Failing something never known is not forgetting it.
    expect(review(newReviewState(NOW), "again", NOW).lapses).toBe(0);
    expect(review(answer(["good"]), "again", NOW).lapses).toBe(1);
  });

  it("grows hard answers slower than good, and easy faster", () => {
    const learned = answer(["good", "good", "good"]);

    const hard = review(learned, "hard", learned.due);
    const good = review(learned, "good", learned.due);
    const easy = review(learned, "easy", learned.due);

    expect(hard.interval).toBeLessThan(good.interval);
    expect(easy.interval).toBeGreaterThan(good.interval);
    expect(hard.interval).toBeGreaterThanOrEqual(learned.interval);
  });

  it("caps the interval at a year", () => {
    const veteran = answer(Array(30).fill("easy"));

    expect(veteran.interval).toBe(MAX_INTERVAL_DAYS);
  });

  it("keeps the review history", () => {
    const state = answer(["good", "again", "good"]);

    expect(state.reviews).toBe(3);
    expect(state.firstReviewedAt).toBe(NOW);
    expect(state.lastReviewedAt).not.toBeNull();
  });
});

describe("isDue", () => {
  it("is due once its time has come", () => {
    const state = review(newReviewState(NOW), "good", NOW);

    expect(isDue(state, NOW)).toBe(false);
    expect(isDue(state, startOfDayAfter(NOW, 1))).toBe(true);
  });
});

describe("buildQueue", () => {
  function card(id: string, state: ReviewState) {
    return { ...state, id };
  }

  it("puts due reviews first, oldest due first, then new cards", () => {
    const overdue = card("overdue", { ...answer(["good"]), due: NOW - 2 * DAY });
    const due = card("due", { ...answer(["good"]), due: NOW - DAY });
    const later = card("later", { ...answer(["good"]), due: NOW + DAY });
    const fresh = card("new", newReviewState(NOW));

    const queue = buildQueue([fresh, later, due, overdue], NOW, { newPerDay: 10 });

    expect(queue.map((c) => c.id)).toEqual(["overdue", "due", "new"]);
  });

  it("limits how many new cards a day brings", () => {
    const cards = Array.from({ length: 30 }, (_, i) => card(`n${i}`, newReviewState(NOW)));

    expect(buildQueue(cards, NOW, { newPerDay: 10 })).toHaveLength(10);
  });

  it("counts new cards already introduced today against the allowance", () => {
    const introduced = Array.from({ length: 4 }, (_, i) =>
      card(`seen${i}`, review(newReviewState(NOW), "good", NOW)),
    );
    const fresh = Array.from({ length: 30 }, (_, i) => card(`n${i}`, newReviewState(NOW)));

    const queue = buildQueue([...introduced, ...fresh], NOW, { newPerDay: 10 });

    // The four seen today are not due yet; six new ones remain for today.
    expect(queue).toHaveLength(6);
  });

  it("orders new cards by the priority given", () => {
    const cards = [
      card("low", { ...newReviewState(NOW), ease: 1 }),
      card("high", { ...newReviewState(NOW), ease: 3 }),
    ];

    const queue = buildQueue(cards, NOW, { newPerDay: 10, newOrder: (a, b) => b.ease - a.ease });

    expect(queue.map((c) => c.id)).toEqual(["high", "low"]);
  });

  it("is empty when nothing is due and nothing new is left", () => {
    expect(buildQueue([card("later", { ...answer(["good"]), due: NOW + DAY })], NOW, { newPerDay: 10 })).toEqual([]);
  });
});
