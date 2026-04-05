var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/utils.ts
async function ensureFolder(app, folderPath) {
  const existing = app.vault.getAbstractFileByPath(folderPath);
  if (existing instanceof import_obsidian2.TFolder)
    return;
  await app.vault.createFolder(folderPath);
}
async function writeJsonToVault(app, filePath, data) {
  const parts = filePath.split("/");
  const folder = parts.slice(0, -1).join("/");
  if (folder)
    await ensureFolder(app, folder);
  const json = JSON.stringify(data, null, 2);
  const existing = app.vault.getAbstractFileByPath(filePath);
  if (existing instanceof import_obsidian2.TFile) {
    await app.vault.modify(existing, json);
  } else {
    await app.vault.create(filePath, json);
  }
}
async function readJsonFromVault(app, filePath) {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof import_obsidian2.TFile))
    return null;
  try {
    return JSON.parse(await app.vault.read(file));
  } catch (e) {
    return null;
  }
}
function formatDuration(minutes) {
  if (minutes < 0)
    minutes = 0;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0)
    return `${m}\u043C`;
  if (m === 0)
    return `${h}\u0447`;
  return `${h}\u0447 ${m}\u043C`;
}
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
async function playAudio(app, soundPath) {
  var _a, _b;
  if (!soundPath) {
    try {
      const ctx = new AudioContext();
      if (ctx.state === "suspended")
        await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(1e-3, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
      setTimeout(() => ctx.close(), 1500);
    } catch (e) {
      console.warn("FCEnhanced: could not play default beep", e);
    }
    return;
  }
  console.log(`[FCEnhanced] playAudio: path="${soundPath}"`);
  const ext = (_b = (_a = soundPath.split(".").pop()) == null ? void 0 : _a.toLowerCase()) != null ? _b : "";
  const mimeMap = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac"
  };
  const mime = mimeMap[ext] || "audio/mpeg";
  try {
    const vaultFile = app.vault.getAbstractFileByPath(soundPath);
    if (vaultFile instanceof import_obsidian2.TFile) {
      console.log(`[FCEnhanced] playAudio: found in vault`);
      const data = await app.vault.readBinary(vaultFile);
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const audio2 = new Audio(url);
      audio2.onended = () => URL.revokeObjectURL(url);
      await audio2.play();
      return;
    }
    console.warn(`[FCEnhanced] playAudio: file not found in vault at "${soundPath}". Check the path in settings (relative to vault root, e.g. "audio/sound.mp3").`);
    const audio = new Audio(soundPath);
    await audio.play();
  } catch (e) {
    console.warn(`[FCEnhanced] playAudio: failed to play "${soundPath}":`, e);
  }
}
async function withFileLock(filePath, fn) {
  var _a;
  const prev = (_a = _writeLocks.get(filePath)) != null ? _a : Promise.resolve();
  let resolveLock;
  const lockPromise = new Promise((r) => {
    resolveLock = r;
  });
  _writeLocks.set(filePath, prev.then(() => lockPromise));
  try {
    await prev;
    await fn();
  } finally {
    resolveLock();
  }
}
function dimColor(hex, factor = 0.4) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const blend = (c) => Math.round(c * factor + 128 * (1 - factor));
  return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
}
var import_obsidian2, _writeLocks;
var init_utils = __esm({
  "src/utils.ts"() {
    import_obsidian2 = require("obsidian");
    _writeLocks = /* @__PURE__ */ new Map();
  }
});

