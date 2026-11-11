import { useState } from "react";
import { useGameKeys } from "./useGameKeys";

const N = 4;
const empty = () => Array.from({ length: N }, () => Array(N).fill(0));
function addTile(b) {
  const free = [];
  b.forEach((r, y) => r.forEach((v, x) => !v && free.push([x, y])));
  if (!free.length) return b;
  const [x, y] = free[Math.floor(Math.random() * free.length)];
  const nb = b.map((r) => [...r]);
  nb[y][x] = Math.random() < 0.9 ? 2 : 4;
  return nb;
}
const start = () => addTile(addTile(empty()));

function slideRow(row) {
  const vals = row.filter(Boolean);
  let gained = 0;
  for (let i = 0; i < vals.length - 1; i++) {
    if (vals[i] === vals[i + 1]) {
      vals[i] *= 2;
      gained += vals[i];
      vals.splice(i + 1, 1);
    }
  }
  return [[...vals, ...Array(N - vals.length).fill(0)], gained];
}
function move(b, dir) {
  const rot = (m) => m[0].map((_, i) => m.map((r) => r[i]));
  let m = b.map((r) => [...r]);
  const flip = (mm) => mm.map((r) => [...r].reverse());
  if (dir === "up" || dir === "down") m = rot(m);
  if (dir === "right" || dir === "down") m = flip(m);
  let gained = 0;
  m = m.map((r) => {
    const [nr, g] = slideRow(r);
    gained += g;
    return nr;
  });
  if (dir === "right" || dir === "down") m = flip(m);
  if (dir === "up" || dir === "down") m = rot(m);
  return [m, gained];
}
const canMove = (b) => ["left", "right", "up", "down"].some((d) => JSON.stringify(move(b, d)[0]) !== JSON.stringify(b));

const TILE = { 2: "#3b3f4a", 4: "#4a4f5c", 8: "#c98a3a", 16: "#d9792f", 32: "#e0602f", 64: "#e8452a", 128: "#d9b45a", 256: "#e2be4f", 512: "#ebc845", 1024: "#3ecf8e", 2048: "#4ea8ff" };

export default function Game2048({ onScore, onOver, t }) {
  const [board, setBoard] = useState(start);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const DIR = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

  useGameKeys((key) => {
    if (over && key === "Enter") {
      setBoard(start());
      setScore(0);
      setOver(false);
      onScore(0);
      return true;
    }
    if (!DIR[key] || over) return !!DIR[key];
    const [nb, gained] = move(board, DIR[key]);
    if (JSON.stringify(nb) === JSON.stringify(board)) return true;
    const next = addTile(nb);
    const sc = score + gained;
    setBoard(next);
    setScore(sc);
    onScore(sc);
    if (!canMove(next)) {
      setOver(true);
      onOver(sc);
    }
    return true;
  });

  return (
    <div className="relative">
      <div className="grid grid-cols-4 gap-[0.9rem] rounded-[1.4rem] bg-black/40 p-[0.9rem] ring-1 ring-white/10">
        {board.flat().map((v, i) => (
          <div
            key={i}
            className="flex h-[8rem] w-[8rem] items-center justify-center rounded-[0.9rem] font-bold transition-colors duration-150"
            style={{ background: v ? TILE[v] || "#b07cff" : "rgba(255,255,255,0.05)", fontSize: v >= 1000 ? "2.4rem" : "3rem", color: v <= 4 ? "#e8e6e1" : "#fff" }}
          >
            {v || ""}
          </div>
        ))}
      </div>
      {over && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[1.4rem] bg-black/65 text-center">
          <div className="text-[3rem] font-bold">{t("Game over")}</div>
          <div className="mt-[0.5rem] text-[1.3rem] text-white/70">{t("Press OK to play again")}</div>
        </div>
      )}
    </div>
  );
}
