/* 外出先ダイニングTV（LIFF）用ブリッジ。
 * 正本はこのファイル（Sony_HomeTerminal/remote/bridge.js）。scripts/build_remote.py が
 * REGALIA_schedule_management/docs/ht/bridge.js に配る（あちらは直接編集しない）。
 *
 * - LIFF 認証 → web/app.js（Sony 本体と同一）を読み込む
 * - 自動巡回・読み上げなし（app.js が REMOTE_LIFF を見て止める。speak は提供しない）
 * - 1920×1080 のページを画面に収まるよう縮小して1ページずつ表示。左右スワイプでページ移動
 * - 速さ: userId が分かった時点で予定データを先読みし、端末キャッシュがあれば即描画して裏で更新
 */
(function () {
  "use strict";

  window.REMOTE_LIFF = true;
  window.PC_KIOSK = false;
  window.PHONE_KIOSK = false;
  window.__CONFIG_URL__ = "https://script.google.com/macros/s/AKfycbzTWV_X4UvgUxXSzI-KUVudV2EwEQdY9yLe2oKMf9DIkpGo_BNCe3uGG0wmFQ1EcLpC/exec";
  window.__API_BASE__ = window.__CONFIG_URL__;
  var STANDINGS_URL = "https://script.google.com/macros/s/AKfycbxQSNvMNuCKlXM9V8FQLMQwAeb7U_Z2Xn-xBVRfvnv302cu_ckO-g-wyPATYuv4dPZY/exec?_path=api/standings";
  var APP_JS = "ht/app.js?v=0.3.147";
  var CACHE_PREFIX = "ht_cache_v1_";

  var lineUserId = "";
  var appLoaded = false;

  function gateMsg(t) {
    var el = document.getElementById("ht-gate-msg");
    if (el) el.textContent = t;
  }

  function apiUrl(path) {
    var b = String(window.__API_BASE__ || "").replace(/\/$/, "");
    var parts = String(path || "").split("?");
    var url = b + "?_path=" + encodeURIComponent(parts[0]);
    if (parts[1]) url += "&" + parts[1];
    return url;
  }

  function withUser(path) {
    var url = apiUrl(path);
    if (lineUserId) url += (url.indexOf("?") >= 0 ? "&" : "?") + "userId=" + encodeURIComponent(lineUserId);
    url += (url.indexOf("?") >= 0 ? "&" : "?") + "_t=" + Date.now();
    return url;
  }

  function shortErr(t) {
    var s = String(t || "");
    try {
      var j = JSON.parse(s);
      if (j && j.error) s = String(j.error);
    } catch (e) {}
    if (s.indexOf("<html") >= 0 || s.indexOf("<!DOCTYPE") >= 0) return "gas html";
    return s.length > 80 ? s.slice(0, 80) : s;
  }

  // ---- 端末キャッシュ（localStorage。失敗しても動く） ----
  function cacheGet(key) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function cachePut(key, data) {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data: data })); } catch (e) {}
  }
  /** 画面に効く中身だけで比較する（generated_at・運行の取得時刻の差では取り直さない） */
  function dashSig(d) {
    if (!d) return "";
    try {
      return JSON.stringify([d.today, d.days, d.events, d.weather, d.holiday_isos, d.briefing]);
    } catch (e) { return String(Math.random()); }
  }

  // ---- 取得（同じリクエストは共有。HTML が返ったら再試行） ----
  var inflight = {};
  function getJson(url, key, tries) {
    if (inflight[key]) return inflight[key];
    var p = new Promise(function (resolve, reject) {
      var n = 0;
      function once() {
        n += 1;
        fetch(url(), { cache: "no-store" })
          .then(function (r) {
            return r.text().then(function (t) {
              if (!r.ok) throw new Error(shortErr(t || ("http " + r.status)));
              var data;
              try { data = JSON.parse(t); } catch (e) { throw new Error("invalid json"); }
              if (data && data.error) throw new Error(String(data.error));
              if (data && data.ok === false && data.error) throw new Error(String(data.error));
              resolve(data);
            });
          })
          .catch(function (e) {
            if (n < tries) { setTimeout(once, 1200 * n); return; }
            reject(e);
          });
      }
      once();
    });
    inflight[key] = p;
    p.then(function () { delete inflight[key]; }, function () { delete inflight[key]; });
    return p;
  }
  function netDashboard(off) {
    var key = "dash_" + off;
    return getJson(function () { return withUser("api/dashboard?week_offset=" + encodeURIComponent(off)); }, key, 4)
      .then(function (data) {
        cachePut(key, data);
        return data;
      });
  }

  var reloadArmed = false;
  function scheduleReload() {
    if (reloadArmed) return;
    reloadArmed = true;
    // 同時に走る別週の取得もまとめて1回だけ取り直す
    setTimeout(function () {
      reloadArmed = false;
      if (window.DashReload) window.DashReload();
    }, 300);
  }

  window.SonyBridge = {
    fetchDashboard: function (off, id) {
      var key = "dash_" + off;
      var hit = cacheGet(key);
      var net = netDashboard(off);
      if (hit && hit.data && hit.data.today === todayIso()) {
        // 前回分を即描画 → 最新が違えば取り直す（取り直し時はキャッシュ＝最新なので一致して止まる）
        window.DashDone(id, null, hit.data);
        net.then(function (d) { if (dashSig(d) !== dashSig(hit.data)) scheduleReload(); }, function () {});
        return;
      }
      net.then(function (d) { window.DashDone(id, null, d); },
        function (e) {
          if (hit && hit.data) window.DashDone(id, null, hit.data);
          else window.DashDone(id, shortErr(e.message || e), null);
        });
    },
    fetchStudy: function (id) {
      getJson(function () { return withUser("api/study"); }, "study", 4)
        .then(function (data) { window.DashStudyDone(id, null, data); },
          function (e) { window.DashStudyDone(id, shortErr(e.message || e), null); });
    },
    fetchStandings: function (id) {
      // 順位は 6 時間ごとのスクレイプでしか変わらない。10 分以内のキャッシュはそのまま使う
      var hit = cacheGet("standings");
      if (hit && hit.data && Date.now() - hit.at < 10 * 60 * 1000) {
        window.DashStandingsDone(id, null, hit.data);
        return;
      }
      getJson(function () { return STANDINGS_URL; }, "standings", 3)
        .then(function (data) {
          cachePut("standings", data);
          window.DashStandingsDone(id, null, data);
        }, function (e) {
          if (hit && hit.data) window.DashStandingsDone(id, null, hit.data);
          else window.DashStandingsDone(id, shortErr(e.message || e), null);
        });
    },
    log: function (s) {
      try { console.log(s); } catch (e) {}
    },
    exit: function () {}
  };

  function todayIso() {
    var d = new Date(Date.now() + 9 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }

  // ---- 画面に収める（1920×1080 を縮小して中央に置く） ----
  // ピンチで拡大できるよう、合わせる基準は拡大で変わらないレイアウト幅（clientWidth/Height）。
  // visualViewport を基準にすると拡大のたびに縮め直してしまう（2026-10-08 指摘「ピンチインがきかない」）
  function fit() {
    var de = document.documentElement;
    var w = de.clientWidth || window.innerWidth || 1920;
    var h = de.clientHeight || window.innerHeight || 1080;
    var s = Math.min(w / 1920, h / 1080);
    if (!isFinite(s) || s <= 0) s = 1;
    var b = document.body;
    b.style.transform = "scale(" + s + ")";
    b.style.left = Math.round((w - 1920 * s) / 2) + "px";
    b.style.top = Math.round((h - 1080 * s) / 2) + "px";
  }
  window.addEventListener("resize", function () { if (!zoomed()) fit(); });
  window.addEventListener("orientationchange", function () { setTimeout(fit, 250); });
  function zoomed() {
    var vv = window.visualViewport;
    return !!(vv && vv.scale > 1.05);
  }

  // ---- 左右スワイプでページ移動 ----
  var sx = 0, sy = 0, st = 0;
  document.addEventListener("touchstart", function (ev) {
    if (!ev.touches || ev.touches.length !== 1) return;
    sx = ev.touches[0].clientX;
    sy = ev.touches[0].clientY;
    st = Date.now();
  }, { passive: true });
  document.addEventListener("touchend", function (ev) {
    var t = ev.changedTouches && ev.changedTouches[0];
    if (!t || !st) return;
    var dx = t.clientX - sx;
    var dy = t.clientY - sy;
    var dt = Date.now() - st;
    st = 0;
    var det = document.getElementById("ev-detail");
    var wxd = document.getElementById("wx-detail");
    if ((det && !det.hidden) || (wxd && !wxd.hidden)) return;
    // 拡大中の1本指ドラッグは見る場所の移動。ページ送りにしない
    if (zoomed()) return;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 900) {
      if (window.DashRemoteSwipe) window.DashRemoteSwipe(dx < 0 ? "left" : "right");
    }
  }, { passive: true });

  function loadApp() {
    if (appLoaded) return;
    appLoaded = true;
    var s = document.createElement("script");
    s.src = APP_JS;
    s.onerror = function () { gateMsg("画面の読み込みに失敗しました。"); };
    document.body.appendChild(s);
    var gate = document.getElementById("ht-gate");
    if (gate) gate.hidden = true;
    fit();
  }

  async function start() {
    fit();
    var cfgUrl = String(window.__CONFIG_URL__ || "");
    if (!cfgUrl || cfgUrl.indexOf("https://") !== 0) {
      gateMsg("設定URLが埋め込まれていません。Pagesの再デプロイを確認してください。");
      return;
    }
    // LIFF ID は端末に覚えておき、config の往復を待たずに初期化する
    var liffId = "";
    try { liffId = localStorage.getItem(CACHE_PREFIX + "liff_id") || ""; } catch (e) {}
    var cfgP = fetch(cfgUrl + "?_path=config&_t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); });
    if (!liffId) {
      var cfg = await cfgP;
      liffId = String(cfg.liff_id || "").trim();
    } else {
      cfgP.then(function (cfg) {
        var id = String(cfg.liff_id || "").trim();
        try { if (id) localStorage.setItem(CACHE_PREFIX + "liff_id", id); } catch (e) {}
      }).catch(function () {});
    }
    if (!liffId) {
      gateMsg("LIFF ID がありません。");
      return;
    }
    try { localStorage.setItem(CACHE_PREFIX + "liff_id", liffId); } catch (e) {}
    await liff.init({ liffId: liffId, withLoginOnExternalBrowser: true });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: location.href.split("#")[0] });
      return;
    }
    var ctx = liff.getContext && liff.getContext();
    lineUserId = (ctx && ctx.userId) || "";
    if (!lineUserId) {
      var profile = await liff.getProfile();
      lineUserId = profile.userId || "";
    }
    // 認証確認と並行して、今週・来週の予定を先読みする（週TLは今日から7日で2週にまたがる）
    netDashboard(0).catch(function () {});
    netDashboard(1).catch(function () {});
    var cachedOk = false;
    try { cachedOk = localStorage.getItem(CACHE_PREFIX + "granted") === lineUserId; } catch (e) {}
    if (cachedOk) loadApp();
    var meRes = await fetch(withUser("auth/me"), { cache: "no-store" });
    var me = await meRes.json();
    if (me && me.error) throw new Error(me.error);
    if (!me || me.ok === false) throw new Error((me && me.error) || "auth/me failed");
    if (!me.access_granted) {
      try { localStorage.removeItem(CACHE_PREFIX + "granted"); } catch (e) {}
      if (cachedOk) { location.reload(); return; }
      if (me.db_status === "pending") {
        gateMsg("承認待ちです。管理者が承認すると、この画面が使えます。");
      } else {
        gateMsg("この画面は家族の承認メンバーだけが使えます。スケジュールアプリからアクセス申請してください。");
      }
      return;
    }
    try { localStorage.setItem(CACHE_PREFIX + "granted", lineUserId); } catch (e) {}
    loadApp();
  }

  start().catch(function (e) {
    gateMsg("接続できません。 " + shortErr(e && e.message ? e.message : e));
  });
})();
