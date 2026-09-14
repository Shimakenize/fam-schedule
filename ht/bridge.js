/* Away-from-home dining TV. LIFF auth then SonyBridge for the copied dashboard. */
(function () {
  "use strict";

  window.REMOTE_LIFF = true;
  window.PC_KIOSK = false;
  window.PHONE_KIOSK = false;
  window.__CONFIG_URL__ = "https://script.google.com/macros/s/AKfycbzTWV_X4UvgUxXSzI-KUVudV2EwEQdY9yLe2oKMf9DIkpGo_BNCe3uGG0wmFQ1EcLpC/exec";
  window.__API_BASE__ = window.__CONFIG_URL__;

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

  window.SonyBridge = {
    fetchDashboard: function (off, id) {
      var tries = 0;
      function once() {
        tries += 1;
        fetch(withUser("api/dashboard?week_offset=" + encodeURIComponent(off)), { cache: "no-store" })
          .then(function (r) {
            return r.text().then(function (t) {
              if (!r.ok) throw new Error(shortErr(t || ("http " + r.status)));
              var data;
              try { data = JSON.parse(t); } catch (e) { throw new Error("invalid json"); }
              if (data && data.error) throw new Error(String(data.error));
              if (data && data.ok === false && data.error) throw new Error(String(data.error));
              window.DashDone(id, null, data);
            });
          })
          .catch(function (e) {
            if (tries < 4) {
              setTimeout(once, 1200 * tries);
              return;
            }
            window.DashDone(id, shortErr(e.message || e), null);
          });
      }
      once();
    },
    fetchStudy: function (id) {
      var tries = 0;
      function once() {
        tries += 1;
        fetch(withUser("api/study"), { cache: "no-store" })
          .then(function (r) {
            return r.text().then(function (t) {
              if (!r.ok) throw new Error(shortErr(t || ("http " + r.status)));
              var data;
              try { data = JSON.parse(t); } catch (e) { throw new Error("invalid json"); }
              if (data && data.error) throw new Error(String(data.error));
              window.DashStudyDone(id, null, data);
            });
          })
          .catch(function (e) {
            if (tries < 4) {
              setTimeout(once, 1200 * tries);
              return;
            }
            window.DashStudyDone(id, shortErr(e.message || e), null);
          });
      }
      once();
    },
    log: function (s) {
      try { console.log(s); } catch (e) {}
    },
    exit: function () {}
  };

  function loadApp() {
    if (appLoaded) return;
    appLoaded = true;
    var s = document.createElement("script");
    s.src = "ht/app.js?v=20260914-3";
    s.onerror = function () { gateMsg("画面の読み込みに失敗しました。"); };
    document.body.appendChild(s);
    var gate = document.getElementById("ht-gate");
    if (gate) gate.hidden = true;
  }

  async function start() {
    var cfgUrl = String(window.__CONFIG_URL__ || "");
    if (!cfgUrl || cfgUrl.indexOf("https://") !== 0) {
      gateMsg("設定URLが埋め込まれていません。Pagesの再デプロイを確認してください。");
      return;
    }
    var cfgRes = await fetch(cfgUrl + "?_path=config&_t=" + Date.now(), { cache: "no-store" });
    var cfg = await cfgRes.json();
    var liffId = String(cfg.liff_id || "").trim();
    if (!liffId) {
      gateMsg("LIFF ID がありません。");
      return;
    }
    await liff.init({ liffId: liffId, withLoginOnExternalBrowser: true });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: location.href.split("#")[0] });
      return;
    }
    var profile = await liff.getProfile();
    lineUserId = profile.userId || "";
    var meRes = await fetch(withUser("auth/me"), { cache: "no-store" });
    var me = await meRes.json();
    if (me && me.error) throw new Error(me.error);
    if (!me || me.ok === false) throw new Error((me && me.error) || "auth/me failed");
    if (!me.access_granted) {
      if (me.db_status === "pending") {
        gateMsg("承認待ちです。管理者が承認すると、この画面が使えます。");
      } else {
        gateMsg("この画面は家族の承認メンバーだけが使えます。スケジュールアプリからアクセス申請してください。");
      }
      return;
    }
    loadApp();
  }

  start().catch(function (e) {
    gateMsg("接続できません。 " + shortErr(e && e.message ? e.message : e));
  });
})();
