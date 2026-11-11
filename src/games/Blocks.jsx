import { useEffect, useRef, useState } from "react";
import { useGameKeys, useInterval } from "./useGameKeys";

const COLS = 10, ROWS = 20, CELL = 34;
const SHAPES = [
  [[1, 1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
  [[1, 1, 0], [0, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
];
const COLORS = ["#4fd1e8", "#f5c542", "#b07cff", "#4e8cff", "#ff9f43", "#ff5d73", "#3ecf8e"];

const rotate = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());
const piece = () => {
  const k = Math.floor(Math.random() * SHAPES.length);
  return { m: SHAPES[k], c: k + 1, x: 3, y: 0 };
};
const fresh = () => ({ board: Array.from({ length: ROWS }, () => Array(COLS).fill(0)), cur: piece(), next: piece(), score: 0, lines: 0, over: false, paused: false });
const fits = (b, p, dx = 0, dy = 0, m = p.m) =>
  m.every((row, y) => row.every((v, x) => !v || (p.y + y + dy < ROWS && p.x + x + dx >= 0 && p.x + x + dx < COLS && !(b[p.y + y + dy] || [])[p.x + x + dx])));
const snapshot = (s) => ({ over: s.over, paused: s.paused, lines: s.lines, next: s.next });

export default function Blocks({ onScore, onOver, t }) {
  const canvas = useRef(null);
  const [initial] = useState(fresh);
  const g = useRef(initial);
  const [view, setView] = useState(() => snapshot(initial));
  const sync = () => setView(snapshot(g.current));
  const level = Math.floor(view.lines / 10);

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const s = g.current;
    ctx.clearRect(0, 0, c.width, c.height);
    const cell = (x, y, color, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    s.board.forEach((row, y) => row.forEach((v, x) => v && cell(x, y, COLORS[v - 1])));
    let gy = 0;
    while (fits(s.board, s.cur, 0, gy + 1)) gy++;
    s.cur.m.forEach((row, y) => row.forEach((v, x) => v && cell(s.cur.x + x, s.cur.y + y + gy, COLORS[s.cur.c - 1], 0.22)));
    s.cur.m.forEach((row, y) => row.forEach((v, x) => v && cell(s.cur.x + x, s.cur.y + y, COLORS[s.cur.c - 1])));
  };

  const lock = () => {
    const s = g.current;
    s.cur.m.forEach((row, y) => row.forEach((v, x) => v && (s.board[s.cur.y + y][s.cur.x + x] = s.cur.c)));
    const kept = s.board.filter((r) => r.some((v) => !v));
    const cleared = ROWS - kept.length;
    if (cleared) {
      s.lines += cleared;
      s.score += [0, 100, 300, 500, 800][cleared] * (Math.floor(s.lines / 10) + 1);
      onScore(s.score);
    }
    s.board = [...Array.from({ length: cleared }, () => Array(COLS).fill(0)), ...kept];
    s.cur = s.next;
    s.next = piece();
    if (!fits(s.board, s.cur)) {
      s.over = true;
      onOver(s.score);
    }
    sync();
  };

  useGameKeys((key) => {
    const s = g.current;
    if (key === "Enter" && s.over) {
      g.current = fresh();
      onScore(0);
      sync();
      draw();
      return true;
    }
    if (s.over) return false;
    if (key === " " || key === "p") {
      s.paused = !s.paused;
      sync();
      return true;
    }
    if (s.paused) return key.startsWith("Arrow") || key === "Enter";
    if (key === "ArrowLeft" && fits(s.board, s.cur, -1)) s.cur.x--;
    else if (key === "ArrowRight" && fits(s.board, s.cur, 1)) s.cur.x++;
    else if (key === "ArrowDown") {
      if (fits(s.board, s.cur, 0, 1)) s.cur.y++;
      else lock();
    } else if (key === "ArrowUp" || key === "Enter" || key === "y") {
      const r = rotate(s.cur.m);
      for (const kick of [0, -1, 1, -2, 2]) {
        if (fits(s.board, s.cur, kick, 0, r)) {
          s.cur.m = r;
          s.cur.x += kick;
          break;
        }
      }
    } else if (key === "x") {
      while (fits(s.board, s.cur, 0, 1)) s.cur.y++;
      lock();
    } else if (!key.startsWith("Arrow")) return false;
    draw();
    return true;
  });

  useInterval(() => {
    const s = g.current;
    if (s.over || s.paused) return;
    if (fits(s.board, s.cur, 0, 1)) s.cur.y++;
    else lock();
    draw();
  }, Math.max(90, 650 - level * 55));

  useEffect(draw);

  return (
    <div className="flex items-start gap-[2rem]">
      <div className="relative">
        <canvas ref={canvas} width={COLS * CELL} height={ROWS * CELL} className="h-[40rem] w-auto rounded-[1rem] bg-black/45 ring-1 ring-white/10" />
        {(view.over || view.paused) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[1rem] bg-black/60 text-center">
            <div className="text-[2.4rem] font-bold">{view.over ? t("Game over") : t("Paused")}</div>
            <div className="mt-[0.4rem] px-[1rem] text-[1.1rem] text-white/70">{view.over ? t("Press OK to play again") : t("Press Space to continue")}</div>
          </div>
        )}
      </div>
      <div className="w-[13rem] space-y-[1.2rem]">
        <div className="glass rounded-[1rem] p-[1rem]">
          <div className="text-[0.85rem] font-bold uppercase tracking-[0.16em] text-white/60">{t("Next")}</div>
          <div className="mt-[0.6rem] flex flex-col items-center gap-[4px]">
            {view.next.m.map((row, y) => (
              <div key={y} className="flex gap-[4px]">
                {row.map((v, x) => (
                  <div key={x} className="h-[1.5rem] w-[1.5rem] rounded-[4px]" style={{ background: v ? COLORS[view.next.c - 1] : "transparent" }} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-[1rem] p-[1rem] text-[1.1rem]">
          <div>
            {t("Lines")}: <b>{view.lines}</b>
          </div>
          <div>
            {t("Level")}: <b>{level + 1}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
