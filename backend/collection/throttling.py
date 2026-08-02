"""Rate limiting for the transport portal login endpoint.

Throttles fail open: if the cache backend is unreachable the request is allowed
through rather than erroring, so a Redis blip cannot take down login.
"""

import logging

from rest_framework.throttling import SimpleRateThrottle

logger = logging.getLogger(__name__)


class _ResilientThrottle(SimpleRateThrottle):
    def allow_request(self, request, view):
        try:
            return super().allow_request(request, view)
        except Exception:
            logger.exception('Throttle backend unavailable; allowing request')
            return True


class LoginIPThrottle(_ResilientThrottle):
    """Caps login attempts from a single source address."""
    scope = 'login_ip'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': self.get_ident(request),
        }


class LoginEmailThrottle(_ResilientThrottle):
    """Caps attempts against a single account, regardless of source address."""
    scope = 'login_email'

    def get_cache_key(self, request, view):
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': email}


class PasswordResetIPThrottle(_ResilientThrottle):
    scope = 'password_reset_ip'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': self.get_ident(request),
        }


class PasswordResetEmailThrottle(_ResilientThrottle):
    scope = 'password_reset_email'

    def get_cache_key(self, request, view):
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': email}
