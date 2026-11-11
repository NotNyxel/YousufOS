import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { COUNTRIES } from "../lib/locations";
import { focusDefault, focusEl } from "../lib/nav";
import { useI18n } from "../lib/settings-store";

// Every country and territory in one list. A letter row on top jumps through
// the alphabet so the remote doesn't need 200 presses.
export default function CountryPicker({ value, onPick, onClose }) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const list = useMemo(() => {
    const named = COUNTRIES.map((c) => ({ ...c, label: (ar && c.ar) || c.short || c.name }));
    return named.sort((a, b) => a.label.localeCompare(b.label, ar ? "ar" : "en"));
  }, [ar]);
  const letters = useMemo(() => [...new Set(list.map((c) => c.label[0].toUpperCase()))], [list]);

  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault());
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "BrowserBack" || e.key === "GoBack") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      } else if (e.isTrusted && e.key.length === 1 && /\p{L}/u.test(e.key)) {
        // Typing a letter on a real keyboard jumps to it.
        const first = document.querySelector(`[data-country-first="${e.key.toUpperCase()}"]`);
        if (first) focusEl(first);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const seen = new Set();
  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[96] flex items-center justify-center bg-black/70 fade-up">
      <div className="glass-strong flex h-[88vh] w-[84rem] flex-col rounded-[2rem] p-[1.8rem] shadow-2xl">
        <div className="text-[1.7rem] font-bold">{t("Choose your country")}</div>
        <div className="mt-[1rem] flex flex-wrap gap-[0.4rem]">
          {letters.map((l) => (
            <button
              key={l}
              data-nav
              onClick={() => focusEl(document.querySelector(`[data-country-first="${l}"]`))}
              className="focus-row flex h-[2.6rem] min-w-[2.6rem] items-center justify-center rounded-[0.7rem] bg-ink/10 px-[0.6rem] text-[1.1rem] font-bold"
            >
              {l}
            </button>
          ))}
        </div>
        <div className="mt-[1.2rem] min-h-0 flex-1 overflow-y-auto px-[0.4rem] pb-[0.6rem] pt-[0.2rem]">
          <div className="grid grid-cols-4 gap-[0.6rem]">
            {list.map((c) => {
              const l = c.label[0].toUpperCase();
              const first = !seen.has(l);
              seen.add(l);
              const active = c.code === value;
              return (
                <button
                  key={c.code}
                  data-nav
                  data-nav-default={active || undefined}
                  data-country-first={first ? l : undefined}
                  onClick={() => onPick(c)}
                  className={`focus-row flex items-center justify-between gap-[0.6rem] rounded-[0.9rem] px-[1.1rem] py-[0.8rem] text-start text-[1.1rem] font-semibold ${active ? "bg-accent/20 text-accent" : "bg-ink/5"}`}
                >
                  <span className="truncate">{c.label}</span>
                  {active && <Check className="h-[1.2rem] w-[1.2rem] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
