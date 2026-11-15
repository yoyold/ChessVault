/**
 * What a drill asks of the player.
 *
 * - `mate`: deliver checkmate. Judged by the rules alone: the engine bundled
 *   here does not see the mate in a rook or bishop ending at the depths it
 *   plays at, so its score says nothing about whether the job is done.
 * - `promote`: make a queen and keep the win.
 * - `draw`: hold the position for a number of your own moves, or reach a draw
 *   by the rules before then.
 */
export type EndgameGoal =
  | { type: "mate" }
  | { type: "promote" }
  | { type: "draw"; moves: number };

export type EndgameCategory = "mates" | "pawns" | "rooks" | "queens" | "minors";

export const CATEGORY_LABELS: Record<EndgameCategory, string> = {
  mates: "Basic mates",
  pawns: "Pawn endings",
  rooks: "Rook endings",
  queens: "Queen endings",
  minors: "Minor pieces",
};

export interface EndgameDrill {
  /** Stable: it names the drill's card, and with it the owner's progress. */
  id: string;
  title: string;
  category: EndgameCategory;
  /** The starting position, with the player to move. */
  fen: string;
  goal: EndgameGoal;
  /** The idea that solves it, shown on request. */
  idea: string;
  /** 1 to 3, easiest first: new drills are introduced in this order. */
  level: 1 | 2 | 3;
}

/**
 * The drills, in the order they are introduced.
 *
 * Every position was checked with the bundled engine at depth 20 when it was
 * added: the wins are clear wins, the draws are draws. A position that only
 * looks right is worse than none, since the drill would teach the opposite.
 */
export const ENDGAME_DRILLS: readonly EndgameDrill[] = [
  {
    id: "queen-mate",
    title: "Mate with the queen",
    category: "mates",
    fen: "8/8/8/4k3/8/8/8/4K2Q w - - 0 1",
    goal: { type: "mate" },
    idea: "Use the queen to shrink the king's box a knight's move away, then bring your own king up. Watch out for stalemate.",
    level: 1,
  },
  {
    id: "rook-mate",
    title: "Mate with the rook",
    category: "mates",
    fen: "8/8/8/4k3/8/8/8/R3K3 w - - 0 1",
    goal: { type: "mate" },
    idea: "Cut the king off with the rook, walk your king into opposition, and check along the edge. Waiting moves with the rook keep the box closed.",
    level: 1,
  },
  {
    id: "king-in-front",
    title: "King in front of the pawn",
    category: "pawns",
    fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1",
    goal: { type: "promote" },
    idea: "With your king on the sixth rank in front of the pawn, the pawn queens whoever is to move. Step aside to the side the defending king leaves.",
    level: 1,
  },
  {
    id: "square",
    title: "Step into the square",
    category: "pawns",
    fen: "8/8/8/8/1p5k/8/8/5K2 w - - 0 1",
    goal: { type: "draw", moves: 10 },
    idea: "Draw the square from the pawn to its queening square. Only a king that steps into it in time catches the pawn: Ke1.",
    level: 1,
  },
  {
    id: "spare-tempo",
    title: "The spare pawn move",
    category: "pawns",
    fen: "8/8/4k3/8/4K3/8/4P3/8 w - - 0 1",
    goal: { type: "promote" },
    idea: "The defending king has the opposition, but your pawn still has a move to spare. Spend it — e3 — and the opposition is yours.",
    level: 2,
  },
  {
    id: "hold-opposition",
    title: "Hold with the opposition",
    category: "pawns",
    fen: "4k3/8/8/4KP2/8/8/8/8 b - - 0 1",
    goal: { type: "draw", moves: 15 },
    idea: "Stay in front of the pawn and take the opposition whenever the white king comes up level with it. Retreat straight back, never to the side.",
    level: 2,
  },
  {
    id: "rook-pawn-corner",
    title: "Run to the corner",
    category: "pawns",
    fen: "1k6/8/8/8/8/1K6/P7/8 b - - 0 1",
    goal: { type: "draw", moves: 15 },
    idea: "Against a rook's pawn the defending king only has to reach the corner in front of it. From there it cannot be driven out.",
    level: 2,
  },
  {
    id: "lucena",
    title: "Lucena: build a bridge",
    category: "rooks",
    fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1",
    goal: { type: "promote" },
    idea: "Check the king one file further away (Rd1+), then lift the rook to the fourth rank (Rd4). Walk your king out; when the rook checks it, your rook steps in between.",
    level: 2,
  },
  {
    id: "wrong-bishop",
    title: "The wrong bishop",
    category: "minors",
    fen: "7k/8/7P/8/8/8/8/1B4K1 b - - 0 1",
    goal: { type: "draw", moves: 15 },
    idea: "The bishop cannot control the corner square, so nothing can drive your king out of it. Shuffle between h8 and g8 — even being stalemated there is a draw.",
    level: 2,
  },
  {
    id: "philidor",
    title: "Philidor: the third-rank defence",
    category: "rooks",
    fen: "4k3/7R/r7/3KP3/8/8/8/8 b - - 0 1",
    goal: { type: "draw", moves: 20 },
    idea: "Keep your rook on your third rank (the sixth here) so the king cannot advance. Once the pawn steps forward, go to the back and check from behind.",
    level: 3,
  },
  {
    id: "outside-passer",
    title: "The outside passed pawn",
    category: "pawns",
    fen: "8/5kpp/8/8/8/8/P5PP/6K1 w - - 0 1",
    goal: { type: "promote" },
    idea: "Push the outside pawn to drag the black king away, then march your king to the other wing and collect the pawns there.",
    level: 3,
  },
  {
    id: "queen-vs-pawn",
    title: "Queen against a pawn on the seventh",
    category: "queens",
    fen: "8/8/8/8/8/2Q5/4pk2/7K w - - 0 1",
    goal: { type: "mate" },
    idea: "Check and pin until the king has to stand in front of its pawn. Each time it does, bring your king one step closer. Then win the pawn and mate.",
    level: 3,
  },
  {
    id: "bishops-mate",
    title: "Mate with two bishops",
    category: "mates",
    fen: "8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1",
    goal: { type: "mate" },
    idea: "Side by side, the bishops make a wall the king cannot cross. Shrink its space step by step towards a corner, with your king close behind.",
    level: 3,
  },
];

export function drillById(id: string): EndgameDrill | undefined {
  return ENDGAME_DRILLS.find((drill) => drill.id === id);
}

/** What the goal asks, in a sentence. */
export function describeGoal(goal: EndgameGoal): string {
  if (goal.type === "mate") return "Checkmate.";
  if (goal.type === "promote") return "Make a queen and keep the win.";
  return `Hold the draw for ${goal.moves} moves.`;
}

/** New drills are introduced in catalogue order: easiest first. */
export function compareNewDrills(a: { drillId: string }, b: { drillId: string }): number {
  const position = (id: string) => ENDGAME_DRILLS.findIndex((drill) => drill.id === id);
  return position(a.drillId) - position(b.drillId);
}
