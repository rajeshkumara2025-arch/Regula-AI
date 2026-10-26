"""REST API Supabase adapter with explicit path loading and error logging."""
import os
from pathlib import Path
import requests
from dotenv import load_dotenv

# Explicitly load .env from the backend directory
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

_url = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
if _url.endswith("/rest/v1"):
    _url = _url[:-8]

_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()

if not _url or not _key:
    print(f"⚠️ Supabase credentials missing! Checked path: {env_path}")

HEADERS = {
    "apikey": _key,
    "Authorization": f"Bearer {_key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def client():
    return bool(_url and _key)

def list_buildings():
    if not client(): return None
    res = requests.get(f"{_url}/rest/v1/buildings?select=*&order=created_at.desc", headers=HEADERS)
    if res.status_code == 200:
        return res.json()
    print(f"❌ Supabase GET buildings failed ({res.status_code}): {res.text}")
    return None

def upsert_building(building):
    if not client(): return None
    headers = HEADERS.copy()
    headers["Prefer"] = "return=representation,resolution=merge-duplicates"
    res = requests.post(f"{_url}/rest/v1/buildings", headers=headers, json=building)
    if res.status_code in (200, 201):
        print(f"✅ Building saved to Supabase: {building.get('name')}")
        return res.json()
    print(f"❌ Supabase POST building failed ({res.status_code}): {res.text}")
    return None

def get_building(building_id):
    if not client(): return None
    res = requests.get(f"{_url}/rest/v1/buildings?id=eq.{building_id}&select=*&limit=1", headers=HEADERS)
    if res.status_code == 200:
        data = res.json()
        return data[0] if data else None
    print(f"❌ Supabase GET building failed ({res.status_code}): {res.text}")
    return None

def delete_building(building_id):
    if not client(): return None
    res = requests.delete(f"{_url}/rest/v1/buildings?id=eq.{building_id}", headers=HEADERS)
    if res.status_code in (200, 204):
        return True
    print(f"❌ Supabase DELETE building failed ({res.status_code}): {res.text}")
    return None

def list_assessments():
    if not client(): return None
    res = requests.get(f"{_url}/rest/v1/assessments?select=*&order=created_at.desc", headers=HEADERS)
    if res.status_code == 200:
        return res.json()
    print(f"❌ Supabase GET assessments failed ({res.status_code}): {res.text}")
    return None

def save_assessment(assessment):
    if not client(): return None
    res = requests.post(f"{_url}/rest/v1/assessments", headers=HEADERS, json=assessment)
    if res.status_code in (200, 201):
        print(f"✅ Assessment saved to Supabase for: {assessment.get('building_name')}")
        return res.json()
    print(f"❌ Supabase POST assessment failed ({res.status_code}): {res.text}")
    return None

# ---------------------------------------------------------------------
# Floor Plans & Simulation History
# ---------------------------------------------------------------------

def get_floor_plan(building_id):
    if not client(): return None
    res = requests.get(f"{_url}/rest/v1/floor_plans?building_id=eq.{building_id}&select=*&limit=1", headers=HEADERS)
    if res.status_code == 200:
        data = res.json()
        return data[0] if data else None
    print(f"❌ Supabase GET floor_plan failed ({res.status_code}): {res.text}")
    return None

def upsert_floor_plan(building_id, floors):
    if not client(): return None
    payload = {
        "building_id": building_id,
        "floors": floors,
        "updated_at": requests.utils.default_user_agent() # fallback timestamp handled by Postgres default or ISO string
    }
    from datetime import datetime, timezone
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    headers = HEADERS.copy()
    headers["Prefer"] = "return=representation,resolution=merge-duplicates"
    res = requests.post(f"{_url}/rest/v1/floor_plans", headers=headers, json=payload)
    if res.status_code in (200, 201):
        print(f"✅ Floor plan saved to Supabase for building: {building_id}")
        return res.json()
    print(f"❌ Supabase POST floor_plan failed ({res.status_code}): {res.text}")
    return None

def list_simulations():
    if not client(): return None
    res = requests.get(f"{_url}/rest/v1/simulations?select=*&order=created_at.desc", headers=HEADERS)
    if res.status_code == 200:
        return res.json()
    print(f"❌ Supabase GET simulations failed ({res.status_code}): {res.text}")
    return None

def save_simulation(sim):
    if not client(): return None
    res = requests.post(f"{_url}/rest/v1/simulations", headers=HEADERS, json=sim)
    if res.status_code in (200, 201):
        print(f"✅ Evacuation simulation saved to Supabase for: {sim.get('building_name')}")
        return res.json()
    print(f"❌ Supabase POST simulation failed ({res.status_code}): {res.text}")
    return None