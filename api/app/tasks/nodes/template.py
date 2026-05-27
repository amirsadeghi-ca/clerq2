import json
import re


def render_template(template: str, context: dict) -> str:
    """Replace {{key}} or {{key.sub}} placeholders with values from context."""
    def replace(m: re.Match) -> str:
        parts = m.group(1).strip().split(".")
        val: object = context
        for part in parts:
            val = val.get(part, "") if isinstance(val, dict) else ""
        if isinstance(val, (dict, list)):
            return json.dumps(val, indent=2)
        return str(val)
    return re.sub(r'\{\{([^}]+)\}\}', replace, template)
