import { useEffect, useState } from "react";
import { Coffee, Feather, Gem, Moon, Ship, Star, Sun, Tent, TreePalm } from "lucide-react";
import { useGameKeys } from "./useGameKeys";

const ICONS = [Moon, Star, Sun, TreePalm, Tent, Ship, Coffee, Gem, Feather];
const COLS = 6, ROWS = 3; // 9 pairs

function deal() {
  const ids = [...Array(9).keys()].flatMap((i) => [i, i]);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.map((id) => ({ id, open: false, done: false }));
}

export default function Memory({ onScore, onOver, t }) {
  const [cards, setCards] = useState(deal);
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState([]);
  const [moves, setMoves] = useState(0);
  const won = cards.every((c) => c.done);

  useEffect(() => {
    if (picked.length !== 2) return;
    const [a, b] = picked;
    const match = cards[a].id === cards[b].id;
    const id = setTimeout(() => {
      setCards((cs) => cs.map((c, i) => (i === a || i === b ? { ...c, open: match, done: match } : c)));
      setPicked([]);
    }, match ? 350 : 900);
    return () => clearTimeout(id);
  }, [picked, cards]);

  useEffect(() => {
    if (won) onOver(Math.max(0, 200 - moves * 5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  useGameKeys((key) => {
    const x = cursor % COLS, y = Math.floor(cursor / COLS);
    if (key === "ArrowLeft") setCursor(y * COLS + ((x + COLS - 1) % COLS));
    else if (key === "ArrowRight") setCursor(y * COLS + ((x + 1) % COLS));
    else if (key === "ArrowUp") setCursor(((y + ROWS - 1) % ROWS) * COLS + x);
    else if (key === "ArrowDown") setCursor(((y + 1) % ROWS) * COLS + x);
    else if (key === "Enter") {
      if (won) {
        setCards(deal());
        setMoves(0);
        onScore(0);
        return true;
      }
      const c = cards[cursor];
      if (c.open || picked.length >= 2) return true;
      setCards((cs) => cs.map((cc, i) => (i === cursor ? { ...cc, open: true } : cc)));
      const p = [...picked, cursor];
      setPicked(p);
      if (p.length === 2) {
        setMoves((m) => m + 1);
        onScore(moves + 1);
      }
    } else return false;
    return true;
  });

  return (
    <div className="relative">
      <div className="grid grid-cols-6 gap-[1rem]">
        {cards.map((c, i) => {
          const Icon = ICONS[c.id];
          return (
            <div
              key={i}
              className={`flex h-[9.5rem] w-[9.5rem] items-center justify-center rounded-[1.1rem] transition-all duration-300 ${
                c.open ? (c.done ? "bg-accent/30 text-accent" : "bg-white/90 text-black") : "bg-white/8 text-transparent"
              } ${i === cursor ? "scale-[1.08] ring-[0.22rem] ring-white" : "ring-1 ring-white/10"}`}
              style={{ transform: `${i === cursor ? "scale(1.08) " : ""}rotateY(${c.open ? 0 : 180}deg)` }}
            >
              {c.open ? <Icon className="h-[4.2rem] w-[4.2rem]" strokeWidth={1.6} /> : <span className="text-[2.6rem] text-white/30">✦</span>}
            </div>
          );
        })}
      </div>
      {won && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[1.4rem] bg-black/65 text-center">
          <div className="text-[3rem] font-bold">{t("Well done!")}</div>
          <div className="mt-[0.5rem] text-[1.3rem] text-white/70">{t("{n} moves · Press OK to play again", { n: moves })}</div>
        </div>
      )}
    </div>
  );
}