// src/dashboard.ts
var dashboard_exports = {};
__export(dashboard_exports, {
  DASHBOARD_VIEW_TYPE: () => DASHBOARD_VIEW_TYPE,
  DashboardView: () => DashboardView,
  saveDashboardEventRecord: () => saveDashboardEventRecord
});
function fmtTime(iso) {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function durationMin(r) {
  if (!r.actualStart || !r.actualEnd)
    return 0;
  return (new Date(r.actualEnd).getTime() - new Date(r.actualStart).getTime()) / 6e4;
}
function plannedMin(r) {
  return (new Date(r.plannedEnd).getTime() - new Date(r.plannedStart).getTime()) / 6e4;
}
function parseDateFromFm(fm) {
  if (!(fm == null ? void 0 : fm.date))
    return null;
  if (fm.date instanceof Date)
    return fm.date.toISOString().slice(0, 10);
  return String(fm.date).slice(0, 10);
}
function buildScrollableSection(parent, title, columns, rows, rowHeight = 36, visibleRows = 5) {
  const section = parent.createEl("div", { cls: "fc-dashboard-section" });
  section.createEl("h3", { text: title, cls: "fc-dashboard-section-title" });
  const toolbar = section.createEl("div", { cls: "fc-section-toolbar" });
  const searchInput = toolbar.createEl("input", { cls: "fc-section-search" });
  searchInput.type = "text";
  searchInput.placeholder = "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E\u2026";
  const filterSelects = /* @__PURE__ */ new Map();
  if (columns.length > 1) {
    const filterWrap = toolbar.createEl("div", { cls: "fc-section-filters" });
    for (const col of columns.slice(1)) {
      const values = [...new Set(rows.map((r) => {
        var _a;
        return (_a = r[col]) != null ? _a : "";
      }))].filter(Boolean).sort();
      if (values.length > 1 && values.length <= 20) {
        const sel = filterWrap.createEl("select", { cls: "fc-section-filter-select" });
        sel.createEl("option", { text: col + ": \u0432\u0441\u0435", value: "" });
        for (const v of values)
          sel.createEl("option", { text: v, value: v });
        filterSelects.set(col, sel);
      }
    }
  }
  const tableWrap = section.createEl("div", { cls: "fc-scrollable-wrap" });
  tableWrap.style.cssText = `max-height:${rowHeight * visibleRows + 40}px;overflow-y:auto;`;
  const table = tableWrap.createEl("table", { cls: "fc-records-table" });
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  for (const col of columns)
    headerRow.createEl("th", { text: col });
  const tbody = table.createEl("tbody");
  function renderRows() {
    var _a, _b;
    tbody.empty();
    const query = searchInput.value.toLowerCase();
    const filters = {};
    filterSelects.forEach((sel, col) => {
      filters[col] = sel.value;
    });
    const filtered = rows.filter((r) => {
      var _a2;
      const nameCol = columns[0];
      if (query && !((_a2 = r[nameCol]) != null ? _a2 : "").toLowerCase().includes(query))
        return false;
      for (const [col, val] of Object.entries(filters)) {
        if (val && r[col] !== val)
          return false;
      }
      return true;
    });
    if (filtered.length === 0) {
      const tr = tbody.createEl("tr");
      tr.createEl("td", { text: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445", attr: { colspan: String(columns.length) } }).style.cssText = "text-align:center;color:var(--text-faint);padding:12px;";
      return;
    }
    for (const row of filtered) {
      const tr = tbody.createEl("tr");
      for (const col of columns) {
        const td = tr.createEl("td", { text: (_a = row[col]) != null ? _a : "" });
        if ((_b = row.__cls) == null ? void 0 : _b[col])
          td.addClass(row.__cls[col]);
      }
    }
  }
  searchInput.addEventListener("input", renderRows);
  filterSelects.forEach((sel) => sel.addEventListener("change", renderRows));
  renderRows();
}
async function saveDashboardEventRecord(app, plugin, record) {
  var _a;
  const settings = plugin._enhancedSettings;
  const folder = ((_a = settings == null ? void 0 : settings.dashboard) == null ? void 0 : _a.saveFolder) || "_calendar_dashboard";
  const dateKey = toDateStr(new Date(record.plannedStart));
  const filePath = `${folder}/records/${dateKey}.json`;
  let existing = await readJsonFromVault(app, filePath) || [];
  if (!Array.isArray(existing))
    existing = [];
  const idx = existing.findIndex((r) => r.id === record.id && r.plannedStart === record.plannedStart);
  if (idx >= 0)
    existing[idx] = record;
  else
    existing.push(record);
  await writeJsonToVault(app, filePath, existing);
}
var import_obsidian4, DASHBOARD_VIEW_TYPE, DashboardView;
var init_dashboard = __esm({
  "src/dashboard.ts"() {
    import_obsidian4 = require("obsidian");
    init_utils();
    DASHBOARD_VIEW_TYPE = "full-calendar-dashboard";
    DashboardView = class extends import_obsidian4.ItemView {
      // currently selected activity for histogram
      constructor(leaf, plugin, getSettings) {
        super(leaf);
        this.period = "week";
        this.selectedActivity = "";
        this.plugin = plugin;
        this.getSettings = getSettings;
      }
      getViewType() {
        return DASHBOARD_VIEW_TYPE;
      }
      getDisplayText() {
        return "\u0414\u0430\u0448\u0431\u043E\u0440\u0434 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044F";
      }
      getIcon() {
        return "bar-chart";
      }
      async onOpen() {
        await this.render();
      }
      async onClose() {
      }
      async render() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass("fc-dashboard");
        const header = container.createEl("div", { cls: "fc-dashboard-header" });
        header.createEl("h2", { text: "\u0414\u0430\u0448\u0431\u043E\u0440\u0434 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044F", cls: "fc-dashboard-title" });
        const tabs = header.createEl("div", { cls: "fc-dashboard-tabs" });
        for (const [key, label] of [["week", "\u041D\u0435\u0434\u0435\u043B\u044F"], ["month", "\u041C\u0435\u0441\u044F\u0446"], ["year", "\u0413\u043E\u0434"]]) {
          const tab = tabs.createEl("button", { text: label, cls: "fc-dashboard-tab" });
          if (this.period === key)
            tab.addClass("active");
          tab.onclick = () => {
            this.period = key;
            this.selectedActivity = "";
            this.render();
          };
        }
        const refreshBtn = header.createEl("button", { text: "\u{1F504}", cls: "fc-dashboard-refresh" });
        refreshBtn.title = "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C";
        refreshBtn.onclick = () => this.render();
        const exportBtn = header.createEl("button", { text: "\u{1F4E4} JSON", cls: "fc-dashboard-export" });
        exportBtn.onclick = () => this.exportData();
        const { records, allEventTitles, dateRange } = await this.loadAll();
        const content = container.createEl("div", { cls: "fc-dashboard-content" });
        if (records.length === 0) {
          content.createEl("p", {
            text: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u0442\u0440\u0435\u043A\u0438\u043D\u0433\u0430 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0438 \u25B6 / \u23F9 \u0432 \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u044F.",
            cls: "fc-dashboard-empty"
          });
        }
        this.renderSummaryCards(content, records);
        this.renderPlannedVsActualHistogram(content, records, dateRange);
        this.renderActivityHistogram(content, records, allEventTitles, dateRange);
        this.renderActivityBreakdown(content, records);
        this.renderPunctualitySection(content, records);
        await this.renderPlannedSection(content, dateRange);
        this.renderRecordsTable(content, records);
      }
      // ── Date range ─────────────────────────────────────────────────────────────
      getDateRange() {
        const now = /* @__PURE__ */ new Date();
        let start, end;
        if (this.period === "week") {
          const dow = now.getDay();
          start = new Date(now);
          start.setDate(now.getDate() - dow + (dow === 0 ? -6 : 1));
          start.setHours(0, 0, 0, 0);
          end = new Date(start);
          end.setDate(start.getDate() + 6);
          end.setHours(23, 59, 59, 999);
        } else if (this.period === "month") {
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        } else {
          start = new Date(now.getFullYear(), 0, 1);
          end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        }
        return { start, end };
      }
      // ── Load records + collect recurring/repeated titles ───────────────────────
      async loadAll() {
        var _a;
        const dateRange = this.getDateRange();
        const settings = this.getSettings();
        const folder = settings.dashboard.saveFolder;
        const records = [];
        try {
          const folderPath = `${folder}/records`;
          const vaultFolder = this.app.vault.getAbstractFileByPath(folderPath);
          if (vaultFolder) {
            const files = this.app.vault.getFiles().filter(
              (f) => f.path.startsWith(folderPath + "/") && f.extension === "json"
            );
            for (const file of files) {
              try {
                const data = JSON.parse(await this.app.vault.read(file));
                if (Array.isArray(data))
                  records.push(...data);
              } catch (e) {
              }
            }
          }
        } catch (e) {
        }
        const allTitlesInVault = [];
        await this.scanEventFiles(records, dateRange, allTitlesInVault);
        const seen = /* @__PURE__ */ new Set();
        const deduped = records.filter((r) => {
          const key = `${r.id}:${r.plannedStart}`;
          if (seen.has(key))
            return false;
          seen.add(key);
          return true;
        });
        const filtered = deduped.filter((r) => {
          const d = new Date(r.plannedStart);
          return d >= dateRange.start && d <= dateRange.end;
        });
        const titleCount = /* @__PURE__ */ new Map();
        for (const r of filtered)
          titleCount.set(r.title, ((_a = titleCount.get(r.title)) != null ? _a : 0) + 1);
        const recurringTitles = new Set(
          allTitlesInVault.filter((t) => t.recurring).map((t) => t.title)
        );
        const eligibleTitles = [...new Set(
          filtered.filter((r) => {
            var _a2;
            return recurringTitles.has(r.title) || ((_a2 = titleCount.get(r.title)) != null ? _a2 : 0) > 1;
          }).map((r) => r.title)
        )].sort();
        return { records: filtered, allEventTitles: eligibleTitles, dateRange };
      }
      async scanEventFiles(records, dateRange, allTitles) {
        var _a;
        const sources = ((_a = this.plugin.settings) == null ? void 0 : _a.calendarSources) || [];
        for (const source of sources) {
          if (source.type !== "local" || !source.directory)
            continue;
          const dir = source.directory;
          const isRoot = dir === "/" || dir === "" || dir === ".";
          const files = this.app.vault.getFiles().filter((f) => {
            if (f.extension !== "md")
              return false;
            if (isRoot)
              return true;
            return f.path.startsWith(dir + "/") || f.path === dir;
          });
          for (const file of files) {
            try {
              const cache = this.app.metadataCache.getFileCache(file);
              const fm = cache == null ? void 0 : cache.frontmatter;
              if (!fm)
                continue;
              const isRecurring = !!(fm.daysOfWeek || fm.startRecur || fm.rrule);
              const isSingleEvent = !!(fm.date && fm.startTime);
              if (!isRecurring && !isSingleEvent)
                continue;
              const title = fm.title || file.basename;
              allTitles.push({ title, recurring: isRecurring });
              const dateStr = parseDateFromFm(fm);
              if (!dateStr)
                continue;
              const startStr = fm.startTime ? String(fm.startTime).trim() : "00:00";
              const endStr = fm.endTime ? String(fm.endTime).trim() : null;
              const plannedStart = /* @__PURE__ */ new Date(`${dateStr}T${startStr}`);
              let plannedEnd;
              if (endStr) {
                const endDateStr = fm.endDate ? fm.endDate instanceof Date ? fm.endDate.toISOString().slice(0, 10) : String(fm.endDate).slice(0, 10) : dateStr;
                plannedEnd = /* @__PURE__ */ new Date(`${endDateStr}T${endStr}`);
                if (!fm.endDate && plannedEnd <= plannedStart) {
                  plannedEnd = new Date(plannedEnd.getTime() + 24 * 60 * 60 * 1e3);
                }
              } else {
                plannedEnd = new Date(plannedStart.getTime() + 60 * 60 * 1e3);
              }
              if (isNaN(plannedStart.getTime()))
                continue;
              if (plannedStart < dateRange.start || plannedStart > dateRange.end)
                continue;
              const tracking = fm.tracking;
              const existing = records.find((r) => r.id === file.path && r.plannedStart === plannedStart.toISOString());
              if (!existing) {
                records.push({
                  id: file.path,
                  title,
                  calendarId: source.directory,
                  plannedStart: plannedStart.toISOString(),
                  plannedEnd: plannedEnd.toISOString(),
                  actualStart: (tracking == null ? void 0 : tracking.startedAt) || void 0,
                  actualEnd: (tracking == null ? void 0 : tracking.endedAt) || void 0,
                  tracked: !!((tracking == null ? void 0 : tracking.startedAt) || (tracking == null ? void 0 : tracking.endedAt)),
                  linkedNotes: fm.linkedNotes || []
                });
              }
            } catch (e) {
            }
          }
        }
      }
      // ── 1. Summary cards ───────────────────────────────────────────────────────
      renderSummaryCards(el, records) {
        const section = el.createEl("div", { cls: "fc-dashboard-section" });
        section.createEl("h3", { text: "\u0421\u0432\u043E\u0434\u043A\u0430", cls: "fc-dashboard-section-title" });
        const cards = section.createEl("div", { cls: "fc-dashboard-cards" });
        const tracked = records.filter((r) => r.tracked);
        const totalPlannedMin = records.reduce((s, r) => s + plannedMin(r), 0);
        const totalActualMin = tracked.reduce((s, r) => s + durationMin(r), 0);
        const startedLate = tracked.filter((r) => r.actualStart && new Date(r.actualStart).getTime() - new Date(r.plannedStart).getTime() > 6e4).length;
        const endedLate = tracked.filter((r) => r.actualEnd && new Date(r.actualEnd).getTime() - new Date(r.plannedEnd).getTime() > 6e4).length;
        const missed = records.filter((r) => !r.tracked).length;
        const card = (label, value, cls = "") => {
          const c = cards.createEl("div", { cls: `fc-dashboard-card ${cls}` });
          c.createEl("div", { text: value, cls: "fc-card-value" });
          c.createEl("div", { text: label, cls: "fc-card-label" });
        };
        card("\u{1F4C5} \u0421\u043E\u0431\u044B\u0442\u0438\u0439", String(records.length));
        card("\u23F1 \u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E", formatDuration(totalPlannedMin));
        card("\u2705 \u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E", formatDuration(totalActualMin), totalActualMin >= totalPlannedMin ? "positive" : "");
        card("\u23F0 \u041E\u043F\u043E\u0437\u0434\u0430\u043B \u0441\u043E \u0441\u0442\u0430\u0440\u0442\u043E\u043C", String(startedLate), startedLate > 0 ? "warning" : "positive");
        card("\u{1F550} \u041F\u0440\u0435\u0432\u044B\u0441\u0438\u043B \u0432\u0440\u0435\u043C\u044F", String(endedLate), endedLate > 0 ? "warning" : "");
        card("\u274C \u041D\u0435 \u043E\u0442\u0441\u043B\u0435\u0436\u0435\u043D\u043E", String(missed), missed > 0 ? "danger" : "positive");
      }
      // ── 2. Planned vs Actual histogram (всегда показывает оба столбца) ─────────
      renderPlannedVsActualHistogram(el, records, dateRange) {
        const section = el.createEl("div", { cls: "fc-dashboard-section" });
        const periodLabel = this.period === "week" ? "\u043F\u043E \u0434\u043D\u044F\u043C \u043D\u0435\u0434\u0435\u043B\u0438" : this.period === "month" ? "\u043F\u043E \u0434\u043D\u044F\u043C \u043C\u0435\u0441\u044F\u0446\u0430" : "\u043F\u043E \u043C\u0435\u0441\u044F\u0446\u0430\u043C";
        section.createEl("h3", { text: `\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E vs \u0424\u0430\u043A\u0442 (${periodLabel})`, cls: "fc-dashboard-section-title" });
        const buckets = this.buildTimeBuckets(dateRange);
        for (const r of records) {
          const key = this.bucketKey(r.plannedStart);
          const b = buckets.get(key);
          if (!b)
            continue;
          b.planned += plannedMin(r);
          b.actual += durationMin(r);
        }
        this.drawHistogram(section, buckets, dateRange, [
          { label: "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E", color: "rgba(55,136,216,0.35)", field: "planned" },
          { label: "\u0424\u0430\u043A\u0442", color: "rgba(55,136,216,0.9)", field: "actual" }
        ]);
      }
      // ── 3. Activity histogram with selector ────────────────────────────────────
      renderActivityHistogram(el, records, eligibleTitles, dateRange) {
        const section = el.createEl("div", { cls: "fc-dashboard-section" });
        section.createEl("h3", { text: "\u0414\u0438\u043D\u0430\u043C\u0438\u043A\u0430 \u043F\u043E \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u0438", cls: "fc-dashboard-section-title" });
        if (eligibleTitles.length === 0) {
          section.createEl("p", {
            text: "\u041D\u0435\u0442 \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u044E\u0449\u0438\u0445\u0441\u044F \u0441\u043E\u0431\u044B\u0442\u0438\u0439 \u0438\u043B\u0438 \u0441\u043E\u0431\u044B\u0442\u0438\u0439 \u0441 \u043E\u0434\u0438\u043D\u0430\u043A\u043E\u0432\u044B\u043C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435\u043C (\u043D\u0443\u0436\u043D\u043E \u0431\u043E\u043B\u044C\u0448\u0435 \u043E\u0434\u043D\u043E\u0433\u043E).",
            cls: "fc-empty-note"
          });
          return;
        }
        const toolbar = section.createEl("div", { cls: "fc-section-toolbar" });
        const sel = toolbar.createEl("select", { cls: "fc-activity-selector" });
        sel.createEl("option", { text: "\u2014 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C \u2014", value: "" });
        for (const t of eligibleTitles)
          sel.createEl("option", { text: t, value: t });
        if (this.selectedActivity && eligibleTitles.includes(this.selectedActivity)) {
          sel.value = this.selectedActivity;
        }
        const chartWrap = section.createEl("div");
        const hint = section.createEl("p", { cls: "fc-empty-note" });
        hint.textContent = "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430 \u0432\u044B\u0448\u0435";
        const drawSelected = () => {
          chartWrap.empty();
          hint.style.display = sel.value ? "none" : "";
          if (!sel.value)
            return;
          this.selectedActivity = sel.value;
          const buckets = this.buildTimeBuckets(dateRange);
          for (const r of records) {
            if (r.title !== sel.value)
              continue;
            const key = this.bucketKey(r.plannedStart);
            const b = buckets.get(key);
            if (!b)
              continue;
            b.planned += plannedMin(r);
            b.actual += durationMin(r);
          }
          this.drawHistogram(chartWrap, buckets, dateRange, [
            { label: "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E", color: "rgba(80,200,120,0.35)", field: "planned" },
            { label: "\u0424\u0430\u043A\u0442", color: "rgba(80,200,120,0.9)", field: "actual" }
          ]);
        };
        sel.addEventListener("change", drawSelected);
        drawSelected();
      }
      // ── Histogram helpers ──────────────────────────────────────────────────────
      buildTimeBuckets(dateRange) {
        const buckets = /* @__PURE__ */ new Map();
        if (this.period === "year") {
          for (let m = 0; m < 12; m++)
            buckets.set(String(m), { planned: 0, actual: 0 });
        } else {
          const cur = new Date(dateRange.start);
          while (cur <= dateRange.end) {
            buckets.set(toDateStr(cur), { planned: 0, actual: 0 });
            cur.setDate(cur.getDate() + 1);
          }
        }
        return buckets;
      }
      bucketKey(isoDate) {
        const d = new Date(isoDate);
        return this.period === "year" ? String(d.getMonth()) : toDateStr(d);
      }
      drawHistogram(el, buckets, dateRange, series) {
        const canvas = el.createEl("canvas");
        canvas.width = 800;
        canvas.height = 200;
        canvas.style.cssText = "max-width:100%;height:auto;display:block;margin:8px 0;";
        const ctx = canvas.getContext("2d");
        const entries = [...buckets.entries()];
        const maxVal = Math.max(...entries.map(([, v]) => Math.max(v.planned, v.actual)), 1);
        const barGroupW = Math.floor((canvas.width - 40) / entries.length);
        const chartH = canvas.height - 30;
        const barW = Math.max(2, Math.floor(barGroupW / series.length) - 2);
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--background-secondary") || "#1e1e1e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < entries.length; i++) {
          const [key, vals] = entries[i];
          const groupX = 20 + i * barGroupW;
          for (let s = 0; s < series.length; s++) {
            const val = vals[series[s].field];
            const h = Math.round(val / maxVal * chartH);
            ctx.fillStyle = series[s].color;
            ctx.fillRect(groupX + s * (barW + 2), chartH - h, barW, h);
          }
          ctx.fillStyle = "rgba(180,180,180,0.8)";
          ctx.font = "9px sans-serif";
          ctx.textAlign = "center";
          const label = this.period === "year" ? ["\u042F\u043D\u0432", "\u0424\u0435\u0432", "\u041C\u0430\u0440", "\u0410\u043F\u0440", "\u041C\u0430\u0439", "\u0418\u044E\u043D", "\u0418\u044E\u043B", "\u0410\u0432\u0433", "\u0421\u0435\u043D", "\u041E\u043A\u0442", "\u041D\u043E\u044F", "\u0414\u0435\u043A"][parseInt(key)] : key.slice(-2);
          ctx.fillText(label, groupX + barGroupW / 2, canvas.height - 4);
        }
        const legend = el.createEl("div", { cls: "fc-chart-legend" });
        for (const s of series) {
          const sp = legend.createEl("span");
          sp.innerHTML = `<span class="fc-legend-box" style="background:${s.color}"></span> ${s.label}`;
        }
      }
      // ── 4. Время по активностям — scrollable ───────────────────────────────────
      renderActivityBreakdown(el, records) {
        var _a;
        const byTitle = /* @__PURE__ */ new Map();
        for (const r of records) {
          const entry = (_a = byTitle.get(r.title)) != null ? _a : { actual: 0, planned: 0, count: 0 };
          entry.planned += plannedMin(r);
          entry.actual += durationMin(r);
          entry.count++;
          byTitle.set(r.title, entry);
        }
        const sorted = [...byTitle.entries()].sort((a, b) => b[1].actual - a[1].actual);
        if (sorted.length === 0) {
          const section = el.createEl("div", { cls: "fc-dashboard-section" });
          section.createEl("h3", { text: "\u0412\u0440\u0435\u043C\u044F \u043F\u043E \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044F\u043C", cls: "fc-dashboard-section-title" });
          section.createEl("p", { text: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445.", cls: "fc-empty-note" });
          return;
        }
        const rows = sorted.map(([title, v]) => ({
          "\u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C": title,
          "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E": formatDuration(v.planned),
          "\u0424\u0430\u043A\u0442": v.actual > 0 ? formatDuration(v.actual) : "\u2014",
          "\u0421\u043E\u0431\u044B\u0442\u0438\u0439": String(v.count)
        }));
        buildScrollableSection(
          el,
          "\u0412\u0440\u0435\u043C\u044F \u043F\u043E \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044F\u043C",
          ["\u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C", "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E", "\u0424\u0430\u043A\u0442", "\u0421\u043E\u0431\u044B\u0442\u0438\u0439"],
          rows,
          36,
          5
        );
      }
      // ── 5. Пунктуальность — scrollable ────────────────────────────────────────
      renderPunctualitySection(el, records) {
        const tracked = records.filter((r) => r.tracked);
        const rows = tracked.map((r) => {
          let startStatus = "\u2014", endStatus = "\u2014";
          if (r.actualStart) {
            const late = Math.round((new Date(r.actualStart).getTime() - new Date(r.plannedStart).getTime()) / 6e4);
            startStatus = late > 1 ? `+${late}\u043C` : late < -1 ? `${late}\u043C` : "\u2713";
          }
          if (r.actualEnd) {
            const over = Math.round((new Date(r.actualEnd).getTime() - new Date(r.plannedEnd).getTime()) / 6e4);
            endStatus = over > 1 ? `+${over}\u043C` : over < -1 ? `${over}\u043C` : "\u2713";
          }
          return {
            "\u0421\u043E\u0431\u044B\u0442\u0438\u0435": r.title,
            "\u0414\u0430\u0442\u0430": toDateStr(new Date(r.plannedStart)),
            "\u0421\u0442\u0430\u0440\u0442": startStatus,
            "\u041A\u043E\u043D\u0435\u0446": endStatus
          };
        });
        buildScrollableSection(
          el,
          "\u041F\u0443\u043D\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C",
          ["\u0421\u043E\u0431\u044B\u0442\u0438\u0435", "\u0414\u0430\u0442\u0430", "\u0421\u0442\u0430\u0440\u0442", "\u041A\u043E\u043D\u0435\u0446"],
          rows,
          36,
          5
        );
      }
      // ── 6. Запланированные события — scrollable ────────────────────────────────
      async renderPlannedSection(el, dateRange) {
        var _a, _b, _c, _d, _e, _f, _g;
        const sources = ((_a = this.plugin.settings) == null ? void 0 : _a.calendarSources) || [];
        const rowsRaw = [];
        for (const source of sources) {
          if (source.type !== "local" || !source.directory)
            continue;
          const dir = source.directory;
          const isRoot = dir === "/" || dir === "" || dir === ".";
          const files = this.app.vault.getFiles().filter((f) => {
            if (f.extension !== "md")
              return false;
            if (isRoot)
              return true;
            return f.path.startsWith(dir + "/") || f.path === dir;
          });
          for (const file of files) {
            try {
              const fm = (_d = (_c = (_b = this.app.metadataCache) == null ? void 0 : _b.getFileCache(file)) == null ? void 0 : _c.frontmatter) != null ? _d : {};
              if (!fm.date && !fm.startTime && !fm.daysOfWeek && !fm.startRecur && !fm.rrule)
                continue;
              const dateStr = parseDateFromFm(fm);
              if (!dateStr)
                continue;
              const startStr = fm.startTime ? String(fm.startTime).trim() : "00:00";
              const d = /* @__PURE__ */ new Date(`${dateStr}T${startStr}`);
              if (isNaN(d.getTime()) || d < dateRange.start || d > dateRange.end)
                continue;
              rowsRaw.push({
                title: (_e = fm.title) != null ? _e : file.basename,
                date: dateStr,
                time: startStr + (fm.endTime ? `\u2013${String(fm.endTime).trim()}` : ""),
                tracked: ((_f = fm.tracking) == null ? void 0 : _f.enabled) === false ? "\u041D\u0435\u0442" : ((_g = fm.tracking) == null ? void 0 : _g.startedAt) ? "\u041D\u0430\u0447\u0430\u0442\u043E" : "\u0414\u0430"
              });
            } catch (e) {
            }
          }
        }
        rowsRaw.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        const rows = rowsRaw.map((r) => ({
          "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435": r.title,
          "\u0414\u0430\u0442\u0430": r.date,
          "\u0412\u0440\u0435\u043C\u044F": r.time,
          "\u0422\u0440\u0435\u043A\u0438\u043D\u0433": r.tracked
        }));
        buildScrollableSection(
          el,
          "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u044F \u043F\u0435\u0440\u0438\u043E\u0434\u0430",
          ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", "\u0414\u0430\u0442\u0430", "\u0412\u0440\u0435\u043C\u044F", "\u0422\u0440\u0435\u043A\u0438\u043D\u0433"],
          rows,
          36,
          5
        );
      }
      // ── 7. Все события периода — scrollable ────────────────────────────────────
      renderRecordsTable(el, records) {
        const sorted = [...records].sort(
          (a, b) => new Date(a.plannedStart).getTime() - new Date(b.plannedStart).getTime()
        );
        const rows = sorted.map((r) => {
          const ps = new Date(r.plannedStart);
          const pe = new Date(r.plannedEnd);
          const planned = `${fmtTime(r.plannedStart)}\u2013${fmtTime(r.plannedEnd)}`;
          let fact = "\u2014";
          if (r.actualStart && r.actualEnd) {
            fact = `${fmtTime(r.actualStart)}\u2013${fmtTime(r.actualEnd)} (${formatDuration(durationMin(r))})`;
          } else if (r.actualStart) {
            fact = `${fmtTime(r.actualStart)}\u2013\u2026`;
          }
          const status = !r.tracked ? "\u041D\u0435 \u043E\u0442\u0441\u043B\u0435\u0436\u0435\u043D\u043E" : r.actualStart && r.actualEnd ? "\u2705 \u0413\u043E\u0442\u043E\u0432\u043E" : "\u23F3 \u0412 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435";
          return {
            "\u0414\u0430\u0442\u0430": toDateStr(ps),
            "\u0421\u043E\u0431\u044B\u0442\u0438\u0435": r.title,
            "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E": planned,
            "\u0424\u0430\u043A\u0442": fact,
            "\u0421\u0442\u0430\u0442\u0443\u0441": status
          };
        });
        buildScrollableSection(
          el,
          "\u0412\u0441\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u044F \u043F\u0435\u0440\u0438\u043E\u0434\u0430",
          ["\u0414\u0430\u0442\u0430", "\u0421\u043E\u0431\u044B\u0442\u0438\u0435", "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E", "\u0424\u0430\u043A\u0442", "\u0421\u0442\u0430\u0442\u0443\u0441"],
          rows,
          36,
          5
        );
      }
      // ── Export ─────────────────────────────────────────────────────────────────
      async exportData() {
        const { records } = await this.loadAll();
        const settings = this.getSettings();
        const dateRange = this.getDateRange();
        const filePath = `${settings.dashboard.saveFolder}/export_${toDateStr(/* @__PURE__ */ new Date())}.json`;
        await writeJsonToVault(this.app, filePath, {
          exported: (/* @__PURE__ */ new Date()).toISOString(),
          period: this.period,
          from: dateRange.start.toISOString(),
          to: dateRange.end.toISOString(),
          records
        });
        new import_obsidian4.Notice(`\u2705 \u042D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043E: ${filePath}`);
      }
    };
  }
});

// src/index.ts
var import_obsidian7 = require("obsidian");

// src/types.ts
var DEFAULT_ENHANCED_SETTINGS = {
  notifications: {
    enabled: true,
    defaultStartSound: null,
    defaultEndSound: null,
    notifyBeforeMinutes: 5,
    notifyOnEnd: true
  },
  tracking: {
    enabledByDefault: true,
    showTrackingButtons: true
  },
  dashboard: {
    saveFolder: "_calendar_dashboard",
    autoSave: true
  },
  noteLinker: {
    enabled: true,
    showLinkedNotesOnHover: true
  }
};

// src/noteLinker.ts
var import_obsidian = require("obsidian");
var pendingLinkedNotes = [];
function getPendingLinkedNotes() {
  return [...pendingLinkedNotes];
}
function setupNoteLinker(_app, _basePlugin) {
  return () => {
  };
}
function injectNoteLinkerUI(modalEl, app, plugin) {
  tryInjectNoteLinker(app, modalEl, plugin);
}
function tryInjectNoteLinker(app, modalEl, plugin) {
  if (!modalEl.querySelector("input#title"))
    return;
  if (modalEl.querySelector(".fc-note-linker"))
    return;
  pendingLinkedNotes = [];
  const eventId = window.__fcLastClickedEventId;
  if (eventId) {
    loadExistingLinkedNotes(app, plugin, eventId).then((notes) => {
      pendingLinkedNotes = notes;
      refreshNoteList(listEl, pendingLinkedNotes);
    });
  }
  const container = document.createElement("div");
  container.className = "fc-note-linker";
  const hdr = document.createElement("p");
  hdr.style.cssText = "margin:0 0 6px 0;font-weight:600;font-size:13px;color:var(--text-muted);";
  hdr.textContent = "\u{1F517} \u0421\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438 / \u043F\u0430\u043F\u043A\u0438";
  container.appendChild(hdr);
  const listEl = document.createElement("div");
  listEl.className = "fc-note-list";
  listEl.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-bottom:6px;";
  container.appendChild(listEl);
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "+ \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443 / \u043F\u0430\u043F\u043A\u0443";
  addBtn.style.cssText = "font-size:12px;padding:4px 10px;cursor:pointer;background:var(--interactive-normal);border:1px solid var(--background-modifier-border);border-radius:4px;color:var(--text-normal);";
  addBtn.onclick = () => {
    new NoteFolderPickerModal(app, (chosen) => {
      if (!pendingLinkedNotes.includes(chosen))
        pendingLinkedNotes.push(chosen);
      refreshNoteList(listEl, pendingLinkedNotes);
    }).open();
  };
  container.appendChild(addBtn);
  const form = modalEl.querySelector("form");
  if (!form)
    return;
  const ps = form.querySelectorAll("p");
  const last = ps[ps.length - 1];
  if (last)
    form.insertBefore(container, last);
  else
    form.appendChild(container);
}
function getEventFilePath(plugin, eventId) {
  var _a, _b, _c;
  try {
    return (_c = (_b = (_a = plugin.cache.getInfoForEditableEvent(eventId)) == null ? void 0 : _a.location) == null ? void 0 : _b.path) != null ? _c : null;
  } catch (e) {
    return null;
  }
}
async function loadExistingLinkedNotes(app, plugin, eventId) {
  var _a, _b, _c;
  try {
    const path = getEventFilePath(plugin, eventId);
    if (!path)
      return [];
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian.TFile))
      return [];
    const fm = (_c = (_b = (_a = app.metadataCache) == null ? void 0 : _a.getFileCache(file)) == null ? void 0 : _b.frontmatter) != null ? _c : {};
    return Array.isArray(fm.linkedNotes) ? fm.linkedNotes : [];
  } catch (e) {
    return [];
  }
}
function refreshNoteList(container, notes) {
  container.innerHTML = "";
  for (const note of notes) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 4px;background:var(--background-secondary);border-radius:4px;";
    const icon = document.createElement("span");
    icon.textContent = note.endsWith("/") || !note.includes(".") ? "\u{1F4C1}" : "\u{1F4C4}";
    const label = document.createElement("span");
    label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    label.textContent = note;
    label.title = note;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.textContent = "\u2715";
    rm.style.cssText = "background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0 2px;font-size:11px;";
    rm.onclick = () => {
      pendingLinkedNotes = pendingLinkedNotes.filter((n) => n !== note);
      refreshNoteList(container, pendingLinkedNotes);
    };
    row.appendChild(icon);
    row.appendChild(label);
    row.appendChild(rm);
    container.appendChild(row);
  }
}
var NoteFolderPickerModal = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, cb) {
    super(app);
    this.cb = cb;
    this.setPlaceholder("\u041D\u0430\u0439\u0442\u0438 \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0438\u043B\u0438 \u043F\u0430\u043F\u043A\u0443\u2026");
  }
  getItems() {
    const items = [];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (f instanceof import_obsidian.TFolder && f.path !== "/")
        items.push(f.path + "/");
      else if (f instanceof import_obsidian.TFile && f.extension === "md")
        items.push(f.path);
    }
    return items.sort();
  }
  getItemText(item) {
    return item;
  }
  onChooseItem(item) {
    this.cb(item);
  }
};
function showLinkedNotesPopup(app, event, targetEl, filePath) {
  var _a, _b, _c, _d;
  const fp = filePath != null ? filePath : event.id;
  if (!fp)
    return;
  const file = (_a = app.vault) == null ? void 0 : _a.getAbstractFileByPath(fp);
  if (!(file instanceof import_obsidian.TFile))
    return;
  const fm = (_d = (_c = (_b = app.metadataCache) == null ? void 0 : _b.getFileCache(file)) == null ? void 0 : _c.frontmatter) != null ? _d : {};
  const linkedNotes = Array.isArray(fm.linkedNotes) ? fm.linkedNotes : [];
  if (linkedNotes.length === 0 || !(file instanceof import_obsidian.TFile))
    return;
  document.querySelectorAll(".fc-linked-notes-popup").forEach((el) => el.remove());
  const popup = document.createElement("div");
  popup.className = "fc-linked-notes-popup";
  const title = document.createElement("div");
  title.style.cssText = "font-weight:600;margin-bottom:6px;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;";
  title.textContent = "\u0421\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438";
  popup.appendChild(title);
  for (const notePath of linkedNotes) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer;color:var(--text-accent);";
    row.textContent = (notePath.endsWith("/") ? "\u{1F4C1} " : "\u{1F4C4} ") + notePath.replace(/\/$/, "").split("/").pop();
    row.title = notePath;
    row.onclick = () => {
      const f = app.vault.getAbstractFileByPath(notePath.replace(/\/$/, ""));
      if (f instanceof import_obsidian.TFile)
        app.workspace.openLinkText(notePath, "", false);
      popup.remove();
    };
    popup.appendChild(row);
  }
  const rect = targetEl.getBoundingClientRect();
  popup.style.left = `${rect.left}px`;
  popup.style.top = `${rect.bottom + 4}px`;
  document.body.appendChild(popup);
  const remove = () => {
    popup.remove();
    targetEl.removeEventListener("mouseleave", remove);
  };
  targetEl.addEventListener("mouseleave", remove);
  setTimeout(() => popup.remove(), 5e3);
}
function getLinkedNotesCount(app, filePath) {
  var _a, _b, _c, _d;
  try {
    if (!filePath)
      return 0;
    const file = (_a = app.vault) == null ? void 0 : _a.getAbstractFileByPath(filePath);
    if (!(file instanceof import_obsidian.TFile))
      return 0;
    const fm = (_d = (_c = (_b = app.metadataCache) == null ? void 0 : _b.getFileCache(file)) == null ? void 0 : _c.frontmatter) != null ? _d : {};
    return Array.isArray(fm.linkedNotes) ? fm.linkedNotes.length : 0;
  } catch (e) {
    return 0;
  }
}

