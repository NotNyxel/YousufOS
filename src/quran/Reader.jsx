// The Qur'an reader: a surah verse by verse (with a translation), or the
// mushaf page by page. Made for the remote: Up/Down move between verses,
// OK opens a verse's options, Left/Right turn mushaf pages, Back closes.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, BookOpen, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Download, Headphones, Languages, Minus, Pause, Play, Plus, Repeat, ScrollText, SkipBack, SkipForward, Square, X,
} from "lucide-react";
import { arabicDigits, loadText, pageRange, refOf, BUILT_IN_TEXT, PAGES, TOTAL, downloadText } from "./data";
import { RECITERS, reciter as findReciter } from "./reciters";
import * as player from "./audio";
import { useQuranDownloads } from "./downloads";
import { focusDefault, focusEl } from "../lib/nav";
import { useI18n } from "../lib/settings-store";
import { isTauri } from "../lib/platform";

const BACK = ["Escape", "Backspace", "BrowserBack", "GoBack"];

function Reader({ q, start, autoPlay, settings, update, onClose }) {
  const { t, lang } = useI18n();
  const qs = settings.quran;
  const view = qs.view === "mushaf" ? "mushaf" : "verses";
  const size = qs.size || 100;
  const rec = player.useRecitation();
  const reciter = findReciter(qs.reciter);
  const downloads = useQuranDownloads();
  const [index, setIndex] = useState(start); // the verse being read
  const [menu, setMenu] = useState(null); // verse index with its options open
  const [picker, setPicker] = useState(null); // "reciter" | "translation"
  const [tafsir, setTafsir] = useState(null); // { index, text, name } or { index, missing }
  const [translation, setTranslation] = useState(null);
  const lastKey = useRef(0);
  const ar = lang === "ar";

  const surah = q.surahs[q.surahOf[index] - 1];
  const page = q.ayahs[index].page;

  // Translation under each verse.
  const trId = qs.showTranslation === false ? "" : qs.translation || BUILT_IN_TEXT;
  useEffect(() => {
    let alive = true;
    loadText(trId).then((l) => alive && setTranslation(l), () => alive && setTranslation(null));
    return () => {
      alive = false;
    };
  }, [trId]);

  // Remember where reading stopped.
  useEffect(() => {
    const id = setTimeout(() => update("quran.last", index), 1200);
    return () => clearTimeout(id);
  }, [index, update]);

  // Back closes menus first, then the reader.
  const closeRef = useRef();
  useLayoutEffect(() => {
    closeRef.current = () => {
      if (tafsir) return setTafsir(null);
      if (picker) return setPicker(null);
      if (menu != null) return setMenu(null);
      onClose();
    };
  });
  useEffect(() => {
    const onKey = (e) => {
      lastKey.current = Date.now();
      if (BACK.includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const playFrom = useCallback(
    (i, opts = {}) => player.play({ from: i, to: opts.to ?? TOTAL - 1, at: i, reciter: reciter.id, repeat: opts.repeat || 1, loopRange: !!opts.loop }),
    [reciter.id],
  );
  useEffect(() => {
    if (autoPlay) playFrom(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the recitation: show the verse being recited (unless the remote was
  // used in the last few seconds, so reading ahead isn't interrupted).
  useEffect(() => {
    if (!rec.active || rec.index < 0) return;
    if (Date.now() - lastKey.current < 6000 && rec.index !== index) {
      // Still switch surah / page if the recitation moved past it.
      const other = view === "mushaf" ? q.ayahs[rec.index].page !== page : q.surahOf[rec.index] !== surah.n;
      if (!other) return;
    }
    setIndex(rec.index);
    requestAnimationFrame(() => {
      const el = document.getElementById(view === "mushaf" ? "mushaf-page" : `v-${rec.index}`);
      if (el && !menu && !picker && !tafsir) focusEl(el);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.index, rec.active]);

  const bookmarks = qs.bookmarks || [];
  const toggleBookmark = (i) =>
    update("quran.bookmarks", (cur = []) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));

  const openTafsir = async (i) => {
    const id = qs.tafsir || "ar.muyassar";
    const list = await loadText(id).catch(() => null);
    if (list) setTafsir({ index: i, text: list[i], id });
    else setTafsir({ index: i, missing: id });
  };

  const goSurah = (n) => {
    const s = q.surahs[n - 1];
    if (!s) return;
    setIndex(s.start);
    requestAnimationFrame(() => focusEl(document.getElementById(`v-${s.start}`)));
  };
  const goPage = (p) => {
    const pp = Math.min(PAGES, Math.max(1, p));
    setIndex(q.pageStart[pp - 1]);
  };

  const surahRange = [surah.start, surah.start + surah.count - 1];
  const dl = downloads.progress[reciter.id];
  const downloading = dl?.state === "running";

  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[70] flex flex-col bg-[color-mix(in_srgb,var(--canvas)_94%,black)] text-ink">
      {/* toolbar */}
      <div className="flex items-center gap-[0.8rem] px-[3.5rem] pb-[1rem] pt-[2rem]">
        <ToolButton Icon={ArrowLeft} label={t("Back")} onClick={onClose} />
        <div className="ms-[0.6rem] min-w-0 flex-1">
          <div className="flex items-baseline gap-[1rem]">
            <span className="truncate text-[1.7rem] font-bold">{ar ? `سورة ${surah.ar}` : surah.en}</span>
            {!ar && <span className="text-[1.6rem]" dir="rtl" style={{ fontFamily: "var(--mushaf-font)" }}>{surah.ar}</span>}
          </div>
          <div className="text-[0.95rem] text-ink-faint">
            {t("Juz {n}", { n: q.ayahs[index].juz })} · {t("page {n}", { n: page })} · {surah.medinan ? t("Medinan") : t("Meccan")}
          </div>
        </div>
        {rec.active ? (
          <>
            <ToolButton Icon={SkipBack} label={t("Previous verse")} onClick={() => player.step(-1)} small />
            <ToolButton Icon={rec.playing ? Pause : Play} label={rec.playing ? t("Pause") : t("Play")} onClick={player.toggle} primary />
            <ToolButton Icon={SkipForward} label={t("Next verse")} onClick={() => player.step(1)} small />
            <ToolButton Icon={Square} label={t("Stop")} onClick={player.stop} small />
          </>
        ) : (
          <ToolButton Icon={Play} label={t("Play")} onClick={() => playFrom(view === "mushaf" ? pageRange(q, page)[0] : index)} primary />
        )}
        <ToolButton Icon={Headphones} label={ar ? reciter.ar : reciter.en} onClick={() => setPicker("reciter")} />
        <ToolButton Icon={Languages} label={t("Translation")} onClick={() => setPicker("translation")} />
        <ToolButton
          Icon={view === "mushaf" ? ScrollText : BookOpen}
          label={view === "mushaf" ? t("Verses") : t("Mushaf")}
          onClick={() => update("quran.view", view === "mushaf" ? "verses" : "mushaf")}
        />
        <ToolButton Icon={Minus} label={t("Smaller text")} onClick={() => update("quran.size", Math.max(70, size - 10))} small />
        <ToolButton Icon={Plus} label={t("Larger text")} onClick={() => update("quran.size", Math.min(180, size + 10))} small />
        {isTauri() && (
          <ToolButton
            Icon={downloading ? X : Download}
            label={downloading ? t("{done} of {total}", { done: dl.done, total: dl.total || "…" }) : t("Download surah")}
            onClick={() =>
              downloading ? downloads.cancelAudio(reciter.id) : downloads.getAudio(reciter.id, surahRange, ar ? surah.ar : surah.en)
            }
          />
        )}
      </div>
      {rec.error && (
        <div className="mx-[3.5rem] mb-[0.6rem] rounded-[0.8rem] bg-red-500/20 px-[1.2rem] py-[0.6rem] text-[1rem]">
          {rec.error === "offline" ? t("No internet connection. Download this surah to listen offline.") : t("This recitation couldn't be played.")}
        </div>
      )}

      {view === "verses" ? (
        <VerseList
          q={q}
          surah={surah}
          start={start}
          size={size}
          translation={translation}
          rec={rec}
          bookmarks={bookmarks}
          onFocusVerse={setIndex}
          onVerse={setMenu}
          onSurah={goSurah}
        />
      ) : (
        <MushafPage q={q} page={page} size={size} rec={rec} onPage={goPage} onPlay={(i) => playFrom(i)} />
      )}

      {menu != null && (
        <VerseMenu
          q={q}
          i={menu}
          marked={bookmarks.includes(menu)}
          onClose={() => {
            const i = menu;
            setMenu(null);
            requestAnimationFrame(() => focusEl(document.getElementById(`v-${i}`)));
          }}
          onPlay={() => playFrom(menu)}
          onPlayOne={() => playFrom(menu, { to: menu })}
          onRepeat={() => playFrom(menu, { to: menu, repeat: 3, loop: false })}
          onBookmark={() => toggleBookmark(menu)}
          onTafsir={() => openTafsir(menu)}
        />
      )}
      {picker === "reciter" && (
        <Picker
          title={t("Reciter")}
          items={RECITERS.map((r) => ({ id: r.id, label: ar ? r.ar : r.en, hint: r.translation ? t("Translation") : "" }))}
          value={reciter.id}
          onPick={(id) => {
            update("quran.reciter", id);
            setPicker(null);
            if (rec.active) player.play({ from: rec.from, to: rec.to, at: rec.index, reciter: id, repeat: rec.repeat });
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "translation" && (
        <TranslationPicker
          qs={qs}
          downloaded={downloads.status.texts}
          onPick={(id) => {
            if (id) {
              update("quran.translation", id);
              update("quran.showTranslation", true);
            } else update("quran.showTranslation", false);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {tafsir && (
        <TafsirPanel
          q={q}
          tafsir={tafsir}
          onDownload={async () => {
            setTafsir({ ...tafsir, loading: true });
            try {
              const list = await downloadText(tafsir.missing);
              update("quran.tafsir", tafsir.missing);
              downloads.refresh();
              setTafsir({ index: tafsir.index, text: list[tafsir.index], id: tafsir.missing });
            } catch (e) {
              setTafsir({ ...tafsir, loading: false, error: String(e?.message || e) });
            }
          }}
          onClose={() => setTafsir(null)}
        />
      )}
    </div>,
    document.body,
  );
}

function ToolButton({ Icon, label, onClick, primary, small }) {
  return (
    <button
      data-nav
      onClick={onClick}
      aria-label={label}
      className={`focus-row flex shrink-0 items-center gap-[0.55rem] rounded-full text-[1rem] font-semibold ${
        primary ? "bg-accent px-[1.3rem] py-[0.7rem] text-on-accent" : small ? "glass p-[0.75rem]" : "glass px-[1.1rem] py-[0.7rem]"
      }`}
    >
      <Icon className="h-[1.25rem] w-[1.25rem]" />
      {!small && <span className="max-w-[12rem] truncate">{label}</span>}
    </button>
  );
}

// ---------------------------------------------------------------- verses
const VerseList = memo(function VerseList({ q, surah, start, size, translation, rec, bookmarks, onFocusVerse, onVerse, onSurah }) {
  const { t, lang } = useI18n();
  // Focus the starting verse once the list is on screen.
  useEffect(() => {
    const target = start >= surah.start && start < surah.start + surah.count ? start : surah.start;
    requestAnimationFrame(() => {
      const el = document.getElementById(`v-${target}`);
      if (el) focusEl(el);
      else focusDefault();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah.n]);
  const verses = useMemo(() => Array.from({ length: surah.count }, (_, k) => surah.start + k), [surah]);
  const arSize = `${2.3 * (size / 100)}rem`;
  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-[3.5rem] pb-[6rem]">
      <div className="mx-auto max-w-[72rem]">
        <SurahHeading q={q} surah={surah} size={size} />
        {verses.map((i) => {
          const n = i - surah.start + 1;
          const now = rec.active && rec.index === i;
          return (
            <button
              key={i}
              id={`v-${i}`}
              data-nav
              onFocus={() => onFocusVerse(i)}
              onClick={() => onVerse(i)}
              className={`group mb-[0.9rem] block w-full rounded-[1.4rem] px-[1.8rem] py-[1.2rem] text-start transition-colors focus:ring-[0.2rem] focus:ring-ink ${
                now ? "bg-accent/18 ring-[0.15rem] ring-accent/60" : "glass"
              }`}
            >
              <div className="mb-[0.3rem] flex items-center gap-[0.8rem] text-[0.9rem] font-semibold text-ink-faint">
                <span className="tabular rounded-full bg-accent/15 px-[0.7rem] py-[0.1rem] text-accent">
                  {surah.n}:{n}
                </span>
                {q.ayahs[i].sajda && <span className="text-accent">{t("Prostration")} ۩</span>}
                {bookmarks.includes(i) && <BookmarkCheck className="h-[1.1rem] w-[1.1rem] text-accent" />}
                {now && <span className="text-accent">{rec.basmala ? t("Basmala") : rec.playing ? t("Reciting") : t("Paused")}</span>}
              </div>
              <p dir="rtl" className="text-right leading-[2.05] text-ink" style={{ fontFamily: "var(--mushaf-font)", fontSize: arSize }}>
                {q.ayahs[i].text} <span className="text-accent">{"۝" + arabicDigits(n)}</span>
              </p>
              {translation && (
                <p dir={lang === "ar" ? "rtl" : "auto"} className="mt-[0.5rem] text-[1.2rem] leading-relaxed text-ink-dim" style={{ fontSize: `${1.2 * Math.min(1.3, size / 100)}rem` }}>
                  {translation[i]}
                </p>
              )}
            </button>
          );
        })}
        <div className="mt-[1.6rem] flex justify-center gap-[1rem]">
          {surah.n > 1 && (
            <button data-nav onClick={() => onSurah(surah.n - 1)} className="focus-row glass flex items-center gap-[0.6rem] rounded-full px-[1.4rem] py-[0.8rem] text-[1.05rem] font-semibold">
              <ChevronLeft className="h-[1.2rem] w-[1.2rem] rtl:rotate-180" />
              {lang === "ar" ? q.surahs[surah.n - 2].ar : q.surahs[surah.n - 2].en}
            </button>
          )}
          {surah.n < 114 && (
            <button data-nav onClick={() => onSurah(surah.n + 1)} className="focus-row flex items-center gap-[0.6rem] rounded-full bg-accent px-[1.4rem] py-[0.8rem] text-[1.05rem] font-semibold text-on-accent">
              {t("Next surah")}: {lang === "ar" ? q.surahs[surah.n].ar : q.surahs[surah.n].en}
              <ChevronRight className="h-[1.2rem] w-[1.2rem] rtl:rotate-180" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

function SurahHeading({ q, surah, size }) {
  return (
    <div className="mb-[1.4rem] mt-[0.6rem] flex flex-col items-center">
      <div
        className="rounded-[1rem] border border-accent/40 bg-accent/10 px-[3rem] py-[0.5rem] text-accent"
        dir="rtl"
        style={{ fontFamily: "var(--mushaf-font)", fontSize: `${2 * (size / 100)}rem` }}
      >
        سُورَةُ {surah.ar}
      </div>
      {surah.n !== 1 && surah.n !== 9 && (
        <div className="mt-[0.6rem]" dir="rtl" style={{ fontFamily: "var(--mushaf-font)", fontSize: `${2.1 * (size / 100)}rem` }}>
          {q.bismillah}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- mushaf
function MushafPage({ q, page, size, rec, onPage, onPlay }) {
  const { t } = useI18n();
  const ref = useRef();
  const [from, to] = pageRange(q, page);
  useEffect(() => {
    requestAnimationFrame(() => focusEl(ref.current));
  }, []);
  // Left / Right turn pages (an Arabic book opens to the left), Up / Down scroll a long page.
  useEffect(() => {
    const el = ref.current;
    const onAdjust = (e) => {
      e.preventDefault();
      onPage(page + (e.detail < 0 ? 1 : -1));
      el.scrollTop = 0;
    };
    const onKey = (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const down = e.key === "ArrowDown";
      const can = down ? el.scrollTop + el.clientHeight < el.scrollHeight - 4 : el.scrollTop > 4;
      if (can) {
        e.preventDefault();
        el.scrollBy({ top: (down ? 1 : -1) * el.clientHeight * 0.6, behavior: "smooth" });
      }
    };
    el.addEventListener("nav-adjust", onAdjust);
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("nav-adjust", onAdjust);
      el.removeEventListener("keydown", onKey);
    };
  }, [page, onPage]);
  const parts = [];
  for (let i = from; i <= to; i++) {
    const r = refOf(q, i);
    if (r.ayah === 1) parts.push({ heading: r.surah, key: `h${i}` });
    parts.push({ i, n: r.ayah, key: i });
  }
  const fs = `${2.15 * (size / 100)}rem`;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center px-[3.5rem] pb-[1.6rem]">
      <div
        ref={ref}
        id="mushaf-page"
        data-nav
        data-adjust
        tabIndex={-1}
        onClick={() => onPlay(from)}
        className="no-scrollbar min-h-0 w-full max-w-[78rem] flex-1 overflow-y-auto rounded-[1.6rem] border border-accent/25 bg-[color-mix(in_srgb,var(--canvas)_70%,#f3e6c8_6%)] px-[3.5rem] py-[2rem] outline-none focus:ring-[0.2rem] focus:ring-accent/60"
      >
        <div className="mb-[0.8rem] flex justify-between text-[0.95rem] font-semibold text-ink-faint">
          <span>{t("Juz {n}", { n: q.ayahs[from].juz })}</span>
          <span dir="rtl" style={{ fontFamily: "var(--mushaf-font)" }}>
            {q.surahs[q.surahOf[from] - 1].ar}
          </span>
        </div>
        <div dir="rtl" className="text-justify leading-[2.25]" style={{ fontFamily: "var(--mushaf-font)", fontSize: fs, textAlignLast: "center" }}>
          {parts.map((p) =>
            p.heading ? (
              <div key={p.key} className="my-[0.6rem] text-center">
                <div className="mx-auto inline-block rounded-[0.8rem] border border-accent/40 bg-accent/10 px-[2.4rem] text-accent">سُورَةُ {p.heading.ar}</div>
                {p.heading.n !== 1 && p.heading.n !== 9 && <div>{q.bismillah}</div>}
              </div>
            ) : (
              <span key={p.key} className={rec.active && rec.index === p.i ? "rounded-[0.4rem] bg-accent/25" : ""}>
                {q.ayahs[p.i].text} <span className="text-accent">{"۝" + arabicDigits(p.n)}</span>{" "}
              </span>
            ),
          )}
        </div>
      </div>
      <div className="mt-[0.8rem] flex items-center gap-[1.4rem] text-[1rem] text-ink-faint">
        <span>← {t("next page")}</span>
        <span className="tabular rounded-full bg-accent/15 px-[1rem] py-[0.2rem] font-bold text-accent">{arabicDigits(page)}</span>
        <span>{t("previous page")} →</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- menus
function Modal({ title, children, onClose, wide }) {
  return (
    <div data-nav-scope className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`glass-strong flex max-h-[80vh] flex-col rounded-[1.6rem] p-[1.6rem] shadow-2xl ${wide ? "w-[60rem]" : "w-[34rem]"}`}
      >
        <div className="mb-[1rem] px-[0.4rem] text-[1.3rem] font-bold">{title}</div>
        <div className="no-scrollbar min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function MenuItem({ Icon, label, onClick, def }) {
  return (
    <button
      data-nav
      data-nav-default={def || undefined}
      onClick={onClick}
      className="focus-row mb-[0.4rem] flex w-full items-center gap-[1rem] rounded-[1rem] px-[1.2rem] py-[0.85rem] text-start text-[1.15rem] font-semibold"
    >
      {Icon && <Icon className="h-[1.3rem] w-[1.3rem] text-accent" />}
      {label}
    </button>
  );
}

function VerseMenu({ q, i, marked, onClose, onPlay, onPlayOne, onRepeat, onBookmark, onTafsir }) {
  const { t, lang } = useI18n();
  const r = refOf(q, i);
  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
  }, []);
  const run = (f) => () => {
    f();
    onClose();
  };
  return (
    <Modal title={`${lang === "ar" ? r.surah.ar : r.surah.en} ${r.surah.n}:${r.ayah}`} onClose={onClose}>
      <MenuItem Icon={Play} label={t("Play from here")} onClick={run(onPlay)} def />
      <MenuItem Icon={Headphones} label={t("Play this verse only")} onClick={run(onPlayOne)} />
      <MenuItem Icon={Repeat} label={t("Repeat this verse 3 times")} onClick={run(onRepeat)} />
      <MenuItem Icon={marked ? BookmarkCheck : Bookmark} label={marked ? t("Remove bookmark") : t("Bookmark")} onClick={run(onBookmark)} />
      <MenuItem Icon={ScrollText} label={t("Tafsir")} onClick={() => onTafsir()} />
    </Modal>
  );
}

function Picker({ title, items, value, onPick, onClose }) {
  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
  }, []);
  return (
    <Modal title={title} onClose={onClose}>
      {items.map((it) => (
        <button
          key={it.id || "none"}
          data-nav
          data-nav-default={it.id === value || undefined}
          onClick={() => onPick(it.id)}
          className="focus-row mb-[0.35rem] flex w-full items-center justify-between gap-[1rem] rounded-[1rem] px-[1.2rem] py-[0.8rem] text-start text-[1.1rem] font-semibold"
        >
          <span className="min-w-0">
            <span className="block truncate">{it.label}</span>
            {it.hint && <span className="block truncate text-[0.9rem] font-normal text-ink-faint">{it.hint}</span>}
          </span>
          {it.id === value && <span className="h-[0.7rem] w-[0.7rem] shrink-0 rounded-full bg-accent" />}
        </button>
      ))}
    </Modal>
  );
}

function TranslationPicker({ qs, downloaded, onPick, onClose }) {
  const { t } = useI18n();
  const ids = [...new Set([BUILT_IN_TEXT, ...downloaded.filter((d) => !/^ar\.(muyassar|jalalayn|qurtubi|miqbas|waseet|baghawi)$/.test(d))])];
  const items = [
    { id: "", label: t("Arabic only") },
    ...ids.map((id) => ({ id, label: id === BUILT_IN_TEXT ? "English · Sahih International" : id, hint: id === BUILT_IN_TEXT ? t("Built in") : t("Downloaded") })),
  ];
  return (
    <Picker
      title={t("Translation")}
      items={items}
      value={qs.showTranslation === false ? "" : qs.translation || BUILT_IN_TEXT}
      onPick={onPick}
      onClose={onClose}
    />
  );
}

function TafsirPanel({ q, tafsir, onDownload, onClose }) {
  const { t, lang } = useI18n();
  const r = refOf(q, tafsir.index);
  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
  }, [tafsir.missing, tafsir.text]);
  return (
    <Modal title={`${t("Tafsir")} · ${lang === "ar" ? r.surah.ar : r.surah.en} ${r.surah.n}:${r.ayah}`} onClose={onClose} wide>
      <p dir="rtl" className="mb-[1rem] text-right text-[1.8rem] leading-[2]" style={{ fontFamily: "var(--mushaf-font)" }}>
        {q.ayahs[tafsir.index].text}
      </p>
      {tafsir.text ? (
        <p data-nav tabIndex={-1} dir="auto" className="arabic rounded-[1rem] p-[0.6rem] text-[1.3rem] leading-[1.9] text-ink-dim outline-none">
          {tafsir.text}
        </p>
      ) : (
        <div className="flex flex-col gap-[0.8rem]">
          <p className="text-[1.1rem] text-ink-dim">
            {tafsir.error ? tafsir.error : t("Tafsir al-Muyassar isn't on this TV yet. Download it once (about 4 MB) to read it any time, even offline.")}
          </p>
          <MenuItem Icon={Download} label={tafsir.loading ? t("Downloading…") : t("Download Tafsir al-Muyassar")} onClick={onDownload} def />
        </div>
      )}
    </Modal>
  );
}

export default memo(Reader);
