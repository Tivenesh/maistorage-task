from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import Session
from sqlalchemy.orm import sessionmaker
from collections.abc import Generator
import os
from pathlib import Path

from . import config  # noqa: F401  (loads .env before DATABASE_URL is read)

_BACKEND_DIR = Path(__file__).resolve().parents[1]


def _resolve_database_url(raw_url: str) -> str:
    """
    Anchors a relative sqlite:/// path to the backend directory so the same
    DATABASE_URL resolves to the same file regardless of the process's
    current working directory (plain `uvicorn` from backend/, --app-dir from
    the repo root, pytest, or Docker all launch with different cwds).
    Absolute sqlite URLs (e.g. Docker's sqlite:////app/data/chats.db) and
    non-sqlite URLs pass through unchanged.
    """
    prefix = "sqlite:///"
    if not raw_url.startswith(prefix):
        return raw_url
    raw_path = Path(raw_url.removeprefix(prefix))
    if raw_path.is_absolute():
        return raw_url
    absolute_path = (_BACKEND_DIR / raw_path).resolve()
    return f"{prefix}{absolute_path.as_posix()}"


DATABASE_URL = _resolve_database_url(os.getenv("DATABASE_URL", "sqlite:///./data/chats.db"))

if DATABASE_URL.startswith("sqlite:///"):
    db_path = Path(DATABASE_URL.removeprefix("sqlite:///"))
    db_path.parent.mkdir(parents=True, exist_ok=True)

# Create engine
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

# Create sessionmaker
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base
Base = declarative_base()

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
