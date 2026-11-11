import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { logoOf, logoClass } from "../lib/apps";
import { fileSrc } from "../lib/platform";

function Arrow({ onClick, Icon, disabled }) {
  return (
    <button
      tabIndex={-1}
      onClick={onClick}
      className={`glass flex h-[3.6rem] w-[3.6rem] shrink-0 items-center justify-center rounded-full text-ink transition-opacity ${disabled ? "opacity-25" : "opacity-90 hover:opacity-100"}`}
    >
      <Icon className="h-[1.8rem] w-[1.8rem]" strokeWidth={2.2} />
    </button>
  );
}

// One large app card. Left/Right switch apps; at the first/last app the
// arrow keys move focus on as normal.
export default function FocusApps({ apps, onLaunch }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const ref = useRef(null);
  const state = useRef({ index, n: apps.length });
  useLayoutEffect(() => {
    state.current = { index, n: apps.length };
  });

  const go = (d) => {
    const { index: i, n } = state.current;
    const next = i + d;
    if (next < 0 || next >= n) return false;
    setDir(d);
    setIndex(next);
    return true;
  };

  useEffect(() => {
    const el = ref.current;
    const h = (e) => {
      if (go(e.detail)) e.preventDefault();
    };
    el.addEventListener("nav-adjust", h);
    return () => el.removeEventListener("nav-adjust", h);
  }, []);

  const app = apps[Math.min(index, apps.length - 1)];
  const logo = app.icon ? fileSrc(app.icon) : logoOf(app);

  return (
    <div className="flex flex-col items-center" dir="ltr">
      <div className="flex items-center gap-[1rem]">
        <Arrow onClick={() => go(-1)} Icon={ChevronLeft} disabled={index === 0} />
        <button
          ref={ref}
          data-nav
          data-adjust
          data-nav-default
          onClick={() => onLaunch(app)}
          className="relative flex aspect-video w-[23rem] items-center justify-center overflow-hidden rounded-[1.3rem] shadow-[0_1rem_2.5rem_rgb(0_0_0/0.4)] ring-1 ring-white/10 transition-[transform,box-shadow] duration-200 focus:scale-[1.05] focus:shadow-[0_1.5rem_3.5rem_rgb(0_0_0/0.55)] focus:ring-[0.22rem] focus:ring-white"
          style={{ background: app.bg || "#1b1d24", transition: "background 400ms ease, transform 200ms, box-shadow 200ms" }}
        >
          <div key={app.id} className="flex h-full w-full items-center justify-center" style={{ animation: `${dir > 0 ? "slide-in-r" : "slide-in-l"} 320ms cubic-bezier(.2,.7,.2,1) both` }}>
            {logo ? (
              <img src={logo} alt={app.name} draggable={false} className={`pointer-events-none object-contain ${logoClass(app)}`} />
            ) : (
              <span className="px-[1rem] text-center text-[2.2rem] font-extrabold tracking-tight text-white">{app.wordmark || app.name}</span>
            )}
          </div>
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-60" />
        </button>
        <Arrow onClick={() => go(1)} Icon={ChevronRight} disabled={index === apps.length - 1} />
      </div>
      <div className="mt-[0.9rem] flex items-center gap-[0.8rem]">
        <span className="text-[1.1rem] font-semibold text-ink">{app.name}</span>
        {apps.length <= 10 ? (
          <span className="flex gap-[0.35rem]">
            {apps.map((a, i) => (
              <span key={a.id} className={`h-[0.45rem] rounded-full transition-all duration-300 ${i === index ? "w-[1.3rem] bg-accent" : "w-[0.45rem] bg-ink/30"}`} />
            ))}
          </span>
        ) : (
          <span className="tabular text-[1rem] text-ink-faint" dir="ltr">
            {index + 1} / {apps.length}
          </span>
        )}
      </div>
    </div>
  );
}
