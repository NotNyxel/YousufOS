// Full screen when the Kids profile's time is up or it's bedtime. A parent
// can add 30 minutes or leave the Kids profile with the PIN.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Moon, Timer } from "lucide-react";
import PinPad from "./PinPad";
import { focusDefault } from "../lib/nav";
import { useI18n } from "../lib/settings-store";

export default function KidsLock({ reason, kids, onMore, onExit }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(null); // "more" | "exit"
  useEffect(() => {
    if (!asking) requestAnimationFrame(() => focusDefault());
  }, [asking]);
  const Icon = reason === "bedtime" ? Moon : Timer;
  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[92] flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_30%,#283a6b,#0b0f1d)] text-center text-white">
      <div className="breathe flex h-[8rem] w-[8rem] items-center justify-center rounded-full bg-white/10 ring-1 ring-white/25">
        <Icon className="h-[4rem] w-[4rem] text-amber-200" />
      </div>
      <div className="mt-[2rem] text-[4.5rem] font-bold leading-none">{reason === "bedtime" ? t("Bedtime!") : t("Time's up for today!")}</div>
      <div className="mt-[1rem] max-w-[50rem] text-[1.6rem] text-white/75">
        {reason === "bedtime" ? t("Sleep well. See you tomorrow, insha'Allah.") : t("Great watching! Time to play, read or help at home.")}
      </div>
      <div className="mt-[3rem] flex gap-[1.2rem]">
        <button data-nav data-nav-default onClick={() => setAsking("more")} className="focus-row rounded-full bg-white/15 px-[2rem] py-[1rem] text-[1.2rem] font-semibold">
          {t("Parent: 30 more minutes")}
        </button>
        <button data-nav onClick={() => setAsking("exit")} className="focus-row rounded-full bg-white/15 px-[2rem] py-[1rem] text-[1.2rem] font-semibold">
          {t("Parent: leave the Kids profile")}
        </button>
      </div>
      {asking && (
        <PinPad
          title={t("Parent PIN")}
          hint={asking === "more" ? t("Adds 30 minutes") : t("Back to the full YousufOS")}
          onCancel={() => setAsking(null)}
          onSubmit={(pin) => {
            if (pin !== kids.pin) return false;
            if (asking === "more") onMore();
            else onExit();
            return true;
          }}
        />
      )}
    </div>,
    document.body,
  );
}
