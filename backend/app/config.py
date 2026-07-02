"""Environment loading for the backend.

Loads `.env` files at import time so `os.getenv` works everywhere else,
without pulling in an extra dependency. Values already present in the real
environment always win over `.env` file values, matching python-dotenv's
default behavior.

Search order (first file found per key wins):
1. backend/.env        (next to this package)
2. repo-root/.env      (shared with docker-compose)
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _BACKEND_DIR.parent


def _parse_env_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, _, value = stripped.partition("=")
    key = key.strip()
    value = value.strip().strip('"').strip("'")
    if not key or not value:
        return None
    return key, value


def load_env_files(paths: list[Path] | None = None) -> list[str]:
    """Load .env files into os.environ without overriding existing values."""
    loaded_from: list[str] = []
    for env_path in paths if paths is not None else [_BACKEND_DIR / ".env", _REPO_ROOT / ".env"]:
        if not env_path.is_file():
            continue
        try:
            for line in env_path.read_text(encoding="utf-8").splitlines():
                parsed = _parse_env_line(line)
                if parsed is None:
                    continue
                key, value = parsed
                if key not in os.environ or not os.environ[key]:
                    os.environ[key] = value
            loaded_from.append(str(env_path))
        except OSError as exc:
            logger.warning("Could not read env file %s: %s", env_path, exc)
    return loaded_from


def cors_allow_origins() -> list[str]:
    """CORS origins from CORS_ALLOW_ORIGINS (comma-separated), localhost by default."""
    raw = os.getenv("CORS_ALLOW_ORIGINS", "")
    if raw.strip() == "*":
        return ["*"]
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or ["http://localhost:3000", "http://127.0.0.1:3000"]


_ENV_FILES_LOADED = load_env_files()
