/**
 * Spaced repetition: when to see a card again.
 *
 * The SM-2 family, as Anki uses it. Each card carries an ease — how fast its
 * intervals grow — and an interval in days. Answering well multiplies the
 * interval by the ease, so a position you keep getting right comes back after
 * days, then weeks, then months; getting it wrong starts it over and makes it
 * a little harder from then on.
 *
 * SM-2 rather than a newer model such as FSRS. FSRS predicts recall more
 * accurately, but only with weights fitted to many reviews, and a personal
 * collection never has the reviews to fit them. SM-2 needs no fitting, and
 * every step of it can be read and checked.
 *
 * Nothing here knows about chess: a card is anything that can be reviewed,
 * which is what lets the opening trainer and the mistake trainer share it.
 */

export type Grade = "again" | "hard" | "good" | "easy";

export interface ReviewState {
  /** When the card is next due, epoch milliseconds. */
  due: number;
  /** Days between the last review and the next; 0 while being (re)learned. */
  interval: number;
  /** How fast intervals grow, as a multiplier. */
  ease: number;
  /** Successful reviews in a row since the card was last forgotten. */
  streak: number;
  /** Times the card was forgotten after having been learned. */
  lapses: number;
  reviews: number;
  /** When the card was first reviewed — null for a card never shown. */
  firstReviewedAt: number | null;
  lastReviewedAt: number | null;
}

export const INITIAL_EASE = 2.5;

/** Below this, intervals barely grow and a card would be shown almost daily forever. */
export const MIN_EASE = 1.3;

/** A year: past this a chess position is as good as known, and a wait longer is noise. */
export const MAX_INTERVAL_DAYS = 365;

/**
 * How soon a forgotten card comes back: within the same session, after the
 * other cards, rather than tomorrow — getting a position right shortly after
 * seeing the answer is part of learning it.
 */
export const RELEARN_DELAY_MS = 10 * 60 * 1000;

export function newReviewState(now: number): ReviewState {
  return {
    due: now,
    interval: 0,
    ease: INITIAL_EASE,
    streak: 0,
    lapses: 0,
    reviews: 0,
    firstReviewedAt: null,
    lastReviewedAt: null,
  };
}

/**
 * The start of the local day `days` after the one `now` falls in.
 *
 * Reviews are due by the day, not to the minute: a card answered at eight in
 * the evening is due "tomorrow", and should be there tomorrow morning rather
 * than appearing at eight the next evening.
 */
export function startOfDayAfter(now: number, days: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

/** The next interval, in whole days, for a card answered correctly. */
function nextInterval(state: ReviewState, grade: Exclude<Grade, "again">, ease: number): number {
  // The first two successes use fixed steps: multiplying an interval of zero
  // or one by the ease would barely move it.
  if (state.streak === 0) return grade === "easy" ? 4 : 1;
  if (state.streak === 1) return grade === "hard" ? 2 : grade === "easy" ? 6 : 3;

  const grown =
    grade === "hard"
      ? state.interval * 1.2
      : grade === "easy"
        ? state.interval * ease * 1.3
        : state.interval * ease;

  // Never shorter than before for a correct answer — "hard" slows growth, it
  // does not reverse it — and good or easy always move it on by a day at least.
  const floor = grade === "hard" ? state.interval : state.interval + 1;

  return Math.min(MAX_INTERVAL_DAYS, Math.max(floor, Math.round(grown)));
}

/** Record an answer, returning the card's new state. */
export function review(state: ReviewState, grade: Grade, now: number): ReviewState {
  const base = {
    reviews: state.reviews + 1,
    firstReviewedAt: state.firstReviewedAt ?? now,
    lastReviewedAt: now,
  };

  if (grade === "again") {
    return {
      ...state,
      ...base,
      due: now + RELEARN_DELAY_MS,
      interval: 0,
      ease: Math.max(MIN_EASE, state.ease - 0.2),
      streak: 0,
      // Only a card that had been learned can be forgotten; failing a new card
      // is simply not knowing it yet.
      lapses: state.streak > 0 ? state.lapses + 1 : state.lapses,
    };
  }

  const ease =
    grade === "hard"
      ? Math.max(MIN_EASE, state.ease - 0.15)
      : grade === "easy"
        ? state.ease + 0.15
        : state.ease;

  const interval = nextInterval(state, grade, ease);

  return {
    ...state,
    ...base,
    due: startOfDayAfter(now, interval),
    interval,
    ease,
    streak: state.streak + 1,
  };
}

export function isDue(state: ReviewState, now: number): boolean {
  return state.due <= now;
}

export function isNew(state: ReviewState): boolean {
  return state.reviews === 0;
}

export interface QueueOptions<Card extends ReviewState = ReviewState> {
  /**
   * How many cards never seen before may be introduced per day.
   *
   * The limit is what makes a large backlog trainable: the first analysis of a
   * collection can turn up hundreds of positions at once, and showing them all
   * on day one would bury the reviews that keep the learned ones learned.
   */
  newPerDay: number;
  /** Order among new cards — most worth learning first. */
  newOrder?: (a: Card, b: Card) => number;
}

/**
 * The cards to work through now: reviews that are due, then new cards up to
 * what is left of today's allowance.
 *
 * Reviews come first because they are the ones at risk of being forgotten; a
 * new card can wait a day without losing anything.
 */
export function buildQueue<Card extends ReviewState>(
  cards: readonly Card[],
  now: number,
  { newPerDay, newOrder }: QueueOptions<Card>,
): Card[] {
  const today = startOfDayAfter(now, 0);

  const due = cards
    .filter((card) => !isNew(card) && isDue(card, now))
    .sort((a, b) => a.due - b.due);

  const introducedToday = cards.filter(
    (card) => card.firstReviewedAt !== null && card.firstReviewedAt >= today,
  ).length;
  const allowance = Math.max(0, newPerDay - introducedToday);

  const fresh = cards.filter(isNew);
  if (newOrder) fresh.sort(newOrder);

  return [...due, ...fresh.slice(0, allowance)];
}
