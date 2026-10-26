# RegulaAI

**RegulaAI – AI-Powered Intelligent Building Compliance, Risk Assessment and Human-Aware Safety Analysis Platform**

Frontend: plain HTML, CSS, JavaScript  
Backend: Python + Flask  
Database: Supabase/PostgreSQL (optional; the UI supports demo mode without credentials)

## Run the frontend

From this folder:

```bash
python3 -m http.server 5500
```

Open http://localhost:5500

The frontend starts in **Demo Mode** and stores sample buildings and assessment history in browser `localStorage`. No database or API credentials are needed to explore the UI.

## Run the Flask backend

In a second Terminal window:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

API base URL: http://127.0.0.1:5000/api

To use the frontend with the API, set `API_BASE_URL` in `assets/js/app.js` to `http://127.0.0.1:5000/api`. Without the backend, the UI uses local demo data.

## Supabase (optional)

1. Create a Supabase project.
2. Run the SQL in `backend/schema.sql` in the Supabase SQL Editor.
3. Copy `backend/.env.example` to `backend/.env` and add your Supabase URL and **service role key only on the backend**.
4. Install requirements and restart Flask.

Never place the Supabase service-role key in browser JavaScript or commit `.env`.

## ML model notes

`backend/train_models.py` trains models only if you provide a suitable **labelled** CSV. The default `dataset/building_safety.csv` is a header-only template. It does not contain evidence for model accuracy. `predict.py` deliberately reports a transparent rule-based demonstration prediction until valid trained model artifacts exist. Do not present demo predictions as validated AI results or use this prototype for real-life building safety decisions.

Suggested labelled dataset columns:
- numeric input features: `building_age`, `floors`, `occupancy`, `exit_count`, `staircase_count`, `fire_extinguisher_count`, `alarm_coverage`, `emergency_light_coverage`, `signage_coverage`, `exit_capacity`
- target label: `risk_label` with values such as `Low`, `Medium`, `High`, based on a defensible source/labeling process.

The example model pipeline is educational and requires validation, suitable data, and domain expert review before any real-world use.

## Main pages

- `index.html`: dashboard
- `buildings.html`: building portfolio and add-building form
- `building-details.html`: individual building details
- `compliance.html`: rule-based checks
- `risk-assessment.html`: assessment and model status
- `floor-plan.html`: interactive 2D floor-plan editor; save rooms, corridors, exits, staircases, blocked areas and occupant start points per building/floor
- `evacuation.html`: animated schematic evacuation demonstration using the configured floor plan
- `human-behavior.html`: occupant-group assumptions
- `recommendations.html`: safety recommendations
- `recommendation-simulation.html`: compare baseline vs hypothetical interventions
- `history.html`: stored assessments
- `reports.html`: printable report


## Floor-plan workflow (prototype)

1. Open **Buildings** and select a building.
2. Open **Floor plan** from the sidebar or the building profile.
3. Choose a floor and use the editor tools: drag to draw rooms, corridors or blocked areas; click to place exits, staircases and occupant start points.
4. Save the floor plan. The editor stores this layout in that browser's `localStorage` under `regulaai_floorplans_v1`. It is separate from the Flask/Supabase data model in this prototype.
5. Open **Evacuation**, select a floor and run a scenario.

The current movement animation assigns each occupant to the nearest available exit using a direct line. It does not check connectivity, walls, travel distance, smoke, queuing, collisions or building-code requirements. Displayed duration and allocation are illustrative model outputs only. Do not use them for real emergency planning.
