import { useEffect, useState } from "react";
import { Circle, X } from "lucide-react";
import { useGameKeys } from "./useGameKeys";

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winner = (b) => {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return { who: b[a], line: [a, c, d] };
  return b.every(Boolean) ? { who: "draw", line: [] } : null;
};
function minimax(b, player) {
  const w = winner(b);
  if (w) return { score: w.who === "O" ? 1 : w.who === "X" ? -1 : 0 };
  let best = { score: player === "O" ? -2 : 2 };
  b.forEach((v, i) => {
    if (v) return;
    const nb = [...b];
    nb[i] = player;
    const r = minimax(nb, player === "O" ? "X" : "O");
    if ((player === "O" && r.score > best.score) || (player === "X" && r.score < best.score)) best = { score: r.score, move: i };
  });
  return best;
}
function aiMove(b) {
  const free = b.map((v, i) => (v ? null : i)).filter((i) => i !== null);
  if (Math.random() < 0.18) return free[Math.floor(Math.random() * free.length)]; // beatable
  return minimax(b, "O").move;
}

export default function TicTacToe({ onScore, t }) {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [cursor, setCursor] = useState(4);
  const [tally, setTally] = useState({ you: 0, cpu: 0, draw: 0 });
  const result = winner(board);

  useEffect(() => {
    if (result || board.filter(Boolean).length % 2 === 0) return;
    const id = setTimeout(() => {
      const nb = [...board];
      nb[aiMove(board)] = "O";
      setBoard(nb);
    }, 450);
    return () => clearTimeout(id);
  }, [board, result]);

  // The finished round counts towards the tally; it's stored when the next round starts.
  const slot = result ? (result.who === "X" ? "you" : result.who === "O" ? "cpu" : "draw") : null;
  const shown = slot ? { ...tally, [slot]: tally[slot] + 1 } : tally;
  useEffect(() => {
    onScore(shown.you);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.you]);

  useGameKeys((key) => {
    const x = cursor % 3, y = Math.floor(cursor / 3);
    if (key === "ArrowLeft") setCursor(y * 3 + ((x + 2) % 3));
    else if (key === "ArrowRight") setCursor(y * 3 + ((x + 1) % 3));
    else if (key === "ArrowUp") setCursor(((y + 2) % 3) * 3 + x);
    else if (key === "ArrowDown") setCursor(((y + 1) % 3) * 3 + x);
    else if (key === "Enter") {
      if (result) {
        setTally(shown);
        setBoard(Array(9).fill(null));
      }
      else if (!board[cursor] && board.filter(Boolean).length % 2 === 0) {
        const nb = [...board];
        nb[cursor] = "X";
        setBoard(nb);
      }
    } else return false;
    return true;
  });

  return (
    <div className="flex items-center gap-[3rem]">
      <div className="grid grid-cols-3 gap-[0.8rem] rounded-[1.4rem] bg-black/40 p-[0.8rem] ring-1 ring-white/10">
        {board.map((v, i) => (
          <div
            key={i}
            className={`flex h-[10rem] w-[10rem] items-center justify-center rounded-[1rem] transition-all duration-150 ${
              result?.line.includes(i) ? "bg-accent/35" : "bg-white/6"
            } ${i === cursor && !result ? "ring-[0.22rem] ring-white" : ""}`}
          >
            {v === "X" && <X className="h-[6rem] w-[6rem] text-accent" strokeWidth={2.4} />}
            {v === "O" && <Circle className="h-[5rem] w-[5rem] text-white/85" strokeWidth={2.4} />}
          </div>
        ))}
      </div>
      <div className="w-[16rem] space-y-[1rem] text-[1.3rem]">
        <div className="text-[2rem] font-bold">
          {result ? (result.who === "X" ? t("You win!") : result.who === "O" ? t("Computer wins") : t("Draw")) : board.filter(Boolean).length % 2 ? t("Thinking…") : t("Your turn")}
        </div>
        {result && <div className="text-white/60">{t("Press OK to play again")}</div>}
        <div className="glass rounded-[1rem] p-[1rem]">
          <div>{t("You")}: <b>{shown.you}</b></div>
          <div>{t("Computer")}: <b>{shown.cpu}</b></div>
          <div>{t("Draws")}: <b>{shown.draw}</b></div>
        </div>
      </div>
    </div>
  );
}
