// The launcher's side of the admin panel / phone remote: answers requests
// that need its state (settings, apps, channels, Jellyfin...). The Rust web
// server forwards them as "admin-call" events.
import { useEffect, useLayoutEffect, useRef } from "react";
import { invoke, isTauri, listen, playExternal } from "./platform";
import { quickChannels, allChannels, matchChannels } from "./channels";
import { makeBackup, backupName, readBackup } from "./backup";
import { checkUpdate, installUpdate, CURRENT } from "./updates";
import { notifyPhones } from "./notify";

// What the phone may change, grouped as on its Settings tab.
export function settingsSchema(s, t) {
  const ar = (v) => [v, t(v)];
  return [
    {
      title: t("Home screen"),
      items: [
        { key: "jellyfin.homeRow", label: t("Jellyfin “Continue watching” on Home"), type: "toggle", value: s.jellyfin?.homeRow !== false },
        { key: "news.enabled", label: t("News ticker"), type: "toggle", value: !!s.news?.enabled },
        { key: "showWeather", label: t("Weather"), type: "toggle", value: s.showWeather !== false },
        { key: "backgrounds.local", label: t("Wallpapers from your location"), type: "toggle", value: !!s.backgrounds?.local },
      ],
    },
    {
      title: t("Prayer"),
      items: [
        { key: "adhan.enabled", label: t("Adhan at prayer times"), type: "toggle", value: !!s.adhan?.enabled },
        { key: "adhan.volume", label: t("Adhan volume"), type: "number", value: s.adhan?.volume },
      ],
    },
    {
      title: t("Ramadan"),
      items: [
        { key: "ramadan.mode", label: t("Ramadan mode"), type: "select", value: s.ramadan?.mode || "auto", options: [["auto", t("Automatic")], ["on", t("On")], ["off", t("Off")]] },
        { key: "ramadan.suhoorAlarm", label: t("Suhoor alarm"), type: "toggle", value: s.ramadan?.suhoorAlarm !== false },
        { key: "ramadan.suhoorMinutes", label: t("Minutes before Fajr"), type: "number", value: s.ramadan?.suhoorMinutes ?? 30 },
        { key: "ramadan.qadr", label: t("Laylat al-Qadr reminders"), type: "toggle", value: s.ramadan?.qadr !== false },
      ],
    },
    {
      title: t("Kids profile"),
      items: [
        { key: "kids.limit", label: t("Minutes a day (0 = no limit)"), type: "number", value: s.kids?.limit ?? 120 },
        { key: "kids.bedtime", label: t("Bedtime"), type: "time", value: s.kids?.bedtime || "20:30" },
        { key: "kids.wake", label: t("Morning"), type: "time", value: s.kids?.wake || "06:30" },
        { key: "kids.tv", label: t("Live TV"), type: "toggle", value: s.kids?.tv !== false },
        { key: "kids.games", label: t("Games"), type: "toggle", value: s.kids?.games !== false },
      ],
    },
    {
      title: t("Doorbell"),
      items: [
        { key: "cameras.doorbell.enabled", label: t("Show the doorbell camera when it rings"), type: "toggle", value: s.cameras?.doorbell?.enabled !== false },
        { key: "cameras.doorbell.chime", label: t("Doorbell chime on the TV"), type: "toggle", value: s.cameras?.doorbell?.chime !== false },
        { key: "cameras.doorbell.notify", label: t("Tell my phones"), type: "toggle", value: s.cameras?.doorbell?.notify !== false },
      ],
    },
    {
      title: t("Morning screen"),
      items: [
        { key: "morning.enabled", label: t("Show the morning screen"), hint: t("Weather, prayer times and a hadith at the time you choose"), type: "toggle", value: !!s.morning?.enabled },
        { key: "morning.time", label: t("Time"), type: "time", value: s.morning?.time || "07:00" },
        { key: "morning.minutes", label: t("Stays for (minutes)"), type: "number", value: s.morning?.minutes ?? 10 },
      ],
    },
    {
      title: t("Phone notifications"),
      items: [
        { key: "notify.enabled", label: t("Send notifications to phones"), hint: t("Subscribe to the topic in the ntfy app: {topic}", { topic: s.notify?.topic || "–" }), type: "toggle", value: !!s.notify?.enabled },
        { key: "notify.adhan", label: t("When the adhan starts"), type: "toggle", value: s.notify?.adhan !== false },
        { key: "notify.recordings", label: t("When a recording finishes"), type: "toggle", value: s.notify?.recordings !== false },
      ],
    },
    {
      title: t("Watching"),
      items: [
        { key: "pip.corner", label: t("Small Live TV window"), type: "select", value: s.pip?.corner || "br", options: [["br", t("Bottom right")], ["bl", t("Bottom left")], ["tr", t("Top right")], ["tl", t("Top left")]] },
        { key: "pip.size", label: t("Its size"), type: "select", value: s.pip?.size || 480, options: [[400, t("Small")], [480, t("Medium")], [640, t("Large")]] },
        { key: "pip.muted", label: t("Start it muted"), type: "toggle", value: !!s.pip?.muted },
        { key: "jellyfin.wol.enabled", label: t("Wake the Jellyfin PC when it's asleep"), type: "toggle", value: s.jellyfin?.wol?.enabled !== false },
        { key: "dpad", label: t("Remote navigation in apps"), type: "toggle", value: s.dpad !== false },
      ],
    },
    {
      title: t("Updates"),
      items: [
        { key: "updates.auto", label: t("Check for updates every day"), type: "toggle", value: s.updates?.auto !== false },
        { key: "updates.repo", label: t("GitHub repository"), hint: "owner/name", type: "text", value: s.updates?.repo || "" },
        { key: "updates.token", label: t("GitHub token (read-only)"), hint: s.updates?.token ? t("Saved. Type a new one to replace it.") : t("Needed for a private repository"), type: "text", value: "" },
      ],
    },
  ].map((g) => ({ ...g, items: g.items.map((i) => (i.type === "select" ? { ...i, options: i.options.map((o) => (Array.isArray(o) ? o : ar(o))) } : i)) }));
}

