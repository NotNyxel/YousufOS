// Home screen card during Ramadan: the next of suhoor / iftar with a countdown.
import { memo } from "react";
import { Moon, Sunrise, Sunset } from "lucide-react";
import { formatCountdown, formatTime } from "../lib/prayer";
import { useI18n } from "../lib/settings-store";

function RamadanCard({ info, now, clock24, onOpen }) {
  const { t, locale } = useI18n();
  const toIftar = info.fasting;
  const target = toIftar ? info.iftar : info.suhoorEnds;
  return (
    <button
      data-nav
      onClick={onOpen}
      className="glass mt-[1rem] block w-[23rem] rounded-[1.5rem] px-[1.6rem] py-[1.1rem] text-start shadow-2xl transition-transform focus:scale-[1.03] focus:ring-[0.2rem] focus:ring-ink"
    >
      <div className="flex items-center justify-between text-[0.85rem] font-semibold uppercase tracking-[0.16em] text-accent">
        <span className="flex items-center gap-[0.5rem]">
          <Moon className="h-[1rem] w-[1rem]" />
          {t("Ramadan · day {n}", { n: info.day })}
        </span>
        <span className="arabic text-[1rem] tracking-normal">رمضان كريم</span>
      </div>
      <div className="mt-[0.5rem] text-[1.05rem] text-ink-dim">{toIftar ? t("Iftar in") : t("Suhoor ends in")}</div>
      <div className="tabular text-[2.2rem] font-semibold leading-tight">{formatCountdown(target - now, t)}</div>
      <div className="mt-[0.5rem] flex gap-[1.4rem] text-[1rem] text-ink-dim">
        <span className="flex items-center gap-[0.4rem]">
          <Sunrise className="h-[1.05rem] w-[1.05rem]" />
          {t("Suhoor")} {formatTime(info.suhoorEnds, clock24, locale)}
        </span>
        <span className="flex items-center gap-[0.4rem]">
          <Sunset className="h-[1.05rem] w-[1.05rem]" />
          {t("Iftar")} {formatTime(info.iftar, clock24, locale)}
        </span>
      </div>
      {info.oddNight && <div className="mt-[0.5rem] text-[0.95rem] font-semibold text-accent">{t("Tonight may be Laylat al-Qadr (night {n})", { n: info.night })}</div>}
      {info.preview && <div className="mt-[0.4rem] text-[0.85rem] text-ink-faint">{t("Preview: Ramadan mode is switched on in Settings")}</div>}
    </button>
  );
}

export default memo(RamadanCard);
