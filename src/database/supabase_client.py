"""
Supabase PostgreSQL & Authentication REST Client
High-performance HTTP client utilizing requests session connection pooling with curl fallback.
Manages Row Level Security (RLS) tenant authentication tokens and PostgreSQL CRUD operations.
"""

import os
import json
import subprocess
from typing import Dict, Any, Tuple, Optional

try:
    import requests
    _REQUESTS_AVAILABLE = True
except ImportError:
    _REQUESTS_AVAILABLE = False

def _load_environment():
    env_paths = [
        os.path.join(os.path.dirname(__file__), '..', '..', '.env'),
        os.path.join(os.getcwd(), '.env'),
        '.env'
    ]
    for p in env_paths:
        if os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            k, v = line.split('=', 1)
                            k = k.strip()
                            v = v.strip().strip('"').strip("'")
                            if k not in os.environ:
                                os.environ[k] = v
            except Exception:
                pass

_load_environment()

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_ANON_KEY', '') or os.environ.get('SUPABASE_KEY', '')
SUPABASE_SERVICE_ROLE = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

class SupabaseRestClient:
    """
    HTTP REST client for Supabase PostgREST API and GoTrue Auth Service.
    Uses connection pooling via requests.Session() and provides graceful fallback to curl.exe.
    """

    def __init__(self, url: Optional[str] = None, key: Optional[str] = None):
        self.url = (url or SUPABASE_URL).rstrip('/')
        self.key = key or SUPABASE_KEY
        self.service_key = SUPABASE_SERVICE_ROLE
        self.active_token = self.key

        if _REQUESTS_AVAILABLE:
            self.session = requests.Session()
        else:
            self.session = None

    def set_auth_token(self, token: str):
        """Sets the active JWT token for RLS tenant isolation."""
        self.active_token = token or self.key

    def _get_headers(self, custom_headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {
            'apikey': self.key,
            'Authorization': f'Bearer {self.active_token}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
        if custom_headers:
            headers.update(custom_headers)
        return headers

    def _execute_request(self, endpoint: str, method: str = 'GET', headers: Optional[Dict[str, str]] = None, data: Any = None) -> Dict[str, Any]:
        full_url = f"{self.url}{endpoint}" if not endpoint.startswith('http') else endpoint
        req_headers = self._get_headers(headers)

        # 1. Try requests.Session
        if self.session is not None:
            try:
                response = self.session.request(
                    method=method.upper(),
                    url=full_url,
                    headers=req_headers,
                    json=data if data is not None else None,
                    timeout=15
                )
                status = response.status_code
                try:
                    res_json = response.json()
                except Exception:
                    res_json = response.text

                if 200 <= status < 300:
                    return {'success': True, 'data': res_json, 'status_code': status}
                else:
                    return {'success': False, 'error': res_json, 'status_code': status}
            except Exception as req_err:
                pass  # Fall back to curl

        # 2. Resilient fallback to curl.exe
        cmd = ['curl.exe', '-s', '--connect-timeout', '8', '--max-time', '15', '-X', method.upper(), full_url]
        for k, v in req_headers.items():
            cmd.extend(['-H', f'{k}: {v}'])
        if data is not None:
            cmd.extend(['-d', json.dumps(data)])

        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            stdout = res.stdout.strip()
            if not stdout:
                return {'success': False, 'error': res.stderr or 'Empty response from Supabase'}
            try:
                parsed = json.loads(stdout)
                return {'success': True, 'data': parsed}
            except Exception:
                return {'success': False, 'raw': stdout, 'error': 'Non-JSON response'}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def is_configured(self) -> bool:
        return bool(self.url and self.key)

    def test_connection(self) -> Tuple[bool, str]:
        if not self.is_configured():
            return False, "SUPABASE_URL or SUPABASE_ANON_KEY is missing from .env"
        res = self._execute_request('/rest/v1/loan_applications?select=application_no&limit=1', method='GET')
        if res.get('success'):
            data = res.get('data')
            if isinstance(data, list):
                return True, "Successfully connected to Supabase PostgreSQL and found 'loan_applications' table."
            if isinstance(data, dict):
                code = data.get('code', '')
                msg = data.get('message', '')
                if code == 'PGRST205' or 'schema cache' in msg:
                    return False, "Connected to Supabase project, but 'loan_applications' table is not yet created. Please run supabase_migration.sql in Supabase SQL Editor."
                return False, f"Supabase error ({code}): {msg}"
        err = str(res.get('error', 'Connection failed'))
        raw = str(res.get('raw', ''))
        if 'schema cache' in raw or 'PGRST205' in raw or 'schema cache' in err:
            return False, "Connected to Supabase project, but 'loan_applications' table is not yet created. Please run supabase_migration.sql in Supabase SQL Editor."
        return False, err

    def select(self, table: str = 'loan_applications', query_params: str = 'select=*&order=id.desc') -> Dict[str, Any]:
        return self._execute_request(f"/rest/v1/{table}?{query_params}", method='GET')

    def insert(self, table: str, record: Dict[str, Any]) -> Dict[str, Any]:
        return self._execute_request(f"/rest/v1/{table}", method='POST', data=record)

    def update(self, table: str, record: Dict[str, Any], match_col: str, match_val: Any) -> Dict[str, Any]:
        return self._execute_request(f"/rest/v1/{table}?{match_col}=eq.{match_val}", method='PATCH', data=record)

    def delete(self, table: str, match_col: str, match_val: Any) -> Dict[str, Any]:
        return self._execute_request(f"/rest/v1/{table}?{match_col}=eq.{match_val}", method='DELETE')

    # Authentication Services (GoTrue)
    def auth_sign_up(self, email: str, password: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = {'email': email, 'password': password}
        if metadata:
            payload['data'] = metadata
        return self._execute_request('/auth/v1/signup', method='POST', data=payload)

    def auth_sign_in(self, email: str, password: str) -> Dict[str, Any]:
        payload = {'email': email, 'password': password}
        res = self._execute_request('/auth/v1/token?grant_type=password', method='POST', data=payload)
        if res.get('success'):
            data = res.get('data', {})
            token = data.get('access_token')
            if token:
                self.set_auth_token(token)
        return res

    def auth_reset_password(self, email: str) -> Dict[str, Any]:
        return self._execute_request('/auth/v1/recover', method='POST', data={'email': email})

_CLIENT_INSTANCE: Optional[SupabaseRestClient] = None

def get_supabase_client() -> SupabaseRestClient:
    global _CLIENT_INSTANCE
    if _CLIENT_INSTANCE is None:
        _CLIENT_INSTANCE = SupabaseRestClient()
    return _CLIENT_INSTANCE
