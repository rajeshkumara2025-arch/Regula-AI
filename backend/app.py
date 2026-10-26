from datetime import datetime, timezone
import uuid
from flask import Flask, jsonify, request
from flask_cors import CORS
import database
from predict import assess_building

app = Flask(__name__)
CORS(app)
DEMO_BUILDINGS = {}
DEMO_ASSESSMENTS = []
DEMO_FLOOR_PLANS = {}
DEMO_SIMULATIONS = []

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def clean_building(data):
    required = ["name"]
    for key in required:
        if not str(data.get(key, "")).strip():
            raise ValueError(f"{key} is required")
    result = {
        "id": str(data.get("id") or uuid.uuid4()),
        "name": str(data["name"]).strip(),
        "address": str(data.get("address", "")).strip(),
        "building_type": str(data.get("building_type", "Office")),
    }
    int_fields = ["floors", "building_age", "occupancy", "exit_count", "staircase_count",
                  "fire_extinguisher_count", "exit_capacity"]
    for field in int_fields:
        try: result[field] = max(0, int(data.get(field, 0) or 0))
        except (ValueError, TypeError): raise ValueError(f"{field} must be a whole number")
    for field in ["alarm_coverage", "emergency_light_coverage", "signage_coverage"]:
        try:
            value = float(data.get(field, 0) or 0)
            if not 0 <= value <= 100: raise ValueError
            result[field] = value
        except (ValueError, TypeError):
            raise ValueError(f"{field} must be between 0 and 100")
    result["occupant_groups"] = data.get("occupant_groups") or {
        "familiar": 40, "unfamiliar": 20, "delayed": 20, "group_following": 20
    }
    result["updated_at"] = now_iso()
    result["created_at"] = data.get("created_at") or now_iso()
    return result

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "RegulaAI API", "time": now_iso(),
                    "database": "supabase" if database.client() else "demo memory"})

@app.get("/api/buildings")
def list_buildings():
    rows = database.list_buildings()
    if rows is not None:
        return jsonify(rows)
    return jsonify(list(DEMO_BUILDINGS.values()))

@app.post("/api/buildings")
def create_building():
    try:
        building = clean_building(request.get_json(force=True) or {})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    rows = database.upsert_building(building)
    if rows is None:
        DEMO_BUILDINGS[building["id"]] = building
    return jsonify(building), 201

@app.get("/api/buildings/<building_id>")
def get_building(building_id):
    row = database.get_building(building_id)
    if row is None:
        row = DEMO_BUILDINGS.get(building_id)
    if not row:
        return jsonify({"error": "Building not found"}), 404
    return jsonify(row)

@app.delete("/api/buildings/<building_id>")
def remove_building(building_id):
    rows = database.delete_building(building_id)
    if rows is None:
        DEMO_BUILDINGS.pop(building_id, None)
    DEMO_ASSESSMENTS[:] = [a for a in DEMO_ASSESSMENTS if a.get("building_id") != building_id]
    return jsonify({"deleted": True, "id": building_id})

@app.get("/api/assessments")
def list_assessments():
    rows = database.list_assessments()
    if rows is not None:
        return jsonify(rows)
    return jsonify(DEMO_ASSESSMENTS)

@app.post("/api/assessments")
def create_assessment():
    data = request.get_json(force=True) or {}
    building_id = str(data.get("building_id", ""))
    building = database.get_building(building_id) or DEMO_BUILDINGS.get(building_id)
    if not building:
        return jsonify({"error": "Building not found. Save the building first."}), 404
    result = assess_building(building)
    assessment = {
        "id": str(uuid.uuid4()),
        "building_id": building_id,
        "building_name": building.get("name", "Building"),
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "compliance_score": result["compliance_score"],
        "result": result,
        "created_at": now_iso()
    }
    saved = database.save_assessment(assessment)
    if saved is None:
        DEMO_ASSESSMENTS.insert(0, assessment)
    return jsonify(assessment), 201

@app.post("/api/assess")
def quick_assess():
    data = request.get_json(force=True) or {}
    try:
        building = clean_building(data)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(assess_building(building))

@app.errorhandler(500)
def server_error(_error):
    return jsonify({"error": "Unexpected server error. Check the Flask Terminal for details."}), 500

@app.get("/api/floor-plans/<building_id>")
def get_floor_plan_endpoint(building_id):
    plan = database.get_floor_plan(building_id)
    if plan is not None:
        return jsonify(plan)
    return jsonify(DEMO_FLOOR_PLANS.get(building_id, {"building_id": building_id, "floors": {}}))

@app.post("/api/floor-plans/<building_id>")
def save_floor_plan_endpoint(building_id):
    data = request.get_json(force=True) or {}
    floors = data.get("floors", {})
    saved = database.upsert_floor_plan(building_id, floors)
    if saved is None:
        DEMO_FLOOR_PLANS[building_id] = {"building_id": building_id, "floors": floors, "updated_at": now_iso()}
    return jsonify({"building_id": building_id, "floors": floors}), 200

@app.get("/api/simulations")
def list_simulations_endpoint():
    rows = database.list_simulations()
    if rows is not None:
        return jsonify(rows)
    return jsonify(DEMO_SIMULATIONS)

@app.post("/api/simulations")
def create_simulation_endpoint():
    sim = request.get_json(force=True) or {}
    if not sim.get("id"):
        sim["id"] = f"sim-{uuid.uuid4()}"
    if not sim.get("created_at"):
        sim["created_at"] = now_iso()
    saved = database.save_simulation(sim)
    if saved is None:
        DEMO_SIMULATIONS.insert(0, sim)
    return jsonify(sim), 201

if __name__ == "__main__":
    import os
    app.run(host="127.0.0.1", port=int(os.getenv("FLASK_PORT", "5000")), debug=True)
