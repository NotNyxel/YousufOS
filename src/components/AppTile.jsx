import { logoClass, logoOf } from "../lib/apps";
import { useI18n } from "../lib/settings-store";
import { fileSrc } from "../lib/platform";

// OK opens the app; Y (controller) / long OK alternative: open it in Chrome.
export default function AppTile({ app, onLaunch, size = "md", isDefault = false }) {
  const { t } = useI18n();
  const logo = app.icon ? fileSrc(app.icon) : logoOf(app);
  const w = size === "grid" ? "w-full" : size === "lg" ? "w-[19rem]" : "w-[16.5rem]";
  return (
    <div className={`${w} shrink-0`}>
      <button
        data-nav
        data-nav-default={isDefault || undefined}
        data-app-id={app.id}
        onClick={() => onLaunch(app)}
        onKeyDown={(e) => {
          if (e.key === "y" || e.key === "Y") {
            e.preventDefault();
            onLaunch(app, { chrome: true });
          }
        }}
        className="peer relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[1.1rem] shadow-[0_0.75rem_2rem_rgb(0_0_0/0.35)] ring-1 ring-white/10 transition-[transform,box-shadow] duration-200 ease-out focus:z-10 focus:scale-[1.09] focus:shadow-[0_1.5rem_3.5rem_rgb(0_0_0/0.55)] focus:ring-[0.22rem] focus:ring-white"
        style={{ background: app.bg || "#1b1d24" }}
      >
        {logo ? (
          <img
            src={logo}
            alt={app.name}
            draggable={false}
            className={`pointer-events-none object-contain ${logoClass(app)}`}
          />
        ) : (
          <span className="px-[1rem] text-center text-[1.9rem] font-extrabold tracking-tight text-white">
            {app.wordmark || app.name}
          </span>
        )}
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-60" />
      </button>
      <div className="mt-[0.9rem] text-center text-[1.05rem] font-semibold text-ink opacity-0 transition-opacity duration-200 peer-focus:opacity-100">
        {app.name}
        {app.desc && <div className="mt-[0.15rem] line-clamp-2 text-[0.85rem] font-medium text-ink-faint">{t(app.desc)}</div>}
      </div>
    </div>
  );
}
