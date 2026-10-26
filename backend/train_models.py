"""Train a basic Random Forest classifier from a labelled CSV; evaluation is held out."""
from pathlib import Path
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "dataset" / "building_safety.csv"
MODEL_DIR = Path(__file__).resolve().parent / "models"
FEATURES = [
    "building_age", "floors", "occupancy", "exit_count", "staircase_count",
    "fire_extinguisher_count", "alarm_coverage", "emergency_light_coverage",
    "signage_coverage", "exit_capacity"
]
TARGET = "risk_label"

def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"Dataset not found: {CSV_PATH}")
    df = pd.read_csv(CSV_PATH)
    required = FEATURES + [TARGET]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")
    df = df.dropna(subset=[TARGET])
    if len(df) < 20 or df[TARGET].nunique() < 2:
        raise SystemExit("Need at least 20 labelled rows and at least 2 target classes. Do not train on the empty template.")
    X = df[FEATURES].apply(pd.to_numeric, errors="coerce")
    y = df[TARGET].astype(str)
    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
    except ValueError as exc:
        raise SystemExit(f"Unable to make a stratified split. Add more examples per class. {exc}")
    model = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("classifier", RandomForestClassifier(n_estimators=250, random_state=42, class_weight="balanced"))
    ])
    model.fit(X_train, y_train)
    predictions = model.predict(X_test)
    print(f"Held-out accuracy: {accuracy_score(y_test, predictions):.3f}")
    print("Classification report:")
    print(classification_report(y_test, predictions, zero_division=0))
    print("Confusion matrix (labels order shown below):")
    print(sorted(y.unique()))
    print(confusion_matrix(y_test, predictions, labels=sorted(y.unique())))
    MODEL_DIR.mkdir(exist_ok=True)
    joblib.dump({"model": model, "features": FEATURES, "target": TARGET}, MODEL_DIR / "random_forest.joblib")
    print(f"Saved model to {MODEL_DIR / 'random_forest.joblib'}")
    print("These metrics are only meaningful if the labels and source data are reliable and representative.")

if __name__ == "__main__":
    main()
