from __future__ import annotations

import json
from pathlib import Path
from typing import Any

try:
    import jsonschema
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover
    jsonschema = None  # type: ignore
    Draft202012Validator = None  # type: ignore


def _schema_path() -> Path:
    here = Path(__file__).resolve().parent
    candidates = [
        here.parent.parent / "packages" / "skill-spec" / "schema.json",
        Path("/app/packages/skill-spec/schema.json"),
        here / "skill_spec_schema.json",
    ]
    for c in candidates:
        if c.exists():
            return c
    raise FileNotFoundError("skill schema.json not found (expected repo packages/skill-spec or bundled skill_spec_schema.json)")


def load_skill_schema() -> dict[str, Any]:
    with open(_schema_path(), encoding="utf-8") as f:
        return json.load(f)


def validate_skill_manifest(manifest: dict[str, Any]) -> tuple[bool, list[str]]:
    """Validate manifest against packages/skill-spec/schema.json. Returns (ok, errors)."""
    if jsonschema is None or Draft202012Validator is None:
        return False, ["jsonschema package is required for skill manifest validation"]
    schema = load_skill_schema()
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(manifest), key=lambda e: e.path)
    msgs = [f"{list(e.path)}: {e.message}" for e in errors]
    return (len(msgs) == 0, msgs)