export function useAdminBridge(ctx) {
  const ref = useRef(ctx);
  useLayoutEffect(() => {
    ref.current = ctx;
  });

  useEffect(() => {
    if (!isTauri()) return;
    const handle = async ({ action, args = {}, caller }) => {
      const c = ref.current;
      const { settings: s, update, t } = c;
      const findChannel = async (id) => quickChannels(s).find((x) => x.url === id) || (await allChannels(s)).find((x) => x.url === id);
      switch (action) {
        case "status":
          return { ...c.screen(), pip: await invoke("pip_running").catch(() => false), ...(c.status?.() || {}) };
        case "apps":
          return { apps: c.apps.filter((a) => !a.hidden).map((a) => ({ id: a.id, name: a.name, bg: a.bg })) };
        case "openApp": {
          const app = c.apps.find((a) => a.id === args.id);
          if (!app) return { error: "No such app" };
          c.onLaunch(app);
          return { ok: true };
        }
        case "cast":
          return c.cast(String(args.url || ""));
        case "upload":
          if (args.kind === "photo") c.showPhoto(args.path);
          else if (args.kind === "video") await invoke("play_media", { entries: [{ url: args.path, title: t("From your phone"), start: 0, aid: null, sid: null, sub_files: [] }], headers: [], audioOnly: false });
          else if (args.kind === "update") {
            c.toast(t("Installing the update…"));
            invoke("update_install", { path: args.path }).catch((e) => c.toast(String(e)));
          } else if (args.kind === "backup") {
            const text = await invoke("backup_read", { path: args.path });
            c.restore(readBackup(text));
          }
          return { ok: true };
        case "channels": {
          const list = args.q ? matchChannels(await allChannels(s), args.q) : quickChannels(s).slice(0, 60);
          return { channels: list.map((x) => ({ id: x.url, name: x.name, group: x.group || "" })) };
        }
        case "playChannel": {
          const ch = await findChannel(args.id);
          if (!ch) return { error: "Channel not found" };
          await playExternal([ch], 0);
          return { ok: true };
        }
        case "pip": {
          const ch = await findChannel(args.id);
          if (!ch) return { error: "Channel not found" };
          await invoke("pip_start", { url: ch.url, title: ch.name, corner: s.pip?.corner || "br", size: s.pip?.size || 480, muted: !!s.pip?.muted, userAgent: ch.ua || null });
          return { ok: true };
        }
        case "pipStop":
          await invoke("pip_stop");
          return { ok: true };
        case "record": {
          const ch = await findChannel(args.id);
          if (!ch) return { error: "Channel not found" };
          const minutes = Math.max(5, Math.min(600, +args.minutes || 60));
          if (args.at) {
            const [hh, mm] = String(args.at).split(":").map(Number);
            const at = new Date();
            at.setHours(hh, mm, 0, 0);
            if (at < new Date()) at.setDate(at.getDate() + 1);
            const item = { id: Math.random().toString(36).slice(2, 10), url: ch.url, name: ch.name, ua: ch.ua || null, minutes, at: at.getTime() };
            update("recordings.schedule", (l = []) => [...l, item]);
            return { ok: true, at: item.at };
          }
          await invoke("record_start", { url: ch.url, name: ch.name, minutes, userAgent: ch.ua || null });
          return { ok: true };
        }
        case "schedule":
          return { items: (s.recordings?.schedule || []).slice().sort((a, b) => a.at - b.at) };
        case "unschedule":
          update("recordings.schedule", (l = []) => l.filter((x) => x.id !== args.id));
          return { ok: true };
        case "jobs":
          return { jobs: await invoke("media_jobs") };
        case "jobStop":
          await invoke("job_stop", { id: args.id });
          return { ok: true };
        case "playFile": {
          const name = String(args.path).split("/").pop().replace(/\.(ts|mkv|mp4)$/i, "");
          await invoke("play_media", { entries: [{ url: args.path, title: name, start: 0, aid: null, sid: null, sub_files: [] }], headers: [], audioOnly: false });
          return { ok: true };
        }
        case "settings.get":
          return { groups: settingsSchema(s, t) };
        case "settings.set": {
          const allowed = settingsSchema(s, t).flatMap((g) => g.items.map((i) => i.key));
          if (!allowed.includes(args.key)) return { error: "Not allowed" };
          if (args.key === "updates.token" && !args.value) return { ok: true };
          update(args.key, args.value);
          return { ok: true };
        }
        case "backup.export":
          return { backup: makeBackup(s), name: backupName() };
        case "backup.save": {
          const targets = await invoke("backup_targets");
          const target = targets.find((x) => x.usb) || targets[0];
          await invoke("backup_write", { dir: target.path, name: backupName(), contents: JSON.stringify(makeBackup(s), null, 2) });
          return { where: target.label };
        }
        case "update.check": {
          const r = await checkUpdate(s.updates);
          return { current: r.current || CURRENT, latest: r.latest, available: !!r.available, notes: r.notes, problem: r.error || null };
        }
        case "update.install": {
          const r = await checkUpdate(s.updates);
          if (!r.available) return { error: r.error || "No update available." };
          c.toast(t("Downloading the update…"));
          installUpdate(s.updates, r.release).catch((e) => c.toast(String(e)));
          return { ok: true };
        }
        case "admin.devices":
          return {
            devices: (s.admin?.devices || []).map((d) => ({ id: d.token.slice(0, 10), name: d.name, added: d.added, current: d.token.slice(0, 10) === caller })),
          };
        case "admin.forget": {
          const left = (s.admin?.devices || []).filter((d) => d.token.slice(0, 10) !== args.id);
          update("admin.devices", left);
          return { ok: true };
        }
        case "jellyfin.wake": {
          const mac = s.jellyfin?.wol?.mac;
          if (!mac) return { error: "The Jellyfin PC's address isn't known yet. Open Jellyfin once while the PC is on." };
          const host = (() => {
            try {
              return new URL(s.appUrls?.jellyfin || "http://localhost").hostname;
            } catch {
              return null;
            }
          })();
          await invoke("wake_on_lan", { mac, host });
          return { ok: true, message: "Wake-up sent. The PC usually takes 10–30 seconds." };
        }
        case "notify.test":
          if (!s.notify?.enabled || !s.notify?.topic) return { error: "Turn on phone notifications first (Settings tab)." };
          await notifyPhones(s.notify, "YousufOS", t("Test notification from your TV"), "white_check_mark");
          return { ok: true };
        default:
          // Features that keep their state in App (Kids profile, sleep timer, cameras…).
          if (c.extra?.[action]) return c.extra[action](args, caller);
          return { error: `Unknown action ${action}` };
      }
    };
    const off = listen("admin-call", async (e) => {
      let result;
      try {
        result = (await handle(e)) ?? { ok: true };
      } catch (err) {
        result = { error: String(err?.message || err) };
      }
      invoke("admin_reply", { id: e.id, result }).catch(() => {});
    });
    const off2 = listen("admin-paired", ({ token, name }) => {
      ref.current.update("admin.devices", (l = []) => [...l, { token, name, added: Date.now() }]);
      ref.current.toast(ref.current.t("{name} is now paired", { name }));
    });
    return () => {
      off.then((f) => f());
      off2.then((f) => f());
    };
  }, []);
}

