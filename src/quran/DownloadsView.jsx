// Qur'an downloads: recitations for listening offline, and translations /
// tafsir to read offline.
import { memo, useEffect, useMemo, useState } from "react";
import { Check, Download, Trash2, X } from "lucide-react";
import { RECITERS, sizeMb } from "./reciters";
import { useQuranDownloads, formatMb } from "./downloads";
import { BUILT_IN_TEXT, SUGGESTED_TEXTS, TOTAL, deleteText, downloadText, textCatalog } from "./data";
import { useI18n } from "../lib/settings-store";
import { isTauri } from "../lib/platform";

function DownloadsView({ settings, update }) {
  const { t, lang, locale } = useI18n();
  const d = useQuranDownloads();
  const qs = settings.quran;
  const [catalog, setCatalog] = useState(SUGGESTED_TEXTS);
  const [busy, setBusy] = useState({}); // text id -> "downloading" | error
  useEffect(() => {
    textCatalog().then(setCatalog, () => {});
  }, []);
  const langName = useMemo(() => {
    let names;
    try {
      names = new Intl.DisplayNames([locale || "en"], { type: "language" });
    } catch {
      names = null;
    }
    return (code) => {
      try {
        return names?.of(code) || code;
      } catch {
        return code;
      }
    };
  }, [locale]);
  // The interface language first, then English and Arabic, then the rest.
  const texts = useMemo(() => {
    const rank = (e) => (e.lang === lang ? 0 : e.lang === "en" ? 1 : e.lang === "ar" ? 2 : 3);
    return [...catalog].sort((a, b) => rank(a) - rank(b) || langName(a.lang).localeCompare(langName(b.lang)) || a.en.localeCompare(b.en));
  }, [catalog, lang, langName]);
  const tafsirs = texts.filter((e) => e.type === "tafsir");
  const translations = texts.filter((e) => e.type === "translation");

  if (!isTauri())
    return <div className="glass rounded-[1.2rem] p-[1.6rem] text-[1.1rem] text-ink-dim">{t("Downloads work in the YousufOS app on the TV.")}</div>;

  const getText = async (id) => {
    setBusy((b) => ({ ...b, [id]: "downloading" }));
    try {
      await downloadText(id);
      setBusy((b) => ({ ...b, [id]: undefined }));
      d.refresh();
    } catch (e) {
      setBusy((b) => ({ ...b, [id]: String(e?.message || e) }));
    }
  };

  return (
    <div className="flex flex-col gap-[0.6rem]">
      <Heading>{t("Recitations")}</Heading>
      <p className="mb-[0.4rem] text-[1rem] text-ink-faint">
        {t("Download a reciter to listen without internet. You can also download a single surah from the reader.")}
      </p>
      {RECITERS.map((r) => {
        const st = d.status.audio?.[r.id];
        const p = d.progress[r.id];
        const running = p?.state === "running";
        const count = st?.count || 0;
        const full = count >= TOTAL;
        const chosen = qs.reciter === r.id;
        return (
          <div key={r.id} className="glass flex items-center gap-[1.2rem] rounded-[1.2rem] px-[1.4rem] py-[0.9rem]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[0.8rem] text-[1.15rem] font-bold">
                {lang === "ar" ? r.ar : r.en}
                {chosen && <span className="rounded-full bg-accent/20 px-[0.7rem] py-[0.1rem] text-[0.8rem] font-bold uppercase tracking-wider text-accent">{t("In use")}</span>}
              </div>
              <div className="text-[0.95rem] text-ink-faint">
                {running
                  ? t("Downloading {label}: {done} of {total} verses", { label: p.label || t("the whole Qur'an"), done: p.done, total: p.total || "…" })
                  : full
                    ? t("Whole Qur'an on this TV · {size}", { size: formatMb(st.bytes) })
                    : count
                      ? t("{n} verses on this TV · {size}", { n: count, size: formatMb(st.bytes) })
                      : t("Whole Qur'an about {size}", { size: formatMb(sizeMb(r) * 1e6) })}
                {p && p.state === "partial" && ` · ${t("{n} couldn't be downloaded; try again", { n: p.failed })}`}
                {p && p.state === "failed" && ` · ${t("Download failed")}${p.error ? `: ${p.error}` : ""}`}
              </div>
              {running && p.total > 0 && (
                <div className="mt-[0.5rem] h-[0.35rem] overflow-hidden rounded-full bg-current/15">
                  <div className="h-full bg-accent transition-[width]" style={{ width: `${(100 * p.done) / p.total}%` }} />
                </div>
              )}
            </div>
            {!chosen && <Btn label={t("Use")} Icon={Check} onClick={() => update("quran.reciter", r.id)} />}
            {running ? (
              <Btn label={t("Stop")} Icon={X} onClick={() => d.cancelAudio(r.id)} />
            ) : (
              !full && <Btn label={count ? t("Download the rest") : t("Download all")} Icon={Download} onClick={() => d.getAudio(r.id)} primary />
            )}
            {count > 0 && !running && <Btn label={t("Delete")} Icon={Trash2} onClick={() => d.deleteAudio(r.id)} confirm />}
          </div>
        );
      })}

      <Heading>{t("Tafsir")}</Heading>
      {tafsirs.map((e) => (
        <TextRow key={e.id} e={e} have={d.status.texts.includes(e.id)} busy={busy[e.id]} inUse={qs.tafsir === e.id} langName={langName}
          onGet={() => getText(e.id)} onDelete={() => deleteText(e.id).then(d.refresh)} onUse={() => update("quran.tafsir", e.id)} />
      ))}

      <Heading>{t("Translations")}</Heading>
      {translations.map((e) => (
        <TextRow key={e.id} e={e} builtIn={e.id === BUILT_IN_TEXT} have={e.id === BUILT_IN_TEXT || d.status.texts.includes(e.id)} busy={busy[e.id]}
          inUse={qs.showTranslation !== false && (qs.translation || BUILT_IN_TEXT) === e.id} langName={langName}
          onGet={() => getText(e.id)} onDelete={() => deleteText(e.id).then(d.refresh)}
          onUse={() => {
            update("quran.translation", e.id);
            update("quran.showTranslation", true);
          }} />
      ))}
    </div>
  );
}

