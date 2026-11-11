import { memo } from "react";
import HeroClock from "../components/HeroClock";
import PrayerWidget from "../components/PrayerWidget";
import AppTile from "../components/AppTile";
import HadithCard from "../components/HadithCard";
import QuranCard from "../components/QuranCard";
import FocusApps from "../components/FocusApps";
import Weather from "../components/Weather";
import JellyfinHomeRow from "../jellyfin/HomeRow";
import { useI18n } from "../lib/settings-store";

function Home({ now, settings, schedule, apps, wallpaper, onLaunch, go, eid, onJellyfin }) {
  const { t } = useI18n();
  // Three switches in Settings → Home Screen (older configs used homeLayout).
  const showApps = settings.showApps ?? settings.homeLayout !== "quran";
  const showQuran = settings.showQuran ?? settings.homeLayout !== "row";
  const focus = showApps && showQuran;
  const quranOnly = !showApps && showQuran;
  const hadithOnly = !showApps && !showQuran;
  const pinned = apps.filter((a) => a.pinned).slice(0, 6);
  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-start justify-between ps-[9rem] pe-[3.5rem] pt-[2.6rem]">
        <div className="pt-[0.6rem]">
          {eid && (
            <div className="fade-up mb-[1rem] inline-flex items-center gap-[0.8rem] rounded-full bg-accent px-[1.3rem] py-[0.5rem] text-on-accent shadow-xl">
              <span className="arabic text-[1.3rem] font-bold">عيد مبارك</span>
              <span className="text-[1rem] font-semibold">{t(`${eid} Mubarak`)}</span>
            </div>
          )}
          {wallpaper && (
            <div key={wallpaper.title} className="fade-up">
              <div className="text-[0.85rem] font-semibold uppercase tracking-[0.22em] text-ink-faint">{t("Now showing")}</div>
              <div className="mt-[0.2rem] max-w-[34rem] truncate text-[1.15rem] font-medium text-ink-dim">{wallpaper.title}</div>
              {wallpaper.credit && <div className="mt-[0.15rem] max-w-[34rem] truncate text-[0.8rem] text-ink-faint">{t("Photo: {credit}", { credit: wallpaper.credit })}</div>}
            </div>
          )}
        </div>
        <PrayerWidget schedule={schedule} now={now} clock24={settings.clock24} onOpen={() => go("prayer")} />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-[0.9rem] pb-[2rem] ps-[6.5rem]">
        <HeroClock now={now} settings={settings} />
        {settings.showWeather !== false && <Weather lat={settings.location.lat} lng={settings.location.lng} />}
      </div>

      {onJellyfin && <JellyfinHomeRow settings={settings} onOpen={onJellyfin} />}

      {hadithOnly ? (
        <div className="flex justify-end pb-[4.2rem] ps-[9rem] pe-[3.5rem]">{settings.showHadith && <HadithCard now={now} compact />}</div>
      ) : quranOnly ? (
        <div className="flex items-stretch gap-[1.6rem] pb-[4.2rem] ps-[9rem] pe-[3.5rem]">
          <QuranCard now={now} wide className="flex-1" />
          {settings.showHadith && <HadithCard now={now} compact />}
        </div>
      ) : focus ? (
        <div className="flex items-end gap-[1.6rem] pb-[1.6rem] ps-[8.5rem] pe-[3.5rem]">
          <div className="mb-[0.2rem] shrink-0">
            <FocusApps apps={apps} onLaunch={onLaunch} />
          </div>
          <QuranCard now={now} className="mb-[2.6rem] flex-1" />
          {settings.showHadith && (
            <div className="mb-[2.6rem] shrink-0">
              <HadithCard now={now} compact />
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-end justify-between gap-[2rem] pb-[1.6rem] ps-[9rem] pe-[3.5rem]">
          <section>
            <div className="mb-[1rem] text-[1.1rem] font-semibold text-ink-dim">{t("Your apps")}</div>
            <div className="flex gap-[1.5rem]">
              {pinned.map((app, i) => (
                <AppTile key={app.id} app={app} onLaunch={onLaunch} isDefault={i === 0} />
              ))}
            </div>
          </section>
          {settings.showHadith && (
            <div className="mb-[2.6rem]">
              <HadithCard now={now} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(Home);
