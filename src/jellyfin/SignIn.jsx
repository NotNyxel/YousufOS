// Signing in to Jellyfin from the sofa: a Quick Connect code to approve on the
// phone, or a user + password typed with the on-screen keyboard.
import { useEffect, useRef, useState } from "react";
import { Globe, KeyRound, RefreshCw, Server, Smartphone, UserRound } from "lucide-react";
import TextEntry from "../components/TextEntry";
import { focusDefault } from "../lib/nav";
import { useI18n } from "../lib/settings-store";
import { ActionButton, Spinner } from "./ui";

export default function SignIn({ client, onSignedIn, onChangeServer, onOpenWeb }) {
  const { t } = useI18n();
  const [server, setServer] = useState({ state: "checking" });
  const [qc, setQc] = useState(null); // { code, secret } | { off: true } | { error }
  const [users, setUsers] = useState([]);
  const [entry, setEntry] = useState(null); // { step: "name" | "password", name }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const done = useRef(false);

  // Is the server there?
  useEffect(() => {
    let alive = true;
    client
      .publicInfo()
      .then((info) => alive && setServer({ state: "ok", info }))
      .catch((e) => alive && setServer({ state: "error", error: e }));
    client.publicUsers().then((u) => alive && setUsers(Array.isArray(u) ? u : [])).catch(() => {});
    return () => {
      alive = false;
    };
  }, [client, attempt]);

  // Quick Connect: start a code, then check every few seconds until it's approved.
  useEffect(() => {
    if (server.state !== "ok") return;
    let alive = true;
    let timer;
    const start = async () => {
      try {
        const enabled = await client.quickConnectEnabled();
        if (!enabled) return alive && setQc({ off: true });
        const r = await client.quickConnectStart();
        if (!alive) return;
        setQc({ code: r.Code, secret: r.Secret });
        const poll = async () => {
          try {
            const s = await client.quickConnectState(r.Secret);
            if (!alive) return;
            if (s?.Authenticated) {
              const res = await client.quickConnectFinish(r.Secret);
              if (alive && !done.current) {
                done.current = true;
                onSignedIn(res);
              }
              return;
            }
          } catch (e) {
            // The code expired (the server forgets it after a few minutes): get a new one.
            if (e.status === 404 || e.status === 401) return alive && start();
          }
          timer = setTimeout(poll, 2500);
        };
        timer = setTimeout(poll, 2500);
      } catch (e) {
        if (alive) setQc({ error: e });
      }
    };
    start();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [client, server.state, onSignedIn]);

  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault());
    return () => cancelAnimationFrame(id);
  }, [server.state, users.length]);

  const signIn = async (name, password) => {
    setBusy(true);
    setError("");
    try {
      const res = await client.signIn(name, password);
      done.current = true;
      onSignedIn(res);
    } catch (e) {
      setError(e.status === 401 ? t("Wrong user name or password.") : t("Couldn't sign in: {error}", { error: e.message }));
      setBusy(false);
    }
  };

  if (server.state === "checking")
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[1.4rem] text-[1.3rem] text-white/70">
        <Spinner />
        {t("Connecting to {server}…", { server: client.base.replace(/^https?:\/\//, "") })}
      </div>
    );

  if (server.state === "error")
    return (
      <div className="flex h-full flex-col items-center justify-center px-[6rem] text-center">
        <Server className="h-[4rem] w-[4rem] text-white/40" />
        <h1 className="mt-[1.4rem] text-[2.4rem] font-bold">{t("Can't reach your Jellyfin server")}</h1>
        <p className="mt-[0.8rem] max-w-[46rem] text-[1.2rem] leading-relaxed text-white/65">
          {t("YousufOS tried {server}. Check that the computer running Jellyfin is on and connected to the same network, and that the address is right.", {
            server: client.base,
          })}
        </p>
        <div className="mt-[2.2rem] flex gap-[1rem]">
          <ActionButton
            Icon={RefreshCw}
            primary
            isDefault
            onClick={() => {
              setServer({ state: "checking" });
              setAttempt((a) => a + 1);
            }}
          >
            {t("Try again")}
          </ActionButton>
          <ActionButton Icon={Server} onClick={onChangeServer}>
            {t("Change address")}
          </ActionButton>
          <ActionButton Icon={Globe} onClick={onOpenWeb}>
            {t("Open the web version")}
          </ActionButton>
        </div>
      </div>
    );

  const name = server.info?.ServerName;
  return (
    <div className="flex h-full flex-col justify-center px-[7rem]">
      <div className="text-[1.1rem] font-semibold uppercase tracking-[0.2em] text-white/50">Jellyfin</div>
      <h1 className="mt-[0.4rem] text-[3rem] font-bold tracking-tight">{t("Sign in to {name}", { name: name || "Jellyfin" })}</h1>
      <div className="mt-[2.6rem] grid grid-cols-[1.15fr_1fr] gap-[2.4rem]">
        {/* Quick Connect */}
        <div className="rounded-[1.8rem] bg-white/[0.06] p-[2.4rem] ring-1 ring-white/10">
          <div className="flex items-center gap-[0.8rem] text-[1.35rem] font-bold">
            <Smartphone className="h-[1.6rem] w-[1.6rem] text-accent" /> {t("Quick Connect")}
          </div>
          {qc?.code ? (
            <>
              <div className="tabular mt-[1.6rem] flex gap-[0.7rem]" dir="ltr">
                {[...qc.code].map((d, i) => (
                  <div key={i} className="flex h-[5.6rem] w-[4.4rem] items-center justify-center rounded-[1rem] bg-black/40 text-[3.2rem] font-bold ring-1 ring-white/15">
                    {d}
                  </div>
                ))}
              </div>
              <ol className="mt-[1.6rem] space-y-[0.5rem] text-[1.12rem] leading-snug text-white/75">
                <li>1. {t("Open Jellyfin on your phone or computer, already signed in.")}</li>
                <li>2. {t("Go to your profile → Quick Connect.")}</li>
                <li>3. {t("Enter this code. The TV signs in by itself.")}</li>
              </ol>
              <div className="mt-[1.2rem] flex items-center gap-[0.6rem] text-[1rem] text-white/45">
                <span className="h-[0.6rem] w-[0.6rem] animate-pulse rounded-full bg-accent" /> {t("Waiting for approval…")}
              </div>
            </>
          ) : qc?.off ? (
            <p className="mt-[1.4rem] text-[1.12rem] leading-relaxed text-white/65">
              {t("Quick Connect is turned off on this server. An admin can turn it on in Dashboard → General, or sign in with a password.")}
            </p>
          ) : qc?.error ? (
            <p className="mt-[1.4rem] text-[1.12rem] text-white/65">{t("Quick Connect isn't available right now.")}</p>
          ) : (
            <Spinner className="mt-[2rem]" />
          )}
        </div>

        {/* Password */}
        <div className="rounded-[1.8rem] bg-white/[0.06] p-[2.4rem] ring-1 ring-white/10">
          <div className="flex items-center gap-[0.8rem] text-[1.35rem] font-bold">
            <KeyRound className="h-[1.6rem] w-[1.6rem] text-accent" /> {t("Or use a password")}
          </div>
          <div className="mt-[1.4rem] flex flex-wrap gap-[1rem]">
            {users.map((u, i) => (
              <button
                key={u.Id}
                data-nav
                data-nav-default={i === 0 || undefined}
                onClick={() => (u.HasPassword === false ? signIn(u.Name, "") : setEntry({ step: "password", name: u.Name }))}
                className="flex w-[8.6rem] flex-col items-center gap-[0.6rem] rounded-[1.2rem] p-[0.8rem] transition-transform focus:scale-[1.06] focus:bg-white focus:text-black"
              >
                <div className="flex h-[5rem] w-[5rem] items-center justify-center rounded-full bg-white/15 text-[2rem] font-bold">
                  {u.Name?.[0]?.toUpperCase()}
                </div>
                <div className="w-full truncate text-center text-[1.05rem] font-semibold">{u.Name}</div>
              </button>
            ))}
            <button
              data-nav
              data-nav-default={!users.length || undefined}
              onClick={() => setEntry({ step: "name" })}
              className="flex w-[8.6rem] flex-col items-center gap-[0.6rem] rounded-[1.2rem] p-[0.8rem] transition-transform focus:scale-[1.06] focus:bg-white focus:text-black"
            >
              <div className="flex h-[5rem] w-[5rem] items-center justify-center rounded-full bg-white/10">
                <UserRound className="h-[2.2rem] w-[2.2rem]" />
              </div>
              <div className="text-center text-[1.05rem] font-semibold">{t("Other user")}</div>
            </button>
          </div>
          {busy && <Spinner className="mt-[1.2rem]" />}
          {error && <div className="mt-[1.2rem] text-[1.05rem] font-semibold text-[#ff8a80]">{error}</div>}
        </div>
      </div>
      <div className="mt-[2rem] flex gap-[1rem]">
        <ActionButton Icon={Server} onClick={onChangeServer}>
          {t("Change server")}
        </ActionButton>
        <ActionButton Icon={Globe} onClick={onOpenWeb}>
          {t("Open the web version")}
        </ActionButton>
      </div>

      {entry?.step === "name" && (
        <TextEntry
          layout="text"
          title={t("User name")}
          saveLabel={t("Next")}
          onClose={() => setEntry(null)}
          onSave={(v) => v.trim() && setEntry({ step: "password", name: v.trim() })}
        />
      )}
      {entry?.step === "password" && (
        <TextEntry
          layout="text"
          secret
          title={t("Password for {name}", { name: entry.name })}
          hint={t("Leave empty if there's no password.")}
          saveLabel={t("Sign in")}
          onClose={() => setEntry(null)}
          onSave={(v) => {
            setEntry(null);
            signIn(entry.name, v);
          }}
        />
      )}
    </div>
  );
}
