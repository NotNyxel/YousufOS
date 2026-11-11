import { memo } from "react";
import AppTile from "../components/AppTile";
import { CATEGORIES } from "../lib/apps";
import { useI18n } from "../lib/settings-store";

function Apps({ apps, onLaunch }) {
  const { t } = useI18n();
  const groups = CATEGORIES.map((c) => ({ ...c, apps: apps.filter((a) => (a.cat || "streaming") === c.id) })).filter((g) => g.apps.length);
  const firstId = groups[0]?.apps[0]?.id;
  return (
    <div className="h-full overflow-y-auto pb-[4rem] ps-[9rem] pe-[4rem] pt-[3.5rem]">
      <h1 className="text-[2.6rem] font-bold tracking-tight">{t("Apps")}</h1>
      <p className="mt-[0.3rem] text-[1.15rem] text-ink-dim">{t("Apps open inside YousufOS. Protected services (Netflix, Shahid…) open in Chrome. Press Y on the controller to open any app in Chrome.")}</p>
      {groups.map((g) => (
        <section key={g.id} className="mt-[2.2rem]">
          <h2 className="mb-[1rem] text-[1.15rem] font-semibold uppercase tracking-[0.14em] text-accent">{t(g.label)}</h2>
          <div className="grid grid-cols-5 gap-x-[1.6rem] gap-y-[1.4rem]">
            {g.apps.map((app) => (
              <AppTile key={app.id} app={app} onLaunch={onLaunch} size="grid" isDefault={app.id === firstId} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default memo(Apps);