// src/notifications.ts
var import_obsidian3 = require("obsidian");
init_utils();
var notifiedSet = /* @__PURE__ */ new Set();
function injectNotificationUI(contentEl, pending, settings, onChange) {
  var _a, _b;
  const section = contentEl.createEl("div", { cls: "fc-enhanced-section" });
  section.createEl("p", { text: "\u{1F514} \u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u043E\u0431\u044B\u0442\u0438\u044F", attr: { style: "font-weight:600;margin-bottom:6px;" } });
  const row1 = section.createEl("div", { attr: { style: "display:flex;align-items:center;gap:8px;margin-bottom:4px;" } });
  const cb = row1.createEl("input");
  cb.type = "checkbox";
  cb.checked = pending.enabled !== false;
  cb.id = "fc-notif-enabled";
  const lbl = row1.createEl("label", { text: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u044F\u0442\u044C" });
  lbl.htmlFor = "fc-notif-enabled";
  cb.addEventListener("change", () => onChange({ enabled: cb.checked }));
  const row2 = section.createEl("div", { attr: { style: "display:flex;align-items:center;gap:8px;margin-bottom:4px;" } });
  row2.createEl("span", { text: "\u0417\u0432\u0443\u043A \u043D\u0430\u0447\u0430\u043B\u0430:", attr: { style: "font-size:12px;min-width:80px;" } });
  const inp1 = row2.createEl("input");
  inp1.type = "text";
  inp1.placeholder = settings.notifications.defaultStartSound || "(\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E)";
  inp1.value = (_a = pending.startSound) != null ? _a : "";
  inp1.style.cssText = "flex:1;font-size:12px;padding:2px 6px;";
  inp1.addEventListener("input", () => onChange({ startSound: inp1.value.trim() || null }));
  const row3 = section.createEl("div", { attr: { style: "display:flex;align-items:center;gap:8px;" } });
  row3.createEl("span", { text: "\u0417\u0432\u0443\u043A \u043A\u043E\u043D\u0446\u0430:", attr: { style: "font-size:12px;min-width:80px;" } });
  const inp2 = row3.createEl("input");
  inp2.type = "text";
  inp2.placeholder = settings.notifications.defaultEndSound || "(\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E)";
  inp2.value = (_b = pending.endSound) != null ? _b : "";
  inp2.style.cssText = "flex:1;font-size:12px;padding:2px 6px;";
  inp2.addEventListener("input", () => onChange({ endSound: inp2.value.trim() || null }));
}
function setupNotifications(app, basePlugin, getSettings) {
  const intervalId = window.setInterval(() => {
    checkAndNotify(app, basePlugin, getSettings());
  }, 15e3);
  setTimeout(() => checkAndNotify(app, basePlugin, getSettings()), 4e3);
  return () => window.clearInterval(intervalId);
}
function testNotifications(app, plugin, settings) {
  var _a, _b;
  const sources = (_b = (_a = plugin.settings) == null ? void 0 : _a.calendarSources) != null ? _b : [];
  if (sources.length === 0) {
    new import_obsidian3.Notice("\u26A0\uFE0F \u041D\u0435\u0442 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u0435\u0439 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u043F\u043B\u0430\u0433\u0438\u043D\u0430", 5e3);
    return;
  }
  let found = 0;
  for (const source of sources) {
    if (source.type !== "local" || !source.directory)
      continue;
    const dir = source.directory;
    const isRoot = dir === "/" || dir === "" || dir === ".";
    const files = app.vault.getFiles().filter((f) => {
      if (f.extension !== "md")
        return false;
      if (isRoot)
        return true;
      return f.path.startsWith(dir + "/") || f.path === dir;
    });
    found += files.length;
  }
  notifiedSet.clear();
  checkAndNotify(app, plugin, settings, true);
  new import_obsidian3.Notice(`\u2705 \u0422\u0435\u0441\u0442 \u0437\u0430\u043F\u0443\u0449\u0435\u043D. \u041D\u0430\u0439\u0434\u0435\u043D\u043E \u0444\u0430\u0439\u043B\u043E\u0432 \u0441\u043E\u0431\u044B\u0442\u0438\u0439: ${found}`, 4e3);
}
function checkAndNotify(app, plugin, settings, force = false) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  if (!settings.notifications.enabled && !force)
    return;
  const now = /* @__PURE__ */ new Date();
  const notifyBeforeMs = ((_a = settings.notifications.notifyBeforeMinutes) != null ? _a : 5) * 60 * 1e3;
  const sources = (_c = (_b = plugin.settings) == null ? void 0 : _b.calendarSources) != null ? _c : [];
  console.log(`[FCEnhanced] Notifications check: ${sources.length} sources, notifyBefore=${settings.notifications.notifyBeforeMinutes}min, time=${now.toLocaleTimeString()}`);
  if (sources.length === 0) {
    console.warn("[FCEnhanced] No calendarSources found on plugin.settings:", plugin.settings);
    return;
  }
  for (const source of sources) {
    if (source.type !== "local" || !source.directory)
      continue;
    const dir = source.directory;
    const isRoot = dir === "/" || dir === "" || dir === ".";
    const files = app.vault.getFiles().filter((f) => {
      if (f.extension !== "md")
        return false;
      if (isRoot)
        return true;
      return f.path.startsWith(dir + "/") || f.path === dir;
    });
    console.log(`[FCEnhanced] Scanning ${files.length} files in "${dir}" (isRoot=${isRoot})`);
    for (const file of files) {
      try {
        const fm = (_f = (_e = (_d = app.metadataCache) == null ? void 0 : _d.getFileCache(file)) == null ? void 0 : _e.frontmatter) != null ? _f : {};
        if (!fm.date || !fm.startTime)
          continue;
        if (((_g = fm.notification) == null ? void 0 : _g.enabled) === false)
          continue;
        const dateStr = fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date).slice(0, 10);
        const startStr = String(fm.startTime).trim().padStart(5, "0");
        const endStr = fm.endTime ? String(fm.endTime).trim().padStart(5, "0") : null;
        const plannedStart = /* @__PURE__ */ new Date(`${dateStr}T${startStr}:00`);
        const plannedEnd = endStr ? /* @__PURE__ */ new Date(`${dateStr}T${endStr}:00`) : null;
        if (isNaN(plannedStart.getTime())) {
          console.warn(`[FCEnhanced] Invalid date for ${file.path}: dateStr="${dateStr}", startStr="${startStr}"`);
          continue;
        }
        const title = (_h = fm.title) != null ? _h : file.basename;
        const msUntilStart = plannedStart.getTime() - now.getTime();
        const windowStart = -(3 * 6e4);
        const windowEnd = notifyBeforeMs + 6e4;
        console.log(`[FCEnhanced] "${title}": msUntilStart=${Math.round(msUntilStart / 1e3)}s, window=[${windowStart / 1e3}s, ${windowEnd / 1e3}s]`);
        if (msUntilStart >= windowStart && msUntilStart <= windowEnd) {
          const key = `start:${file.path}:${dateStr}:${startStr}`;
          if (!notifiedSet.has(key)) {
            notifiedSet.add(key);
            const minLeft = Math.round(msUntilStart / 6e4);
            const msg = minLeft > 0 ? `\u23F0 \u0427\u0435\u0440\u0435\u0437 ${minLeft} \u043C\u0438\u043D: ${title}
\u041D\u0430\u0436\u043C\u0438 \u043D\u0430 \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u2192 \u25B6 \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u043D\u0430\u0447\u0430\u043B\u043E` : `\u23F0 \u041D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F: ${title}
\u041D\u0430\u0436\u043C\u0438 \u043D\u0430 \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u2192 \u25B6 \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u043D\u0430\u0447\u0430\u043B\u043E`;
            new import_obsidian3.Notice(msg, 1e4);
            console.log(`[FCEnhanced] Fired start notification for "${title}"`);
            const startSoundOverride = (_i = fm.notification) == null ? void 0 : _i.startSound;
            const sound = startSoundOverride && typeof startSoundOverride === "string" ? startSoundOverride : settings.notifications.defaultStartSound;
            playAudio(app, sound != null ? sound : null);
          } else {
            console.log(`[FCEnhanced] "${title}" already notified (key=${key})`);
          }
        }
        if (!settings.notifications.notifyOnEnd) {
        } else if (!plannedEnd) {
          console.log(`[FCEnhanced] "${title}": no endTime, skip end notification`);
        } else {
          const msUntilEnd = plannedEnd.getTime() - now.getTime();
          console.log(`[FCEnhanced] "${title}": msUntilEnd=${Math.round(msUntilEnd / 1e3)}s, endWindow=[-180s, 60s]`);
          if (msUntilEnd >= -3 * 6e4 && msUntilEnd <= 6e4) {
            const key = `end:${file.path}:${dateStr}:${endStr}`;
            if (!notifiedSet.has(key)) {
              notifiedSet.add(key);
              new import_obsidian3.Notice(`\u2705 \u0417\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u0442\u0441\u044F: ${title}`, 8e3);
              console.log(`[FCEnhanced] Fired end notification for "${title}"`);
              const endSoundOverride = (_j = fm.notification) == null ? void 0 : _j.endSound;
              const sound = endSoundOverride && typeof endSoundOverride === "string" ? endSoundOverride : settings.notifications.defaultEndSound;
              playAudio(app, sound != null ? sound : null);
            } else {
              console.log(`[FCEnhanced] "${title}" end already notified (key=${key})`);
            }
          }
        }
      } catch (e) {
        console.warn(`[FCEnhanced] Error processing file ${file.path}:`, e);
      }
    }
  }
  if (notifiedSet.size > 1e3)
    notifiedSet.clear();
}

