// A small chip on other pages while a recitation is playing.
import { useEffect, useState } from "react";
import { BookOpenText, Pause, Play, Square } from "lucide-react";
import { useRecitation, toggle, stop } from "./audio";
import { loadQuran, refOf } from "./data";
import { reciter as findReciter } from "./reciters";
import { useI18n } from "../lib/settings-store";

export default function NowReciting({ onOpen }) {
  const { t, lang } = useI18n();
  const rec = useRecitation();
  const [q, setQ] = useState(null);
  useEffect(() => {
    if (rec.active && !q) loadQuran().then(setQ);
  }, [rec.active, q]);
  if (!rec.active || !q || rec.index < 0) return null;
  const r = refOf(q, rec.index);
  const who = findReciter(rec.reciter);
  return (
    <div className="glass-strong fixed start-1/2 top-[2.2rem] z-[60] flex -translate-x-1/2 items-center rtl:translate-x-1/2 gap-[0.6rem] rounded-full py-[0.45rem] ps-[1.2rem] pe-[0.5rem] shadow-2xl fade-up">
      <BookOpenText className="h-[1.3rem] w-[1.3rem] text-accent" />
      <button data-nav onClick={onOpen} className="focus-row rounded-full px-[0.6rem] py-[0.3rem] text-start">
        <div className="text-[1rem] font-semibold leading-tight">
          {lang === "ar" ? r.surah.ar : r.surah.en} {r.surah.n}:{r.ayah}
        </div>
        <div className="text-[0.8rem] text-ink-faint">
          {rec.playing ? t("Reciting") : t("Paused")} · {lang === "ar" ? who.ar : who.en}
        </div>
      </button>
      <button data-nav onClick={toggle} aria-label={rec.playing ? t("Pause") : t("Play")} className="focus-row rounded-full p-[0.6rem]">
        {rec.playing ? <Pause className="h-[1.2rem] w-[1.2rem]" /> : <Play className="h-[1.2rem] w-[1.2rem]" />}
      </button>
      <button data-nav onClick={stop} aria-label={t("Stop")} className="focus-row rounded-full p-[0.6rem]">
        <Square className="h-[1.1rem] w-[1.1rem]" />
      </button>
    </div>
  );
}
