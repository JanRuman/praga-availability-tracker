const DATA_ROOT = "../data";

function $(id) {
  return document.getElementById(id);
}

function showError(msg) {
  const el = $("error");
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return await res.json();
}

function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

function formatMonthTitle(y, m) {
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymFromIso(iso) {
  return iso.slice(0, 7); // YYYY-MM
}

function nextMonth(y, m) {
  if (m === 12) return [y + 1, 1];
  return [y, m + 1];
}

function compareIso(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function buildMonthGrid(y, m, dayMap, rangeFrom, rangeTo) {
  const monthEl = document.createElement("div");
  monthEl.className = "month";

  const header = document.createElement("div");
  header.className = "monthHeader";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = formatMonthTitle(y, m);
  const meta = document.createElement("div");
  meta.className = "meta";

  const key = `${y}-${pad2(m)}`;
  const total = daysInMonth(y, m);
  let ok = 0;
  let bad = 0;
  for (let d = 1; d <= total; d++) {
    const iso = `${y}-${pad2(m)}-${pad2(d)}`;
    if (rangeFrom && compareIso(iso, rangeFrom) < 0) continue;
    if (rangeTo && compareIso(iso, rangeTo) > 0) continue;
    const entry = dayMap.get(iso);
    if (!entry) continue;
    if (entry.status === "available") ok++;
    else bad++;
  }
  meta.textContent = `${ok} free, ${bad} booked`;

  header.appendChild(title);
  header.appendChild(meta);
  monthEl.appendChild(header);

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (const w of wd) {
    const th = document.createElement("th");
    th.textContent = w;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const first = new Date(y, m - 1, 1);
  // JS: 0=Sun, 1=Mon... we want Mon=0
  const offset = (first.getDay() + 6) % 7;
  const totalCells = offset + total;
  const rows = Math.ceil(totalCells / 7);

  let day = 1;
  for (let r = 0; r < rows; r++) {
      const tr = document.createElement("tr");
    for (let c = 0; c < 7; c++) {
      const td = document.createElement("td");
      const idx = r * 7 + c;
      if (idx < offset || day > total) {
        td.innerHTML = `<div class="cell empty">·</div>`;
      } else {
        const iso = `${y}-${pad2(m)}-${pad2(day)}`;
        const inRange =
          (!rangeFrom || compareIso(iso, rangeFrom) >= 0) && (!rangeTo || compareIso(iso, rangeTo) <= 0);
        const entry = dayMap.get(iso);
        let badge = `<span class="badge">no data</span>`;
        let price = "";
        let tdClass = "";
        if (entry && inRange) {
          if (entry.status === "available") {
            badge = `<span class="badge ok">free</span>`;
            tdClass = "free";
          } else {
            badge = `<span class="badge bad">booked</span>`;
            tdClass = "booked";
          }
          if (entry.price_eur != null) price = `<div class="price">${entry.price_eur} EUR</div>`;
        }
        if (tdClass) td.classList.add(tdClass);
        td.innerHTML = `<div class="cell"><div>${day}</div>${badge}${price}</div>`;
        day++;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  monthEl.appendChild(table);
  return monthEl;
}

function computeDefaultRange(days) {
  if (!days.length) return { from: "", to: "" };
  const dates = days.map((d) => d.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

function buildDayMap(days) {
  const m = new Map();
  for (const d of days) m.set(d.date, d);
  return m;
}

function monthsBetween(fromIso, toIso) {
  const a = isoToDate(fromIso);
  const b = isoToDate(toIso);
  let y = a.getFullYear();
  let m = a.getMonth() + 1;
  const endY = b.getFullYear();
  const endM = b.getMonth() + 1;
  const out = [];
  while (y < endY || (y === endY && m <= endM)) {
    out.push([y, m]);
    [y, m] = nextMonth(y, m);
  }
  return out;
}

async function loadSnapshot(dateStr) {
  if (dateStr === "latest") {
    return await fetchJson(`${DATA_ROOT}/latest.json`);
  }
  return await fetchJson(`${DATA_ROOT}/snapshots/${dateStr}.json`);
}

async function init() {
  showError("");
  const idx = await fetchJson(`${DATA_ROOT}/index.json`).catch(() => ({ snapshots: [] }));

  const snapshotSel = $("snapshot");
  snapshotSel.innerHTML = "";
  const optLatest = document.createElement("option");
  optLatest.value = "latest";
  optLatest.textContent = "latest";
  snapshotSel.appendChild(optLatest);
  for (const s of idx.snapshots || []) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    snapshotSel.appendChild(opt);
  }

  const snap = await loadSnapshot("latest");
  await populateApartmentsAndRender(snap);

  $("apply").addEventListener("click", async () => {
    try {
      showError("");
      const snap2 = await loadSnapshot(snapshotSel.value);
      await populateApartmentsAndRender(snap2, { preserveSelection: true });
    } catch (e) {
      showError(String(e));
    }
  });

  $("reset").addEventListener("click", async () => {
    try {
      showError("");
      const snap2 = await loadSnapshot(snapshotSel.value);
      await populateApartmentsAndRender(snap2, { preserveSelection: true, resetRange: true });
    } catch (e) {
      showError(String(e));
    }
  });
}

async function populateApartmentsAndRender(snapshot, opts = {}) {
  const aptSel = $("apartment");
  const prevApt = aptSel.value;
  const shouldPreserve = opts.preserveSelection && prevApt;

  aptSel.innerHTML = "";
  for (const a of snapshot.apartments || []) {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.id} — ${a.name}`;
    aptSel.appendChild(opt);
  }

  if (shouldPreserve) {
    const exists = Array.from(aptSel.options).some((o) => o.value === prevApt);
    if (exists) aptSel.value = prevApt;
  }

  const aptId = aptSel.value;
  const apt = (snapshot.apartments || []).find((a) => a.id === aptId);
  if (!apt) return;

  const defaults = computeDefaultRange(apt.days || []);
  const fromEl = $("from");
  const toEl = $("to");
  if (opts.resetRange || !fromEl.value || !toEl.value) {
    fromEl.value = defaults.from;
    toEl.value = defaults.to;
  }

  // Re-render whenever apartment changes.
  aptSel.onchange = async () => {
    await populateApartmentsAndRender(snapshot, { preserveSelection: true, resetRange: true });
  };

  renderMonths(snapshot, apt, fromEl.value, toEl.value);
}

function renderMonths(snapshot, apt, rangeFrom, rangeTo) {
  const monthsEl = $("months");
  monthsEl.innerHTML = "";

  const days = apt.days || [];
  if (!days.length) {
    monthsEl.textContent = "No calendar data found for this apartment in this snapshot.";
    return;
  }

  const dayMap = buildDayMap(days);
  const min = days.map((d) => d.date).sort()[0];
  const max = days.map((d) => d.date).sort().slice(-1)[0];

  const from = rangeFrom || min;
  const to = rangeTo || max;
  const monthList = monthsBetween(from, to);

  for (const [y, m] of monthList) {
    monthsEl.appendChild(buildMonthGrid(y, m, dayMap, from, to));
  }
}

init().catch((e) => showError(String(e)));

