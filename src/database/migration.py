import os
import sys
import json
import sqlite3

current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from src.database.supabase_client import get_supabase_client

DB_FILE = os.path.join(project_root, 'meridian_loans.db')

def run_migration():
    print("=" * 80)
    print("  MERIDIAN FAIRLEND - SQLITE TO SUPABASE MIGRATION WIZARD")
    print("=" * 80)

    if not os.path.exists(DB_FILE):
        print(f"[ERROR] SQLite database file not found at: {DB_FILE}")
        return False

    sb = get_supabase_client()
    if not sb.is_configured():
        print("[ERROR] Supabase credentials missing from .env file!")
        print("Please check SUPABASE_URL and SUPABASE_ANON_KEY.")
        return False

    print(f"\n[1/4] Checking Supabase Project Connection...")
    print(f"      Target URL: {sb.url}")
    connected, msg = sb.test_connection()
    if not connected:
        print(f"[ERROR] {msg}")
        print("\nACTION REQUIRED:")
        print("1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/cendbmmcqxkjjblhvrzx")
        print("2. Click 'SQL Editor' in the left navigation.")
        print("3. Paste and run the contents of 'supabase_migration.sql'.")
        print("4. Re-run this migration script.")
        return False

    print("      [OK] Connected successfully to Supabase PostgreSQL.")

    print("\n[2/4] Reading records from original SQLite database...")
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM loan_applications ORDER BY id ASC")
    sqlite_rows = cursor.fetchall()
    sqlite_count = len(sqlite_rows)
    conn.close()

    print(f"      [OK] Read {sqlite_count} loan application records from SQLite.")

    if sqlite_count == 0:
        print("[WARN] SQLite table is empty. Nothing to migrate.")
        return True

    print("\n[3/4] Migrating records to Supabase PostgreSQL...")
    migrated_success = 0
    migrated_skipped = 0

    for idx, r in enumerate(sqlite_rows, 1):
        app_no = r['application_no']
        
        pos_list = []
        neg_list = []
        rec_list = []
        try:
            pos_list = json.loads(r['positive_factors_json'] or '[]')
        except Exception:
            pass
        try:
            neg_list = json.loads(r['risk_factors_json'] or '[]')
        except Exception:
            pass
        try:
            rec_list = json.loads(r['recommendations_json'] or '[]')
        except Exception:
            pass

        payload = {
            'application_no': app_no,
            'created_at': r['created_at'],
            'full_name': r['full_name'] or 'Applicant',
            'phone': r['phone'] or '',
            'gender': r['gender'] or 'Male',
            'marital_status': r['marital_status'] or 'Yes',
            'dependents': str(r['dependents'] or '0'),
            'education': r['education'] or 'Graduate',
            'employment_type': r['employment_type'] or 'Salaried',
            'salary_slip': str(r['salary_slip'] or 'Yes'),
            'applicant_income': float(r['applicant_income'] or 0),
            'coapplicant_income': float(r['coapplicant_income'] or 0),
            'loan_amount': float(r['loan_amount'] or 100),
            'loan_term_months': int(r['loan_term_months'] or 60),
            'cibil_score': int(r['cibil_score'] or 750),
            'credit_history': int(r['credit_history'] or 1),
            'property_area': r['property_area'] or 'Rural',
            'loan_purpose': r['loan_purpose'] or 'Home Improvement',
            'approval_likelihood': int(r['approval_likelihood'] or 50),
            'status': r['status'] or 'Approved',
            'monthly_emi': float(r['monthly_emi'] or 0),
            'dti_percent': float(r['dti_percent'] or 0),
            'explanation_summary': r['explanation_summary'] or '',
            'positive_factors_json': pos_list,
            'risk_factors_json': neg_list,
            'recommendations_json': rec_list,
            'officer_notes': r['officer_notes'] or ''
        }

        existing = sb.select('loan_applications', f"application_no=eq.{app_no}&select=application_no")
        if existing and len(existing) > 0:
            migrated_skipped += 1
            print(f"      - [{idx}/{sqlite_count}] {app_no}: Already exists in Supabase (Skipped).")
            continue

        res = sb.insert('loan_applications', payload)
        if res and isinstance(res, list) and len(res) > 0:
            migrated_success += 1
            print(f"      + [{idx}/{sqlite_count}] {app_no}: Successfully migrated to Supabase.")
        else:
            print(f"      ! [{idx}/{sqlite_count}] {app_no}: Insert warning, checking presence...")
            check = sb.select('loan_applications', f"application_no=eq.{app_no}&select=application_no")
            if check and len(check) > 0:
                migrated_success += 1
                print(f"      [OK] [{idx}/{sqlite_count}] {app_no}: Verified in Supabase.")
            else:
                print(f"      [FAIL] [{idx}/{sqlite_count}] {app_no}: Failed to insert.")

    print("\n[4/4] Verifying Data Integrity...")
    sb_records = sb.select('loan_applications', 'select=application_no')
    sb_total = len(sb_records)

    print("-" * 80)
    print(f"  MIGRATION SUMMARY & INTEGRITY CHECK:")
    print(f"  • Original SQLite records in meridian_loans.db: {sqlite_count}")
    print(f"  • Newly migrated records:                      {migrated_success}")
    print(f"  • Previously migrated (deduplicated):          {migrated_skipped}")
    print(f"  • Total verified records in Supabase Cloud:    {sb_total}")
    print(f"  • Original SQLite Database status:             UNTOUCHED & PRESERVED")
    print("-" * 80)

    if sb_total >= sqlite_count:
        print("[SUCCESS] All records successfully migrated to Supabase PostgreSQL!")
        return True
    else:
        print(f"[WARN] Expected at least {sqlite_count} records, found {sb_total}. Please check individual logs.")
        return False

if __name__ == '__main__':
    run_migration()
