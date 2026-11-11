// Jellyfin screens around the main browser: the server can't be reached
// (wake the PC up, watch downloads), choosing a profile, and the downloads
// kept on this TV.
import { useEffect, useState } from "react";
import { Download, Globe, Play, Plus, Power, RefreshCw, Server, Trash2 } from "lucide-react";
import { focusDefault } from "../lib/nav";
import { fileSrc } from "../lib/platform";
import { useI18n } from "../lib/settings-store";
import { runtime } from "./api";
import { deleteDownload } from "./downloads";
import { ActionButton, Art, Spinner } from "./ui";

// ---------------------------------------------------------------- unreachable
export function Unreachable({ client, reach, wol, onChangeServer, onOpenWeb, onOffline, downloadsCount }) {
  const { t } = useI18n();
  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault());
    return () => cancelAnimationFrame(id);
  }, [reach.status, downloadsCount]);
  if (reach.status === "checking" || reach.status === "waking")
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[1.4rem] px-[6rem] text-center">
        <Spinner />
        <div className="text-[1.5rem] font-semibold">{reach.status === "waking" ? t("Waking up your Jellyfin PC…") : t("Connecting to {server}…", { server: client.base.replace(/^https?:\/\//, "") })}</div>
        {reach.status === "waking" && <div className="text-[1.1rem] text-white/55">{t("This usually takes 10–30 seconds.")}</div>}
        {downloadsCount > 0 && (
          <div className="mt-[1rem]">
            <ActionButton Icon={Download} isDefault onClick={onOffline}>
              {t("Watch downloads ({n})", { n: downloadsCount })}
            </ActionButton>
          </div>
        )}
      </div>
    );
  return (
    <div className="flex h-full flex-col items-center justify-center px-[6rem] text-center">
      <Server className="h-[4rem] w-[4rem] text-white/40" />
      <h1 className="mt-[1.4rem] text-[2.4rem] font-bold">{t("Can't reach your Jellyfin server")}</h1>
      <p className="mt-[0.8rem] max-w-[46rem] text-[1.2rem] leading-relaxed text-white/65">
        {t("YousufOS tried {server}. Check that the computer running Jellyfin is on and connected to the same network, and that the address is right.", { server: client.base })}
      </p>
      {wol?.enabled !== false && !wol?.mac && (
        <p className="mt-[0.6rem] max-w-[46rem] text-[1rem] text-white/45">{t("Once Jellyfin has worked here, YousufOS can wake the PC up by itself (it needs Wake-on-LAN turned on in the PC's network settings).")}</p>
      )}
      <div className="mt-[2.2rem] flex flex-wrap justify-center gap-[1rem]">
        <ActionButton Icon={RefreshCw} primary isDefault={!downloadsCount} onClick={reach.retry}>
          {t("Try again")}
        </ActionButton>
        {wol?.mac && (
          <ActionButton Icon={Power} onClick={reach.wake}>
            {t("Wake up the PC")}
          </ActionButton>
        )}
        {downloadsCount > 0 && (
          <ActionButton Icon={Download} isDefault onClick={onOffline}>
            {t("Watch downloads ({n})", { n: downloadsCount })}
          </ActionButton>
        )}
        <ActionButton Icon={Server} onClick={onChangeServer}>
          {t("Change address")}
        </ActionButton>
        <ActionButton Icon={Globe} onClick={onOpenWeb}>
          {t("Open the web version")}
        </ActionButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- profiles
export function ProfilePicker({ accounts, onPick, onAdd, serverName }) {
  const { t } = useI18n();
  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault());
    return () => cancelAnimationFrame(id);
  }, []);
  const tile = "flex w-[12rem] flex-col items-center gap-[1rem] rounded-[1.6rem] p-[1.2rem] transition-transform focus:scale-[1.08] focus:bg-white/10";
  const COLORS = ["#d9b45a", "#5b8def", "#e0607e", "#4fb88b", "#a678de", "#f08a4b"];
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="text-[1.1rem] font-semibold uppercase tracking-[0.2em] text-white/50">{serverName || "Jellyfin"}</div>
      <h1 className="mt-[0.5rem] text-[3rem] font-bold">{t("Who's watching?")}</h1>
      <div className="mt-[3rem] flex flex-wrap justify-center gap-[1.6rem]">
        {accounts.map((a, i) => (
          <button key={a.userId} data-nav data-nav-default={i === 0 || undefined} onClick={() => onPick(a)} className={tile}>
            <div className="flex h-[8rem] w-[8rem] items-center justify-center rounded-full text-[3.4rem] font-bold text-black shadow-xl" style={{ background: COLORS[i % COLORS.length] }}>
              {a.userName?.[0]?.toUpperCase()}
            </div>
            <div className="text-[1.3rem] font-semibold">{a.userName}</div>
          </button>
        ))}
        <button data-nav onClick={onAdd} className={tile}>
          <div className="flex h-[8rem] w-[8rem] items-center justify-center rounded-full bg-white/10">
            <Plus className="h-[3rem] w-[3rem]" />
          </div>
          <div className="text-[1.3rem] font-semibold">{t("Add profile")}</div>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- downloads
export function DownloadsView({ downloads, onPlay, onChanged }) {
  const { t } = useI18n();
  const [armed, setArmed] = useState(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault());
    return () => cancelAnimationFrame(id);
  }, []);
  if (!downloads) return <Spinner className="mx-auto mt-[30vh]" />;
  return (
    <div className="no-scrollbar h-full overflow-y-auto px-[4.5rem] pb-[6rem] pt-[1rem]">
      <h1 className="text-[2.6rem] font-extrabold tracking-tight">{t("Downloads on this TV")}</h1>
      <p className="mt-[0.3rem] text-[1.1rem] text-white/55">{t("These play even when the Jellyfin PC is off. Y on one deletes it.")}</p>
      {!downloads.length && <div className="mt-[2rem] text-[1.3rem] text-white/60">{t("Nothing downloaded yet. A film or episode's Download button saves it here.")}</div>}
      <div className="mt-[1.6rem] grid grid-cols-4 gap-x-[1.3rem] gap-y-[1.6rem]">
        {downloads.map((d, i) => (
          <div key={d.path}>
            <button
              data-nav
              data-nav-default={i === 0 || undefined}
              onClick={() => onPlay(d)}
              onKeyDown={async (e) => {
                if (e.key !== "y" && e.key !== "Y") return;
                e.preventDefault();
                if (armed !== d.path) return setArmed(d.path);
                setArmed(null);
                await deleteDownload(d);
                onChanged();
              }}
              className="relative block aspect-video w-full overflow-hidden rounded-[1rem] bg-white/5 ring-1 ring-white/10 transition-transform focus:z-10 focus:scale-[1.06] focus:ring-[0.22rem] focus:ring-white"
            >
              <Art src={d.posterPath ? fileSrc(d.posterPath) : null} item={{ Type: d.Type, Name: d.Name }} className="absolute inset-0" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-[0.9rem] pb-[0.7rem] pt-[2rem] text-start">
                <div className="truncate text-[1.05rem] font-bold">{d.Type === "Episode" ? d.SeriesName : d.Name}</div>
                <div className="truncate text-[0.88rem] text-white/70">
                  {d.Type === "Episode" ? `S${d.ParentIndexNumber}:E${d.IndexNumber} · ${d.Name}` : [d.ProductionYear, runtime(d.RunTimeTicks)].filter(Boolean).join(" · ")}
                </div>
              </div>
              {armed === d.path && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-[0.4rem] bg-black/75 text-[1.05rem] font-semibold">
                  <Trash2 className="h-[1.6rem] w-[1.6rem] text-[#ff8a80]" />
                  {t("Y again to delete")}
                </div>
              )}
              <Play className="absolute end-[0.7rem] top-[0.7rem] h-[1.3rem] w-[1.3rem] fill-white text-white drop-shadow" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- watch together
export function WatchTogether({ sync, auth, onClose }) {
  const { t } = useI18n();
  const [groups, setGroups] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () =>
    sync.api.list().then(
      (g) => setGroups(Array.isArray(g) ? g : []),
      (e) => setError(String(e.message || e)),
    );
  useEffect(() => {
    load();
    const onKey = (e) => {
      if (["Escape", "Backspace", "BrowserBack", "GoBack"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault());
    return () => cancelAnimationFrame(id);
  }, [groups, sync.group]);
  const run = (p) => {
    setBusy(true);
    setError("");
    p.then(
      () => setTimeout(load, 600),
      (e) => setError(String(e.message || e)),
    ).finally(() => setBusy(false));
  };
  const g = sync.group;
  return (
    <div data-nav-scope className="fixed inset-0 z-[96] flex items-center justify-center bg-black/70 fade-up">
      <div className="w-[56rem] rounded-[1.8rem] bg-[#14161c] p-[2.2rem] shadow-2xl ring-1 ring-white/10">
        <div className="text-[1.8rem] font-bold">{t("Watch together")}</div>
        <p className="mt-[0.4rem] text-[1.1rem] leading-relaxed text-white/60">
          {t("Screens in the same group play the same thing at the same moment: pausing or skipping on one does it on all. Join from the Jellyfin app on a phone, computer or another TV (SyncPlay).")}
        </p>
        {!sync.connected && <p className="mt-[0.8rem] text-[1.05rem] text-[#ff8a80]">{t("Not connected to the server's live updates, so this TV can't follow a group right now.")}</p>}
        {g ? (
          <div className="mt-[1.4rem] rounded-[1.2rem] bg-white/[0.06] p-[1.4rem]">
            <div className="text-[1.4rem] font-bold">{g.GroupName}</div>
            <div className="mt-[0.3rem] text-[1.05rem] text-white/60">
              {t("In the group: {names}", { names: (g.Participants || []).join(", ") || auth.userName })} · {t(sync.state)}
            </div>
            <div className="mt-[1.2rem] flex gap-[0.9rem]">
              <ActionButton primary isDefault onClick={onClose}>
                {t("Choose something to watch")}
              </ActionButton>
              <ActionButton onClick={() => run(sync.api.leave())}>{t("Leave the group")}</ActionButton>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-[1.4rem] max-h-[22rem] space-y-[0.4rem] overflow-y-auto">
              {groups === null && <Spinner />}
              {groups?.length === 0 && <div className="text-[1.1rem] text-white/50">{t("No groups right now. Start one, then join it from the other screens.")}</div>}
              {groups?.map((x, i) => (
                <button
                  key={x.GroupId}
                  data-nav
                  data-nav-default={i === 0 || undefined}
                  onClick={() => run(sync.api.join(x.GroupId))}
                  className="focus-row flex w-full items-center justify-between rounded-[0.9rem] px-[1.2rem] py-[0.9rem] text-start text-[1.15rem]"
                >
                  <span className="font-semibold">{x.GroupName}</span>
                  <span className="dim-on-focus text-[1rem] text-white/50">{(x.Participants || []).join(", ")}</span>
                </button>
              ))}
            </div>
            <div className="mt-[1.4rem] flex gap-[0.9rem]">
              <ActionButton primary isDefault={!groups?.length} onClick={() => run(sync.api.create(t("{name}'s group", { name: auth.userName })))}>
                {t("Start a group")}
              </ActionButton>
              <ActionButton onClick={load}>{t("Refresh")}</ActionButton>
              <ActionButton onClick={onClose}>{t("Close")}</ActionButton>
            </div>
          </>
        )}
        {busy && <Spinner className="mt-[1rem]" />}
        {error && <div className="mt-[1rem] text-[1.05rem] text-[#ff8a80]">{error}</div>}
      </div>
    </div>
  );
}
