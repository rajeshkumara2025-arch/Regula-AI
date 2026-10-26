/* Shared RegulaAI application utilities. Supabase-backed with local fallback. */
(() => {
  "use strict";
  const API_BASE_URL = "http://127.0.0.1:5000/api";
  const STORAGE_KEYS = {
    buildings: "regulaai_buildings_v1",
    assessments: "regulaai_assessments_v1",
    floorplans: "regulaai_floorplans_v1",
    simulations: "regulaai_simulation_history_v1"
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = () => new Date().toISOString();
  const safe = (value = "") => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const seedBuildings = [
    { id: "demo-library", name: "North Campus Library", address: "Academic zone · Campus", building_type: "Educational", floors: 4, building_age: 8, occupancy: 420, exit_count: 2, staircase_count: 2, fire_extinguisher_count: 10, alarm_coverage: 86, emergency_light_coverage: 78, signage_coverage: 82, exit_capacity: 360, created_at: now() },
    { id: "demo-labs", name: "Engineering Labs Block", address: "Research zone · Campus", building_type: "Educational", floors: 3, building_age: 12, occupancy: 280, exit_count: 3, staircase_count: 2, fire_extinguisher_count: 12, alarm_coverage: 94, emergency_light_coverage: 92, signage_coverage: 90, exit_capacity: 320, created_at: now() },
    { id: "demo-residence", name: "Student Residence A", address: "Residential zone · Campus", building_type: "Residential", floors: 6, building_age: 6, occupancy: 560, exit_count: 2, staircase_count: 2, fire_extinguisher_count: 14, alarm_coverage: 72, emergency_light_coverage: 68, signage_coverage: 76, exit_capacity: 450, created_at: now() },
    { id: "demo-admin", name: "Administration Centre", address: "Central campus", building_type: "Office", floors: 2, building_age: 4, occupancy: 140, exit_count: 3, staircase_count: 2, fire_extinguisher_count: 5, alarm_coverage: 98, emergency_light_coverage: 96, signage_coverage: 95, exit_capacity: 220, created_at: now() }
  ];

  function read(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return Array.isArray(value) ? value : (value && typeof value === "object" ? value : fallback);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getBuildings() {
    const saved = read(STORAGE_KEYS.buildings, null);
    if (saved && Array.isArray(saved) && saved.length) {
      return saved;
    }
    write(STORAGE_KEYS.buildings, seedBuildings);
    return seedBuildings;
  }

  function setBuildings(rows) {
    write(STORAGE_KEYS.buildings, rows);
  }

  function getAssessments() {
    return read(STORAGE_KEYS.assessments, []);
  }

  function setAssessments(rows) {
    write(STORAGE_KEYS.assessments, rows);
  }

  function getSimulations() {
    return read(STORAGE_KEYS.simulations, []);
  }

  function setSimulations(rows) {
    write(STORAGE_KEYS.simulations, rows);
  }

  async function api(path, options = {}) {
    if (!API_BASE_URL) {
      throw new Error("Demo mode");
    }
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Request failed (${response.status})`);
    }
    return body;
  }

  async function listBuildings() {
    try {
      const rows = await api("/buildings");
      setBuildings(rows);
      return rows;
    } catch {
      return getBuildings();
    }
  }

  async function listAssessments() {
    try {
      const rows = await api("/assessments");
      setAssessments(rows);
      return rows;
    } catch {
      return getAssessments();
    }
  }

  async function listSimulations() {
    try {
      const rows = await api("/simulations");
      setSimulations(rows);
      return rows;
    } catch {
      return getSimulations();
    }
  }

  async function saveBuilding(building) {
    const normalized = {
      ...building,
      id: building.id || uid(),
      updated_at: now(),
      created_at: building.created_at || now()
    };
    let saved = normalized;
    try {
      saved = await api("/buildings", { method: "POST", body: JSON.stringify(normalized) });
    } catch (err) {
      console.warn("API save failed, using local storage:", err);
    }
    const rows = getBuildings();
    const i = rows.findIndex(x => x.id === saved.id || x.id === normalized.id);
    if (i >= 0) {
      rows[i] = saved;
    } else {
      rows.unshift(saved);
    }
    setBuildings(rows);
    return saved;
  }

  async function deleteBuilding(id) {
    try {
      await api(`/buildings/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (err) {
      console.warn("API delete failed, removing locally:", err);
    }
    setBuildings(getBuildings().filter(b => b.id !== id));
    setAssessments(getAssessments().filter(a => a.building_id !== id));
    const plans = read(STORAGE_KEYS.floorplans, {});
    delete plans[id];
    write(STORAGE_KEYS.floorplans, plans);
  }

  async function saveSimulation(sim) {
    let saved = sim;
    try {
      saved = await api("/simulations", { method: "POST", body: JSON.stringify(sim) });
    } catch (err) {
      console.warn("API save simulation failed, using local storage:", err);
    }
    const rows = getSimulations().filter(x => x.id !== saved.id);
    rows.unshift(saved);
    setSimulations(rows.slice(0, 100));
    return saved;
  }

  async function getFloorPlan(buildingId) {
    try {
      const row = await api(`/floor-plans/${encodeURIComponent(buildingId)}`);
      return row;
    } catch {
      const local = read(STORAGE_KEYS.floorplans, {});
      return local[buildingId] || null;
    }
  }

  async function saveFloorPlan(buildingId, floors) {
    const plans = read(STORAGE_KEYS.floorplans, {});
    plans[buildingId] = { floors, updatedAt: now() };
    write(STORAGE_KEYS.floorplans, plans);
    try {
      await api(`/floor-plans/${encodeURIComponent(buildingId)}`, {
        method: "POST",
        body: JSON.stringify({ floors })
      });
    } catch (err) {
      console.warn("API floor plan save failed, kept locally:", err);
    }
  }

  function assessLocal(building) {
    const occupancy = Number(building.occupancy) || 0;
    const capacity = Number(building.exit_capacity) || 0;
    const exits = Number(building.exit_count) || 0;
    const floors = Number(building.floors) || 1;
    const age = Number(building.building_age) || 0;
    const alarm = Number(building.alarm_coverage) || 0;
    const light = Number(building.emergency_light_coverage) || 0;
    const signage = Number(building.signage_coverage) || 0;

    let score = 15 + (exits < 2 ? 18 : 0) + (exits === 0 ? 20 : 0) + (capacity > 0 && occupancy > capacity ? Math.min(25, 25 * (occupancy - capacity) / Math.max(occupancy, 1)) : (!capacity && occupancy ? 8 : 0));
    score += Math.min(12, Math.max(0, floors - 3) * 2) + Math.min(10, age / 5) + (100 - Math.min(100, alarm)) * 0.12 + (100 - Math.min(100, light)) * 0.10 + (100 - Math.min(100, signage)) * 0.08;
    score = Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
    const risk_level = score < 35 ? "Low" : score < 65 ? "Medium" : "High";
    const factors = [];
    if (exits < 2) factors.push({ name: "Limited exit count", severity: "High", detail: "Verify exit number, independence, placement and applicable code requirements." });
    if (capacity > 0 && occupancy > capacity) factors.push({ name: "Occupancy exceeds entered exit capacity", severity: "High", detail: "Entered occupancy exceeds the supplied aggregate exit capacity." });
    if (alarm < 80) factors.push({ name: "Alarm coverage needs review", severity: "Medium", detail: "Entered alarm coverage is below the prototype's 80% review threshold." });
    if (light < 80) factors.push({ name: "Emergency lighting needs review", severity: "Medium", detail: "Entered emergency-light coverage is below the prototype's 80% review threshold." });
    if (signage < 80) factors.push({ name: "Signage coverage needs review", severity: "Medium", detail: "Entered signage coverage is below the prototype's 80% review threshold." });
    if (!factors.length) factors.push({ name: "No major input flags from demo rules", severity: "Low", detail: "This does not proof of safety or code compliance." });

    const checks = [
      { name: "Exit information provided", passed: exits >= 2, status: exits >= 2 ? "Input threshold met" : "Review" },
      { name: "Alarm coverage entered", passed: alarm >= 80, status: alarm >= 80 ? "Input threshold met" : "Review" },
      { name: "Emergency lighting entered", passed: light >= 80, status: light >= 80 ? "Input threshold met" : "Review" },
      { name: "Signage coverage entered", passed: signage >= 80, status: signage >= 80 ? "Input threshold met" : "Review" },
      { name: "Exit capacity entered", passed: capacity > 0, status: capacity > 0 ? "Input provided" : "Review" }
    ];

    return {
      risk_score: score,
      risk_level,
      compliance_score: Math.round(checks.filter(c => c.passed).length / checks.length * 100),
      model_status: "Demonstration heuristic — no trained ML model",
      models: [
        { name: "Decision Tree", status: "Not trained" },
        { name: "Random Forest", status: "Not trained" },
        { name: "XGBoost", status: "Not trained" }
      ],
      factors,
      compliance_checks: checks,
      recommendations: [
        "Ask a qualified fire-safety professional to verify exits, travel distances, separation and capacity against applicable local code.",
        "Inspect and document alarm, emergency-lighting, signage and fire-equipment coverage on site.",
        "Review occupant groups and evacuation assistance requirements."
      ],
      limitations: [
        "Prototype scores are illustrative, not a certified assessment.",
        "A low risk score does not establish compliance or guarantee safe evacuation.",
        "No validated supervised model is reported without a suitable labelled dataset."
      ]
    };
  }

  async function runAssessment(building) {
    let record;
    try {
      await saveBuilding(building);
      record = await api("/assessments", {
        method: "POST",
        body: JSON.stringify({ building_id: building.id })
      });
    } catch (err) {
      console.warn("API assessment save failed, using local fallback:", err);
      const result = assessLocal(building);
      record = {
        id: uid(),
        building_id: building.id,
        building_name: building.name,
        ...result,
        created_at: now(),
        result
      };
    }
    const rows = getAssessments().filter(x => x.id !== record.id);
    rows.unshift(record);
    setAssessments(rows);
    return record;
  }

  function toast(message, type = "success") {
    const region = $("#toastRegion");
    if (!region) return;
    const node = document.createElement("div");
    node.className = `toast toast-${type}`;
    node.textContent = message;
    region.append(node);
    setTimeout(() => node.remove(), 3600);
  }

  function badge(level) {
    const cls = String(level || "Review").toLowerCase().replace(/[^a-z]+/g, "-");
    return `<span class="badge badge-${safe(cls)}">${safe(level || "Review")}</span>`;
  }

  function statCard(label, value, sub, icon, tone = "teal") {
    return `<article class="stat-card"><div class="stat-top"><span>${safe(label)}</span><span class="stat-icon tone-${tone}">${icon}</span></div><div class="stat-value">${safe(value)}</div><div class="stat-sub">${sub}</div></article>`;
  }

  function emptyState(title, copy, action = "") {
    return `<div class="empty-state"><div class="empty-icon">↗</div><h3>${safe(title)}</h3><p>${safe(copy)}</p>${action}</div>`;
  }

  function shellHeader(eyebrow, title, description, actions = "") {
    return `<div class="page-heading"><div><div class="eyebrow">${safe(eyebrow)}</div><h1>${safe(title)}</h1><p>${safe(description)}</p></div><div class="heading-actions">${actions}</div></div>`;
  }

  function button(label, action, kind = "primary", icon = "＋") {
    return `<button type="button" class="button button-${kind}" data-action="${safe(action)}">${icon ? `<span>${icon}</span>` : ""}${safe(label)}</button>`;
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function riskClass(level) {
    return `risk-${String(level || "medium").toLowerCase()}`;
  }

  function renderTable(headers, rows, emptyMessage = "No records yet.") {
    if (!rows.length) return emptyState("Nothing to show", emptyMessage);
    return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${safe(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  function getCurrentBuilding() {
    const id = new URLSearchParams(location.search).get("id");
    const buildings = getBuildings();
    return buildings.find(b => b.id === id) || buildings[0] || null;
  }

  function showModal(building = null) {
    const modal = $("#buildingModal");
    const form = $("#buildingForm");
    if (!modal || !form) return;
    form.reset();
    form.dataset.editId = building?.id || "";
    $("#buildingModalTitle").textContent = building ? "Edit building" : "Add a building";
    if (building) {
      for (const [key, value] of Object.entries(building)) {
        if (form.elements[key]) form.elements[key].value = value ?? "";
      }
    } else {
      form.elements.floors.value = 3;
      form.elements.occupancy.value = 250;
      form.elements.exit_count.value = 2;
      form.elements.staircase_count.value = 2;
      form.elements.exit_capacity.value = 300;
      form.elements.alarm_coverage.value = 90;
      form.elements.emergency_light_coverage.value = 85;
      form.elements.signage_coverage.value = 85;
      form.elements.fire_extinguisher_count.value = 6;
      form.elements.building_age.value = 5;
    }
    modal.showModal();
  }

  function downloadFile(filename, content, type = "text/plain") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function initCommon() {
    $("#menuToggle")?.addEventListener("click", () => $("#sidebar")?.classList.toggle("sidebar-open"));
    $("#refreshButton")?.addEventListener("click", () => location.reload());
    $$("[data-close-modal]").forEach(el => el.addEventListener("click", () => $("#buildingModal")?.close()));

    $("#buildingForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.currentTarget;
      const data = Object.fromEntries(new FormData(form).entries());
      for (const k of ["floors", "building_age", "occupancy", "exit_count", "staircase_count", "fire_extinguisher_count", "exit_capacity", "alarm_coverage", "emergency_light_coverage", "signage_coverage"]) {
        data[k] = Number(data[k] || 0);
      }
      if (["alarm_coverage", "emergency_light_coverage", "signage_coverage"].some(k => data[k] < 0 || data[k] > 100)) {
        toast("Coverage values must be between 0 and 100.", "error");
        return;
      }
      const editId = form.dataset.editId;
      if (editId) data.id = editId;
      try {
        await saveBuilding(data);
        $("#buildingModal")?.close();
        toast(editId ? "Building updated" : "Building saved");
        document.dispatchEvent(new CustomEvent("regulaai:data-changed"));
      } catch (err) {
        toast(err.message || "Could not save building", "error");
      }
    });

    const label = $("#connectionLabel");
    if (label) label.textContent = API_BASE_URL ? "Flask API" : "Demo mode";

    if (API_BASE_URL) {
      Promise.all([listBuildings(), listAssessments(), listSimulations()]).then(() => {
        document.dispatchEvent(new CustomEvent("regulaai:data-changed"));
      });
    }

    document.addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "add-building") showModal();
      if (action === "edit-building") {
        const b = getBuildings().find(x => x.id === btn.dataset.id);
        if (b) showModal(b);
      }
      if (action === "delete-building") {
        const id = btn.dataset.id;
        const b = getBuildings().find(x => x.id === id);
        if (b && confirm(`Delete "${b.name}" and its local assessment history?`)) {
          await deleteBuilding(id);
          toast("Building deleted");
          document.dispatchEvent(new CustomEvent("regulaai:data-changed"));
        }
      }
      if (action === "assess-building") {
        const b = getBuildings().find(x => x.id === btn.dataset.id) || getCurrentBuilding();
        if (!b) { toast("Add a building first.", "error"); return; }
        btn.disabled = true;
        btn.textContent = "Assessing…";
        try {
          const record = await runAssessment(b);
          toast("Assessment saved");
          location.href = `risk-assessment.html?id=${encodeURIComponent(b.id)}&assessment=${encodeURIComponent(record.id)}`;
        } catch (err) {
          toast(err.message, "error");
          btn.disabled = false;
        }
      }
      if (action === "open-building") location.href = `building-details.html?id=${encodeURIComponent(btn.dataset.id)}`;
      if (action === "export-json") {
        let floorplans = {}, simulations = [];
        try { floorplans = JSON.parse(localStorage.getItem(STORAGE_KEYS.floorplans) || "{}"); } catch {}
        try { simulations = JSON.parse(localStorage.getItem(STORAGE_KEYS.simulations) || "[]"); } catch {}
        downloadFile("regulaai-data.json", JSON.stringify({ buildings: getBuildings(), assessments: getAssessments(), floorplans, simulations }, null, 2), "application/json");
      }
      if (action === "export-csv") {
        const rows = getAssessments();
        const csv = [
          ["building_name", "risk_score", "risk_level", "compliance_score", "created_at"],
          ...rows.map(a => [a.building_name, a.risk_score, a.risk_level, a.compliance_score, a.created_at])
        ].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
        downloadFile("regulaai-assessments.csv", csv, "text/csv");
      }
    });

    document.addEventListener("regulaai:data-changed", () => window.RegulaAI?.renderCurrent?.());
  }

  window.RegulaAI = {
    API_BASE_URL, STORAGE_KEYS, $, $$, safe, uid, now,
    getBuildings, setBuildings, getAssessments, setAssessments,
    getSimulations, setSimulations, listSimulations, saveSimulation,
    getFloorPlan, saveFloorPlan, listBuildings, listAssessments,
    saveBuilding, deleteBuilding, runAssessment, assessLocal,
    toast, badge, statCard, emptyState, shellHeader, button,
    formatDate, riskClass, renderTable, getCurrentBuilding,
    showModal, downloadFile, initCommon
  };

  document.addEventListener("DOMContentLoaded", initCommon);
})();