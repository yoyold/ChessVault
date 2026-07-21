"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, SkipBack, SkipForward } from "lucide-react";
import { formatMoveNumber, formatNag } from "@/core/chess/pgn/game-timeline";
import { mainline, parseGameTree, type TreeNode } from "@/core/chess/pgn/parse-tree";
import {
  alternativesAt,
  clampPath,
  displayLine,
  endOfLinePath,
  nextPath,
  nodeAtPath,
  previousPath,
  switchVariation,
} from "@/core/chess/pgn/tree-path";
import type { Score } from "@/core/analysis/types";
import type { MoveQuality } from "@/core/analysis/move-quality";
import { Button } from "@/components/ui/button";
import { getFullGame } from "@/persistence/repositories/game-repository";
import { getEvaluations } from "@/persistence/repositories/evaluation-repository";
import { Chess } from "chess.js";
import { toast } from "sonner";
import { Save } from "lucide-react";
import {
  addMove,
  promoteVariation,
  pathAfterPromotion,
  removeNode,
  withComments,
  withNags,
} from "@/core/chess/pgn/edit-tree";
import { persistGame } from "@/features/games/edit/save-game";
import { useSettings } from "@/features/shell/use-settings";
import { useShortcut } from "@/features/shell/use-shortcut";
import { AnalysisBoard } from "./analysis-board";
import { AnnotationEditor } from "./annotation-editor";
import { EditDetailsDialog } from "./edit-details-dialog";
import { useEngine } from "../hooks/use-engine";
import { useEngineAnalysis, type EngineSettings } from "../hooks/use-engine-analysis";
import { useFullGameAnalysis } from "../hooks/use-full-game-analysis";
import { EnginePanel } from "./engine-panel";
import { EvalBar } from "./eval-bar";
import { EvalGraph } from "./eval-graph";
import { GameHeader } from "./game-header";
import { GameReportSummary } from "./game-report-summary";
import { MoveList } from "./move-list";

