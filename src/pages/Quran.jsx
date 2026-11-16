import { memo, useEffect, useMemo, useState } from "react";
import { BookOpen, Bookmark, Headphones, Play, WifiOff } from "lucide-react";
import { invoke, isTauri } from "../lib/platform";
import { loadQuran, refOf, arabicDigits } from "../quran/data";
import { reciter as findReciter } from "../quran/reciters";
import { play as playRecitation } from "../quran/audio";
import Reader from "../quran/Reader";
import DownloadsView from "../quran/DownloadsView";
import { useI18n } from "../lib/settings-store";

const TABS = [
  { id: "surahs", label: "Surahs" },
  { id: "juz", label: "Juz" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "downloads", label: "Downloads" },
];

function Quran({ settings, update, open, onOpened }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("surahs");
  // Verses of the chosen reciter on this TV (to suggest downloading for offline).
  const [haveAudio, setHaveAudio] = useState(null);
  const [own, setReader] = useState(null); // { index, play }
  const qs = settings.quran;

  useEffect(() => {
    loadQuran().then(setQ, (e) => setError(String(e?.message || e)));
  }, []);
  // Opened from elsewhere (Ramadan khatm, the phone): straight into the reader.
  // (App remounts this page when such a request arrives.)
  const [opened, setOpened] = useState(() => (open ? { index: open.index ?? qs.last ?? 0, play: open.play } : null));
  const reader = own || opened;

  const last = q && qs.last != null ? refOf(q, qs.last) : null;
  const rec = findReciter(qs.reciter);
  useEffect(() => {
    if (!isTauri()) return;
    invoke("quran_status")
      .then((st) => setHaveAudio(st?.audio?.[rec.id]?.count || 0))
      .catch(() => {});
  }, [rec.id, tab]);
  const ar = lang === "ar";

  if (error) return <div className="p-[9rem] text-[1.3rem] text-ink-dim">{t("Couldn't load the Qur'an: {error}", { error })}</div>;
  if (!q) return <div className="p-[9rem] text-[1.3rem] text-ink-dim">{t("Loading")}…</div>;

  return (
    <div className="flex h-full flex-col ps-[9rem] pe-[4rem] pt-[3.6rem]">
      <div className="flex items-end justify-between gap-[2rem]">
        <div>
          <div className="text-[1rem] font-semibold uppercase tracking-[0.2em] text-accent">{t("The Noble Qur'an")}</div>
          <h1 className="arabic mt-[0.2rem] text-[3rem] font-bold leading-tight" dir="rtl">القرآن الكريم</h1>
        </div>
        <div className="flex gap-[1rem]">
          {last && (
            <button
              data-nav
              data-nav-default
              onClick={() => setReader({ index: qs.last })}
              className="focus-row glass flex items-center gap-[0.8rem] rounded-full px-[1.6rem] py-[0.9rem] text-[1.1rem] font-semibold"
            >
              <BookOpen className="h-[1.3rem] w-[1.3rem] text-accent" />
              {t("Continue reading")} · {ar ? `${last.surah.ar} ${arabicDigits(last.ayah)}` : `${last.surah.en} ${last.surah.n}:${last.ayah}`}
            </button>
          )}
          <button
            data-nav
            onClick={() => {
              const i = qs.last ?? 0;
              playRecitation({ from: i, to: q.ayahs.length - 1, reciter: rec.id });
              setReader({ index: i });
            }}
            className="focus-row glass flex items-center gap-[0.8rem] rounded-full px-[1.6rem] py-[0.9rem] text-[1.1rem] font-semibold"
          >
            <Headphones className="h-[1.3rem] w-[1.3rem] text-accent" />
            {t("Listen")} · {ar ? rec.ar : rec.en}
          </button>
        </div>
      </div>

      <div className="mt-[1.6rem] flex gap-[0.8rem]">
        {haveAudio !== null && haveAudio < 6236 && tab !== "downloads" && (
          <button
            data-nav
            onClick={() => setTab("downloads")}
            className="focus-row ms-auto order-last flex items-center gap-[0.6rem] rounded-full px-[1.2rem] py-[0.6rem] text-[1rem] text-ink-dim"
          >
            <WifiOff className="h-[1.2rem] w-[1.2rem] text-accent" />
            {t("Download {name} to listen without internet", { name: ar ? rec.ar : rec.en })}
          </button>
        )}
        {TABS.map((x) => (
          <button
            key={x.id}
            data-nav
            onFocus={() => setTab(x.id)}
            onClick={() => setTab(x.id)}
            className={`focus-row rounded-full px-[1.4rem] py-[0.6rem] text-[1.1rem] font-semibold ${tab === x.id ? "bg-accent text-on-accent" : "glass text-ink-dim"}`}
          >
            {t(x.label)}
          </button>
        ))}
      </div>

      <div className="no-scrollbar mt-[1.4rem] min-h-0 flex-1 overflow-y-auto pb-[4rem] pe-[0.5rem]">
        {tab === "surahs" && <SurahGrid q={q} onOpen={(s) => setReader({ index: s.start })} />}
        {tab === "juz" && <JuzGrid q={q} onOpen={(i) => setReader({ index: i })} />}
        {tab === "bookmarks" && <Bookmarks q={q} list={qs.bookmarks || []} onOpen={(i) => setReader({ index: i })} />}
        {tab === "downloads" && <DownloadsView settings={settings} update={update} q={q} />}
      </div>

      {reader && (
        <Reader
          q={q}
          start={reader.index}
          autoPlay={reader.play}
          settings={settings}
          update={update}
          onClose={() => {
            setReader(null);
            setOpened(null);
            onOpened?.();
          }}
        />
      )}
    </div>
  );
}

