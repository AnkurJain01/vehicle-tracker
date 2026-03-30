const DB_NAME = "vehicleExpenseTrackerDB";
const DB_VERSION = 2;
const DEFAULT_CATEGORIES = ["Fuel", "Service", "Repair", "Toll", "Parking", "Insurance", "Other"];
// DB_VERSION is bumped whenever new object stores are added.
// Existing users with an older local DB need an upgrade step so IndexedDB creates the new stores.

const STORE_NAMES = ["vehicles", "trips", "expenses", "categories", "settings"];
const DEFAULT_MAINTENANCE_CATEGORIES = ["Service", "Repair", "Tyre", "Wheel Alignment", "Wheel Balance", "Alignment", "Balancing", "Pollution", "Insurance"];
let db;
let activeFilters = {
  vehicleId: "",
  tripId: "",
  category: "",
  startDate: "",
  endDate: ""
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initDB();
    await seedCategories();
    await seedSettings();
    bindTabs();
    bindForms();
    bindBackupRestore();
    bindReportControls();
    bindMaintenanceControls();
    registerServiceWorker();
    await refreshUI();
  } catch (error) {
    console.error("App init failed:", error);
  }
});

function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      db = event.target.result;
      if (!db.objectStoreNames.contains("vehicles")) {
        db.createObjectStore("vehicles", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("trips")) {
        db.createObjectStore("trips", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("expenses")) {
        db.createObjectStore("expenses", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("categories")) {
        db.createObjectStore("categories", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
    };
    req.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

async function seedCategories() {
  const categories = await getAll("categories");
  if (categories.length) return;
  for (const name of DEFAULT_CATEGORIES) {
    await put("categories", { id: slugify(name), name });
  }
}

async function seedSettings() {
  const allSettings = await getAll("settings");
  const maintenanceSetting = allSettings.find(item => item.id === "maintenanceCategories");
  if (!maintenanceSetting) {
    await put("settings", {
      id: "maintenanceCategories",
      values: DEFAULT_MAINTENANCE_CATEGORIES
    });
  }
}

async function getSetting(id) {
  const settings = await getAll("settings");
  return settings.find(item => item.id === id) || null;
}

async function saveSetting(id, payload) {
  await put("settings", { id, ...payload });
}

function tx(storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}
function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function put(storeName, item) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").put(item);
    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}
function remove(storeName, id) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function slugify(text) {
  return String(text).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
}
function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
}
function defaultTripThumbnail(name) {
  const label = encodeURIComponent((name || "Trip").slice(0, 2).toUpperCase());
  return `https://dummyimage.com/200x200/e2e8f0/334155.png&text=${label}`;
}
function sumCost(items) {
  return items.reduce((sum, item) => sum + Number(item.cost || 0), 0);
}
function rangeMatches(date, startDate, endDate) {
  if (!date) return false;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab, .tab-panel").forEach(el => el.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

function bindForms() {
  document.getElementById("vehicleForm").addEventListener("submit", saveVehicleHandler);
  document.getElementById("tripForm").addEventListener("submit", saveTripHandler);
  document.getElementById("expenseForm").addEventListener("submit", saveExpenseHandler);
  document.getElementById("expenseFilterForm").addEventListener("submit", applyFiltersHandler);
  document.getElementById("vehicleResetBtn").addEventListener("click", resetVehicleForm);
  document.getElementById("tripResetBtn").addEventListener("click", resetTripForm);
  document.getElementById("expenseResetBtn").addEventListener("click", resetExpenseForm);
  document.getElementById("clearFiltersBtn").addEventListener("click", clearFilters);
  document.getElementById("addCategoryBtn").addEventListener("click", addCategoryHandler);
  document.getElementById("expenseDate").value = todayISO();
}

function bindBackupRestore() {
  document.getElementById("downloadBackupBtn").addEventListener("click", downloadBackup);
  document.getElementById("restoreBackupBtn").addEventListener("click", () => {
    document.getElementById("restoreBackupInput").click();
  });
  document.getElementById("restoreBackupInput").addEventListener("change", restoreBackupFromFile);
}

function bindReportControls() {
  const reportPeriod = document.getElementById("reportPeriod");
  if (reportPeriod) {
    reportPeriod.addEventListener("change", () => refreshUI());
  }
}

function bindMaintenanceControls() {
  const vehicleFilter = document.getElementById("maintenanceVehicleFilter");
  if (vehicleFilter) {
    vehicleFilter.addEventListener("change", () => refreshUI());
  }
}

async function saveVehicleHandler(event) {
  event.preventDefault();
  const id = document.getElementById("vehicleId").value || uid("veh");
  const item = {
    id,
    type: document.getElementById("vehicleType").value,
    name: document.getElementById("vehicleName").value.trim()
  };
  await put("vehicles", item);
  resetVehicleForm();
  await refreshUI();
}

async function saveTripHandler(event) {
  event.preventDefault();
  const fileInput = document.getElementById("tripThumbnail");
  const existingId = document.getElementById("tripId").value;
  const priorTrips = await getAll("trips");
  const existingTrip = priorTrips.find(t => t.id === existingId);
  let thumbnail = existingTrip?.thumbnail || "";
  if (fileInput.files?.[0]) {
    thumbnail = await fileToDataUrl(fileInput.files[0]);
  }
  const item = {
    id: existingId || uid("trip"),
    name: document.getElementById("tripName").value.trim(),
    startDate: document.getElementById("tripStartDate").value,
    endDate: document.getElementById("tripEndDate").value,
    totalKms: Number(document.getElementById("tripTotalKms").value || 0),
    thumbnail: thumbnail || defaultTripThumbnail(document.getElementById("tripName").value.trim())
  };
  await put("trips", item);
  resetTripForm();
  await refreshUI();
}

async function saveExpenseHandler(event) {
  event.preventDefault();
  const id = document.getElementById("expenseId").value || uid("exp");
  const item = {
    id,
    name: document.getElementById("expenseName").value.trim(),
    date: document.getElementById("expenseDate").value,
    vehicleId: document.getElementById("expenseVehicle").value,
    kmReading: Number(document.getElementById("expenseKmReading").value || 0),
    cost: Number(document.getElementById("expenseCost").value || 0),
    tripId: document.getElementById("expenseTrip").value || "",
    otherInfo: document.getElementById("expenseOtherInfo").value.trim(),
    category: document.getElementById("expenseCategory").value,
    fuelVolume: Number(document.getElementById("expenseFuelVolume").value || 0)
  };
  await put("expenses", item);
  resetExpenseForm();
  await refreshUI();
}

function applyFiltersHandler(event) {
  event.preventDefault();
  activeFilters = {
    vehicleId: document.getElementById("filterVehicle").value,
    tripId: document.getElementById("filterTrip").value,
    category: document.getElementById("filterCategory").value,
    startDate: document.getElementById("filterStartDate").value,
    endDate: document.getElementById("filterEndDate").value
  };
  refreshUI();
}

function clearFilters() {
  activeFilters = { vehicleId: "", tripId: "", category: "", startDate: "", endDate: "" };
  document.getElementById("expenseFilterForm").reset();
  refreshUI();
}

async function addCategoryHandler() {
  const input = document.getElementById("newCategoryInput");
  const name = input.value.trim();
  if (!name) return;
  await put("categories", { id: slugify(name), name });
  input.value = "";
  await refreshUI();
  document.getElementById("expenseCategory").value = name;
}

function resetVehicleForm() {
  document.getElementById("vehicleForm").reset();
  document.getElementById("vehicleId").value = "";
  document.getElementById("vehicleFormTitle").textContent = "Add Vehicle";
}
function resetTripForm() {
  document.getElementById("tripForm").reset();
  document.getElementById("tripId").value = "";
  document.getElementById("tripFormTitle").textContent = "Add Trip";
}
function resetExpenseForm() {
  document.getElementById("expenseForm").reset();
  document.getElementById("expenseId").value = "";
  document.getElementById("expenseFormTitle").textContent = "Add Expense";
  document.getElementById("expenseDate").value = todayISO();
}

async function refreshUI() {
  const [vehicles, trips, expenses, categories, maintenanceSetting] = await Promise.all([
    getAll("vehicles"),
    getAll("trips"),
    getAll("expenses"),
    getAll("categories"),
    getSetting("maintenanceCategories")
  ]);

  populateDropdowns({ vehicles, trips, categories });
  renderVehicles(vehicles);
  renderTrips(trips, expenses);
  renderExpenses(expenses, vehicles, trips);
  renderMaintenance({ vehicles, expenses, categories, maintenanceSetting });
  renderReports({ vehicles, trips, expenses });
  renderDashboard({ vehicles, trips, expenses });
}

function populateDropdowns({ vehicles, trips, categories }) {
  const vehicleOpts = `<option value="">Select vehicle</option>` + vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.name)} (${escapeHtml(v.type)})</option>`).join("");
  document.getElementById("expenseVehicle").innerHTML = vehicleOpts;

  const tripOpts = `<option value="">No trip</option>` + trips.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  document.getElementById("expenseTrip").innerHTML = tripOpts;

  const categoryOpts = `<option value="">Select category</option>` + categories
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
  document.getElementById("expenseCategory").innerHTML = categoryOpts;

  document.getElementById("filterVehicle").innerHTML = `<option value="">All vehicles</option>` + vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join("");
  document.getElementById("filterTrip").innerHTML = `<option value="">All trips</option>` + trips.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  document.getElementById("filterCategory").innerHTML = `<option value="">All categories</option>` + categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");

  document.getElementById("filterVehicle").value = activeFilters.vehicleId;
  document.getElementById("filterTrip").value = activeFilters.tripId;
  document.getElementById("filterCategory").value = activeFilters.category;
  document.getElementById("filterStartDate").value = activeFilters.startDate;
  document.getElementById("filterEndDate").value = activeFilters.endDate;

  const maintenanceVehicleFilter = document.getElementById("maintenanceVehicleFilter");
  if (maintenanceVehicleFilter) {
    const currentValue = maintenanceVehicleFilter.value;
    maintenanceVehicleFilter.innerHTML = `<option value="">All vehicles</option>` + vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join("");
    if ([...maintenanceVehicleFilter.options].some(opt => opt.value === currentValue)) {
      maintenanceVehicleFilter.value = currentValue;
    }
  }
}

function renderVehicles(vehicles) {
  const container = document.getElementById("vehicleList");
  if (!vehicles.length) return renderEmpty(container);
  container.innerHTML = vehicles.map(v => `
    <div class="list-item">
      <div class="list-row">
        <div>
          <strong>${escapeHtml(v.name)}</strong> <span class="pill">${escapeHtml(v.type)}</span>
          <div class="meta">Internal ID: ${escapeHtml(v.id)}</div>
        </div>
      </div>
      <div class="item-actions">
        <button class="secondary" onclick="editVehicle('${v.id}')">Edit</button>
        <button class="danger" onclick="deleteVehicle('${v.id}')">Delete</button>
      </div>
    </div>
  `).join("");
}

function renderTrips(trips, expenses) {
  const container = document.getElementById("tripList");
  if (!trips.length) return renderEmpty(container);
  container.innerHTML = trips.map(t => {
    const totalExpense = sumCost(expenses.filter(e => e.tripId === t.id));
    return `
      <div class="list-item">
        <div class="item-header">
          <img class="thumb" src="${t.thumbnail || defaultTripThumbnail(t.name)}" alt="Trip thumbnail" />
          <div>
            <strong>${escapeHtml(t.name)}</strong>
            <div class="meta">${formatDate(t.startDate)} → ${formatDate(t.endDate)}</div>
            <div class="meta">${Number(t.totalKms || 0).toFixed(1)} KM · ${formatCurrency(totalExpense)}</div>
          </div>
        </div>
        <div class="meta">Internal ID: ${escapeHtml(t.id)}</div>
        <div class="item-actions">
          <button class="secondary" onclick="editTrip('${t.id}')">Edit</button>
          <button class="danger" onclick="deleteTrip('${t.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

function getFilteredExpenses(expenses) {
  return expenses.filter(exp => {
    if (activeFilters.vehicleId && exp.vehicleId !== activeFilters.vehicleId) return false;
    if (activeFilters.tripId && exp.tripId !== activeFilters.tripId) return false;
    if (activeFilters.category && exp.category !== activeFilters.category) return false;
    if (!rangeMatches(exp.date, activeFilters.startDate, activeFilters.endDate)) return false;
    return true;
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function renderExpenses(expenses, vehicles, trips) {
  const container = document.getElementById("expenseList");
  const filtered = getFilteredExpenses(expenses);
  if (!filtered.length) return renderEmpty(container);

  container.innerHTML = filtered.map(exp => {
    const vehicle = vehicles.find(v => v.id === exp.vehicleId);
    const trip = trips.find(t => t.id === exp.tripId);
    return `
      <div class="list-item">
        <div class="list-row">
          <div>
            <strong>${escapeHtml(exp.name)}</strong> <span class="pill">${escapeHtml(exp.category)}</span>
            <div class="meta">${formatDate(exp.date)} · ${vehicle ? escapeHtml(vehicle.name) : "Unknown vehicle"} · ${formatCurrency(exp.cost)}</div>
            <div class="meta">KM: ${Number(exp.kmReading || 0).toFixed(1)}${trip ? ` · Trip: ${escapeHtml(trip.name)}` : ""}</div>
            ${exp.otherInfo ? `<div class="meta">${escapeHtml(exp.otherInfo)}</div>` : ""}
          </div>
        </div>
        <div class="item-actions">
          <button class="secondary" onclick="editExpense('${exp.id}')">Edit</button>
          <button class="danger" onclick="deleteExpense('${exp.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderDashboard({ vehicles, trips, expenses }) {
  const stats = document.getElementById("dashboardStats");
  const monthRange = getCurrentMonthRange();
  const currentMonthExpenses = expenses.filter(e => rangeMatches(e.date, monthRange.start, monthRange.end));
  const cards = [
    { label: "Vehicles", value: vehicles.length },
    { label: "Trips", value: trips.length },
    { label: "Expenses", value: expenses.length },
    { label: "This Month", value: formatCurrency(sumCost(currentMonthExpenses)) }
  ];
  stats.innerHTML = cards.map(card => `<div class="stat-card"><h3>${card.label}</h3><strong>${card.value}</strong></div>`).join("");

  const quick = document.getElementById("quickInsights");
  const recent = [...expenses].sort((a,b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
  quick.innerHTML = "";
  if (!recent.length) {
    renderEmpty(quick);
    return;
  }
  quick.innerHTML = recent.map(item => `
    <div class="list-item">
      <strong>${escapeHtml(item.name)}</strong>
      <div class="meta">${formatDate(item.date)} · ${escapeHtml(item.category)} · ${formatCurrency(item.cost)}</div>
    </div>
  `).join("");
}


function renderMaintenance({ vehicles, expenses, categories, maintenanceSetting }) {
  const maintenanceList = document.getElementById("maintenanceList");
  const maintenanceSummary = document.getElementById("maintenanceSummary");
  const maintenanceCategoryConfig = document.getElementById("maintenanceCategoryConfig");
  const selectedVehicleId = document.getElementById("maintenanceVehicleFilter")?.value || "";
  const enabledCategories = Array.isArray(maintenanceSetting?.values) ? maintenanceSetting.values : DEFAULT_MAINTENANCE_CATEGORIES;

  maintenanceCategoryConfig.innerHTML = categories
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(category => {
      const checked = enabledCategories.includes(category.name) ? "checked" : "";
      const checkboxId = `maint-cat-${slugify(category.name)}`;
      return `
        <div class="check-item">
          <input type="checkbox" id="${checkboxId}" data-category="${escapeHtml(category.name)}" ${checked} onchange="toggleMaintenanceCategory(this.dataset.category, this.checked)" />
          <label for="${checkboxId}">
            <span>${escapeHtml(category.name)}</span>
            <span class="pill">${enabledCategories.includes(category.name) ? "Included" : "Excluded"}</span>
          </label>
        </div>
      `;
    }).join("");

  const filtered = expenses
    .filter(exp => enabledCategories.includes(exp.category))
    .filter(exp => !selectedVehicleId || exp.vehicleId === selectedVehicleId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (!filtered.length) {
    maintenanceSummary.innerHTML = `<div class="list-item"><strong>No maintenance entries</strong><div class="meta">Try enabling more categories or choosing another vehicle.</div></div>`;
    renderEmpty(maintenanceList);
    return;
  }

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const totalCost = sumCost(filtered);
  const latestEntry = filtered[0];
  const latestService = filtered.find(item => item.category === "Service");

  maintenanceSummary.innerHTML = `
    <div class="summary-grid">
      <div class="stat-card">
        <h3>Vehicle</h3>
        <strong>${escapeHtml(selectedVehicle ? selectedVehicle.name : "All Vehicles")}</strong>
      </div>
      <div class="stat-card">
        <h3>Total Entries</h3>
        <strong>${filtered.length}</strong>
      </div>
      <div class="stat-card">
        <h3>Total Cost</h3>
        <strong>${formatCurrency(totalCost)}</strong>
      </div>
      <div class="stat-card">
        <h3>Last Service</h3>
        <strong>${latestService ? formatDate(latestService.date) : "-"}</strong>
      </div>
    </div>
    <div class="list-item">
      <strong>Latest Maintenance Entry</strong>
      <div class="meta">${escapeHtml(latestEntry.name)} · ${escapeHtml(latestEntry.category)} · ${formatDate(latestEntry.date)} · ${formatCurrency(latestEntry.cost)}</div>
    </div>
  `;

  const grouped = groupExpensesByCategory(filtered);
  maintenanceList.innerHTML = grouped.map(group => `
    <div class="maintenance-group">
      <h3 class="maintenance-group-title">${escapeHtml(group.category)}</h3>
      <div class="section-subtitle">${group.items.length} entries · ${formatCurrency(sumCost(group.items))}</div>
      <div class="stack">
        ${group.items.map(item => {
          const vehicle = vehicles.find(v => v.id === item.vehicleId);
          return `
            <div class="list-item">
              <strong>${escapeHtml(item.name)}</strong>
              <div class="meta">${formatDate(item.date)} · ${vehicle ? escapeHtml(vehicle.name) : "Unknown vehicle"} · ${formatCurrency(item.cost)}</div>
              <div class="meta">KM: ${Number(item.kmReading || 0).toFixed(1)}</div>
              ${item.otherInfo ? `<div class="meta">${escapeHtml(item.otherInfo)}</div>` : ""}
              <div class="item-actions">
                <button class="secondary" onclick="editExpense('${item.id}')">Edit</button>
                <button class="danger" onclick="deleteExpense('${item.id}')">Delete</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `).join("");
}

function groupExpensesByCategory(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.category)) {
      map.set(item.category, []);
    }
    map.get(item.category).push(item);
  }
  return [...map.entries()]
    .map(([category, groupedItems]) => ({ category, items: groupedItems }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

async function toggleMaintenanceCategory(category, checked) {
  const current = await getSetting("maintenanceCategories");
  const values = Array.isArray(current?.values) ? [...current.values] : [];
  const nextValues = checked
    ? Array.from(new Set([...values, category]))
    : values.filter(item => item !== category);
  await saveSetting("maintenanceCategories", { values: nextValues });
  await refreshUI();
}

function renderReports({ vehicles, trips, expenses }) {
  const reportSummary = document.getElementById("reportSummary");
  const reportBreakdown = document.getElementById("reportBreakdown");
  const mileageSummary = document.getElementById("mileageSummary");
  const reportPeriod = document.getElementById("reportPeriod")?.value || "month";

  reportSummary.innerHTML = "";
  reportBreakdown.innerHTML = "";
  mileageSummary.innerHTML = "";

  const baseExpenses = getFilteredExpenses(expenses);
  const view = getSelectedReportView(reportPeriod);

  const inView = baseExpenses.filter(exp => {
    if (!view.start && !view.end) return true;
    return rangeMatches(exp.date, view.start, view.end);
  });

  const byCategory = groupAndSum(inView, item => item.category || "Uncategorized");
  const byVehicle = groupAndSum(inView, item => vehicles.find(v => v.id === item.vehicleId)?.name || "Unknown vehicle");
  const byTrip = groupAndSum(inView.filter(i => i.tripId), item => trips.find(t => t.id === item.tripId)?.name || "Unknown trip");

  reportSummary.innerHTML = `
    <div class="list-item">
      <strong>${escapeHtml(view.label)}</strong>
      <div class="meta">Total spend: ${formatCurrency(sumCost(inView))}</div>
      <div class="meta">Entries: ${inView.length}</div>
    </div>
  `;

  reportBreakdown.innerHTML =
    buildPieCard(`${view.label} · By Category`, byCategory) +
    buildPieCard(`${view.label} · By Vehicle`, byVehicle) +
    buildPieCard(`${view.label} · By Trip`, byTrip);

  drawAllPieCharts();

  const mileage = buildMileageInsights(expenses, vehicles);
  if (!mileage.length) {
    renderEmpty(mileageSummary);
  } else {
    mileageSummary.innerHTML = mileage.map(row => `
      <div class="list-item">
        <strong>${escapeHtml(row.vehicleName)}</strong>
        <div class="meta">Last mileage: ${row.lastMileage ? row.lastMileage.toFixed(2) + " km/l" : "Not enough fuel data"}</div>
        <div class="meta">Month avg: ${row.monthAvg ? row.monthAvg.toFixed(2) + " km/l" : "-"}</div>
        <div class="meta">Quarter avg: ${row.quarterAvg ? row.quarterAvg.toFixed(2) + " km/l" : "-"}</div>
        <div class="meta">Year avg: ${row.yearAvg ? row.yearAvg.toFixed(2) + " km/l" : "-"}</div>
      </div>
    `).join("");
  }
}

function buildMileageInsights(expenses, vehicles) {
  return vehicles.map(vehicle => {
    const fuelExpenses = expenses
      .filter(e => e.vehicleId === vehicle.id && e.category === "Fuel" && Number(e.fuelVolume) > 0)
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || Number(a.kmReading) - Number(b.kmReading));

    const entries = [];
    for (let i = 1; i < fuelExpenses.length; i += 1) {
      const prev = fuelExpenses[i - 1];
      const curr = fuelExpenses[i];
      const kmDiff = Number(curr.kmReading || 0) - Number(prev.kmReading || 0);
      const litres = Number(curr.fuelVolume || 0);
      if (kmDiff > 0 && litres > 0) {
        entries.push({
          date: curr.date,
          mileage: kmDiff / litres
        });
      }
    }

    const monthRange = getCurrentMonthRange();
    const quarterRange = getCurrentQuarterRange();
    const yearRange = getCurrentYearRange();

    return {
      vehicleName: vehicle.name,
      lastMileage: entries.length ? entries[entries.length - 1].mileage : null,
      monthAvg: average(entries.filter(e => rangeMatches(e.date, monthRange.start, monthRange.end)).map(e => e.mileage)),
      quarterAvg: average(entries.filter(e => rangeMatches(e.date, quarterRange.start, quarterRange.end)).map(e => e.mileage)),
      yearAvg: average(entries.filter(e => rangeMatches(e.date, yearRange.start, yearRange.end)).map(e => e.mileage))
    };
  });
}

async function downloadBackup() {
  try {
    const payload = {
      app: "Vehicle Expense Tracker",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {}
    };

    for (const storeName of STORE_NAMES) {
      payload.data[storeName] = await getAll(storeName);
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const filename = `vehicle-tracker-backup-${todayISO()}.json`;

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    setBackupStatus(`Backup downloaded: ${filename}`);
  } catch (error) {
    console.error(error);
    setBackupStatus("Backup failed. Please try again.");
  }
}

async function restoreBackupFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const payload = JSON.parse(text);

    if (!payload?.data) {
      throw new Error("Invalid backup file");
    }

    if (!confirm("Restore this backup? This will replace your current local data.")) {
      event.target.value = "";
      return;
    }

    for (const storeName of STORE_NAMES) {
      await clearStore(storeName);
    }

    for (const storeName of STORE_NAMES) {
      const items = Array.isArray(payload.data[storeName]) ? payload.data[storeName] : [];
      for (const item of items) {
        await put(storeName, item);
      }
    }

    await seedCategories();
    await seedSettings();
    await refreshUI();
    setBackupStatus(`Backup restored successfully from ${file.name}`);
  } catch (error) {
    console.error(error);
    setBackupStatus("Restore failed. Please check that the selected file is a valid backup JSON.");
  } finally {
    event.target.value = "";
  }
}

function setBackupStatus(message) {
  document.getElementById("backupStatus").textContent = message;
}


function getSelectedReportView(reportPeriod) {
  if (reportPeriod === "quarter") return { label: "Current Quarter", ...getCurrentQuarterRange() };
  if (reportPeriod === "year") return { label: "Current Year", ...getCurrentYearRange() };
  if (reportPeriod === "filtered") return { label: "Only Applied Filters", start: activeFilters.startDate || "", end: activeFilters.endDate || "" };
  return { label: "Current Month", ...getCurrentMonthRange() };
}

function buildPieCard(title, rows) {
  if (!rows.length) {
    return `<div class="list-item"><strong>${escapeHtml(title)}</strong><div class="meta">No data.</div></div>`;
  }

  const limitedRows = rows.slice(0, 6);
  const total = limitedRows.reduce((sum, [, value]) => sum + value, 0);
  const chartData = limitedRows.map(([label, value], index) => ({
    label,
    value,
    color: getChartColor(index)
  }));

  return `
    <div class="list-item chart-card">
      <strong>${escapeHtml(title)}</strong>
      <div class="chart-wrap">
        <canvas class="pie-chart" width="280" height="280" data-chart='${escapeHtml(JSON.stringify(chartData))}' data-total="${total}"></canvas>
      </div>
      <div class="legend">
        ${chartData.map(item => `
          <div class="legend-item">
            <div class="legend-left">
              <span class="legend-swatch" style="background:${item.color}"></span>
              <span class="legend-label">${escapeHtml(item.label)}</span>
            </div>
            <span class="legend-value">${formatCurrency(item.value)}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function drawAllPieCharts() {
  document.querySelectorAll(".pie-chart").forEach(canvas => {
    const raw = canvas.dataset.chart;
    if (!raw) return;
    const data = JSON.parse(raw);
    drawPieChart(canvas, data);
  });
}

function drawPieChart(canvas, data) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.36;
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);

  ctx.clearRect(0, 0, width, height);

  if (!total) {
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("No data", cx, cy);
    return;
  }

  let startAngle = -Math.PI / 2;
  for (const item of data) {
    const slice = (Number(item.value || 0) / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    startAngle += slice;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.56, 0, Math.PI * 2);
  ctx.fillStyle = "#0f172a";
  ctx.fill();

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Total", cx, cy - 12);
  ctx.font = "bold 14px Arial";
  ctx.fillText(formatCompactCurrency(total), cx, cy + 12);
}

function getChartColor(index) {
  const palette = ["#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#f87171", "#14b8a6", "#fb7185", "#60a5fa"];
  return palette[index % palette.length];
}

function formatCompactCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value || 0);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((a,b) => a + b, 0) / values.length;
}

function groupAndSum(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) || 0) + Number(item.cost || 0));
  }
  return [...map.entries()].sort((a,b) => b[1] - a[1]);
}

function buildBreakdownTable(title, rows) {
  if (!rows.length) {
    return `<div class="list-item"><strong>${escapeHtml(title)}</strong><div class="meta">No data.</div></div>`;
  }
  return `
    <div class="list-item">
      <strong>${escapeHtml(title)}</strong>
      <table class="report-table">
        <thead><tr><th>Group</th><th>Total</th></tr></thead>
        <tbody>
          ${rows.map(([label, total]) => `<tr><td>${escapeHtml(label)}</td><td>${formatCurrency(total)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmpty(container) {
  container.innerHTML = document.getElementById("emptyStateTemplate").innerHTML;
}

async function editVehicle(id) {
  const vehicles = await getAll("vehicles");
  const item = vehicles.find(v => v.id === id);
  if (!item) return;
  document.getElementById("vehicleId").value = item.id;
  document.getElementById("vehicleType").value = item.type;
  document.getElementById("vehicleName").value = item.name;
  document.getElementById("vehicleFormTitle").textContent = "Update Vehicle";
  activateTab("vehicles");
}
async function deleteVehicle(id) {
  const expenses = await getAll("expenses");
  const linked = expenses.some(e => e.vehicleId === id);
  if (linked && !confirm("This vehicle has linked expenses. Delete anyway? Linked expenses will remain but show as unknown vehicle.")) return;
  await remove("vehicles", id);
  await refreshUI();
}
async function editTrip(id) {
  const trips = await getAll("trips");
  const item = trips.find(t => t.id === id);
  if (!item) return;
  document.getElementById("tripId").value = item.id;
  document.getElementById("tripName").value = item.name;
  document.getElementById("tripStartDate").value = item.startDate;
  document.getElementById("tripEndDate").value = item.endDate;
  document.getElementById("tripTotalKms").value = item.totalKms;
  document.getElementById("tripFormTitle").textContent = "Update Trip";
  activateTab("trips");
}
async function deleteTrip(id) {
  const expenses = await getAll("expenses");
  const updates = expenses.filter(e => e.tripId === id).map(e => ({ ...e, tripId: "" }));
  for (const update of updates) await put("expenses", update);
  await remove("trips", id);
  await refreshUI();
}
async function editExpense(id) {
  const expenses = await getAll("expenses");
  const item = expenses.find(e => e.id === id);
  if (!item) return;
  document.getElementById("expenseId").value = item.id;
  document.getElementById("expenseName").value = item.name;
  document.getElementById("expenseDate").value = item.date;
  document.getElementById("expenseVehicle").value = item.vehicleId;
  document.getElementById("expenseKmReading").value = item.kmReading;
  document.getElementById("expenseCost").value = item.cost;
  document.getElementById("expenseTrip").value = item.tripId || "";
  document.getElementById("expenseCategory").value = item.category;
  document.getElementById("expenseFuelVolume").value = item.fuelVolume || "";
  document.getElementById("expenseOtherInfo").value = item.otherInfo || "";
  document.getElementById("expenseFormTitle").textContent = "Update Expense";
  activateTab("expenses");
}
async function deleteExpense(id) {
  await remove("expenses", id);
  await refreshUI();
}

function activateTab(name) {
  document.querySelectorAll(".tab, .tab-panel").forEach(el => el.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${name}"]`).classList.add("active");
  document.getElementById(name).classList.add("active");
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toISO(start), end: toISO(end) };
}
function getCurrentQuarterRange() {
  const now = new Date();
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  const start = new Date(now.getFullYear(), quarterStartMonth, 1);
  const end = new Date(now.getFullYear(), quarterStartMonth + 3, 0);
  return { start: toISO(start), end: toISO(end) };
}
function getCurrentYearRange() {
  const now = new Date();
  return {
    start: `${now.getFullYear()}-01-01`,
    end: `${now.getFullYear()}-12-31`
  };
}
function toISO(date) {
  return new Date(date).toISOString().slice(0, 10);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, s => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[s]));
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(console.error));
  }
}
