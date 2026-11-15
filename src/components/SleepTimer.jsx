// Sleep timer: the menu to set it, the one-minute warning, and the dark screen.
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, Moon } from "lucide-react";
import { focusDefault } from "../lib/nav";
import { useI18n } from "../lib/settings-store";
import { isAndroid } from "../lib/platform";

const SLEEP_ACTIONS = [
  { id: "screen", label: "Stop and turn off the screen" },
  { id: "suspend", label: "Put the laptop to sleep" },
  { id: "stop", label: "Just stop playing" },
];

export function SleepMenu({ sleep, canEnd, action, onSet, onAction, onClose }) {
  const { t } = useI18n();
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
    const onKey = (e) => {
      if (["Escape", "Backspace", "BrowserBack", "GoBack"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const opts = [
    { id: "off", label: t("Off") },
    ...[15, 30, 45, 60, 90, 120].map((m) => ({ id: m, label: t("In {n} min", { n: m }) })),
    ...(canEnd ? [{ id: "end", label: t("At the end of what's playing") }] : []),
  ];
  const current = !sleep ? "off" : sleep.end ? "end" : null;
  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[88] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass-strong w-[44rem] rounded-[1.8rem] p-[1.8rem] shadow-2xl">
        <div className="flex items-center gap-[0.8rem] text-[1.6rem] font-bold">
          <Moon className="h-[1.6rem] w-[1.6rem] text-accent" />
          {t("Sleep timer")}
        </div>
        <div className="mt-[1.2rem] grid grid-cols-3 gap-[0.7rem]">
          {opts.map((o, i) => (
            <button
              key={o.id}
              data-nav
              data-nav-default={(current ? o.id === current : i === 2) || undefined}
              onClick={() => onSet(o.id)}
              className={`focus-row flex items-center justify-center gap-[0.5rem] rounded-[1rem] px-[1rem] py-[0.9rem] text-[1.1rem] font-semibold ${o.id === current ? "bg-accent text-on-accent" : "bg-current/10"} ${o.id === "end" ? "col-span-2" : ""}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="mt-[1.4rem] text-[0.95rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">{t("Then")}</div>
        <div className="mt-[0.5rem] flex flex-col gap-[0.4rem]">
          {SLEEP_ACTIONS.filter((a) => !(a.id === "suspend" && isAndroid())).map((a) => (
            <button key={a.id} data-nav onClick={() => onAction(a.id)} className="focus-row flex items-center justify-between rounded-[1rem] px-[1.2rem] py-[0.75rem] text-start text-[1.1rem] font-semibold">
              {t(a.label)}
              {action === a.id && <Check className="h-[1.3rem] w-[1.3rem] text-accent" />}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SleepWarning({ seconds, onMore, onCancel }) {
  const { t } = useI18n();
  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
  }, []);
  return createPortal(
    <div data-nav-scope className="glass-strong fixed bottom-[3rem] start-1/2 z-[89] flex -translate-x-1/2 items-center gap-[1.4rem] rounded-[1.6rem] px-[2rem] py-[1.2rem] shadow-2xl rtl:translate-x-1/2">
      <Moon className="h-[1.8rem] w-[1.8rem] text-accent" />
      <div className="text-[1.3rem] font-semibold">{t("Going to sleep in {n} s", { n: seconds })}</div>
      <button data-nav data-nav-default onClick={onMore} className="focus-row rounded-full bg-accent px-[1.4rem] py-[0.7rem] text-[1.1rem] font-semibold text-on-accent">
        {t("15 more minutes")}
      </button>
      <button data-nav onClick={onCancel} className="focus-row rounded-full bg-current/10 px-[1.4rem] py-[0.7rem] text-[1.1rem] font-semibold">
        {t("Cancel")}
      </button>
    </div>,
    document.body,
  );
}

// Pure black (OLED-off) until any key or the mouse.
export function SleepScreen({ onWake }) {
  const wakeRef = useRef(onWake);
  useLayoutEffect(() => {
    wakeRef.current = onWake;
  });
  useEffect(() => {
    const wake = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      wakeRef.current();
    };
    const id = setTimeout(() => {
      window.addEventListener("keydown", wake, true);
      window.addEventListener("pointerdown", wake, true);
    }, 800);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", wake, true);
      window.removeEventListener("pointerdown", wake, true);
    };
  }, []);
  return createPortal(<div className="fixed inset-0 z-[99] cursor-none bg-black" />, document.body);
}
