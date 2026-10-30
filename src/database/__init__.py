"""
Meridian Database & Persistence Layer
Unified Supabase PostgreSQL & SQLite Data Management
"""

from .database_operations import (
    save_application,
    get_all_applications,
    get_application_by_number,
    update_application_status,
    sync_csv_export,
    get_sqlite_conn,
    init_db,
    DB_FILE,
    EXPORT_CSV
)
from .supabase_client import get_supabase_client, SupabaseRestClient

__all__ = [
    'save_application',
    'get_all_applications',
    'get_application_by_number',
    'update_application_status',
    'sync_csv_export',
    'get_sqlite_conn',
    'init_db',
    'DB_FILE',
    'EXPORT_CSV',
    'get_supabase_client',
    'SupabaseRestClient'
]