function Heading({ children }) {
  return <div className="mt-[1.4rem] text-[0.95rem] font-bold uppercase tracking-[0.18em] text-ink-faint first:mt-0">{children}</div>;
}

function TextRow({ e, have, builtIn, busy, inUse, langName, onGet, onDelete, onUse }) {
  const { t } = useI18n();
  return (
    <div className="glass flex items-center gap-[1.2rem] rounded-[1.2rem] px-[1.4rem] py-[0.8rem]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[0.8rem] text-[1.1rem] font-bold">
          <span className="truncate">{e.name && e.lang === "ar" ? e.name : e.en}</span>
          {inUse && <span className="rounded-full bg-accent/20 px-[0.7rem] py-[0.1rem] text-[0.8rem] font-bold uppercase tracking-wider text-accent">{t("In use")}</span>}
        </div>
        <div className="truncate text-[0.95rem] text-ink-faint">
          {langName(e.lang)}
          {builtIn ? ` · ${t("Built in")}` : have ? ` · ${t("On this TV")}` : ""}
          {busy && busy !== "downloading" ? ` · ${busy}` : ""}
        </div>
      </div>
      {have && !inUse && <Btn label={t("Use")} Icon={Check} onClick={onUse} />}
      {!have && <Btn label={busy === "downloading" ? t("Downloading…") : t("Download")} Icon={Download} onClick={busy === "downloading" ? undefined : onGet} primary />}
      {have && !builtIn && <Btn label={t("Delete")} Icon={Trash2} onClick={onDelete} confirm />}
    </div>
  );
}

function Btn({ label, Icon, onClick, primary, confirm }) {
  const { t } = useI18n();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      data-nav
      onClick={() => {
        if (!onClick) return;
        if (confirm && !armed) return setArmed(true);
        setArmed(false);
        onClick();
      }}
      className={`focus-row flex shrink-0 items-center gap-[0.5rem] rounded-full px-[1.1rem] py-[0.6rem] text-[1rem] font-semibold ${
        primary ? "bg-accent text-on-accent" : armed ? "bg-red-500/80 text-white" : "glass"
      }`}
    >
      <Icon className="h-[1.1rem] w-[1.1rem]" />
      {armed ? t("Press OK again to confirm") : label}
    </button>
  );
}

export default memo(DownloadsView);
