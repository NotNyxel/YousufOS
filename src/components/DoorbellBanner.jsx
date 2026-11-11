import { useEffect, useLayoutEffect, useRef } from "react";
import { BellRing } from "lucide-react";
import { useI18n } from "../lib/settings-store";

// "Someone's at the door" across the top while the camera window is open.
export default function DoorbellBanner({ name, seconds, onDone }) {
  const { t } = useI18n();
  const doneRef = useRef(onDone);
  useLayoutEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    const id = setTimeout(() => doneRef.current(), seconds * 1000);
    return () => clearTimeout(id);
  }, [seconds]);
  return (
    <div
      className="glass-strong fixed start-1/2 top-[2.2rem] z-[86] flex items-center gap-[1.2rem] rounded-[1.6rem] px-[2rem] py-[1.1rem] shadow-[0_1.5rem_4rem_rgb(0_0_0/0.5)]"
      style={{ animation: "banner-in 600ms cubic-bezier(.2,.7,.2,1) both" }}
    >
      <span className="breathe flex h-[3rem] w-[3rem] items-center justify-center rounded-full bg-amber-400/25">
        <BellRing className="h-[1.6rem] w-[1.6rem] text-amber-300" />
      </span>
      <div>
        <div className="text-[1.5rem] font-bold">{t("Someone's at the door")}</div>
        {name && <div className="text-[1rem] text-ink-dim">{name}</div>}
      </div>
    </div>
  );
}
