import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Delete } from "lucide-react";
import { focusDefault } from "../lib/nav";
import { listen } from "../lib/platform";
import { useI18n } from "../lib/settings-store";

// Type with the remote / controller: an on-screen keyboard for short text
// such as a server address. A real keyboard works too.
const ROWS = ["1234567890", "qwertyuiop", "asdfghjkl:", "zxcvbnm./-"];
// layout="text": names, passwords, searches (Shift and symbols).
const TEXT_ROWS = ["1234567890", "qwertyuiop", "asdfghjkl'", "zxcvbnm,.-"];
const SYMBOL_ROWS = ["!@#$%^&*()", "-_+=?/\\|~`", "[]{}<>;:\"'", "€£¥¢§°•…¿¡"];

export default function TextEntry({ title, hint, value, port, onSave, onClose, layout, secret = false, saveLabel }) {
  const { t } = useI18n();
  // The current address starts selected (like a text box): the first key replaces it.
  const [st, setSt] = useState({ text: value || "", selected: !!value });
  const { text, selected } = st;
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const [reveal, setReveal] = useState(false);
  const full = layout === "text";
  const rows = full ? (symbols ? SYMBOL_ROWS : TEXT_ROWS) : ROWS;
  const shown = secret && !reveal ? "•".repeat(text.length) : text;
  const setText = (fn) => setSt((s) => ({ text: typeof fn === "function" ? fn(s.selected ? "" : s.text) : fn, selected: false }));
  const ref = useRef({});
  useLayoutEffect(() => {
    ref.current = { text, onSave, onClose, setText };
  });

  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault());
    let typed = false;
    const onKey = (e) => {
      const { text: cur, onSave: save, onClose: close, setText: edit } = ref.current;
      if (e.key === "Escape" || e.key === "BrowserBack" || e.key === "GoBack") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      } else if (e.isTrusted && e.key === "Backspace") {
        e.preventDefault();
        e.stopImmediatePropagation();
        edit((v) => v.slice(0, -1));
      } else if (e.isTrusted && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key !== " " || typed)) {
        // Any key on a real keyboard (TV or PC) types; space too, once typing has started.
        e.preventDefault();
        e.stopImmediatePropagation();
        typed = true;
        edit((v) => v + e.key);
      } else if (e.isTrusted && e.key === "Enter" && typed) {
        // Typing on a real keyboard: Enter saves. (With a remote, OK presses the focused key.)
        e.preventDefault();
        e.stopImmediatePropagation();
        save(cur);
      }
    };
    window.addEventListener("keydown", onKey, true);
    // Typed on the phone remote.
    const off = listen("remote-text", (txt) => ref.current.setText((v) => v + txt));
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey, true);
      off.then((f) => f());
    };
  }, []);

  const key = (label, onClick, extra = "", isDefault = false) => (
    <button
      key={label + extra}
      data-nav
      data-nav-default={isDefault || undefined}
      onClick={onClick}
      className={`focus-row flex h-[3.6rem] items-center justify-center rounded-[0.9rem] text-[1.35rem] font-semibold ${/\bbg-/.test(extra) ? "" : "bg-ink/10"} ${extra}`}
    >
      {label}
    </button>
  );

  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[96] flex items-center justify-center bg-black/70 fade-up" dir="ltr">
      <div className="glass-strong w-[64rem] rounded-[2rem] p-[2rem] shadow-2xl">
        <div className="text-[1.6rem] font-bold">{title}</div>
        {hint && <div className="mt-[0.3rem] text-[1.05rem] text-ink-dim">{hint}</div>}
        <div className="tabular mt-[1.2rem] flex h-[3.8rem] items-center rounded-[1rem] bg-black/35 px-[1.3rem] text-[1.5rem]">
          <span className={`truncate ${selected ? "rounded-[0.3rem] bg-accent/35" : ""}`}>{shown}</span>
          <span className="ms-[0.1rem] h-[1.8rem] w-[0.15rem] animate-pulse bg-accent" />
        </div>
        <div className="mt-[1.2rem] space-y-[0.6rem]">
          {rows.map((row, r) => (
            <div key={row} className="grid grid-cols-10 gap-[0.6rem]">
              {[...row].map((ch, c) => {
                const out = shift && !symbols ? ch.toUpperCase() : ch;
                return key(out, () => {
                  setText((v) => v + out);
                  if (shift) setShift(false);
                }, "", r === 0 && c === 0);
              })}
            </div>
          ))}
          {full ? (
            <div className="grid grid-cols-10 gap-[0.6rem]">
              {key("⇧", () => setShift((v) => !v), `col-span-1 ${shift ? "bg-accent text-on-accent" : ""}`)}
              {key(symbols ? "abc" : "#+=", () => setSymbols((v) => !v), "col-span-1 text-[1.05rem]")}
              {key(t("Space"), () => setText((v) => v + " "), "col-span-3 text-[1.05rem]")}
              {secret
                ? key(reveal ? t("Hide") : t("Show"), () => setReveal((v) => !v), "col-span-1 text-[1rem]")
                : key("@", () => setText((v) => v + "@"), "col-span-1")}
              {key(<Delete className="h-[1.5rem] w-[1.5rem]" />, () => setText((v) => v.slice(0, -1)), "col-span-1")}
              {key(t("Clear"), () => setText(""), "col-span-1 text-[1rem]")}
              {key(saveLabel || t("Save"), () => onSave(text), "col-span-2 bg-accent text-on-accent text-[1.05rem]")}
            </div>
          ) : (
          <div className="grid grid-cols-10 gap-[0.6rem]">
            {key("http://", () => setText((v) => (v.startsWith("http") ? v : "http://" + v)), "col-span-2 text-[1.05rem]")}
            {port ? key(`:${port}`, () => setText((v) => v + ":" + port), "col-span-2 text-[1.05rem]") : key("https://", () => setText((v) => (v.startsWith("http") ? v : "https://" + v)), "col-span-2 text-[1.05rem]")}
            {key(<Delete className="h-[1.5rem] w-[1.5rem]" />, () => setText((v) => v.slice(0, -1)), "col-span-2")}
            {key(t("Clear"), () => setText(""), "col-span-2 text-[1.05rem]")}
            {key(t("Save"), () => onSave(text), "col-span-2 bg-accent text-on-accent text-[1.05rem]")}
          </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
