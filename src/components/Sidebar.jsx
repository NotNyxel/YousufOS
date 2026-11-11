import { memo } from "react";
import { BookOpenText, Cctv, Gamepad2, House, LayoutGrid, Lock, MoonStar, Newspaper, Search, Settings, Tv } from "lucide-react";
import { LogoMark, MosqueIcon } from "./icons";
import { useI18n } from "../lib/settings-store";

const MAIN = [
  { id: "search", label: "Search", Icon: Search },
  { id: "home", label: "Home", Icon: House },
  { id: "livetv", label: "Live TV", Icon: Tv },
  { id: "apps", label: "Apps", Icon: LayoutGrid },
  { id: "games", label: "Games", Icon: Gamepad2 },
  { id: "prayer", label: "Prayer", Icon: MosqueIcon },
  { id: "quran", label: "Qur'an", Icon: BookOpenText },
  { id: "cameras", label: "Cameras", Icon: Cctv },
  { id: "news", label: "News", Icon: Newspaper },
];
// Future: Media (Jellyfin), Smart Home (Home Assistant), Cameras.

// Focusing an entry previews its page after a short pause (so moving through
// the list stays smooth); OK / Right opens it straight away.
function Item({ id, label, Icon, active, onPreview, onChoose }) {
  return (
    <button
      data-nav
      data-page={id}
      data-active={active || undefined}
      onFocus={() => onPreview(id)}
      onClick={() => onChoose(id)}
      className={`focus-row pointer-events-auto relative flex h-[3.5rem] w-[4.3rem] items-center gap-[1.1rem] overflow-hidden rounded-full ps-[1.35rem] pe-[1.4rem] text-start group-focus-within/side:w-full ${
        active ? "bg-accent/20 text-accent" : "text-ink-dim"
      }`}
    >
      <Icon className="h-[1.6rem] w-[1.6rem] shrink-0" strokeWidth={1.9} />
      <span className="side-label whitespace-nowrap text-[1.2rem] font-semibold">{label}</span>
    </button>
  );
}

// Collapsed icon rail that expands while it has focus (Google TV style).
function Sidebar({ page, onPreview, onChoose, now, nextPrayer, clock, kids, onExitKids, sleepLabel, onSleep }) {
  const { t } = useI18n();
  return (
    <nav
      data-sidebar
      data-nav-trap="y"
      className="group/side pointer-events-none fixed start-0 top-0 z-30 flex h-full w-[19.5rem] flex-col items-stretch px-[1.05rem] py-[2.2rem]"
    >
      {/* soft edge so the icons read on bright photos */}
      <div className="absolute inset-y-0 start-0 -z-20 w-[9rem] bg-gradient-to-r from-black/35 to-transparent rtl:bg-gradient-to-l" />
      <div className="fixed inset-0 -z-10 bg-black/45 opacity-0 transition-opacity duration-200 group-focus-within/side:opacity-100" />
      <div className="side-panel blur-panel absolute inset-y-[0.9rem] start-[0.9rem] end-[0.35rem] rounded-[1.8rem] border border-line bg-[color-mix(in_srgb,var(--canvas)_93%,transparent)] shadow-2xl" />

      <div className="relative flex h-[3rem] items-center gap-[0.9rem] ps-[1.05rem] text-accent">
        <LogoMark className="h-[2.4rem] w-[2.4rem] shrink-0" />
        <div className="side-label">
          <div className="whitespace-nowrap text-[1.4rem] font-bold leading-tight tracking-tight text-ink">
            Yousuf<span className="font-light text-ink-dim">OS</span>
          </div>
          <div className="tabular whitespace-nowrap text-[0.95rem] text-ink-faint">{clock}</div>
        </div>
      </div>

      <div className="relative my-auto flex flex-col gap-[0.45rem]">
        {MAIN.filter((p) => !kids || kids.includes(p.id)).map((p) => (
          <Item key={p.id} {...p} label={t(p.label)} active={page === p.id} onPreview={onPreview} onChoose={onChoose} />
        ))}
      </div>

      <div className="relative flex flex-col gap-[0.6rem]">
        <div className="side-label mx-[0.9rem] h-px bg-line" />
        <Item id="sleep" label={sleepLabel ? `${t("Sleep timer")} · ${sleepLabel}` : t("Sleep timer")} Icon={MoonStar} active={!!sleepLabel} onPreview={() => {}} onChoose={onSleep} />
        {kids ? (
          <Item id="exitkids" label={t("Leave Kids profile")} Icon={Lock} active={false} onPreview={() => {}} onChoose={onExitKids} />
        ) : (
          <Item id="settings" label={t("Settings")} Icon={Settings} active={page === "settings"} onPreview={onPreview} onChoose={onChoose} />
        )}
        {nextPrayer && (
          <div className="side-label ps-[1.1rem] pt-[0.4rem]">
            <div className="whitespace-nowrap text-[0.85rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">{t("Next prayer")}</div>
            <div className="whitespace-nowrap text-[1.1rem] font-semibold text-ink">
              {nextPrayer} <span className="text-accent">· {now}</span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

export default memo(Sidebar);