// Keeps the web server in step with the settings (on/off, PIN, devices).
export function useAdminServer(admin) {
  const key = JSON.stringify([admin?.enabled, admin?.pin, (admin?.devices || []).map((d) => d.token)]);
  useEffect(() => {
    if (!isTauri()) return;
    invoke("admin_configure", { enabled: !!admin?.enabled && !!admin?.pin, pin: admin?.pin || "", tokens: (admin?.devices || []).map((d) => d.token) }).catch((e) =>
      console.warn("admin", e),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// Starts scheduled recordings when their time comes (checked every minute).
export function useRecordingScheduler(settings, update, now) {
  const list = settings.recordings?.schedule || [];
  useEffect(() => {
    if (!isTauri() || !list.length) return;
    const due = list.filter((r) => r.at <= now + 30000);
    if (!due.length) return;
    for (const r of due) {
      // Missed by more than its length (TV was off): drop it.
      if (now - r.at > r.minutes * 60000) continue;
      const left = Math.max(1, Math.round(r.minutes - (now - r.at) / 60000));
      invoke("record_start", { url: r.url, name: r.name, minutes: left, userAgent: r.ua || null }).catch((e) => console.warn("record", e));
    }
    update("recordings.schedule", (l = []) => l.filter((r) => !due.some((d) => d.id === r.id)));
  }, [now, list, update]);
}
