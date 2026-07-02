# Package marker for FastAPI app.
# Importing config first guarantees .env values are loaded before any module
# (llm.py in particular) reads os.getenv at import time.
from . import config as _config  # noqa: F401
