"use client";

import { Chessboard } from "react-chessboard";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, SkipBack, SkipForward } from "lucide-react";
import { formatMoveNumber, formatNag } from "@/core/chess/pgn/game-timeline";
import { toDisplayComment } from "@/core/chess/pgn/comment-display";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFullGame } from "@/persistence/repositories/game-repository";
import { getEvaluations } from "@/persistence/repositories/evaluation-repository";
import { useEngine } from "../hooks/use-engine";
import { useEngineAnalysis, type EngineSettings } from "../hooks/use-engine-analysis";
import { useFullGameAnalysis } from "../hooks/use-full-game-analysis";
import { EnginePanel } from "./engine-panel";
import { EvalGraph } from "./eval-graph";
import { GameReportSummary } from "./game-report-summary";
import { MoveList } from "./move-list";

export function AnalysisView({ gameId }: { gameId: number }) {
  const engine = useEngine();

  const [path, setPath] = useState<number[]>([]);
  const [settings, setSettings] = useState<EngineSettings>({ depth: 16, multiPv: 3 });

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

  const root = tree?.root ?? null;

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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <Chessboard
          options={{
            position: current.fen,
            boardOrientation: game.record.playerColor === "black" ? "black" : "white",
            allowDragging: false,
            showNotation: true,
            animationDurationInMs: 120,
          }}
        />

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
          // The marker only applies while reading the mainline; inside a
          // sideline there is no position on the game's own graph.
          currentPly={safePath.every((step) => step === 0) ? current.ply : -1}
          onSelectPly={(ply) => setPath(Array(ply).fill(0))}
        />

        <CurrentMoveAnnotations node={current} />

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

/** Comments and glyphs the annotator attached to the move currently shown. */
function CurrentMoveAnnotations({ node }: { node: TreeNode }) {
  if (node.comments.length === 0 && node.nags.length === 0) return null;

  return (
    <section className="rounded-md border p-3 text-sm">
      {node.nags.length > 0 ? (
        <div className="mb-1 flex gap-1">
          {node.nags.map((nag) => (
            <Badge key={nag} variant="secondary" className="text-xs">
              {formatNag(nag)}
            </Badge>
          ))}
        </div>
      ) : null}

      {node.comments.map((comment, index) => {
        const display = toDisplayComment(comment);

        return (
          <p key={index} className="text-muted-foreground">
            {display.text}
            {display.truncatedBy > 0 ? (
              // Said plainly rather than trailing off: the comment is intact in
              // the stored PGN, only its display is bounded.
              <span className="text-xs italic">
                {" "}
                … {display.truncatedBy.toLocaleString()} further characters not
                shown
              </span>
            ) : null}
          </p>
        );
      })}
    </section>
  );
}
