import { useEffect, useRef, useState } from "react";
import { accentColor, useGameKeys, useInterval } from "./useGameKeys";

const W = 24, H = 14, CELL = 40;
const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

function fresh() {
  return { snake: [[8, 7], [7, 7], [6, 7]], dir: [1, 0], queue: [], food: [16, 7], over: false, paused: false, score: 0 };
}
function placeFood(snake) {
  for (;;) {
    const f = [Math.floor(Math.random() * W), Math.floor(Math.random() * H)];
    if (!snake.some(([x, y]) => x === f[0] && y === f[1])) return f;
  }
}

export default function Snake({ onScore, onOver, t }) {
  const canvas = useRef(null);
  const g = useRef(null);
  if (g.current === null) g.current = fresh();
  const [view, setView] = useState({ over: false, paused: false, score: 0 });
  const sync = () => setView({ over: g.current.over, paused: g.current.paused, score: g.current.score });

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const s = g.current;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if ((x + y) % 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    // the date to eat
    ctx.fillStyle = "#c98a3a";
    ctx.beginPath();
    ctx.ellipse(s.food[0] * CELL + CELL / 2, s.food[1] * CELL + CELL / 2, CELL * 0.28, CELL * 0.38, 0.5, 0, Math.PI * 2);
    ctx.fill();
    const accent = accentColor();
    s.snake.forEach(([x, y], i) => {
      ctx.globalAlpha = 1 - (i / s.snake.length) * 0.55;
      ctx.fillStyle = accent;
      const p = i === 0 ? 2 : 5;
      ctx.beginPath();
      ctx.roundRect(x * CELL + p, y * CELL + p, CELL - p * 2, CELL - p * 2, 10);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  };

  useGameKeys((key) => {
    const s = g.current;
    if (DIRS[key]) {
      const last = s.queue.at(-1) || s.dir;
      const d = DIRS[key];
      if (d[0] !== -last[0] || d[1] !== -last[1]) s.queue.push(d);
      return true;
    }
    if (key === "Enter" || key === " ") {
      if (s.over) {
        g.current = fresh();
        onScore(0);
      } else s.paused = !s.paused;
      sync();
      draw();
      return true;
    }
    return false;
  });

  useInterval(() => {
    const s = g.current;
    if (s.over || s.paused) return;
    if (s.queue.length) s.dir = s.queue.shift();
    const [hx, hy] = s.snake[0];
    const head = [(hx + s.dir[0] + W) % W, (hy + s.dir[1] + H) % H];
    if (s.snake.some(([x, y]) => x === head[0] && y === head[1])) {
      s.over = true;
      onOver(s.score);
      sync();
      return;
    }
    s.snake.unshift(head);
    if (head[0] === s.food[0] && head[1] === s.food[1]) {
      s.score += 1;
      onScore(s.score);
      s.food = placeFood(s.snake);
      sync();
    } else s.snake.pop();
    draw();
  }, Math.max(55, 140 - view.score * 3));

  useEffect(draw);

  return (
    <div className="relative">
      <canvas ref={canvas} width={W * CELL} height={H * CELL} className="h-[36rem] w-auto rounded-[1.2rem] bg-black/40 ring-1 ring-white/10" />
      {(view.over || view.paused) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[1.2rem] bg-black/55 text-center">
          <div className="text-[3rem] font-bold">{view.over ? t("Game over") : t("Paused")}</div>
          <div className="mt-[0.5rem] text-[1.3rem] text-white/70">{view.over ? t("Press OK to play again") : t("Press OK to continue")}</div>
        </div>
      )}
    </div>
  );
}
