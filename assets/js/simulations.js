(() => {
  "use strict";
  const R = window.RegulaAI;
  if (!R) return;
  const { $, $$, safe, shellHeader, button, statCard, getBuildings, getCurrentBuilding } = R;

  function renderEvacuation() {
    const buildings = getBuildings(), b = getCurrentBuilding();
    let plans = {};
    try { plans = JSON.parse(localStorage.getItem("regulaai_floorplans_v1") || "{}"); } catch {}
    
    const savedFloorKeys = Object.keys(plans[b?.id]?.floors || {})
      .map(Number)
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a, c) => a - c);
      
    const selectedFloor = Number(new URLSearchParams(location.search).get("floor") || savedFloorKeys[0] || 1);
    const floorPlan = b?.id ? plans[b.id]?.floors?.[selectedFloor] : null;
    const elements = floorPlan?.elements || [];
    const rooms = elements.filter(e => e.type === "room");
    const exits = elements.filter(e => e.type === "exit");
    const blocked = elements.filter(e => e.type === "blocked");
    const occupants = elements.filter(e => e.type === "occupant");
    const hasPlan = elements.length > 0;

    $("#pageContent").innerHTML = shellHeader(
      "EMERGENCY SCENARIO",
      "Evacuation simulator",
      "Run a simplified, visual evacuation scenario using the floor plan you configured. This is a demonstration model, not a validated evacuation analysis.",
      b ? `<a class="button button-quiet" href="floor-plan.html?id=${encodeURIComponent(b.id)}">Edit floor plan ↗</a>` : ""
    ) +
    (!b ? R.emptyState("Add a building first", "Create a building profile before setting up an evacuation scenario.", `<a class="button button-primary" href="buildings.html">Open buildings</a>`) :
     !hasPlan ? `<section class="panel"><div class="empty-state"><div class="empty-icon">⌘</div><h3>Configure the floor plan first</h3><p>RegulaAI does not assume what your building looks like. Add rooms, corridors, exits and occupant starting points to the selected building's floor plan before running a simulation.</p><a class="button button-primary" href="floor-plan.html?id=${encodeURIComponent(b.id)}">Open floor-plan editor ↗</a></div></section>` :
    `<div class="notice notice-warning"><span class="notice-symbol">!</span><div><strong>What this simulation does</strong><p>It animates occupant markers toward the nearest available exit in a schematic view. It does not model room-to-corridor connectivity, smoke, realistic crowd interactions, accessibility constraints or code compliance. Results are estimates under simplified assumptions.</p></div></div>
    <div class="simulation-layout evac-layout"><section class="panel evac-controls"><div class="panel-heading"><div><h2>Scenario controls</h2><p>Configure the run before starting</p></div></div>
      <label class="field"><span>Building</span><select id="evacBuilding">${buildings.map(x => `<option value="${safe(x.id)}" ${x.id === b.id ? "selected" : ""}>${safe(x.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Floor</span><select id="evacFloor">${Array.from({ length: Math.max(1, Number(b.floors) || 1) }, (_, i) => `<option value="${i + 1}" ${i + 1 === selectedFloor ? "selected" : ""}>Floor ${i + 1}</option>`).join("")}</select></label>
      <label class="field"><span>Emergency scenario</span><select id="evacScenario"><option value="normal">Normal exit availability</option><option value="blocked">One exit unavailable</option><option value="fire">Fire scenario (visual marker only)</option></select></label>
      <label class="field"><span>Movement pace assumption</span><select id="evacSpeed"><option value="1.2">Normal pace · illustrative</option><option value="0.8">Slower pace · illustrative</option><option value="0.5">Assisted pace · illustrative</option></select></label>
      <div class="evac-counts"><div><strong>${rooms.length}</strong><span>Rooms</span></div><div><strong>${exits.length}</strong><span>Exits</span></div><div><strong>${occupants.length || Math.min(rooms.length * 3, 15)}</strong><span>Start points*</span></div></div>
      <p class="form-hint">*If no occupant start points are placed, the demo creates up to three markers per room, capped at 15. Speed and grid scale are assumptions, not measured values.</p>
      <div class="scenario-actions"><button type="button" class="button button-quiet" id="resetEvac">Reset</button><button type="button" class="button button-quiet" id="pauseEvac" disabled>Pause</button><button type="button" class="button button-primary" id="runEvac">Run simulation ↗</button></div>
      <div id="evacValidation" class="form-hint" role="status"></div>
    </section>
    <section class="panel evac-visual-panel"><div class="panel-heading"><div><h2>Floor ${selectedFloor} evacuation view</h2><p>Movement paths are schematic direct lines</p></div><span class="badge badge-low" id="evacState">Ready</span></div><div class="evac-canvas-wrap"><canvas id="evacCanvas" width="1000" height="600" aria-label="Schematic evacuation simulation"></canvas></div><div class="plan-legend evac-legend"><span><i class="plan-legend-room"></i>Room / corridor</span><span><i class="plan-legend-exit"></i>Available exit</span><span><i class="plan-legend-blocked"></i>Blocked area / unavailable exit</span><span><i class="legend-dot blue"></i>Occupant</span></div><div id="evacResults" class="evac-results"><div class="empty-state compact-empty"><h3>Results will appear here</h3><p>Run the scenario to see the modelled duration, exit allocation and movement summary.</p></div></div></section></div>`);

    if (!b || !hasPlan) return;

    let activePlan = elements, activeRooms = rooms, activeExits = exits, activeBlocked = blocked, activeOccupants = occupants;
    const canvas = $("#evacCanvas"), ctx = canvas.getContext("2d");
    let raf = 0, running = false, paused = false, startAt = 0, elapsed = 0, agents = [], lastResult = null;
    const W = 1000, H = 600;
    let currentFloor = selectedFloor;

    function nearestExit(p, available) {
      return available.slice().sort((a, c) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(p.x - c.x, p.y - c.y))[0];
    }

    function drawBase() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#fbfcfe";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#e7edf4";
      for (let x = 0; x <= W; x += 25) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      activePlan.forEach(el => {
        if (["room", "corridor", "blocked"].includes(el.type)) {
          const fill = el.type === "room" ? "#edf2f8" : el.type === "corridor" ? "#dff3ef" : "#fde7e8";
          ctx.fillStyle = fill;
          ctx.strokeStyle = el.type === "blocked" ? "#d34f5d" : el.type === "corridor" ? "#4b9d91" : "#8092aa";
          ctx.lineWidth = 2;
          ctx.fillRect(el.x, el.y, el.w, el.h);
          ctx.strokeRect(el.x, el.y, el.w, el.h);
          ctx.fillStyle = "#4b5b70";
          ctx.font = "600 15px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(el.label || el.type.toUpperCase(), el.x + el.w / 2, el.y + el.h / 2, Math.max(40, el.w - 8));
        } else if (el.type === "stair") {
          ctx.fillStyle = "#e9b44c";
          ctx.fillRect(el.x - 18, el.y - 18, 36, 36);
          ctx.fillStyle = "#533d0e";
          ctx.font = "bold 12px Arial";
          ctx.textAlign = "center";
          ctx.fillText("ST", el.x, el.y + 1);
        }
      });

      activeBlocked.forEach(el => {
        ctx.strokeStyle = "#d34f5d";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x + el.w, el.y + el.h);
        ctx.moveTo(el.x + el.w, el.y);
        ctx.lineTo(el.x, el.y + el.h);
        ctx.stroke();
      });

      const scenario = $("#evacScenario")?.value || "normal";
      let available = activeExits.slice();
      if (scenario === "blocked") available = available.slice(0, -1);

      activeExits.forEach((e, i) => {
        const unavailable = !available.some(a => a.id === e.id);
        ctx.fillStyle = unavailable ? "#c74653" : "#168e78";
        ctx.fillRect(e.x - 20, e.y - 16, 40, 32);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(unavailable ? "OFF" : e.label?.slice(0, 8) || `EXIT ${i + 1}`, e.x, e.y);
      });

      if (scenario === "fire") {
        ctx.fillStyle = "rgba(217,91,59,.2)";
        ctx.beginPath();
        ctx.arc(activeRooms[0]?.x + ((activeRooms[0]?.w || 0) / 2) || 150, activeRooms[0]?.y + ((activeRooms[0]?.h || 0) / 2) || 150, 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#c84f34";
        ctx.font = "bold 14px Arial";
        ctx.fillText("FIRE (VISUAL)", activeRooms[0]?.x + ((activeRooms[0]?.w || 0) / 2) || 150, activeRooms[0]?.y + ((activeRooms[0]?.h || 0) / 2) || 150);
      }
      return available;
    }

    function makeAgents(available) {
      let starts = activeOccupants.map(o => ({ x: o.x, y: o.y }));
      if (!starts.length) {
        activeRooms.forEach(r => {
          for (let i = 0; i < Math.min(3, Math.max(1, Math.ceil(Number(b.occupancy || 0) / Math.max(1, activeRooms.length * 100)))); i++) {
            starts.push({ x: r.x + r.w * (0.35 + i * 0.15), y: r.y + r.h * 0.5 });
          }
        });
        starts = starts.slice(0, 15);
      }
      return starts.map((p, i) => {
        const exit = nearestExit(p, available);
        return { ...p, from: { ...p }, to: exit ? { x: exit.x, y: exit.y } : null, exitId: exit?.id || null, progress: 0, done: false, index: i };
      });
    }

    function renderFrame() {
      drawBase();
      agents.forEach(a => {
        if (a.to) {
          ctx.strokeStyle = "rgba(22,142,120,.55)";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 5]);
          ctx.beginPath();
          ctx.moveTo(a.from.x, a.from.y);
          ctx.lineTo(a.to.x, a.to.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const x = a.to ? a.from.x + (a.to.x - a.from.x) * a.progress : a.x;
        const y = a.to ? a.from.y + (a.to.y - a.from.y) * a.progress : a.y;
        ctx.fillStyle = a.done ? "#168e78" : "#5578dc";
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    function finish() {
      running = false;
      paused = false;
      cancelAnimationFrame(raf);
      $("#evacState").textContent = "Complete";
      $("#pauseEvac").disabled = true;
      $("#pauseEvac").textContent = "Pause";
      const seconds = Math.max(1, Math.round(elapsed / 1000));
      const used = {};
      agents.forEach(a => { if (a.exitId) used[a.exitId] = (used[a.exitId] || 0) + 1; });

      $("#evacResults").innerHTML = `<div class="evac-metric-grid"><article><span>Illustrative duration</span><strong>${seconds} s</strong><small>Animation time only; not real travel time</small></article><article><span>Occupants modelled</span><strong>${agents.length}</strong><small>Markers, not a full population model</small></article><article><span>Exit routes assigned</span><strong>${agents.filter(a => a.exitId).length}/${agents.length}</strong><small>Direct-line nearest-exit assignment</small></article></div><h3 class="subsection-title">Exit allocation</h3><div class="evac-exit-results">${activeExits.map((e, i) => `<div><span>${safe(e.label || `Exit ${i + 1}`)}</span><strong>${used[e.id] || 0} occupants</strong><div class="progress"><span style="width:${agents.length ? Math.round((used[e.id] || 0) / agents.length * 100) : 0}%"></span></div></div>`).join("")}</div><p class="form-hint">These are simplified demo outputs. Direct-line routes may pass through walls or blocked areas; do not use these values for real emergency planning.</p>`;

      lastResult = { seconds, agents: agents.length, used };

      const simRecord = {
        id: `sim-${Date.now()}`,
        building_id: b.id,
        building_name: b.name,
        floor: currentFloor,
        scenario: $("#evacScenario").value,
        seconds,
        occupants: agents.length,
        exit_allocation: used,
        created_at: new Date().toISOString(),
        limitations: "Simplified direct-line demo; not validated for real evacuation planning."
      };

      if (R.saveSimulation) {
        R.saveSimulation(simRecord);
      } else {
        try {
          const history = JSON.parse(localStorage.getItem("regulaai_simulation_history_v1") || "[]");
          history.unshift(simRecord);
          localStorage.setItem("regulaai_simulation_history_v1", JSON.stringify(history.slice(0, 100)));
        } catch {}
      }
    }

    function tick(now) {
      if (!running || paused) return;
      elapsed = now - startAt;
      agents.forEach(a => {
        if (!a.to) { a.done = true; return; }
        const dist = Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
        const pace = Number($("#evacSpeed").value || 1.2);
        const duration = Math.max(1000, dist / (pace * 0.06) + agents.length * 65);
        a.progress = Math.min(1, elapsed / duration);
        a.done = a.progress >= 1;
      });
      renderFrame();
      if (agents.every(a => a.done)) { finish(); return; }
      raf = requestAnimationFrame(tick);
    }

    function run() {
      cancelAnimationFrame(raf);
      const scenario = $("#evacScenario").value;
      let available = activeExits.slice();
      if (scenario === "blocked") available = available.slice(0, -1);
      if (!activeRooms.length || !available.length) {
        $("#evacValidation").textContent = !activeRooms.length
          ? "Add at least one room to the floor plan first."
          : scenario === "blocked"
          ? "The selected scenario makes the only available exit unavailable. Add another exit or choose a different scenario."
          : "Add at least one exit to the floor plan first.";
        return;
      }
      agents = makeAgents(available);
      if (!agents.length) {
        $("#evacValidation").textContent = "Add an occupant start point or room before running.";
        return;
      }
      elapsed = 0;
      running = true;
      paused = false;
      startAt = performance.now();
      $("#evacValidation").textContent = "Simulation running with simplified direct-line routes.";
      $("#evacState").textContent = "Running";
      $("#pauseEvac").disabled = false;
      $("#pauseEvac").textContent = "Pause";
      $("#evacResults").innerHTML = `<div class="empty-state compact-empty"><h3>Simulation in progress</h3><p>Occupant markers are moving toward their assigned exits.</p></div>`;
      raf = requestAnimationFrame(tick);
    }

    function reset() {
      cancelAnimationFrame(raf);
      running = false;
      paused = false;
      elapsed = 0;
      agents = [];
      drawBase();
      $("#evacState").textContent = "Ready";
      $("#pauseEvac").disabled = true;
      $("#pauseEvac").textContent = "Pause";
      $("#evacResults").innerHTML = `<div class="empty-state compact-empty"><h3>Results will appear here</h3><p>Run the scenario to see the modelled duration, exit allocation and movement summary.</p></div>`;
    }

    function loadFloor(f) {
      let data = {};
      try { data = JSON.parse(localStorage.getItem("regulaai_floorplans_v1") || "{}"); } catch {}
      activePlan = data[b.id]?.floors?.[f]?.elements || [];
      activeRooms = activePlan.filter(e => e.type === "room");
      activeExits = activePlan.filter(e => e.type === "exit");
      activeBlocked = activePlan.filter(e => e.type === "blocked");
      activeOccupants = activePlan.filter(e => e.type === "occupant");
      currentFloor = f;
      $(".evac-visual-panel h2").textContent = `Floor ${f} evacuation view`;
      const rs = activeRooms.length, es = activeExits.length, os = activeOccupants.length || Math.min(rs * 3, 15);
      const countEls = $(".evac-counts")?.children;
      if (countEls) {
        countEls[0].querySelector("strong").textContent = rs;
        countEls[1].querySelector("strong").textContent = es;
        countEls[2].querySelector("strong").textContent = os;
      }
      reset();
    }

    $("#evacBuilding").addEventListener("change", e => location.href = `evacuation.html?id=${encodeURIComponent(e.target.value)}`);
    $("#evacFloor").addEventListener("change", e => {
      loadFloor(Number(e.target.value));
      $("#evacValidation").textContent = "Floor layout loaded. Check rooms and exits before running.";
    });
    $("#runEvac").addEventListener("click", run);
    $("#resetEvac").addEventListener("click", reset);
    $("#pauseEvac").addEventListener("click", () => {
      if (!running) return;
      paused = !paused;
      if (paused) {
        elapsed = performance.now() - startAt;
        $("#pauseEvac").textContent = "Resume";
        $("#evacState").textContent = "Paused";
        cancelAnimationFrame(raf);
      } else {
        startAt = performance.now() - elapsed;
        $("#pauseEvac").textContent = "Pause";
        $("#evacState").textContent = "Running";
        raf = requestAnimationFrame(tick);
      }
    });
    $("#evacScenario").addEventListener("change", () => { if (!running) renderFrame(); });
    drawBase();
  }

  function renderHuman() {
    const b = getCurrentBuilding();
    $("#pageContent").innerHTML = shellHeader(
      "OCCUPANT INTELLIGENCE",
      "Human–building compatibility",
      "Consider how occupant characteristics interact with building design and emergency communication.",
      b ? `<a class="button button-quiet" href="building-details.html?id=${encodeURIComponent(b.id)}">Building profile ↗</a>` : ""
    ) +
    `<div class="notice notice-info"><span class="notice-symbol">✳</span><div><strong>Core RegulaAI concept</strong><p>A formally adequate exit layout can still create practical bottlenecks if people do not know routes, respond at different speeds, or follow crowds. The prototype presents these factors as explicit assumptions instead of pretending they are measured facts.</p></div></div>
    <div class="feature-grid human-grid"><article class="human-card"><div class="human-icon icon-blue">⌂</div><span class="eyebrow">GROUP 01</span><h2>Familiar occupants</h2><p>People who regularly use the building and may know the usual routes.</p><div class="human-tags"><span>Route familiarity</span><span>Routine knowledge</span></div></article><article class="human-card"><div class="human-icon icon-violet">⌖</div><span class="eyebrow">GROUP 02</span><h2>Unfamiliar occupants</h2><p>Visitors or new users who may need clearer wayfinding and visible signs.</p><div class="human-tags"><span>Wayfinding</span><span>Signage visibility</span></div></article><article class="human-card"><div class="human-icon icon-amber">◷</div><span class="eyebrow">GROUP 03</span><h2>Delayed response</h2><p>People who may need extra time to recognise an alarm, decide, or receive assistance.</p><div class="human-tags"><span>Response time</span><span>Assistance planning</span></div></article><article class="human-card"><div class="human-icon icon-teal">◎</div><span class="eyebrow">GROUP 04</span><h2>Group-following</h2><p>People who may follow a crowd or familiar group rather than choose an alternate route.</p><div class="human-tags"><span>Social influence</span><span>Route choice</span></div></article></div>
    <section class="panel"><div class="panel-heading"><div><h2>Compatibility review prompts</h2><p>Use these prompts when planning a scenario</p></div></div><div class="prompt-list">${[["Exit overload","Could a preferred exit receive a disproportionate share of occupants?"],["Route discovery","Can unfamiliar people find more than one suitable exit?"],["Alarm response","Are alarm cues audible/visible and are response delays considered?"],["Accessible assistance","Are plans in place for people needing assistance or accessible routes?"],["Alternative routes","Could people follow a crowd past a less congested route?"]].map((x,i)=>`<label class="prompt-row"><input type="checkbox" data-prompt="${i}"><span><strong>${safe(x[0])}</strong><small>${safe(x[1])}</small></span></label>`).join("")}</div><p class="form-hint" id="promptCount">0 review prompts marked for follow-up.</p></section>`;
    
    $$("input[data-prompt]").forEach(el => el.addEventListener("change", () => {
      $("#promptCount").textContent = `${$$("input[data-prompt]:checked").length} review prompt${$$("input[data-prompt]:checked").length === 1 ? "" : "s"} marked for follow-up.`;
    }));
  }

  function renderRecommendations() {
    const b = getCurrentBuilding(), result = b ? R.assessLocal(b) : null;
    $("#pageContent").innerHTML = shellHeader(
      "ACTION PLANNING",
      "Safety recommendations",
      "Prioritise evidence-based follow-up and test hypothetical interventions without claiming guaranteed risk reduction.",
      b ? `<a class="button button-primary" href="recommendation-simulation.html?id=${encodeURIComponent(b.id)}">Test an intervention ↗</a>` : ""
    ) +
    (!b ? R.emptyState("Add a building first", "Recommendations use building inputs.", `<a class="button button-primary" href="buildings.html">Open buildings</a>`) : `
    <div class="notice notice-info"><span class="notice-symbol">i</span><div><strong>Recommendations are review prompts</strong><p>They are not automatic engineering instructions. Confirm feasibility, legal requirements, and design decisions with qualified professionals.</p></div></div>
    <div class="recommendation-stack">${result.factors.map((f, i) => `<article class="recommendation-card"><div class="rec-number">${String(i + 1).padStart(2, "0")}</div><div class="rec-main"><div class="rec-title-row"><h3>${safe(f.name)}</h3>${R.badge(f.severity)}</div><p>${safe(f.detail)}</p><div class="rec-action"><strong>Suggested follow-up</strong><span>${safe(f.name.toLowerCase().includes("exit") ? "Verify exit count, independence, travel distances, signage, and usable capacity against the applicable local code." : f.name.toLowerCase().includes("alarm") ? "Arrange a documented alarm coverage inspection and test, including audible/visible notification where applicable." : f.name.toLowerCase().includes("lighting") ? "Inspect emergency lighting and document functional tests and coverage along egress paths." : f.name.toLowerCase().includes("signage") ? "Check that signs are visible, legible, illuminated where required, and direct occupants to suitable exits." : "Confirm all entered inputs and arrange a site review with a qualified safety professional.")}</span></div></div><a class="rec-arrow" href="recommendation-simulation.html?id=${encodeURIComponent(b.id)}" aria-label="Test intervention">↗</a></article>`).join("")}
    <section class="panel"><div class="panel-heading"><div><h2>Always verify</h2><p>Minimum review principles</p></div></div><ul class="plain-list"><li>Confirm applicable local building and fire codes with a qualified professional.</li><li>Use verified site measurements and documented inspection records.</li><li>Include people who may need accessible routes, assistance, or extra response time.</li><li>Reassess after changes to occupancy, layout, exits, alarms, or infrastructure.</li></ul></section>`);
  }

  function renderSimulation() {
    const b = getCurrentBuilding();
    $("#pageContent").innerHTML = shellHeader(
      "WHAT-IF ANALYSIS",
      "Intervention simulator",
      "Change selected input assumptions and compare the prototype's baseline with a hypothetical scenario.",
      b ? `<span class="muted small">Building: ${safe(b.name)}</span>` : ""
    ) +
    (!b ? R.emptyState("Add a building first", "A scenario needs a saved building profile.", `<a class="button button-primary" href="buildings.html">Add building</a>`) : `
    <div class="notice notice-warning"><span class="notice-symbol">!</span><div><strong>Hypothetical comparison only</strong><p>Changing a number does not prove a real intervention will reduce risk. No result is saved as an actual inspection finding unless you explicitly run a normal assessment.</p></div></div>
    <div class="simulation-layout"><section class="panel"><div class="panel-heading"><div><h2>Scenario controls</h2><p>Adjust values for a what-if comparison</p></div></div><form id="scenarioForm" class="scenario-form">
    <label class="field"><span>Exit count</span><input name="exit_count" type="number" min="0" max="30" value="${b.exit_count || 0}"></label>
    <label class="field"><span>Aggregate exit capacity</span><input name="exit_capacity" type="number" min="0" value="${b.exit_capacity || 0}"></label>
    <label class="field"><span>Alarm coverage (%)</span><input name="alarm_coverage" type="number" min="0" max="100" value="${b.alarm_coverage || 0}"></label>
    <label class="field"><span>Emergency-light coverage (%)</span><input name="emergency_light_coverage" type="number" min="0" max="100" value="${b.emergency_light_coverage || 0}"></label>
    <label class="field"><span>Signage coverage (%)</span><input name="signage_coverage" type="number" min="0" max="100" value="${b.signage_coverage || 0}"></label>
    <div class="scenario-actions"><button type="button" class="button button-quiet" id="resetScenario">Reset values</button><button class="button button-primary" type="submit">Compare scenario ↗</button></div></form></section>
    <section class="panel"><div class="panel-heading"><div><h2>Baseline vs scenario</h2><p>Illustrative score comparison</p></div></div><div id="scenarioResult"><div class="empty-state compact-empty"><div class="empty-icon">⇄</div><h3>Ready to compare</h3><p>Change values and select “Compare scenario”.</p></div></div></section></div>`);

    const form = $("#scenarioForm");
    if (!form) return;
    const initial = Object.fromEntries(new FormData(form).entries());

    $("#resetScenario").addEventListener("click", () => {
      for (const [k, v] of Object.entries(initial)) form.elements[k].value = v;
      $("#scenarioResult").innerHTML = `<div class="empty-state compact-empty"><h3>Values reset</h3><p>Run the comparison to refresh the result.</p></div>`;
    });

    form.addEventListener("submit", e => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      for (const k of Object.keys(values)) values[k] = Number(values[k] || 0);
      if (["alarm_coverage", "emergency_light_coverage", "signage_coverage"].some(k => values[k] < 0 || values[k] > 100)) {
        R.toast("Coverage values must be between 0 and 100.", "error");
        return;
      }
      const scenario = { ...b, ...values };
      const baseline = R.assessLocal(b), next = R.assessLocal(scenario), delta = Math.round((next.risk_score - baseline.risk_score) * 10) / 10;
      $("#scenarioResult").innerHTML = `<div class="scenario-comparison"><div class="scenario-score"><span>BASELINE</span><strong>${baseline.risk_score}</strong><small>${baseline.risk_level} · demo score</small></div><div class="comparison-arrow">→</div><div class="scenario-score scenario-next"><span>HYPOTHETICAL</span><strong>${next.risk_score}</strong><small>${next.risk_level} · demo score</small></div></div><div class="delta-card ${delta < 0 ? "delta-better" : delta > 0 ? "delta-worse" : ""}"><span>Difference in demo score</span><strong>${delta > 0 ? "+" : ""}${delta}</strong><small>${delta < 0 ? "Lower illustrative score" : delta > 0 ? "Higher illustrative score" : "No change in illustrative score"}</small></div><h3 class="subsection-title">Changed risk flags</h3><div class="factor-list">${next.factors.map(f => `<div class="factor-row"><span class="factor-bullet ${R.riskClass(f.severity)}"></span><div><strong>${safe(f.name)}</strong><p>${safe(f.detail)}</p></div>${R.badge(f.severity)}</div>`).join("")}</div><p class="form-hint">This is not evidence that a real intervention will produce this change. Verify any proposed change with site measurements, applicable code, and professional analysis.</p>`;
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const p = document.body.dataset.page;
    if (p === "evacuation") renderEvacuation();
    if (p === "human-behavior") renderHuman();
    if (p === "recommendations") renderRecommendations();
    if (p === "recommendation-simulation") renderSimulation();
  });

  document.addEventListener("regulaai:data-changed", () => {
    const p = document.body.dataset.page;
    if (p === "evacuation") renderEvacuation();
    if (p === "human-behavior") renderHuman();
    if (p === "recommendations") renderRecommendations();
    if (p === "recommendation-simulation") renderSimulation();
  });
})();