// Settings added in 1.7: phone remote / admin panel, phone notifications,
// morning screen, picture-in-picture, updates and backups.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, KeyRound, RefreshCw, Save, Send, Sunrise, Trash2, Upload, Pencil } from "lucide-react";
import { ActionRow, OptionRow, SectionTitle, ToggleRow } from "../components/controls";
import TextEntry from "../components/TextEntry";
import { invoke, isTauri } from "../lib/platform";
import { useI18n } from "../lib/settings-store";
import { newTopic, notifyPhones } from "../lib/notify";
import { makeBackup, backupName, readBackup } from "../lib/backup";
import { checkUpdate, installUpdate, CURRENT } from "../lib/updates";

const newPin = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, "0");
};

function Qr({ text, size = 11 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: 360, color: { dark: "#0b0c10", light: "#ffffff" } }).then((u) => alive && setSrc(u), () => {});
    return () => {
      alive = false;
    };
  }, [text]);
  return src ? <img src={src} alt="" className="rounded-[0.8rem] bg-white p-[0.3rem]" style={{ width: `${size}rem`, height: `${size}rem` }} /> : null;
}

function Note({ children }) {
  return <div className="px-[1.5rem] pb-[0.6rem] pt-[0.2rem] text-[1rem] leading-relaxed text-ink-faint">{children}</div>;
}

