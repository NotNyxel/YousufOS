// YousufOS admin panel / phone remote. Plain JavaScript, no build step.
// Everything from the TV is shown with textContent (never as HTML).
(() => {
  "use strict";
  const $app = document.getElementById("app");
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem("yousufos." + k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        if (v == null) localStorage.removeItem("yousufos." + k);
        else localStorage.setItem("yousufos." + k, v);
      } catch {}
    },
  };
  let token = store.get("token");
  let tab = store.get("tab") || "remote";

  // ------------------------------------------------------------- helpers
  const ICONS = {
    up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
    back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    play: '<path d="M7 4v16l13-8z"/><path d="M3 4v16" opacity=".0"/>',
    playpause: '<path d="M5 4v16l9-8z"/><path d="M16 5v14M20 5v14"/>',
    volup: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
    voldown: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M16 12h5"/>',
    prev: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>', next: '<path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>',
    y: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h4M13 15h4M7 11h10"/>',
    remote: '<rect x="7" y="2" width="10" height="20" rx="4"/><circle cx="12" cy="8" r="2"/><path d="M10 14h.01M14 14h.01M10 17h.01M14 17h.01"/>',
    tv: '<rect x="2" y="5" width="20" height="13" rx="2"/><path d="m8 21 4-3 4 3M7 2l5 3 5-3"/>',
    files: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    system: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
    kb: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  };
  const icon = (name) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.innerHTML = ICONS[name] || ""; // constant markup above, never TV data
    return s;
  };
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  let toastTimer;
  function toast(text, err = false) {
    document.querySelector(".toast")?.remove();
    const t = h("div", { class: "toast" + (err ? " err" : "") }, text);
    document.body.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 3200);
  }
  const buzz = () => navigator.vibrate && navigator.vibrate(12);
  const fmtBytes = (n) => {
    if (n == null) return "–";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(n < 10 && i ? 1 : 0)} ${u[i]}`;
  };
  const fmtTime = (s) => {
    if (s == null) return "–";
    const d = Math.floor(s / 86400);
    const hh = Math.floor((s % 86400) / 3600);
    const mm = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${hh}h` : hh ? `${hh}h ${mm}m` : `${mm}m`;
  };
  const fmtDate = (secs) => (secs ? new Date(secs * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
      headers: { "Content-Type": opts.raw ? "application/octet-stream" : "application/json", "X-Token": token || "" },
      body: opts.raw ? opts.raw : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      token = null;
      store.set("token", null);
      render();
      throw new Error("Not paired");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }
  const call = (action, args) => api("/api/call", { body: { action, args } });
  const key = (k) => {
    buzz();
    api("/api/key", { body: { key: k } }).catch((e) => toast(e.message, true));
  };
  const safe = (fn) => async (...a) => {
    try {
      await fn(...a);
    } catch (e) {
      if (e.message !== "Not paired") toast(e.message, true);
    }
  };

  // ------------------------------------------------------------- pairing
  function pairView() {
    const digits = Array.from({ length: 6 }, (_, i) =>
      h("input", {
        type: "text", inputmode: "numeric", maxlength: "1", autocomplete: "one-time-code", "aria-label": `Digit ${i + 1}`,
        oninput: (e) => {
          e.target.value = e.target.value.replace(/\D/g, "").slice(-1);
          if (e.target.value && e.target.nextElementSibling) e.target.nextElementSibling.focus();
          if (digits.every((d) => d.value)) go();
        },
        onkeydown: (e) => {
          if (e.key === "Backspace" && !e.target.value && e.target.previousElementSibling) e.target.previousElementSibling.focus();
        },
        onpaste: (e) => {
          const t = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
          if (t.length === 6) {
            e.preventDefault();
            t.split("").forEach((c, i) => (digits[i].value = c));
            go();
          }
        },
      }),
    );
    const name = h("input", { type: "text", placeholder: "Name for this device", value: /iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android phone" : "Computer" });
    const go = safe(async () => {
      const pin = digits.map((d) => d.value).join("");
      if (pin.length < 6) return;
      try {
        const r = await fetch("/api/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, name: name.value }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Couldn't pair");
        token = data.token;
        store.set("token", token);
        toast("Paired");
        render();
      } catch (e) {
        digits.forEach((d) => (d.value = ""));
        digits[0].focus();
        throw e;
      }
    });
    setTimeout(() => digits[0].focus(), 50);
    return h("div", { class: "wrap center", style: "padding-top:12vh" },
      h("img", { src: "/icon.png", alt: "", width: "72", height: "72", style: "border-radius:18px" }),
      h("h1", { style: "margin-top:16px" }, "YousufOS"),
      h("p", { class: "sub" }, "Enter the PIN shown on the TV under Settings → Phone & Remote."),
      h("div", { class: "pin" }, digits),
      h("div", { style: "max-width:340px;margin:0 auto" }, name),
      h("p", { class: "muted", style: "margin-top:28px" }, "Tip: Share → Add to Home Screen to open this like an app."),
    );
  }

  // ------------------------------------------------------------- remote
  function remoteView() {
    const pad = h("div", { class: "pad" },
      h("button", { class: "u", "aria-label": "Up", onclick: () => key("up") }, icon("up")),
      h("button", { class: "d", "aria-label": "Down", onclick: () => key("down") }, icon("down")),
      h("button", { class: "l", "aria-label": "Left", onclick: () => key("left") }, icon("left")),
      h("button", { class: "r", "aria-label": "Right", onclick: () => key("right") }, icon("right")),
      h("button", { class: "ok", onclick: () => key("ok") }, "OK"),
    );
    // Swipes on the pad work too.
    let start = null;
    pad.addEventListener("pointerdown", (e) => (start = { x: e.clientX, y: e.clientY }));
    pad.addEventListener("pointerup", (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
      key(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    });
    const k = (name, label, ic) => h("button", { class: "key", onclick: () => key(name) }, icon(ic || name), label);
    const text = h("input", { type: "text", placeholder: "Type on the TV…", enterkeyhint: "send" });
    const send = safe(async () => {
      if (!text.value) return;
      await api("/api/text", { body: { text: text.value } });
      text.value = "";
      toast("Sent");
    });
    text.addEventListener("keydown", (e) => e.key === "Enter" && send());
    return h("div", { class: "wrap" },
      header("Remote"),
      pad,
      h("div", { class: "keys" },
        k("back", "Back"), k("home", "Home"), k("menu", "Menu"), k("playpause", "Play/Pause"),
        k("voldown", "Vol −"), k("volup", "Vol +"), k("prev", "Rewind"), k("next", "Forward"),
      ),
      h("h2", {}, "Keyboard"),
      h("div", { class: "field" }, text, h("button", { class: "btn primary", onclick: send }, "Send")),
      h("p", { class: "muted" }, "Types into the box that's selected on the TV (search, sign-in, the browser)."),
    );
  }

  // ------------------------------------------------------------- watch
  function watchView() {
    const root = h("div", { class: "wrap" }, header("Watch"));
    const url = h("input", { type: "url", placeholder: "Paste a YouTube or web link", enterkeyhint: "go" });
    const cast = safe(async () => {
      if (!url.value.trim()) return;
      await call("cast", { url: url.value.trim() });
      url.value = "";
      toast("Opening on the TV");
    });
    url.addEventListener("keydown", (e) => e.key === "Enter" && cast());
    const photo = h("input", { type: "file", accept: "image/*,video/*", style: "display:none" });
    photo.addEventListener("change", safe(async () => {
      const f = photo.files?.[0];
      if (!f) return;
      toast("Sending…");
      await api(`/api/upload?kind=${f.type.startsWith("video") ? "video" : "photo"}&name=${encodeURIComponent(f.name)}`, { raw: f });
      toast("On the TV now");
      photo.value = "";
    }));
    root.append(
      h("h2", {}, "Send to TV"),
      h("div", { class: "card" },
        h("div", { class: "field" }, url, h("button", { class: "btn primary", onclick: cast }, "Send")),
        h("div", { class: "btns", style: "margin-top:10px" },
          h("button", { class: "btn", onclick: async () => { try { url.value = await navigator.clipboard.readText(); } catch { toast("Paste it into the box", true); } } }, "Paste"),
          h("button", { class: "btn", onclick: () => photo.click() }, "Photo or video"),
          photo,
          h("button", { class: "btn", onclick: () => shareHelp(root) }, "Share button on your phone"),
        ),
      ),
    );
    const now = h("div", {});
    const apps = h("div", { class: "apps" });
    const chans = h("div", { class: "list" });
    const q = h("input", { type: "text", placeholder: "Find a channel" });
    root.append(h("h2", {}, "On the TV"), now, h("h2", {}, "Apps"), apps, h("h2", {}, "Live TV"), h("div", { style: "margin-bottom:10px" }, q), chans);
    const showNow = (s) => {
      now.replaceChildren(
        h("div", { class: "card" },
          h("div", { class: "t", style: "font-weight:700" }, s?.title || "Home screen"),
          s?.detail ? h("div", { class: "sub" }, s.detail) : null,
          h("div", { class: "btns", style: "margin-top:10px" },
            s?.pip ? h("button", { class: "btn small", onclick: safe(async () => { await call("pipStop"); toast("Closed"); load(); }) }, "Close small window") : null,
            h("button", { class: "btn small", onclick: () => key("home") }, "Go home"),
          ),
        ),
      );
    };
    const renderChannels = (list) => {
      chans.replaceChildren(
        ...(list.length ? list : [{ empty: true }]).map((c) =>
          c.empty
            ? h("div", { class: "row" }, h("div", { class: "grow d" }, "No channels"))
            : h("div", { class: "row" },
                h("div", { class: "grow" }, h("div", { class: "t" }, c.name), c.group ? h("div", { class: "d" }, c.group) : null),
                h("button", { class: "btn small primary", onclick: safe(async () => { await call("playChannel", { id: c.id }); toast("Playing"); }) }, "Watch"),
                h("button", { class: "btn small", onclick: safe(async () => { await call("pip", { id: c.id }); toast("Small window on the TV"); }) }, "Small"),
                h("button", { class: "btn small", onclick: () => recordDialog(c) }, "Rec"),
              ),
        ),
      );
    };
    let t;
    q.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(safe(async () => renderChannels((await call("channels", { q: q.value })).channels || [])), 300);
    });
    const load = safe(async () => {
      const [st, ap, ch] = await Promise.all([call("status"), call("apps"), call("channels", { q: "" })]);
      showNow(st);
      apps.replaceChildren(...(ap.apps || []).map((a) => h("button", { class: "app", style: `background:${/^(#[0-9a-f]{3,8}|linear-gradient\([#0-9a-z%,.\s]+\))$/i.test(a.bg || "") ? a.bg : "#1d2028"}`, onclick: safe(async () => { await call("openApp", { id: a.id }); toast(`Opening ${a.name}`); }) }, a.name)));
      renderChannels(ch.channels || []);
    });
    load();
    return root;
  }

  function recordDialog(c) {
    const mins = h("input", { type: "number", min: "5", max: "600", value: "60" });
    const when = h("input", { type: "time" });
    const box = h("div", { class: "card", style: "margin:10px 0" },
      h("div", { class: "t", style: "font-weight:700" }, `Record ${c.name}`),
      h("div", { class: "sub", style: "margin:6px 0 8px" }, "Minutes"), mins,
      h("div", { class: "sub", style: "margin:12px 0 8px" }, "Start at (leave empty for now)"), when,
      h("div", { class: "btns", style: "margin-top:12px" },
        h("button", { class: "btn primary", onclick: safe(async () => {
          await call("record", { id: c.id, minutes: +mins.value || 60, at: when.value || null });
          toast(when.value ? `Recording set for ${when.value}` : "Recording");
          box.remove();
        }) }, "Record"),
        h("button", { class: "btn", onclick: () => box.remove() }, "Cancel"),
      ),
    );
    document.querySelector(".wrap")?.prepend(box);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function shareHelp(root) {
    const ip = location.host;
    const box = h("div", { class: "card", style: "margin-top:10px" },
      h("div", { class: "t", style: "font-weight:700" }, "Send links from any app"),
      h("p", { class: "sub" }, "iPhone / iPad: open the Shortcuts app → + → add “Get Contents of URL”. Set:"),
      h("ul", { class: "sub" },
        h("li", {}, `URL: http://${ip}/api/call`),
        h("li", {}, "Method: POST, Request Body: JSON"),
        h("li", {}, "Field action = cast, and field args (Dictionary) with url = Shortcut Input"),
        h("li", {}, "Header X-Token = the code below"),
      ),
      h("p", { class: "sub" }, "Turn on “Show in Share Sheet” (accepting URLs). Android: the free “HTTP Shortcuts” app does the same."),
      h("div", { class: "field" }, h("input", { type: "text", readonly: true, value: token }), h("button", { class: "btn", onclick: () => navigator.clipboard?.writeText(token).then(() => toast("Copied")) }, "Copy")),
      h("p", { class: "muted" }, "This code is this phone's key to the TV; keep it private. Settings → Paired devices can cancel it."),
    );
    root.querySelector(".card")?.after(box);
  }

  // ------------------------------------------------------------- files
  function filesView() {
    const root = h("div", { class: "wrap" }, header("Files"));
    const jobs = h("div", { class: "list" });
    const sched = h("div", { class: "list" });
    const recs = h("div", { class: "list" });
    const dls = h("div", { class: "list" });
    root.append(h("h2", {}, "In progress"), jobs, h("h2", {}, "Scheduled recordings"), sched, h("h2", {}, "Recordings"), recs, h("h2", {}, "Downloaded from Jellyfin"), dls);
    const fileRows = (target, files, empty) =>
      target.replaceChildren(
        ...(files.length
          ? files.map((f) =>
              h("div", { class: "row" },
                h("div", { class: "grow" }, h("div", { class: "t" }, f.rel || f.name), h("div", { class: "d" }, `${fmtBytes(f.size)} · ${fmtDate(f.modified)}`)),
                h("button", { class: "btn small primary", onclick: safe(async () => { await call("playFile", { path: f.path }); toast("Playing on the TV"); }) }, "Play"),
                h("button", { class: "btn small danger", onclick: safe(async () => {
                  if (!confirm(`Delete “${f.name}”? This can't be undone.`)) return;
                  await api("/api/files/delete", { body: { path: f.path } });
                  toast("Deleted");
                  load();
                }) }, "Delete"),
              ),
            )
          : [h("div", { class: "row" }, h("div", { class: "grow d" }, empty))]),
      );
    const load = safe(async () => {
      const [j, s, r, d] = await Promise.all([call("jobs"), call("schedule"), api("/api/files?kind=recordings"), api("/api/files?kind=downloads")]);
      const list = (j.jobs || []).filter((x) => x.state === "running" || Date.now() / 1000 - x.started < 3600);
      jobs.replaceChildren(
        ...(list.length
          ? list.map((x) =>
              h("div", { class: "row" },
                h("div", { class: "grow" },
                  h("div", { class: "t" }, x.name),
                  h("div", { class: "d" }, x.kind === "record" ? `Recording · ${fmtBytes(x.done)}` : `Download · ${fmtBytes(x.done)} of ${fmtBytes(x.total)}`, " · ", x.state),
                  x.kind === "download" && x.total ? h("div", { class: "bar" }, h("i", { style: `width:${Math.min(100, (100 * x.done) / x.total)}%` })) : null,
                ),
                x.state === "running" ? h("button", { class: "btn small", onclick: safe(async () => { await call("jobStop", { id: x.id }); load(); }) }, "Stop") : null,
              ),
            )
          : [h("div", { class: "row" }, h("div", { class: "grow d" }, "Nothing right now"))]),
      );
      sched.replaceChildren(
        ...((s.items || []).length
          ? s.items.map((x) =>
              h("div", { class: "row" },
                h("div", { class: "grow" }, h("div", { class: "t" }, x.name), h("div", { class: "d" }, `${new Date(x.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · ${x.minutes} min`)),
                h("button", { class: "btn small danger", onclick: safe(async () => { await call("unschedule", { id: x.id }); load(); }) }, "Cancel"),
              ),
            )
          : [h("div", { class: "row" }, h("div", { class: "grow d" }, "None. Set one from Watch → Live TV → Rec."))]),
      );
      fileRows(recs, (r.files || []).filter((f) => /\.(ts|mkv|mp4)$/i.test(f.name)), "No recordings yet");
      fileRows(dls, (d.files || []).filter((f) => !/\.(jpg|json)$/i.test(f.name)), "Nothing downloaded. In the Jellyfin app, a film or episode's Download button saves it on the TV.");
    });
    load();
    const timer = setInterval(() => (tab === "files" ? load() : clearInterval(timer)), 4000);
    return root;
  }

  // ------------------------------------------------------------- settings
  function settingsView() {
    const root = h("div", { class: "wrap" }, header("Settings"));
    const box = h("div", {});
    root.append(box);
    const control = (s) => {
      if (s.type === "toggle") {
        const t = h("button", { class: "toggle" + (s.value ? " on" : ""), role: "switch", "aria-checked": String(!!s.value), "aria-label": s.label });
        t.onclick = safe(async () => {
          const v = !t.classList.contains("on");
          t.classList.toggle("on", v);
          t.setAttribute("aria-checked", String(v));
          await call("settings.set", { key: s.key, value: v });
        });
        return t;
      }
      if (s.type === "select") {
        const sel = h("select", { style: "width:auto;min-width:130px" }, ...s.options.map(([v, l]) => h("option", { value: v }, l)));
        sel.value = String(s.value);
        sel.onchange = safe(async () => {
          const o = s.options.find(([v]) => String(v) === sel.value);
          await call("settings.set", { key: s.key, value: o ? o[0] : sel.value });
          toast("Saved");
        });
        return sel;
      }
      const inp = h("input", { type: s.type === "number" ? "number" : s.type === "time" ? "time" : "text", value: s.value ?? "", style: "width:140px" });
      inp.onchange = safe(async () => {
        await call("settings.set", { key: s.key, value: s.type === "number" ? +inp.value : inp.value });
        toast("Saved");
      });
      return inp;
    };
    const load = safe(async () => {
      const r = await call("settings.get");
      box.replaceChildren(
        ...(r.groups || []).flatMap((g) => [
          h("h2", {}, g.title),
          h("div", { class: "list" }, ...g.items.map((s) => h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "t", style: "white-space:normal" }, s.label), s.hint ? h("div", { class: "d", style: "white-space:normal" }, s.hint) : null), control(s)))),
        ]),
      );
      box.append(...updatesBlock(), ...backupBlock(), ...devicesBlock());
    });
    load();
    return root;
  }

  function updatesBlock() {
    const out = h("div", { class: "card" }, h("div", { class: "sub" }, "Checking…"));
    const deb = h("input", { type: "file", accept: ".deb", style: "display:none" });
    deb.addEventListener("change", safe(async () => {
      const f = deb.files?.[0];
      if (!f) return;
      toast("Uploading…");
      await api(`/api/upload?kind=update&name=${encodeURIComponent(f.name)}`, { raw: f });
      toast("Installing: confirm with the password on the TV");
    }));
    const show = safe(async () => {
      const r = await call("update.check");
      out.replaceChildren(
        h("div", { class: "t", style: "font-weight:700" }, `This TV: ${r.current}`),
        h("div", { class: "sub" }, r.problem ? r.problem : r.available ? `Version ${r.latest} is available.` : `Up to date${r.latest ? ` (latest: ${r.latest})` : ""}.`),
        r.notes ? h("p", { class: "sub", style: "white-space:pre-wrap" }, r.notes.slice(0, 600)) : null,
        h("div", { class: "btns", style: "margin-top:10px" },
          r.available ? h("button", { class: "btn primary", onclick: safe(async () => { await call("update.install"); toast("Downloading: the TV will ask for the password"); }) }, "Install update") : null,
          h("button", { class: "btn", onclick: show }, "Check again"),
          h("button", { class: "btn", onclick: () => deb.click() }, "Install a .deb file"),
          deb,
        ),
      );
    });
    show();
    return [h("h2", {}, "Updates"), out];
  }

  function backupBlock() {
    const file = h("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    file.addEventListener("change", safe(async () => {
      const f = file.files?.[0];
      if (!f) return;
      if (!confirm("Replace the TV's settings with this backup?")) return;
      await api(`/api/upload?kind=backup&name=${encodeURIComponent(f.name)}`, { raw: f });
      toast("Restored");
    }));
    return [
      h("h2", {}, "Backup"),
      h("div", { class: "card" },
        h("div", { class: "sub" }, "Everything you set up: apps, channels, playlists, location, prayer settings, sign-ins."),
        h("div", { class: "btns", style: "margin-top:10px" },
          h("button", { class: "btn primary", onclick: safe(async () => {
            const r = await call("backup.export");
            const blob = new Blob([JSON.stringify(r.backup, null, 2)], { type: "application/json" });
            const a = h("a", { href: URL.createObjectURL(blob), download: r.name || "yousufos-backup.json" });
            document.body.append(a);
            a.click();
            a.remove();
          }) }, "Download a backup"),
          h("button", { class: "btn", onclick: safe(async () => { const r = await call("backup.save"); toast(`Saved on the TV: ${r.where}`); }) }, "Save on the TV / USB"),
          h("button", { class: "btn", onclick: () => file.click() }, "Restore from file"),
          file,
        ),
      ),
    ];
  }

  function devicesBlock() {
    const list = h("div", { class: "list" });
    const load = safe(async () => {
      const r = await call("admin.devices");
      list.replaceChildren(
        ...(r.devices || []).map((d) =>
          h("div", { class: "row" },
            h("div", { class: "grow" }, h("div", { class: "t" }, d.name + (d.current ? " (this one)" : "")), h("div", { class: "d" }, `Paired ${new Date(d.added).toLocaleDateString()}`)),
            h("button", { class: "btn small danger", onclick: safe(async () => {
              if (!confirm(`Remove “${d.name}”? It will need the PIN again.`)) return;
              await call("admin.forget", { id: d.id });
              if (d.current) {
                token = null;
                store.set("token", null);
                render();
              } else load();
            }) }, "Remove"),
          ),
        ),
      );
    });
    load();
    return [h("h2", {}, "Paired devices"), list];
  }

  // ------------------------------------------------------------- system
  function systemView() {
    const root = h("div", { class: "wrap" }, header("System"));
    const stats = h("div", { class: "stats" });
    const log = h("div", { class: "card log" });
    const stat = (label, value, pct) => h("div", { class: "card stat" }, h("div", { class: "l" }, label), h("div", { class: "v" }, value), pct != null ? h("div", { class: "bar" }, h("i", { style: `width:${Math.max(2, Math.min(100, pct))}%` })) : null);
    const power = (action, label, cls, ask) =>
      h("button", { class: "btn " + (cls || ""), onclick: safe(async () => {
        if (ask && !confirm(ask)) return;
        await api("/api/power", { body: { action } });
        toast(`${label}…`);
      }) }, label);
    root.append(
      stats,
      h("h2", {}, "Power"),
      h("div", { class: "btns" },
        power("restart-app", "Restart YousufOS", "", "Restart the launcher?"),
        power("suspend", "Sleep", "", "Put the TV to sleep?"),
        power("reboot", "Restart", "", "Restart the TV laptop?"),
        power("poweroff", "Shut down", "danger", "Shut the TV laptop down? You'll need to turn it on by hand."),
      ),
      h("h2", {}, "Jellyfin PC"),
      h("div", { class: "btns" }, h("button", { class: "btn", onclick: safe(async () => { const r = await call("jellyfin.wake"); toast(r.message || "Wake-up sent"); }) }, "Wake up the Jellyfin PC")),
      h("h2", {}, "Phone notifications"),
      h("div", { class: "btns" }, h("button", { class: "btn", onclick: safe(async () => { await call("notify.test"); toast("Test sent"); }) }, "Send a test notification")),
      h("h2", {}, "Recent events"),
      log,
    );
    const load = safe(async () => {
      const [s, l] = await Promise.all([api("/api/status"), api("/api/log")]);
      const mem = s.memory?.total ? 100 * (1 - s.memory.available / s.memory.total) : null;
      const disk = s.disk?.total ? 100 * (1 - s.disk.free / s.disk.total) : null;
      stats.replaceChildren(...[
        stat("Version", s.version || "–"),
        stat("Address", (s.addresses || [])[0] || "–"),
        stat("Processor", s.cpu != null ? `${Math.round(s.cpu)}%` : "–", s.cpu),
        stat("Memory", mem != null ? `${Math.round(mem)}%` : "–", mem),
        stat("Temperature", s.temperature != null ? `${Math.round(s.temperature)}°C` : "–", s.temperature),
        stat("Storage free", s.disk ? fmtBytes(s.disk.free) : "–", disk),
        stat("Up for", fmtTime(s.uptime)),
        stat("Volume", s.volume != null ? `${s.volume}%` : "–", s.volume),
        s.battery ? stat("Battery", `${s.battery.percent}% · ${s.battery.status}`, s.battery.percent) : null,
        stat("On screen", s.launcher?.title || s.screen || "–"),
      ].filter(Boolean));
      log.textContent = (l.lines || []).slice(-120).reverse().join("\n") || "Nothing yet.";
    });
    load();
    const timer = setInterval(() => (tab === "system" ? load() : clearInterval(timer)), 5000);
    return root;
  }

  // ------------------------------------------------------------- shell
  function header(title) {
    return h("div", { class: "top" }, h("h1", {}, title), h("span", { class: "chip" }, location.hostname));
  }
  const TABS = [
    ["remote", "Remote", "remote", remoteView],
    ["watch", "Watch", "tv", watchView],
    ["files", "Files", "files", filesView],
    ["settings", "Settings", "settings", settingsView],
    ["system", "System", "system", systemView],
  ];
  function render() {
    if (!token) {
      $app.replaceChildren(pairView());
      return;
    }
    const cur = TABS.find((t) => t[0] === tab) || TABS[0];
    const nav = h("nav", { class: "nav" },
      ...TABS.map(([id, label, ic]) =>
        h("button", { class: id === cur[0] ? "on" : "", onclick: () => { tab = id; store.set("tab", id); render(); window.scrollTo(0, 0); } }, icon(ic), label),
      ),
    );
    $app.replaceChildren(cur[3](), nav);
  }
  render();
})();