// src/tracking.ts
var import_obsidian5 = require("obsidian");
init_utils();
var autoDashboardAdded = /* @__PURE__ */ new Set();
function setupTracking(app, basePlugin, getSettings) {
  const id = window.setInterval(() => {
    checkAutoAddUntracked(app, basePlugin, getSettings());
  }, 6e4);
  setTimeout(() => checkAutoAddUntracked(app, basePlugin, getSettings()), 5e3);
  return () => window.clearInterval(id);
}
async function checkAutoAddUntracked(app, plugin, settings) {
  var _a, _b, _c, _d, _e, _f, _g;
  const now = /* @__PURE__ */ new Date();
  const sources = (_b = (_a = plugin.settings) == null ? void 0 : _a.calendarSources) != null ? _b : [];
  for (const source of sources) {
    if (source.type !== "local" || !source.directory)
      continue;
    const dir = source.directory;
    const isRoot = dir === "/" || dir === "" || dir === ".";
    const files = app.vault.getFiles().filter((f) => {
      if (f.extension !== "md")
        return false;
      if (isRoot)
        return true;
      return f.path.startsWith(dir + "/") || f.path === dir;
    });
    for (const file of files) {
      const fm = (_e = (_d = (_c = app.metadataCache) == null ? void 0 : _c.getFileCache(file)) == null ? void 0 : _d.frontmatter) != null ? _e : {};
      if (!fm.date || !fm.startTime || !fm.endTime)
        continue;
      const trackEnabled = ((_f = fm.tracking) == null ? void 0 : _f.enabled) !== void 0 ? !!fm.tracking.enabled : settings.tracking.enabledByDefault;
      if (trackEnabled)
        continue;
      const dateStr = fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date).slice(0, 10);
      let plannedStart;
      let plannedEnd;
      try {
        plannedStart = /* @__PURE__ */ new Date(`${dateStr}T${String(fm.startTime).trim()}`);
        const endDateStr = fm.endDate ? fm.endDate instanceof Date ? fm.endDate.toISOString().slice(0, 10) : String(fm.endDate).slice(0, 10) : dateStr;
        plannedEnd = /* @__PURE__ */ new Date(`${endDateStr}T${String(fm.endTime).trim()}`);
        if (!fm.endDate && plannedEnd <= plannedStart) {
          plannedEnd = new Date(plannedEnd.getTime() + 24 * 60 * 60 * 1e3);
        }
      } catch (e) {
        continue;
      }
      if (isNaN(plannedStart.getTime()) || isNaN(plannedEnd.getTime()))
        continue;
      if (now.getTime() < plannedEnd.getTime())
        continue;
      const key = `${file.path}:${fm.date}`;
      if (autoDashboardAdded.has(key))
        continue;
      autoDashboardAdded.add(key);
      try {
        const { saveDashboardEventRecord: saveDashboardEventRecord2 } = await Promise.resolve().then(() => (init_dashboard(), dashboard_exports));
        await saveDashboardEventRecord2(app, plugin, {
          id: file.path,
          title: (_g = fm.title) != null ? _g : file.basename,
          calendarId: file.path.split("/")[0],
          plannedStart: plannedStart.toISOString(),
          plannedEnd: plannedEnd.toISOString(),
          tracked: false,
          linkedNotes: Array.isArray(fm.linkedNotes) ? fm.linkedNotes : []
        });
      } catch (e) {
        console.warn("FCEnhanced: auto dashboard record error:", e);
      }
    }
  }
}
function applyTrackingVisuals(el, event, app, filePath) {
  var _a, _b, _c, _d;
  if (!filePath)
    return;
  const file = (_a = app.vault) == null ? void 0 : _a.getAbstractFileByPath(filePath);
  if (!(file instanceof import_obsidian5.TFile))
    return;
  const fm = (_d = (_c = (_b = app.metadataCache) == null ? void 0 : _b.getFileCache(file)) == null ? void 0 : _c.frontmatter) != null ? _d : {};
  const tracking = fm.tracking;
  if (!(tracking == null ? void 0 : tracking.startedAt) && !(tracking == null ? void 0 : tracking.endedAt))
    return;
  const plannedStart = event.start;
  const plannedEnd = event.end;
  if (!plannedStart || !plannedEnd)
    return;
  const duration = plannedEnd.getTime() - plannedStart.getTime();
  if (duration <= 0)
    return;
  const color = event.backgroundColor || event.borderColor || fm.color || "#3788d8";
  if (tracking.startedAt) {
    const actualStart = new Date(tracking.startedAt);
    const lateMs = actualStart.getTime() - plannedStart.getTime();
    if (lateMs > 6e4) {
      const latePct = Math.min(lateMs / duration * 100, 100);
      const overlay = document.createElement("div");
      overlay.className = "fc-tracking-late-overlay";
      overlay.style.cssText = `position:absolute;top:0;left:0;right:0;height:${latePct}%;background:${dimColor(color, 0.35)};z-index:1;border-radius:3px 3px 0 0;pointer-events:none;`;
      const lbl = document.createElement("div");
      lbl.className = "fc-tracking-label";
      lbl.style.cssText = "position:absolute;top:2px;left:4px;z-index:2;pointer-events:none;font-size:10px;";
      lbl.textContent = `\u25B7 ${fmt(actualStart)}`;
      el.style.position = "relative";
      el.appendChild(overlay);
      el.appendChild(lbl);
    }
  }
  if (tracking.endedAt) {
    const actualEnd = new Date(tracking.endedAt);
    const overMs = actualEnd.getTime() - plannedEnd.getTime();
    if (overMs > 6e4) {
      const overPct = Math.min(overMs / duration * 100, 60);
      const ext = document.createElement("div");
      ext.className = "fc-tracking-overtime";
      ext.style.cssText = `position:absolute;left:0;right:0;bottom:-${overPct}%;height:${overPct}%;background:${color};opacity:0.65;z-index:1;border-radius:0 0 3px 3px;pointer-events:none;`;
      const lbl = document.createElement("div");
      lbl.className = "fc-tracking-label";
      lbl.style.cssText = `position:absolute;bottom:calc(-${overPct}% + 2px);left:4px;z-index:2;pointer-events:none;font-size:10px;`;
      lbl.textContent = `\u25A0 ${fmt(actualEnd)}`;
      el.style.position = "relative";
      el.style.overflow = "visible";
      el.appendChild(ext);
      el.appendChild(lbl);
    }
  }
}
function fmt(d) {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function injectTrackingActionButtons(modalEl, app, plugin, filePath, fm, getSettings) {
  var _a, _b;
  if (modalEl.querySelector(".fc-tracking-actions"))
    return;
  const alreadyStarted = !!((_a = fm == null ? void 0 : fm.tracking) == null ? void 0 : _a.startedAt);
  const alreadyEnded = !!((_b = fm == null ? void 0 : fm.tracking) == null ? void 0 : _b.endedAt);
  const section = document.createElement("div");
  section.className = "fc-tracking-actions fc-enhanced-section";
  const header = document.createElement("p");
  header.style.cssText = "margin:0 0 8px 0;font-weight:600;font-size:13px;color:var(--text-muted);";
  header.textContent = "\u23F1 \u0422\u0440\u0435\u043A\u0438\u043D\u0433 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F";
  section.appendChild(header);
  const status = document.createElement("p");
  status.style.cssText = "font-size:12px;color:var(--text-faint);margin:0 0 8px 0;line-height:1.6;";
  status.textContent = buildStatusText(fm);
  section.appendChild(status);
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
  if (!alreadyStarted) {
    const startBtn = makeTrackingBtn("\u25B6 \u041F\u0440\u0438\u0441\u0442\u0443\u043F\u0438\u043B \u043A \u0437\u0430\u0434\u0430\u0447\u0435", "fc-modal-tracking-start");
    startBtn.addEventListener("click", async () => {
      var _a2;
      startBtn.disabled = true;
      startBtn.textContent = "\u2026";
      const nowISO = (/* @__PURE__ */ new Date()).toISOString();
      try {
        const file = app.vault.getAbstractFileByPath(filePath);
        if (!file)
          throw new Error("file not found");
        await withFileLock(
          filePath,
          () => app.fileManager.processFrontMatter(file, (frontmatter) => {
            if (!frontmatter.tracking)
              frontmatter.tracking = {};
            frontmatter.tracking.enabled = true;
            frontmatter.tracking.startedAt = nowISO;
          })
        );
        fm.tracking = (_a2 = fm.tracking) != null ? _a2 : {};
        fm.tracking.startedAt = nowISO;
        fm.tracking.enabled = true;
        status.textContent = buildStatusText(fm);
        startBtn.remove();
        const endBtn = buildEndBtn(app, plugin, filePath, fm, status);
        btnRow.appendChild(endBtn);
      } catch (err) {
        console.warn("FCEnhanced start tracking:", err);
        startBtn.disabled = false;
        startBtn.textContent = "\u25B6 \u041F\u0440\u0438\u0441\u0442\u0443\u043F\u0438\u043B \u043A \u0437\u0430\u0434\u0430\u0447\u0435";
      }
    });
    btnRow.appendChild(startBtn);
  }
  if (alreadyStarted && !alreadyEnded) {
    const endBtn = buildEndBtn(app, plugin, filePath, fm, status);
    btnRow.appendChild(endBtn);
  }
  section.appendChild(btnRow);
  insertBeforeSubmit(modalEl, section);
}
function buildStatusText(fm) {
  var _a, _b;
  const alreadyStarted = !!((_a = fm == null ? void 0 : fm.tracking) == null ? void 0 : _a.startedAt);
  const alreadyEnded = !!((_b = fm == null ? void 0 : fm.tracking) == null ? void 0 : _b.endedAt);
  if (!alreadyStarted)
    return "\u0415\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u0442\u043E \u2014 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u25B6 \u043A\u043E\u0433\u0434\u0430 \u043F\u0440\u0438\u0441\u0442\u0443\u043F\u0438\u0442\u0435";
  const s = new Date(fm.tracking.startedAt);
  const startStr = `${s.getHours().toString().padStart(2, "0")}:${s.getMinutes().toString().padStart(2, "0")}`;
  if (!alreadyEnded)
    return `\u25B6 \u041D\u0430\u0447\u0430\u0442\u043E \u0432 ${startStr} \u2014 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u23F9 \u043A\u043E\u0433\u0434\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435`;
  const e = new Date(fm.tracking.endedAt);
  const endStr = `${e.getHours().toString().padStart(2, "0")}:${e.getMinutes().toString().padStart(2, "0")}`;
  return `\u2705 \u041D\u0430\u0447\u0430\u0442\u043E ${startStr} \u2192 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E ${endStr}`;
}
function buildEndBtn(app, plugin, filePath, fm, statusEl) {
  const endBtn = makeTrackingBtn("\u23F9 \u0417\u0430\u0432\u0435\u0440\u0448\u0438\u043B \u0437\u0430\u0434\u0430\u0447\u0443", "fc-modal-tracking-end");
  endBtn.addEventListener("click", async () => {
    var _a, _b, _c, _d, _e, _f, _g;
    endBtn.disabled = true;
    endBtn.textContent = "\u2026";
    const nowISO = (/* @__PURE__ */ new Date()).toISOString();
    const startedAt = (_b = (_a = fm == null ? void 0 : fm.tracking) == null ? void 0 : _a.startedAt) != null ? _b : null;
    try {
      const file = app.vault.getAbstractFileByPath(filePath);
      if (!file)
        throw new Error("file not found");
      await withFileLock(
        filePath,
        () => app.fileManager.processFrontMatter(file, (frontmatter) => {
          if (!frontmatter.tracking)
            frontmatter.tracking = {};
          frontmatter.tracking.endedAt = nowISO;
        })
      );
      fm.tracking = (_c = fm.tracking) != null ? _c : {};
      fm.tracking.endedAt = nowISO;
      statusEl.textContent = buildStatusText(fm);
      endBtn.remove();
      try {
        const { saveDashboardEventRecord: saveDashboardEventRecord2 } = await Promise.resolve().then(() => (init_dashboard(), dashboard_exports));
        const _dateStr = fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String((_d = fm.date) != null ? _d : "").slice(0, 10);
        const pStart = _dateStr && fm.startTime ? /* @__PURE__ */ new Date(`${_dateStr}T${String(fm.startTime).trim()}`) : null;
        let pEnd = null;
        if (_dateStr && fm.endTime) {
          const endDateStr = fm.endDate ? fm.endDate instanceof Date ? fm.endDate.toISOString().slice(0, 10) : String(fm.endDate).slice(0, 10) : _dateStr;
          pEnd = /* @__PURE__ */ new Date(`${endDateStr}T${String(fm.endTime).trim()}`);
          if (!fm.endDate && pStart && pEnd <= pStart) {
            pEnd = new Date(pEnd.getTime() + 24 * 60 * 60 * 1e3);
          }
        }
        if (pStart && pEnd) {
          await saveDashboardEventRecord2(app, plugin, {
            id: filePath,
            title: (_g = (_f = fm.title) != null ? _f : (_e = filePath.split("/").pop()) == null ? void 0 : _e.replace(".md", "")) != null ? _g : "",
            calendarId: filePath.split("/")[0],
            plannedStart: pStart.toISOString(),
            plannedEnd: pEnd.toISOString(),
            actualStart: startedAt != null ? startedAt : void 0,
            actualEnd: nowISO,
            tracked: true,
            linkedNotes: Array.isArray(fm.linkedNotes) ? fm.linkedNotes : []
          });
        }
      } catch (e) {
        console.warn("FCEnhanced dashboard record:", e);
      }
    } catch (err) {
      console.warn("FCEnhanced end tracking:", err);
      endBtn.disabled = false;
      endBtn.textContent = "\u23F9 \u0417\u0430\u0432\u0435\u0440\u0448\u0438\u043B \u0437\u0430\u0434\u0430\u0447\u0443";
    }
  });
  return endBtn;
}
function makeTrackingBtn(text, cls) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = text;
  btn.className = `fc-modal-tracking-btn ${cls}`;
  return btn;
}
function injectTrackingUI(modalEl, currentTracking, globalSettings, onChange) {
  var _a;
  if (modalEl.querySelector(".fc-tracking-section"))
    return;
  const state = { enabled: (_a = currentTracking == null ? void 0 : currentTracking.enabled) != null ? _a : globalSettings.tracking.enabledByDefault };
  const section = document.createElement("div");
  section.className = "fc-tracking-section fc-enhanced-section";
  const header = document.createElement("p");
  header.style.cssText = "margin:0 0 6px 0;font-weight:600;font-size:13px;color:var(--text-muted);";
  header.textContent = "\u2699\uFE0F \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0442\u0440\u0435\u043A\u0438\u043D\u0433\u0430";
  section.appendChild(header);
  const row = document.createElement("p");
  row.style.cssText = "display:flex;align-items:center;gap:8px;margin:4px 0;";
  const lbl = document.createElement("label");
  lbl.textContent = "\u0412\u0435\u0441\u0442\u0438 \u0442\u0440\u0435\u043A\u0438\u043D\u0433 \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0441\u043E\u0431\u044B\u0442\u0438\u044F";
  lbl.style.cssText = "font-size:13px;flex:1;";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = state.enabled;
  cb.onchange = () => {
    state.enabled = cb.checked;
    onChange({ ...state });
  };
  row.appendChild(lbl);
  row.appendChild(cb);
  section.appendChild(row);
  const hint = document.createElement("p");
  hint.style.cssText = "font-size:11px;color:var(--text-faint);margin:2px 0 0;";
  hint.textContent = "\u0415\u0441\u043B\u0438 \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u2014 \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432 \u0434\u0430\u0448\u0431\u043E\u0440\u0434 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043F\u043E\u0441\u043B\u0435 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F";
  section.appendChild(hint);
  insertBeforeSubmit(modalEl, section);
}
function insertBeforeSubmit(modalEl, el) {
  const form = modalEl.querySelector("form");
  if (!form)
    return;
  const ps = form.querySelectorAll("p");
  const last = ps[ps.length - 1];
  if (last)
    form.insertBefore(el, last);
  else
    form.appendChild(el);
}

