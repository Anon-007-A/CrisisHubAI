"""
Structured logging and monitoring utilities for CrisisHub.
Provides request tracking, error categorization, and Sentry-like fallback.
"""

import logging
import json
import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from contextvars import ContextVar

# Store request ID in context for thread-safe access
request_id_var: ContextVar[str] = ContextVar('request_id', default='')


class StructuredLogger:
    """Structured JSON logging for cloud compatibility (CloudLogging, etc.)"""
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.INFO)
    
    def _format_log(self, level: str, message: str, **kwargs) -> Dict[str, Any]:
        """Format log entry as structured JSON"""
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'level': level,
            'message': message,
            'request_id': request_id_var.get(),
            'service': 'aegis-crisisub',
            **kwargs
        }
    
    def info(self, message: str, **kwargs):
        """Log info level"""
        log_entry = self._format_log('INFO', message, **kwargs)
        self.logger.info(json.dumps(log_entry))
    
    def error(self, message: str, error: Optional[Exception] = None, **kwargs):
        """Log error level with optional exception details"""
        error_info = {}
        if error:
            error_info = {
                'error_type': type(error).__name__,
                'error_message': str(error),
                'error_traceback': kwargs.get('exc_info') is True
            }
        log_entry = self._format_log('ERROR', message, **error_info, **kwargs)
        self.logger.error(json.dumps(log_entry), exc_info=kwargs.get('exc_info', False))
    
    def warning(self, message: str, **kwargs):
        """Log warning level"""
        log_entry = self._format_log('WARNING', message, **kwargs)
        self.logger.warning(json.dumps(log_entry))


class CircuitBreaker:
    """Simple circuit breaker for Gemini API calls"""
    
    def __init__(self, failure_threshold: int = 5, timeout_seconds: int = 60):
        """
        Initialize circuit breaker.
        
        Args:
            failure_threshold: Number of failures before breaking circuit
            timeout_seconds: Seconds to wait before attempting reset
        """
        self.failure_threshold = failure_threshold
        self.timeout_seconds = timeout_seconds
        self.failure_count = 0
        self.last_failure_time = None
        self.state = 'closed'  # closed, open, half-open
    
    def record_success(self):
        """Record successful call"""
        self.failure_count = 0
        self.state = 'closed'
    
    def record_failure(self):
        """Record failed call"""
        self.failure_count += 1
        self.last_failure_time = datetime.utcnow()
        
        if self.failure_count >= self.failure_threshold:
            self.state = 'open'
    
    def is_available(self) -> bool:
        """Check if circuit is available for requests"""
        if self.state == 'closed':
            return True
        
        if self.state == 'open':
            # Check if timeout has passed
            if self.last_failure_time:
                elapsed = (datetime.utcnow() - self.last_failure_time).total_seconds()
                if elapsed > self.timeout_seconds:
                    self.state = 'half-open'
                    return True
            return False
        
        return True  # half-open state


class RequestLogger:
    """Context manager for logging API requests"""
    
    def __init__(self, endpoint: str, method: str = 'POST'):
        self.endpoint = endpoint
        self.method = method
        self.request_id = str(uuid.uuid4())[:8]
        self.logger = StructuredLogger('crisisub')
    
    def __enter__(self):
        request_id_var.set(self.request_id)
        self.logger.info(
            f'Request started',
            endpoint=self.endpoint,
            method=self.method,
            request_id=self.request_id
        )
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.logger.error(
                f'Request failed',
                endpoint=self.endpoint,
                error=exc_val,
                exc_info=True
            )
        else:
            self.logger.info(
                f'Request completed',
                endpoint=self.endpoint
            )
        request_id_var.set('')


def get_structured_logger(name: str) -> StructuredLogger:
    """Factory function for creating structured loggers"""
    return StructuredLogger(name)
