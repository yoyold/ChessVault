import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { BoardErrorBoundary } from "./board-error-boundary";

/**
 * Stands in for the board: throws from an effect, as the library does, when a
 * position it is moved to cannot be animated.
 *
 * `failWhenMovedTo` fails only on a change of position — a fresh mount at that
 * position succeeds, exactly like the real board, which animates only moves.
 * `alwaysFailAt` fails however it got there, a board that cannot recover.
 */
function FakeBoard({
  position,
  failWhenMovedTo,
  alwaysFailAt,
}: {
  position: string;
  failWhenMovedTo?: string;
  alwaysFailAt?: string;
}) {
  const previous = useRef(position);

  useEffect(() => {
    const moved = previous.current !== position;
    previous.current = position;

    if (position === alwaysFailAt) throw new Error("Square width not found");
    if (moved && position === failWhenMovedTo) throw new Error("Square width not found");
  }, [position, failWhenMovedTo, alwaysFailAt]);

  return <div data-testid="board">{position}</div>;
}

/** Stands in for the analysis view: state above the boundary that must survive. */
function View(props: { position: string; failWhenMovedTo?: string; alwaysFailAt?: string }) {
  return (
    <div>
      <input aria-label="unsaved comment" defaultValue="" />
      <BoardErrorBoundary position={props.position}>
        <FakeBoard {...props} />
      </BoardErrorBoundary>
    </div>
  );
}

beforeEach(() => {
  // React reports every caught error to the console; the boundary is the point.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BoardErrorBoundary", () => {
  it("rebuilds the board instead of losing the page", async () => {
    const { rerender } = render(<View position="start" failWhenMovedTo="after-e4" />);

    // Something typed but not saved, above the board.
    await userEvent.type(screen.getByLabelText("unsaved comment"), "keep me");

    await act(async () => rerender(<View position="after-e4" failWhenMovedTo="after-e4" />));

    expect(screen.getByTestId("board")).toHaveTextContent("after-e4");
    expect(screen.getByLabelText("unsaved comment")).toHaveValue("keep me");
  });

  it("gives up on a position that keeps failing, with a way to try again", async () => {
    const { rerender } = render(<View position="start" />);

    await act(async () => rerender(<View position="broken" alwaysFailAt="broken" />));

    expect(screen.queryByTestId("board")).toBeNull();
    expect(screen.getByText("The board could not be drawn.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("tries again on its own when the position changes", async () => {
    const { rerender } = render(<View position="start" />);
    await act(async () => rerender(<View position="broken" alwaysFailAt="broken" />));

    await act(async () => rerender(<View position="next" alwaysFailAt="broken" />));

    expect(screen.getByTestId("board")).toHaveTextContent("next");
  });

  it("recovers again after a later failure elsewhere", async () => {
    // Retrying is limited per position, not per lifetime.
    const { rerender } = render(<View position="a" failWhenMovedTo="b" />);
    await act(async () => rerender(<View position="b" failWhenMovedTo="b" />));
    await act(async () => rerender(<View position="c" failWhenMovedTo="c" />));

    expect(screen.getByTestId("board")).toHaveTextContent("c");
  });
});
