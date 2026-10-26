"""Transparent demonstration assessment. Not a validated life-safety model."""
from pathlib import Path
import joblib  # type: ignore # Lazy import: runs only if joblib & scikit-learn are installed
# joblib import removed to bypass MSYS2/scikit-learn compilation errors

MODEL_DIR = Path(__file__).parent / "models"

FEATURES = [
    "building_age", "floors", "occupancy", "exit_count", "staircase_count",
    "fire_extinguisher_count", "alarm_coverage", "emergency_light_coverage",
    "signage_coverage", "exit_capacity"
]

def _demo_prediction(building):
    # Illustrative heuristic only. The score is not a code-compliance determination.
    occupancy = max(int(building.get("occupancy", 0) or 0), 0)
    exits = max(int(building.get("exit_count", 0) or 0), 0)
    capacity = max(int(building.get("exit_capacity", 0) or 0), 0)
    floors = max(int(building.get("floors", 1) or 1), 1)
    alarm = float(building.get("alarm_coverage", 0) or 0)
    lighting = float(building.get("emergency_light_coverage", 0) or 0)
    signage = float(building.get("signage_coverage", 0) or 0)
    age = max(int(building.get("building_age", 0) or 0), 0)

    score = 15
    if exits < 2: score += 18
    if exits == 0: score += 20
    if capacity and occupancy > capacity: score += min(25, 25 * (occupancy - capacity) / max(occupancy, 1))
    elif occupancy and not capacity: score += 8
    score += min(12, max(0, floors - 3) * 2)
    score += min(10, age / 5)
    score += (100 - min(100, max(0, alarm))) * 0.12
    score += (100 - min(100, max(0, lighting))) * 0.10
    score += (100 - min(100, max(0, signage))) * 0.08
    score = round(min(100, max(0, score)), 1)
    level = "Low" if score < 35 else "Medium" if score < 65 else "High"

    factors = []
    if exits < 2: factors.append({"name": "Limited exit count", "severity": "High", "detail": "Review the number, independence, and placement of exits against applicable requirements."})
    if capacity and occupancy > capacity: factors.append({"name": "Occupancy exceeds entered exit capacity", "severity": "High", "detail": "The entered occupancy is greater than the supplied aggregate exit capacity."})
    if alarm < 80: factors.append({"name": "Alarm coverage needs review", "severity": "Medium", "detail": "Entered alarm coverage is below the prototype's 80% review threshold."})
    if lighting < 80: factors.append({"name": "Emergency lighting needs review", "severity": "Medium", "detail": "Entered emergency-light coverage is below the prototype's 80% review threshold."})
    if signage < 80: factors.append({"name": "Signage coverage needs review", "severity": "Medium", "detail": "Entered signage coverage is below the prototype's 80% review threshold."})
    if not factors: factors.append({"name": "No major input flags from the demo rules", "severity": "Low", "detail": "This does not prove the building is safe or compliant; inspect actual site conditions and applicable codes."})

    compliance_checks = [
        {"name": "Exit information provided", "status": "Review" if exits < 2 else "Input provided", "passed": exits >= 2},
        {"name": "Alarm coverage entered", "status": "Review" if alarm < 80 else "Input threshold met", "passed": alarm >= 80},
        {"name": "Emergency lighting entered", "status": "Review" if lighting < 80 else "Input threshold met", "passed": lighting >= 80},
        {"name": "Signage coverage entered", "status": "Review" if signage < 80 else "Input threshold met", "passed": signage >= 80},
        {"name": "Exit capacity entered", "status": "Review" if capacity <= 0 else "Input provided", "passed": capacity > 0},
    ]
    compliance_score = round(100 * sum(1 for c in compliance_checks if c["passed"]) / len(compliance_checks))
    return {
        "risk_score": score,
        "risk_level": level,
        "compliance_score": compliance_score,
        "model_status": "Demonstration heuristic — ML models bypassed due to MSYS2 environment",
        "models": [
            {"name": "Decision Tree", "status": "Not loaded", "prediction": None},
            {"name": "Random Forest", "status": "Not loaded", "prediction": None},
            {"name": "XGBoost", "status": "Not loaded", "prediction": None},
        ],
        "factors": factors,
        "compliance_checks": compliance_checks,
        "recommendations": [
            "Have a qualified fire-safety professional verify the exit count, separation, travel distances, and capacity against the applicable local code.",
            "Inspect and document alarm, emergency-lighting, signage, and fire-equipment coverage on site.",
            "Re-check occupancy assumptions and model occupant groups for people who may need additional evacuation assistance."
        ],
        "limitations": [
            "This is a prototype heuristic based on user-entered values, not a certified fire-safety assessment.",
            "A low score does not establish code compliance or guarantee safe evacuation.",
            "No supervised ML model is reported until it has been trained and evaluated on a suitable labelled dataset."
        ]
    }

def assess_building(building):
    model_path = MODEL_DIR / "random_forest.joblib"
    if model_path.exists():
        try:
            
            bundle = joblib.load(model_path)
            row = [[float(building.get(col, 0) or 0) for col in bundle["features"]]]
            prediction = str(bundle["model"].predict(row)[0])
            result = _demo_prediction(building)
            result["model_status"] = "Random Forest trained artifact loaded; prototype heuristic score remains separate"
            result["models"][1] = {
                "name": "Random Forest",
                "status": "Trained artifact loaded",
                "prediction": prediction
            }
            return result
        except Exception as exc:
            result = _demo_prediction(building)
            result["model_status"] = f"Model artifact could not be used; demo heuristic shown ({exc})"
            return result
    return _demo_prediction(building)