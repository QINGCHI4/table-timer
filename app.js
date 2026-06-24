const STORAGE_KEY = "table-timer-v1";

const state = loadState();
let extendTableId = null;

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  activeCount: document.querySelector("#activeCount"),
  recordCount: document.querySelector("#recordCount"),
  tablesList: document.querySelector("#tablesList"),
  recordList: document.querySelector("#recordList"),
  addTableBtn: document.querySelector("#addTableBtn"),
  clearRecordsBtn: document.querySelector("#clearRecordsBtn"),
  tableTemplate: document.querySelector("#tableTemplate"),
  extendDialog: document.querySelector("#extendDialog"),
  extendTarget: document.querySelector("#extendTarget"),
  customMinutes: document.querySelector("#customMinutes"),
  tablePickerDialog: document.querySelector("#tablePickerDialog"),
  tablePicker: document.querySelector("#tablePicker"),
};

function loadState() {
  const fallback = {
    nextTableNumber: 1,
    tables: [],
    records: [],
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.tables) || !Array.isArray(saved.records)) {
      return fallback;
    }
    return {
      nextTableNumber: Number(saved.nextTableNumber) || 1,
      tables: saved.tables,
      records: saved.records,
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatTime(ts) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

function elapsedFor(table, now = Date.now()) {
  if (!table.startedAt) return table.elapsedMs || 0;
  return (table.elapsedMs || 0) + now - table.startedAt;
}

function addTable(number) {
  if (state.tables.some((table) => table.number === number)) {
    alert(`${number} 号桌正在使用中`);
    return;
  }

  state.tables.push({
    id: crypto.randomUUID(),
    number,
    status: "idle",
    startedAt: null,
    elapsedMs: 0,
    extendedMinutes: 0,
    createdAt: Date.now(),
  });
  state.nextTableNumber = Math.max(state.nextTableNumber, number + 1);
  saveState();
  render();
}

function startTable(table) {
  if (table.status === "running") return;
  table.status = "running";
  table.startedAt = Date.now();
  table.firstStartedAt = table.firstStartedAt || table.startedAt;
  saveState();
  render();
}

function extendTable(table, minutes) {
  table.extendedMinutes = (table.extendedMinutes || 0) + minutes;
  table.lastExtendedAt = Date.now();
  saveState();
  render();
}

function finishTable(table) {
  const finishedAt = Date.now();
  const totalMs = elapsedFor(table, finishedAt);
  state.records.unshift({
    id: crypto.randomUUID(),
    tableNumber: table.number,
    startedAt: table.firstStartedAt || table.startedAt || table.createdAt,
    finishedAt,
    elapsedMs: totalMs,
    extendedMinutes: table.extendedMinutes || 0,
    date: todayKey(new Date(finishedAt)),
  });
  state.tables = state.tables.filter((item) => item.id !== table.id);
  saveState();
  render();
}

function removeTable(table) {
  const hasTime = elapsedFor(table) > 0 || table.status === "running";
  if (hasTime && !confirm(`删除 ${table.number} 号桌？当前计时不会保存到当天记录。`)) return;
  state.tables = state.tables.filter((item) => item.id !== table.id);
  saveState();
  render();
}

function clearTodayRecords() {
  const today = todayKey();
  const todayRecords = state.records.filter((record) => record.date === today);
  if (todayRecords.length === 0) return;
  if (!confirm("清空当天记录？")) return;
  state.records = state.records.filter((record) => record.date !== today);
  saveState();
  render();
}

function tableMeta(table) {
  const lines = [];
  if (table.firstStartedAt) {
    lines.push(`开始 ${formatTime(table.firstStartedAt)}`);
  } else {
    lines.push("未开始");
  }
  if (table.extendedMinutes) {
    lines.push(`已延长 ${table.extendedMinutes} 分钟`);
  }
  return lines.join(" · ");
}

function renderTables() {
  els.tablesList.innerHTML = "";

  const sortedTables = [...state.tables].sort((a, b) => a.number - b.number);

  if (sortedTables.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "还没有桌子";
    els.tablesList.append(empty);
    return;
  }

  const now = Date.now();
  sortedTables.forEach((table) => {
    const node = els.tableTemplate.content.firstElementChild.cloneNode(true);
    node.classList.toggle("running", table.status === "running");
    node.classList.toggle("paused", table.status === "paused");
    node.dataset.id = table.id;
    node.querySelector(".status-text").textContent = table.status === "running" ? "计时中" : "未开始";
    node.querySelector(".table-number").textContent = `${table.number} 号桌`;
    node.querySelector(".timer").textContent = formatClock(elapsedFor(table, now));
    node.querySelector(".meta").textContent = tableMeta(table);
    node.querySelector('[data-action="start"]').textContent = table.status === "running" ? "计时中" : "开始计时";
    node.querySelector('[data-action="start"]').disabled = table.status === "running";
    els.tablesList.append(node);
  });
}

function renderRecords() {
  const today = todayKey();
  const records = state.records.filter((record) => record.date === today);
  els.recordList.innerHTML = "";

  if (records.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "当天还没有结束记录";
    els.recordList.append(empty);
    return;
  }

  records.forEach((record) => {
    const item = document.createElement("div");
    item.className = "record-item";
    item.dataset.recordId = record.id;
    const extra = record.extendedMinutes ? ` · 延长 ${record.extendedMinutes} 分钟` : "";
    item.innerHTML = `
      <strong>${record.tableNumber} 号桌</strong>
      <span class="record-time">${formatClock(record.elapsedMs)}</span>
      <button class="record-delete" type="button" data-action="delete-record">删除</button>
      <span class="record-detail">${formatTime(record.startedAt)} - ${formatTime(record.finishedAt)}${extra}</span>
    `;
    els.recordList.append(item);
  });
}

function deleteRecord(recordId) {
  state.records = state.records.filter((record) => record.id !== recordId);
  saveState();
  render();
}

function renderTablePicker() {
  const activeNumbers = new Set(state.tables.map((table) => table.number));
  els.tablePicker.innerHTML = "";

  for (let number = 1; number <= 10; number += 1) {
    const button = document.createElement("button");
    button.type = "submit";
    button.value = String(number);
    button.textContent = `${number}`;
    button.disabled = activeNumbers.has(number);
    els.tablePicker.append(button);
  }
}

function renderSummary() {
  const today = todayKey();
  const active = state.tables.filter((table) => table.status === "running").length;
  const records = state.records.filter((record) => record.date === today).length;
  els.activeCount.textContent = active;
  els.recordCount.textContent = records;
  els.todayLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
}

function render() {
  renderSummary();
  renderTables();
  renderRecords();
  renderTablePicker();
}

els.addTableBtn.addEventListener("click", () => {
  renderTablePicker();
  els.tablePickerDialog.showModal();
});
els.clearRecordsBtn.addEventListener("click", clearTodayRecords);

els.recordList.addEventListener("click", (event) => {
  const button = event.target.closest('button[data-action="delete-record"]');
  if (!button) return;
  const item = button.closest(".record-item");
  if (!item) return;
  deleteRecord(item.dataset.recordId);
});

els.tablesList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest(".table-card");
  const table = state.tables.find((item) => item.id === card.dataset.id);
  if (!table) return;

  const action = button.dataset.action;
  if (action === "start") startTable(table);
  if (action === "finish") finishTable(table);
  if (action === "remove") removeTable(table);
  if (action === "extend") {
    extendTableId = table.id;
    els.extendTarget.textContent = `${table.number} 号桌`;
    els.customMinutes.value = "";
    els.extendDialog.showModal();
  }
});

els.extendDialog.addEventListener("close", () => {
  const table = state.tables.find((item) => item.id === extendTableId);
  if (!table) return;

  const value = els.extendDialog.returnValue;
  if (value === "cancel" || value === "") return;
  const minutes = value === "custom" ? Number(els.customMinutes.value) : Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  extendTable(table, Math.round(minutes));
  extendTableId = null;
});

els.tablePickerDialog.addEventListener("close", () => {
  const value = els.tablePickerDialog.returnValue;
  if (value === "cancel" || value === "") return;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10) return;
  addTable(number);
});

setInterval(() => {
  renderSummary();
  renderTables();
}, 1000);

render();
