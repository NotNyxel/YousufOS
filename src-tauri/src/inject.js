// Injected into every page of an app opened from YousufOS (embedded view and
// Chrome alike). Accepts cookie banners, keeps everything in one window,
// adds controller helpers and the "back to YousufOS" behaviour.
// Placeholders filled in by Rust: __OPTS__ (JSON).
(() => {
  if (window.__yousuf) return;
  const OPTS = __OPTS__;
  const top = window === window.top;

  // Messages to YousufOS. Chrome exposes a binding; the embedded view
  // watches for navigations to yousufos://.
  const host = (cmd) => {
    try {
      if (typeof window.__yousufHost === "function") return window.__yousufHost(cmd);
    } catch {}
    try {
      (window.top || window).location.href = "yousufos://" + cmd;
    } catch {
      location.href = "yousufos://" + cmd;
    }
  };

  // ------------------------------------------------------------ cookies
  const CMP = [
    "#onetrust-accept-btn-handler",
    "#accept-recommended-btn-handler",
    "#truste-consent-button",
    "#didomi-notice-agree-button",
    ".fc-cta-consent",
    ".qc-cmp2-summary-buttons button[mode='primary']",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "#CybotCookiebotDialogBodyButtonAccept",
    "[data-testid='uc-accept-all-button']",
    "button[data-cookiebanner='accept_button']",
    "[data-cookiefirst-action='accept']",
    ".cky-btn-accept",
    ".cmplz-accept",
    "#cookie-accept",
    "#cookieAccept",
    "#accept-cookies",
    "#acceptCookies",
    ".cc-allow",
    ".cc-accept-all",
    ".cc-btn.cc-dismiss",
    ".js-accept-cookies",
    ".osano-cm-accept-all",
    ".iubenda-cs-accept-btn",
    ".termly-styles-button[data-tid='banner-accept']",
    "#sp-cc-accept",
    "[data-a-target='consent-banner-accept']",
    "button[aria-label='Accept all']",
    "button[aria-label='Accept All']",
    "button[aria-label^='Accept the use of cookies']",
    "ytd-consent-bump-v2-lightbox tp-yt-paper-button:last-child",
    "ytd-button-renderer.ytd-consent-bump-v2-lightbox:last-child button",
  ];
  const WORDS =
    /^\s*(accept|accept all|accept all cookies|accept cookies|allow all|allow all cookies|allow cookies|allow|agree|i agree|agree and continue|accept and continue|accept & continue|got it|ok|okay|i understand|consent|yes, i agree|alle akzeptieren|tout accepter|accepter|aceptar|aceptar todo|aceitar|aceitar todos|accetta|accetta tutto|kabul et|tümünü kabul et|принять|قبول|قبول الكل|قبول الجميع|قبول جميع ملفات تعريف الارتباط|موافق|أوافق|اوافق|حسنًا|حسنا)\s*[.!]?\s*$/i;
  const CONTEXT = /cookie|consent|gdpr|privacy|cmp|banner|notice|ملفات تعريف/i;
  const isConsentHost = /^consent\.|\.consent\.|cookielaw|privacy-mgmt|sourcepoint|cookiebot|usercentrics|didomi|trustarc/i.test(location.hostname);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const inConsentBox = (el) => {
    for (let n = el, i = 0; n && i < 12; n = n.parentElement || n.getRootNode?.().host, i++) {
      const s = `${n.id || ""} ${typeof n.className === "string" ? n.className : ""} ${n.getAttribute?.("aria-label") || ""} ${n.getAttribute?.("role") || ""}`;
      if (CONTEXT.test(s)) return true;
    }
    return false;
  };
  const roots = () => {
    const out = [document];
    for (const el of document.querySelectorAll("*")) if (el.shadowRoot) out.push(el.shadowRoot);
    return out;
  };
  let clicks = 0;
  const acceptCookies = () => {
    if (clicks > 6 || !OPTS.cookies) return;
    for (const root of roots()) {
      for (const sel of CMP) {
        let el;
        try {
          el = root.querySelector(sel);
        } catch {
          continue;
        }
        if (el && visible(el)) {
          el.click();
          clicks++;
          return;
        }
      }
      for (const el of root.querySelectorAll("button, [role='button'], a[href='#'], input[type='submit'], input[type='button']")) {
        const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim();
        if (!text || text.length > 48 || !WORDS.test(text) || !visible(el)) continue;
        if (!isConsentHost && !inConsentBox(el)) continue;
        el.click();
        clicks++;
        return;
      }
    }
  };
  let pending = 0;
  const schedule = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = 0;
      acceptCookies();
    }, 400);
  };
  const startWatching = () => {
    acceptCookies();
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 45000);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startWatching);
  else startWatching();

  // ------------------------------------------- one window, no pop-ups
  const sameTab = (url) => {
    if (!url) return;
    try {
      (window.top || window).location.assign(new URL(url, location.href).href);
    } catch {}
  };
  window.open = (url) => {
    sameTab(url);
    return null;
  };
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest?.("a[target]");
      if (a && a.target !== "_self" && a.href && !a.href.startsWith("javascript:")) a.target = "_self";
    },
    true,
  );
  window.close = () => host("home");

  if (!top) return; // the rest is for the main page only

  // ----------------------------------------------- DRM -> Chrome
  // WebKit has no Widevine; when a page plays protected video, reopen it in
  // Chrome automatically (embedded view only).
  if (OPTS.embedded) {
    let sent = false;
    document.addEventListener(
      "encrypted",
      () => {
        if (sent) return;
        sent = true;
        host("drm?u=" + encodeURIComponent(location.href));
      },
      true,
    );
  }

  // -------------------------------------------------- page helpers
  const css = document.createElement("style");
  css.textContent = `
    #__ycur{position:fixed;z-index:2147483647;left:0;top:0;width:28px;height:28px;margin:-4px 0 0 -4px;pointer-events:none;transition:opacity .3s;opacity:0;
      background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 2l15 11-7 1.2L8.4 21z' fill='white' stroke='black' stroke-width='1.4' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}
    #__ytoast{position:fixed;z-index:2147483647;left:50%;bottom:6vh;transform:translateX(-50%) translateY(20px);max-width:80vw;padding:14px 26px;border-radius:999px;
      background:rgba(12,14,20,.88);color:#fff;font:600 20px/1.35 system-ui,sans-serif;opacity:0;transition:opacity .35s,transform .35s;pointer-events:none;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)}
    #__ytoast.on{opacity:1;transform:translateX(-50%)}
    #__yhelp{position:fixed;z-index:2147483647;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);pointer-events:none}
    #__yhelp.on{display:flex}
    #__yhelp div{background:rgba(12,14,20,.95);color:#fff;border-radius:28px;padding:30px 40px;font:500 21px/1.9 system-ui,sans-serif;min-width:40vw}
    #__yhelp b{display:inline-block;min-width:150px;color:#e6c46e}
    #__ykb,#__ybar{position:fixed;z-index:2147483646;left:50%;transform:translateX(-50%);background:rgba(14,16,22,.96);color:#fff;
      border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 60px rgba(0,0,0,.55);font:600 22px/1 system-ui,"Noto Kufi Arabic",sans-serif;display:none}
    #__ykb .r{direction:ltr}
    #__ykb{bottom:3vh;border-radius:26px;padding:16px 18px 18px;width:min(1200px,92vw)}
    #__ykb.on,#__ybar.on{display:block}
    #__ykb .pv{background:rgba(255,255,255,.08);border-radius:14px;padding:12px 18px;margin-bottom:12px;min-height:26px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:auto}
    #__ykb .r{display:flex;gap:8px;margin-top:8px;justify-content:center}
    #__ykb .k,#__ybar .k{flex:1 1 0;min-width:0;height:58px;border-radius:12px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .08s,transform .08s}
    #__ykb .k.w2{flex-grow:2}#__ykb .k.w5{flex-grow:5}
    #__ykb .k.sel,#__ybar .k.sel{background:#e6c46e;color:#14110a;transform:scale(1.06)}
    #__ybar{top:3vh;border-radius:999px;padding:10px;display:none}
    #__ybar.on{display:flex;gap:8px}
    #__ybar .k{min-width:120px;padding:0 18px;height:56px;font-size:19px;border-radius:999px;gap:8px}
  `;
  const mount = () => {
    if (!document.documentElement || document.getElementById("__ycur")) return;
    (document.head || document.documentElement).appendChild(css);
    const cur = document.createElement("div");
    cur.id = "__ycur";
    const toastEl = document.createElement("div");
    toastEl.id = "__ytoast";
    const help = document.createElement("div");
    help.id = "__yhelp";
    // Built with DOM calls: some sites (YouTube) forbid innerHTML.
    const box = document.createElement("div");
    for (const [k, v] of OPTS.help || []) {
      const b = document.createElement("b");
      b.textContent = k;
      box.append(b, " " + v, document.createElement("br"));
    }
    help.append(box);
    document.documentElement.append(cur, toastEl, help);
  };
  const safeMount = () => {
    try {
      mount();
    } catch {}
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", safeMount);
  else safeMount();

  let toastTimer;
  const toast = (text, ms = 3500) => {
    mount();
    const el = document.getElementById("__ytoast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("on"), ms);
  };
  let curTimer;
  const cursor = (x, y) => {
    mount();
    const el = document.getElementById("__ycur");
    if (!el) return;
    el.style.transform = `translate(${x}px,${y}px)`;
    el.style.opacity = "1";
    clearTimeout(curTimer);
    curTimer = setTimeout(() => (el.style.opacity = "0"), 6000);
  };
  const mainVideo = () => {
    let best = null;
    let area = 0;
    for (const v of document.querySelectorAll("video")) {
      const r = v.getBoundingClientRect();
      if (r.width * r.height > area && v.readyState > 0) {
        best = v;
        area = r.width * r.height;
      }
    }
    return best;
  };
  const scrollTarget = (x, y) => {
    for (let el = document.elementFromPoint(x, y); el && el !== document.body; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) return el;
    }
    return document.scrollingElement || document.documentElement;
  };

  // ------------------------------------------------ on-screen keyboard
  const LAYOUTS = {
    en: ["1234567890", "qwertyuiop", "asdfghjkl'", "zxcvbnm,.?", "@/:-_&=#!+"],
    ar: ["1234567890", "ضصثقفغعهخحج", "شسيبلاتنمكط", "ئءؤرىةوزظذد", "@/:-_.،؟!+"],
  };
  const isEditable = (el) =>
    el &&
    (el.isContentEditable ||
      el.tagName === "TEXTAREA" ||
      (el.tagName === "INPUT" && /^(|text|search|email|url|password|tel|number)$/i.test(el.getAttribute("type") || "")));
  const kb = { open: false, lang: OPTS.lang === "ar" ? "ar" : "en", shift: false, r: 1, c: 0, target: null, rows: [] };
  const kbRows = () => {
    const L = LAYOUTS[kb.lang].map((row) => [...row].map((ch) => ({ ch: kb.shift ? ch.toUpperCase() : ch })));
    L.push([
      { id: "lang", label: kb.lang === "ar" ? "ABC" : "عربي" },
      { id: "shift", label: "⇧" },
      { id: "space", label: "␣", w: 5 },
      { id: "bksp", label: "⌫", w: 2 },
      { id: "enter", label: "↵", w: 2 },
      { id: "close", label: "✕" },
    ]);
    return L;
  };
  const insert = (text) => {
    const t = kb.target;
    if (!t) return;
    t.focus();
    if (!document.execCommand("insertText", false, text) && "value" in t) {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), "value")?.set;
      set ? set.call(t, t.value + text) : (t.value += text);
      t.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };
  const erase = () => {
    const t = kb.target;
    if (!t) return;
    t.focus();
    if (!document.execCommand("delete", false) && "value" in t) {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), "value")?.set;
      set ? set.call(t, t.value.slice(0, -1)) : (t.value = t.value.slice(0, -1));
      t.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };
  const kbRender = () => {
    mount();
    let el = document.getElementById("__ykb");
    if (!el) {
      el = document.createElement("div");
      el.id = "__ykb";
      el.addEventListener("mousedown", (e) => e.preventDefault()); // keep the text box focused
      el.addEventListener("click", (e) => {
        const k = e.target.closest(".k");
        if (!k) return;
        kb.r = +k.dataset.r;
        kb.c = +k.dataset.c;
        kbPress();
      });
      document.documentElement.append(el);
    }
    kb.rows = kbRows();
    kb.r = Math.min(kb.r, kb.rows.length - 1);
    kb.c = Math.min(kb.c, kb.rows[kb.r].length - 1);
    el.textContent = "";
    const pv = document.createElement("div");
    pv.className = "pv";
    const v = kb.target?.value ?? kb.target?.textContent ?? "";
    pv.textContent = kb.target?.type === "password" ? "•".repeat(v.length) : v || kb.target?.placeholder || "";
    el.append(pv);
    kb.rows.forEach((row, r) => {
      const rowEl = document.createElement("div");
      rowEl.className = "r";
      row.forEach((key, c) => {
        const k = document.createElement("div");
        k.className = "k" + (key.w ? " w" + key.w : "") + (r === kb.r && c === kb.c ? " sel" : "");
        k.dataset.r = r;
        k.dataset.c = c;
        k.textContent = key.label || key.ch;
        rowEl.append(k);
      });
      el.append(rowEl);
    });
    el.classList.add("on");
  };
  const kbOpen = (target) => {
    if (!isEditable(target)) return false;
    kb.target = target;
    kb.open = true;
    document.getElementById("__ytoast")?.classList.remove("on");
    kb.r = 1;
    kb.c = 0;
    kbRender();
    try {
      target.scrollIntoView({ block: "center" });
    } catch {}
    return true;
  };
  const kbClose = () => {
    kb.open = false;
    document.getElementById("__ykb")?.classList.remove("on");
  };
  const kbPress = () => {
    const key = kb.rows[kb.r][kb.c];
    if (key.ch) {
      insert(key.ch);
      if (kb.shift) kb.shift = false;
    } else if (key.id === "space") insert(" ");
    else if (key.id === "bksp") erase();
    else if (key.id === "shift") kb.shift = !kb.shift;
    else if (key.id === "lang") kb.lang = kb.lang === "ar" ? "en" : "ar";
    else if (key.id === "close") return kbClose();
    else if (key.id === "enter") {
      kbClose();
      kb.target?.focus();
      host("key?k=Enter");
      return;
    }
    kbRender();
  };
  const kbMove = (dr, dc) => {
    if (dr) {
      const frac = (kb.c + 0.5) / kb.rows[kb.r].length;
      kb.r = (kb.r + dr + kb.rows.length) % kb.rows.length;
      kb.c = Math.min(kb.rows[kb.r].length - 1, Math.floor(frac * kb.rows[kb.r].length));
    } else kb.c = (kb.c + dc + kb.rows[kb.r].length) % kb.rows[kb.r].length;
    kbRender();
  };
  // Opens by itself when the controller lands on a text box.
  if (OPTS.osk && !OPTS.tv) {
    document.addEventListener(
      "focusin",
      (e) => {
        if (Date.now() - (window.__yousufPad || 0) < 1500 && isEditable(e.target)) setTimeout(() => kbOpen(e.target), 50);
      },
      true,
    );
  }

  // ------------------------------------------------ browser toolbar
  const bar = { open: false, i: 0 };
  const BAR = [
    { id: "back", label: "←" },
    { id: "fwd", label: "→" },
    { id: "reload", label: "⟳" },
    { id: "start", label: "⌂" },
    { id: "help", label: "?" },
    { id: "exit", label: "✕" },
  ];
  const barRender = () => {
    mount();
    let el = document.getElementById("__ybar");
    if (!el) {
      el = document.createElement("div");
      el.id = "__ybar";
      el.addEventListener("click", (e) => {
        const k = e.target.closest(".k");
        if (!k) return;
        bar.i = +k.dataset.i;
        barPress();
      });
      document.documentElement.append(el);
    }
    el.textContent = "";
    BAR.forEach((b, i) => {
      const k = document.createElement("div");
      k.className = "k" + (i === bar.i ? " sel" : "");
      k.dataset.i = i;
      k.textContent = `${b.label} ${(OPTS.barLabels || {})[b.id] || ""}`;
      el.append(k);
    });
    el.classList.add("on");
  };
  const barClose = () => {
    bar.open = false;
    document.getElementById("__ybar")?.classList.remove("on");
  };
  const barPress = () => {
    const id = BAR[bar.i].id;
    barClose();
    if (id === "back") history.back();
    else if (id === "fwd") history.forward();
    else if (id === "reload") location.reload();
    else if (id === "start") host("start");
    else if (id === "help") window.__yousuf.help(true);
    else if (id === "exit") host("home");
  };

  window.__yousuf = {
    keyboard() {
      if (kb.open) return kbClose();
      const a = document.activeElement;
      if (isEditable(a)) return kbOpen(a);
      const first = [...document.querySelectorAll("input,textarea")].find((el) => isEditable(el) && el.getBoundingClientRect().width > 0);
      if (first) {
        first.focus();
        kbOpen(first);
      }
    },
    toast,
    cursor,
    help(show) {
      mount();
      if (OPTS.browser && show === undefined) {
        if (bar.open) return barClose();
        bar.open = true;
        bar.i = 0;
        return barRender();
      }
      document.getElementById("__yhelp")?.classList.toggle("on", show ?? undefined);
    },
    scroll(x, y, dx, dy) {
      scrollTarget(x, y).scrollBy({ left: dx, top: dy, behavior: "instant" });
    },
    playPause() {
      const v = mainVideo();
      if (!v) return false;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
      toast(v.paused ? "❚❚" : "▶", 900);
      return true;
    },
    seek(sec) {
      const v = mainVideo();
      if (!v || !isFinite(v.duration)) return false;
      v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + sec));
      toast(`${sec > 0 ? "»" : "«"} ${Math.abs(sec)}s`, 900);
      return true;
    },
    // Back: leave fullscreen, then go back in the app's history, then home.
    back() {
      if (kb.open) return kbClose();
      if (bar.open) return barClose();
      if (document.getElementById("__yhelp")?.classList.contains("on")) return this.help(false);
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        return;
      }
      // Go back in the app; if there's nowhere to go back to, return home.
      if (history.length > 1) {
        const before = location.href;
        history.back();
        setTimeout(() => {
          if (location.href === before) host("home");
        }, 700);
        return;
      }
      host("home");
    },
  };

  // Keyboard / remote keys that YousufOS handles itself inside apps.
  window.addEventListener(
    "keydown",
    (e) => {
      if (kb.open || bar.open) {
        const nav = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
        if (nav || e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (kb.open) {
            if (e.key === "Escape") kbClose();
            else if (e.key === "Enter") kbPress();
            else kbMove(nav[0], nav[1]);
          } else {
            if (e.key === "Escape") barClose();
            else if (e.key === "Enter") barPress();
            else if (nav[1]) {
              bar.i = (bar.i + nav[1] + BAR.length) % BAR.length;
              barRender();
            }
          }
          return;
        }
        if (kb.open && e.isTrusted && e.key.length === 1) return; // a real keyboard types normally
      }
      if (e.key === "F12" || e.key === "BrowserHome" || e.key === "HomePage") {
        e.preventDefault();
        host("home");
      } else if (e.key === "BrowserBack" || e.key === "GoBack") {
        e.preventDefault();
        window.__yousuf.back();
      } else if (OPTS.channelKeys && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ChannelUp" || e.key === "ChannelDown")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        host("channel?d=" + (e.key === "ArrowUp" || e.key === "ChannelUp" ? -1 : 1));
      }
    },
    true,
  );

  // ------------------------------------------------- D-pad navigation
  // Web apps are made for a mouse. Here the arrows (D-pad, TV remote) jump
  // to the nearest button, link or poster in that direction, with a ring
  // around it, and OK clicks it. The left stick still moves a pointer for
  // anything the arrows can't reach. Keys go straight to the site when a
  // full-size video is playing, in text boxes and on sliders.
  if (OPTS.dpad && top) {
    const SEL = [
      "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary", "label[for]",
      "[role=button]", "[role=link]", "[role=tab]", "[role=menuitem]", "[role=option]", "[role=checkbox]",
      "[role=radio]", "[role=switch]", "[role=gridcell]", "[role=treeitem]", "[contenteditable=true]",
      "[tabindex]:not([tabindex='-1'])", "[onclick]", "[data-uia*=title-card] a", "[data-testid*=card] a",
      ".title-card-container a", "[class*=swiper-slide] a",
    ].join(",");
    // Buttons that move a carousel along (Netflix, Prime Video, Shahid, Swiper, ...).
    const NEXT = ".handleNext,.handle-next,.swiper-button-next,[data-testid*=right-arrow],[data-testid*=next],button[aria-label*=next i],button[aria-label*=right i],[class*=arrow-right],[class*=ArrowRight],[class*=next-button],[class*=NextButton]";
    const PREV = ".handlePrev,.handle-prev,.swiper-button-prev,[data-testid*=left-arrow],[data-testid*=prev],button[aria-label*=prev i],button[aria-label*=left i],[class*=arrow-left],[class*=ArrowLeft],[class*=prev-button],[class*=PrevButton]";
    const ring = document.createElement("div");
    ring.id = "__yring";
    const ringCss = document.createElement("style");
    ringCss.textContent = `#__yring{position:fixed;z-index:2147483645;pointer-events:none;border-radius:12px;box-shadow:0 0 0 3px #fff,0 0 0 6px rgba(0,0,0,.55),0 10px 40px rgba(0,0,0,.45);opacity:0;transition:opacity .15s,left .12s cubic-bezier(.16,.9,.3,1),top .12s cubic-bezier(.16,.9,.3,1),width .12s,height .12s}#__yring.on{opacity:1}`;
    let cur = null;
    let mouseAt = 0;
    let mousePos = null;
    const attach = () => {
      if (!document.documentElement || ring.isConnected) return;
      (document.head || document.documentElement).appendChild(ringCss);
      document.documentElement.appendChild(ring);
    };
    const vw = () => window.innerWidth;
    const vh = () => window.innerHeight;
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return null;
      if (r.bottom < -vh() * 2 || r.top > vh() * 3) return null;
      if (el.closest("#__ykb,#__ybar,#__yhelp,[aria-hidden=true],[inert]")) return null;
      const s = getComputedStyle(el);
      // (pointer-events:none is fine: some sites take the click a layer above.)
      if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0) return null;
      if (el.disabled) return null;
      return r;
    };
    // Cards that are clickable through script (no link or button): the
    // outermost element showing a pointer cursor.
    const pointerEls = () => {
      const out = [];
      const all = document.body ? document.body.getElementsByTagName("*") : [];
      for (const el of all) {
        if (el.id?.startsWith("__y")) continue;
        if (getComputedStyle(el).cursor !== "pointer") continue;
        const p = el.parentElement;
        if (p && getComputedStyle(p).cursor === "pointer") continue;
        out.push(el);
      }
      return out;
    };
    const list = () => {
      const out = [];
      const seen = new Set();
      const els = [...new Set([...document.querySelectorAll(SEL), ...pointerEls()])];
      for (const el of els) {
        // A clickable inside another clickable (icon in a link): keep the outer one.
        const outer = el.parentElement?.closest("a[href],button,[role=button],[role=link]");
        if (outer && outer !== el && seen.has(outer)) continue;
        const r = shown(el);
        if (!r) continue;
        seen.add(el);
        out.push({ el, r });
      }
      return out;
    };
    const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    // Nearest candidate in a direction: distance along the direction, plus a
    // penalty for being off to the side (more if they don't overlap at all).
    const pick = (from, items, dir) => {
      const c = center(from);
      let best = null;
      let bestScore = Infinity;
      for (const it of items) {
        if (it.el === cur) continue;
        const r = it.r;
        const d = center(r);
        let main, side, overlap;
        if (dir === "right" || dir === "left") {
          main = dir === "right" ? r.left - from.right + 1 : from.left - r.right + 1;
          if ((dir === "right" ? d.x <= c.x : d.x >= c.x) || main < -from.width / 2) continue;
          overlap = Math.min(r.bottom, from.bottom) - Math.max(r.top, from.top);
          side = Math.abs(d.y - c.y);
        } else {
          main = dir === "down" ? r.top - from.bottom + 1 : from.top - r.bottom + 1;
          if ((dir === "down" ? d.y <= c.y : d.y >= c.y) || main < -from.height / 2) continue;
          overlap = Math.min(r.right, from.right) - Math.max(r.left, from.left);
          side = Math.abs(d.x - c.x);
        }
        // Rows first: the next row down beats something further away that
        // happens to be straight below.
        const horiz = dir === "right" || dir === "left";
        const score = Math.max(0, main) * (horiz ? 1 : 1.6) + side * (overlap > 0 ? 0.25 : horiz ? 2 : 0.55) + (overlap > 0 ? 0 : horiz ? 120 : 40);
        if (score < bestScore) {
          bestScore = score;
          best = it;
        }
      }
      return best;
    };
    const place = () => {
      if (!cur || !cur.isConnected) {
        ring.classList.remove("on");
        return;
      }
      const r = cur.getBoundingClientRect();
      const pad = 3;
      Object.assign(ring.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
      ring.style.borderRadius = Math.min(parseFloat(getComputedStyle(cur).borderRadius) || 8, 28) + 4 + "px";
      ring.classList.add("on");
    };
    let raf = 0;
    const follow = () => {
      cancelAnimationFrame(raf);
      const loop = () => {
        place();
        if (cur && Date.now() - movedAt < 1500) raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };
    let movedAt = 0;
    const select = (el) => {
      attach();
      cur = el;
      movedAt = Date.now();
      reveal(el);
      // Focus it too (sites show their own focus style); never scroll twice.
      if (el.matches("a[href],button,input,select,textarea,summary,[tabindex]")) {
        try {
          el.focus({ preventScroll: true });
        } catch {}
      }
      follow();
    };
    // Brings the element into view: real scroll areas (overflow auto/scroll)
    // sideways, and the page up/down. Never containers that hide their
    // overflow (carousels): moving those breaks the site's layout.
    const reveal = (el) => {
      for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const s = getComputedStyle(p);
        const canX = /(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 2;
        const canY = /(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2;
        if (!canX && !canY) continue;
        const r = el.getBoundingClientRect();
        const pr = p.getBoundingClientRect();
        let dx = 0;
        let dy = 0;
        if (canX) {
          const pad = Math.min(pr.width * 0.08, 120);
          if (r.left < pr.left + pad) dx = r.left - pr.left - pad;
          else if (r.right > pr.right - pad) dx = r.right - pr.right + pad;
        }
        if (canY && p.clientHeight < vh() * 0.9) {
          const pad = Math.min(pr.height * 0.12, 120);
          if (r.top < pr.top + pad) dy = r.top - pr.top - pad;
          else if (r.bottom > pr.bottom - pad) dy = r.bottom - pr.bottom + pad;
        }
        if (dx || dy) p.scrollBy({ left: dx, top: dy, behavior: "smooth" });
      }
      // The page itself (or a full-height scroll area): keep the element
      // comfortably on screen, centred when it was off it.
      const r = el.getBoundingClientRect();
      const margin = vh() * 0.16;
      let dy = 0;
      if (r.top < margin || r.bottom > vh() - margin) {
        dy = r.height > vh() * 0.6 ? r.top - margin : r.top + r.height / 2 - vh() / 2;
      }
      if (dy) {
        const sc = document.scrollingElement || document.documentElement;
        const before = sc.scrollTop;
        window.scrollBy({ top: dy, behavior: "smooth" });
        // Sites that scroll an inner full-screen element instead of the page.
        setTimeout(() => {
          if (sc.scrollTop !== before) return;
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2) {
              p.scrollBy({ top: dy, behavior: "smooth" });
              break;
            }
          }
        }, 60);
      }
    };
    // Scrolls the page (or the site's full-screen scroll area).
    const scrollPage = (dy) => {
      const sc = document.scrollingElement || document.documentElement;
      const before = sc.scrollTop;
      window.scrollBy({ top: dy, behavior: "smooth" });
      setTimeout(() => {
        if (sc.scrollTop !== before) return;
        let best = null;
        for (const el of document.querySelectorAll("main,div,section")) {
          const st = getComputedStyle(el);
          if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > vh() * 0.6) {
            if (!best || el.clientHeight > best.clientHeight) best = el;
          }
        }
        best?.scrollBy({ top: dy, behavior: "smooth" });
      }, 80);
    };
    // A carousel row whose next items are hidden off to the side: press its
    // arrow. Named arrow buttons first; otherwise hover the row (many sites
    // only show their arrows then) and use whatever clickable sits on its edge.
    const edgeButton = (row, dir, band) => {
      const rr = row.getBoundingClientRect();
      const edgeR = Math.min(vw(), rr.right);
      const edgeL = Math.max(0, rr.left);
      for (const el of row.querySelectorAll("*")) {
        if (el.closest("a[href]") || el.querySelector("a[href],img")) continue;
        if (getComputedStyle(el).cursor !== "pointer") continue;
        const r = el.getBoundingClientRect();
        if (!r.width || r.width > 180 || r.top > band.bottom || r.bottom < band.top) continue;
        if (dir === "right" ? r.right > edgeR - 60 : r.left < edgeL + 60) return el;
      }
      return null;
    };
    const afterNudge = (dir) =>
      setTimeout(() => {
        const items = list().filter((it) => it.r.left >= -2 && it.r.right <= vw() + 2);
        const nxt = cur && pick(cur.getBoundingClientRect(), items, dir);
        if (nxt) select(nxt.el);
        else place();
      }, 700);
    const nudgeRow = (dir) => {
      if (!cur) return false;
      const band = cur.getBoundingClientRect();
      const rows = [];
      for (let row = cur.parentElement, depth = 0; row && row !== document.body && depth < 10; row = row.parentElement, depth++) rows.push(row);
      for (const row of rows) {
        const btn = [...row.querySelectorAll(dir === "right" ? NEXT : PREV)].find((b) => b.getBoundingClientRect().width > 0 && !b.disabled);
        if (btn) {
          btn.click();
          afterNudge(dir);
          return true;
        }
      }
      const o = { bubbles: true, composed: true, clientX: band.left + 10, clientY: band.top + 10, view: window };
      for (const t of ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointermove", "mousemove"]) {
        cur.dispatchEvent(new (t.startsWith("pointer") ? PointerEvent : MouseEvent)(t, o));
      }
      setTimeout(() => {
        for (const row of rows) {
          const btn = edgeButton(row, dir, band);
          if (btn) {
            btn.click();
            afterNudge(dir);
            return;
          }
        }
      }, 300);
      return true;
    };
    const editable = (el) => el && (el.isContentEditable || /^(TEXTAREA|SELECT)$/.test(el.tagName) || (el.tagName === "INPUT" && !/^(button|submit|checkbox|radio|reset|image|file|range|color)$/i.test(el.type)));
    const videoMode = () => {
      const v = mainVideo();
      if (!v || v.paused || v.ended) return false;
      const r = v.getBoundingClientRect();
      return r.width * r.height > vw() * vh() * 0.5;
    };
    const activate = (el) => {
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, view: window };
      if (!el.matches("a[href],button,input,select,summary,label")) {
        el.dispatchEvent(new PointerEvent("pointerdown", { ...o, pointerType: "mouse", isPrimary: true }));
        el.dispatchEvent(new MouseEvent("mousedown", o));
        el.dispatchEvent(new PointerEvent("pointerup", { ...o, pointerType: "mouse", isPrimary: true }));
        el.dispatchEvent(new MouseEvent("mouseup", o));
      }
      el.click();
      if (el.matches("input,textarea,[contenteditable=true]")) {
        el.focus();
        if (OPTS.osk && editable(el)) setTimeout(() => window.__yousuf.keyboard(), 50);
      }
    };
    const DIR = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    // For checking on a page (developer console).
    window.__ydpad = { list, pick, current: () => cur };
    window.addEventListener(
      "mousemove",
      (e) => {
        mouseAt = Date.now();
        mousePos = { x: e.clientX, y: e.clientY };
        ring.classList.remove("on");
      },
      true,
    );
    window.addEventListener("scroll", () => cur && Date.now() - movedAt > 200 && place(), true);
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
        const dir = DIR[e.key];
        const isOk = e.key === "Enter";
        if (!dir && !isOk) return;
        if (document.getElementById("__yhelp")?.classList.contains("on")) return;
        const a = document.activeElement;
        // Typing: Left / Right move the caret; Up / Down leave the box.
        if (editable(a) && (!dir || dir === "left" || dir === "right" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) return;
        if (a && (a.type === "range" || a.getAttribute?.("role") === "slider") && (dir === "left" || dir === "right")) return;
        // Watching: the player's own keys (seek, volume, pause).
        if (videoMode() && (!cur || !cur.isConnected || Date.now() - movedAt > 4000)) {
          ring.classList.remove("on");
          return;
        }
        if (isOk) {
          if (!cur || !cur.isConnected || !ring.classList.contains("on")) return;
          // A real Enter on a focused link / button already clicks it.
          if (e.isTrusted && a === cur && cur.matches("a[href],button,summary,input[type=submit],input[type=button]")) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          activate(cur);
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        const items = list();
        if (!items.length) return scrollPage(dir === "down" ? vh() * 0.45 : dir === "up" ? -vh() * 0.45 : 0);
        // First press (or after using the pointer): start where the pointer
        // is, else the first thing on screen.
        if (!cur || !cur.isConnected || !ring.classList.contains("on")) {
          let start = null;
          if (mousePos && Date.now() - mouseAt < 15000) {
            const under = document.elementFromPoint(mousePos.x, mousePos.y);
            start = items.find((it) => it.el === under || it.el.contains(under));
          }
          if (!start && a && a !== document.body) start = items.find((it) => it.el === a);
          if (!start) {
            const onScreen = items.filter((it) => it.r.top >= 0 && it.r.bottom <= vh() && it.r.left >= 0 && it.r.right <= vw());
            onScreen.sort((p, q) => Math.round(p.r.top / 40) - Math.round(q.r.top / 40) || p.r.left - q.r.left);
            start = onScreen.find((it) => it.r.top > 40) || onScreen[0] || items[0];
          }
          return select(start.el);
        }
        const from = cur.getBoundingClientRect();
        const next = pick(from, items, dir);
        // Hidden past the edge of a carousel (no scrollbar): use its arrow.
        if (next && (dir === "right" || dir === "left")) {
          const nr = next.r;
          // Fully or mostly past the edge.
          const clipped = nr.right > vw() + nr.width * 0.3 || nr.left < -nr.width * 0.3;
          if (clipped && nudgeRow(dir)) return;
        }
        // Nothing close below / above (rows that only appear once they're
        // scrolled to): scroll a little, then look again.
        const vert = dir === "down" || dir === "up";
        const far = next && (dir === "down" ? next.r.top > vh() * 1.02 : next.r.bottom < -vh() * 0.02);
        if (vert && (!next || far)) {
          scrollPage(dir === "down" ? vh() * 0.45 : -vh() * 0.45);
          const from2 = cur;
          setTimeout(() => {
            if (cur !== from2) return;
            const n2 = pick(cur.getBoundingClientRect(), list(), dir);
            if (n2 && n2.r.top < vh() - 20 && n2.r.bottom > 20) select(n2.el);
            else place();
          }, 480);
          return;
        }
        if (next) return select(next.el);
        if ((dir === "right" || dir === "left") && nudgeRow(dir)) return;
      },
      true,
    );
  }

  // Live channels: once the video is playing, press the player's own
  // fullscreen key (a real key press, so the site allows it).
  if (OPTS.videoFull) {
    let asked = 0;
    setInterval(() => {
      if (asked > 2 || document.fullscreenElement || document.webkitFullscreenElement) return;
      const v = document.querySelector("video");
      if (v && !v.paused && v.readyState >= 3 && v.getBoundingClientRect().width > 200) {
        asked++;
        host("key?k=f");
      }
    }, 1500);
  }

  let hinted = false;
  try {
    hinted = !!sessionStorage.getItem("__yhint");
    sessionStorage.setItem("__yhint", "1");
  } catch {}
  if (OPTS.hint && !hinted) {
    const show = () => setTimeout(() => toast(OPTS.hint, 5000), 1200);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
    else show();
  }
})();
