import { logoOf } from "../lib/apps";
import { fileSrc } from "../lib/platform";
import { useI18n } from "../lib/settings-store";

export default function LaunchSplash({ app }) {
  const { t } = useI18n();
  const logo = app.logoUrl || (app.icon ? fileSrc(app.icon) : logoOf(app));
  return (
    <div data-nav-scope className="fixed inset-0 z-[70] flex flex-col items-center justify-center" style={{ background: app.bg || "#000", animation: "fade-up 300ms ease both" }}>
      {logo ? (
        <img src={logo} alt="" className={app.wordmark ? (app.id === "shahid" ? "h-[8rem]" : "max-h-[8rem] max-w-[34rem]") : app.logoUrl ? "max-h-[9rem] max-w-[30rem] object-contain" : "h-[11rem] rounded-[2.4rem]"} />
      ) : (
        <div className="text-[5rem] font-extrabold text-white">{app.wordmark || app.name}</div>
      )}
      <div className="mt-[3rem] h-[0.3rem] w-[10rem] overflow-hidden rounded-full bg-white/15">
        <div className="h-full w-1/3 rounded-full bg-white/80" style={{ animation: "ticker 1.2s ease-in-out infinite alternate" }} />
      </div>
      <div className="mt-[1.2rem] text-[1.1rem] text-white/60">{t("Opening {name}…", { name: app.name })}</div>
    </div>
  );
}