// src/index.ts
init_dashboard();

// src/settings.ts
var import_obsidian6 = require("obsidian");
init_utils();
var EnhancedSettingTab = class {
  constructor(app, plugin, getSettings, saveSettings) {
    this.app = app;
    this.plugin = plugin;
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
  }
  /** Inject our settings section into an existing settings container element */
  render(containerEl) {
    const settings = this.getSettings();
    const sep = containerEl.createEl("hr");
    sep.style.cssText = "margin: 24px 0 16px 0; opacity: 0.3;";
    containerEl.createEl("h2", {
      text: "\u{1F680} \u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u043D\u044B\u0435 \u0444\u0443\u043D\u043A\u0446\u0438\u0438 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044F",
      cls: "fc-enhanced-settings-header"
    });
    containerEl.createEl("h3", { text: "\u{1F514} \u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F", cls: "fc-settings-section-header" });
    new import_obsidian6.Setting(containerEl).setName("\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F").setDesc("\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u0438 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u044C \u0437\u0432\u0443\u043A \u043F\u0440\u0438 \u043D\u0430\u0447\u0430\u043B\u0435/\u043A\u043E\u043D\u0446\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0439").addToggle(
      (t) => t.setValue(settings.notifications.enabled).onChange(async (v) => {
        settings.notifications.enabled = v;
        await this.saveSettings(settings);
      })
    );
    new import_obsidian6.Setting(containerEl).setName("\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u044F\u0442\u044C \u0437\u0430 N \u043C\u0438\u043D\u0443\u0442 \u0434\u043E \u043D\u0430\u0447\u0430\u043B\u0430").setDesc("0 = \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u043C\u043E\u043C\u0435\u043D\u0442 \u043D\u0430\u0447\u0430\u043B\u0430").addSlider(
      (s) => s.setLimits(0, 30, 1).setValue(settings.notifications.notifyBeforeMinutes).setDynamicTooltip().onChange(async (v) => {
        settings.notifications.notifyBeforeMinutes = v;
        await this.saveSettings(settings);
      })
    );
    new import_obsidian6.Setting(containerEl).setName("\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u044F\u0442\u044C \u043E\u0431 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u0438 \u0441\u043E\u0431\u044B\u0442\u0438\u0439").addToggle(
      (t) => t.setValue(settings.notifications.notifyOnEnd).onChange(async (v) => {
        settings.notifications.notifyOnEnd = v;
        await this.saveSettings(settings);
      })
    );
    new import_obsidian6.Setting(containerEl).setName("\u0422\u0435\u0441\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439").setDesc("\u041F\u0440\u0438\u043D\u0443\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0432\u0441\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u044F \u043F\u0440\u044F\u043C\u043E \u0441\u0435\u0439\u0447\u0430\u0441 (\u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0435\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0443 \xAB\u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E\xBB \u0438 \u0443\u0436\u0435 \u0441\u0440\u0430\u0431\u043E\u0442\u0430\u0432\u0448\u0438\u0435)").addButton(
      (b) => b.setButtonText("\u25B6 \u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0442\u0435\u0441\u0442").setCta().onClick(() => testNotifications(this.app, this.plugin, settings))
    );
    new import_obsidian6.Setting(containerEl).setName("\u0417\u0432\u0443\u043A \u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0431\u044B\u0442\u0438\u044F (\u043F\u0443\u0442\u044C \u0432 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435)").setDesc("\u041F\u0443\u0442\u044C \u043A \u0444\u0430\u0439\u043B\u0443 .mp3/.wav/.ogg \u0432 \u0432\u0430\u0448\u0435\u043C \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435. \u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C \u0434\u043B\u044F \u0437\u0432\u0443\u043A\u0430 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E (\u0431\u0438\u043F)").addText(
      (t) => t.setPlaceholder("audio/start-sound.mp3").setValue(settings.notifications.defaultStartSound || "").onChange(async (v) => {
        settings.notifications.defaultStartSound = v.trim() || null;
        await this.saveSettings(settings);
      })
    ).addButton(
      (b) => b.setButtonText("\u25B6 \u0422\u0435\u0441\u0442").onClick(() => playAudio(this.app, settings.notifications.defaultStartSound))
    );
    new import_obsidian6.Setting(containerEl).setName("\u0417\u0432\u0443\u043A \u043A\u043E\u043D\u0446\u0430 \u0441\u043E\u0431\u044B\u0442\u0438\u044F (\u043F\u0443\u0442\u044C \u0432 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435)").setDesc("\u041F\u0443\u0442\u044C \u043A \u0444\u0430\u0439\u043B\u0443 .mp3/.wav/.ogg. \u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C \u0434\u043B\u044F \u0437\u0432\u0443\u043A\u0430 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E").addText(
      (t) => t.setPlaceholder("audio/end-sound.mp3").setValue(settings.notifications.defaultEndSound || "").onChange(async (v) => {
        settings.notifications.defaultEndSound = v.trim() || null;
        await this.saveSettings(settings);
      })
    ).addButton(
      (b) => b.setButtonText("\u25B6 \u0422\u0435\u0441\u0442").onClick(() => playAudio(this.app, settings.notifications.defaultEndSound))
    );
    containerEl.createEl("h3", { text: "\u23F1 \u0422\u0440\u0435\u043A\u0438\u043D\u0433 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F", cls: "fc-settings-section-header" });
    new import_obsidian6.Setting(containerEl).setName("\u0412\u043A\u043B\u044E\u0447\u0430\u0442\u044C \u0442\u0440\u0435\u043A\u0438\u043D\u0433 \u0434\u043B\u044F \u043D\u043E\u0432\u044B\u0445 \u0441\u043E\u0431\u044B\u0442\u0438\u0439 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E").setDesc("\u041C\u043E\u0436\u043D\u043E \u043F\u0435\u0440\u0435\u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u0434\u043B\u044F \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0441\u043E\u0431\u044B\u0442\u0438\u044F").addToggle(
      (t) => t.setValue(settings.tracking.enabledByDefault).onChange(async (v) => {
        settings.tracking.enabledByDefault = v;
        await this.saveSettings(settings);
      })
    );
    new import_obsidian6.Setting(containerEl).setName("\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043A\u043D\u043E\u043F\u043A\u0438 \u0442\u0440\u0435\u043A\u0438\u043D\u0433\u0430").setDesc("\u0412\u0441\u043F\u043B\u044B\u0432\u0430\u044E\u0449\u0430\u044F \u043F\u0430\u043D\u0435\u043B\u044C \xAB\u041F\u0440\u0438\u0441\u0442\u0443\u043F\u0438\u043B / \u0417\u0430\u0432\u0435\u0440\u0448\u0438\u043B\xBB \u043F\u0440\u0438 \u043D\u0430\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0438 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0441\u043E\u0431\u044B\u0442\u0438\u044F").addToggle(
      (t) => t.setValue(settings.tracking.showTrackingButtons).onChange(async (v) => {
        settings.tracking.showTrackingButtons = v;
        await this.saveSettings(settings);
      })
    );
    containerEl.createEl("h3", { text: "\u{1F4CA} \u0414\u0430\u0448\u0431\u043E\u0440\u0434", cls: "fc-settings-section-header" });
    new import_obsidian6.Setting(containerEl).setName("\u041F\u0430\u043F\u043A\u0430 \u0434\u043B\u044F \u0434\u0430\u043D\u043D\u044B\u0445 \u0434\u0430\u0448\u0431\u043E\u0440\u0434\u0430").setDesc("\u041A\u0443\u0434\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u0442\u0440\u0435\u043A\u0438\u043D\u0433\u0430 \u0438 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B").addText(
      (t) => t.setPlaceholder("_calendar_dashboard").setValue(settings.dashboard.saveFolder).onChange(async (v) => {
        settings.dashboard.saveFolder = v.trim() || "_calendar_dashboard";
        await this.saveSettings(settings);
      })
    );
    new import_obsidian6.Setting(containerEl).setName("\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u0430\u0448\u0431\u043E\u0440\u0434").addButton(
      (b) => b.setButtonText("\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u0430\u0448\u0431\u043E\u0440\u0434").setCta().onClick(() => {
        this.plugin.app.workspace.getLeaf("tab").setViewState({
          type: "full-calendar-dashboard",
          active: true
        });
      })
    );
    containerEl.createEl("h3", { text: "\u{1F517} \u041F\u0440\u0438\u0432\u044F\u0437\u043A\u0430 \u0437\u0430\u043C\u0435\u0442\u043E\u043A", cls: "fc-settings-section-header" });
    new import_obsidian6.Setting(containerEl).setName("\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0443 \u0437\u0430\u043C\u0435\u0442\u043E\u043A/\u043F\u0430\u043F\u043E\u043A \u043A \u0441\u043E\u0431\u044B\u0442\u0438\u044F\u043C").addToggle(
      (t) => t.setValue(settings.noteLinker.enabled).onChange(async (v) => {
        settings.noteLinker.enabled = v;
        await this.saveSettings(settings);
      })
    );
  }
};

