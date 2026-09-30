"use client";

import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** The position shown. A failure is retried once per position, not forever. */
  position: string;
  children: ReactNode;
}

interface State {
  /**
   * `recovering` covers the moment between catching an error and deciding what
   * to do about it, which can only be decided once the position is known.
   */
  phase: "ok" | "recovering" | "gave-up";
  /** Bumped to remount the board from scratch. */
  attempt: number;
  /** The position that has already been retried once, if any. */
  retriedAt: string | null;
}

/** Holds the board's place, so the page does not jump while it is rebuilt. */
function Placeholder({ children }: { children?: ReactNode }) {
  return (
    <div className="text-muted-foreground flex aspect-square w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
      {children}
    </div>
  );
}

/**
 * Keep a failing board from taking the page down with it.
 *
 * The board library measures a square to animate a move, and throws when the
 * square has no width — a board in a hidden pane, a collapsed container, a
 * window with no size. Thrown from an effect with nothing to catch it, that
 * error unmounted the whole application: the page was replaced by "This page
 * couldn't load", and any unsaved edits to the game went with it.
 *
 * Caught here, it costs one animation instead. The board is remounted, and a
 * freshly mounted board places the pieces where they stand without animating
 * them — the very step that failed. Everything above this boundary, the game
 * being edited included, never notices.
 *
 * One retry per position: a board that fails again on the same position is not
 * going to recover by being remounted in a loop, so it gives way to a notice
 * with a button. Moving to another position tries again on its own.
 */
export class BoardErrorBoundary extends Component<Props, State> {
  state: State = { phase: "ok", attempt: 0, retriedAt: null };

  static getDerivedStateFromError(): Partial<State> {
    return { phase: "recovering" };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.state.retriedAt === this.props.position) {
      console.error("The board failed twice on the same position", error, info.componentStack);
      this.setState({ phase: "gave-up" });
      return;
    }

    this.setState((state) => ({
      phase: "ok",
      attempt: state.attempt + 1,
      retriedAt: this.props.position,
    }));
  }

  componentDidUpdate(previous: Props): void {
    // A different position is a fresh chance, whatever happened on the last.
    if (this.state.phase === "gave-up" && previous.position !== this.props.position) {
      this.retry();
    }
  }

  private retry = () => {
    this.setState((state) => ({ phase: "ok", attempt: state.attempt + 1, retriedAt: null }));
  };

  render() {
    if (this.state.phase === "recovering") return <Placeholder />;

    if (this.state.phase === "gave-up") {
      return (
        <Placeholder>
          <p>The board could not be drawn.</p>
          <Button variant="outline" size="sm" className="gap-2" onClick={this.retry}>
            <RotateCcw className="size-4" />
            Try again
          </Button>
        </Placeholder>
      );
    }

    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
