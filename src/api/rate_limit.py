import time
import threading
from collections import defaultdict, deque
from typing import Tuple
from fastapi import Request

class SlidingWindowRateLimiter:
    def __init__(self, max_attempts: int = 8, window_seconds: int = 300):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._failures = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: Tuple[str, str], now: float):
        dq = self._failures[key]
        cutoff = now - self.window_seconds
        while dq and dq[0] < cutoff:
            dq.popleft()
        if not dq:
            self._failures.pop(key, None)

    def is_blocked(self, client_ip: str, scope: str) -> Tuple[bool, int]:
        now = time.time()
        key = (client_ip or "unknown", scope)
        with self._lock:
            self._prune(key, now)
            dq = self._failures.get(key)
            if dq and len(dq) >= self.max_attempts:
                retry_after = max(1, int(self.window_seconds - (now - dq[0])))
                return True, retry_after
            return False, 0

    def record_failure(self, client_ip: str, scope: str):
        now = time.time()
        key = (client_ip or "unknown", scope)
        with self._lock:
            self._prune(key, now)
            self._failures[key].append(now)

    def reset(self, client_ip: str, scope: str):
        key = (client_ip or "unknown", scope)
        with self._lock:
            self._failures.pop(key, None)

def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        first_ip = forwarded_for.split(",")[0].strip()
        if first_ip:
            return first_ip
    if request.client and request.client.host:
        return request.client.host
    return "unknown"

auth_rate_limiter = SlidingWindowRateLimiter(max_attempts=8, window_seconds=300)
