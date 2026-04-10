from __future__ import annotations

from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, TemplateNotFound


class PromptService:
    def __init__(self, templates_dir: str | None = None) -> None:
        base_dir = Path(__file__).resolve().parent
        self.templates_dir = Path(templates_dir) if templates_dir else base_dir / "templates"
        self.env = Environment(
            loader=FileSystemLoader(str(self.templates_dir)),
            autoescape=False,
            trim_blocks=True,
            lstrip_blocks=True,
            undefined=StrictUndefined,
        )

    def render(self, template_name: str, context: dict[str, Any] | None = None) -> str:
        context = context or {}
        try:
            template = self.env.get_template(template_name)
            return template.render(**context).strip()
        except TemplateNotFound as exc:
            raise RuntimeError(f"Prompt template not found: {template_name}") from exc

