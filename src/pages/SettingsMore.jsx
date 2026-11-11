// Settings for 1.8: Ramadan mode, the Kids profile, cameras and the sleep timer.
import { useEffect, useState } from "react";
import { Baby, BellRing, KeyRound, Moon, Plus, Trash2 } from "lucide-react";
import { ActionRow, OptionRow, SectionTitle, ToggleRow } from "../components/controls";
import PinPad from "../components/PinPad";
import TextEntry from "../components/TextEntry";
import { haBase, newId } from "../lib/cameras";
import { invoke, isTauri } from "../lib/platform";
import { minutesUsed } from "../lib/kids";
import { useI18n, useSettings } from "../lib/settings-store";

function Note({ children }) {
  return <div className="px-[1.5rem] pb-[0.4rem] pt-[0.6rem] text-[1rem] leading-relaxed text-ink-faint">{children}</div>;
}

// ------------------------------------------------------------- Ramadan
export function RamadanRows({ settings, update, actions }) {
  const { t } = useI18n();
  const r = settings.ramadan || {};
  return (
    <>
      <SectionTitle>Ramadan · رمضان</SectionTitle>
      <OptionRow
        label="Ramadan mode"
        hint={r.mode === "on" ? "On now, even outside Ramadan (to try it)" : r.mode === "off" ? "Off" : "Turns on by itself when Ramadan begins"}
        value={r.mode || "auto"}
        onChange={(v) => update("ramadan.mode", v)}
        options={[{ value: "auto", label: "Automatic" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]}
      />
      <ToggleRow label="Suhoor alarm" hint="A chime and a message on the TV (and your phones) before Fajr" value={r.suhoorAlarm !== false} onChange={(v) => update("ramadan.suhoorAlarm", v)} />
      {r.suhoorAlarm !== false && (
        <OptionRow label="Before Fajr" value={r.suhoorMinutes ?? 30} onChange={(v) => update("ramadan.suhoorMinutes", v)}
          options={[15, 20, 30, 45, 60, 90].map((m) => ({ value: m, label: t("{n} min", { n: m }) }))} />
      )}
      <ToggleRow label="Dua for breaking the fast at Maghrib" value={r.iftarDua !== false} onChange={(v) => update("ramadan.iftarDua", v)} />
      <ToggleRow label="Laylat al-Qadr reminders" hint="On the odd nights of the last ten, after Isha" value={r.qadr !== false} onChange={(v) => update("ramadan.qadr", v)} />
      <ToggleRow label="Suhoor and iftar on my phones" hint="Needs phone notifications (Settings → Phone & Remote)" value={r.notify !== false} onChange={(v) => update("ramadan.notify", v)} />
      <ActionRow label="Preview the suhoor alarm" Icon={BellRing} onAction={actions.previewSuhoor} />
      <ActionRow label="Preview the iftar screen" Icon={Moon} onAction={actions.previewIftar} />
      <Note>{t("Ramadan mode adds suhoor and iftar times to Home, and Taraweeh and Qur'an khatm trackers to the Prayer page.")}</Note>
    </>
  );
}


// ------------------------------------------------------------- Kids profile
export function KidsSection({ settings, update, setStatus, actions }) {
  const { t } = useI18n();
  const { apps: allApps } = useSettings();
  const k = settings.kids || {};
  const [pinStep, setPinStep] = useState(null); // { first } while setting a PIN
  const accounts = settings.jellyfin?.accounts || [];
  const used = minutesUsed(k);
  const allowed = new Set(k.apps || []);
  const toggleApp = (id, on) => update("kids.apps", (cur = []) => (on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id)));
  const times = (from, to) => {
    const out = [];
    for (let m = from; m <= to; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 ? "30" : "00"}`);
    return out;
  };
  return (
    <>
      <SectionTitle>Kids profile</SectionTitle>
      <Note>{t("A simpler YousufOS for children: only the apps and channels you allow, a daily time limit and a bedtime. Leaving it needs your PIN.")}</Note>
      {k.pin ? (
        <ActionRow isDefault label="Switch to the Kids profile now" hint="Leave it from the sidebar with your PIN" Icon={Baby} onAction={() => actions.setKids(true)} />
      ) : null}
      <ActionRow
        isDefault={!k.pin}
        label={k.pin ? "Change the parent PIN" : "Set a parent PIN"}
        hint={k.pin ? undefined : "Needed before the Kids profile can be used"}
        Icon={KeyRound}
        onAction={() => setPinStep({})}
      />
      <SectionTitle>What the kids can use</SectionTitle>
      <ToggleRow label="Live TV" hint="Kids channels and the Makkah and Madinah channels only" value={k.tv !== false} onChange={(v) => update("kids.tv", v)} />
      <ToggleRow label="Games" value={k.games !== false} onChange={(v) => update("kids.games", v)} />
      <ToggleRow label="Qur'an" value={k.quran !== false} onChange={(v) => update("kids.quran", v)} />
      <OptionRow
        label="Jellyfin"
        hint={accounts.length ? "Sign in a child's Jellyfin account on this TV to choose it here" : "Sign in to Jellyfin on this TV first"}
        value={k.jellyfin || ""}
        onChange={(v) => update("kids.jellyfin", v)}
        options={[{ value: "", label: "Not in the Kids profile" }, ...accounts.map((a) => ({ value: a.userId, label: a.userName }))]}
      />
      {allApps.filter((a) => !a.hidden && a.id !== "jellyfin").map((a) => (
        <ToggleRow key={a.id} label={a.name} value={allowed.has(a.id)} onChange={(v) => toggleApp(a.id, v)} />
      ))}
      <SectionTitle>Time</SectionTitle>
      <OptionRow
        label="Each day"
        hint={k.limit ? t("{used} of {limit} minutes used today", { used, limit: k.limit }) : undefined}
        value={k.limit ?? 120}
        onChange={(v) => update("kids.limit", v)}
        options={[0, 30, 45, 60, 90, 120, 180, 240].map((m) => ({ value: m, label: m ? t("{n} min", { n: m }) : "No limit" }))}
      />
      <OptionRow label="Bedtime" value={k.bedtime ?? "20:30"} onChange={(v) => update("kids.bedtime", v)}
        options={[{ value: "", label: "None" }, ...times(18 * 60, 23 * 60).map((x) => ({ value: x, label: x }))]} />
      {k.bedtime && (
        <OptionRow label="Morning" hint="When bedtime ends" value={k.wake || "06:30"} onChange={(v) => update("kids.wake", v)}
          options={times(5 * 60, 9 * 60).map((x) => ({ value: x, label: x }))} />
      )}
      {pinStep && (
        <PinPad
          title={pinStep.first ? t("Type it again") : t("New parent PIN")}
          hint={t("4 digits")}
          onCancel={() => setPinStep(null)}
          onSubmit={(pin) => {
            if (!pinStep.first) {
              setPinStep({ first: pin });
              return true;
            }
            if (pin !== pinStep.first) {
              setPinStep({});
              return false;
            }
            update("kids.pin", pin);
            setPinStep(null);
            setStatus?.(t("Parent PIN saved"));
            return true;
          }}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------- Cameras & doorbell
export function CamerasSection({ settings, update, actions }) {
  const { t } = useI18n();
  const c = settings.cameras || {};
  const list = c.list || [];
  const d = c.doorbell || {};
  const [editing, setEditing] = useState(null); // { field, cam?, ... }
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (isTauri()) invoke("admin_info").then(setInfo, () => {});
  }, []);
  const ip = info?.addresses?.[0];
  const hook = d.key && ip ? `http://${ip}:${info.port}/api/doorbell?key=${d.key}` : null;
  const saveCam = (cam) => update("cameras.list", (cur = []) => (cur.some((x) => x.id === cam.id) ? cur.map((x) => (x.id === cam.id ? cam : x)) : [...cur, cam]));
  const removeCam = (id) => update("cameras.list", (cur = []) => cur.filter((x) => x.id !== id));

  // Text entry steps: a new camera asks for its name, then its address / entity.
  const entry = editing && (
    <TextEntry
      key={editing.title}
      layout="text"
      title={editing.title}
      hint={editing.hint}
      value={editing.value || ""}
      secret={editing.secret}
      onClose={() => setEditing(null)}
      onSave={(v) => {
        const value = v.trim();
        const next = editing.save(value);
        setEditing(next || null);
      }}
    />
  );
  const addCamera = (kind) =>
    setEditing({
      title: t("Camera name"),
      hint: t("e.g. Front door"),
      save: (name) => ({
        title: kind === "ha" ? t("Home Assistant camera") : t("Camera address"),
        hint: kind === "ha" ? t("The entity, e.g. camera.front_door") : t("rtsp://user:password@192.168.1.40:554/stream1, or an http(s) address"),
        value: kind === "ha" ? "camera." : "rtsp://",
        save: (addr) => {
          if (!addr) return null;
          const cam = { id: newId(), name: name || t("Camera"), ...(kind === "ha" ? { entity: addr } : { url: addr }) };
          saveCam(cam);
          if (!d.camera) update("cameras.doorbell.camera", cam.id);
          return null;
        },
      }),
    });

  return (
    <>
      <SectionTitle>Cameras</SectionTitle>
      <Note>{t("Cameras show on the Cameras page and pop up when the doorbell rings. Any camera with a stream address works (RTSP, HLS, MJPEG), and so does any camera in Home Assistant.")}</Note>
      {list.map((cam) => (
        <ActionRow
          key={cam.id}
          label={cam.name}
          hint={`${cam.entity || cam.url} · ${t("OK to remove")}`}
          Icon={Trash2}
          confirm
          danger
          onAction={() => removeCam(cam.id)}
        />
      ))}
      <ActionRow isDefault label="Add a camera" hint="With its stream address" Icon={Plus} onAction={() => addCamera("url")} />
      <ActionRow label="Add a Home Assistant camera" hint={t("From {address}", { address: haBase(settings) })} Icon={Plus} onAction={() => addCamera("ha")} />
      <ActionRow
        label="Home Assistant access token"
        hint={c.haToken ? "Saved. OK to replace it." : "Home Assistant → your profile → Security → Long-lived access tokens"}
        Icon={KeyRound}
        onAction={() => setEditing({ title: t("Home Assistant access token"), secret: true, save: (v) => (update("cameras.haToken", v), null) })}
      />

      <SectionTitle>Doorbell</SectionTitle>
      <ToggleRow label="Show the doorbell camera when it rings" hint="A small window with the camera, a chime and a message on your phones" value={d.enabled !== false} onChange={(v) => update("cameras.doorbell.enabled", v)} />
      <OptionRow label="Doorbell camera" value={d.camera || ""} onChange={(v) => update("cameras.doorbell.camera", v)}
        options={[{ value: "", label: "None" }, ...list.map((x) => ({ value: x.id, label: x.name }))]} />
      <OptionRow label="Window stays for" value={d.seconds ?? 45} onChange={(v) => update("cameras.doorbell.seconds", v)}
        options={[20, 30, 45, 60, 90, 120].map((s) => ({ value: s, label: t("{n} sec", { n: s }) }))} />
      <ToggleRow label="Doorbell chime on the TV" value={d.chime !== false} onChange={(v) => update("cameras.doorbell.chime", v)} />
      <ActionRow
        label="Ring from Home Assistant"
        hint={d.entity ? t("Watching {entity}", { entity: d.entity }) : "The doorbell's button or ring entity, e.g. binary_sensor.doorbell_ring"}
        Icon={BellRing}
        onAction={() => setEditing({ title: t("Doorbell ring entity"), hint: "binary_sensor.… or event.…", value: d.entity || "", save: (v) => (update("cameras.doorbell.entity", v), null) })}
      />
      {d.key ? (
        <Note>
          {settings.admin?.enabled
            ? t("Or ring it from anything on your network (a Home Assistant automation, a script): {address}", { address: hook || "…" })
            : t("To ring it from other devices too, turn on the admin panel (Settings → Phone & Remote).")}
        </Note>
      ) : null}
      <ActionRow label="Test the doorbell" Icon={BellRing} onAction={() => actions.ringDoorbell()} />
      {entry}
    </>
  );
}
