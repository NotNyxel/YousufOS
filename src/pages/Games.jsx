import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Blocks as BlocksIcon, Brain, Grid3x3, Hash, Trophy, Worm } from "lucide-react";
import Snake from "../games/Snake";
import Blocks from "../games/Blocks";
import Game2048 from "../games/Game2048";
import Memory from "../games/Memory";
import TicTacToe from "../games/TicTacToe";
import { focusDefault } from "../lib/nav";
import { useI18n } from "../lib/settings-store";

const GAMES = [
  { id: "snake", name: "Snake", desc: "Eat the dates, don't bite your tail", Icon: Worm, C: Snake, color: "#2f9e6e",
    help: "D-pad / arrows: steer · A / OK: pause", lower: false },
  { id: "blocks", name: "Blocks", desc: "Clear lines with falling blocks", Icon: BlocksIcon, C: Blocks, color: "#5b6cff",
    help: "← →: move · ↓: drop faster · ↑ / A: rotate · X: drop · Space: pause", lower: false },
  { id: "2048", name: "2048", desc: "Slide and merge to reach 2048", Icon: Hash, C: Game2048, color: "#d9792f",
    help: "D-pad / arrows: slide the tiles", lower: false },
  { id: "memory", name: "Memory Match", desc: "Find the matching pairs", Icon: Brain, C: Memory, color: "#b0569b",
    help: "D-pad: move · A / OK: flip a card", lower: true },
  { id: "tictactoe", name: "Tic-Tac-Toe", desc: "Beat the computer", Icon: Grid3x3, C: TicTacToe, color: "#2f7de1",
    help: "D-pad: move · A / OK: place your X", lower: false },
];

function GameShell({ game, best, onBest, onExit }) {
  const { t } = useI18n();
  const [score, setScore] = useState(0);
  const exitRef = useRef(onExit);
  useLayoutEffect(() => {
    exitRef.current = onExit;
  });
  useEffect(() => {
    const onKey = (e) => {
      if (["Escape", "Backspace", "BrowserBack", "GoBack"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        exitRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const report = (s) => {
    setScore(s);
    if (!game.lower && s > (best || 0)) onBest(s);
  };
  const { C } = game;
  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[72] flex flex-col bg-[color-mix(in_srgb,var(--canvas)_88%,black)] text-white">
      <div className="flex items-center justify-between px-[4rem] pt-[2.4rem]">
        <div className="flex items-center gap-[1rem]">
          <div className="flex h-[3.6rem] w-[3.6rem] items-center justify-center rounded-[1rem]" style={{ background: game.color }}>
            <game.Icon className="h-[2rem] w-[2rem]" />
          </div>
          <div>
            <div className="text-[2rem] font-bold leading-tight">{t(game.name)}</div>
            <div className="text-[1rem] text-white/55">{t(game.help)}</div>
          </div>
        </div>
        <div className="flex items-center gap-[2rem] text-[1.3rem]">
          <div>
            {t(game.lower ? "Moves" : "Score")}: <b className="tabular">{score}</b>
          </div>
          {!game.lower && (
            <div className="flex items-center gap-[0.4rem] text-accent">
              <Trophy className="h-[1.3rem] w-[1.3rem]" /> {t("Best")}: <b className="tabular">{Math.max(best || 0, score)}</b>
            </div>
          )}
          <div className="text-[1rem] text-white/45">{t("B / Back: exit")}</div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center" dir="ltr">
        <C t={t} onScore={report} onOver={report} />
      </div>
    </div>,
    document.body,
  );
}

function Games({ settings, update, onPlayingChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(null);
  const best = settings.games?.best || {};
  const lastOpened = useRef(null);

  useEffect(() => {
    onPlayingChange?.(!!open);
    if (!open && lastOpened.current) {
      const el = document.querySelector(`[data-game="${lastOpened.current}"]`);
      requestAnimationFrame(() => (el ? el.focus() : focusDefault()));
    }
  }, [open, onPlayingChange]);
  useEffect(() => () => onPlayingChange?.(false), [onPlayingChange]);

  return (
    <div className="h-full overflow-y-auto pb-[4rem] ps-[9rem] pe-[4rem] pt-[3.5rem]">
      <h1 className="text-[2.6rem] font-bold tracking-tight">{t("Games")}</h1>
      <p className="mt-[0.3rem] text-[1.15rem] text-ink-dim">{t("Play with the remote, a keyboard or an Xbox controller.")}</p>
      <div className="mt-[2.5rem] grid grid-cols-3 gap-[1.8rem]">
        {GAMES.map((g, i) => (
          <button
            key={g.id}
            data-nav
            data-game={g.id}
            data-nav-default={i === 0 || undefined}
            onClick={() => {
              lastOpened.current = g.id;
              setOpen(g);
            }}
            className="group glass relative flex h-[13rem] flex-col justify-between overflow-hidden rounded-[1.6rem] p-[1.6rem] text-start transition-transform duration-200 focus:scale-[1.05] focus:ring-[0.22rem] focus:ring-ink"
          >
            <div className="absolute -end-[2rem] -top-[2rem] h-[10rem] w-[10rem] rounded-full opacity-40 blur-2xl" style={{ background: g.color }} />
            <div className="relative flex h-[3.8rem] w-[3.8rem] items-center justify-center rounded-[1.1rem] text-white" style={{ background: g.color }}>
              <g.Icon className="h-[2.1rem] w-[2.1rem]" />
            </div>
            <div className="relative">
              <div className="text-[1.6rem] font-bold">{t(g.name)}</div>
              <div className="text-[1.05rem] text-ink-dim">{t(g.desc)}</div>
              {!g.lower && best[g.id] > 0 && (
                <div className="mt-[0.3rem] flex items-center gap-[0.35rem] text-[0.95rem] font-semibold text-accent">
                  <Trophy className="h-[1rem] w-[1rem]" /> {t("Best")}: {best[g.id]}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
      {open && (
        <GameShell game={open} best={best[open.id]} onBest={(s) => update(`games.best.${open.id}`, s)} onExit={() => setOpen(null)} />
      )}
    </div>
  );
}

export default memo(Games);