// ------------------------------------------------------------- phone & remote
export function PhoneSection({ settings, update, setStatus }) {
  const { t } = useI18n();
  const admin = settings.admin || {};
  const notify = settings.notify || {};
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!isTauri()) return;
    const id = setTimeout(() => invoke("admin_info").then(setInfo, () => {}), 600);
    return () => clearTimeout(id);
  }, [admin.enabled, admin.pin]);
  const address = info?.addresses?.[0] ? `http://${info.addresses[0]}:${info.port}` : null;
  const ntfyUrl = `${(notify.server || "https://ntfy.sh").replace(/\/+$/, "")}/${notify.topic}`;

  return (
    <>
      <SectionTitle>Admin panel</SectionTitle>
      <ToggleRow
        label="Control YousufOS from your phone"
        hint="A remote, keyboard, apps, Live TV, recordings, settings and more, on any phone, tablet or computer on your Wi-Fi"
        value={!!admin.enabled}
        onChange={(v) => update("admin", (a = {}) => ({ ...a, enabled: v, pin: a.pin || newPin() }))}
      />
      {admin.enabled && (
        <>
          <div className="mx-[1.5rem] my-[0.6rem] flex items-center gap-[2rem] rounded-[1.2rem] bg-white/[0.05] p-[1.4rem]">
            {address && <Qr text={address} />}
            <div className="min-w-0">
              <div className="text-[1rem] text-ink-faint">{t("On your phone, scan the code or open")}</div>
              <div className="text-[1.6rem] font-bold tabular" dir="ltr">{address || t("(connecting to the network…)")}</div>
              <div className="mt-[0.8rem] text-[1rem] text-ink-faint">{t("PIN")}</div>
              <div className="text-[2.4rem] font-bold tracking-[0.3em] text-accent tabular" dir="ltr">{admin.pin}</div>
              <div className="mt-[0.4rem] text-[0.95rem] text-ink-faint">{t("Then Share → Add to Home Screen, and it opens like an app.")}</div>
            </div>
          </div>
          <ActionRow label="New PIN" hint="Phones already paired stay paired" Icon={KeyRound} onAction={() => update("admin.pin", newPin())} />
          {(admin.devices || []).map((d) => (
            <ActionRow
              key={d.token}
              label={d.name}
              hint={t("Paired {date} · OK to remove", { date: new Date(d.added).toLocaleDateString() })}
              Icon={Trash2}
              confirm
              danger
              onAction={() => update("admin.devices", (l = []) => l.filter((x) => x.token !== d.token))}
            />
          ))}
        </>
      )}

      <SectionTitle>Phone notifications</SectionTitle>
      <ToggleRow
        label="Send notifications to phones"
        hint="The adhan and finished recordings, through the free ntfy app (iPhone and Android)"
        value={!!notify.enabled}
        onChange={(v) => update("notify", (n = {}) => ({ ...n, enabled: v, topic: n.topic || newTopic() }))}
      />
      {notify.enabled && notify.topic && (
        <>
          <div className="mx-[1.5rem] my-[0.6rem] flex items-center gap-[2rem] rounded-[1.2rem] bg-white/[0.05] p-[1.4rem]">
            <Qr text={ntfyUrl} size={9} />
            <div className="min-w-0 text-[1.05rem] leading-relaxed text-ink-dim">
              <div>{t("1. Install “ntfy” from the App Store or Google Play.")}</div>
              <div>{t("2. Tap + and subscribe to this topic:")}</div>
              <div className="my-[0.3rem] text-[1.5rem] font-bold text-accent" dir="ltr">{notify.topic}</div>
              <div>{t("Or scan the code. Keep the topic private: anyone who knows it gets the notifications.")}</div>
            </div>
          </div>
          <ToggleRow label="When the adhan starts" value={notify.adhan !== false} onChange={(v) => update("notify.adhan", v)} />
          <ToggleRow label="When a recording finishes" value={notify.recordings !== false} onChange={(v) => update("notify.recordings", v)} />
          <ActionRow
            label="Send a test notification"
            Icon={Send}
            onAction={() => notifyPhones(notify, "YousufOS", t("Test notification from your TV"), "white_check_mark").then(() => setStatus(t("Sent. It should arrive in a few seconds.")))}
          />
          <ActionRow label="New topic" hint="Phones will need to subscribe again" Icon={RefreshCw} confirm onAction={() => update("notify.topic", newTopic())} />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------- morning screen
export function MorningRows({ settings, update, preview }) {
  const m = settings.morning || {};
  const times = [];
  for (let h = 4; h <= 11; h++) for (const mm of ["00", "30"]) times.push(`${String(h).padStart(2, "0")}:${mm}`);
  return (
    <>
      <SectionTitle>Morning screen</SectionTitle>
      <ToggleRow label="Morning screen" hint="Once a day: the date, weather, today's prayer times and a hadith" value={!!m.enabled} onChange={(v) => update("morning.enabled", v)} />
      {m.enabled && (
        <>
          <OptionRow label="Time" value={m.time || "07:00"} onChange={(v) => update("morning.time", v)} options={times.map((x) => ({ value: x, label: x }))} />
          <OptionRow
            label="Days"
            value={(m.days || []).length === 7 ? "all" : (m.days || []).join(",") === "1,2,3,4,5" ? "week" : (m.days || []).join(",") === "0,1,2,3,4" ? "uae" : "all"}
            onChange={(v) => update("morning.days", v === "week" ? [1, 2, 3, 4, 5] : v === "uae" ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6])}
            options={[
              { value: "all", label: "Every day" },
              { value: "uae", label: "Sunday – Thursday" },
              { value: "week", label: "Monday – Friday" },
            ]}
          />
          <OptionRow label="Stays for" value={m.minutes ?? 10} onChange={(v) => update("morning.minutes", v)} options={[5, 10, 20, 30, 60].map((x) => ({ value: x, label: `${x} min` }))} />
          <ToggleRow label="Gentle chime" value={m.chime !== false} onChange={(v) => update("morning.chime", v)} />
          <ActionRow label="Show it now" Icon={Sunrise} onAction={preview} />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------- picture-in-picture
export function PipRows({ settings, update }) {
  const { t } = useI18n();
  const p = settings.pip || {};
  return (
    <>
      <SectionTitle>Small window (picture-in-picture)</SectionTitle>
      <Note>
        {t("Press X on a channel to keep it playing in a small window while you use the rest of YousufOS or another app. X on any channel again closes it.")}
      </Note>
      <OptionRow label="Corner" value={p.corner || "br"} onChange={(v) => update("pip.corner", v)} options={[{ value: "br", label: "Bottom right" }, { value: "bl", label: "Bottom left" }, { value: "tr", label: "Top right" }, { value: "tl", label: "Top left" }]} />
      <OptionRow label="Size" value={p.size || 480} onChange={(v) => update("pip.size", v)} options={[{ value: 400, label: "Small" }, { value: 480, label: "Medium" }, { value: 640, label: "Large" }]} />
      <ToggleRow label="Start it muted" value={!!p.muted} onChange={(v) => update("pip.muted", v)} />
    </>
  );
}

// ------------------------------------------------------------- updates
export function UpdatesRows({ settings, update, setStatus }) {
  const { t } = useI18n();
  const u = settings.updates || {};
  const [editing, setEditing] = useState(null);
  const [state, setState] = useState(null);
  const check = async () => {
    setState({ busy: true });
    const r = await checkUpdate(u);
    setState(r);
    update("updates.lastCheck", Date.now());
  };
  const install = async () => {
    if (!state?.release) return;
    setState({ ...state, busy: true });
    try {
      await installUpdate(u, state.release, (step) => setStatus(step === "download" ? t("Downloading the update…") : t("Installing: enter your password when asked")));
    } catch (e) {
      setStatus(String(e));
      setState({ ...state, busy: false });
    }
  };
  const status = state?.busy
    ? t("Checking…")
    : state?.error
      ? state.error
      : state?.available
        ? t("Version {version} is available", { version: state.latest })
        : state
          ? t("Up to date")
          : t("This TV has {version}", { version: CURRENT });
  return (
    <>
      <SectionTitle>Updates</SectionTitle>
      <ActionRow label={state?.available ? "Install the update" : "Check for updates"} hint={status} Icon={state?.available ? Download : RefreshCw} onAction={state?.available ? install : check} />
      <ToggleRow label="Check every day" value={u.auto !== false} onChange={(v) => update("updates.auto", v)} />
      <ActionRow label="GitHub repository" hint={u.repo || t("Not set (owner/name)")} Icon={Pencil} onAction={() => setEditing("repo")} />
      <ActionRow label="GitHub token" hint={u.token ? t("Saved") : t("Needed for a private repository: a fine-grained token with read access to its contents")} Icon={KeyRound} onAction={() => setEditing("token")} />
      {editing && (
        <TextEntry
          layout="text"
          secret={editing === "token"}
          title={editing === "repo" ? t("GitHub repository") : t("GitHub token")}
          hint={editing === "repo" ? t("For example: yousuf/yousufos") : t("Typing is easier from the phone remote (Admin panel → Remote → Keyboard).")}
          value={editing === "repo" ? u.repo : ""}
          saveLabel={t("Save")}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            update(`updates.${editing}`, v.trim());
            setEditing(null);
            setState(null);
          }}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------- backups
export function BackupRows({ settings, replace, setStatus }) {
  const { t } = useI18n();
  const [list, setList] = useState(null);
  const save = async () => {
    try {
      const targets = await invoke("backup_targets");
      const target = targets.find((x) => x.usb) || targets[0];
      const path = await invoke("backup_write", { dir: target.path, name: backupName(), contents: JSON.stringify(makeBackup(settings), null, 2) });
      setStatus(t("Backup saved: {path}", { path }));
    } catch (e) {
      setStatus(String(e));
    }
  };
  return (
    <>
      <SectionTitle>Backup</SectionTitle>
      <ActionRow label="Save a backup" hint="To a USB drive if one is plugged in, otherwise your home folder (YousufOS-Backups)" Icon={Save} onAction={save} />
      <ActionRow label="Restore a backup" hint={list ? t("{n} found. Choose one below.", { n: list.length }) : "Shows backups on this TV and USB drives"} Icon={Upload} onAction={() => invoke("backup_list").then(setList, (e) => setStatus(String(e)))} />
      {list?.map((b) => (
        <ActionRow
          key={b.path}
          label={b.name}
          hint={t("{where} · {date} · OK twice to restore", { where: b.where, date: new Date(b.modified * 1000).toLocaleString() })}
          Icon={Upload}
          confirm
          onAction={async () => {
            try {
              replace(readBackup(await invoke("backup_read", { path: b.path })));
              setStatus(t("Settings restored from the backup"));
            } catch (e) {
              setStatus(String(e));
            }
          }}
        />
      ))}
      <Note>{t("Backups can also be downloaded to a phone and restored from it: admin panel → Settings.")}</Note>
    </>
  );
}