// src/index.ts
init_utils();
function getFilePath(plugin, eventId) {
  var _a, _b, _c;
  try {
    return (_c = (_b = (_a = plugin.cache.getInfoForEditableEvent(eventId)) == null ? void 0 : _a.location) == null ? void 0 : _b.path) != null ? _c : null;
  } catch (e) {
    return null;
  }
}
(function patchFullCalendar() {
  const tryPatch = (attempts = 0) => {
    var _a, _b;
    const app = window.app;
    if (!app) {
      if (attempts < 40)
        setTimeout(() => tryPatch(attempts + 1), 500);
      return;
    }
    const plugin = (_b = (_a = app.plugins) == null ? void 0 : _a.plugins) == null ? void 0 : _b["obsidian-full-calendar"];
    if (!plugin) {
      if (attempts < 40)
        setTimeout(() => tryPatch(attempts + 1), 500);
      return;
    }
    applyEnhancements(app, plugin).catch(console.error);
  };
  setTimeout(() => tryPatch(), 1500);
})();
async function applyEnhancements(app, plugin) {
  var _a, _b, _c, _d;
  const DATA_KEY = "enhanced_settings";
  const stored = await plugin.loadData();
  let enhancedSettings = {
    notifications: Object.assign({}, DEFAULT_ENHANCED_SETTINGS.notifications, (_a = stored == null ? void 0 : stored[DATA_KEY]) == null ? void 0 : _a.notifications),
    tracking: Object.assign({}, DEFAULT_ENHANCED_SETTINGS.tracking, (_b = stored == null ? void 0 : stored[DATA_KEY]) == null ? void 0 : _b.tracking),
    dashboard: Object.assign({}, DEFAULT_ENHANCED_SETTINGS.dashboard, (_c = stored == null ? void 0 : stored[DATA_KEY]) == null ? void 0 : _c.dashboard),
    noteLinker: Object.assign({}, DEFAULT_ENHANCED_SETTINGS.noteLinker, (_d = stored == null ? void 0 : stored[DATA_KEY]) == null ? void 0 : _d.noteLinker)
  };
  plugin._enhancedSettings = enhancedSettings;
  const getSettings = () => enhancedSettings;
  const saveSettings = async (s) => {
    enhancedSettings = s;
    plugin._enhancedSettings = s;
    const cur = await plugin.loadData();
    await plugin.saveData({ ...cur, [DATA_KEY]: s });
  };
  plugin.registerView(
    DASHBOARD_VIEW_TYPE,
    (leaf) => new DashboardView(leaf, plugin, getSettings)
  );
  plugin.addCommand({
    id: "full-calendar-dashboard",
    name: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u0430\u0448\u0431\u043E\u0440\u0434 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044F",
    callback: () => {
      app.workspace.getLeaf("tab").setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
    }
  });
  patchSettingTab(app, plugin, getSettings, saveSettings);
  patchMoveEventToCalendar(plugin);
  patchRenderCalendar(app, plugin, getSettings);
  const stopNotifications = setupNotifications(app, plugin, getSettings);
  plugin.register(() => stopNotifications());
  const stopTracking = setupTracking(app, plugin, getSettings);
  plugin.register(() => stopTracking());
  const stopLinker = setupNoteLinker(app, plugin);
  plugin.register(() => stopLinker());
  setupModalEnhancer(app, plugin, getSettings);
  console.log("\u2705 Full Calendar Enhanced patch applied");
  new import_obsidian7.Notice("\u{1F4C5} \u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u043D\u044B\u0439 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044C \u0430\u043A\u0442\u0438\u0432\u0435\u043D", 3e3);
}
function patchMoveEventToCalendar(plugin) {
  var _a, _b;
  const origMove = (_b = (_a = plugin.cache) == null ? void 0 : _a.moveEventToCalendar) == null ? void 0 : _b.bind(plugin.cache);
  if (!origMove)
    return;
  plugin.cache.moveEventToCalendar = async function(eventId, newCalendarId) {
    await origMove(eventId, newCalendarId);
    await new Promise((r) => setTimeout(r, 1200));
  };
}
function patchSettingTab(app, plugin, getSettings, saveSettings) {
  const enhancedTab = new EnhancedSettingTab(app, plugin, getSettings, saveSettings);
  const findTab = () => {
    var _a, _b, _c, _d, _e;
    return (_e = (_b = (_a = app.setting) == null ? void 0 : _a.pluginTabs) == null ? void 0 : _b.find((t) => t.plugin === plugin)) != null ? _e : (_d = (_c = app.setting) == null ? void 0 : _c.settingTabs) == null ? void 0 : _d.find((t) => t.plugin === plugin);
  };
  const attachToTab = (t) => {
    const orig = t.display.bind(t);
    t.display = function() {
      orig();
      setTimeout(() => {
        var _a;
        const el = (_a = this.containerEl) != null ? _a : t.containerEl;
        if (el)
          enhancedTab.render(el);
      }, 50);
    };
  };
  const tab = findTab();
  if (tab) {
    attachToTab(tab);
  } else {
    setTimeout(() => {
      const t = findTab();
      if (t)
        attachToTab(t);
    }, 3e3);
  }
}
function patchRenderCalendar(app, plugin, getSettings) {
  var _a, _b, _c;
  const origRender = (_a = plugin.renderCalendar) == null ? void 0 : _a.bind(plugin);
  if (!origRender)
    return;
  plugin.renderCalendar = function(containerEl, eventSources, settings) {
    const origDidMount = settings == null ? void 0 : settings.eventDidMount;
    const origMouseEnter = settings == null ? void 0 : settings.eventMouseEnter;
    const origEventClick = settings == null ? void 0 : settings.eventClick;
    const patched = {
      ...settings,
      eventClick: (info) => {
        var _a2, _b2;
        window.__fcLastClickedEventId = (_b2 = (_a2 = info == null ? void 0 : info.event) == null ? void 0 : _a2.id) != null ? _b2 : null;
        if (origEventClick)
          origEventClick(info);
      },
      eventDidMount: (info) => {
        if (origDidMount)
          origDidMount(info);
        const filePath = getFilePath(plugin, info.event.id);
        try {
          applyTrackingVisuals(info.el, info.event, app, filePath);
        } catch (e) {
        }
        try {
          const count = getLinkedNotesCount(app, filePath);
          if (count > 0) {
            const badge = document.createElement("span");
            badge.className = "fc-linked-notes-badge";
            badge.title = `\u0421\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0445 \u0437\u0430\u043C\u0435\u0442\u043E\u043A: ${count}`;
            badge.textContent = `\u{1F517}${count}`;
            info.el.appendChild(badge);
          }
        } catch (e) {
        }
      },
      eventMouseEnter: (info) => {
        if (origMouseEnter)
          origMouseEnter(info);
        try {
          if (getSettings().noteLinker.showLinkedNotesOnHover) {
            const filePath = getFilePath(plugin, info.event.id);
            showLinkedNotesPopup(app, info.event, info.el, filePath);
          }
        } catch (e) {
        }
      }
    };
    return origRender(containerEl, eventSources, patched);
  };
  try {
    for (const leaf of app.workspace.getLeavesOfType("full-calendar-view")) {
      (_c = (_b = leaf.view) == null ? void 0 : _b.onOpen) == null ? void 0 : _c.call(_b);
    }
  } catch (e) {
  }
}
function setupModalEnhancer(app, plugin, getSettings) {
  window.__fcOnModalRendered = (contentEl, eventId) => {
    var _a, _b, _c, _d;
    if (!contentEl.querySelector("input#title"))
      return;
    const filePath = eventId ? getFilePath(plugin, eventId) : null;
    const pending = {
      notification: { enabled: true, startSound: null, endSound: null },
      tracking: { enabled: getSettings().tracking.enabledByDefault }
    };
    let currentFm = {};
    if (filePath) {
      try {
        const file = app.vault.getAbstractFileByPath(filePath);
        if (file) {
          currentFm = (_c = (_b = (_a = app.metadataCache) == null ? void 0 : _a.getFileCache(file)) == null ? void 0 : _b.frontmatter) != null ? _c : {};
          if (currentFm.notification)
            Object.assign(pending.notification, currentFm.notification);
          if (((_d = currentFm.tracking) == null ? void 0 : _d.enabled) !== void 0)
            pending.tracking.enabled = currentFm.tracking.enabled;
        }
      } catch (e) {
      }
    }
    injectNoteLinkerUI(contentEl, app, plugin);
    if (filePath) {
      injectTrackingActionButtons(contentEl, app, plugin, filePath, currentFm, getSettings);
    }
    injectNotificationUI(contentEl, pending.notification, getSettings(), (ns) => {
      Object.assign(pending.notification, ns);
    });
    injectTrackingUI(contentEl, pending.tracking, getSettings(), (ts) => {
      Object.assign(pending.tracking, ts);
    });
    const form = contentEl.querySelector("form");
    form == null ? void 0 : form.addEventListener("submit", () => {
      setTimeout(async () => {
        var _a2, _b2, _c2;
        try {
          const fp = filePath != null ? filePath : await findNewestFile(app, plugin);
          if (!fp)
            return;
          const file = app.vault.getAbstractFileByPath(fp);
          if (!file)
            return;
          const linkedNotes = getPendingLinkedNotes();
          const cachedFm = (_c2 = (_b2 = (_a2 = app.metadataCache) == null ? void 0 : _a2.getFileCache(file)) == null ? void 0 : _b2.frontmatter) != null ? _c2 : {};
          const isRecurring = !!(cachedFm.daysOfWeek || cachedFm.startRecur || cachedFm.rrule);
          await withFileLock(fp, async () => {
            var _a3;
            if (isRecurring) {
              await safeWriteEnhancedFields(app, file, pending, linkedNotes);
            } else {
              const pfm = (_a3 = app.fileManager) == null ? void 0 : _a3.processFrontMatter;
              if (typeof pfm === "function") {
                await pfm.call(app.fileManager, file, (frontmatter) => {
                  var _a4;
                  const notifToWrite = { enabled: pending.notification.enabled };
                  if (pending.notification.startSound)
                    notifToWrite.startSound = pending.notification.startSound;
                  if (pending.notification.endSound)
                    notifToWrite.endSound = pending.notification.endSound;
                  frontmatter.notification = notifToWrite;
                  frontmatter.tracking = {
                    ...(_a4 = frontmatter.tracking) != null ? _a4 : {},
                    enabled: pending.tracking.enabled
                  };
                  if (linkedNotes.length > 0)
                    frontmatter.linkedNotes = linkedNotes;
                });
              }
            }
          });
        } catch (e) {
          console.warn("FCEnhanced modal submit:", e);
        }
      }, 2500);
    });
  };
}
async function safeWriteEnhancedFields(app, file, pending, linkedNotes) {
  if (!(file instanceof import_obsidian7.TFile))
    return;
  let text = await app.vault.read(file);
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!fmMatch)
    return;
  let fmBody = fmMatch[1];
  const after = text.slice(fmMatch[0].length);
  for (const field of ["notification", "tracking", "linkedNotes"]) {
    fmBody = fmBody.replace(
      new RegExp(`^${field}:[^
]*(?:
[ 	]+[^
]*)*`, "m"),
      ""
    );
  }
  fmBody = fmBody.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, "");
  const lines = [];
  lines.push(`notification:`);
  lines.push(`  enabled: ${pending.notification.enabled !== false}`);
  if (pending.notification.startSound)
    lines.push(`  startSound: "${pending.notification.startSound}"`);
  if (pending.notification.endSound)
    lines.push(`  endSound: "${pending.notification.endSound}"`);
  lines.push(`tracking:`);
  lines.push(`  enabled: ${pending.tracking.enabled}`);
  if (linkedNotes.length > 0) {
    lines.push(`linkedNotes:`);
    for (const n of linkedNotes)
      lines.push(`  - "${n}"`);
  }
  const enhanced = lines.join("\n");
  const newFmBody = fmBody ? `${fmBody}
${enhanced}` : enhanced;
  const newText = `---
${newFmBody}
---
${after}`;
  await app.vault.modify(file, newText);
}
async function findNewestFile(app, plugin) {
  var _a, _b, _c;
  const sources = (_b = (_a = plugin.settings) == null ? void 0 : _a.calendarSources) != null ? _b : [];
  let newest = null;
  const now = Date.now();
  for (const s of sources) {
    if (s.type !== "local" || !s.directory)
      continue;
    const dir = s.directory;
    const isRoot = dir === "/" || dir === "" || dir === ".";
    for (const f of app.vault.getFiles()) {
      const inDir = isRoot ? f.extension === "md" : (f.path.startsWith(dir + "/") || f.path === dir) && f.extension === "md";
      if (inDir && now - f.stat.mtime < 1e4 && (!newest || f.stat.mtime > newest.stat.mtime)) {
        newest = f;
      }
    }
  }
  return (_c = newest == null ? void 0 : newest.path) != null ? _c : null;
}
