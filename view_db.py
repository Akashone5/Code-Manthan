"""
Meridian Database Viewer & Audit Exporter
Interactive terminal utility to inspect loan records and synchronize the Excel/CSV audit mirror.
"""

import os
from src.database.database_operations import get_all_applications, sync_csv_export, EXPORT_CSV

def view_and_export():
    rows = get_all_applications()

    print("=" * 105)
    print("  MERIDIAN FAIRLEND - MISSION BHARAT")
    print("  CENTRAL LOAN APPLICATION DATABASE & REGISTRY")
    print("=" * 105)
    print(f"Total Applications in Vault: {len(rows)}\n")

    header = f"{'App No':<14} | {'Applicant Name':<18} | {'CIBIL':<6} | {'Pay Slip':<8} | {'Amount':<11} | {'Tenure':<8} | {'Score':<6} | {'Status':<11}"
    print(header)
    print("-" * len(header))

    for r in rows:
        app_no = r.get('application_no') or ''
        name = (r.get('full_name') or 'Applicant')[:18]
        cibil = str(r.get('cibil_score') or '')
        slip = str(r.get('salary_slip') or 'Yes')
        loan_k = float(r.get('loan_amount') or 0)
        amt = f"Rs.{int(loan_k * 1000):,}" if loan_k <= 1000 else f"Rs.{int(loan_k):,}"
        months = int(r.get('loan_term_months') or 60)
        tenure = f"{months // 12} yrs" if months % 12 == 0 else f"{months} mos"
        score = f"{r.get('approval_likelihood')}%"
        status = r.get('status') or ''
        print(f"{app_no:<14} | {name:<18} | {cibil:<6} | {slip:<8} | {amt:<11} | {tenure:<8} | {score:<6} | {status:<11}")

    sync_csv_export()
    print("-" * len(header))
    print(f"\n[OK] Excel/CSV File Updated: {EXPORT_CSV}")
    print("Direct Access: Open 'meridian_loan_applications_export.csv' in Microsoft Excel or Google Sheets.")

if __name__ == '__main__':
    view_and_export()
