import { useEffect, useLayoutEffect, useRef } from "react";
import { localAudioUrl, playableUrl } from "../lib/platform";
import { useI18n } from "../lib/settings-store";

async function takbirUrl() {
  try {
    return await localAudioUrl("~/Music/Adhan/takbir.mp3");
  } catch {
    return playableUrl("/adhan/takbir.mp3");
  }
}

// Gentle banner at the top of the screen. kind: "istighfar" | "takbir"
export default function ReminderBanner({ reminder, volume, onDone }) {
  const { t } = useI18n();
  const doneRef = useRef(onDone);
  useLayoutEffect(() => {
    doneRef.current = onDone;
  });
  const takbir = reminder.kind === "takbir";

  useEffect(() => {
    let audio;
    let url;
    let timer = setTimeout(() => doneRef.current(), takbir ? 20000 : 11000);
    if (takbir && reminder.sound) {
      takbirUrl().then((u) => {
        url = u;
        audio = new Audio(u);
        audio.volume = volume;
        audio.onended = () => {
          clearTimeout(timer);
          timer = setTimeout(() => doneRef.current(), 2500);
        };
        audio.play().then(() => {
          clearTimeout(timer); // stay up while the takbir plays
          timer = setTimeout(() => doneRef.current(), 180000);
        }, () => {});
      });
    }
    return () => {
      clearTimeout(timer);
      audio?.pause();
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [takbir, reminder.sound, volume]);

  return (
    <div
      className="glass-strong fixed start-1/2 top-[2.2rem] z-[85] flex max-w-[64rem] items-center gap-[1.6rem] rounded-[1.6rem] px-[2.2rem] py-[1.2rem] shadow-[0_1.5rem_4rem_rgb(0_0_0/0.5)]"
      style={{ animation: "banner-in 700ms cubic-bezier(.2,.7,.2,1) both" }}
    >
      <div className="breathe h-[0.7rem] w-[0.7rem] shrink-0 rounded-full bg-accent" />
      <div className="min-w-0">
        {takbir && <div className="text-[0.85rem] font-bold uppercase tracking-[0.18em] text-accent">{t("Takbir")} · {t(reminder.eid)}</div>}
        <div className={`quran leading-[1.6] text-ink ${takbir ? "text-[2.2rem]" : "text-[2.4rem]"}`}>{reminder.ar}</div>
        <div className="text-[1.05rem] text-ink-dim">{t(reminder.en)}</div>
      </div>
    </div>
  );
}
