import { memo, useEffect, useState } from "react";
import { BellRing, Cctv, Plus, RefreshCw } from "lucide-react";
import { snapshot, watchCamera } from "../lib/cameras";
import { fileSrc, isTauri } from "../lib/platform";
import { useI18n } from "../lib/settings-store";

// Live pictures of every camera, refreshed every few seconds; OK watches one full screen.
function Cameras({ settings, go }) {
  const { t } = useI18n();
  const list = settings.cameras?.list || [];
  const [shots, setShots] = useState({}); // id -> { src, error }
  const doorbellCam = settings.cameras?.doorbell?.camera;

  useEffect(() => {
    if (!isTauri() || !list.length) return;
    let alive = true;
    let timer;
    const round = async () => {
      for (const cam of list) {
        if (!alive) return;
        try {
          const r = await snapshot(cam, settings);
          if (alive) setShots((s) => ({ ...s, [cam.id]: { src: `${fileSrc(r.path)}?t=${r.at}` } }));
        } catch (e) {
          if (alive) setShots((s) => ({ ...s, [cam.id]: { ...s[cam.id], error: String(e) } }));
        }
      }
      if (alive) timer = setTimeout(round, 6000);
    };
    round();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(list), settings.cameras?.haToken, settings.appUrls?.homeassistant]);

  return (
    <div className="h-full overflow-y-auto pb-[4rem] ps-[9rem] pe-[4rem] pt-[3.5rem]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[2.6rem] font-bold tracking-tight">{t("Cameras")}</h1>
          <p className="mt-[0.3rem] text-[1.15rem] text-ink-dim">{t("Pictures refresh every few seconds. Press OK to watch a camera full screen.")}</p>
        </div>
        <button data-nav onClick={() => go("settings", "cameras")} className="focus-row glass flex items-center gap-[0.6rem] rounded-full px-[1.4rem] py-[0.8rem] text-[1.05rem] font-semibold">
          <Plus className="h-[1.2rem] w-[1.2rem]" />
          {t("Add or change cameras")}
        </button>
      </div>
      {list.length === 0 ? (
        <div className="glass mt-[2rem] flex max-w-[60rem] items-start gap-[1.4rem] rounded-[1.6rem] p-[2rem]">
          <Cctv className="h-[2.6rem] w-[2.6rem] shrink-0 text-accent" />
          <div className="text-[1.15rem] leading-relaxed text-ink-dim">
            <div className="text-[1.4rem] font-bold text-ink">{t("No cameras yet")}</div>
            {t("Add a camera that has a stream address (RTSP, HLS or a picture link, usually found in its app under ONVIF / RTSP / NVR), or a camera from Home Assistant.")}
          </div>
        </div>
      ) : (
        <div className="mt-[2rem] grid grid-cols-3 gap-[1.6rem]">
          {list.map((cam, i) => {
            const shot = shots[cam.id];
            return (
              <button
                key={cam.id}
                data-nav
                data-nav-default={i === 0 || undefined}
                onClick={() => watchCamera(cam, settings).catch(() => {})}
                className="group relative aspect-video overflow-hidden rounded-[1.4rem] bg-black/40 text-start shadow-xl ring-1 ring-white/10 transition-transform focus:scale-[1.04] focus:ring-[0.22rem] focus:ring-white"
              >
                {shot?.src ? (
                  <img src={shot.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-[0.6rem] p-[1rem] text-center text-[1rem] text-ink-faint">
                    {shot?.error ? (
                      <>
                        <Cctv className="h-[2rem] w-[2rem]" />
                        {t("No picture: {error}", { error: shot.error })}
                      </>
                    ) : (
                      <RefreshCw className="h-[2rem] w-[2rem] animate-spin opacity-60" />
                    )}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-[0.6rem] bg-gradient-to-t from-black/85 to-transparent px-[1.2rem] pb-[0.8rem] pt-[2rem] text-[1.15rem] font-bold text-white">
                  {cam.name}
                  {doorbellCam === cam.id && <BellRing className="h-[1.1rem] w-[1.1rem] text-amber-300" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(Cameras);
