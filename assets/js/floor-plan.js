(() => {
  "use strict";
  const R = window.RegulaAI;
  if (!R) return;
  const { $, safe, shellHeader, getBuildings, getCurrentBuilding, toast } = R;
  const STORE = "regulaai_floorplans_v1";
  const W = 1000, H = 600;
  let building, floor = 1, tool = "room", drawing = null, plans = {}, elements = [], canvas, ctx, selectedId = null;

  const tools = [
    ["room", "Room", "Draw a room by dragging"],
    ["corridor", "Corridor", "Draw a corridor by dragging"],
    ["exit", "Exit", "Click to place an exit"],
    ["stair", "Staircase", "Click to place a staircase"],
    ["occupant", "Occupant start", "Click to place an occupant start point"],
    ["blocked", "Blocked area", "Draw an area that should not be used"]
  ];

  function readPlans() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || "{}");
    } catch {
      return {};
    }
  }

  function savePlans() {
    localStorage.setItem(STORE, JSON.stringify(plans));
  }

  function floorData() {
    const b = (plans[building.id] ||= { floors: {} });
    b.floors[floor] ||= { elements: [] };
    return b.floors[floor];
  }

  function loadFloor() {
    elements = floorData().elements;
    selectedId = null;
    draw();
    renderElementList();
  }

  function point(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(W, ((e.clientX - r.left) / r.width) * W)),
      y: Math.max(0, Math.min(H, ((e.clientY - r.top) / r.height) * H))
    };
  }

  function drawElement(el) {
    const x = el.x, y = el.y, w = el.w || 0, h = el.h || 0;
    if (el.type === "room" || el.type === "corridor" || el.type === "blocked") {
      const fill = el.type === "room" ? "#edf2f8" : el.type === "corridor" ? "#dff3ef" : "#fde7e8";
      ctx.fillStyle = fill;
      ctx.strokeStyle = el.type === "blocked" ? "#d34f5d" : el.type === "corridor" ? "#4b9d91" : "#8092aa";
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = el.type === "blocked" ? "#b93240" : "#4b5b70";
      ctx.font = "600 16px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(el.label || el.type.toUpperCase(), x + w / 2, y + h / 2, Math.max(40, w - 8));
    } else if (el.type === "exit") {
      ctx.fillStyle = "#178d77";
      ctx.fillRect(x - 18, y - 15, 36, 30);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("EXIT", x, y);
    } else if (el.type === "stair") {
      ctx.fillStyle = "#e9b44c";
      ctx.fillRect(x - 18, y - 18, 36, 36);
      ctx.strokeStyle = "#8c671e";
      ctx.strokeRect(x - 18, y - 18, 36, 36);
      ctx.fillStyle = "#533d0e";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ST", x, y);
    } else if (el.type === "occupant") {
      ctx.fillStyle = "#5578dc";
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", x, y);
    }
    if (el.id === selectedId) {
      ctx.save();
      ctx.strokeStyle = "#7257d5";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x - 5, y - 5, Math.max(w, 10) + 10, Math.max(h, 10) + 10);
      ctx.restore();
    }
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#e7edf4";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 25) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    elements.forEach(drawElement);
    if (drawing && (tool === "room" || tool === "corridor" || tool === "blocked")) {
      ctx.fillStyle = "rgba(85,120,220,.12)";
      ctx.strokeStyle = "#5578dc";
      ctx.setLineDash([5, 4]);
      ctx.fillRect(drawing.x, drawing.y, drawing.w, drawing.h);
      ctx.strokeRect(drawing.x, drawing.y, drawing.w, drawing.h);
      ctx.setLineDash([]);
    }
  }

  function renderElementList() {
    const root = $("#elementList");
    if (!root) return;
    root.innerHTML = elements.length
      ? elements.map(e => `<button type="button" class="plan-element-row ${e.id === selectedId ? "is-selected" : ""}" data-select-element="${safe(e.id)}"><span class="plan-type-dot type-${safe(e.type)}"></span><span><strong>${safe(e.label || e.type)}</strong><small>${e.type === "room" || e.type === "corridor" || e.type === "blocked" ? `${Math.round(e.w)} × ${Math.round(e.h)} grid units` : `Position ${Math.round(e.x)}, ${Math.round(e.y)}`}</small></span><span class="plan-row-arrow">›</span></button>`).join("")
      : `<div class="empty-state compact-empty"><h3>No elements yet</h3><p>Choose a tool, then draw or click on the grid.</p></div>`;
  }

  function render() {
    building = getCurrentBuilding();
    plans = readPlans();
    if (!building) {
      $("#pageContent").innerHTML = shellHeader("LAYOUT CONFIGURATION", "Floor-plan editor", "Create a building profile before defining its layout.") +
        R.emptyState("No building selected", "Add a building to start configuring rooms, corridors, stairs and exits.", `<a class="button button-primary" href="buildings.html">Open buildings</a>`);
      return;
    }
    const all = getBuildings();
    const floors = Math.max(1, Number(building.floors) || 1);
    floor = Math.min(floor, floors);

    $("#pageContent").innerHTML = shellHeader(
      "BUILDING CONFIGURATION",
      "Floor-plan editor",
      `Define the layout for ${building.name}. This is a schematic you create—not an automatically inferred building model.`,
      `<a class="button button-quiet" href="building-details.html?id=${encodeURIComponent(building.id)}">Back to profile</a><a class="button button-primary" href="evacuation.html?id=${encodeURIComponent(building.id)}">Open evacuation ↗</a>`
    ) +
    `<div class="notice notice-info plan-intro"><span class="notice-symbol">i</span><div><strong>Build the plan from verified information</strong><p>Draw room and corridor areas, then place exits, staircases and occupant starting points. Use approximate grid units for this prototype. The editor does not infer dimensions or certify an escape route.</p></div></div>
    <section class="panel plan-toolbar-panel"><div class="plan-top-controls"><label class="field"><span>Building</span><select id="planBuilding">${all.map(b => `<option value="${safe(b.id)}" ${b.id === building.id ? "selected" : ""}>${safe(b.name)}</option>`).join("")}</select></label><label class="field"><span>Floor</span><select id="planFloor">${Array.from({ length: floors }, (_, i) => `<option value="${i + 1}" ${i + 1 === floor ? "selected" : ""}>Floor ${i + 1}</option>`).join("")}</select></label><label class="field plan-label-field"><span>Label for next element</span><input id="elementLabel" maxlength="32" placeholder="e.g. Lab 101 / North Exit"></label></div>
    <div class="plan-tool-row" role="group" aria-label="Floor plan tools">${tools.map(([id, label, hint]) => `<button type="button" class="plan-tool ${tool === id ? "active" : ""}" data-plan-tool="${id}" title="${hint}"><span class="plan-tool-symbol">${({ room: "▱", corridor: "↔", exit: "⇥", stair: "▤", occupant: "●", blocked: "⊘" })[id]}</span>${label}</button>`).join("")}</div></section>
    <div class="plan-workspace"><section class="panel plan-canvas-panel"><div class="panel-heading"><div><h2>Floor ${floor} layout</h2><p>Draw rooms/corridors by dragging. Click to place point elements.</p></div><span class="badge badge-low">Editor</span></div><div class="plan-canvas-wrap"><canvas id="planCanvas" width="1000" height="600" aria-label="Interactive floor plan grid"></canvas></div><div class="plan-canvas-actions"><span class="muted small" id="planStatus">Select a tool to begin.</span><div><button type="button" class="button button-quiet button-small" id="undoElement">Undo</button><button type="button" class="button button-quiet button-small" id="clearFloor">Clear floor</button><button type="button" class="button button-primary button-small" id="savePlan">Save floor plan</button></div></div><div class="plan-legend"><span><i class="plan-legend-room"></i>Room</span><span><i class="plan-legend-corridor"></i>Corridor</span><span><i class="plan-legend-exit"></i>Exit</span><span><i class="plan-legend-stair"></i>Staircase</span><span><i class="plan-legend-blocked"></i>Blocked area</span></div></section>
    <aside class="panel plan-elements-panel"><div class="panel-heading"><div><h2>Floor elements</h2><p id="elementCount">0 items</p></div></div><div id="elementList"></div><div class="plan-selected-actions"><button type="button" class="button button-quiet button-small" id="renameElement" disabled>Rename selected</button><button type="button" class="button button-danger button-small" id="deleteElement" disabled>Delete selected</button></div><div class="notice notice-warning compact"><span class="notice-symbol">!</span><p>Before simulation, check that rooms connect to corridors and at least one exit is placed on the plan. The prototype's routes are simplified visual paths.</p></div></aside></div>`;

    canvas = $("#planCanvas");
    ctx = canvas.getContext("2d");
    loadFloor();

    // Remote sync on load: fetches layout from Supabase if present
    if (R.getFloorPlan) {
      R.getFloorPlan(building.id).then(res => {
        if (res && res.floors && Object.keys(res.floors).length) {
          plans[building.id] = { floors: res.floors, updatedAt: res.updated_at };
          savePlans();
          loadFloor();
        }
      });
    }

    $("#planBuilding").addEventListener("change", e => location.href = `floor-plan.html?id=${encodeURIComponent(e.target.value)}`);
    $("#planFloor").addEventListener("change", e => {
      floor = Number(e.target.value);
      loadFloor();
      $(".plan-canvas-panel h2").textContent = `Floor ${floor} layout`;
    });

    document.querySelectorAll("[data-plan-tool]").forEach(b => b.addEventListener("click", () => {
      tool = b.dataset.planTool;
      document.querySelectorAll("[data-plan-tool]").forEach(x => x.classList.toggle("active", x === b));
      $("#planStatus").textContent = tools.find(x => x[0] === tool)[2];
    }));

    canvas.addEventListener("pointerdown", e => {
      const p = point(e);
      if (["room", "corridor", "blocked"].includes(tool)) {
        drawing = { x: p.x, y: p.y, w: 0, h: 0 };
        canvas.setPointerCapture(e.pointerId);
      } else {
        const el = {
          id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: tool,
          x: p.x,
          y: p.y,
          w: 0,
          h: 0,
          label: $("#elementLabel").value.trim() || ({ exit: "Exit", stair: "Staircase", occupant: "Occupant start" }[tool])
        };
        elements.push(el);
        selectedId = el.id;
        draw();
        renderElementList();
        updateSelectionButtons();
      }
    });

    canvas.addEventListener("pointermove", e => {
      if (!drawing) return;
      const p = point(e);
      drawing.w = p.x - drawing.x;
      drawing.h = p.y - drawing.y;
      draw();
    });

    canvas.addEventListener("pointerup", () => {
      if (!drawing) return;
      const d = drawing;
      drawing = null;
      const x = Math.min(d.x, d.x + d.w), y = Math.min(d.y, d.y + d.h), w = Math.abs(d.w), h = Math.abs(d.h);
      if (w < 24 || h < 20) { draw(); return; }
      const label = $("#elementLabel").value.trim() || ({ room: "Room", corridor: "Corridor", blocked: "Blocked area" }[tool]);
      elements.push({ id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type: tool, x, y, w, h, label });
      selectedId = elements[elements.length - 1].id;
      draw();
      renderElementList();
      updateSelectionButtons();
      $("#planStatus").textContent = `Added ${label}. Remember to save your plan.`;
    });

    $("#elementList").addEventListener("click", e => {
      const row = e.target.closest("[data-select-element]");
      if (!row) return;
      selectedId = row.dataset.selectElement;
      draw();
      renderElementList();
      updateSelectionButtons();
    });

    $("#deleteElement").addEventListener("click", () => {
      elements = elements.filter(e => e.id !== selectedId);
      selectedId = null;
      draw();
      renderElementList();
      updateSelectionButtons();
    });

    $("#renameElement").addEventListener("click", () => {
      const el = elements.find(e => e.id === selectedId);
      if (!el) return;
      const next = prompt("Enter a clear label for this element:", el.label || el.type);
      if (next !== null && next.trim()) {
        el.label = next.trim().slice(0, 32);
        draw();
        renderElementList();
      }
    });

    $("#undoElement").addEventListener("click", () => {
      const el = elements.pop();
      if (el && el.id === selectedId) selectedId = null;
      draw();
      renderElementList();
      updateSelectionButtons();
    });

    $("#clearFloor").addEventListener("click", () => {
      if (!elements.length || confirm(`Clear all elements on Floor ${floor}?`)) {
        elements = [];
        selectedId = null;
        draw();
        renderElementList();
        updateSelectionButtons();
      }
    });

    $("#savePlan").addEventListener("click", async () => {
      plans[building.id] ||= { floors: {} };
      plans[building.id].floors[floor] = { elements: JSON.parse(JSON.stringify(elements)) };
      plans[building.id].updatedAt = new Date().toISOString();
      savePlans();
      if (R.saveFloorPlan) {
        await R.saveFloorPlan(building.id, plans[building.id].floors);
      }
      toast(`Floor ${floor} plan saved`);
      $("#planStatus").textContent = `Saved ${elements.length} elements on Floor ${floor}.`;
    });

    function updateSelectionButtons() {
      const found = elements.some(e => e.id === selectedId);
      $("#deleteElement").disabled = !found;
      $("#renameElement").disabled = !found;
      $("#elementCount").textContent = `${elements.length} item${elements.length === 1 ? "" : "s"}`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page === "floor-plan") render();
  });

  document.addEventListener("regulaai:data-changed", () => {
    if (document.body.dataset.page === "floor-plan") {
      const current = getCurrentBuilding();
      if (current && (!building || building.id !== current.id)) {
        render();
      }
    }
  });
})();