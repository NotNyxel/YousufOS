import { useState } from "react";
import { AppWindow, Layers, MonitorCog, Download, Tv } from "lucide-react";
import { ActionRow, SectionTitle } from "../components/controls";
import { android, isAndroid } from "../lib/platform";
import { useI18n } from "../lib/settings-store";

function info() {
  try {
    return JSON.parse(android().info());
  } catch {
    return {};
  }
}

// Settings → System on Android TV: permissions YousufOS needs and the TV's own settings.
export function AndroidRows() {
  const { t } = useI18n();
  const [i, setI] = useState(info);
  if (!isAndroid()) return null;
  const open = (which) => {
    android().openSettings(which);
    // The answer is known when YousufOS is back in front.
    setTimeout(() => setI(info()), 1500);
  };
  return (
    <>
      <SectionTitle>Android TV</SectionTitle>
      <ActionRow
        label="Display over other apps"
        hint={i.overlay ? t("On: YousufOS comes to the front for the Adhan, and cameras can show over other apps") : t("Off: turn it on so the Adhan can interrupt Netflix, YouTube and other apps")}
        Icon={Layers}
        onAction={() => open("overlay")}
      />
      <ActionRow
        label="Install updates"
        hint={i.installs ? t("Allowed: YousufOS can install its own updates") : t("Not allowed yet: needed to install YousufOS updates")}
        Icon={Download}
        onAction={() => open("installs")}
      />
      <ActionRow label="TV settings" hint={t("Network, picture, sound, inputs and the rest of the TV's own settings")} Icon={MonitorCog} onAction={() => open("")} />
      <ActionRow label="YousufOS app info" hint={t("Storage, permissions and notifications for YousufOS")} Icon={AppWindow} onAction={() => open("apps")} />
      <div className="flex items-start gap-[1.2rem] px-[1.5rem] py-[0.6rem] text-[1.05rem] leading-relaxed text-ink-dim">
        <Tv className="mt-[0.2rem] h-[1.8rem] w-[1.8rem] shrink-0 text-accent" />
        <div>
          <div>{t("Remote: OK select · Back back · Channel ▲ ▼ switch pages · Menu or Info: sidebar · Home: back to YousufOS")}</div>
          <div>{t("Coloured buttons: red Live TV · green Qur'an · yellow Prayer · blue Apps")}</div>
          <div>{t("In the video player: ◀ ▶ −10 s / +10 s · OK pause · ▲ ▼ or Channel ▲ ▼ change channel (Live TV) · Back close")}</div>
        </div>
      </div>
      <div className="px-[1.5rem] text-[0.95rem] text-ink-faint">
        {[i.model, i.release && `Android ${i.release}`].filter(Boolean).join(" · ")}
      </div>
    </>
  );
}
