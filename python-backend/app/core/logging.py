"""
Structured logging configuration for Doctor GPT Backend
"""

import logging
import sys
from typing import Any, Dict

import structlog
from structlog.typing import Processor

from app.core.config import settings


def add_app_context(logger: Any, method_name: str, event_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Add application context to log events"""
    event_dict["service"] = "doctor-gpt-backend"
    event_dict["version"] = "1.0.0"
    event_dict["environment"] = settings.ENVIRONMENT
    return event_dict


def configure_logging() -> None:
    """Configure structured logging for the application"""
    
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.LOG_LEVEL.upper()),
    )
    
    # Configure processors based on environment
    processors: list[Processor] = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="ISO"),
        structlog.processors.StackInfoRenderer(),
        add_app_context,
    ]
    
    if settings.is_development:
        # Pretty printing for development
        processors.extend([
            structlog.dev.ConsoleRenderer(colors=True)
        ])
    else:
        # JSON formatting for production
        processors.extend([
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ])
    
    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        context_class=dict,
        cache_logger_on_first_use=True,
    )
    
    # Suppress noisy loggers in development
    if settings.is_development:
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.dialects").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.orm").setLevel(logging.WARNING)


def get_logger(name: str) -> structlog.BoundLogger:
    """Get a structured logger instance"""
    return structlog.get_logger(name)

