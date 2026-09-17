(function () {
  "use strict";

  var HOUR0 = 6;
  var HOUR1 = 23;
  var tlHour0 = 6;
  var tlHour1 = 22;
  var WX_H0 = 6;
  var WX_H1 = 21;
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  var weekOffset = 0;
  var focusDayOffset = 0;
  var viewMode = "focus";
  var showAllFocus = true;
  var showAllWeek = false;
  var uiMode = "event";
  var filterSel = 0;
  var wxCol = 0;
  var wxRow = 0;
  var wxDetailDate = null;
  var eventsByCol = [];
  var tlCol = 0;
  var tlIdx = 0;
  var evDetailOpen = false;
  var fetchLock = false;
  var weekBusyWhich = "";
  var cbSeq = 0;
  var pending = {};
  var lastData = null;
  var cacheFocus = null;
  var cacheWeek = null;
  var kioskOn = false;
  var kioskPaused = false;
  var phoneWantSpeak = false;
  var kioskPage = 0;
  var kioskKey = "focus";
  var phoneSlice = "";
  var phoneSpeakRun = "";
  var PAGE_KEYS = ["brief", "focus", "wx", "weekHead", "week"];
  var PAGE_BTNS = ["btn-brief", "btn-focus", "btn-wx", "btn-week-head", "btn-week"];
  var pageKey = "focus";
  var kioskQueue = PAGE_KEYS.slice();
  var homeBriefing = null;
  var homeTransit = null;
  var boardOpen = false;
  var eatKey = false;
  var idleTimer = null;
  var kioskTimer = null;
  var IDLE_MS = 30 * 1000;
  var PAGE_MS = 15 * 1000;
  var SPEAK_HOLD_MS = 5 * 1000;
  var SPEAK_FAILSAFE_MS = 90 * 1000;
  var SPEAK_CHUNK_MAX = 48;
  var hushSpeak = false;
  var quietSpeakLatch = null;
  var clockDay = "";
  var kioskAwaitSpeak = false;
  var speakSeq = 0;
  var speakChunks = [];
  var speakChunkI = 0;
  var speakChunkAt = 0;
  var lastSpeakText = "";
  var weekPastStamp = "";
  var briefPastStamp = "";
  var BRIEF_SPEAK_MS = 60 * 60 * 1000;
  var settingsSel = 0;
  var VEIL_HOLD_MS = 700;
  var VEIL_OUT_MS = 220;
  var BAR_SCALE_MM = 5;
  var BRIEF_RAIN_MAX_MM = 7;
  var fxBusy = false;
  var fxGen = 0;
  var KIOSK_META = {
    brief: { title: "今日のHL", sub: "TODAY" },
    tomo: { title: "明日のHL", sub: "TOMORROW" },
    focus: { title: "予定(2日)", sub: "TIMELINE" },
    wx: { title: "天気(3日)", sub: "FORECAST" },
    weekHead: { title: "今週のHL", sub: "THIS WEEK" },
    nextWeekHead: { title: "来週のHL", sub: "NEXT WEEK" },
    week: { title: "週TL", sub: "TIMELINE" },
    study: { title: "試験Status", sub: "STUDY" },
    studyTodo: { title: "試験Todo", sub: "STUDY" },
    standings: { title: "順位", sub: "順位" }
  };
  var studyData = null;
  var studyLoadErr = "";
  var studyCbSeq = 0;
  var studyPending = {};
  var STANDINGS_CODES = ["U-15", "U-13L"];
  var standingsData = null;
  var standingsLoadErr = "";
  var standingsCbSeq = 0;
  var standingsPending = {};

  function afterSixPm() {
    return new Date().getHours() >= 18;
  }
  function isSunday() {
    return new Date().getDay() === 0;
  }
  function isWeekHeadPage(k) {
    var p = parentPage(k);
    return p === "weekHead" || p === "nextWeekHead";
  }
  function isNextWeekHead(parent) {
    return parentPage(parent || pageKey) === "nextWeekHead";
  }
  function weekHeadWord(parent) {
    return isNextWeekHead(parent) ? "来週" : "今週";
  }
  function insertNextWeekHeadPages(keys, btns) {
    if (!isSunday()) return { keys: keys, btns: btns };
    var k = [];
    var b = [];
    var i;
    for (i = 0; i < keys.length; i++) {
      k.push(keys[i]);
      b.push(btns[i]);
      if (keys[i] === "weekHead") {
        k.push("nextWeekHead");
        b.push("btn-next-week-head");
      }
    }
    return { keys: k, btns: b };
  }
  function studyDebug() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var v = q.get("studyDebug");
      return v === "1" || v === "true";
    } catch (e) {}
    return false;
  }
  function studyPagesOn() {
    if (studyDebug()) return true;
    if (studyData && studyData.active) return true;
    if (studyData && studyData.active === false) return false;
    return todayStr() <= ((studyData && (studyData.examEnd || studyData.examDate)) || "2026-09-18");
  }
  function studyActive() {
    return !!(studyData && studyData.active);
  }
  function isStudyPage(k) {
    var p = parentPage(k);
    return p === "study" || p === "studyTodo";
  }
  function isStandingsPage(k) {
    return parentPage(k) === "standings";
  }
  function insertStandingsPages(keys, btns) {
    if (isPhone()) return { keys: keys, btns: btns };
    keys = keys.slice().concat(["standings"]);
    btns = btns.slice().concat(["btn-standings"]);
    return { keys: keys, btns: btns };
  }
  function insertStudyPages(keys, btns) {
    if (!studyPagesOn()) return { keys: keys, btns: btns };
    var at = keys.indexOf("tomo");
    if (at < 0) at = keys.indexOf("brief");
    if (at < 0) return { keys: keys, btns: btns };
    keys = keys.slice();
    btns = btns.slice();
    if (isPhone()) {
      if (!studyDebug() && !studyTodaySpeakItems().length) return { keys: keys, btns: btns };
      keys.splice(at + 1, 0, "study");
      btns.splice(at + 1, 0, "btn-study");
    } else {
      keys.splice(at + 1, 0, "study", "studyTodo");
      btns.splice(at + 1, 0, "btn-study", "btn-study-todo");
    }
    return { keys: keys, btns: btns };
  }
  function hidePageBtn(id, hide) {
    var b = $(id);
    if (b) b.hidden = !!hide;
  }
  function rebuildPageLists() {
    if (studyDebug()) {
      if (isPhone()) {
        PAGE_KEYS = ["study"];
        PAGE_BTNS = ["btn-study"];
        hidePageBtn("btn-study-todo", true);
      } else {
        PAGE_KEYS = ["study", "studyTodo"];
        PAGE_BTNS = ["btn-study", "btn-study-todo"];
        hidePageBtn("btn-study-todo", false);
      }
      hidePageBtn("btn-brief", true);
      hidePageBtn("btn-tomo", true);
      hidePageBtn("btn-focus", true);
      hidePageBtn("btn-wx", true);
      hidePageBtn("btn-week-head", true);
      hidePageBtn("btn-next-week-head", true);
      hidePageBtn("btn-week", true);
      hidePageBtn("btn-standings", true);
      hidePageBtn("btn-study", false);
      return;
    }
    if (isPhone()) {
      if (afterSixPm()) {
        PAGE_KEYS = ["brief", "tomo", "wx", "weekHead"];
        PAGE_BTNS = ["btn-brief", "btn-tomo", "btn-wx", "btn-week-head"];
      } else {
        PAGE_KEYS = ["brief", "wx", "weekHead"];
        PAGE_BTNS = ["btn-brief", "btn-wx", "btn-week-head"];
      }
    } else if (afterSixPm()) {
      PAGE_KEYS = ["brief", "tomo", "focus", "wx", "weekHead", "week"];
      PAGE_BTNS = ["btn-brief", "btn-tomo", "btn-focus", "btn-wx", "btn-week-head", "btn-week"];
    } else {
      PAGE_KEYS = ["brief", "focus", "wx", "weekHead", "week"];
      PAGE_BTNS = ["btn-brief", "btn-focus", "btn-wx", "btn-week-head", "btn-week"];
    }
    var packed = insertNextWeekHeadPages(PAGE_KEYS, PAGE_BTNS);
    packed = insertStudyPages(packed.keys, packed.btns);
    packed = insertStandingsPages(packed.keys, packed.btns);
    PAGE_KEYS = packed.keys;
    PAGE_BTNS = packed.btns;
    var tb = $("btn-tomo");
    if (tb) tb.hidden = !afterSixPm();
    var fb = $("btn-focus");
    if (fb) fb.hidden = isPhone();
    var wb = $("btn-week");
    if (wb) wb.hidden = isPhone();
    var nwb = $("btn-next-week-head");
    if (nwb) nwb.hidden = !isSunday();
    var sb = $("btn-study");
    if (sb) sb.hidden = !studyPagesOn();
    var stb = $("btn-study-todo");
    if (stb) stb.hidden = isPhone() || !studyPagesOn();
    hidePageBtn("btn-standings", isPhone());
  }
  function filterSelMax() {
    rebuildPageLists();
    return 1 + PAGE_KEYS.length;
  }
  function isBriefPage(k) {
    return parentPage(k) === "brief" || parentPage(k) === "tomo";
  }
  function isPhone() { return !!window.PHONE_KIOSK; }
  function parentPage(key) {
    var s = String(key || "");
    var i = s.indexOf("|");
    return i < 0 ? s : s.slice(0, i);
  }
  function sliceOf(key) {
    var s = String(key || "");
    var i = s.indexOf("|");
    return i < 0 ? "" : s.slice(i + 1);
  }
  function phoneQueueKey(parent, slice) {
    if (!isPhone() || !slice) return parent;
    return parent + "|" + slice;
  }
  function headlineParent(k) {
    var p = parentPage(k);
    return p === "brief" || p === "tomo" || p === "weekHead" || p === "nextWeekHead" || p === "study" || p === "studyTodo" ||
      p === "standings";
  }
  function phoneSlicesFor(parent) {
    if (!isPhone()) return [parent];
    if (parent === "brief" || parent === "tomo") {
      var iso = parent === "tomo" ? addDaysIso(todayStr(), 1) : todayStr();
      var rows = briefDayEvents(iso);
      var out = [parent + "|wx"];
      if (rows.filter(function (ev) { return canonicalKind(ev.kind) === "塾"; }).length) {
        out.push(parent + "|juku");
      }
      if (rows.filter(isSoccerEv).length) out.push(parent + "|soccer");
      if (rows.filter(isMiscEv).length) out.push(parent + "|misc");
      if (parent === "brief") out.push(parent + "|transit");
      return out;
    }
    if (parent === "focus" || parent === "week") return [];
    if (parent === "wx") return ["wx|today", "wx|tomo", "wx|asatte"];
    if (parent === "weekHead" || parent === "nextWeekHead") {
      var h = weekHeadData(parent);
      var prefix = parent + "|";
      var outW = [];
      if ((h.juku || []).length) outW.push(prefix + "juku");
      if ((h.u13Activity || []).length) outW.push(prefix + "u13");
      weekendMatchDays(parent).forEach(function (iso) {
        if (weekendEventsForIso(iso, parent).length) outW.push(prefix + weekendSliceKey(iso));
      });
      if ((h.misc || []).length || (h.marinos || []).length) outW.push(prefix + "miscMarinos");
      outW.push(prefix + "wx");
      return outW;
    }
    if (parent === "study") {
      if (isPhone()) return (studyTodaySpeakItems().length || studyDebug()) ? ["study"] : [];
      return (studyData && studyData.subjects || []).filter(function (s) {
        return (s.videos && s.videos.total) || (s.quizFirst && s.quizFirst.total) || (s.paper && s.paper.total);
      }).map(function (s) { return "study|" + s.key; });
    }
    if (parent === "studyTodo") {
      if (isPhone()) return [];
      var outS = [];
      if (studySliceHasItems("today")) outS.push("studyTodo|today");
      if (studySliceHasItems("rest")) outS.push("studyTodo|rest");
      return outS;
    }
    return [parent];
  }
  function kioskMeta(key) {
    var p = parentPage(key);
    var s = sliceOf(key);
    var day = p === "tomo" ? "明日" : "今日";
    var subDay = p === "tomo" ? "TOMORROW" : "TODAY";
    if (p === "brief" || p === "tomo") {
      if (s === "juku") return { title: day + "の塾", sub: subDay };
      if (s === "soccer") return { title: day + "のサッカー", sub: subDay };
      if (s === "misc") return { title: day + "の単発・私用", sub: subDay };
      if (s === "wx") return { title: day + "の天気", sub: subDay };
      if (s === "transit") return { title: "運行", sub: "TRANSIT" };
    }
    if (p === "focus") {
      if (s === "today") return { title: "今日", sub: "TIMELINE" };
      if (s === "tomo") return { title: "明日", sub: "TIMELINE" };
    }
    if (p === "wx") {
      if (s === "today") return { title: "今日の天気", sub: "FORECAST" };
      if (s === "tomo") return { title: "明日の天気", sub: "FORECAST" };
      if (s === "asatte") return { title: "明後日の天気", sub: "FORECAST" };
    }
    if (p === "weekHead" || p === "nextWeekHead") {
      var w = weekHeadWord(p);
      var sub = p === "nextWeekHead" ? "NEXT WEEK" : "THIS WEEK";
      if (s === "juku") return { title: w + "の塾", sub: sub };
      if (s === "u13") {
        return { title: (p === "nextWeekHead" ? "来週の" : "") + "U13平日の活動", sub: sub };
      }
      if (isWeekendPhoneSlice(s)) {
        var d = parseLocalDate(weekendIsoForSlice(s, p));
        var t = "週末予定";
        if (d) t = (d.getMonth() + 1) + "/" + d.getDate() + " " + WD[d.getDay()] + "曜日の予定";
        if (p === "nextWeekHead") t = "来週の" + t;
        return { title: t, sub: sub };
      }
      if (s === "miscMarinos") return { title: w + "のその他予定", sub: sub };
      if (s === "wx") return { title: w + "の天気", sub: sub };
    }
    if (p === "study") {
      if (isPhone()) return { title: "今日のやること", sub: "STUDY" };
      var subj = studySubject(s);
      if (subj) return { title: subj.label + "の試験Status", sub: "STUDY" };
    }
    if (p === "studyTodo") {
      if (s === "today") return { title: "今日のやること", sub: "STUDY" };
      if (s === "rest") return { title: "残りの勉強", sub: "STUDY" };
    }
    return KIOSK_META[p] || KIOSK_META.focus;
  }
  function syncPhoneLayout() {
    if (!isPhone()) return;
    document.documentElement.classList.remove("phone-scale");
    if (window.DashPhoneFit) window.DashPhoneFit();
  }
  function phoneViewData(data) {
    if (!isPhone() || !data || pageKey !== "focus") return data;
    var iso = phoneSlice === "tomo" ? addDaysIso(data.today || todayStr(), 1) : (data.today || todayStr());
    return clipDashboard(data, [iso]);
  }
  function phoneRangeTitle() {
    var meta = kioskMeta(kioskKey);
    if (isPhone() && sliceOf(kioskKey)) return meta.title;
    return "";
  }
  var STUDY_KIND = {
    video: "動画",
    quizFirst: "初回Quiz",
    wrongVideo: "誤答動画",
    quizRetry: "誤答Quiz",
    paper: "紙テスト"
  };
  function studySubject(key) {
    var list = (studyData && studyData.subjects) || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return null;
  }
  function studyDayCounts(row) {
    var n = 0;
    var subjects = (row && row.subjects) || {};
    Object.keys(subjects).forEach(function (k) {
      var items = (subjects[k] && subjects[k].items) || [];
      n += items.length;
    });
    return n;
  }
  function studySliceHasItems(slice) {
    if (!studyActive()) return false;
    var today = studyData.today;
    var plan = studyData.plan || [];
    if (slice === "today") {
      var t = plan.filter(function (p) { return p.date === today; })[0];
      return studyDayCounts(t) > 0;
    }
    if (slice === "rest") {
      return plan.some(function (p) { return p.date !== today && studyDayCounts(p) > 0; });
    }
    return false;
  }
  function studyRangeLine() {
    if (!studyData) return studyDebug() ? "試験デバッグ　読み込み中" : "試験";
    var left = studyData.daysLeft;
    var exam = fmtMd(studyData.examDate);
    if (pageKey === "studyTodo") {
      return phoneRangeTitle() || ((studyDebug() ? "試験デバッグ　" : "") + "試験Todo　" + left + "日（当日含む）　" + exam);
    }
    return phoneRangeTitle() || ((studyDebug() ? "試験デバッグ　" : "") + "試験Status　" + left + "日（当日含む）　" + exam);
  }
  function studyMeterHtml(label, pack, uncreated) {
    var done = pack && pack.done != null ? Number(pack.done) : 0;
    var left = pack && pack.left != null ? Number(pack.left) : 0;
    if (isNaN(done)) done = 0;
    if (isNaN(left)) left = 0;
    var tot = pack && pack.total != null ? Number(pack.total) : 0;
    if (isNaN(tot)) tot = 0;
    var cls = uncreated ? "miss" : (!tot ? "mute" : (left ? "warn" : "ok"));
    var pct = tot ? Math.round((100 * done) / tot) : 0;
    var hero = uncreated ? "-" : String(left);
    var body = uncreated
      ? '<div class="hero">-</div>'
      : (!tot
        ? '<div class="hero">' + hero + '</div><div class="left">なし</div>'
        : '<div class="done">完了 ' + done + '</div><div class="hero">' + hero + '</div><div class="pct">' + pct + "%</div>");
    return '<div class="study-meter ' + cls + '"><div class="k">' + esc(label) + "</div>" + body + "</div>";
  }
  function studyTaskCard(it, withSubject, overdueDay) {
    var kind = (it && it.kindLabel) || STUDY_KIND[(it && it.kind) || ""] || "";
    var unit = (it && it.unitLabel) || (it && it.unitId) || "";
    var title = (it && it.title) || "";
    var k = (it && it.kind) || "";
    var subj = (it && it.subjectLabel) || "";
    var subKey = (it && it.subjectKey) || "";
    var kindLine = withSubject && subj ? subj + " · " + kind : kind;
    var miss = it && (it.missing || title === "未作成");
    var done = !!(it && it.done);
    var overdue = !!(overdueDay && !done);
    var badge = done ? '<div class="badge done">完了</div>' : (overdue ? '<div class="badge due">未了</div>' : "");
    return '<article class="study-task k-' + esc(k) + ' sub-' + esc(subKey) +
      (miss ? " missing" : "") + (done ? " done" : "") + (overdue ? " active" : "") + '">' + badge +
      '<div class="kind">' + esc(kindLine) +
      '</div><div class="unit">' + esc(unit) + '</div><div class="ttl">' + esc(title) + "</div></article>";
  }
  function studyTasksHtml(items) {
    if (!items || !items.length) return '<div class="study-empty">今日の残りはありません</div>';
    return '<div class="study-tasks">' + items.map(function (it) { return studyTaskCard(it, false); }).join("") + "</div>";
  }
  function studyTodayItems(key) {
    var pack = ((studyData && studyData.todayPlan) || {})[key] || {};
    return pack.items || [];
  }
  function studyBannerHtml() {
    var left = studyData.daysLeft;
    var examDay = studyData.today === studyData.examDate;
    var n = examDay ? "当日" : String(left);
    var lab = examDay ? "" : "日";
    return '<div class="study-banner"><div class="n">' + esc(n) + '</div><div class="lab">' + lab +
      '</div><div class="sub">試験 ' + esc(fmtMd(studyData.examDate)) + " まで（当日含む）　理科・社会</div></div>";
  }
  function studySubjectMeters(s) {
    var hint = s.basicOnly ? '<span class="hint">基本・追補のみ</span>' : "";
    return '<section class="study-panel sub-' + esc(s.key) + '"><h2>' + esc(s.label) + hint + "</h2><div class=\"study-meters\">" +
      studyMeterHtml("動画", s.videos) +
      studyMeterHtml("初回クイズ", s.quizFirst) +
      studyMeterHtml("誤答動画", s.wrongVideos, !!(s.wrongVideos && s.wrongVideos.missing)) +
      studyMeterHtml("誤答クイズ", s.quizRetry, !!(s.quizRetry && s.quizRetry.blocked)) +
      studyMeterHtml("紙テスト", s.paper) +
      "</div></section>";
  }
  function studySubjectToday(s, heading) {
    var items = studyTodayItems(s.key);
    var hint = items.length ? '<span class="hint">' + items.length + "件</span>" : '<span class="hint">なし</span>';
    return '<section class="study-panel"><h2>' + esc(heading || ("今日の" + s.label)) + hint + "</h2>" +
      studyTasksHtml(items) + "</section>";
  }
  function studyDayItems(row) {
    var items = [];
    ((studyData && studyData.subjects) || []).forEach(function (s) {
      var pack = ((row && row.subjects) || {})[s.key] || {};
      items = items.concat(pack.items || []);
    });
    return items;
  }
  function studyJukuNames(iso) {
    var src = cacheWeek || lastData || {};
    var evs = activeEvents(src.events);
    var names = [];
    evs.forEach(function (e) {
      var dt = String(e.date || e.event_date || "").slice(0, 10);
      if (dt !== iso) return;
      if (canonicalKind(e.kind || e.event_kind) !== "塾") return;
      var lab = jukuSubjectLabel(e);
      if (lab && names.indexOf(lab) < 0) names.push(lab);
    });
    return names;
  }
  function studyOpenItems(row) {
    return studyDayItems(row).filter(function (it) {
      return it && !it.placeholder && !it.done;
    });
  }
  function studyCalDayFinished(row) {
    if (studyOpenItems(row).length) return false;
    var items = studyDayItems(row).filter(function (it) { return it && !it.placeholder; });
    if (items.length) return items.every(function (it) { return !!it.done; });
    return !!(studyData && row.date < studyData.today);
  }
  function studyCalDayOverdue(row) {
    return !!(studyData && row.date < studyData.today && studyOpenItems(row).length);
  }
  function studyCalDayHtml(row) {
    var isToday = row.date === studyData.today;
    var isExam = (row.tag === "exam") || row.date === studyData.examDate || row.date === studyData.examEnd;
    var tag = row.tag || (isExam ? "exam" : "");
    var note = row.note || "";
    if (tag === "juku") {
      var live = studyJukuNames(row.date);
      if (live.length) note = "塾の" + live.join("・") + "に集中";
    }
    var d = parseLocalDate(row.date);
    var lab = fmtMd(row.date) + (d ? "（" + WD[d.getDay()] + "）" : "");
    if (isToday) lab = "今日 " + lab;
    else if (row.date < studyData.today) lab = (row.date === addDaysIso(studyData.today, -1) ? "昨日 " : "過ぎた日 ") + lab;
    if (isExam) lab += " 試験";
    var overdue = studyCalDayOverdue(row);
    var cls = "study-cal-day" + (isToday ? " today" : "") + (tag ? " " + tag : "") + (isExam ? " exam" : "") +
      (!isToday && row.date < studyData.today ? " past" : "") +
      (studyCalDayFinished(row) ? " finished" : "") +
      (overdue ? " overdue" : "");
    var inner = "";
    if (tag === "buffer") {
      inner = '<div class="banner">予備日</div>';
    } else if (tag === "juku-buffer") {
      inner = '<div class="split">' +
        '<div class="half juku"><div class="banner juku">' + esc(note || "塾に集中") + "</div></div>" +
        '<div class="half buffer"><div class="banner">予備日</div></div>' +
        "</div>";
    } else if (tag === "exam") {
      var cards = row.examCards || [];
      inner = '<div class="items exam-col">' + cards.map(function (it) {
        return studyTaskCard(it, false, overdue);
      }).join("") + "</div>";
    } else if (tag === "juku") {
      var jukuItems = studyDayItems(row).filter(function (it) { return it && !it.placeholder; });
      if (jukuItems.length) {
        var jcols = jukuItems.length > 3 ? 3 : (jukuItems.length > 1 ? 2 : 1);
        inner = '<div class="split">' +
          '<div class="half juku"><div class="banner juku">' + esc(note || "塾に集中") + "</div></div>" +
          '<div class="half cards"><div class="items" style="--icols:' + jcols + '">' +
          jukuItems.map(function (it) { return studyTaskCard(it, true, overdue); }).join("") +
          "</div></div></div>";
      } else {
        inner = '<div class="banner juku">' + esc(note || "塾に集中") + "</div>";
      }
    } else {
      var items = studyDayItems(row);
      var cols = items.length > 4 ? 3 : (items.length > 1 ? 2 : 1);
      var body = items.length
        ? items.map(function (it) { return studyTaskCard(it, true, overdue); }).join("")
        : '<div class="study-empty">なし</div>';
      inner = '<div class="items" style="--icols:' + cols + '">' + body + "</div>";
    }
    return '<section class="' + cls + '"><div class="h">' + esc(lab) + "</div>" + inner + "</section>";
  }
  function studyCalRowHtml(days) {
    if (!days.length) return "";
    return '<div class="study-cal-row" style="--cols:' + days.length + '">' +
      days.map(studyCalDayHtml).join("") + "</div>";
  }
  function setStudyBoardMode(oneRow) {
    var board = $("study-board");
    if (board) board.classList.toggle("study-one", !!oneRow);
  }
  function studyTodayDens(n) {
    if (n <= 2) return "d2";
    if (n <= 4) return "d4";
    if (n <= 6) return "d6";
    if (n <= 9) return "d9";
    return "d12";
  }
  function renderPhoneStudyToday() {
    var el = $("study-board");
    if (!el) return;
    setStudyBoardMode(true);
    if (!studyData) {
      el.innerHTML = '<div class="study-note">' + (studyLoadErr ? "試験データを取得できません" : "読み込み中…") + "</div>";
      return;
    }
    if (!studyActive() && !studyDebug()) {
      el.innerHTML = '<div class="study-note">試験期間外です</div>';
      return;
    }
    var items = studyTodaySpeakItems();
    var n = items.length;
    el.innerHTML = '<div class="study-today-only dens-' + studyTodayDens(n) + '"><h2>今日のやること<span class="hint">' + n + "件</span></h2>" +
      (n
        ? '<div class="study-tasks">' + items.map(function (it) {
          return studyTaskCard(it, true);
        }).join("") + "</div>"
        : '<div class="study-empty">今日の残りはありません</div>') +
      "</div>";
  }
  function renderStudyStatus() {
    var el = $("study-board");
    if (!el) return;
    setStudyBoardMode(false);
    if (!studyData) {
      el.innerHTML = '<div class="study-note">' + (studyLoadErr ? "試験データを取得できません" : "読み込み中…") + "</div>";
      return;
    }
    if (!studyActive()) {
      el.innerHTML = '<div class="study-note">試験期間外です</div>';
      return;
    }
    var subjects = studyData.subjects || [];
    var meters = '<div class="study-deck">';
    var today = '<div class="study-deck">';
    subjects.forEach(function (s) {
      meters += studySubjectMeters(s);
      today += studySubjectToday(s, "今日の" + s.label);
    });
    meters += "</div>";
    today += "</div>";
    el.innerHTML = studyBannerHtml() + meters + today;
  }
  function renderStudyTodo() {
    var el = $("study-board");
    if (!el) return;
    setStudyBoardMode(false);
    if (!studyData) {
      el.innerHTML = '<div class="study-note">' + (studyLoadErr ? "試験データを取得できません" : "読み込み中…") + "</div>";
      return;
    }
    if (!studyActive()) {
      el.innerHTML = '<div class="study-note">試験期間外です</div>';
      return;
    }
    var html = studyBannerHtml();
    setStudyBoardMode(true);
    var plan = studyData.plan || [];
    var topN = Math.ceil(plan.length / 2) || 1;
    var row1 = plan.slice(0, topN);
    var row2 = plan.slice(topN);
    html += '<div class="study-cal' + (row2.length ? "" : " one") + '">' +
      studyCalRowHtml(row1) + studyCalRowHtml(row2) + "</div>";
    el.innerHTML = html;
  }
  function renderStudy() {
    $("range-line").textContent = studyRangeLine();
    if (isPhone()) renderPhoneStudyToday();
    else if (pageKey === "studyTodo") renderStudyTodo();
    else renderStudyStatus();
  }
  window.DashStudyDone = function (id, err, payload) {
    var cb = studyPending[id];
    delete studyPending[id];
    if (!cb) return;
    if (err) cb(err, null);
    else cb(null, payload);
  };
  function applyStudyPayload(d) {
    var firstStudy = !studyData;
    studyData = d || null;
    studyLoadErr = "";
    var meterSnap = (d && d.subjects || []).map(function (s) {
      return {
        k: s.key,
        v: s.videos && s.videos.left,
        q: s.quizFirst && s.quizFirst.left,
        wv: s.wrongVideos && { left: s.wrongVideos.left, missing: s.wrongVideos.missing },
        qr: s.quizRetry && { left: s.quizRetry.left, blocked: s.quizRetry.blocked },
        p: s.paper && s.paper.left
      };
    });
    appLog({
      event: "study_ok",
      today: d && d.today,
      daysLeft: d && d.daysLeft,
      meters: meterSnap,
      rikToday: ((((d && d.todayPlan) || {}).rik || {}).items || []).map(function (it) {
        return (it.kind || "") + ":" + (it.title || "");
      })
    });
    var was = PAGE_KEYS.indexOf("study") >= 0;
    rebuildPageLists();
    var now = PAGE_KEYS.indexOf("study") >= 0;
    if (isStudyPage(pageKey)) {
      if (!now) selectPage(isPhone() ? "brief" : "focus");
      else {
        renderStudy();
        if (firstStudy && !kioskOn && !hushSpeak && studySpeakText()) maybeSpeakPage(kioskKey);
      }
    } else if (was !== now) {
      syncFilterUi();
      if (kioskOn || isPhone()) refreshKioskQueue();
    } else {
      syncFilterUi();
    }
  }
  function applyStudyFail(err) {
    studyData = null;
    studyLoadErr = String(err || "fail");
    appLog({ event: "study_err", msg: studyLoadErr.slice(0, 160) });
    rebuildPageLists();
    if (isStudyPage(pageKey) && !studyPagesOn()) selectPage(isPhone() ? "brief" : "focus");
    else if (isStudyPage(pageKey)) renderStudy();
    else syncFilterUi();
  }
  function loadStudy() {
    if (window.SonyBridge && typeof SonyBridge.fetchStudy === "function") {
      studyCbSeq += 1;
      studyPending[studyCbSeq] = function (err, payload) {
        if (err) applyStudyFail(err);
        else applyStudyPayload(payload);
      };
      SonyBridge.fetchStudy(studyCbSeq);
      return;
    }
    fetch("/api/study", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("study " + res.status);
      return res.json();
    }).then(applyStudyPayload).catch(function (e) {
      applyStudyFail(e && e.message);
    });
  }
  function studySpeakKind(it) {
    var k = (it && it.kind) || "";
    var slot = (it && it.slot) || "";
    var n = slot === "①" ? "1" : (slot === "②" ? "2" : "");
    if (k === "video") return "動画";
    if (k === "quizFirst") return "クイズ";
    if (k === "wrongVideo") return "誤答動画" + n;
    if (k === "quizRetry") return "誤答クイズ" + n;
    if (k === "paper") return "紙テスト";
    if (k === "exam") return "試験";
    var lab = (it && it.kindLabel) || STUDY_KIND[k] || "";
    return String(lab).replace(/Quiz/g, "クイズ").replace(/①/g, "1").replace(/②/g, "2");
  }
  function studyTodaySpeakItems() {
    if (!studyData) return [];
    var today = studyData.today;
    var row = (studyData.plan || []).filter(function (p) { return p.date === today; })[0];
    if (!row) return [];
    if (row.examCards && row.examCards.length) return row.examCards.slice();
    return studyDayItems(row).filter(function (it) {
      return it && !it.done && !it.placeholder && !it.missing;
    });
  }
  function studySpeakUnit(it) {
    var u = String((it && it.unitLabel) || "").replace(/\s+/g, "");
    if (!u || u === "—" || /進捗/.test(u)) return "";
    if (u === String((it && it.subjectLabel) || "")) return "";
    return u;
  }
  function studySpeakText() {
    if (!studyActive()) return "";
    var items = studyTodaySpeakItems();
    if (!items.length) return "";
    var groups = [];
    var map = {};
    items.forEach(function (it) {
      var subj = it.subjectLabel || "";
      var unit = studySpeakUnit(it);
      var kind = studySpeakKind(it);
      if (!subj || !kind) return;
      var key = (it.subjectKey || subj) + "\t" + (it.unitId || unit || kind);
      if (!map[key]) {
        map[key] = { subj: subj, unit: unit, kinds: [] };
        groups.push(map[key]);
      }
      if (map[key].kinds.indexOf(kind) < 0) map[key].kinds.push(kind);
    });
    if (!groups.length) return "";
    var bits = ["本日はやることが" + items.length + "件あります。"];
    groups.forEach(function (g) {
      var mid = g.kinds.join("と");
      if (g.unit) bits.push(g.subj + "の" + g.unit + "の" + mid + "です、");
      else bits.push(g.subj + "の" + mid + "です、");
    });
    bits.push("遅れるとテストまでに間に合いません。");
    bits.push("確実に終わらせましょう。");
    return bits.join("");
  }
  var STANDINGS_ZONE_NUMS = ["①", "②", "③", "④", "⑤", "⑥"];
  function standingsCatByCode(code) {
    if (!standingsData) return null;
    var list = standingsData.categories || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].category_code === code) return list[i];
    }
    return null;
  }
  function standingsRegaliaTeam(cat) {
    return (cat.teams || []).filter(function (t) { return /REGALIA|レガリア/i.test(t.club || ""); })[0];
  }
  function standingsRowsHtml(cat) {
    var footnoteOrder = [];
    var footnoteIdx = {};
    (cat.teams || []).forEach(function (t) {
      var zone = (cat.zones || {})[String(t.rank)];
      if (zone && footnoteIdx[zone.kind] === undefined) {
        footnoteIdx[zone.kind] = footnoteOrder.length;
        footnoteOrder.push(zone);
      }
    });
    var rows = (cat.teams || []).map(function (t) {
      var isRegalia = /REGALIA|レガリア/i.test(t.club || "");
      var zone = (cat.zones || {})[String(t.rank)];
      var zoneHtml = zone
        ? '<span class="stg-zone"><span class="stg-dot" style="background:' + zone.color + '"></span><span class="stg-num">' +
          (STANDINGS_ZONE_NUMS[footnoteIdx[zone.kind]] || "") + "</span></span>"
        : "";
      return '<tr class="' + (isRegalia ? "is-regalia" : "") + '">' +
        "<td>" + t.rank + "</td>" +
        "<td>" + esc(t.club) + (isRegalia ? " ★" : "") + "</td>" +
        "<td>" + t.points + "</td>" +
        "<td>" + t.played + "</td>" +
        "<td>" + t.win + "-" + t.draw + "-" + t.lose + "</td>" +
        "<td>" + (t.diff > 0 ? "+" + t.diff : t.diff) + "</td>" +
        "<td>" + t.remaining + "</td>" +
        "<td>" + zoneHtml + "</td>" +
        "</tr>";
    }).join("");
    var legend = footnoteOrder.length
      ? '<div class="stg-legend">' + footnoteOrder.map(function (z, i) {
          return '<span class="stg-legend-item"><span class="stg-dot" style="background:' + z.color + '"></span>' +
            (STANDINGS_ZONE_NUMS[i] || "") + " " + esc(z.label) + "</span>";
        }).join("") + "</div>"
      : "";
    return { rows: rows, legend: legend };
  }
  function standingsSimHtml(sim) {
    if (!sim || !sim.blocks || !sim.blocks.length) return "";
    var typeLabel = { relegation: "残留/降格", promotion: "昇格" };
    var sentiment = { good: "stg-sim-good", bad: "stg-sim-bad", mixed: "stg-sim-mixed" };
    var blocks = sim.blocks.map(function (b) {
      return '<div class="stg-sim-block ' + (sentiment[b.sentiment] || "stg-sim-mixed") + '">' +
        '<div class="stg-sim-head">' + (typeLabel[b.type] || b.type) + "：<strong>" + esc(b.verdict) + "</strong></div>" +
        '<div class="stg-sim-detail">' + esc(b.detail) + "</div></div>";
    }).join("");
    return '<div class="stg-sim"><div class="stg-sim-title">昇格/降格シミュレーション（残り' + sim.remaining +
      "試合、勝点" + sim.regaliaMin + "〜" + sim.regaliaMax + "点の範囲）</div>" + blocks + "</div>";
  }
  function standingsUpcomingHtml(cat) {
    var all = cat.regaliaUpcoming || [];
    if (!all.length) return "";
    var rows = all.slice(0, 2).map(function (m) {
      return '<div class="stg-up-row"><span class="stg-up-date">' + (m.match_date ? esc(fmtMd(m.match_date)) : "日程未定") +
        '</span><span class="stg-up-opp">vs ' + esc(m.opponent || "未定") + '</span><span class="stg-up-venue">' +
        esc(m.venue || "") + "</span></div>";
    }).join("");
    return '<div class="stg-upcoming"><h3>残り対戦相手（' + all.length + '試合）</h3>' + rows + "</div>";
  }
  function standingsColHtml(cat) {
    if (!cat || !cat.ok) {
      return '<div class="stg-col"><div class="study-note">' + esc((cat && cat.error) || "データがありません") + "</div></div>";
    }
    var noteHtml = cat.note ? '<div class="stg-note">' + esc(cat.note) + "</div>" : "";
    var metaHtml = '<div class="stg-meta">' + esc(cat.group_name || "") + " ／ 最終取得: " + esc(cat.scraped_at || "") + "</div>";
    var titleText = esc(cat.label || "") + (cat.group_name ? "（" + esc(cat.group_name) + "）" : "");
    var built = standingsRowsHtml(cat);
    return '<div class="stg-col"><h2 class="stg-title">' + titleText + "</h2>" + noteHtml + metaHtml +
      '<table class="stg-table"><thead><tr>' +
      "<th>#</th><th>クラブ</th><th>勝点</th><th>試合</th><th>勝分敗</th><th>差</th><th>残り</th><th>状況</th>" +
      "</tr></thead><tbody>" + built.rows + "</tbody></table>" +
      built.legend + standingsSimHtml(cat.simulation) + standingsUpcomingHtml(cat) + "</div>";
  }
  // U15L2部の隣にREGALIA非所属の参考グループ（extraGroup、GAS側でハードコード）を
  // 表示する（ユーザー指示、2026-09-17）。REGALIA不在のためsimulation/残り対戦相手は無く、
  // standingsColHtmlに渡す形だけ合わせて表・凡例のみ描画する。
  function standingsExtraColHtml(parentCat, extra) {
    if (!extra) return '<div class="stg-col"></div>';
    return standingsColHtml({
      ok: true,
      label: (parentCat && parentCat.label) || "",
      group_name: extra.group_name,
      scraped_at: parentCat && parentCat.scraped_at,
      teams: extra.teams,
      zones: extra.zones || {},
      note: "",
      simulation: null,
      regaliaUpcoming: []
    });
  }
  // 左列: U15L2部REGALIA所属グループ（上）／その参考グループ（下）。
  // 右列: U13L2部REGALIA所属グループ（上）／その参考グループ（下）。
  // 2分割のまま各列を上下に割る2x2構成（ユーザー指示、2026-09-17。U14L表示案からの変更）。
  function renderStandings() {
    var el = $("standings-board");
    if (!el) return;
    if (!standingsData) {
      el.innerHTML = '<div class="study-note">' + (standingsLoadErr ? "順位データを取得できません" : "読み込み中…") + "</div>";
      return;
    }
    var u15 = standingsCatByCode("U-15");
    var u13 = standingsCatByCode("U-13L");
    var leftTop = standingsColHtml(u15);
    var leftBottom = standingsExtraColHtml(u15, u15 && u15.extraGroup);
    var rightTop = standingsColHtml(u13);
    var rightBottom = standingsExtraColHtml(u13, u13 && u13.extraGroup);
    el.innerHTML = '<div class="stg-grid">' + leftTop + rightTop + leftBottom + rightBottom + "</div>";
  }
  window.DashStandingsDone = function (id, err, payload) {
    var cb = standingsPending[id];
    delete standingsPending[id];
    if (!cb) return;
    if (err) cb(err, null);
    else cb(null, payload);
  };
  function applyStandingsPayload(d) {
    standingsData = d || null;
    standingsLoadErr = "";
    if (isStandingsPage(pageKey)) renderStandings();
  }
  function applyStandingsFail(err) {
    standingsData = null;
    standingsLoadErr = String(err || "fail");
    if (isStandingsPage(pageKey)) renderStandings();
  }
  function loadStandings() {
    if (window.SonyBridge && typeof SonyBridge.fetchStandings === "function") {
      standingsCbSeq += 1;
      standingsPending[standingsCbSeq] = function (err, payload) {
        if (err) applyStandingsFail(err);
        else applyStandingsPayload(payload);
      };
      SonyBridge.fetchStandings(standingsCbSeq);
      return;
    }
    fetch("/api/standings", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("standings " + res.status);
      return res.json();
    }).then(applyStandingsPayload).catch(function (e) {
      applyStandingsFail(e && e.message);
    });
  }
  // 読み上げはREGALIAの順位のみ（他チームの成績は読まない、ユーザー確認済み）。
  // U15L/U13Lの「L」はリーグと読む（ユーザー確認済み）。残り試合数も読む。
  function standingsSpeakLabel(label) {
    return String(label || "").replace(/U(\d+)L/, "U$1リーグ");
  }
  function standingsSpeakOne(cat) {
    if (!cat || !cat.ok) return "";
    var t = standingsRegaliaTeam(cat);
    if (!t) return "";
    var bits = [standingsSpeakLabel(cat.label) + "、" + (cat.group_name || "") + "のREGALIAの順位は" + t.rank + "位、" +
      (cat.teams || []).length + "チーム中です。残り" + t.remaining + "試合です。"];
    var zone = (cat.zones || {})[String(t.rank)];
    if (zone) bits.push(zone.label + "です。");
    else if (cat.note) bits.push(cat.note + "。");
    return bits.join("");
  }
  function standingsSpeakText() {
    return STANDINGS_CODES.map(function (code) {
      return standingsSpeakOne(standingsCatByCode(code));
    }).filter(Boolean).join("");
  }
  function dayKey(v) { return String(v || "").slice(0, 10); }
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2500);
  }
  function parseLocalDate(iso) {
    var p = String(iso || "").split("-");
    if (p.length < 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function ymd(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function todayStr() { return ymd(new Date()); }
  function addDaysIso(iso, n) {
    var d = parseLocalDate(iso) || new Date();
    d.setDate(d.getDate() + n);
    return ymd(d);
  }
  function mondayIso(iso) {
    var d = parseLocalDate(iso);
    if (!d) return iso;
    var dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return ymd(d);
  }
  function headWeekMonday(parent) {
    var mon = mondayIso(todayStr());
    if (isNextWeekHead(parent)) return addDaysIso(mon, 7);
    return mon;
  }
  function headWeekDays(parent) {
    var mon = headWeekMonday(parent);
    var days = [];
    var i;
    for (i = 0; i < 7; i++) days.push(addDaysIso(mon, i));
    return days;
  }
  function headWeekSet(parent) {
    var s = {};
    headWeekDays(parent).forEach(function (iso) { s[iso] = 1; });
    return s;
  }
  function clipRowsToWeek(rows, parent) {
    var set = headWeekSet(parent);
    return (rows || []).filter(function (e) {
      var iso = eventIso(e);
      return iso && set[iso];
    });
  }
  function clipHeadlineToWeek(h, parent) {
    if (!h) return h;
    var out = {
      juku: clipRowsToWeek(h.juku, parent),
      u13Activity: clipRowsToWeek(h.u13Activity, parent),
      u13Match: clipRowsToWeek(h.u13Match, parent),
      misc: clipRowsToWeek(h.misc, parent),
      marinos: clipRowsToWeek(h.marinos, parent),
      weather: h.weather
    };
    return out;
  }
  function weekOffsetOf(iso) {
    var t0 = parseLocalDate(mondayIso(todayStr())).getTime();
    var t1 = parseLocalDate(mondayIso(iso)).getTime();
    return Math.round((t1 - t0) / (7 * 86400000));
  }
  function focusDays() {
    var t = todayStr();
    return [addDaysIso(t, focusDayOffset), addDaysIso(t, focusDayOffset + 1)];
  }
  function wxDays() {
    var t = todayStr();
    return [t, addDaysIso(t, 1), addDaysIso(t, 2)];
  }
  function uniqueIsos(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (iso) {
      if (!iso || seen[iso]) return;
      seen[iso] = 1;
      out.push(iso);
    });
    out.sort();
    return out;
  }
  function focusFetchDays() {
    return uniqueIsos(focusDays().concat(wxDays()));
  }
  function cacheHasDays(cache, wanted) {
    var days = (cache && cache.days) || [];
    return !!(wanted && wanted.length && wanted.every(function (iso) {
      return days.indexOf(iso) >= 0;
    }));
  }
  function fmtMd(iso) {
    var p = String(iso || "").split("-");
    if (p.length < 3) return iso || "";
    return Number(p[1]) + "/" + Number(p[2]);
  }
  function hm(min) {
    var h = Math.floor(min / 60);
    var m = min % 60;
    return pad(h) + ":" + pad(m);
  }

  function categoryFlags(code) {
    var t = String(code || "").trim();
    return {
      raw: t,
      hasU13: /U-?13/i.test(t),
      hasU14: /U-?14/i.test(t),
      hasU15: /U-?15/i.test(t),
      hasGk: /GK/i.test(t) || /ゴールキーパー|キーパー/.test(t),
      isAll: /^all$/i.test(t) || t === "全" || t === "すべて" || /^全.*(カテゴリ|カテゴリー)/.test(t)
    };
  }
  function categoryTier(code) {
    var f = categoryFlags(code);
    if (!f.raw) return "other";
    if (f.isAll || (f.hasU13 && f.hasU14 && f.hasU15)) return "all";
    if (f.hasU13) return "u13";
    if (f.hasU14) return "u14";
    if (f.hasU15) return "u15";
    if (f.hasGk) return "all";
    return "other";
  }
  function includesU13(code) {
    var f = categoryFlags(code);
    return !!(f.hasU13 || f.isAll || f.hasGk);
  }
  function isU14U15Only(ev) {
    var f = categoryFlags((ev && (ev.category || ev.category_code)) || "");
    if (f.hasU13 || f.isAll || f.hasGk) return false;
    return !!(f.hasU14 || f.hasU15);
  }

  function canonicalKind(kind) {
    var k = String(kind || "").trim();
    var low = k.toLowerCase();
    if (low === "tr" || k === "練習") return "TR";
    if (low === "match" || k === "試合") return "match";
    if (low === "adhoc" || k === "単発") return "adhoc";
    if (k === "塾" || k === "私用" || k === "合宿" || k === "マリノス戦") return k;
    return k || "match";
  }
  function kindClass(kind) {
    var k = canonicalKind(kind);
    if (k === "adhoc") return "tl-kind-adhoc";
    if (k === "TR") return "tl-kind-tr";
    if (k === "塾") return "tl-kind-juku";
    if (k === "私用") return "tl-kind-private";
    if (k === "合宿") return "tl-kind-gasshuku";
    if (k === "マリノス戦") return "tl-kind-marinos";
    return "tl-kind-match";
  }
  function mainSub(ev) {
    var league = String(ev.league_or_competition || "").trim();
    var title = String(ev.title || "").trim();
    if (!title && canonicalKind(ev.event_kind) === "TR") title = "練習";
    if (league) return league + " · " + title;
    return title;
  }
  function matchCardText(ev) {
    var card = String(ev.regalia_match_text || "").trim();
    if (card) return card;
    var opp = String(ev.opponent || "").trim();
    if (!opp) return "";
    return /^vs\s/i.test(opp) ? opp : ("vs " + opp);
  }
  function eventLeague(ev) {
    return String((ev && (ev.league_or_competition || ev.league)) || "").trim();
  }
  function leagueLabel(ev) {
    var lg = eventLeague(ev);
    if (!lg) return "";
    var title = String((ev && ev.title) || "").trim();
    var vs = matchOpponentName(ev);
    if (lg === title || lg === vs) return "";
    return lg;
  }
  function speakLeagueText(ev) {
    var lg = leagueLabel(ev);
    if (!lg) return "";
    return lg.replace(/U-(\d+)/gi, "U$1") + "です。";
  }
  function segClassForLabel(label, isPost) {
    var s = String(label || "");
    if (/出発/.test(s)) return "tl-block-seg--departure";
    if (/集合/.test(s)) return "tl-block-seg--assembly";
    if (isPost) return "tl-block-seg--postmark tl-block-seg--match-post1";
    return "tl-block-seg--match-pre1";
  }

  function stripNotes(s) {
    return String(s || "").replace(/（[^（）]*）/g, " ").replace(/\([^()]*\)/g, " ").replace(/\s+/g, " ").trim();
  }
  function parseCore(ev) {
    var s = String(ev.event_time || "").trim();
    s = s.replace(/(\d{1,2}\s*[:：]\s*[0-5]\d)\s*TR/gi, "$1");
    var ko = s.match(/([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)\s*k\s*[/／]\s*o/i);
    if (ko) {
      var ks = Number(ko[1]) * 60 + Number(ko[2]);
      return { start: ks, end: ks + 120 };
    }
    var stripped = stripNotes(s);
    var m = stripped.match(/([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)\s*[-–—〜~]\s*([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/)
      || s.match(/([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)\s*[-–—〜~]\s*([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/);
    if (m) {
      var st = Number(m[1]) * 60 + Number(m[2]);
      var en = Number(m[3]) * 60 + Number(m[4]);
      if (en <= st) en += 24 * 60;
      return { start: st, end: en };
    }
    var m2 = stripped.match(/([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/);
    if (!m2) return null;
    var st2 = Number(m2[1]) * 60 + Number(m2[2]);
    return { start: st2, end: st2 + 120 };
  }

  function trimFreeformAuxLabel(raw) {
    var s = String(raw || "");
    s = s.replace(/（[^（）]*）/g, " ").replace(/\([^()]*\)/g, " ");
    s = s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/^[\s·・、,，/／\-–—〜~:：]+/, "");
    s = s.replace(/[\s·・、,，/／]+$/, "");
    if (!s || /^[-–—〜~:：]+$/.test(s) || /^(k\s*[/／]?\s*o|ko)$/i.test(s) || /^まで[）)]?$/.test(s)) return "";
    if (/^([01]?\d|2[0-3])[:：][0-5]\d$/.test(s)) return "";
    return s;
  }
  function labeledTimes(src) {
    var s = String(src || "");
    var out = [];
    var re = /([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/g;
    var hits = [];
    var m;
    while ((m = re.exec(s))) {
      hits.push({ start: m.index, end: re.lastIndex, m: Number(m[1]) * 60 + Number(m[2]) });
    }
    var i;
    for (i = 0; i < hits.length; i++) {
      var cur = hits[i];
      var prevEnd = i > 0 ? hits[i - 1].end : 0;
      var nextStart = i + 1 < hits.length ? hits[i + 1].start : s.length;
      var after = trimFreeformAuxLabel(s.slice(cur.end, nextStart));
      var before = trimFreeformAuxLabel(s.slice(prevEnd, cur.start));
      if (before && before.indexOf(" ") >= 0) before = before.split(/\s+/).pop() || "";
      var label = after || before;
      if (label) out.push({ m: cur.m, label: label });
    }
    return out;
  }
  function allMins(src) {
    var s = String(src || "");
    var out = [];
    var re = /([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/g;
    var m;
    while ((m = re.exec(s))) out.push(Number(m[1]) * 60 + Number(m[2]));
    return out;
  }
  function preSrc(ev) {
    return [ev.pre_event_coach, ev.pre_event_user].filter(Boolean).join(" · ") || String(ev.event_time || "");
  }
  function postSrc(ev) {
    return [ev.post_event_coach, ev.post_event_user].filter(Boolean).join(" · ");
  }
  function displayRange(ev) {
    var core = parseCore(ev);
    if (!core) return null;
    var start = core.start;
    var end = core.end;
    var pre = preSrc(ev);
    var post = postSrc(ev);
    labeledTimes(pre).forEach(function (x) { if (x.m < start) start = x.m; });
    allMins(pre).forEach(function (t) { if (t < start) start = t; });
    labeledTimes(post).forEach(function (x) { if (x.m > end) end = x.m; });
    allMins(post).forEach(function (t) { if (t > end) end = t; });
    return { start: start, end: end, core: core };
  }

  function isDisplayHidden(ev) {
    var ds = String((ev && ev.display_status) || "").toLowerCase();
    return ds === "removed" || ds === "off";
  }
  function activeEvents(events) {
    return (events || []).filter(function (ev) { return !isDisplayHidden(ev); });
  }
  function pageShowAll() {
    return viewMode === "week" ? showAllWeek : showAllFocus;
  }
  function visibleEvents(events) {
    return activeEvents(events).filter(function (ev) {
      if (pageShowAll()) return true;
      return includesU13(ev.category_code);
    });
  }

  function packLanes(list) {
    var placed = [];
    list.sort(function (a, b) { return a._ds - b._ds || a._de - b._de; });
    list.forEach(function (ev) {
      var lane = 0;
      while (true) {
        var hit = placed.some(function (p) {
          return p._lane === lane && p._ds < ev._de && ev._ds < p._de;
        });
        if (!hit) break;
        lane += 1;
      }
      ev._lane = lane;
      placed.push(ev);
    });
    var n = 1;
    placed.forEach(function (ev) { if (ev._lane + 1 > n) n = ev._lane + 1; });
    placed.forEach(function (ev) { ev._lanes = n; });
    return placed;
  }

  function hourTop(minFromMidnight, canvasH) {
    var m0 = tlHour0 * 60;
    var span = Math.max(60, (tlHour1 - tlHour0) * 60);
    var padTop = 4;
    var padBot = Math.max(24, Math.round(canvasH * 0.08));
    var usable = Math.max(1, canvasH - padTop - padBot);
    return padTop + ((minFromMidnight - m0) / span) * usable;
  }
  function setHourWindow(events, days, today) {
    var minM = 24 * 60;
    var maxM = 0;
    var daySet = {};
    (days || []).forEach(function (d) { daySet[dayKey(d)] = 1; });
    (events || []).forEach(function (ev) {
      if (days && days.length && !daySet[dayKey(ev.event_date)]) return;
      var rng = displayRange(ev);
      if (!rng) return;
      minM = Math.min(minM, rng.start);
      maxM = Math.max(maxM, rng.end);
    });
    if (today && daySet[dayKey(today)]) {
      var n = new Date();
      var nowM = n.getHours() * 60 + n.getMinutes();
      minM = Math.min(minM, nowM);
      maxM = Math.max(maxM, nowM + 20);
    }
    if (maxM <= minM) {
      tlHour0 = HOUR0;
      tlHour1 = 22;
      return;
    }
    tlHour0 = Math.max(HOUR0, Math.floor(minM / 60));
    tlHour1 = Math.min(HOUR1, Math.max(tlHour0 + 3, Math.ceil((maxM + 50) / 60)));
  }
  function wxIcoHtml(name, size) {
    var n = name || "cloud";
    var sun = '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="6.5" fill="#fbbf24"/><g stroke="#f59e0b" stroke-width="2" stroke-linecap="round" fill="none"><path d="M16 3.5v3.5M16 25v3.5M3.5 16h3.5M25 16h3.5M7 7l2.4 2.4M22.6 22.6L25 25M7 25l2.4-2.4M22.6 9.4L25 7"/></g></svg>';
    var cloud = '<svg viewBox="0 0 32 32"><path fill="#cbd5e1" d="M9.5 22.5h14.2a4.8 4.8 0 0 0 .2-9.6 6.6 6.6 0 0 0-12.7-1.8A4.7 4.7 0 0 0 9.5 22.5z"/></svg>';
    var rain = '<svg viewBox="0 0 32 32"><path fill="#94a3b8" d="M9.2 18.2h14a4.6 4.6 0 0 0 .2-9.2 6.3 6.3 0 0 0-12.2-1.7A4.5 4.5 0 0 0 9.2 18.2z"/><g stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round"><path d="M12 21.2v3.2M16.2 21.6v3.6M20.4 21.2v3.2"/></g></svg>';
    var mid = '<svg viewBox="0 0 32 32"><path fill="#64748b" d="M9.2 17.4h14a4.6 4.6 0 0 0 .2-9.2 6.3 6.3 0 0 0-12.2-1.7A4.5 4.5 0 0 0 9.2 17.4z"/><g stroke="#60a5fa" stroke-width="2" stroke-linecap="round"><path d="M11.6 21v4M16 21.4v4.4M20.4 21v4"/></g></svg>';
    var heavy = '<svg viewBox="0 0 32 32"><path fill="#475569" d="M8.8 16.8h15a5 5 0 0 0 .2-9.8 6.6 6.6 0 0 0-13-1.8A4.8 4.8 0 0 0 8.8 16.8z"/><g stroke="#f87171" stroke-width="2" stroke-linecap="round"><path d="M11 20.6v5M15.2 21v5.4M19.4 20.6v5M23 21.2v4.6"/></g></svg>';
    var svg = n === "sun" ? sun : (n === "light" ? rain : (n === "mid" ? mid : (n === "heavy" ? heavy : cloud)));
    var wh = size ? ' style="width:' + size + 'px;height:' + size + 'px"' : "";
    return '<span class="wx-ico wx-ico-' + n + '"' + wh + '>' + svg + "</span>";
  }

  function stackedInner(ev, clip, badgeHtml) {
    var core = ev._range.core;
    var preMarks = labeledTimes(preSrc(ev)).filter(function (x) { return x.m < core.start; })
      .sort(function (a, b) { return a.m - b.m; });
    if (!preMarks.length && ev._range.start < core.start) {
      preMarks = [{ m: ev._range.start, label: "集合" }];
    }
    var postMarks = labeledTimes(postSrc(ev)).filter(function (x) { return x.m > core.end; })
      .sort(function (a, b) { return a.m - b.m; });
    if (!postMarks.length && ev._range.end > core.end) {
      postMarks = [{ m: ev._range.end, label: "解散" }];
    }
    var h = '<div class="tl-block-inner tl-block-inner--stack">';
    var cursor = clip.ds;
    var i;
    for (i = 0; i < preMarks.length; i++) {
      var next = i + 1 < preMarks.length ? preMarks[i + 1].m : core.start;
      var a = Math.max(cursor, clip.ds);
      var b = Math.min(next, clip.de, core.start);
      if (b > a) {
        h += '<div class="tl-block-seg ' + segClassForLabel(preMarks[i].label, false) +
          '" style="flex:' + Math.max(1, b - a) + ' 1 0">' +
          esc(hm(preMarks[i].m) + preMarks[i].label) + "</div>";
      }
      cursor = Math.max(cursor, next);
    }
    var mainS = Math.max(clip.ds, core.start);
    var mainE = Math.min(clip.de, core.end);
    if (mainE > mainS) {
      h += '<div class="tl-block-seg tl-block-seg--main' + (badgeHtml ? " tl-block-seg--wx" : "") +
        '" style="flex:' + Math.max(1, mainE - mainS) + ' 1 0">' +
        (badgeHtml || "") +
        '<span class="tl-block-seg-time">' + esc(hm(core.start) + (core.end > core.start ? "-" + hm(core.end) : "")) + "</span>" +
        '<span class="tl-block-seg-sub">' + esc(mainSub(ev)) + "</span>" +
        (ev.venue ? '<span class="tl-block-seg-venue">' + esc(ev.venue) + "</span>" : "") +
        (matchCardText(ev) ? '<span class="tl-block-seg-regalia">' + esc(matchCardText(ev)) + "</span>" : "") +
        "</div>";
    }
    for (i = 0; i < postMarks.length; i++) {
      var pa = i === 0 ? core.end : postMarks[i - 1].m;
      var pb = postMarks[i].m;
      var qa = Math.max(pa, clip.ds);
      var qb = Math.min(pb, clip.de);
      if (qb > qa) {
        h += '<div class="tl-block-seg ' + segClassForLabel(postMarks[i].label, true) +
          '" style="flex:' + Math.max(1, qb - qa) + ' 1 0">' +
          esc(hm(postMarks[i].m) + postMarks[i].label) + "</div>";
      }
    }
    h += "</div>";
    return h;
  }

  function renderTimeline(data) {
    var days = data.days || [];
    var today = data.today || todayStr();
    var events = visibleEvents(data.events);
    setHourWindow(events, days, today);
    var root = $("tl");
    var html = '<div class="hours" id="hours"><div class="hours-head"></div><div class="hours-plot" id="hours-plot"></div>' +
      '<div class="wx-lab" data-wx-lab="0"></div><div class="wx-lab" data-wx-lab="1"></div></div><div class="days">';
    var hol = {};
    (data.holiday_isos || []).forEach(function (x) { hol[x] = 1; });
    var i;
    for (i = 0; i < days.length; i++) {
      var d = parseLocalDate(days[i]);
      var cls = "day";
      if (days[i] === today) cls += " is-today";
      else if (days[i] < today) cls += " is-past";
      if (hol[days[i]]) cls += " is-hol";
      else if (d && d.getDay() === 6) cls += " is-sat";
      else if (d && d.getDay() === 0) cls += " is-sun";
      html += '<div class="' + cls + '" data-day="' + days[i] + '" data-col="' + i + '">';
      html += '<div class="day-head"><div class="dow">' + (d ? WD[d.getDay()] : "") + "</div>";
      html += '<div class="dom">' + (d ? d.getDate() + "日" : "") + "</div></div>";
      html += '<div class="day-body"><div class="wx-rails">' +
        '<div class="wx-rail" data-wx-row="0" data-col="' + i + '" data-day="' + days[i] + '"></div>' +
        '<div class="wx-rail" data-wx-row="1" data-col="' + i + '" data-day="' + days[i] + '"></div></div>';
      html += '<div class="canvas"></div></div>';
      html += "</div>";
    }
    html += "</div>";
    root.innerHTML = html;
    var daysEl = root.querySelector(".days");
    if (daysEl) {
      daysEl.style.gridTemplateColumns = "repeat(" + Math.max(1, days.length) + ", minmax(0, 1fr))";
    }

    var canvas0 = root.querySelector(".canvas");
    var canvasH = canvas0 ? canvas0.clientHeight : 500;
    var plot = $("hours-plot");
    var h;
    var labStep = (tlHour1 - tlHour0) > 10 ? 2 : 1;
    for (h = tlHour0; h <= tlHour1; h += labStep) {
      plot.innerHTML += '<div class="hour-lab" style="top:' + hourTop(h * 60, canvasH) + 'px">' + h + "</div>";
    }

    var canvases = root.querySelectorAll(".canvas");
    eventsByCol = [];
    for (i = 0; i < canvases.length; i++) {
      var cnv = canvases[i];
      var ch = cnv.clientHeight;
      var dayEl = cnv.closest ? cnv.closest(".day") : cnv.parentNode.parentNode;
      var dayIso = dayEl.getAttribute("data-day");
      var grids = "";
      var hh;
      var slotH = Math.max(10, hourTop((tlHour0 + 1) * 60, ch) - hourTop(tlHour0 * 60, ch));
      var weekMark = "";
      if (viewMode === "week" && document.documentElement.classList.contains("pc")) {
        weekMark = "font-size:" + Math.round(slotH * 0.92) + "px;";
      }
      for (hh = tlHour0; hh <= tlHour1; hh++) {
        grids += '<div class="hgrid" style="top:' + hourTop(hh * 60, ch) + 'px"></div>';
        grids += '<div class="tl-hour-mark" style="top:' + hourTop(hh * 60, ch) + "px;" + weekMark + '">' + hh + "</div>";
      }
      if (dayIso === today) {
        var now = new Date();
        var mins = now.getHours() * 60 + now.getMinutes();
        if (mins >= tlHour0 * 60 && mins <= tlHour1 * 60) {
          grids += '<div class="now" style="top:' + hourTop(mins, ch) + 'px"></div>';
        }
      }
      var dayEvents = events.filter(function (ev) { return dayKey(ev.event_date) === dayIso; }).map(function (ev) {
        var rng = displayRange(ev);
        if (!rng) return null;
        var ds = Math.max(tlHour0 * 60, rng.start);
        var de = Math.min(tlHour1 * 60, rng.end);
        if (de <= ds) return null;
        ev._range = rng;
        ev._ds = ds;
        ev._de = de;
        return ev;
      }).filter(Boolean);
      packLanes(dayEvents);
      dayEvents.sort(function (a, b) {
        if (a._ds !== b._ds) return a._ds - b._ds;
        return (a._lane || 0) - (b._lane || 0);
      });
      eventsByCol[i] = dayEvents;
      var blocks = "";
      dayEvents.forEach(function (ev, ei) {
        var top = hourTop(ev._ds, ch);
        var rawH = hourTop(ev._de, ch) - top;
        var ht = Math.max(viewMode === "focus" ? 44 : 28, rawH);
        ht = Math.min(ht, Math.max(12, ch - top - 8));
        var w = 100 / ev._lanes;
        var left = ev._lane * w;
        var cls = "tl-block tl-block--stacked " + kindClass(ev.event_kind) + " tl-cat-" + categoryTier(ev.category_code);
        if (String(ev.display_status).toLowerCase() === "off") cls += " off";
        if (ev._lanes > 1) cls += " tl-block--narrow";
        if (ht < 48) cls += " tl-block--short";
        blocks += '<div class="' + cls + '" data-col="' + i + '" data-idx="' + ei + '" data-eid="' + esc(ev.id || "") +
          '" style="top:' + top + "px;height:" + ht +
          "px;left:calc(" + left + "% + 2px);width:calc(" + w + "% - 4px)\">" +
          stackedInner(ev, { ds: ev._ds, de: ev._de }, rainBadgeHtml(ev)) + "</div>";
      });
      cnv.innerHTML = grids + blocks;
    }
    bindTlBlocks();
    clampTlFocus();
  }

  function locShort(name) {
    var s = String(name || "");
    if (/新磯/.test(s)) return "新磯野";
    if (/藤が丘/.test(s) || /青葉/.test(s)) return "藤が丘";
    if (/麻溝/.test(s) || /相模/.test(s)) return "麻溝台";
    return s;
  }
  function locByRe(locs, re) {
    var i;
    for (i = 0; i < (locs || []).length; i++) {
      if (re.test((locs[i] && locs[i].name) || "")) return locs[i];
    }
    return null;
  }
  function locForWxRow(locs, row) {
    var re = row === 0 ? /藤が丘|青葉/ : /麻溝/;
    return locByRe(locs, re) || (locs && locs[row]) || {};
  }
  function kindLabel(kind) {
    var k = canonicalKind(kind);
    if (k === "TR") return "練習";
    if (k === "match") return "試合";
    if (k === "adhoc") return "単発";
    return k || "予定";
  }
  function dayHourSlots(slots) {
    return (slots || []).filter(function (s) {
      var h = Number(s.h);
      return h >= WX_H0 && h <= WX_H1;
    });
  }
  function daytimeRainSum(slots) {
    var t = 0;
    dayHourSlots(slots).forEach(function (s) { t += Number(s.rainMm) || 0; });
    return parseFloat(t.toFixed(1));
  }
  function peakHourlyMm(slots) {
    var peak = 0;
    dayHourSlots(slots).forEach(function (s) {
      var n = Number(s.rainMm) || 0;
      if (n > peak) peak = n;
    });
    return peak;
  }
  function daytimeSkyCode(w, hourly) {
    var max = 0;
    var n = 0;
    dayHourSlots(hourly).forEach(function (s) {
      var c = Number(s.code) || 0;
      if (c > max) max = c;
      n += 1;
    });
    if (n) return max;
    return Number(w && w.code) || 0;
  }
  var RAIN_MIN_MM = 0.5;
  var RAIN_TRACE_POP = 51;
  function rainKind(mm, prob) {
    var n = Number(mm) || 0;
    if (n >= 3) return "heavy";
    if (n >= 1) return "mid";
    if (n >= RAIN_MIN_MM) return "light";
    if (n > 0 && (Number(prob) || 0) >= RAIN_TRACE_POP) return "light";
    return "none";
  }
  function rainIsTrace(mm, prob) {
    var n = Number(mm) || 0;
    return n > 0 && n < RAIN_MIN_MM && rainKind(n, prob) === "none";
  }
  function worseRainKind(a, b) {
    var o = { none: 0, light: 1, mid: 2, heavy: 3 };
    return (o[a] || 0) >= (o[b] || 0) ? (a || "none") : b;
  }
  function rainKindForDay(w, hourly) {
    var day = dayHourSlots(hourly);
    if (day.length >= 8) {
      var kind = "none";
      day.forEach(function (s) {
        kind = worseRainKind(kind, rainKind(s.rainMm, s.rainProb));
      });
      return kind;
    }
    return rainKind(Number(w && w.rainMm) || 0, w && w.rainProb);
  }
  function rainVisual(w, hourly) {
    var useH = dayHourSlots(hourly).length >= 8;
    var kind = useH ? rainKindForDay(w, hourly) : rainKind(Number(w && w.rainMm) || 0, w && w.rainProb);
    var shown = useH ? daytimeRainSum(hourly) : (Number(w && w.rainMm) || 0);
    var code = useH ? daytimeSkyCode(w, hourly) : Number(w && w.code);
    var rawPeak = useH ? peakHourlyMm(hourly) : (Number(w && w.rainMm) || 0);
    var sky = (code >= 3 || rainIsTrace(rawPeak)) ? "cloud" : "sun";
    if (kind === "heavy") {
      return { kind: kind, ico: "heavy", tag: "大雨", mm: shown };
    }
    if (kind === "mid") {
      return { kind: kind, ico: "mid", tag: "雨", mm: shown };
    }
    if (kind === "light") {
      return { kind: kind, ico: "light", tag: "弱雨", mm: shown };
    }
    return { kind: kind, ico: sky, tag: "", mm: 0 };
  }

  function wxCellInner(w, hourly) {
    if (!w) return wxIcoHtml("cloud");
    var rv = rainVisual(w, hourly);
    return wxIcoHtml(rv.ico) +
      '<div class="wx-temp">' + w.tmax + '° <span>/ ' + w.tmin + "°</span></div>" +
      '<div class="wx-tag">' + (rv.tag ? esc(rv.tag) : "") + "</div>" +
      '<div class="wx-mm">' + (rv.kind !== "none" ? rv.mm + "mm" : "") + "</div>";
  }
  function wxCellClass(w, iso, today, hourly) {
    var cls = "wx-cell";
    if (iso === today) cls += " is-today";
    if (!w) return cls;
    var k = rainKindForDay(w, hourly);
    if (k === "light") cls += " rain-light";
    if (k === "mid") cls += " rain-mid";
    if (k === "heavy") cls += " rain-heavy";
    return cls;
  }
  function locHourly(loc, iso) {
    var key = dayKey(iso);
    var hourly = (loc && loc.hourly) || {};
    if (hourly[key] && hourly[key].length) return hourly[key];
    var k;
    for (k in hourly) {
      if (dayKey(k) === key && hourly[k] && hourly[k].length) return hourly[k];
    }
    return hourly[key] || [];
  }
  function slotHour(s) {
    var v = s && (s.h != null ? s.h : s.hour);
    return parseInt(v, 10);
  }
  function binHourly(slots, step) {
    var byH = {};
    (slots || []).forEach(function (s) { byH[slotHour(s)] = s; });
    var out = [];
    var h;
    for (h = WX_H0; h <= WX_H1; h += step) {
      var rain = 0, prob = 0, tempSum = 0, n = 0, code = 0;
      var i;
      for (i = 0; i < step; i++) {
        var s = byH[h + i];
        if (!s) continue;
        n += 1;
        rain += Number(s.rainMm) || 0;
        if ((s.rainProb || 0) > prob) prob = s.rainProb;
        tempSum += Number(s.temp) || 0;
        if ((s.rainMm || 0) > 0 || code === 0) code = s.code;
      }
      if (!n) continue;
      out.push({
        h: h,
        temp: Math.round(tempSum / n),
        code: code,
        rainMm: parseFloat(rain.toFixed(1)),
        rainProb: prob
      });
    }
    return out;
  }
  function pickHourly(slots) {
    var one = binHourly(slots, 1);
    if (one.length >= 12) return { step: 1, label: "1時間", items: one };
    var three = binHourly(slots, 3);
    if (three.length >= 4) return { step: 3, label: "3時間", items: three };
    return { step: 6, label: "6時間", items: binHourly(slots, 6) };
  }
  function slotHtml(s) {
    var rv = rainVisual({ rainMm: s.rainMm, code: s.code, rainProb: s.rainProb });
    var cls = "wx-slot";
    if (rv.kind === "light") cls += " rain-light";
    if (rv.kind === "mid") cls += " rain-mid";
    if (rv.kind === "heavy") cls += " rain-heavy";
    var mm = (Number(s.rainMm) || 0).toFixed(1);
    return '<div class="' + cls + '"><div class="hh">' + s.h + "時</div>" +
      wxIcoHtml(rv.ico, 24) +
      '<div class="tt">' + s.temp + "°</div>" +
      '<div class="mm">' + (rv.kind !== "none" ? mm + "mm" : "") + "</div>" +
      (rv.tag ? '<div class="tg">' + esc(rv.tag) + "</div>" : "") +
      "</div>";
  }

  function renderWeather(data) {
    var days = data.days || [];
    var today = data.today || todayStr();
    var locs = (data.weather && data.weather.locations) || [];
    var r;
    for (r = 0; r < 2; r++) {
      var lab = document.querySelector('.wx-lab[data-wx-lab="' + r + '"]');
      var named = locForWxRow(locs, r);
      if (lab) lab.textContent = named && named.name ? locShort(named.name) : "";
    }
    days.forEach(function (iso, col) {
      var r;
      for (r = 0; r < 2; r++) {
        var cell = document.querySelector('.wx-cell[data-col="' + col + '"][data-wx-row="' + r + '"]');
        if (!cell) continue;
        var loc = locForWxRow(locs, r);
        var byDate = {};
        (loc.days || []).forEach(function (d) { byDate[d.date] = d; });
        var hourly = locHourly(loc, iso);
        var w = byDate[iso];
        cell.className = wxCellClass(w, iso, today, hourly);
        cell.innerHTML = wxCellInner(w, hourly);
        cell.setAttribute("data-day", iso);
      }
    });
    bindWxCells();
    syncWxFocus();
    fillWxRails(data);
    if (wxDetailDate) openWxDetail(wxDetailDate);
  }

  function fillWxRails(data) {
    if (viewMode !== "focus" && viewMode !== "week") return;
    var locs = (data.weather && data.weather.locations) || [];
    var today = data.today || todayStr();
    var nowH = new Date().getHours();
    var rails = document.querySelectorAll(".wx-rail");
    var i;
    for (i = 0; i < rails.length; i++) {
      (function (rail) {
        var row = parseInt(rail.getAttribute("data-wx-row"), 10) || 0;
        var iso = rail.getAttribute("data-day");
        var loc = locForWxRow(locs, row);
        var byH = {};
        locHourly(loc, iso).forEach(function (s) { byH[slotHour(s)] = s; });
        var hgt = rail.clientHeight;
        var tag = locShort(loc && loc.name) || (row === 0 ? "藤が丘" : "麻溝台");
        var html = '<div class="wx-rail-tag">' + esc(tag) + "</div>";
        var h;
        var hEnd = Math.min(WX_H1, tlHour1 - 1);
        var hStart = Math.max(WX_H0, tlHour0);
        for (h = hStart; h <= hEnd; h++) {
          var s = byH[h];
          var top = hourTop(h * 60, hgt);
          var ht = Math.max(8, hourTop((h + 1) * 60, hgt) - top);
          var cls = "wx-hour";
          if (iso === today && h === nowH) cls += " is-now";
          var inner = "";
          if (s) {
            var rv = rainVisual({ rainMm: s.rainMm, code: s.code, rainProb: s.rainProb });
            if (rv.kind === "light") cls += " rain-light";
            if (rv.kind === "mid") cls += " rain-mid";
            if (rv.kind === "heavy") cls += " rain-heavy";
            inner = wxIcoHtml(rv.ico, 20) +
              '<div class="wx-ht">' + s.temp + "°</div>" +
              (rv.kind !== "none" ? '<div class="wx-hmm">' + (Number(s.rainMm) || 0).toFixed(1) + "</div>" : "");
          }
          html += '<div class="' + cls + '" style="top:' + top + "px;height:" + ht + 'px">' + inner + "</div>";
        }
        rail.innerHTML = html;
        rail.onclick = function () {
          noteInput(true);
          wxCol = parseInt(this.getAttribute("data-col"), 10) || 0;
          wxRow = parseInt(this.getAttribute("data-wx-row"), 10) || 0;
          uiMode = "wx";
          closeEvDetail();
          syncFilterUi();
          syncWxFocus();
          openWxDetail(this.getAttribute("data-day"));
        };
      })(rails[i]);
    }
  }

  function renderWxBoard(data) {
    var el = $("wx-board");
    if (!el || !data) return;
    var today = data.today || todayStr();
    if (isPhone() && pageKey === "wx") {
      var iso = today;
      if (phoneSlice === "tomo") iso = addDaysIso(today, 1);
      else if (phoneSlice === "asatte") iso = addDaysIso(today, 2);
      el.classList.add("phone-wx-pair");
      el.innerHTML = briefWxPanelHtml(iso);
      return;
    }
    el.classList.remove("phone-wx-pair");
    var allLocs = (data.weather && data.weather.locations) || [];
    var locs = [locForWxRow(allLocs, 0), locForWxRow(allLocs, 1)];
    var nowH = new Date().getHours();
    var daysWanted = wxDays();
    var cols = daysWanted.map(function (iso) {
      var d = parseLocalDate(iso);
      var dayWord = iso === today ? "今日 " : iso === addDaysIso(today, 1) ? "明日 " : iso === addDaysIso(today, 2) ? "明後日 " : "";
      var title = d
        ? (dayWord + (d.getMonth() + 1) + "/" + d.getDate() + "（" + WD[d.getDay()] + "）")
        : iso;
      var locRows = locs.map(function (loc) {
        var byH = {};
        binHourly(locHourly(loc, iso), 1).forEach(function (s) { byH[s.h] = s; });
        var hours = "";
        var h;
        for (h = WX_H0; h <= WX_H1; h++) {
          var s = byH[h];
          var cls = "wxg-h";
          if (iso === today && h === nowH) cls += " is-now";
          if (!s) {
            hours += '<div class="' + cls + '"><div class="wxg-hh">' + h + "</div></div>";
            continue;
          }
          var rv = rainVisual({ rainMm: s.rainMm, code: s.code, rainProb: s.rainProb });
          if (rv.kind === "light") cls += " rain-light";
          if (rv.kind === "mid") cls += " rain-mid";
          if (rv.kind === "heavy") cls += " rain-heavy";
          var mm = Number(s.rainMm) || 0;
          var showRain = rv.kind !== "none";
          var pct = !showRain ? 0 : Math.max(5, Math.min(100, mm / BAR_SCALE_MM * 100));
          hours += '<div class="' + cls + '"><div class="wxg-hh">' + h + "</div>" +
            wxIcoHtml(rv.ico, 28) +
            '<div class="wxg-tt">' + s.temp + "°</div>" +
            '<div class="wxg-bar-wrap"><div class="wxg-bar" style="height:' + pct + '%"></div></div>' +
            '<div class="wxg-mm">' + (showRain ? mm.toFixed(1) : "") + "</div></div>";
        }
        return '<div class="wxg-loc"><div class="wxg-loc-name">' + esc(locShort(loc.name)) +
          '</div><div class="wxg-hours">' + hours + "</div></div>";
      }).join("");
      return '<div class="wxg-day' + (iso === today ? " is-today" : "") + '"><div class="wxg-day-head">' +
        esc(title) + "</div>" + locRows + "</div>";
    }).join("");
    el.innerHTML = '<div class="wxg-head"><div>' + esc(phoneRangeTitle() || "天気(3日)　1時間ごと") + "</div>" +
      '<div class="wxg-legend"><span class="rain-light">弱雨</span><span class="rain-mid">雨</span><span class="rain-heavy">大雨</span></div></div>' +
      '<div class="wxg-cols">' + cols + "</div>";
  }

  function bindWxCells() {
    var cells = document.querySelectorAll(".wx-cell");
    var i;
    for (i = 0; i < cells.length; i++) {
      cells[i].onclick = function () {
        wxCol = parseInt(this.getAttribute("data-col"), 10) || 0;
        wxRow = parseInt(this.getAttribute("data-wx-row"), 10) || 0;
        uiMode = "wx";
        noteInput(true);
        closeEvDetail();
        syncFilterUi();
        syncWxFocus();
        openWxDetail(this.getAttribute("data-day"));
      };
    }
  }

  function syncWxFocus() {
    var cells = document.querySelectorAll(".wx-cell, .wx-rail");
    var i;
    for (i = 0; i < cells.length; i++) {
      var col = parseInt(cells[i].getAttribute("data-col"), 10);
      var row = parseInt(cells[i].getAttribute("data-wx-row"), 10);
      if (!kioskOn && uiMode === "wx" && !wxDetailDate && !evDetailOpen && col === wxCol && row === wxRow) {
        cells[i].classList.add("nav");
      } else {
        cells[i].classList.remove("nav");
      }
    }
  }
  function syncWeekKeys() {
    var keys = document.querySelector(".week-keys");
    if (keys) {
      if (fetchLock) keys.classList.add("busy");
      else keys.classList.remove("busy");
    }
    var focus = viewMode === "focus";
    var todayOn = focus ? (focusDayOffset === 0) : (weekOffset === 0);
    if ($("wk-today")) {
      $("wk-today").textContent = focus ? "青 今日" : "青 今週";
      $("wk-today").className = "wk wk-b" + (todayOn ? " on" : "") + (weekBusyWhich === "today" ? " wait" : "");
    }
    if ($("wk-prev")) {
      $("wk-prev").textContent = focus ? "緑 −2日" : "緑 前週";
      $("wk-prev").className = "wk wk-g" + (weekBusyWhich === "prev" ? " wait" : "");
    }
    if ($("wk-next")) {
      $("wk-next").textContent = focus ? "黄 ＋2日" : "黄 翌週";
      $("wk-next").className = "wk wk-y" + (weekBusyWhich === "next" ? " wait" : "");
    }
  }
  function weekLabel(off) {
    return off === 0 ? "今週" : ((off > 0 ? "+" : "") + off + "週");
  }
  function setWeekBusy(on, which) {
    weekBusyWhich = on ? (which || "") : "";
    var tl = $("tl");
    if (tl) {
      if (on) tl.classList.add("busy");
      else tl.classList.remove("busy");
    }
    syncWeekKeys();
  }
  function syncCursor() {
    syncWxFocus();
    syncWeekKeys();
    var blocks = document.querySelectorAll(".tl-block[data-col]");
    var i;
    for (i = 0; i < blocks.length; i++) {
      var col = parseInt(blocks[i].getAttribute("data-col"), 10);
      var idx = parseInt(blocks[i].getAttribute("data-idx"), 10);
      if (!kioskOn && uiMode === "event" && !evDetailOpen && col === tlCol && idx === tlIdx) {
        blocks[i].classList.add("nav");
      } else {
        blocks[i].classList.remove("nav");
      }
    }
  }
  function colCount() {
    return ((lastData && lastData.days) || []).length;
  }
  function colEvents(col) {
    return eventsByCol[col] || [];
  }
  function clampTlFocus() {
    var n = colCount();
    if (n <= 0) return;
    tlCol = Math.max(0, Math.min(n - 1, tlCol));
    var list = colEvents(tlCol);
    if (!list.length) {
      var c;
      for (c = 0; c < n; c++) {
        if (colEvents(c).length) { tlCol = c; list = colEvents(c); break; }
      }
    }
    if (!list.length) tlIdx = 0;
    else tlIdx = Math.max(0, Math.min(list.length - 1, tlIdx));
  }
  function currentEvent() {
    return colEvents(tlCol)[tlIdx] || null;
  }
  function bindTlBlocks() {
    var blocks = document.querySelectorAll(".tl-block[data-col]");
    var i;
    for (i = 0; i < blocks.length; i++) {
      blocks[i].onclick = function () {
        noteInput(true);
        closeWxDetail();
        tlCol = parseInt(this.getAttribute("data-col"), 10) || 0;
        tlIdx = parseInt(this.getAttribute("data-idx"), 10) || 0;
        uiMode = "event";
        syncFilterUi();
        openEvDetail();
      };
    }
  }
  function evRow(k, v) {
    if (!String(v || "").trim()) return "";
    return '<div class="ev-row"><div class="ev-k">' + esc(k) + '</div><div class="ev-v">' + esc(v) + "</div></div>";
  }
  function openEvDetail() {
    var ev = currentEvent();
    var el = $("ev-detail");
    if (!ev || !el) return;
    evDetailOpen = true;
    var d = parseLocalDate(ev.event_date);
    var dateStr = d ? (d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + "（" + WD[d.getDay()] + "）") : ev.event_date;
    var rng = ev._range || displayRange(ev);
    var timeStr = ev.event_time || (rng && rng.core ? hm(rng.core.start) + (rng.core.end > rng.core.start ? "-" + hm(rng.core.end) : "") : "");
    el.hidden = false;
    el.innerHTML = '<div class="ev-sheet"><h2>' + esc(mainSub(ev) || kindLabel(ev.event_kind)) + "</h2>" +
      '<div class="hint">戻るで閉じる</div>' +
      evRow("日付", dateStr) +
      evRow("種別", kindLabel(ev.event_kind)) +
      evRow("カテゴリ", ev.category_code) +
      evRow("時間", timeStr) +
      evRow("会場", ev.venue) +
      evRow("対戦", matchCardText(ev) || ev.opponent) +
      evRow("大会", ev.league_or_competition) +
      evRow("集合・出発", [ev.pre_event_coach, ev.pre_event_user].filter(Boolean).join(" · ")) +
      evRow("解散", [ev.post_event_coach, ev.post_event_user].filter(Boolean).join(" · ")) +
      evRow("メモ", ev.notes) +
      "</div>";
    syncCursor();
  }
  function closeEvDetail() {
    evDetailOpen = false;
    var el = $("ev-detail");
    if (el) { el.hidden = true; el.innerHTML = ""; }
    syncCursor();
  }
  function moveToCol(col, preferStart) {
    var n = colCount();
    if (n <= 0) return;
    tlCol = Math.max(0, Math.min(n - 1, col));
    wxCol = tlCol;
    var list = colEvents(tlCol);
    if (!list.length) {
      uiMode = "wx";
      wxRow = 0;
      return;
    }
    uiMode = "event";
    var best = 0;
    var i;
    var diff = 1e9;
    for (i = 0; i < list.length; i++) {
      var d = Math.abs((list[i]._ds || 0) - (preferStart || 0));
      if (d < diff) { diff = d; best = i; }
    }
    tlIdx = best;
  }

  function openWxDetail(iso) {
    if (!lastData || !iso) return;
    wxDetailDate = iso;
    var d = parseLocalDate(iso);
    var locs = (lastData.weather && lastData.weather.locations) || [];
    var packs = locs.map(function (loc) { return pickHourly(locHourly(loc, iso)); });
    var step = 6;
    var label = "6時間";
    if (packs[0] && packs[0].step === 1 && packs[1] && packs[1].step === 1) {
      step = 1; label = "1時間";
    } else if ((packs[0] && packs[0].step <= 3) || (packs[1] && packs[1].step <= 3)) {
      step = 3; label = "3時間";
    }
    var el = $("wx-detail");
    if (!el) return;
    var rows = locs.map(function (loc, idx) {
      var items = binHourly(locHourly(loc, iso), step);
      return '<div class="wx-detail-row"><div class="wx-detail-name">' + esc(locShort(loc.name)) +
        '</div><div class="wx-detail-slots">' + items.map(slotHtml).join("") + "</div></div>";
    }).join("");
    el.hidden = false;
    el.innerHTML = '<div class="wx-detail-head">' +
      (d ? (d.getMonth() + 1) + "/" + d.getDate() + "（" + WD[d.getDay()] + "）" : iso) +
      "　" + label + "予報<span>戻るで閉じる</span></div>" + rows;
    syncWxFocus();
  }

  function closeWxDetail() {
    wxDetailDate = null;
    var el = $("wx-detail");
    if (el) { el.hidden = true; el.innerHTML = ""; }
    syncWxFocus();
  }

  function syncFilterUi() {
    rebuildPageLists();
    $("btn-u13").className = (pageShowAll() ? "" : "on") + (uiMode === "filter" && filterSel === 0 ? " nav" : "");
    $("btn-all").className = (pageShowAll() ? "on" : "") + (uiMode === "filter" && filterSel === 1 ? " nav" : "");
    var i;
    for (i = 0; i < PAGE_KEYS.length; i++) {
      var btn = $(PAGE_BTNS[i]);
      if (!btn) continue;
      btn.className = (pageKey === PAGE_KEYS[i] ? "on" : "") + (uiMode === "filter" && filterSel === i + 2 ? " nav" : "");
    }
    var nwb = $("btn-next-week-head");
    if (nwb && nwb.hidden) nwb.className = "";
    var sb = $("btn-study");
    if (sb && sb.hidden) sb.className = "";
    var stb = $("btn-study-todo");
    if (stb && stb.hidden) stb.className = "";
    syncTransitAlert();
  }

  function apply(data) {
    if (!data) return;
    data.events = activeEvents(data.events);
    if (data.briefing && data.briefing.nextWeekEvents) {
      data.briefing.nextWeekEvents = activeEvents(data.briefing.nextWeekEvents);
    }
    var src = data;
    if (pageKey === "wx") data = clipDashboard(src, wxDays());
    else if (pageKey === "focus") data = clipDashboard(src, focusDays());
    lastData = data;
    if ((src.days || []).length >= 7) cacheWeek = src;
    else if ((src.days || []).length) {
      var prevN = (cacheFocus && cacheFocus.days && cacheFocus.days.length) || 0;
      if ((src.days || []).length >= prevN) cacheFocus = src;
    }
    var from = data.from || "";
    var to = data.to || "";
    var vis = visibleEvents(data.events);
    if (pageKey === "wx") $("range-line").textContent = phoneRangeTitle() || "天気(3日)　1時間ごと";
    else if (isBriefPage(pageKey)) $("range-line").textContent = phoneRangeTitle() || briefRangeLine();
    else if (isWeekHeadPage(pageKey)) $("range-line").textContent = phoneRangeTitle() || (weekHeadWord() + "のHL");
    else if (isStudyPage(pageKey)) $("range-line").textContent = studyRangeLine();
    else $("range-line").textContent = phoneRangeTitle() || (viewMode === "focus"
      ? ("予定(2日)  " + fmtMd(from) + " – " + fmtMd(to))
      : (weekLabel(weekOffset) + "  " + fmtMd(from) + " – " + fmtMd(to)));
    syncBodyClass();
    if (!kioskOn) setPanelVisibility();
    var viewData = phoneViewData(data);
    renderTimeline(viewData);
    renderWeather(viewData);
    if (pageKey === "wx") renderWxBoard(viewMode === "focus" ? data : (cacheFocus || data));
    requestAnimationFrame(function () {
      if (pageKey === "focus" || pageKey === "week") {
        fillWxRails(viewData);
        requestAnimationFrame(function () { fillWxRails(viewData); });
      }
    });
    if (!apply._focused && !kioskOn) {
      apply._focused = true;
      var di = (data.days || []).indexOf(data.today);
      if (di < 0) di = 0;
      tlCol = di;
      wxCol = di;
      tlIdx = 0;
      uiMode = colEvents(tlCol).length ? "event" : "wx";
      clampTlFocus();
    }
    syncBodyClass();
    syncFilterUi();
    syncCursor();
    $("status").textContent = vis.length + " / " + (data.count || 0) + " 件 · " + (data.version || "");
    if (phoneWantSpeak && !kioskOn) enterKiosk();
  }

  window.DashDone = function (id, err, payload) {
    var cb = pending[id];
    delete pending[id];
    if (!cb) return;
    if (err) cb(err, null);
    else cb(null, payload);
  };

  function requestDashboard(off, cb) {
    cbSeq += 1;
    pending[cbSeq] = cb;
    SonyBridge.fetchDashboard(off, cbSeq);
  }
  function friendlyFetchErr(err) {
    var s = String(err || "empty");
    if (/unresolved|UnknownHost|getaddrinfo|Unable to resolve|No address associated|ERR_NAME_NOT_RESOLVED/i.test(s)) {
      return "接続できません";
    }
    return s.length > 80 ? s.slice(0, 80) : s;
  }
  function focusViewData(src) {
    if (!src) return null;
    var wanted = focusDays();
    var days = src.days || [];
    if (days.length === wanted.length && wanted.every(function (iso, i) { return days[i] === iso; })) return src;
    return clipDashboard(src, wanted);
  }
  function wxViewData(src) {
    if (!src) return null;
    var wanted = wxDays();
    var days = src.days || [];
    if (days.length === wanted.length && wanted.every(function (iso, i) { return days[i] === iso; })) return src;
    return clipDashboard(src, wanted);
  }
  function clipDashboard(data, wanted) {
    var daySet = {};
    wanted.forEach(function (d) { daySet[d] = 1; });
    var events = activeEvents(data.events).filter(function (e) {
      return daySet[String(e.event_date || "").slice(0, 10)];
    });
    var weather = { locations: [] };
    ((data.weather && data.weather.locations) || []).forEach(function (loc) {
      var days = (loc.days || []).filter(function (d) { return daySet[d.date]; });
      var hourly = {};
      Object.keys(loc.hourly || {}).forEach(function (k) {
        var dk = String(k).slice(0, 10);
        if (daySet[dk]) hourly[dk] = loc.hourly[k];
      });
      wanted.forEach(function (iso) {
        if (!hourly[iso] && loc.hourly && loc.hourly[iso]) hourly[iso] = loc.hourly[iso];
      });
      weather.locations.push({ name: loc.name, lat: loc.lat, lon: loc.lon, days: days, hourly: hourly, query: loc.query });
    });
    weather.venues = ((data.weather && data.weather.venues) || []).map(function (loc) {
      var days = (loc.days || []).filter(function (d) { return daySet[d.date]; });
      var hourly = {};
      Object.keys(loc.hourly || {}).forEach(function (k) {
        var dk = String(k).slice(0, 10);
        if (daySet[dk]) hourly[dk] = loc.hourly[k];
      });
      wanted.forEach(function (iso) {
        if (!hourly[iso] && loc.hourly && loc.hourly[iso]) hourly[iso] = loc.hourly[iso];
      });
      return {
        name: loc.name, lat: loc.lat, lon: loc.lon, days: days, hourly: hourly,
        query: loc.query, url: loc.url, error: loc.error
      };
    });
    return {
      ok: true,
      version: data.version,
      today: data.today || todayStr(),
      from: wanted[0],
      to: wanted[wanted.length - 1],
      days: wanted,
      events: events,
      count: events.length,
      weather: weather,
      holiday_isos: (data.holiday_isos || []).filter(function (x) { return daySet[x]; }),
      week_offset: data.week_offset || 0,
      briefing: data.briefing,
      transit: data.transit
    };
  }
  function mergeDash(a, b) {
    var ids = {};
    var events = [];
    (a.events || []).concat((b && b.events) || []).forEach(function (e) {
      var id = e.id || (e.event_date + "|" + e.title + "|" + e.event_time);
      if (ids[id]) return;
      ids[id] = 1;
      events.push(e);
    });
    var locs = [];
    var locIdx = {};
    function addLocs(data) {
      ((data && data.weather && data.weather.locations) || []).forEach(function (loc) {
        var k = loc.name;
        if (locIdx[k] == null) {
          locIdx[k] = locs.length;
          locs.push({ name: loc.name, lat: loc.lat, lon: loc.lon, days: [], hourly: {}, query: loc.query });
        }
        var slot = locs[locIdx[k]];
        (loc.days || []).forEach(function (d) { slot.days.push(d); });
        Object.keys(loc.hourly || {}).forEach(function (iso) { slot.hourly[iso] = loc.hourly[iso]; });
      });
    }
    addLocs(a);
    addLocs(b);
    var venues = [];
    var venueIdx = {};
    function addVenues(data) {
      ((data && data.weather && data.weather.venues) || []).forEach(function (loc) {
        var k = loc.name;
        if (venueIdx[k] == null) {
          venueIdx[k] = venues.length;
          venues.push({ name: loc.name, lat: loc.lat, lon: loc.lon, days: [], hourly: {}, error: loc.error, query: loc.query, url: loc.url });
        }
        var slot = venues[venueIdx[k]];
        if (!slot.query && loc.query) slot.query = loc.query;
        if (!slot.url && loc.url) slot.url = loc.url;
        (loc.days || []).forEach(function (d) { slot.days.push(d); });
        Object.keys(loc.hourly || {}).forEach(function (iso) { slot.hourly[iso] = loc.hourly[iso]; });
      });
    }
    addVenues(a);
    addVenues(b);
    return {
      version: (a && a.version) || (b && b.version),
      today: (a && a.today) || (b && b.today),
      events: events,
      weather: { locations: locs, venues: venues },
      holiday_isos: ((a && a.holiday_isos) || []).concat((b && b.holiday_isos) || []),
      briefing: (a && a.briefing) || (b && b.briefing),
      transit: (a && a.transit) || (b && b.transit)
    };
  }
  function finishLoad(err, data, done, kind) {
    fetchLock = false;
    setWeekBusy(false);
    if (data && data.error && !(data.days && data.days.length)) {
      err = err || data.error;
      data = null;
    }
    if (err && data && data.days && data.days.length) {
      appLog({ event: "load_partial", kind: kind || "", err: String(err), days: data.days.length });
      err = null;
    }
    if (err || !data) {
      $("status").textContent = "取得失敗: " + friendlyFetchErr(err || "empty");
      toast("予定を取得できません");
      if (done) done(err || new Error("empty"));
      return;
    }
    if (data.error) {
      $("status").textContent = friendlyFetchErr(data.error);
      toast(friendlyFetchErr(data.error));
      if (done) done(new Error(data.error));
      return;
    }
    kind = kind || ((data.days && data.days.length >= 7) ? "week" : "focus");
    if (data.briefing && (parseInt(data.week_offset, 10) || 0) === 0) homeBriefing = data.briefing;
    if (data.transit && (parseInt(data.week_offset, 10) || 0) === 0) homeTransit = data.transit;
    if (kind === "week") cacheWeek = data;
    else cacheFocus = data;
    var applyIt = (kind === "week" && viewMode === "week" && pageKey === "week")
      || (kind === "focus" && (pageKey === "focus" || pageKey === "wx"));
    if (isBriefPage(pageKey) || isWeekHeadPage(pageKey)) applyIt = false;
    if (applyIt) {
      apply(data);
    }
    if (isBriefPage(pageKey)) renderBriefing();
    if (isWeekHeadPage(pageKey)) renderWeekHeadline();
    if (isStudyPage(pageKey)) renderStudy();
    if (isPhone()) refreshKioskQueue();
    if (done) done(null);
  }

  function load(done) {
    if (!window.SonyBridge || !SonyBridge.fetchDashboard) {
      $("status").textContent = "PC プレビュー（TV の GAS 接続なし）";
      if (done) done(new Error("no bridge"));
      return;
    }
    if (fetchLock) {
      if (done) done(new Error("busy"));
      return;
    }
    fetchLock = true;
    if (viewMode === "focus") {
      var wanted = focusFetchDays();
      var o0 = weekOffsetOf(wanted[0]);
      var o1 = weekOffsetOf(wanted[wanted.length - 1]);
      requestDashboard(o0, function (err, d0) {
        if (err || !d0 || d0.error) {
          finishLoad(err || (d0 && d0.error), d0, done, "focus");
          return;
        }
        if (o0 === o1) {
          finishLoad(null, clipDashboard(d0, wanted), done, "focus");
          return;
        }
        requestDashboard(o1, function (err2, d1) {
          var clipped = clipDashboard(mergeDash(d0, d1 || {}), wanted);
          if (err2) appLog({ event: "focus_merge_partial", err: String(err2), days: clipped.days.length });
          finishLoad(null, clipped, done, "focus");
        });
      });
      return;
    }
    requestDashboard(weekOffset, function (err, data) {
      finishLoad(err, data, done, "week");
    });
  }

  function appLog(obj) {
    try {
      if (window.SonyBridge && SonyBridge.log) SonyBridge.log(JSON.stringify(obj));
    } catch (e) {}
  }
  function syncBodyClass() {
    var cls = viewMode === "focus" ? "mode-focus" : "mode-week";
    if (boardOpen) cls += " page-wx2";
    if (kioskOn) cls += " kiosk";
    if (kioskPaused) cls += " kiosk-paused";
    if (studyDebug()) cls += " study-debug";
    document.body.className = cls;
    updateKioskInd();
    updateKioskHint();
  }
  function updateKioskInd() {
    var el = $("kiosk-ind");
    if (!el) return;
    if (studyDebug()) {
      el.textContent = "DEBUG";
      return;
    }
    var at = kioskQueue.indexOf(kioskKey);
    var pos = (at < 0 ? 1 : at + 1) + "/" + Math.max(1, kioskQueue.length);
    if (isPhone()) {
      el.textContent = pos;
      return;
    }
    // ページ数が増えるとドット列がヘッダー幅を超えてクロック表示が見切れる
    // （2026-09-16、リーグ順位ページ追加で再発）ため、桁数の増減に幅が左右されない
    // コンパクトな数字表記に統一する（ドットは廃止）。
    el.textContent = "AUTO " + pos;
  }
  function updateKioskHint() {
    var el = $("kiosk-hint");
    if (!el) return;
    if (studyDebug()) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = kioskPaused
      ? (isPhone() ? "一時停止中 · タップで再開" : "一時停止中 · 設定で再開")
      : (isPhone() ? "タップで停止" : "リモコンで停止");
  }
  function resetIdle() {
    clearTimeout(idleTimer);
    if (studyDebug()) return;
    if (kioskOn || kioskPaused) return;
    idleTimer = setTimeout(enterKiosk, IDLE_MS);
  }
  function noteInput(fromClick) {
    if (kioskOn) {
      stopKiosk();
      if (!fromClick) eatKey = true;
    }
    resetIdle();
  }
  window.DashNoteInput = function () {
    noteInput(false);
  };
  function consumeKioskKey() {
    if (eatKey) {
      eatKey = false;
      return true;
    }
    return false;
  }
  function setPanelVisibility() {
    var k = pageKey;
    boardOpen = k === "wx";
    if ($("tl")) $("tl").hidden = !(k === "focus" || k === "week");
    if ($("wx-board")) $("wx-board").hidden = k !== "wx";
    if ($("brief-board")) $("brief-board").hidden = !isBriefPage(k);
    if ($("week-head-board")) $("week-head-board").hidden = !isWeekHeadPage(k);
    if ($("study-board")) $("study-board").hidden = !isStudyPage(k);
    if ($("standings-board")) $("standings-board").hidden = !isStandingsPage(k);
    if ($("transit-board")) $("transit-board").hidden = true;
  }
  function selectPage(key) {
    rebuildPageLists();
    var parent = parentPage(key);
    var slice = sliceOf(key);
    if (parent === "transit") parent = "brief";
    if (parent === "tomo" && !afterSixPm()) parent = "brief";
    if (parent === "nextWeekHead" && !isSunday()) parent = "weekHead";
    if (isPhone() && parent === "studyTodo") parent = "study";
    if (isStudyPage(parent) && !studyPagesOn()) parent = isPhone() ? "brief" : "focus";
    if (isPhone() && (parent === "focus" || parent === "week")) parent = "brief";
    if (PAGE_KEYS.indexOf(parent) < 0) parent = isPhone() ? "brief" : "focus";
    if (isPhone()) {
      var slices = phoneSlicesFor(parent);
      var wantKey = slice ? (parent + "|" + slice) : "";
      if (!wantKey || slices.indexOf(wantKey) < 0) {
        wantKey = slices[0] || parent;
        parent = parentPage(wantKey);
        slice = sliceOf(wantKey);
      }
    } else {
      slice = "";
    }
    pageKey = parent;
    phoneSlice = slice;
    kioskKey = phoneQueueKey(parent, slice);
    try { localStorage.setItem("dashPage", kioskKey); } catch (e) {}
    closeWxDetail();
    closeEvDetail();
    if (parent === "week") viewMode = "week";
    else if (parent === "focus" || parent === "wx") viewMode = "focus";
    setPanelVisibility();
    syncBodyClass();
    syncPhoneLayout();
    if (isBriefPage(parent)) renderBriefing();
    else if (isWeekHeadPage(parent)) {
      renderWeekHeadline();
      if (!currentWeekCacheOk(cacheWeek)) prefetchWeek();
    } else if (isStudyPage(parent)) {
      renderStudy();
    } else if (isStandingsPage(parent)) {
      $("range-line").textContent = (KIOSK_META[parent] || {}).title || "順位";
      renderStandings();
      if (!standingsData) loadStandings();
    } else if (parent === "wx") {
      $("range-line").textContent = phoneRangeTitle() || "天気(3日)　1時間ごと";
      var wxFresh = cacheHasDays(cacheFocus, wxDays()) && wxDays()[0] === todayStr();
      var wxData = wxFresh ? wxViewData(cacheFocus) : (wxViewData(cacheFocus) || wxViewData(lastData) || wxViewData(cacheWeek));
      if (wxData) renderWxBoard(wxData);
      if (!wxFresh) load();
    } else if (parent === "focus") {
      var fresh = cacheHasDays(cacheFocus, focusDays());
      var focusData = fresh ? focusViewData(cacheFocus) : (focusViewData(cacheFocus) || focusViewData(lastData) || focusViewData(cacheWeek));
      if (focusData) paintFromCache(focusData, "focus");
      if (!fresh) load();
    } else if (!paintFromCache(weekCacheOk(cacheWeek) && (parseInt(cacheWeek.week_offset, 10) || 0) === weekOffset ? cacheWeek : null, "week")) {
      weekOffset = 0;
      load();
    }
    syncFilterUi();
    if (!kioskOn && !hushSpeak && (!isPhone() || phoneWantSpeak)) maybeSpeakPage(kioskKey);
  }
  function showTl() {
    selectPage(viewMode === "week" ? "week" : "focus");
  }
  function showBoard() {
    selectPage("wx");
  }
  function uiSvg(inner) {
    return '<svg viewBox="0 0 64 64">' + inner + "</svg>";
  }
  function uiIco(name) {
    var g = {
      ball: '<circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="2.4"/><path fill="currentColor" d="M32 18l8.6 6.2-3.2 10.2H26.6L23.4 24.2z"/><path fill="none" stroke="currentColor" stroke-width="2" d="M23.4 24.2L12 21.5M40.6 24.2L52 21.5M26.6 34.4L20 52M37.4 34.4L44 52"/>',
      cone: '<path fill="currentColor" d="M32 8l18 46H14z"/><rect x="22" y="30" width="20" height="5" fill="#0c0e13"/>',
      book: '<path fill="none" stroke="currentColor" stroke-width="2.4" d="M14 12h18c6 0 10 3 10 9v31H24c-6 0-10-3-10-9V12z"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M42 12h8v40H32"/><path fill="none" stroke="currentColor" stroke-width="2" d="M20 22h14M20 30h12"/>',
      person: '<circle cx="32" cy="18" r="10" fill="none" stroke="currentColor" stroke-width="2.4"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M12 54c2-14 10-20 20-20s18 6 20 20"/>',
      tent: '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" d="M8 52h48L32 12z"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M32 12v40"/>',
      star: '<path fill="currentColor" d="M32 8l6.2 18.2H58L42.8 37.4 48.6 56 32 45.2 15.4 56l5.8-18.6L6 26.2h19.8z"/>',
      cal: '<rect x="10" y="14" width="44" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="2.4"/><path fill="none" stroke="currentColor" stroke-width="2.4" d="M10 26h44M22 10v10M42 10v10"/>',
      hanger: '<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M32 8a6.5 6.5 0 0 0-1 13"/><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" d="M10 38L32 18l22 20H10z"/>',
      car: '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" d="M10 36h44v10H10zM16 36l6-12h20l6 12"/><circle cx="20" cy="48" r="4.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="44" cy="48" r="4.5" fill="none" stroke="currentColor" stroke-width="2.4"/>',
      train: '<rect x="12" y="12" width="40" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="18" y="18" width="12" height="10" rx="1" fill="currentColor" opacity="0.35"/><rect x="34" y="18" width="12" height="10" rx="1" fill="currentColor" opacity="0.35"/><circle cx="22" cy="50" r="5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="42" cy="50" r="5" fill="none" stroke="currentColor" stroke-width="2.4"/>',
      check: '<circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="2.4"/><path fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" d="M18 33l9 9 19-20"/>',
      delay: '<circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="2.4"/><path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" d="M32 16v18l12 6"/>',
      stop: '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" d="M22 8h20l14 14v20L42 56H22L8 42V22z"/><path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" d="M22 22l20 20M42 22L22 42"/>',
      moon: '<path fill="currentColor" d="M42 10a22 22 0 1 0 8 40 20 20 0 0 1-8-40z"/>'
    };
    return '<span class="ui-ico">' + uiSvg(g[name] || g.cal) + "</span>";
  }
  function kindIcoName(kind) {
    var k = canonicalKind(kind);
    if (k === "match" || k === "マリノス戦") return "ball";
    if (k === "TR") return "cone";
    if (k === "塾") return "book";
    if (k === "私用") return "person";
    if (k === "合宿") return "tent";
    if (k === "adhoc") return "star";
    return "cal";
  }
  function kindChipClass(kind, ev) {
    var k = canonicalKind(kind);
    if (k === "match") return "k-match";
    if (k === "TR") return "k-tr";
    if (k === "塾") return "k-juku k-sub-" + jukuSubjectKey(ev);
    if (k === "adhoc") return "k-adhoc";
    if (k === "私用") return "k-private";
    if (k === "合宿") return "k-gasshuku";
    if (k === "マリノス戦") return "k-marinos";
    return "";
  }
  function jukuSubjectKey(ev) {
    var t = String((ev && (ev.title || ev.kindLabel)) || "");
    if (/国|現代文|古文|漢文/.test(t)) return "jpn";
    if (/数|算数/.test(t)) return "math";
    if (/英/.test(t)) return "eng";
    if (/理|化学|物理|生物/.test(t)) return "sci";
    if (/社|地理|歴史|公民|世界史|日本史/.test(t)) return "soc";
    return "etc";
  }
  function jukuSubjectLabel(ev) {
    var key = jukuSubjectKey(ev);
    if (key === "jpn") return "国語";
    if (key === "math") return "数学";
    if (key === "eng") return "英語";
    if (key === "sci") return "理科";
    if (key === "soc") return "社会";
    var t = String((ev && ev.title) || "").replace(/塾/g, "").trim();
    return t || "塾";
  }
  function catShort(code) {
    var t = String(code || "");
    if (/ALL/i.test(t) || t === "全") return "ALL";
    if (/15/.test(t) && /13/.test(t)) return "13";
    if (/15/.test(t)) return "15";
    if (/14/.test(t) && /13/.test(t)) return "13";
    if (/14/.test(t)) return "14";
    if (/13/.test(t)) return "13";
    if (/GK/i.test(t)) return "GK";
    return "";
  }
  function briefHm(ev) {
    var src = "";
    if (ev.kind === "match" && ev.depart) src = ev.depart;
    else if (ev.kind === "match" && ev.assemble) src = ev.assemble;
    else src = ev.time || "";
    var m = String(src).match(/([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/);
    if (!m) {
      m = String(ev.time || "").match(/([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/);
    }
    if (!m) return "";
    return hm(Number(m[1]) * 60 + Number(m[2]));
  }
  function briefKick(ev) {
    var m = String((ev && (ev.time || ev.event_time)) || "").match(/([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/);
    if (!m) return "";
    return hm(Number(m[1]) * 60 + Number(m[2]));
  }
  function briefEventSpan(ev) {
    var core = parseCore({ event_time: String((ev && (ev.time || ev.event_time)) || "") });
    if (core && core.end > core.start) return hm(core.start) + "-" + hm(core.end);
    if (core) return hm(core.start);
    return briefKick(ev) || briefHm(ev);
  }
  function hmToMin(s) {
    var m = String(s || "").match(/([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }
  function eventStartMinutes(ev) {
    var mins = [];
    var t = hmToMin(briefKick(ev));
    if (t != null) mins.push(t);
    t = hmToMin(briefHm(ev));
    if (t != null) mins.push(t);
    var core = parseCore({ event_time: (ev && (ev.time || ev.event_time)) || "" });
    if (core) mins.push(core.start);
    if (!mins.length) return null;
    return Math.min.apply(null, mins);
  }
  function eventIsPast(ev) {
    return eventIsOver(ev);
  }
  function eventEndMinutes(ev) {
    var src = ev || {};
    if (!src.event_time && src.time) {
      src = {
        event_time: src.time,
        pre_event_coach: src.pre_event_coach,
        pre_event_user: src.pre_event_user,
        post_event_coach: src.post_event_coach,
        post_event_user: src.post_event_user
      };
    }
    var range = displayRange(src);
    if (range && range.end != null) return range.end;
    var core = parseCore({ event_time: (src.event_time || src.time || "") });
    if (core) return core.end;
    var start = eventStartMinutes(ev);
    if (start == null) return null;
    return start + 120;
  }
  function eventIsOver(ev) {
    if (ev && ev.groupEvents && ev.groupEvents.length) {
      return ev.groupEvents.every(function (x) { return eventIsOver(x); });
    }
    var iso = eventIso(ev);
    var today = todayStr();
    if (!iso) return false;
    if (iso < today) return true;
    if (iso > today) return false;
    var end = eventEndMinutes(ev);
    if (end == null) return false;
    var n = new Date();
    return end <= n.getHours() * 60 + n.getMinutes();
  }
  function upcomingOnly(rows) {
    return (rows || []).filter(function (ev) { return !eventIsOver(ev); });
  }
  function matchOpponentName(ev) {
    var raw = String((ev && (ev.card || matchCardText(ev))) || "").replace(/^vs\s*/i, "").trim();
    if (raw) return raw;
    var title = String((ev && ev.title) || "").replace(/^vs\s*/i, "").trim();
    var kind = (ev && (ev.kindLabel || kindLabel(ev.kind))) || "";
    if (!title || title === kind || title === "試合" || title === "マリノス戦" || title === "練習") return "";
    return title;
  }
  function matchVenueName(ev) {
    return String((ev && (ev.venue || ev.location)) || "").trim();
  }
  function eventTimeSrc(ev) {
    return { event_time: String((ev && (ev.event_time || ev.time)) || "") };
  }
  function eventCoverHours(ev) {
    var core = parseCore(eventTimeSrc(ev));
    if (!core) return [];
    var h0 = Math.floor(core.start / 60);
    var end = core.end != null ? core.end : core.start + 120;
    var h1 = Math.floor((end - 1) / 60);
    if (h1 < h0) h1 = h0;
    var hs = [];
    var h;
    for (h = h0; h <= h1 && h <= 23; h++) hs.push(h);
    return hs;
  }
  function wxDataBag() {
    return cacheWeek || cacheFocus || lastData;
  }
  function allVenueWx() {
    var acc = [];
    function add(data) {
      ((data && data.weather && data.weather.venues) || []).forEach(function (v) {
        if (!v || !v.name) return;
        var i;
        for (i = 0; i < acc.length; i++) if (acc[i].name === v.name) return;
        acc.push(v);
      });
    }
    add(cacheWeek);
    add(cacheFocus);
    add(lastData);
    return acc;
  }
  function eventWxLoc(ev) {
    var bag = wxDataBag();
    var locs = ((bag && bag.weather && bag.weather.locations) || []);
    var k = canonicalKind(ev && (ev.kind || ev.event_kind));
    if (k === "塾") return locForWxRow(locs, 0);
    var name = matchVenueName(ev);
    if (/WindsLife|ウインズ|ウィンズ|新磯/i.test(name)) {
      return locByRe(locs, /新磯/) || locForWxRow(locs, 1);
    }
    if (k === "TR" || /相模原|麻溝/.test(name)) return locForWxRow(locs, 1);
    var venues = allVenueWx();
    var i;
    for (i = 0; i < venues.length; i++) {
      if (venues[i].name === name) return venues[i];
    }
    for (i = 0; i < venues.length; i++) {
      var vn = venues[i].name || "";
      if (name && vn && (name.indexOf(vn) >= 0 || vn.indexOf(name) >= 0)) return venues[i];
    }
    return null;
  }
  function shortWxPlace(s) {
    s = String(s || "").replace(/\s+/g, "");
    s = s.replace(/^(北海道|東京都|大阪府|京都府|.+?県)/, "");
    var ward = s.match(/市([一-龯々]{1,6}区)/);
    if (ward) {
      var w = ward[1].replace(/区$/, "");
      return w.length <= 1 ? ward[1] : (w.length <= 4 ? w : ward[1]);
    }
    var city = s.match(/([一-龯々]{2,6})[市区町村]/);
    if (city) return city[1];
    return s.length <= 4 ? s : "";
  }
  function wxBadgePlace(loc) {
    if (!loc) return "";
    var n = String(loc.name || "");
    if (/藤が丘/.test(n)) return "藤が丘";
    if (/麻溝/.test(n)) return "麻溝台";
    if (/新磯/.test(n)) return "新磯野";
    return shortWxPlace(loc.query || "");
  }
  function eventSlotRain(ev) {
    var loc = eventWxLoc(ev);
    if (!loc) return null;
    var place = wxBadgePlace(loc);
    var hours = eventCoverHours(ev);
    if (!hours.length) return { kind: "none", tag: "", mm: 0, place: place };
    var hourly = locHourly(loc, eventIso(ev));
    var byH = {};
    (hourly || []).forEach(function (s) { byH[slotHour(s)] = s; });
    var peak = 0;
    var used = 0;
    var kind = "none";
    hours.forEach(function (h) {
      var s = byH[h];
      if (!s) return;
      var n = Number(s.rainMm) || 0;
      if (n > peak) peak = n;
      used += 1;
      kind = worseRainKind(kind, rainKind(n, s.rainProb));
    });
    if (!used) return { kind: "none", tag: "", mm: 0, place: place };
    if (kind === "none") {
      if (rainIsTrace(peak)) return { kind: "cloud", tag: "曇り", mm: 0, place: place };
      var maxCode = 0;
      hours.forEach(function (h) {
        var s = byH[h];
        var c = Number(s && s.code) || 0;
        if (c > maxCode) maxCode = c;
      });
      if (maxCode >= 3) return { kind: "cloud", tag: "曇り", mm: 0, place: place };
      return { kind: "sun", tag: "晴れ", mm: 0, place: place };
    }
    var tag = kind === "heavy" ? "大雨" : (kind === "mid" ? "雨" : "弱雨");
    return { kind: kind, tag: tag, mm: peak, place: place };
  }
  function wantsWxBadge(ev) {
    var k = canonicalKind(ev && (ev.kind || ev.event_kind));
    return k === "match" || k === "TR" || k === "合宿" || k === "マリノス戦" || k === "塾";
  }
  function rainBadgeHtml(ev, opts) {
    if (ev && ev.groupEvents && ev.groupEvents.length) {
      var rank = { heavy: 3, mid: 2, light: 1, none: 0 };
      var worst = ev.groupEvents[0];
      var worstN = 0;
      ev.groupEvents.forEach(function (x) {
        var rv = eventSlotRain(x);
        var n = rank[(rv && rv.kind) || "none"] || 0;
        if (n > worstN) {
          worstN = n;
          worst = x;
        }
      });
      return rainBadgeHtml(worst, opts);
    }
    if (!wantsWxBadge(ev)) return "";
    var rv = eventSlotRain(ev);
    if (!rv || !rv.tag) return "";
    opts = opts || {};
    var place = rv.place
      ? '<span class="rain-badge-place">' + esc(rv.place) + "</span>"
      : "";
    var extra = opts.cls ? " " + opts.cls : "";
    var st = opts.style ? ' style="' + opts.style + '"' : "";
    return '<div class="rain-badge rain-' + rv.kind + extra + '"' + st + '><span class="rain-badge-wx">' +
      esc(rv.tag) + "</span>" + place + "</div>";
  }
  function matchKickClock(ev) {
    var t = speakClock(briefKick(ev));
    if (t) return t;
    var core = parseCore({ event_time: (ev && (ev.time || ev.event_time)) || "" });
    if (core) return speakClock(hm(core.start));
    return speakClock(briefHm(ev));
  }
  function rainIcoName(r) {
    if (r && r.ico) return r.ico;
    if (!r || r.kind === "none" || !r.raining) return "sun";
    if (r.kind === "heavy") return "heavy";
    if (r.kind === "mid") return "mid";
    return "light";
  }
  function briefChip(ev, withDow, slim) {
    var kind = ev.kindLabel || kindLabel(ev.kind);
    var title = String(ev.title || "").trim();
    if (title && title === kind) title = "";
    var vs = "";
    if (canonicalKind(ev.kind) === "match" || canonicalKind(ev.kind) === "マリノス戦") {
      vs = matchOpponentName(ev);
      if (title && (title === vs || /^vs\s/i.test(title))) title = "";
    }
    var time = ev.displaySpan || briefEventSpan(ev);
    var leave = "";
    if (canonicalKind(ev.kind) === "match" || canonicalKind(ev.kind) === "マリノス戦") {
      leave = briefHm(ev);
      if (leave && time && leave === time) leave = "";
    }
    var dowHtml = "";
    if (withDow && !slim) {
      var d = parseLocalDate(ev.date);
      if (d) {
        var di = d.getDay();
        dowHtml = '<div class="dow' + (di === 6 ? " is-sat" : di === 0 ? " is-sun" : "") + '">' + WD[di] + "</div>";
      }
    }
    var venue = "";
    if ((withDow || slim) && (isSoccerEv(ev) || isMiscEv(ev))) {
      venue = matchVenueName(ev);
    }
    var league = (withDow || slim) ? leagueLabel(ev) : "";
    return '<div class="brief-chip ' + kindChipClass(ev.kind, ev) + (ev.groupEvents ? " is-group" : "") + (slim ? " is-slim" : "") + (eventIsPast(ev) ? " is-past" : "") + '">' +
      rainBadgeHtml(ev) +
      dowHtml +
      (slim ? "" : uiIco(kindIcoName(ev.kind))) +
      '<div class="kind">' + esc(kind) + "</div>" +
      (title ? '<div class="ttl">' + esc(title) + "</div>" : "") +
      (league ? '<div class="league">' + esc(league) + "</div>" : "") +
      (vs ? '<div class="vs">vs ' + esc(vs) + "</div>" : "") +
      (venue ? '<div class="venue">' + esc(venue) + "</div>" : "") +
      (time ? '<div class="t">' + esc(time) + "</div>" : "") +
      (leave && !slim ? '<div class="who">出 ' + esc(leave) + "</div>" : "") +
      "</div>";
  }
  function isSoccerEv(ev) {
    var k = canonicalKind(ev && (ev.kind || ev.event_kind));
    return k === "match" || k === "TR" || k === "合宿" || k === "マリノス戦";
  }
  function isMarinosEv(ev) {
    return canonicalKind(ev && (ev.kind || ev.event_kind)) === "マリノス戦";
  }
  function ownBeforeMarinos(rows) {
    var own = [];
    var marinos = [];
    (rows || []).forEach(function (ev) {
      if (isMarinosEv(ev)) marinos.push(ev);
      else own.push(ev);
    });
    return own.concat(marinos);
  }
  function isMiscEv(ev) {
    var k = canonicalKind(ev && ev.kind);
    return k === "adhoc" || k === "私用";
  }
  function rainLabel(r) {
    if (!r || r.kind === "none" || !r.raining) return "雨なし";
    if (r.kind === "heavy") return "大雨";
    if (r.kind === "mid") return "雨";
    return "弱雨";
  }
  function chipListHtml(rows) {
    if (!rows || !rows.length) {
      return '<div class="brief-empty-ico">' + uiIco("cal") + '<div class="st-cap">なし</div></div>';
    }
    return rows.map(briefChip).join("");
  }
  function wxCardHtml(name, r, pack) {
    var mm = (r && r.raining && r.mm != null) ? String(r.mm) + "mm" : "";
    return '<div class="brief-wx">' +
      wxIcoHtml(rainIcoName(r), 72) +
      '<div class="ttl">' + esc(name) + "</div>" +
      '<div class="t">' + esc(rainLabel(r)) + "</div>" +
      (mm ? '<div class="who">' + esc(mm) + "</div>" : "") +
      tempBlockHtml(pack) +
      "</div>";
  }
  function pickWxDay(days, iso) {
    var i;
    for (i = 0; i < (days || []).length; i++) {
      if (days[i].date === iso) return days[i];
    }
    return null;
  }
  function locTempPack(which, iso) {
    iso = iso || todayStr();
    var b = homeBriefing || (lastData && lastData.briefing) || {};
    if (iso === todayStr() && b.temp && b.temp[which]) return b.temp[which];
    if (iso !== todayStr() && b.tempTomorrow && b.tempTomorrow[which]) return b.tempTomorrow[which];
    var days = locWxDays(cacheFocus || cacheWeek || lastData, which === "aoba" ? /青葉/ : /相模/);
    var td = pickWxDay(days, iso);
    var yd = pickWxDay(days, addDaysIso(iso, -1));
    if (!td) return null;
    var pack = { tmax: td.tmax, tmin: td.tmin, dtmax: null, dtmin: null };
    if (yd && td.tmax != null && yd.tmax != null) pack.dtmax = td.tmax - yd.tmax;
    if (yd && td.tmin != null && yd.tmin != null) pack.dtmin = td.tmin - yd.tmin;
    return pack;
  }
  function locRainPack(which, iso) {
    iso = iso || todayStr();
    var re = which === "aoba" ? /青葉/ : /相模/;
    var src = cacheFocus || cacheWeek || lastData;
    var locs = (src && src.weather && src.weather.locations) || [];
    var loc = null;
    var i;
    for (i = 0; i < locs.length; i++) {
      if (re.test(locs[i].name || "")) { loc = locs[i]; break; }
    }
    if (!loc && locs.length && which === "aoba") loc = locs[0];
    var hourly = locHourly(loc, iso);
    var w = pickWxDay((loc && loc.days) || [], iso);
    var rv = rainVisual(w || { date: iso }, hourly);
    var kind = rv.kind || "none";
    if (kind !== "none" || (hourly && hourly.length)) {
      return { kind: kind, raining: kind !== "none", mm: rv.mm, ico: rv.ico };
    }
    var b = homeBriefing || (lastData && lastData.briefing) || {};
    function clipBriefingRain(p) {
      if (!p) return p;
      if (rainKind(p.mm) === "none") {
        return { kind: "none", raining: false, mm: 0, ico: rainIsTrace(p.mm) ? "cloud" : "sun" };
      }
      return p;
    }
    if (iso === todayStr() && b.rain && b.rain[which]) return clipBriefingRain(b.rain[which]);
    if (iso !== todayStr() && b.rainTomorrow && b.rainTomorrow[which]) return clipBriefingRain(b.rainTomorrow[which]);
    return { kind: kind, raining: false, mm: rv.mm, ico: rv.ico };
  }
  function briefDayIso() {
    return pageKey === "tomo" ? addDaysIso(todayStr(), 1) : todayStr();
  }
  function briefDayEvents(iso) {
    var b = homeBriefing || (lastData && lastData.briefing) || {};
    iso = iso || briefDayIso();
    var rows;
    if (iso === todayStr() && b.today) rows = b.today || [];
    else if (iso !== todayStr() && b.tomorrow) rows = b.tomorrow || [];
    else {
      var src = cacheFocus || cacheWeek || lastData;
      rows = activeEvents((src && src.events) || []).filter(function (e) {
        return eventIso(e) === iso;
      }).map(asHeadLine);
    }
    return rows.filter(function (ev) { return !isU14U15Only(ev); });
  }
  function deltaHtml(n) {
    if (n == null || n === "" || isNaN(Number(n))) return "";
    var v = Math.round(Number(n));
    if (v === 0) return '<div class="delta">前日並み</div>';
    if (v > 0) return '<div class="delta up">前日比 +' + v + "°</div>";
    return '<div class="delta dn">前日比 ' + v + "°</div>";
  }
  function tempBlockHtml(pack) {
    if (!pack || (pack.tmax == null && pack.tmin == null)) return "";
    var hi = pack.tmax != null ? '<div class="deg">最高 ' + pack.tmax + "°</div>" + deltaHtml(pack.dtmax) : "";
    var lo = pack.tmin != null ? '<div class="deg">最低 ' + pack.tmin + "°</div>" + deltaHtml(pack.dtmin) : "";
    return '<div class="temps">' + hi + lo + "</div>";
  }
  function renderBriefing() {
    var el = $("brief-board");
    var b = homeBriefing || (lastData && lastData.briefing);
    if (!el) return;
    if (!b || b.error) {
      el.innerHTML = '<div class="brief-empty-ico" style="flex:1;justify-content:center">' + uiIco("cal") + "</div>";
      return;
    }
    var iso = briefDayIso();
    var rows = briefDayEvents(iso);
    var juku = rows.filter(function (ev) { return canonicalKind(ev.kind) === "塾"; });
    var soccer = ownBeforeMarinos(rows.filter(isSoccerEv));
    var misc = rows.filter(isMiscEv);
    var wxHtml = '<div class="brief-sec brief-sec-wx"><div class="brief-sec-h">天気</div><div class="brief-sec-body">' +
      briefWxPanelHtml(iso) +
      "</div></div>";
    if (isPhone()) {
      var sec = "";
      if (phoneSlice === "juku") {
        sec = '<div class="brief-sec phone-day-juku"><div class="brief-sec-body">' + chipListHtml(juku) + "</div></div>";
        el.innerHTML = '<div class="brief-grid"><div class="brief-main">' + sec + "</div></div>";
      } else if (phoneSlice === "soccer") {
        sec = '<div class="brief-sec"><div class="brief-sec-h">サッカー</div><div class="brief-sec-body">' + chipListHtml(soccer) + "</div></div>";
        el.innerHTML = '<div class="brief-grid"><div class="brief-main">' + sec + "</div></div>";
      } else if (phoneSlice === "misc") {
        sec = '<div class="brief-sec"><div class="brief-sec-h">単発・私用</div><div class="brief-sec-body">' + chipListHtml(misc) + "</div></div>";
        el.innerHTML = '<div class="brief-grid"><div class="brief-main">' + sec + "</div></div>";
      } else if (phoneSlice === "wx") {
        el.innerHTML = '<div class="brief-grid"><div class="brief-main">' +
          '<div class="brief-sec brief-sec-wx"><div class="brief-sec-body">' + briefWxPanelHtml(iso) + "</div></div>" +
          "</div></div>";
      } else if (phoneSlice === "transit") {
        el.innerHTML = '<div class="brief-grid phone-transit">' + transitColsHtml(true) + "</div>";
      } else {
        el.innerHTML = '<div class="brief-grid"><div class="brief-main">' + wxHtml + "</div></div>";
      }
    } else {
      el.innerHTML =
        '<div class="brief-grid">' +
          '<div class="brief-main">' +
            '<div class="brief-sec"><div class="brief-sec-h">塾</div><div class="brief-sec-body">' + chipListHtml(juku) + "</div></div>" +
            '<div class="brief-sec"><div class="brief-sec-h">サッカー</div><div class="brief-sec-body">' + chipListHtml(soccer) + "</div></div>" +
            '<div class="brief-sec"><div class="brief-sec-h">単発・私用</div><div class="brief-sec-body">' + chipListHtml(misc) + "</div></div>" +
            wxHtml +
          "</div>" +
          transitColsHtml(true) +
        "</div>";
    }
    $("range-line").textContent = phoneRangeTitle() || briefRangeLine();
    syncTransitAlert();
    briefPastStamp = briefEventsPastStamp();
  }
  function briefEventsPastStamp() {
    return briefDayEvents(briefDayIso()).map(function (ev) {
      return eventIsPast(ev) ? "1" : "0";
    }).join("");
  }
  function locWxDays(data, re) {
    var locs = (data && data.weather && data.weather.locations) || [];
    var i;
    var loc = null;
    for (i = 0; i < locs.length; i++) {
      if (re.test(locs[i].name || "")) { loc = locs[i]; break; }
    }
    if (!loc && locs.length && /青葉/.test(re.source)) loc = locs[0];
    if (!loc && locs.length && /相模/.test(re.source)) loc = locForWxRow(locs, 1);
    return (loc && loc.days) || [];
  }
  function eventIso(ev) {
    return String((ev && (ev.date || ev.event_date)) || "").slice(0, 10);
  }
  function asHeadLine(ev) {
    return {
      date: eventIso(ev),
      category: ev.category || ev.category_code,
      kind: ev.kind || ev.event_kind,
      kindLabel: ev.kindLabel,
      title: ev.title,
      time: ev.time || ev.event_time,
      venue: ev.venue || ev.location,
      card: ev.card || matchCardText(ev) || ev.regalia_match_text,
      league_or_competition: eventLeague(ev),
      assemble: ev.assemble,
      depart: ev.depart
    };
  }
  function fillMatchSpeakFields(row) {
    var src = cacheWeek || lastData;
    var b = homeBriefing || (lastData && lastData.briefing) || {};
    var evs = activeEvents(src && src.events).concat(activeEvents(b.nextWeekEvents));
    var iso = eventIso(row);
    var want = canonicalKind(row.kind || row.event_kind);
    var i;
    var e;
    for (i = 0; i < evs.length; i++) {
      e = evs[i];
      if (eventIso(e) !== iso) continue;
      if (canonicalKind(e.event_kind || e.kind) !== want) continue;
      if (!String(row.card || "").trim()) row.card = matchCardText(e);
      if (!String(row.opponent || "").trim()) row.opponent = e.opponent || "";
      if (!String(row.regalia_match_text || "").trim()) row.regalia_match_text = e.regalia_match_text || "";
      if (!String(row.league_or_competition || "").trim()) row.league_or_competition = eventLeague(e);
      if (!String(row.venue || "").trim()) row.venue = e.venue || e.location || "";
      if (!String(row.time || "").trim()) row.time = e.event_time || e.time || "";
      break;
    }
    if (!String(row.card || "").trim()) {
      var opp = matchOpponentName(row);
      if (opp) row.card = opp;
    }
    return row;
  }
  function splitWeekMatches(h) {
    var match = [];
    var marinos = (h.marinos || []).slice();
    (h.u13Match || []).forEach(function (e) {
      fillMatchSpeakFields(e);
      if (isMarinosEv(e)) marinos.push(e);
      else match.push(e);
    });
    marinos.forEach(fillMatchSpeakFields);
    h.u13Match = match;
    h.marinos = marinos;
    return h;
  }
  function weekHeadData(parent) {
    var next = isNextWeekHead(parent);
    var b = homeBriefing || (lastData && lastData.briefing) || {};
    var src = weekDashSrc();
    var evs = next
      ? clipRowsToWeek(activeEvents(b.nextWeekEvents).slice(), parent)
      : clipRowsToWeek(activeEvents(src && src.events).slice(), parent);
    evs.sort(function (a, b) { return eventIso(a).localeCompare(eventIso(b)); });
    function isU13e(e) { return includesU13(e.category || e.category_code); }
    function miscRows(list) {
      return (list || []).filter(function (e) {
        var k = canonicalKind(e.kind || e.event_kind);
        return k === "adhoc" || k === "私用";
      }).map(asHeadLine);
    }
    var hl = next ? b.nextWeekHeadline : b.weekHeadline;
    if (hl) {
      hl = clipHeadlineToWeek(hl, parent);
      if (!hl.misc || !hl.misc.length) hl.misc = miscRows(evs);
      return filterWeekdayU13Activity(splitWeekMatches(hl), parent);
    }
    return filterWeekdayU13Activity(splitWeekMatches({
      juku: evs.filter(function (e) { return canonicalKind(e.kind || e.event_kind) === "塾"; }).map(asHeadLine),
      u13Activity: evs.filter(function (e) {
        if (!isU13e(e)) return false;
        var k = canonicalKind(e.kind || e.event_kind);
        return k === "TR" || k === "合宿";
      }).map(asHeadLine),
      u13Match: evs.filter(function (e) {
        if (!isU13e(e)) return false;
        var k = canonicalKind(e.kind || e.event_kind);
        return k === "match" || k === "マリノス戦";
      }).map(asHeadLine),
      marinos: [],
      misc: miscRows(evs),
      weather: {
        aoba: locWxDays(src, /青葉/),
        sagamihara: locWxDays(src, /相模/)
      }
    }), parent);
  }
  function sortHeadRows(rows) {
    return (rows || []).slice().sort(function (a, b) {
      var da = eventIso(a);
      var db = eventIso(b);
      if (da !== db) return da < db ? -1 : 1;
      return eventStartKey(a).localeCompare(eventStartKey(b));
    });
  }
  function weekChipList(rows, byDay, slim) {
    if (!rows || !rows.length) {
      return '<div class="brief-empty-ico">' + uiIco("cal") + '<div class="st-cap">なし</div></div>';
    }
    var list = sortHeadRows(rows);
    if (!byDay) {
      return list.map(function (ev) { return briefChip(ev, true, slim); }).join("");
    }
    var html = "";
    var i = 0;
    while (i < list.length) {
      var iso = eventIso(list[i]);
      html += '<div class="chip-day-row">';
      while (i < list.length && eventIso(list[i]) === iso) {
        html += briefChip(list[i], true, slim);
        i += 1;
      }
      html += "</div>";
    }
    return html;
  }
  function weekDashSrc() {
    if (currentWeekCacheOk(cacheWeek)) return cacheWeek;
    if (currentWeekCacheOk(lastData)) return lastData;
    return lastData;
  }
  function mergeLocDays(loc, hlDays, fallbackName) {
    loc = loc || { name: fallbackName, days: [], hourly: {} };
    if ((loc.days || []).length >= 7) return loc;
    if (!hlDays || !hlDays.length) return loc;
    var by = {};
    (loc.days || []).forEach(function (d) { if (d && d.date) by[d.date] = d; });
    hlDays.forEach(function (d) { if (d && d.date && !by[d.date]) by[d.date] = d; });
    var keys = Object.keys(by).sort();
    return {
      name: loc.name || fallbackName,
      days: keys.map(function (k) { return by[k]; }),
      hourly: loc.hourly || {}
    };
  }
  function weekHeadWxSrc(parent) {
    var next = isNextWeekHead(parent);
    var src = weekDashSrc();
    var locs = (src && src.weather && src.weather.locations) || [];
    var aoba = locForWxRow(locs, 0);
    var saga = locForWxRow(locs, 1);
    var b = homeBriefing || (lastData && lastData.briefing) || {};
    var hl = ((next ? b.nextWeekHeadline : b.weekHeadline) || {}).weather || {};
    aoba = mergeLocDays(aoba, hl.aoba, "横浜市青葉区");
    saga = mergeLocDays(saga, hl.sagamihara, "相模原市");
    var days = headWeekDays(parent);
    return { aoba: aoba, saga: saga, days: days };
  }
  function locDayWx(loc, iso) {
    var w = null;
    var key = dayKey(iso);
    ((loc && loc.days) || []).forEach(function (d) {
      if (d && dayKey(d.date) === key) w = d;
    });
    return w;
  }
  function hourBarRowHtml(loc, iso, lab) {
    var hourly = locHourly(loc, iso);
    var daySlots = dayHourSlots(hourly);
    if (daySlots.length < 8) {
      var w = locDayWx(loc, iso);
      var cls = "wh-wx-h daily";
      var labTxt = "日次";
      if (!w) {
        cls += " nodata";
        labTxt = "";
      } else {
        var rv = rainVisual(w);
        if (rv.kind === "light") cls += " rain-light";
        else if (rv.kind === "mid") cls += " rain-mid";
        else if (rv.kind === "heavy") cls += " rain-heavy";
        else cls += " sky";
        if (rv.tag) labTxt = rv.tag;
      }
      return '<div class="wh-wx-bar-row">' +
        (lab ? '<div class="wh-wx-bar-lab">' + esc(lab) + "</div>" : "") +
        '<div class="wh-wx-hcells"><div class="' + cls + '">' + esc(labTxt) + "</div></div></div>";
    }
    var byH = {};
    binHourly(hourly, 1).forEach(function (s) { byH[s.h] = s; });
    var cells = "";
    var h;
    for (h = WX_H0; h <= WX_H1; h++) {
      var s = byH[h];
      var cls = "wh-wx-h sky";
      if (s) {
        var k = rainKind(s.rainMm, s.rainProb);
        if (k === "light") cls = "wh-wx-h rain-light";
        else if (k === "mid") cls = "wh-wx-h rain-mid";
        else if (k === "heavy") cls = "wh-wx-h rain-heavy";
      }
      cells += '<div class="' + cls + '"></div>';
    }
    return '<div class="wh-wx-bar-row">' +
      (lab ? '<div class="wh-wx-bar-lab">' + esc(lab) + "</div>" : "") +
      '<div class="wh-wx-hcells">' + cells + "</div></div>";
  }
  function hourScaleRowHtml(withLab) {
    var cells = "";
    var h;
    for (h = WX_H0; h <= WX_H1; h++) {
      cells += '<div class="wh-wx-hh">' + (h % 2 === 0 ? h : "") + "</div>";
    }
    return '<div class="wh-wx-bar-row wh-wx-bar-hours">' +
      (withLab ? '<div class="wh-wx-bar-lab">時</div>' : "") +
      '<div class="wh-wx-hcells">' + cells + "</div></div>";
  }
  function whWxDayCardHtml(wx, iso, withLabs) {
    var today = todayStr();
    var aoba = wx.aoba;
    var saga = wx.saga;
    var aobaBy = {};
    var sagaBy = {};
    ((aoba && aoba.days) || []).forEach(function (d) { aobaBy[d.date] = d; });
    ((saga && saga.days) || []).forEach(function (d) { sagaBy[d.date] = d; });
    var wA = aobaBy[iso] || { date: iso };
    var wS = sagaBy[iso] || { date: iso };
    var hourlyA = locHourly(aoba, iso);
    var hourlyS = locHourly(saga, iso);
    var kind = worseRainKind(rainKindForDay(wA, hourlyA), rainKindForDay(wS, hourlyS));
    var ico = kind === "heavy" ? "heavy" : (kind === "mid" ? "mid" : (kind === "light" ? "light" : rainVisual(wA.tmax != null ? wA : wS, hourlyA.length ? hourlyA : hourlyS).ico));
    var w = wA.tmax != null ? wA : wS;
    var d = parseLocalDate(iso);
    var dow = d ? WD[d.getDay()] : "";
    var di = d ? d.getDay() : -1;
    var dayCls = di === 6 ? " is-sat" : (di === 0 ? " is-sun" : "");
    var rainCls = kind === "light" ? " rain-light" : (kind === "mid" ? " rain-mid" : (kind === "heavy" ? " rain-heavy" : ""));
    return '<div class="wh-wx-day' + dayCls + (iso === today ? " is-today" : "") + '">' +
      '<div class="wh-wx-head' + rainCls + '">' +
      '<div class="wh-wx-dow">' + esc(dow) + "</div>" +
      wxIcoHtml(ico, 32) +
      '<div class="wh-wx-t">' + (w.tmax != null ? w.tmax + "°" : "") +
        (w.tmin != null ? "<span> / " + w.tmin + "°</span>" : "") + "</div>" +
      "</div>" +
      '<div class="wh-wx-split"></div>' +
      '<div class="wh-wx-bars">' +
        (withLabs && dayHourSlots(hourlyA).length >= 8 && dayHourSlots(hourlyS).length >= 8 ? hourScaleRowHtml(true) : "") +
        hourBarRowHtml(aoba, iso, withLabs ? "藤が丘" : "") +
        hourBarRowHtml(saga, iso, withLabs ? "麻溝台" : "") +
      "</div></div>";
  }
  function whWxDaysHtml(wx) {
    return '<div class="wh-wx-days">' + (wx.days || []).map(function (iso) {
      return whWxDayCardHtml(wx, iso, false);
    }).join("") + "</div>";
  }
  function hourGraphRowHtml(loc, iso) {
    var byH = {};
    binHourly(locHourly(loc, iso), 1).forEach(function (s) { byH[s.h] = s; });
    var yLabs = "";
    var yLines = "";
    var mmY;
    for (mmY = 1; mmY <= BRIEF_RAIN_MAX_MM; mmY++) {
      var bot = Math.round((mmY / BRIEF_RAIN_MAX_MM) * 100);
      yLabs += '<span class="bw-yl" style="bottom:' + bot + '%">' + mmY + "</span>";
      yLines += '<i class="bw-gl" style="bottom:' + bot + '%"></i>';
    }
    var cells = "";
    var ticks = "";
    var h;
    for (h = WX_H0; h <= WX_H1; h++) {
      var s = byH[h];
      var mm = s ? Number(s.rainMm) || 0 : 0;
      var k = rainKind(mm, s && s.rainProb);
      var cls = "bw-h sky";
      if (k === "light") cls = "bw-h rain-light";
      else if (k === "mid") cls = "bw-h rain-mid";
      else if (k === "heavy") cls = "bw-h rain-heavy";
      var pct = k === "none" ? 0 : Math.min(100, Math.round((mm / BRIEF_RAIN_MAX_MM) * 100));
      var nLab = "";
      if ((k === "mid" || k === "heavy") && mm >= 1) {
        nLab = '<div class="bw-mm' + (pct >= 85 ? " in" : "") + '">' + Math.floor(mm) + "</div>";
      }
      var fill = pct > 0
        ? '<div class="bw-fill" style="height:' + pct + '%">' + nLab + "</div>"
        : "";
      cells += '<div class="' + cls + '"><div class="bw-col">' + fill + "</div></div>";
      ticks += '<div class="bw-tick">' + (isPhone() ? ((h % 2 === 0) ? String(h) : "") : String(h)) + "</div>";
    }
    return '<div class="brief-wx-graph">' +
      '<div class="bw-y">' + yLabs + "</div>" +
      '<div class="bw-plot">' +
        '<div class="bw-grid">' + yLines + "</div>" +
        '<div class="bw-hours">' + cells + "</div>" +
      "</div>" +
      '<div class="bw-x">' + ticks + "</div>" +
    "</div>";
  }
  function briefWxDeltaHtml(n) {
    if (n == null || n === "" || isNaN(Number(n))) return "";
    var v = Math.round(Number(n));
    var cls = v > 0 ? " up" : (v < 0 ? " dn" : "");
    var txt = v > 0 ? "(+" + v + ")" : (v < 0 ? "(" + v + ")" : "(±0)");
    return '<span class="brief-wx-d' + cls + '">' + txt + "</span>";
  }
  function briefWxLocHtml(name, which, loc, iso) {
    var pack = locTempPack(which, iso);
    var w = pickWxDay((loc && loc.days) || [], iso) || { date: iso };
    var rv = rainVisual(w, locHourly(loc, iso));
    var hi = (pack && pack.tmax != null)
      ? '<span class="brief-wx-deg">' + pack.tmax + "°" + briefWxDeltaHtml(pack.dtmax) + "</span>"
      : "";
    var lo = (pack && pack.tmin != null)
      ? '<span class="brief-wx-deg is-lo">' + pack.tmin + "°" + briefWxDeltaHtml(pack.dtmin) + "</span>"
      : "";
    var temps = hi + (hi && lo ? '<span class="brief-wx-sep"> / </span>' : "") + lo;
    return '<div class="brief-wx-loc">' +
      '<div class="brief-wx-loc-head">' +
        '<div class="brief-wx-loc-name">' + esc(name) + "</div>" +
        wxIcoHtml(rv.ico, 44) +
        '<div class="brief-wx-loc-t">' + temps + "</div>" +
      "</div>" +
      hourGraphRowHtml(loc, iso) +
    "</div>";
  }
  function briefWxPanelHtml(iso) {
    var wx = weekHeadWxSrc();
    return '<div class="brief-wx-stack">' +
      briefWxLocHtml("藤が丘", "aoba", wx.aoba, iso) +
      briefWxLocHtml("麻溝台", "sagamihara", wx.saga, iso) +
    "</div>";
  }
  function holidaySet(parent) {
    var s = {};
    function add(list) {
      (list || []).forEach(function (x) {
        var k = dayKey(x);
        if (k) s[k] = 1;
      });
    }
    var src = weekDashSrc() || {};
    var b = homeBriefing || (lastData && lastData.briefing) || {};
    add(src.holiday_isos);
    add(b.nextHolidayIsos);
    return s;
  }
  function isRenkyuOffDay(iso, hol) {
    var d = parseLocalDate(iso);
    if (!d) return false;
    var di = d.getDay();
    if (di === 0 || di === 6) return true;
    if (hol[dayKey(iso)]) return true;
    return !!(hol[dayKey(addDaysIso(iso, -1))] && hol[dayKey(addDaysIso(iso, 1))]);
  }
  function weekendMatchDays(parent) {
    var days = headWeekDays(parent);
    var sat = days[5];
    var sun = days[6];
    if (!sat || !sun) return [sat, sun].filter(Boolean);
    var hol = holidaySet(parent);
    var weekMon = days[0];
    var nextSat = addDaysIso(sun, 6);
    var start = sat;
    while (true) {
      var prev = addDaysIso(start, -1);
      if (!prev || prev < weekMon) break;
      var pd = parseLocalDate(prev);
      if (!pd) break;
      if (pd.getDay() === 0 || pd.getDay() === 6) break;
      if (!isRenkyuOffDay(prev, hol)) break;
      start = prev;
    }
    var out = [];
    var cur = start;
    while (cur && cur < nextSat) {
      if (!isRenkyuOffDay(cur, hol)) break;
      out.push(cur);
      cur = addDaysIso(cur, 1);
    }
    if (out.indexOf(sat) < 0) out.push(sat);
    if (out.indexOf(sun) < 0) out.push(sun);
    out.sort();
    return out;
  }
  function isRenkyuWeekend(parent) {
    return weekendMatchDays(parent).length > 2;
  }
  function weekendSliceKey(iso) {
    var d = parseLocalDate(iso);
    if (!d) return "";
    var di = d.getDay();
    if (di === 6) return "sat";
    if (di === 0) return "sun";
    if (di === 5) return "fri";
    if (di === 1) return "mon";
    if (di === 2) return "tue";
    if (di === 3) return "wed";
    if (di === 4) return "thu";
    return "";
  }
  function isWeekendPhoneSlice(s) {
    return s === "sat" || s === "sun" || s === "fri" || s === "mon" || s === "tue" || s === "wed" || s === "thu" || s === "match";
  }
  function weekendIsoForSlice(slice, parent) {
    var want = slice === "match" ? "" : slice;
    var found = "";
    weekendMatchDays(parent).forEach(function (iso) {
      var k = weekendSliceKey(iso);
      if (found) return;
      if (!want || k === want) found = iso;
    });
    return found;
  }
  function weekendEventsForIso(iso, parent) {
    return regaliaWeekendEvents(parent).filter(function (ev) {
      return eventIso(ev) === iso;
    });
  }
  function filterWeekdayU13Activity(h, parent) {
    var end = {};
    weekendMatchDays(parent).forEach(function (iso) { end[iso] = 1; });
    h.u13Activity = (h.u13Activity || []).filter(function (e) {
      return !end[eventIso(e)];
    });
    var extra = (h.u13Match || []).filter(function (e) {
      return !end[eventIso(e)] && !isMarinosEv(e);
    });
    if (extra.length) {
      h.u13Activity = h.u13Activity.concat(extra);
      h.u13Match = (h.u13Match || []).filter(function (e) {
        return !!(end[eventIso(e)] || isMarinosEv(e));
      });
    }
    return h;
  }
  function eventStartKey(ev) {
    var t = String((ev && (briefKick(ev) || briefHm(ev) || ev.time || ev.event_time)) || "");
    var m = t.match(/(\d{1,2}):(\d{2})/);
    if (m) return ("0" + m[1]).slice(-2) + ":" + m[2];
    return t;
  }
  function eventSpeakKey(ev) {
    if (ev && ev.groupEvents && ev.groupEvents.length) {
      return ev.groupEvents.map(eventSpeakKey).join("+");
    }
    return [eventIso(ev), canonicalKind(ev.kind), String((ev && ev.title) || ""), eventStartKey(ev)].join("|");
  }
  function matchCatKeys(ev) {
    var f = categoryFlags((ev && (ev.category || ev.category_code)) || "");
    var keys = [];
    if (f.hasU13 || f.isAll || f.hasGk) keys.push("u13");
    if (f.hasU14 || f.isAll) keys.push("u14");
    if (f.hasU15 || f.isAll) keys.push("u15");
    return keys;
  }
  function regaliaMatchEvents() {
    var src = cacheWeek || lastData;
    return activeEvents(src && src.events).filter(function (e) {
      return canonicalKind(e.kind || e.event_kind) === "match";
    }).map(function (e) {
      var row = asHeadLine(e);
      fillMatchSpeakFields(row);
      row.category = e.category || e.category_code;
      row.category_code = e.category_code || e.category;
      return row;
    });
  }
  function catMatchList(rows, iso, cat) {
    return (rows || []).filter(function (ev) {
      return eventIso(ev) === iso && matchCatKeys(ev).indexOf(cat) >= 0;
    }).slice().sort(function (a, b) {
      return eventStartKey(a).localeCompare(eventStartKey(b));
    });
  }
  function isWeekendBoardKind(e) {
    var k = canonicalKind(e && (e.kind || e.event_kind));
    return k === "match" || k === "TR" || k === "合宿";
  }
  function weekendEventPool(parent) {
    var src = cacheWeek || lastData;
    var b = homeBriefing || (lastData && lastData.briefing) || {};
    var seen = {};
    var out = [];
    function add(list) {
      activeEvents(list).forEach(function (e) {
        var id = String(e.id || e.event_id || "") + "|" + eventIso(e) + "|" + String(e.title || "");
        if (seen[id]) return;
        seen[id] = 1;
        out.push(e);
      });
    }
    add(src && src.events);
    add(b.nextWeekEvents);
    return out;
  }
  function regaliaWeekendEvents(parent) {
    var daySet = {};
    weekendMatchDays(parent).forEach(function (iso) { daySet[iso] = 1; });
    return weekendEventPool(parent).filter(function (e) {
      if (!daySet[eventIso(e)]) return false;
      if (isMarinosEv(e)) return false;
      return isWeekendBoardKind(e);
    }).map(function (e) {
      var row = asHeadLine(e);
      fillMatchSpeakFields(row);
      row.category = e.category || e.category_code;
      row.category_code = e.category_code || e.category;
      return row;
    });
  }
  function matchCatSpeakLabel(ev) {
    var names = { u13: "U13", u14: "U14", u15: "U15" };
    return matchCatKeys(ev).map(function (k) { return names[k]; }).filter(Boolean).join("、");
  }
  function isFutsalLeagueEv(ev) {
    if (canonicalKind(ev && (ev.kind || ev.event_kind)) !== "match") return false;
    var s = [eventLeague(ev), ev.title, matchCardText(ev)].join(" ");
    return /フットサル/.test(s) || /U\d+FL\b/i.test(s);
  }
  function uniqueNonempty(values) {
    var seen = {};
    var out = [];
    (values || []).forEach(function (x) {
      x = String(x || "").trim();
      if (!x || seen[x]) return;
      seen[x] = 1;
      out.push(x);
    });
    return out;
  }
  function sharedLeagueLabel(rows) {
    var labels = uniqueNonempty((rows || []).map(function (ev) {
      return leagueLabel(ev) || eventLeague(ev);
    }));
    if (!labels.length) return "フットサルリーグ";
    if (labels.length === 1) return labels[0];
    var prefix = labels[0];
    labels.forEach(function (x) {
      var n = 0;
      while (n < prefix.length && n < x.length && prefix.charAt(n) === x.charAt(n)) n++;
      prefix = prefix.slice(0, n);
    });
    prefix = prefix.replace(/[\s・/／\-–—0-9０-９部AB]+$/g, "").trim();
    if (/フットサル|FL/i.test(prefix)) return prefix;
    return labels.join(" / ");
  }
  function mergeFutsalGroup(rows) {
    var first = rows[0];
    var vs = uniqueNonempty(rows.map(matchOpponentName)).join(" / ");
    var venue = uniqueNonempty(rows.map(matchVenueName)).join(" / ");
    var spans = uniqueNonempty(rows.map(function (ev) { return briefEventSpan(ev); }));
    return {
      kind: first.kind || "match",
      kindLabel: first.kindLabel,
      date: first.date || eventIso(first),
      event_date: eventIso(first),
      title: "",
      league_or_competition: sharedLeagueLabel(rows),
      card: vs,
      opponent: vs,
      venue: venue,
      location: venue,
      time: first.time || first.event_time,
      event_time: first.event_time || first.time,
      category: first.category,
      category_code: first.category_code,
      groupEvents: rows,
      displaySpan: spans.join(" / ")
    };
  }
  function collapseFutsalMatchCards(rows) {
    var list = (rows || []).slice();
    var futsal = list.filter(isFutsalLeagueEv);
    if (futsal.length < 2) return list;
    var placed = false;
    var out = [];
    list.forEach(function (ev) {
      if (!isFutsalLeagueEv(ev)) {
        out.push(ev);
        return;
      }
      if (!placed) {
        out.push(mergeFutsalGroup(futsal));
        placed = true;
      }
    });
    return out;
  }
  function rmCatHtml(label, rows) {
    return '<div class="rm-cat"><div class="rm-cat-h">' + esc(label) + '</div><div class="wh-list">' +
      weekChipList(collapseFutsalMatchCards(rows), false, true) + "</div></div>";
  }
  function regaliaMatchBoardHtml(marinosRows) {
    var rows = regaliaWeekendEvents();
    var days = weekendMatchDays();
    var hol = holidaySet();
    // 連休（3日以上）表示ではマリノス戦の専用枠を出さない代わりに、開催日のU13枠へ
    // 差し込む（ユーザー指示、2026-09-16）。カード色はマリノス戦カード共通の
    // k-marinos（青）がkindChipClass経由で自動的に付く。
    var renkyu = isRenkyuWeekend();
    var cols = days.map(function (iso) {
      var d = parseLocalDate(iso);
      var di = d ? d.getDay() : -1;
      var dow = d ? WD[di] : "";
      var dom = d ? (d.getMonth() + 1) + "/" + d.getDate() : "";
      var cls = di === 6 ? " is-sat" : (di === 0 || hol[iso] ? " is-sun is-hol" : "");
      var u13Rows = catMatchList(rows, iso, "u13");
      if (renkyu && marinosRows && marinosRows.length) {
        var dayMarinos = marinosRows.filter(function (ev) { return eventIso(ev) === iso; });
        if (dayMarinos.length) {
          u13Rows = u13Rows.concat(dayMarinos).sort(function (a, b) {
            return eventStartKey(a).localeCompare(eventStartKey(b));
          });
        }
      }
      return '<div class="rm-day">' +
        '<div class="rm-dow' + cls + '">' + esc(dow) +
          (dom ? '<span class="rm-dom">' + esc(dom) + "</span>" : "") +
        "</div>" +
        rmCatHtml("U13", u13Rows) +
        rmCatHtml("U14", catMatchList(rows, iso, "u14")) +
        rmCatHtml("U15", catMatchList(rows, iso, "u15")) +
        "</div>";
    }).join("");
    var n = days.length;
    var compact = n >= 4 ? " rm-compact" : "";
    return '<div class="rm-days' + compact + '" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' + cols + "</div>";
  }
  function phoneHeadListHtml(rows) {
    if (!rows || !rows.length) {
      return '<div class="brief-empty-ico">' + uiIco("cal") + '<div class="st-cap">なし</div></div>';
    }
    return '<div class="phone-match-list">' + rows.map(function (ev) {
      var iso = eventIso(ev) || ev.date;
      var d = parseLocalDate(iso);
      var di = d ? d.getDay() : -1;
      var dow = d ? WD[di] : "";
      var kind = ev.kindLabel || kindLabel(ev.kind);
      var title = String(ev.title || "").trim();
      if (title && title === kind) title = "";
      var time = briefEventSpan(ev);
      return '<div class="phone-match-card phone-head-row ' + kindChipClass(ev.kind, ev) + (eventIsPast(ev) ? " is-past" : "") + '">' +
        rainBadgeHtml(ev) +
        '<div class="phone-match-top">' +
          (dow ? '<span class="dow' + (di === 6 ? " is-sat" : di === 0 ? " is-sun" : "") + '">' + esc(dow) + "</span>" : "") +
          '<span class="kind">' + esc(title || kind) + "</span>" +
          (time ? '<span class="t">' + esc(time) + "</span>" : "") +
        "</div></div>";
    }).join("") + "</div>";
  }
  function phoneWeekendMiniHtml(ev, hideDow) {
    var d = parseLocalDate(eventIso(ev));
    var di = d ? d.getDay() : -1;
    var dow = d ? WD[di] : "";
    var vs = matchOpponentName(ev);
    var venue = matchVenueName(ev);
    var time = ev.displaySpan || briefEventSpan(ev);
    var k = canonicalKind(ev.kind);
    var kind = k === "match" ? "試合" : (k === "合宿" ? "合宿" : "TR");
    var league = leagueLabel(ev);
    return '<div class="phone-wk-mini' + (eventIsPast(ev) ? " is-past" : "") + '">' +
      rainBadgeHtml(ev) +
      '<div class="phone-wk-mini-top">' +
        (!hideDow && dow ? '<span class="dow' + (di === 6 ? " is-sat" : di === 0 ? " is-sun" : "") + '">' + esc(dow) + "</span>" : "") +
        '<span class="kind">' + esc(kind) + "</span>" +
        (time ? '<span class="t">' + esc(time) + "</span>" : "") +
      "</div>" +
      (league ? '<div class="league">' + esc(league) + "</div>" : "") +
      (vs ? '<div class="vs">vs ' + esc(vs) + "</div>" : "") +
      (venue ? '<div class="venue">' + esc(venue) + "</div>" : "") +
      "</div>";
  }
  function phoneWeekendCatBoardHtml(onlyIso, parent) {
    var rows = onlyIso ? weekendEventsForIso(onlyIso, parent) : regaliaWeekendEvents(parent);
    var days = onlyIso ? [onlyIso] : weekendMatchDays(parent);
    var cats = [
      { key: "u13", label: "U13" },
      { key: "u14", label: "U14" },
      { key: "u15", label: "U15" }
    ];
    var single = !!onlyIso;
    return '<div class="phone-wk-cats">' + cats.map(function (cat) {
      var items = [];
      days.forEach(function (iso) {
        collapseFutsalMatchCards(catMatchList(rows, iso, cat.key)).forEach(function (ev) { items.push(ev); });
      });
      return '<div class="phone-wk-cat">' +
        '<div class="phone-wk-cat-h">' + esc(cat.label) + "</div>" +
        '<div class="phone-wk-cat-list">' +
          (items.length ? items.map(function (ev) {
            return phoneWeekendMiniHtml(ev, single);
          }).join("") : '<div class="st-cap">なし</div>') +
        "</div></div>";
    }).join("") + "</div>";
  }
  function marinosBarHtml(rows) {
    return '<div class="wh-sec wh-marinos"><div class="wh-h">マリノス戦</div><div class="wh-list">' +
      weekChipList(rows) + "</div></div>";
  }
  function renderWeekHeadline() {
    var el = $("week-head-board");
    if (!el) return;
    var h = weekHeadData(pageKey);
    var wx = weekHeadWxSrc(pageKey);
    var w = weekHeadWord(pageKey);
    if (isPhone()) {
      var body = "";
      if (phoneSlice === "juku") {
        body = '<div class="wh-sec"><div class="wh-list by-day">' + weekChipList(h.juku, true) + "</div></div>";
      } else if (phoneSlice === "u13") {
        var u13h = (pageKey === "nextWeekHead" ? "来週の" : "") + "U13平日の活動";
        body = '<div class="wh-sec"><div class="wh-h">' + u13h + '</div><div class="wh-list">' + weekChipList(h.u13Activity) + "</div></div>";
      } else if (isWeekendPhoneSlice(phoneSlice)) {
        body = '<div class="wh-sec wh-matches">' + phoneWeekendCatBoardHtml(weekendIsoForSlice(phoneSlice, pageKey), pageKey) + "</div>";
      } else if (phoneSlice === "miscMarinos") {
        body = '<div class="phone-other">' +
          '<div class="wh-sec"><div class="wh-h">単発・私用</div><div class="wh-list">' + weekChipList(h.misc) + "</div></div>" +
          marinosBarHtml(h.marinos) +
          "</div>";
      } else {
        body = '<div class="wh-sec wh-wx"><div class="wh-h">' + w + 'の週間天気予報</div>' + whWxDaysHtml(wx) + "</div>";
      }
      el.innerHTML = '<div class="wh-grid' + (isRenkyuWeekend(pageKey) ? " wh-grid-renkyu" : "") + '">' + body + "</div>";
    } else {
      var renkyu = isRenkyuWeekend(pageKey);
      el.innerHTML = '<div class="wh-grid' + (renkyu ? " wh-grid-renkyu" : "") + '">' +
        '<div class="wh-stack">' +
          '<div class="wh-sec"><div class="wh-h">' + w + 'の塾予定</div><div class="wh-list by-day">' + weekChipList(h.juku, true) + "</div></div>" +
          '<div class="wh-sec"><div class="wh-h">U13平日の活動</div><div class="wh-list">' + weekChipList(h.u13Activity) + "</div></div>" +
        "</div>" +
        '<div class="wh-sec wh-matches"><div class="wh-h">REGALIA週末予定</div>' + regaliaMatchBoardHtml(h.marinos) + "</div>" +
        (renkyu ? "" : marinosBarHtml(h.marinos)) +
        '<div class="wh-sec wh-wx"><div class="wh-h">' + w + 'の週間天気予報</div>' +
          whWxDaysHtml(wx) +
        "</div></div>";
    }
    $("range-line").textContent = phoneRangeTitle() || (w + "のHL");
    weekPastStamp = weekEventsPastStamp();
  }
  function weekEventsPastStamp() {
    var h = weekHeadData();
    function flags(rows) {
      return (rows || []).map(function (ev) { return eventIsPast(ev) ? "1" : "0"; }).join("");
    }
    return [flags(h.juku), flags(h.u13Activity), flags(h.u13Match), flags(h.misc), flags(h.marinos)].join("|");
  }
  function lineMark(name) {
    var s = String(name || "");
    if (/田園/.test(s)) return { hue: "dt", code: "DT", cap: "田都", speak: "でんえんとしせん" };
    if (/横浜/.test(s)) return { hue: "yh", code: "JH", cap: "横浜", speak: "横浜線" };
    if (/小田急/.test(s)) return { hue: "od", code: "OH", cap: "小田急", speak: "小田急" };
    return { hue: "dt", code: "—", cap: s.slice(0, 4), speak: s.slice(0, 4) };
  }
  function transitWorst() {
    var t = homeTransit || (lastData && lastData.transit);
    var lines = (t && t.lines) || [];
    var worst = "ok";
    var i;
    for (i = 0; i < lines.length; i++) {
      var st = lines[i] && lines[i].status;
      if (st === "stop") worst = "stop";
      else if (st && st !== "normal" && worst !== "stop") worst = "delay";
    }
    return worst;
  }
  function briefRangeLine() {
    var w = transitWorst();
    var title = pageKey === "tomo" ? "明日のHL" : "今日のHL";
    if (pageKey === "tomo") {
      var iso = addDaysIso(todayStr(), 1);
      var d = parseLocalDate(iso);
      var wd = d ? WD[d.getDay()] : "";
      title = "明日のHL　" + fmtMd(iso) + (wd ? "（" + wd + "）" : "");
    }
    if (w === "stop") return title + "　運行停止あり";
    if (w === "delay") return title + "　運行遅れあり";
    return title;
  }
  function cleanTransitSummary(s) {
    var t = String(s || "");
    t = t.replace(/https?:\/\/[^\s　]*/gi, " ");
    t = t.replace(/\bwww\.[^\s　]*/gi, " ");
    t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, " ");
    t = t.replace(/0\d{1,4}[-−ー－(（]?\d{1,4}[-−ー－)）]?\d{3,4}/g, " ");
    t = t.replace(/(お問い合わせ|お問合せ|詳しくは|ホームページ|専用ダイヤル|お客さまセンター|お客様センター)[\s\S]*$/g, " ");
    t = t.replace(/[^。]*アドレス[^。]*。?/g, " ");
    t = t.replace(/\s+/g, " ").trim();
    return t;
  }
  function transitColsHtml(compact) {
    var t = homeTransit || (lastData && lastData.transit);
    var lines = (t && t.lines) || [];
    if (!lines.length) {
      return compact ? '<div class="brief-transit empty">' + uiIco("train") + "</div>" : "";
    }
    return '<div class="tr-cols' + (compact ? " brief-transit" : "") + '">' + lines.map(function (ln) {
      var st = ln.status === "normal" ? "ok" : (ln.status === "stop" ? "stop" : "delay");
      var mark = lineMark(ln.name);
      var ico = st === "ok" ? "check" : (st === "stop" ? "stop" : "delay");
      var flag = st === "ok" ? "" : '<div class="tr-flag">' + (st === "stop" ? "停止" : "遅れ") + "</div>";
      var sum = cleanTransitSummary(ln.summary || ln.label || "");
      var noteMax = isPhone() ? 90 : (compact ? 40 : 72);
      var note = (st !== "ok" && sum && sum.indexOf("ありません") < 0)
        ? '<div class="tr-note">' + esc(sum.slice(0, noteMax)) + "</div>"
        : "";
      return '<div class="tr-col ' + mark.hue + " " + st + '">' +
        '<div class="mark"><span class="mark-code">' + esc(mark.code) + '</span><span class="mark-ja">' + esc(mark.cap) + "</span></div>" +
        '<div class="stat">' + uiIco(ico) + "</div>" +
        flag +
        '<div class="tr-cap">' + esc(mark.cap) + "</div>" +
        note +
        "</div>";
    }).join("") + "</div>";
  }
  function syncTransitAlert() {
    var w = transitWorst();
    var btn = $("btn-brief");
    if (btn) {
      btn.classList.remove("alert", "delay", "stop");
      if (w !== "ok") {
        btn.classList.add("alert");
        if (w === "stop") btn.classList.add("stop");
      }
    }
    var board = $("brief-board");
    if (board) {
      board.classList.remove("warn-delay", "warn-stop");
      if (w === "delay") board.classList.add("warn-delay");
      if (w === "stop") board.classList.add("warn-stop");
    }
  }
  function withKioskVeil(p, paint) {
    if (!kioskOn || isPhone()) {
      paint();
      if (kioskOn) onKioskPageReady(p);
      return;
    }
    var veil = $("kiosk-veil");
    if (!veil) {
      paint();
      onKioskPageReady(p);
      return;
    }
    if (fxBusy) return;
    fxBusy = true;
    var gen = ++fxGen;
    setTimeout(function () {
      if (gen === fxGen && fxBusy) fxBusy = false;
    }, 2500);
    var meta = kioskMeta(p);
    if ($("veil-title")) $("veil-title").textContent = meta.title;
    if ($("veil-sub")) $("veil-sub").textContent = meta.sub;
    veil.hidden = false;
    veil.className = "show";
    setTimeout(function () {
      if (gen !== fxGen || !kioskOn) {
        fxBusy = false;
        return;
      }
      paint();
      veil.className = "hide";
      setTimeout(function () {
        if (gen !== fxGen) return;
        veil.hidden = true;
        veil.className = "";
        fxBusy = false;
        onKioskPageReady(p);
      }, VEIL_OUT_MS);
    }, VEIL_HOLD_MS);
  }
  function weekCacheOk(c) {
    if (!c || !c.days || c.days.length < 7) return false;
    var off = parseInt(c.week_offset, 10) || 0;
    return c.days[0] === addDaysIso(mondayIso(todayStr()), off * 7);
  }
  function currentWeekCacheOk(c) {
    return weekCacheOk(c) && (parseInt(c.week_offset, 10) || 0) === 0;
  }
  function paintFromCache(cache, mode) {
    viewMode = mode;
    if (cache) {
      lastData = cache;
      apply._focused = true;
      apply(cache);
      return true;
    }
    return false;
  }
  function prefetchWeek() {
    if (currentWeekCacheOk(cacheWeek) || fetchLock || !window.SonyBridge || !SonyBridge.fetchDashboard) return;
    requestDashboard(0, function (err, data) {
      if (err || !data || data.error) return;
      if ((parseInt(data.week_offset, 10) || 0) === 0) {
        if (data.briefing) homeBriefing = data.briefing;
        if (data.transit) homeTransit = data.transit;
      }
      if (data.days && data.days.length >= 7) cacheWeek = data;
      if (isWeekHeadPage(pageKey)) renderWeekHeadline();
      if (isBriefPage(pageKey)) renderBriefing();
      if (isPhone()) refreshKioskQueue();
    });
  }
  function refreshKioskQueue() {
    rebuildPageLists();
    if (!isPhone()) {
      kioskQueue = PAGE_KEYS.slice();
      return;
    }
    var q = [];
    PAGE_KEYS.forEach(function (p) {
      q = q.concat(phoneSlicesFor(p));
    });
    kioskQueue = q.length ? q : PAGE_KEYS.slice();
  }
  function paintKioskPage(key) {
    selectPage(key);
  }
  function showKioskPage(key) {
    kioskKey = key;
    pageKey = parentPage(key);
    phoneSlice = sliceOf(key);
    kioskPage = Math.max(0, kioskQueue.indexOf(key));
    withKioskVeil(key, function () { paintKioskPage(key); });
  }
  function enterKiosk() {
    if (studyDebug()) return;
    if (kioskOn || kioskPaused) return;
    if (!lastData && !cacheFocus && !cacheWeek && !homeBriefing) {
      resetIdle();
      return;
    }
    kioskOn = true;
    eatKey = false;
    closeWxDetail();
    closeEvDetail();
    if ($("settings")) $("settings").hidden = true;
    focusDayOffset = 0;
    weekOffset = 0;
    if (lastData && lastData.briefing) homeBriefing = lastData.briefing;
    if (lastData && lastData.transit) homeTransit = lastData.transit;
    if (cacheFocus && cacheFocus.briefing) homeBriefing = cacheFocus.briefing;
    if (cacheFocus && cacheFocus.transit) homeTransit = cacheFocus.transit;
    refreshKioskQueue();
    if (kioskQueue.indexOf(kioskKey) < 0) {
      kioskKey = kioskQueue[0] || "focus";
      pageKey = parentPage(kioskKey);
      phoneSlice = sliceOf(kioskKey);
    }
    setPanelVisibility();
    syncFilterUi();
    prefetchWeek();
    clearKioskTimer();
    onKioskPageReady(kioskKey);
    appLog({ event: "kiosk_on", v: "0.3.114" });
  }
  window.DashPhoneStart = function () {
    phoneWantSpeak = true;
    if (kioskPaused) {
      resumeKioskCycle();
      return;
    }
    if (kioskOn) {
      onKioskPageReady(kioskKey);
      return;
    }
    enterKiosk();
  };
  function stopKiosk() {
    if (!kioskOn) return;
    hushSpeak = true;
    stopPageSpeak();
    kioskOn = false;
    fxGen += 1;
    fxBusy = false;
    var veil = $("kiosk-veil");
    if (veil) {
      veil.hidden = true;
      veil.className = "";
    }
    clearKioskTimer();
    selectPage(kioskKey);
    hushSpeak = false;
    try { localStorage.setItem("dashViewMode", viewMode === "week" ? "week" : "focus"); } catch (e) {}
    appLog({ event: "kiosk_off", page: pageKey });
    resetIdle();
  }

  function canSpeak() {
    return !!(window.SonyBridge && typeof SonyBridge.speak === "function");
  }
  function speakEnabled() {
    if (!canSpeak()) return false;
    try {
      var v = localStorage.getItem("dashSpeak");
      if (v === null || v === "") return !!window.PHONE_KIOSK || !window.PC_KIOSK;
      return v !== "0";
    } catch (e) {
      return !!window.PHONE_KIOSK || !window.PC_KIOSK;
    }
  }
  function settingsButtons() {
    var root = $("settings");
    if (!root) return [];
    return Array.prototype.filter.call(root.querySelectorAll("button"), function (b) {
      return !b.hidden;
    });
  }
  function syncSettingsFocus() {
    var btns = settingsButtons();
    if (!btns.length) return;
    if (settingsSel < 0) settingsSel = btns.length - 1;
    if (settingsSel >= btns.length) settingsSel = 0;
    var i;
    for (i = 0; i < btns.length; i++) {
      if (i === settingsSel) btns[i].classList.add("focus");
      else btns[i].classList.remove("focus");
    }
  }
  function showSettings(on) {
    var el = $("settings");
    if (!el) return;
    if (!on) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    syncSpeakBtn();
    syncPauseBtn();
    var btns = settingsButtons();
    var speak = $("btn-speak");
    settingsSel = 0;
    var i;
    if (speak && !speak.hidden) {
      for (i = 0; i < btns.length; i++) {
        if (btns[i] === speak) { settingsSel = i; break; }
      }
    }
    syncSettingsFocus();
  }
  function syncSpeakBtn() {
    var btn = $("btn-speak");
    if (!btn) return;
    if (!canSpeak()) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    var on = speakEnabled();
    btn.textContent = on ? "読み上げ ON" : "読み上げ OFF";
    if (on) btn.classList.add("on");
    else btn.classList.remove("on");
  }
  function clearKioskTimer() {
    clearTimeout(kioskTimer);
    clearInterval(kioskTimer);
    kioskTimer = null;
  }
  function syncPauseBtn() {
    var btn = $("btn-pause");
    if (!btn) return;
    btn.textContent = kioskPaused ? "巡回を再開" : "巡回を一時停止";
    if (kioskPaused) btn.classList.add("on");
    else btn.classList.remove("on");
  }
  function pauseKioskCycle() {
    kioskPaused = true;
    clearKioskTimer();
    stopPageSpeak();
    kioskAwaitSpeak = false;
    clearTimeout(idleTimer);
    syncBodyClass();
    syncPauseBtn();
    appLog({ event: "kiosk_pause" });
  }
  function resumeKioskCycle() {
    kioskPaused = false;
    syncPauseBtn();
    if (kioskOn) {
      syncBodyClass();
      onKioskPageReady(kioskKey);
    } else {
      syncBodyClass();
      enterKiosk();
    }
    appLog({ event: "kiosk_resume" });
  }
  function toggleKioskPause() {
    if (kioskPaused) resumeKioskCycle();
    else pauseKioskCycle();
  }
  function armKioskAdvance(ms) {
    if (kioskAwaitSpeak) return;
    clearKioskTimer();
    kioskTimer = setTimeout(function tick() {
      if (!kioskOn || kioskPaused || kioskAwaitSpeak) return;
      if (fxBusy) {
        kioskTimer = setTimeout(tick, 400);
        return;
      }
      refreshKioskQueue();
      var i = kioskQueue.indexOf(kioskKey);
      if (i < 0) i = 0;
      var next = kioskQueue[(i + 1) % kioskQueue.length];
      if (phoneSpeakRun && parentPage(kioskKey) !== parentPage(next)) {
        markHeadlineSpoken(phoneSpeakRun);
        phoneSpeakRun = "";
      }
      showKioskPage(next);
    }, ms);
  }
  function stopPageSpeak() {
    lastSpeakText = "";
    speakSeq += 1;
    speakChunks = [];
    speakChunkI = 0;
    kioskAwaitSpeak = false;
    if (window.SonyBridge && SonyBridge.stopSpeak) SonyBridge.stopSpeak();
  }
  function speakIdOf(chunkI) {
    return String(speakSeq) + "." + String(chunkI);
  }
  function splitSpeakChunks(text) {
    var max = SPEAK_CHUNK_MAX;
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return [];
    var parts = [];
    var i = 0;
    while (i < t.length) {
      if (t.length - i <= max) {
        parts.push(t.slice(i));
        break;
      }
      var slice = t.slice(i, i + max);
      var cut = -1;
      var marks = "。！？\n";
      var m;
      for (m = 0; m < marks.length; m++) {
        var p = slice.lastIndexOf(marks.charAt(m));
        if (p > cut) cut = p;
      }
      if (cut < Math.floor(max * 0.4)) {
        var p2 = slice.lastIndexOf("、");
        if (p2 > cut) cut = p2;
      }
      if (cut < 8) cut = max - 1;
      var piece = t.slice(i, i + cut + 1).replace(/^\s+|\s+$/g, "");
      if (piece) parts.push(piece);
      i += cut + 1;
      while (i < t.length && t.charAt(i) === " ") i++;
    }
    return parts;
  }
  function speakMinElapsedMs(chunk) {
    var n = String(chunk || "").length;
    if (n <= 8) return 0;
    return Math.min(6000, 250 + n * 60);
  }
  function finishSpeakPage() {
    speakChunks = [];
    if (!kioskOn || kioskPaused || !kioskAwaitSpeak) {
      kioskAwaitSpeak = false;
      return;
    }
    kioskAwaitSpeak = false;
    armKioskAdvance(SPEAK_HOLD_MS);
  }
  function armSpeakFailsafe(chunk) {
    var id = speakSeq;
    var idx = speakChunkI;
    var wait = speakFailsafeMs(chunk);
    clearKioskTimer();
    kioskTimer = setTimeout(function () {
      if (id !== speakSeq || idx !== speakChunkI) return;
      appLog({ event: "speak_failsafe", chunk: idx, n: String(chunk || "").length });
      speakChunkI += 1;
      if (speakChunkI < speakChunks.length) speakCurrentChunk();
      else finishSpeakPage();
    }, wait);
  }
  function speakCurrentChunk() {
    if (speakChunkI >= speakChunks.length) {
      finishSpeakPage();
      return;
    }
    var chunk = speakChunks[speakChunkI];
    speakChunkAt = Date.now();
    if (kioskOn && !kioskPaused) {
      kioskAwaitSpeak = true;
      armSpeakFailsafe(chunk);
    }
    appLog({ event: "speak_chunk", i: speakChunkI, n: chunk.length, id: speakIdOf(speakChunkI) });
    try {
      SonyBridge.speak(chunk, speakIdOf(speakChunkI));
    } catch (e) {
      appLog({ event: "speak_fail", msg: String(e && e.message || e) });
      speakChunkI += 1;
      if (speakChunkI < speakChunks.length) speakCurrentChunk();
      else finishSpeakPage();
    }
  }
  function speakIsPlaying() {
    try {
      return !!(window.speechSynthesis && window.speechSynthesis.speaking);
    } catch (e) {
      return false;
    }
  }
  function maybeSpeakPage(key) {
    var parent = parentPage(key);
    var next = "";
    if (parent === "study" || parent === "studyTodo") next = studySpeakText();
    else if (parent === "standings") next = standingsSpeakText();
    if (next && lastSpeakText === next && speakIsPlaying()) return;
    stopPageSpeak();
    trySpeakPage(key, false);
  }
  function speakHour() {
    return new Date().getHours();
  }
  function speakQuietHours() {
    var h = speakHour();
    return h >= 22 || h < 6;
  }
  function inMorningKioskSpeak() {
    var h = speakHour();
    return h >= 6 && h < 9;
  }
  function trySpeakPage(key, forKiosk) {
    if (hushSpeak) return false;
    if (!canSpeak() || !speakEnabled()) return false;
    if (speakQuietHours()) {
      appLog({ event: "speak_skip", page: key, reason: "quiet" });
      return false;
    }
    var parent = parentPage(key);
    var text = "";
    var slice = sliceOf(key);
    if (isPhone() && slice) text = phoneSliceSpeakText(parent, slice);
    else if (parent === "brief") text = briefSpeakText(false);
    else if (parent === "tomo") text = briefSpeakText(true);
    else if (isWeekHeadPage(parent)) text = weekHeadSpeakText(parent);
    else if (parent === "study" || parent === "studyTodo") text = studySpeakText();
    else if (parent === "standings") text = standingsSpeakText();
    if (forKiosk && headlineParent(parent)) {
      if (phoneSpeakRun !== parent && !shouldSpeakHeadlineKiosk(parent)) {
        appLog({ event: "speak_skip", page: key, reason: "hourly" });
        text = "";
      }
    }
    var body = String(text || "").replace(/\s+/g, " ").trim();
    if (!body) {
      appLog({ event: "speak_skip", page: key, reason: "empty" });
      return false;
    }
    text = body;
    speakSeq += 1;
    speakChunks = splitSpeakChunks(text);
    speakChunkI = 0;
    lastSpeakText = text;
    appLog({ event: "speak", page: key, n: text.length, chunks: speakChunks.length, text: text });
    if (forKiosk && headlineParent(parent) && body) phoneSpeakRun = parent;
    if (forKiosk) kioskAwaitSpeak = true;
    speakCurrentChunk();
    return true;
  }
  function speakFailsafeMs(text) {
    var len = String(text || "").length;
    var est = 4000 + len * 280;
    return Math.max(18000, Math.min(SPEAK_FAILSAFE_MS, est));
  }
  function speakAtStoreKey(page) {
    return "dashSpeakAt_" + page;
  }
  function readHeadlineSpokenAt(page) {
    try {
      var n = Number(localStorage.getItem(speakAtStoreKey(page)) || 0);
      return isFinite(n) ? n : 0;
    } catch (e) {
      return 0;
    }
  }
  function markHeadlineSpoken(page) {
    try { localStorage.setItem(speakAtStoreKey(page), String(Date.now())); } catch (e) {}
  }
  function shouldSpeakHeadlineKiosk(page) {
    page = parentPage(page);
    if (page === "tomo" && !afterSixPm()) return false;
    if (inMorningKioskSpeak() && (page === "brief" || isWeekHeadPage(page) || page === "study" || page === "studyTodo")) return true;
    var last = readHeadlineSpokenAt(page);
    if (!last) return true;
    return (Date.now() - last) >= BRIEF_SPEAK_MS;
  }
  function onKioskPageReady(key) {
    if (!kioskOn || kioskPaused) return;
    stopPageSpeak();
    if (trySpeakPage(key, true)) return;
    armKioskAdvance(PAGE_MS);
  }
  function speakClock(src) {
    var m = String(src || "").match(/([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/);
    if (!m) return "";
    var h = Number(m[1]);
    var min = Number(m[2]);
    if (min === 0) return h + "時";
    return h + "時" + min + "分";
  }
  function speakDeltaClause(n) {
    if (n == null || n === "" || isNaN(Number(n))) return "";
    var v = Math.round(Number(n));
    if (v === 0) return "、前日と同じ";
    if (v > 0) return "、前日より" + v + "度高い";
    return "、前日より" + Math.abs(v) + "度低い";
  }
  function speakTemp(pack, prefix) {
    if (!pack) return prefix;
    var s = prefix;
    if (pack.tmax != null) s += "最高気温は" + pack.tmax + "度" + speakDeltaClause(pack.dtmax) + "。";
    if (pack.tmin != null) s += "最低気温は" + pack.tmin + "度" + speakDeltaClause(pack.dtmin) + "。";
    return s;
  }
  function speakRainTag(tag) {
    if (tag === "弱雨") return "よわあめ";
    return tag || "";
  }
  function speakWxLoc(name, r, pack) {
    return speakTemp(pack, name + "は" + speakRainTag(rainLabel(r)) + "です。");
  }
  function rainKindWord(k) {
    if (k === "heavy") return "大雨";
    if (k === "mid") return "雨";
    if (k === "light") return "よわあめ";
    return "雨なし";
  }
  function hourPartLabel(h) {
    if (h < 10) return "朝";
    if (h < 12) return "午前";
    if (h < 15) return "昼";
    if (h < 18) return "午後";
    return "夕方";
  }
  function speakRainSpan(hours, kind) {
    var label = rainKindWord(kind);
    var hs = (hours || []).slice().sort(function (a, b) { return a - b; });
    if (!hs.length) return "";
    if (hs.length === 1) return hs[0] + "時に" + label + "です。";
    var parts = [];
    var seen = {};
    hs.forEach(function (h) {
      var p = hourPartLabel(h);
      if (!seen[p]) { seen[p] = 1; parts.push(p); }
    });
    if (hs.length >= 3 && parts.length === 1) return parts[0] + "は" + label + "です。";
    if (hs.length === 2 && hs[1] === hs[0] + 1) return hs[0] + "時から" + label + "です。";
    if (parts.length === 1) return parts[0] + "は" + label + "です。";
    if (parts.length === 2) return parts[0] + "から" + parts[1] + "は" + label + "です。";
    return hs[0] + "時ごろ" + label + "です。";
  }
  function speakRainHourly(loc, iso) {
    var byH = {};
    binHourly(locHourly(loc, iso), 1).forEach(function (s) { byH[s.h] = s; });
    var rows = [];
    var h;
    for (h = WX_H0; h <= WX_H1; h++) {
      var s = byH[h];
      var mm = s ? Number(s.rainMm) || 0 : 0;
      var k = rainKind(mm, s && s.rainProb);
      if (k !== "none") rows.push({ h: h, k: k, mm: mm });
    }
    if (!rows.length) return "雨なしです。";
    var rank = { light: 1, mid: 2, heavy: 3 };
    var peak = rows[0];
    rows.forEach(function (x) {
      if (rank[x.k] > rank[peak.k] || (x.k === peak.k && x.mm > peak.mm)) peak = x;
    });
    var peakHs = rows.filter(function (x) { return x.k === peak.k; }).map(function (x) { return x.h; });
    return speakRainSpan(peakHs, peak.k);
  }
  function speakWxBrief(name, which, iso) {
    var wx = weekHeadWxSrc();
    var loc = which === "sagamihara" ? wx.saga : wx.aoba;
    return speakTemp(locTempPack(which, iso), name + "は" + speakRainHourly(loc, iso));
  }
  function speakEventWx(ev) {
    var rv = eventSlotRain(ev);
    if (!rv || !rv.tag) return "";
    var rain = speakRainTag(rv.tag);
    if (rv.place) return rv.place + "は" + rain + "です。";
    return "天気は" + rain + "です。";
  }
  function speakSoccerEv(ev, dayWord) {
    var day = dayWord || "今日";
    var k = canonicalKind(ev.kind);
    var t = speakClock(briefKick(ev) || briefHm(ev));
    if (k === "match" || k === "マリノス戦") {
      var vs = matchOpponentName(ev);
      var s = day + (k === "マリノス戦" ? "はマリノス戦です。" : "は試合です。");
      if (vs) s += "対戦相手は" + vs + "です。";
      var venue = matchVenueName(ev);
      if (venue) s += "場所は" + venue + "です。";
      t = matchKickClock(ev);
      if (t) s += "キックオフは" + t + "です。";
      var leaveS = speakClock(briefHm(ev));
      if (leaveS && leaveS !== t) s += "出発は" + leaveS + "です。";
      return s + speakEventWx(ev);
    }
    if (k === "合宿") {
      var g = day + "は合宿です。";
      if (t) g += t + "からです。";
      if (String(ev.venue || "").trim()) g += "場所は" + String(ev.venue).trim() + "です。";
      return g + speakEventWx(ev);
    }
    var p = day + "は練習です。";
    if (t) p += t + "からです。";
    if (String(ev.venue || "").trim()) p += "場所は" + String(ev.venue).trim() + "です。";
    return p + speakEventWx(ev);
  }
  function speakMiscEv(ev, weekly, dayWord) {
    var k = canonicalKind(ev.kind);
    var label = k === "私用" ? "私用" : "単発";
    var title = String(ev.title || "").trim();
    if (title === label || title === "単発") title = "";
    var t = speakClock(briefKick(ev) || briefHm(ev));
    var venue = String(ev.venue || "").trim();
    var s = "";
    if (weekly) {
      var d = parseLocalDate(eventIso(ev));
      s = (d ? WD[d.getDay()] + "曜日、" : "") + label;
      if (title) s += "、" + title;
      if (t) s += "、" + t + "から";
      s += "。";
    } else {
      s = (dayWord || "今日") + "の" + label + "は";
      if (title) s += title;
      else s += "あります";
      if (t) s += "、" + t + "から";
      s += "。";
    }
    if (venue) s += "場所は" + venue + "です。";
    return s;
  }
  function speakWeekSlotEv(ev) {
    var d = parseLocalDate(eventIso(ev));
    var dow = d ? WD[d.getDay()] + "曜日" : "";
    var k = canonicalKind(ev.kind);
    var cat = matchCatSpeakLabel(ev);
    var kindWord = k === "match" ? "試合" : (k === "合宿" ? "合宿" : "練習");
    var s = dow + "、" + (cat ? cat : "") + kindWord + "です。";
    if (k === "match") {
      var vs = matchOpponentName(ev);
      var venue = matchVenueName(ev);
      s += speakLeagueText(ev);
      if (vs) s += "対戦相手は" + vs.replace(/\s*\/\s*/g, "と") + "です。";
      if (venue) s += "場所は" + venue.replace(/\s*\/\s*/g, "と") + "です。";
      if (ev.groupEvents && ev.groupEvents.length > 1) {
        var kicks = uniqueNonempty(ev.groupEvents.map(function (x) { return matchKickClock(x); }));
        if (kicks.length) s += "キックオフは" + kicks.join("と") + "です。";
        return s;
      }
      var t = matchKickClock(ev);
      if (t) s += "キックオフは" + t + "です。";
      return s;
    }
    var t2 = speakClock(briefKick(ev) || briefHm(ev));
    if (t2) s += t2 + "からです。";
    var venue2 = matchVenueName(ev) || String((ev && ev.venue) || "").trim();
    if (venue2) s += "場所は" + venue2 + "です。";
    return s;
  }
  function weekWeekendSpeakParts(onlyIso, parent) {
    var rows = upcomingOnly(regaliaWeekendEvents(parent));
    var days = weekendMatchDays(parent);
    if (onlyIso) days = days.filter(function (iso) { return iso === onlyIso; });
    var cats = ["u13", "u14", "u15"];
    var parts = [];
    var seen = {};
    days.forEach(function (iso) {
      cats.forEach(function (cat) {
        collapseFutsalMatchCards(catMatchList(rows, iso, cat)).forEach(function (ev) {
          var key = eventSpeakKey(ev);
          if (seen[key]) return;
          seen[key] = 1;
          parts.push(speakWeekSlotEv(ev));
        });
      });
    });
    return parts;
  }
  function weekWxSpeakParts(wx, today) {
    var parts = [];
    var locs = [
      { label: "藤が丘", loc: wx.aoba },
      { label: "麻溝台", loc: wx.saga }
    ];
    (wx.days || []).forEach(function (iso) {
      if (String(iso || "") < today) return;
      var d = parseLocalDate(iso);
      var dow = d ? WD[d.getDay()] + "曜日" : "";
      var locParts = [];
      locs.forEach(function (item) {
        var byDate = {};
        ((item.loc && item.loc.days) || []).forEach(function (x) { byDate[x.date] = x; });
        var w = byDate[iso] || { date: iso };
        var rv = rainVisual(w, locHourly(item.loc, iso));
        if (rv.kind !== "mid" && rv.kind !== "heavy") return;
        locParts.push(item.label + "は" + (rv.kind === "heavy" ? "大雨" : "雨") + "です。");
      });
      if (locParts.length) parts.push(dow + "。" + locParts.join(""));
    });
    return parts;
  }
  function speakWeekMarinos(ev) {
    var d = parseLocalDate(eventIso(ev));
    var dow = d ? WD[d.getDay()] + "曜日" : "";
    var vs = matchOpponentName(ev);
    var venue = matchVenueName(ev);
    var t = matchKickClock(ev);
    var s = dow + "、マリノス戦です。";
    s += speakLeagueText(ev);
    if (vs) s += "対戦相手は" + vs + "です。";
    if (venue) s += "場所は" + venue + "です。";
    if (t) s += "キックオフは" + t + "です。";
    return s;
  }
  function speakTransit() {
    var t = homeTransit || (lastData && lastData.transit);
    var lines = (t && t.lines) || [];
    if (!lines.length) return "";
    var delay = [];
    var stop = [];
    var i;
    for (i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var mark = lineMark(ln.name);
      var spoken = mark.speak || mark.cap;
      if (ln.status === "stop") stop.push(spoken);
      else if (ln.status && ln.status !== "normal") delay.push(spoken);
    }
    if (!delay.length && !stop.length) return "電車は平常運転です。";
    var s = "";
    if (stop.length) s += stop.join("、") + "は運転を見合わせています。";
    if (delay.length) s += delay.join("、") + "は遅れています。";
    return s;
  }
  function briefSpeakText(forTomo) {
    var iso = forTomo ? addDaysIso(todayStr(), 1) : todayStr();
    var dayWord = forTomo ? "明日" : "今日";
    var rows = upcomingOnly(briefDayEvents(iso));
    var juku = rows.filter(function (ev) { return canonicalKind(ev.kind) === "塾"; });
    var soccer = ownBeforeMarinos(rows.filter(isSoccerEv));
    var misc = rows.filter(isMiscEv);
    var parts = [];
    if (juku.length) {
      parts.push(dayWord + "の塾は、" + juku.map(function (ev) {
        var sub = jukuSubjectLabel(ev);
        var t = speakClock(briefKick(ev) || briefHm(ev));
        return sub + (t ? "、" + t + "から" : "");
      }).join("。") + "。");
    }
    if (soccer.length) parts.push(soccer.map(function (ev) { return speakSoccerEv(ev, dayWord); }).join(""));
    if (misc.length) parts.push(misc.map(function (ev) { return speakMiscEv(ev, false, dayWord); }).join(""));
    parts.push(speakWxBrief("藤が丘", "aoba", iso));
    parts.push(speakWxBrief("麻溝台", "sagamihara", iso));
    if (!forTomo) parts.push(speakTransit());
    return parts.join("");
  }
  function weekHeadSpeakText(parent) {
    var h = weekHeadData(parent);
    var wx = weekHeadWxSrc(parent);
    var today = todayStr();
    var parts = [];
    weekWeekendSpeakParts(null, parent).forEach(function (s) { parts.push(s); });
    if (!isRenkyuWeekend(parent)) {
      upcomingOnly(h.marinos || []).forEach(function (ev) { parts.push(speakWeekMarinos(ev)); });
    }
    upcomingOnly(h.misc || []).forEach(function (ev) { parts.push(speakMiscEv(ev, true)); });
    weekWxSpeakParts(wx, today).forEach(function (s) { parts.push(s); });
    var body = parts.join("");
    if (!body) return "";
    return (isNextWeekHead(parent) ? "来週。" : "") + body;
  }
  function phoneSliceSpeakText(parent, slice) {
    if (parent === "brief" || parent === "tomo") {
      var forTomo = parent === "tomo";
      var iso = forTomo ? addDaysIso(todayStr(), 1) : todayStr();
      var dayWord = forTomo ? "明日" : "今日";
      var rows = upcomingOnly(briefDayEvents(iso));
      if (slice === "juku") {
        var juku = rows.filter(function (ev) { return canonicalKind(ev.kind) === "塾"; });
        if (!juku.length) return "";
        return dayWord + "の塾は、" + juku.map(function (ev) {
          var sub = jukuSubjectLabel(ev);
          var t = speakClock(briefKick(ev) || briefHm(ev));
          return sub + (t ? "、" + t + "から" : "");
        }).join("。") + "。";
      }
      if (slice === "soccer") {
        return ownBeforeMarinos(rows.filter(isSoccerEv)).map(function (ev) { return speakSoccerEv(ev, dayWord); }).join("");
      }
      if (slice === "misc") {
        return rows.filter(isMiscEv).map(function (ev) { return speakMiscEv(ev, false, dayWord); }).join("");
      }
      if (slice === "wx") {
        return speakWxBrief("藤が丘", "aoba", iso) + speakWxBrief("麻溝台", "sagamihara", iso);
      }
      if (slice === "transit") return speakTransit();
      return "";
    }
    if (parent === "weekHead" || parent === "nextWeekHead") {
      var h = weekHeadData(parent);
      var wx = weekHeadWxSrc(parent);
      var today = todayStr();
      var parts = [];
      if (slice === "juku") {
        var jukuW = upcomingOnly(h.juku || []);
        if (jukuW.length) {
          parts.push(weekHeadWord(parent) + "の塾は、");
          jukuW.forEach(function (ev) {
            var d = parseLocalDate(eventIso(ev));
            var dow = d ? WD[d.getDay()] + "曜日" : "";
            var sub = jukuSubjectLabel(ev);
            var t = speakClock(briefKick(ev) || briefHm(ev));
            parts.push((dow ? dow + "、" : "") + sub + (t ? "、" + t + "から" : "") + "。");
          });
        }
      } else if (slice === "u13") {
        upcomingOnly(h.u13Activity || []).forEach(function (ev) {
          parts.push(speakWeekSlotEv(ev));
        });
      } else if (isWeekendPhoneSlice(slice)) {
        weekWeekendSpeakParts(weekendIsoForSlice(slice, parent), parent).forEach(function (s) { parts.push(s); });
      } else if (slice === "miscMarinos") {
        parts.push(weekHeadWord(parent) + "その他の予定です。");
        upcomingOnly(h.marinos || []).forEach(function (ev) { parts.push(speakWeekMarinos(ev)); });
        upcomingOnly(h.misc || []).forEach(function (ev) { parts.push(speakMiscEv(ev, true)); });
      } else if (slice === "wx") {
        weekWxSpeakParts(wx, today).forEach(function (s) { parts.push(s); });
      }
      var bodyW = parts.join("");
      if (!bodyW) return "";
      if (isNextWeekHead(parent) && slice !== "miscMarinos" && slice !== "juku") return "来週。" + bodyW;
      return bodyW;
    }
    if (parent === "study" || (parent === "studyTodo" && (slice === "today" || !slice))) return studySpeakText();
    return "";
  }
  window.DashSpeakStart = function (id) {
    if (String(id) !== speakIdOf(speakChunkI)) return;
    appLog({ event: "speak_start", id: String(id), chunk: speakChunkI });
  };
  window.DashSpeakDone = function (ok, id) {
    if (String(id) !== speakIdOf(speakChunkI)) return;
    if (!speakChunks.length) return;
    var chunk = speakChunks[speakChunkI] || "";
    var elapsed = Date.now() - speakChunkAt;
    var minMs = speakMinElapsedMs(chunk);
    if (ok && elapsed < minMs) {
      appLog({ event: "speak_done_too_fast", id: String(id), elapsed: elapsed, min: minMs, n: chunk.length });
      return;
    }
    appLog({ event: ok ? "speak_done" : "speak_err", id: String(id), elapsed: elapsed, n: chunk.length });
    speakChunkI += 1;
    if (speakChunkI < speakChunks.length) speakCurrentChunk();
    else finishSpeakPage();
  };

  function setViewMode(mode) {
    if (mode !== "focus" && mode !== "week") return;
    if (fetchLock) {
      toast("読み込み中です");
      return;
    }
    if (mode === "week") weekOffset = weekOffsetOf(focusDays()[0]);
    if (mode === "focus") focusDayOffset = 0;
    try { localStorage.setItem("dashViewMode", mode); } catch (e) {}
    selectPage(mode);
  }

  window.DashWeekColor = function (which) {
    if (consumeKioskKey()) return;
    noteInput(true);
    if (pageKey !== "focus" && pageKey !== "week") {
      pageKey = "focus";
      viewMode = "focus";
      setPanelVisibility();
      syncFilterUi();
    }
    if (fetchLock) {
      toast("読み込み中です");
      return;
    }
    if (viewMode === "focus") {
      if (which === "today" && focusDayOffset === 0 && lastData) {
        toast("今日と明日を表示中");
        return;
      }
      closeWxDetail();
      closeEvDetail();
      if (which === "prev") focusDayOffset -= 2;
      else if (which === "next") focusDayOffset += 2;
      else focusDayOffset = 0;
      uiMode = "event";
      apply._focused = false;
      $("range-line").textContent = "予定(2日)　読み込み中…";
      $("status").textContent = "読み込み中…";
      setWeekBusy(true, which);
      load();
      return;
    }
    if (which === "today" && weekOffset === 0 && lastData) {
      toast("今週を表示中");
      return;
    }
    closeWxDetail();
    closeEvDetail();
    if (which === "prev") weekOffset -= 1;
    else if (which === "next") weekOffset += 1;
    else weekOffset = 0;
    uiMode = "event";
    apply._focused = false;
    $("range-line").textContent = weekLabel(weekOffset) + "　読み込み中…";
    $("status").textContent = "読み込み中…";
    setWeekBusy(true, which);
    load();
  };
  window.DashWeek = function (delta) {
    window.DashWeekColor(delta < 0 ? "prev" : (delta > 0 ? "next" : "today"));
  };
  window.DashKey = function (dir) {
    if (consumeKioskKey()) return;
    noteInput(true);
    if (!$("settings").hidden) {
      if (dir === "up") { settingsSel -= 1; syncSettingsFocus(); }
      else if (dir === "down") { settingsSel += 1; syncSettingsFocus(); }
      else if (dir === "ok") {
        var btns = settingsButtons();
        if (btns[settingsSel]) btns[settingsSel].click();
      }
      return;
    }
    if (evDetailOpen) {
      if (dir === "ok") closeEvDetail();
      return;
    }
    var days = (lastData && lastData.days) || [];
    if (wxDetailDate) {
      if (dir === "left" || dir === "right") {
        wxCol = Math.max(0, Math.min(days.length - 1, wxCol + (dir === "right" ? 1 : -1)));
        tlCol = wxCol;
        openWxDetail(days[wxCol]);
      }
      return;
    }
    if (uiMode === "wx") {
      if (dir === "left") { wxCol = Math.max(0, wxCol - 1); tlCol = wxCol; }
      else if (dir === "right") { wxCol = Math.min(Math.max(0, days.length - 1), wxCol + 1); tlCol = wxCol; }
      else if (dir === "up") {
        if (wxRow > 0) wxRow = 0;
        else if (colEvents(wxCol).length) {
          uiMode = "event";
          tlCol = wxCol;
          tlIdx = colEvents(wxCol).length - 1;
          syncFilterUi();
        } else {
          uiMode = "filter";
          syncFilterUi();
        }
      } else if (dir === "down") wxRow = 1;
      else if (dir === "ok" && days[wxCol]) openWxDetail(days[wxCol]);
      syncCursor();
      return;
    }
    if (uiMode === "filter") {
      if (dir === "left") filterSel = Math.max(0, filterSel - 1);
      else if (dir === "right") filterSel = Math.min(filterSelMax(), filterSel + 1);
      if (dir === "left" || dir === "right") {
        syncFilterUi();
        syncCursor();
        return;
      }
      if (dir === "ok") {
        if (filterSel === 0) setShowAll(false);
        else if (filterSel === 1) setShowAll(true);
        else selectPage(PAGE_KEYS[filterSel - 2]);
        syncFilterUi();
        syncCursor();
        return;
      }
      if (dir === "down") {
        uiMode = "event";
        if (pageKey === "focus" || pageKey === "week") {
          var t = lastData && lastData.today;
          var idx = t ? days.indexOf(t) : 0;
          if (idx < 0) idx = 0;
          if (colEvents(idx).length) {
            tlCol = idx;
            tlIdx = 0;
          } else {
            tlCol = idx;
          }
        }
        syncFilterUi();
      }
      syncCursor();
      return;
    }
    if (pageKey !== "focus" && pageKey !== "week") {
      if (dir === "up") {
        uiMode = "filter";
        filterSel = 2 + Math.max(0, PAGE_KEYS.indexOf(pageKey));
        syncFilterUi();
      }
      return;
    }
    if (dir === "up") {
      if (tlIdx > 0) tlIdx -= 1;
      else {
        uiMode = "filter";
        filterSel = 2 + Math.max(0, PAGE_KEYS.indexOf(pageKey));
        syncFilterUi();
      }
      syncCursor();
      return;
    }
    if (dir === "down") {
      var list = colEvents(tlCol);
      if (tlIdx + 1 < list.length) tlIdx += 1;
      else {
        uiMode = "wx";
        wxCol = tlCol;
        wxRow = 0;
        syncFilterUi();
      }
      syncCursor();
      return;
    }
    if (dir === "left" || dir === "right") {
      var cur = currentEvent();
      moveToCol(tlCol + (dir === "right" ? 1 : -1), cur ? cur._ds : 12 * 60);
      syncFilterUi();
      syncCursor();
      return;
    }
    if (dir === "ok") openEvDetail();
  };
  window.DashPhoneSwipe = function (dir) {
    if (!isPhone()) return;
    refreshKioskQueue();
    var i = kioskQueue.indexOf(kioskKey);
    if (i < 0) i = 0;
    var n = kioskQueue.length;
    if (!n) return;
    var next = kioskQueue[(i + (dir === "left" ? 1 : n - 1)) % n];
    if (kioskOn && !kioskPaused) showKioskPage(next);
    else selectPage(next);
  };
  window.DashPhoneTap = function () {
    if (!isPhone()) return;
    if (!$("settings").hidden) return;
    toggleKioskPause();
  };
  window.DashSettings = function () {
    if (consumeKioskKey()) return;
    if (kioskOn) pauseKioskCycle();
    else noteInput(true);
    showSettings($("settings").hidden);
  };
  window.DashBack = function () {
    if (consumeKioskKey()) return;
    if (!$("settings").hidden) {
      showSettings(false);
      return;
    }
    if (kioskOn) {
      pauseKioskCycle();
      showSettings(true);
      return;
    }
    noteInput(true);
    if (pageKey === "wx") {
      selectPage("focus");
      return;
    }
    if (evDetailOpen) {
      closeEvDetail();
      return;
    }
    if (wxDetailDate) {
      closeWxDetail();
      uiMode = "wx";
      syncCursor();
      return;
    }
    if (uiMode === "wx") {
      if (colEvents(wxCol).length) {
        uiMode = "event";
        tlCol = wxCol;
        tlIdx = colEvents(wxCol).length - 1;
      } else {
        uiMode = "filter";
      }
      syncFilterUi();
      syncCursor();
      return;
    }
    showSettings(true);
  };

  function setShowAll(v) {
    if (viewMode === "week") {
      showAllWeek = !!v;
      try { localStorage.setItem("dashShowAllWeek", showAllWeek ? "1" : "0"); } catch (e) {}
    } else {
      showAllFocus = !!v;
      try { localStorage.setItem("dashShowAllFocus", showAllFocus ? "1" : "0"); } catch (e) {}
    }
    if (lastData) apply(lastData);
    else syncFilterUi();
  }

  function goPage(key) {
    noteInput(true);
    rebuildPageLists();
    var i = PAGE_KEYS.indexOf(key);
    filterSel = i >= 0 ? 2 + i : 2;
    selectPage(key);
  }
  function bind() {
    rebuildPageLists();
    try {
      var focusAll = localStorage.getItem("dashShowAllFocus");
      showAllFocus = focusAll == null ? true : focusAll === "1";
      var weekAll = localStorage.getItem("dashShowAllWeek");
      if (weekAll == null) {
        showAllWeek = localStorage.getItem("dashShowAll") === "1";
      } else {
        showAllWeek = weekAll === "1";
      }
      var vm = localStorage.getItem("dashViewMode");
      if (vm === "week" || vm === "focus") viewMode = vm;
      var pg = localStorage.getItem("dashPage");
      if (pg === "transit") pg = "brief";
      var storedParent = parentPage(pg);
      if (storedParent === "tomo" && !afterSixPm()) {
        pg = "brief";
        storedParent = "brief";
      }
      if (storedParent === "nextWeekHead" && !isSunday()) {
        pg = "weekHead";
        storedParent = "weekHead";
      }
      if (isPhone() && storedParent === "studyTodo") {
        pg = "study";
        storedParent = "study";
      }
      if (PAGE_KEYS.indexOf(storedParent) >= 0) {
        pageKey = storedParent;
        phoneSlice = isPhone() ? sliceOf(pg) : "";
        kioskKey = isPhone() ? phoneQueueKey(pageKey, phoneSlice) : pageKey;
      }
      if (isPhone() && (pageKey === "focus" || pageKey === "week")) {
        pageKey = "brief";
        phoneSlice = "";
        kioskKey = "brief";
      }
      if (pageKey === "week") viewMode = "week";
      if (studyDebug()) {
        pageKey = "study";
        phoneSlice = "";
        kioskKey = "study";
      }
    } catch (e) { showAllFocus = true; showAllWeek = false; }
    setPanelVisibility();
    syncBodyClass();
    syncPhoneLayout();
    $("btn-close").addEventListener("click", function () { showSettings(false); });
    if ($("btn-pause")) {
      $("btn-pause").addEventListener("click", function () {
        toggleKioskPause();
        showSettings(false);
      });
    }
    $("btn-exit").addEventListener("click", function () {
      if (window.SonyBridge && SonyBridge.exit) SonyBridge.exit();
    });
    if ($("btn-speak")) {
      $("btn-speak").addEventListener("click", function () {
        if (!canSpeak()) return;
        var on = !speakEnabled();
        try { localStorage.setItem("dashSpeak", on ? "1" : "0"); } catch (e) {}
        if (!on) stopPageSpeak();
        else maybeSpeakPage(kioskKey);
        syncSpeakBtn();
      });
    }
    syncSpeakBtn();
    $("btn-u13").addEventListener("click", function () { noteInput(true); filterSel = 0; setShowAll(false); });
    $("btn-all").addEventListener("click", function () { noteInput(true); filterSel = 1; setShowAll(true); });
    $("btn-brief").addEventListener("click", function () { goPage("brief"); });
    if ($("btn-tomo")) $("btn-tomo").addEventListener("click", function () { goPage("tomo"); });
    if ($("btn-study")) $("btn-study").addEventListener("click", function () { goPage("study"); });
    if ($("btn-study-todo")) $("btn-study-todo").addEventListener("click", function () { goPage("studyTodo"); });
    $("btn-focus").addEventListener("click", function () { goPage("focus"); });
    $("btn-wx").addEventListener("click", function () { goPage("wx"); });
    $("btn-week-head").addEventListener("click", function () { goPage("weekHead"); });
    if ($("btn-next-week-head")) {
      $("btn-next-week-head").addEventListener("click", function () { goPage("nextWeekHead"); });
    }
    $("btn-week").addEventListener("click", function () { goPage("week"); });
    if ($("btn-standings")) $("btn-standings").addEventListener("click", function () { goPage("standings"); });
    $("wk-prev").addEventListener("click", function () { noteInput(true); window.DashWeekColor("prev"); });
    $("wk-today").addEventListener("click", function () { noteInput(true); window.DashWeekColor("today"); });
    $("wk-next").addEventListener("click", function () { noteInput(true); window.DashWeekColor("next"); });
  }

  function tickClock() {
    var n = new Date();
    $("clock").textContent = pad(n.getHours()) + ":" + pad(n.getMinutes());
    var day = todayStr();
    var prevDay = clockDay;
    if (prevDay && prevDay !== day) {
      appLog({ event: "day_roll", from: prevDay, to: day });
      cacheWeek = null;
      cacheFocus = null;
      homeBriefing = null;
      load();
      loadStudy();
    }
    clockDay = day;
    if (prevDay && !currentWeekCacheOk(cacheWeek)) prefetchWeek();
    var h = n.getHours();
    $("night").hidden = !(h >= 23 || h < 6);
    rebuildPageLists();
    if (pageKey === "nextWeekHead" && !isSunday()) selectPage("weekHead");
    else if (pageKey === "tomo" && !afterSixPm()) selectPage("brief");
    else syncFilterUi();
    if (kioskOn || isPhone()) refreshKioskQueue();
    if (isWeekHeadPage(pageKey)) {
      var st = weekEventsPastStamp();
      if (st !== weekPastStamp) renderWeekHeadline();
    }
    if (isBriefPage(pageKey)) {
      var bst = briefEventsPastStamp();
      if (bst !== briefPastStamp) renderBriefing();
    }
    var quiet = speakQuietHours();
    if (quietSpeakLatch === null) quietSpeakLatch = quiet;
    if (quiet) {
      if (!quietSpeakLatch) {
        var wasAwait = kioskAwaitSpeak;
        if (isPhone()) {
          speakSeq += 1;
          kioskAwaitSpeak = false;
        } else {
          stopPageSpeak();
        }
        if (kioskOn && wasAwait) armKioskAdvance(PAGE_MS);
        appLog({ event: "speak_quiet_enter" });
      }
      quietSpeakLatch = true;
    } else if (quietSpeakLatch) {
      quietSpeakLatch = false;
      appLog({ event: "speak_quiet_leave" });
      if (isPhone() && kioskOn && !kioskPaused) {
        if (!trySpeakPage(kioskKey, true)) armKioskAdvance(PAGE_MS);
      }
    }
  }

  function init() {
    bind();
    tickClock();
    setInterval(tickClock, 10000);
    load();
    loadStudy();
    loadStandings();
    if (studyDebug()) selectPage("study");
    resetIdle();
    setInterval(function () { load(); }, 5 * 60 * 1000);
    setInterval(function () { loadStudy(); }, 5 * 60 * 1000);
    setInterval(function () { loadStandings(); }, 5 * 60 * 1000);
    document.addEventListener("keydown", function (ev) {
      window.DashNoteInput();
      var k = ev.keyCode;
      if (k === 37 || k === 21) { ev.preventDefault(); window.DashKey("left"); }
      else if (k === 39 || k === 22) { ev.preventDefault(); window.DashKey("right"); }
      else if (k === 38 || k === 19) { ev.preventDefault(); window.DashKey("up"); }
      else if (k === 40 || k === 20) { ev.preventDefault(); window.DashKey("down"); }
      else if (k === 13 || k === 23) { ev.preventDefault(); window.DashKey("ok"); }
      else if (k === 404 || k === 184 || k === 112) { ev.preventDefault(); window.DashWeekColor("prev"); }
      else if (k === 406 || k === 186 || k === 114) { ev.preventDefault(); window.DashWeekColor("today"); }
      else if (k === 405 || k === 185 || k === 113) { ev.preventDefault(); window.DashWeekColor("next"); }
      else if (k === 403 || k === 183 || k === 115) { ev.preventDefault(); window.DashSettings(); }
      else if (k === 4 || k === 8 || k === 27 || k === 461) { ev.preventDefault(); window.DashBack(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