const SurahGrid = memo(function SurahGrid({ q, onOpen }) {
  const { t, lang } = useI18n();
  return (
    <div className="grid grid-cols-4 gap-[1rem]">
      {q.surahs.map((s) => (
        <button
          key={s.n}
          data-nav
          onClick={() => onOpen(s)}
          className="glass group flex items-center gap-[1rem] rounded-[1.2rem] px-[1.2rem] py-[1rem] text-start transition-transform duration-150 focus:scale-[1.04] focus:ring-[0.2rem] focus:ring-ink"
        >
          <span className="tabular flex h-[2.8rem] w-[2.8rem] shrink-0 items-center justify-center rounded-[0.8rem] bg-accent/15 text-[1.1rem] font-bold text-accent">{s.n}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[1.15rem] font-bold">{lang === "ar" ? `سورة ${s.ar}` : s.en}</span>
            <span className="block truncate text-[0.9rem] text-ink-faint">
              {lang === "ar" ? `${arabicDigits(s.count)} آية` : `${s.meaning} · ${t("{n} verses", { n: s.count })}`}
            </span>
          </span>
          <span className="shrink-0 text-[1.5rem] text-ink-dim" dir="rtl" style={{ fontFamily: "var(--mushaf-font)" }}>
            {s.ar}
          </span>
        </button>
      ))}
    </div>
  );
});

function JuzGrid({ q, onOpen }) {
  const { t, lang } = useI18n();
  return (
    <div className="grid grid-cols-6 gap-[1rem]">
      {q.juzStart.map((i, j) => {
        const r = refOf(q, i);
        return (
          <button
            key={j}
            data-nav
            onClick={() => onOpen(i)}
            className="glass flex flex-col rounded-[1.2rem] px-[1.2rem] py-[1rem] text-start transition-transform duration-150 focus:scale-[1.05] focus:ring-[0.2rem] focus:ring-ink"
          >
            <span className="text-[0.85rem] font-semibold uppercase tracking-[0.15em] text-accent">{t("Juz {n}", { n: j + 1 })}</span>
            <span className="mt-[0.4rem] truncate text-[1.1rem] font-bold">{lang === "ar" ? r.surah.ar : r.surah.en}</span>
            <span className="text-[0.9rem] text-ink-faint">
              {r.surah.n}:{r.ayah} · {t("page {n}", { n: q.ayahs[i].page })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Bookmarks({ q, list, onOpen }) {
  const { t, lang } = useI18n();
  const items = useMemo(() => [...list].sort((a, b) => a - b), [list]);
  if (!items.length)
    return (
      <div className="glass flex items-center gap-[1rem] rounded-[1.2rem] p-[1.6rem] text-[1.1rem] text-ink-dim">
        <Bookmark className="h-[1.4rem] w-[1.4rem]" />
        {t("No bookmarks yet. While reading, press OK on a verse and choose “Bookmark”.")}
      </div>
    );
  return (
    <div className="flex flex-col gap-[0.8rem]">
      {items.map((i) => {
        const r = refOf(q, i);
        return (
          <button
            key={i}
            data-nav
            onClick={() => onOpen(i)}
            className="glass flex items-center gap-[1.4rem] rounded-[1.2rem] px-[1.4rem] py-[1rem] text-start transition-transform duration-150 focus:scale-[1.02] focus:ring-[0.2rem] focus:ring-ink"
          >
            <Play className="h-[1.2rem] w-[1.2rem] shrink-0 text-accent" />
            <span className="w-[14rem] shrink-0 text-[1.1rem] font-bold">
              {lang === "ar" ? r.surah.ar : r.surah.en} {r.surah.n}:{r.ayah}
            </span>
            <span className="line-clamp-1 flex-1 text-[1.4rem]" dir="rtl" style={{ fontFamily: "var(--mushaf-font)" }}>
              {q.ayahs[i].text}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default memo(Quran);
