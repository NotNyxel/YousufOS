import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "../lib/settings-store";

// Every label, hint and option label passes through t(); text that is
// already translated (or has no translation) comes back unchanged.
const tr = (t, v) => (typeof v === "string" ? t(v) : v);

function useAdjust(ref, cb) {
  const cbRef = useRef(cb);
  useLayoutEffect(() => {
    cbRef.current = cb;
  });
  useEffect(() => {
    const el = ref.current;
    const h = (e) => {
      e.preventDefault();
      cbRef.current(e.detail);
    };
    el?.addEventListener("nav-adjust", h);
    return () => el?.removeEventListener("nav-adjust", h);
  }, [ref]);
}

function Row({ refEl, label, hint, children, onClick, adjust = false, isDefault }) {
  const { t } = useI18n();
  return (
    <div
      ref={refEl}
      data-nav
      data-adjust={adjust || undefined}
      data-nav-default={isDefault || undefined}
      tabIndex={-1}
      onClick={onClick}
      className="focus-row group flex min-h-[4.6rem] items-center justify-between gap-[2rem] rounded-[1.1rem] px-[1.5rem] py-[0.9rem]"
    >
      <div className="min-w-0">
        <div className="text-[1.25rem] font-semibold">{tr(t, label)}</div>
        {hint && <div className="dim-on-focus mt-[0.15rem] text-[0.95rem] text-ink-faint">{tr(t, hint)}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-[0.6rem]">{children}</div>
    </div>
  );
}

// Left/Right (or Enter) cycles through options.
export function OptionRow({ label, hint, value, options, onChange, isDefault }) {
  const { t } = useI18n();
  const ref = useRef();
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const step = (d) => onChange(options[(idx + d + options.length) % options.length].value);
  useAdjust(ref, step);
  return (
    <Row refEl={ref} label={label} hint={hint} adjust onClick={() => step(1)} isDefault={isDefault}>
      <ChevronLeft className="h-[1.3rem] w-[1.3rem] opacity-0 transition-opacity group-focus:opacity-60" />
      <span className="accent-on-focus min-w-[9rem] text-center text-[1.2rem] font-semibold text-accent">{tr(t, options[idx]?.label)}</span>
      <ChevronRight className="h-[1.3rem] w-[1.3rem] opacity-0 transition-opacity group-focus:opacity-60" />
      <span className="ms-[0.4rem] flex gap-[0.3rem]">
        {options.length <= 7 &&
          options.map((o, i) => (
            <span key={String(o.value)} className={`h-[0.4rem] w-[0.4rem] rounded-full ${i === idx ? "bg-current" : "bg-current opacity-25"}`} />
          ))}
      </span>
    </Row>
  );
}

export function ToggleRow({ label, hint, value, onChange, isDefault }) {
  const ref = useRef();
  useAdjust(ref, () => onChange(!value));
  return (
    <Row refEl={ref} label={label} hint={hint} adjust onClick={() => onChange(!value)} isDefault={isDefault}>
      <span className={`relative h-[2rem] w-[3.6rem] rounded-full transition-colors ${value ? "bg-accent" : "bg-current opacity-30"}`}>
        <span className={`absolute top-[0.25rem] h-[1.5rem] w-[1.5rem] rounded-full bg-white shadow transition-all ${value ? "left-[1.85rem]" : "left-[0.25rem]"}`} />
      </span>
    </Row>
  );
}

export function SliderRow({ label, hint, value, min, max, step = 1, format = (v) => v, onChange, track }) {
  const ref = useRef();
  useAdjust(ref, (d) => onChange(Math.min(max, Math.max(min, +(value + d * step).toFixed(4)))));
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <Row refEl={ref} label={label} hint={hint} adjust>
      <div dir="ltr" className="relative h-[0.5rem] w-[16rem] rounded-full bg-current/20" style={track ? { background: track } : undefined}>
        {!track && <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />}
        <div
          className="absolute top-1/2 h-[1.3rem] w-[1.3rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.2rem] border-white bg-accent shadow"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="tabular w-[4.5rem] text-right text-[1.15rem] font-semibold">{format(value)}</span>
    </Row>
  );
}

// Press once to arm, again to confirm (for power actions).
export function ActionRow({ label, hint, onAction, confirm = false, Icon, danger = false }) {
  const { t } = useI18n();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Row
      label={label}
      hint={armed ? t("Press OK again to confirm") : hint}
      onClick={() => {
        if (confirm && !armed) return setArmed(true);
        setArmed(false);
        onAction();
      }}
    >
      {Icon && <Icon className={`h-[1.6rem] w-[1.6rem] ${danger ? "text-red-400" : "accent-on-focus text-accent"}`} />}
    </Row>
  );
}

export function SectionTitle({ children }) {
  const { t } = useI18n();
  return <div className="px-[1.5rem] pb-[0.4rem] pt-[1.6rem] text-[0.9rem] font-bold uppercase tracking-[0.18em] text-ink-faint first:pt-0">{tr(t, children)}</div>;
}
