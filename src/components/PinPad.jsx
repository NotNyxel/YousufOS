// A number pad for the remote: the parent PIN for the Kids profile.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Delete, Lock } from "lucide-react";
import { focusDefault } from "../lib/nav";
import { useI18n } from "../lib/settings-store";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "ok"];

// onSubmit(pin) returns true when accepted, false to shake and try again.
export default function PinPad({ title, hint, length = 4, onSubmit, onCancel, z = 95 }) {
  const { t } = useI18n();
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const cancelRef = useRef(onCancel);
  useLayoutEffect(() => {
    cancelRef.current = onCancel;
  });
  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
  }, []);
  const submit = async (value) => {
    const ok = await onSubmit(value);
    if (!ok) {
      setWrong(true);
      setPin("");
      setTimeout(() => setWrong(false), 900);
    }
  };
  const press = (k) => {
    if (k === "back") return setPin((p) => p.slice(0, -1));
    if (k === "ok") return pin.length === length && submit(pin);
    if (pin.length >= length) return;
    const next = pin + k;
    setPin(next);
    if (next.length === length) setTimeout(() => submit(next), 150);
  };
  // Number keys on a keyboard or remote work too; Back cancels.
  useEffect(() => {
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        press(e.key);
      } else if (e.isTrusted && e.key === "Backspace" && pin) {
        // A keyboard's Backspace deletes the last digit (Back on the remote still cancels).
        e.preventDefault();
        e.stopImmediatePropagation();
        press("back");
      } else if (e.isTrusted && e.key === "Enter" && pin.length === length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        press("ok");
      } else if (["Escape", "Backspace", "BrowserBack", "GoBack"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancelRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  return createPortal(
    <div data-nav-scope className="fixed inset-0 flex items-center justify-center bg-black/70" style={{ zIndex: z }}>
      <div className="glass-strong w-[30rem] rounded-[2rem] p-[2.2rem] text-center shadow-2xl">
        <Lock className="mx-auto h-[2.2rem] w-[2.2rem] text-accent" />
        <div className="mt-[0.8rem] text-[1.6rem] font-bold">{title}</div>
        {hint && <div className="mt-[0.3rem] text-[1rem] text-ink-dim">{hint}</div>}
        <div className={`mt-[1.4rem] flex justify-center gap-[0.9rem] ${wrong ? "animate-[shake_0.4s]" : ""}`}>
          {Array.from({ length }, (_, i) => (
            <span key={i} className={`h-[1.1rem] w-[1.1rem] rounded-full ${i < pin.length ? "bg-accent" : "bg-current/25"} ${wrong ? "bg-red-500" : ""}`} />
          ))}
        </div>
        <div className="h-[1.6rem] pt-[0.4rem] text-[0.95rem] text-red-400">{wrong ? t("Wrong PIN") : ""}</div>
        <div dir="ltr" className="mt-[0.6rem] grid grid-cols-3 gap-[0.8rem]">
          {KEYS.map((k) => (
            <button
              key={k}
              data-nav
              data-nav-default={k === "1" || undefined}
              onClick={() => press(k)}
              className={`focus-row flex h-[4rem] items-center justify-center rounded-[1.1rem] text-[1.6rem] font-semibold ${k === "ok" ? "bg-accent text-on-accent" : "bg-current/10"}`}
            >
              {k === "back" ? <Delete className="h-[1.5rem] w-[1.5rem]" /> : k === "ok" ? t("OK") : k}
            </button>
          ))}
        </div>
        {onCancel && (
          <button data-nav onClick={onCancel} className="focus-row mt-[1rem] rounded-full px-[1.4rem] py-[0.6rem] text-[1.05rem] text-ink-dim">
            {t("Cancel")}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