export function AnalysisView({ gameId }: { gameId: number }) {
  const engine = useEngine();

  const [path, setPath] = useState<number[]>([]);
  const [settings, setSettings] = useState<EngineSettings>({ depth: 16, multiPv: 3 });
  const { playerNames } = useSettings();

  const game = useLiveQuery(() => getFullGame(gameId), [gameId]);

  const tree = useMemo(() => {
    if (!game) return null;

    try {
      return parseGameTree(game.content.pgn);
    } catch {
      // A game that fails to parse should not blank the page; it is reported below.
      return null;
    }
  }, [game]);

  /**
   * Unsaved edits, tagged with the game they belong to.
   *
   * Tagging is what makes navigating to another game discard them automatically
   * rather than applying one game's annotations to another.
   */
  const [draft, setDraft] = useState<{ gameId: number; root: TreeNode } | null>(null);

  const dirty = draft?.gameId === gameId;
  const root = dirty ? draft.root : (tree?.root ?? null);

  const edit = (next: TreeNode) => setDraft({ gameId, root: next });

  // A path is only meaningful against the tree it was made for. Clamping guards
  // the moment the game changes while a deep path is still selected.
  const safePath = useMemo(() => (root ? clampPath(root, path) : []), [root, path]);

  const current = root ? nodeAtPath(root, safePath) : null;
  const line = useMemo(() => (root ? displayLine(root, safePath) : []), [root, safePath]);
  const alternatives = useMemo(
    () => (root ? alternativesAt(root, safePath) : []),
    [root, safePath],
  );

  const { analyse, reset, ...analysisState } = useEngineAnalysis(engine, settings);
  const fullGame = useFullGameAnalysis(engine);

  useEffect(() => {
    if (!current) return;

    void analyse(current.fen);
  }, [current, analyse]);

  // The graph follows the game as played, not the branch being read, so it
  // stays a stable picture of the game while the reader explores sidelines.
  const mainLine = useMemo(() => (root ? mainline(root) : []), [root]);

  const storedEvaluations = useLiveQuery(
    async () => (mainLine.length > 0 ? getEvaluations(mainLine.map((n) => n.key)) : new Map()),
    [mainLine],
  );

  const graphScores: (Score | null)[] = useMemo(
    () => mainLine.map((node) => storedEvaluations?.get(node.key)?.lines[0]?.score ?? null),
    [mainLine, storedEvaluations],
  );

  const qualityByPly = useMemo(() => {
    const map = new Map<number, MoveQuality>();
    for (const move of fullGame.report?.moves ?? []) map.set(move.ply, move.assessment.quality);
    return map;
  }, [fullGame.report]);

  // Arrow keys step through the game, as in every chess interface. Declared
  // before the early returns below, since hooks cannot be conditional.
  const stepBack = useCallback(() => {
    if (!root) return;
    const target = previousPath(safePath);
    if (target) setPath(target);
  }, [root, safePath]);

  const stepForward = useCallback(() => {
    if (!root) return;
    const target = nextPath(root, safePath);
    if (target) setPath(target);
  }, [root, safePath]);

  useShortcut("ArrowLeft", stepBack);
  useShortcut("ArrowRight", stepForward);
  useShortcut("ArrowUp", () => setPath([]));
  useShortcut("ArrowDown", () => {
    if (root) setPath(endOfLinePath(root, safePath));
  });

  if (game === undefined) {
    return <p className="text-muted-foreground text-sm">Loading game…</p>;
  }

  if (game === null) {
    return <p className="text-muted-foreground text-sm">This game no longer exists.</p>;
  }

  if (!root || !current || !tree) {
    return <p className="text-destructive text-sm">This game&apos;s moves could not be read.</p>;
  }

  const go = (next: number[] | null) => {
    if (next) setPath(next);
  };

  // The bar prefers the running analysis so it moves as the engine thinks, and
  // falls back to a stored evaluation so a position analysed earlier still
  // shows something the moment it is opened.
  const liveScore =
    analysisState.analysis?.lines[0]?.score ??
    storedEvaluations?.get(current.key)?.lines[0]?.score ??
    null;

  /** Play a move on the board, adding it as a continuation or a variation. */
  const playMove = (from: string, to: string): boolean => {
    const board = new Chess(current.fen);

    let san: string;
    try {
      // Promotion defaults to a queen. Underpromotion is rare enough that
      // asking every time would cost more than it saves; it can still be
      // entered by editing the PGN.
      san = board.move({ from, to, promotion: "q" }).san;
    } catch {
      return false;
    }

    const result = addMove(root, safePath, san);
    if (!result) return false;

    if (result.added) edit(result.root);
    setPath(result.path);

    return true;
  };

  /**
   * Write the game, optionally with replaced tag pairs.
   *
   * Editing details saves immediately rather than staging: the header shown
   * above the board reads from the stored record, so a staged change would
   * leave the dialog and the page disagreeing until some later save.
   */
  const save = async (overrideHeaders?: Record<string, string>) => {
    if (!tree || !root) return;

    try {
      await persistGame({
        headers: overrideHeaders ?? tree.headers,
        root,
        ownerNames: playerNames,
        gameId,
      });
      setDraft(null);
      toast.success("Game saved");
    } catch (error) {
      toast.error("Could not save the game", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    // Proportional columns rather than a fixed or viewport-derived board width:
    // a column that asks for more than it receives makes the board measure one
    // width and render at another.
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/*
        The board is square, so capping its *width* in viewport-height units
        also caps its height — which is what keeps it on screen. The subtraction
        leaves room for the header, the page heading and the move controls
        beneath it, so the whole column fits without scrolling.

        This is a max-width, not a width: the element still takes whatever the
        column actually gives it, so the board never measures one size and
        renders at another.
      */}
      <div className="flex w-full min-w-0 max-w-[min(100%,calc(100svh-16rem))] flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <GameHeader game={game.record} />
          </div>

          <EditDetailsDialog
            headers={tree.headers}
            onSave={(next) => void save(next)}
          />

          {dirty ? (
            // Shown only when there is something to save, so its presence is
            // itself the signal that edits are pending.
            <Button size="sm" className="shrink-0 gap-2" onClick={() => void save()}>
              <Save className="size-4" />
              Save
            </Button>
          ) : null}
        </div>

        {/*
          The bar sits in the same row as the board and stretches to it, so the
          two stay aligned at any board size.
        */}
        <div className="flex items-stretch gap-2">
          <EvalBar
            score={liveScore}
            orientation={game.record.playerColor === "black" ? "black" : "white"}
          />
          <div className="min-w-0 flex-1">
            <AnalysisBoard
              fen={current.fen}
              orientation={game.record.playerColor === "black" ? "black" : "white"}
              lastMoveUci={current.uci}
              onMove={playMove}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="First move" onClick={() => setPath([])}>
            <SkipBack />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous move"
            onClick={() => go(previousPath(safePath))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next move"
            onClick={() => go(nextPath(root, safePath))}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="End of line"
            onClick={() => setPath(endOfLinePath(root, safePath))}
          >
            <SkipForward />
          </Button>

          <span className="text-muted-foreground ml-2 text-sm tabular-nums">
            {current.san === null
              ? "Start"
              : `${formatMoveNumber(current.ply)} ${current.san}`}
          </span>
        </div>

        <EvalGraph
          scores={graphScores}
          moves={mainLine.map((node) => node.san)}
          // The marker only applies while reading the mainline; inside a
          // sideline there is no position on the game's own graph.
          currentPly={safePath.every((step) => step === 0) ? current.ply : -1}
          onSelectPly={(ply) => setPath(Array(ply).fill(0))}
        />

        <AnnotationEditor
          // Keyed by path so moving to another move remounts the editor with
          // that move's comment, rather than carrying the previous draft over.
          key={safePath.join("-")}
          node={current}
          onCommentsChange={(comments) => edit(withComments(root, safePath, comments))}
          onNagsChange={(nags) => edit(withNags(root, safePath, nags))}
          onDelete={
            safePath.length > 0
              ? () => {
                  edit(removeNode(root, safePath));
                  setPath(safePath.slice(0, -1));
                }
              : undefined
          }
        />

        {alternatives.length > 0 ? (
          <section className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Instead:</span>
            {alternatives.map((alternative) => (
              <Button
                key={alternative.index}
                variant="outline"
                size="sm"
                onClick={() => setPath(switchVariation(safePath, alternative.index))}
              >
                {alternative.node.san}
                {alternative.node.nags.map((nag) => formatNag(nag)).join("")}
              </Button>
            ))}
          </section>
        ) : null}

        {safePath.length > 0 && safePath[safePath.length - 1] !== 0 ? (
          // Only offered inside a sideline: promoting the main line to itself
          // is meaningless, and the button would be permanently present and
          // permanently inert.
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              edit(promoteVariation(root, safePath));
              setPath(pathAfterPromotion(safePath));
            }}
          >
            Promote to main line
          </Button>
        ) : null}

        {tree.droppedVariations > 0 ? (
          // Stated rather than hidden: the game is shown as less complete than
          // its source, and the reader should know why.
          <p className="text-muted-foreground text-xs">
            {tree.droppedVariations} variation
            {tree.droppedVariations === 1 ? "" : "s"} in this game contained an
            illegal move and could not be shown.
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <EnginePanel
          {...analysisState}
          settings={settings}
          onSettingsChange={setSettings}
          onReanalyse={() => {
            reset();
            void analyse(current.fen, { force: true });
          }}
        />

        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Full game analysis</h2>

            {fullGame.progress ? (
              <>
                <span className="text-muted-foreground text-sm tabular-nums">
                  <Loader2 className="mr-1 inline size-3.5 animate-spin" />
                  {fullGame.progress.analysed} / {fullGame.progress.total}
                </span>
                <Button variant="outline" size="sm" onClick={fullGame.cancel}>
                  Stop
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => void fullGame.run(mainLine, settings.depth)}
              >
                Analyse every move
              </Button>
            )}
          </div>

          {fullGame.report ? <GameReportSummary report={fullGame.report} /> : null}
        </section>

        <MoveList
          line={line}
          currentPath={safePath}
          qualityByPly={qualityByPly}
          onSelect={setPath}
        />
      </div>
    </div>
  );
}
