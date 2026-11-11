// Ramadan on the Prayer page: Taraweeh nights and the Qur'an khatm (a juz a day).
import { memo } from "react";
import { BookOpenText, Check, Moon } from "lucide-react";
import { IFTAR_DUA, QADR_DUA } from "../lib/ramadan";
import { useI18n } from "../lib/settings-store";

function RamadanTrackers({ info, settings, update, onReadJuz }) {
  const { t } = useI18n();
  const key = String(info.year);
  const taraweeh = settings.ramadan?.taraweeh?.[key] || [];
  const khatm = settings.ramadan?.khatm?.[key] || [];
  const toggle = (field, n) =>
    update(`ramadan.${field}`, (cur = {}) => {
      const list = cur[key] || [];
      return { ...cur, [key]: list.includes(n) ? list.filter((x) => x !== n) : [...list, n] };
    });
  const nextJuz = Array.from({ length: 30 }, (_, i) => i + 1).find((j) => !khatm.includes(j)) || 30;

  return (
    <div className="mt-[3rem]">
      <div className="flex items-center gap-[0.6rem] text-[1.1rem] font-semibold text-ink-dim">
        <Moon className="h-[1.3rem] w-[1.3rem] text-accent" />
        {t("Ramadan {year}", { year: info.year })} · {t("day {n}", { n: info.day })}
        {info.preview && <span className="text-[0.95rem] font-normal text-ink-faint">· {t("preview")}</span>}
      </div>

      <div className="mt-[1rem] grid grid-cols-2 gap-[1.2rem]">
        <Tracker
          title={t("Taraweeh")}
          sub={t("{n} of 30 nights", { n: taraweeh.length })}
          done={taraweeh}
          today={info.night ?? info.day}
          odd
          onToggle={(n) => toggle("taraweeh", n)}
        />
        <div>
          <Tracker
            title={t("Qur'an khatm")}
            sub={t("{n} of 30 juz", { n: khatm.length })}
            done={khatm}
            today={info.todaysJuz}
            onToggle={(n) => toggle("khatm", n)}
          />
          <button
            data-nav
            onClick={() => onReadJuz(nextJuz)}
            className="focus-row mt-[0.8rem] flex items-center gap-[0.6rem] rounded-full bg-accent px-[1.4rem] py-[0.75rem] text-[1.05rem] font-semibold text-on-accent"
          >
            <BookOpenText className="h-[1.2rem] w-[1.2rem]" />
            {t("Read juz {n}", { n: nextJuz })}
          </button>
        </div>
      </div>

      <div className="mt-[1.2rem] grid grid-cols-2 gap-[1.2rem]">
        <Dua title={t("Dua for breaking the fast")} dua={IFTAR_DUA} />
        <Dua title={t("Dua for Laylat al-Qadr")} dua={QADR_DUA} />
      </div>
    </div>
  );
}

function Tracker({ title, sub, done, today, odd, onToggle }) {
  return (
    <div className="glass rounded-[1.4rem] p-[1.3rem]">
      <div className="flex items-baseline justify-between">
        <div className="text-[1.3rem] font-bold">{title}</div>
        <div className="text-[1rem] text-ink-dim">{sub}</div>
      </div>
      <div className="mt-[0.9rem] grid grid-cols-10 gap-[0.5rem]">
        {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => {
          const on = done.includes(n);
          const special = odd && n >= 21 && n % 2 === 1;
          return (
            <button
              key={n}
              data-nav
              onClick={() => onToggle(n)}
              className={`tabular relative flex aspect-square items-center justify-center rounded-[0.7rem] text-[1rem] font-bold transition-transform focus:scale-[1.15] focus:ring-[0.18rem] focus:ring-ink ${
                on ? "bg-accent text-on-accent" : n === today ? "bg-accent/20 text-accent ring-[0.12rem] ring-accent/60" : "bg-current/8 text-ink-dim"
              }`}
            >
              {on ? <Check className="h-[1.1rem] w-[1.1rem]" /> : n}
              {special && !on && <span className="absolute end-[0.25rem] top-[0.2rem] h-[0.35rem] w-[0.35rem] rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Dua({ title, dua }) {
  const { t } = useI18n();
  return (
    <div data-nav tabIndex={-1} className="glass rounded-[1.4rem] p-[1.3rem] transition-transform focus:scale-[1.02] focus:ring-[0.2rem] focus:ring-ink">
      <div className="text-[0.9rem] font-semibold uppercase tracking-[0.15em] text-accent">{title}</div>
      <p dir="rtl" className="quran mt-[0.4rem] text-right text-[1.7rem] leading-[1.7]">{dua.ar}</p>
      <p className="text-[1rem] text-ink-dim">{t(dua.en)}</p>
      <p className="mt-[0.2rem] text-[0.85rem] text-ink-faint">— {t(dua.source)}</p>
    </div>
  );
}

export default memo(RamadanTrackers);
