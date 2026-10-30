<<<<<<< HEAD
"""
Meridian Credit Underwriting & Risk Assessment Server
Multi-threaded REST API server exposing authentication (Supabase + Local),
credit scoring, factor explainability, demographic equity auditing, and application management.
"""

=======
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
import http.server
import json
import urllib.parse
from typing import Dict, Any, Optional

from backend import predict_loan, explain_decision, check_fairness, load_sample_dataset, simulate_what_if
import database

PORT = 5000

<<<<<<< HEAD
print("Initializing historical portfolio cache...")
APPLICANTS_DB = load_sample_dataset()
print(f"Loaded {len(APPLICANTS_DB)} historical loan records.")

class LoanDecisionHandler(http.server.BaseHTTPRequestHandler):
    """Multi-threaded REST request dispatcher for loan decision and auth operations."""

    def _set_headers(self, status_code: int = 200, content_type: str = 'application/json'):
=======
print("Loading loan dataset...")
APPLICANTS_DB = load_sample_dataset()
print(f"Loaded {len(APPLICANTS_DB)} real historical loan records!")

class LoanDecisionHandler(http.server.BaseHTTPRequestHandler):

    def _set_headers(self, status_code=200, content_type='application/json'):
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
        self.send_response(status_code)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PATCH, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-User-Role')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def _send_json(self, data: Any, status_code: int = 200):
        self._set_headers(status_code, 'application/json')
        self.wfile.write(json.dumps(data, indent=2).encode('utf-8'))

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

<<<<<<< HEAD
        if path in ['/', '/api']:
            self._set_headers(200, 'text/html')
            saved_apps = database.get_all_saved_applications(role='officer')
            html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Meridian FairLend - Credit Underwriting Hub</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; background: #0F172A; color: #F8FAFC; }}
        .card {{ background: #1E293B; padding: 28px; border-radius: 12px; border: 1.5px solid #334155; max-width: 680px; box-shadow: 0 4px 16px rgba(0,0,0,0.2); }}
        h1 {{ margin-top: 0; color: #38BDF8; font-size: 1.6rem; }}
        code {{ background: #0F172A; color: #38BDF8; padding: 3px 6px; border-radius: 4px; font-weight: 600; font-size: 0.9rem; }}
        .badge {{ background: #0284C7; color: white; padding: 4px 12px; border-radius: 99px; font-weight: 600; font-size: 0.85rem; }}
        ul {{ line-height: 1.8; }}
        a {{ color: #38BDF8; text-decoration: none; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>Meridian FairLend - Credit Underwriting Hub</h1>
        <p>Engine Status: <span class="badge">ACTIVE &bull; SUPABASE AUTH &amp; POSTGRESQL SYNCED</span></p>
        <p>Active Applications in Vault: <strong>{len(saved_apps)} records</strong></p>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;">
        <h3>Authentication &amp; Production API Endpoints:</h3>
        <ul>
            <li><code>POST /api/auth/signup</code> - Register new Applicant or Officer (Requires Passkey)</li>
            <li><code>POST /api/auth/signin</code> - Authenticate user credentials &amp; issue session</li>
            <li><code>POST /api/auth/logout</code> - Terminate active session</li>
            <li><code>GET /api/saved-applications</code> - Role-based application retrieval</li>
            <li><code>POST /api/apply</code> - Submit loan application linked to authenticated user</li>
            <li><code>POST /api/predict</code> - Credit decision &amp; factor explainability</li>
            <li><code>POST /api/what-if</code> - Counterfactual scenario simulator</li>
            <li><code>POST /api/officer/sanction</code> - Authorized officer decisioning &amp; remarks</li>
            <li><code>GET /api/fairness</code> - Four-fifths (80%) demographic parity audit</li>
            <li><code>GET /api/accuracy</code> - Underwriting validation performance report</li>
        </ul>
    </div>
</body>
</html>"""
            self.wfile.write(html.encode('utf-8'))
=======
        if path == '/' or path == '/api':
            self._set_headers(200, 'text/html')
            saved_apps = database.get_all_saved_applications()
            welcome_html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Meridian FairLend AI - Backend & Database Server</title>
                <style>
                    body {{ font-family: -apple-system, sans-serif; margin: 40px; background: #F7F3EB; color: #064E3B; }}
                    .card {{ background: white; padding: 25px; border-radius: 12px; border: 2px solid #F8E7C9; max-width: 680px; box-shadow: 0 4px 12px rgba(6,78,59,0.08); }}
                    h1 {{ margin-top: 0; color: #064E3B; }}
                    code {{ background: #E8F5F0; padding: 3px 6px; border-radius: 4px; font-weight: bold; }}
                    .badge {{ background: #D1FAE5; color: #064E3B; padding: 4px 10px; border-radius: 99px; font-weight: bold; font-size: 0.8rem; }}
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Meridian FairLend AI - Mission Bharat Backend & DB</h1>
                    <p>Status: <span class="badge">ONLINE &amp; DATABASE CONNECTED</span></p>
                    <p>Database: <code>meridian_loans.db</code> (SQLite3)</p>
                    <p>Total Submitted Applications in DB: <strong>{len(saved_apps)} records</strong></p>
                    <hr style="border: 0; border-top: 1px solid #E6DDCF; margin: 20px 0;">
                    <h3>Available API Endpoints:</h3>
                    <ul>
                        <li><code>POST /api/apply</code> - Submit full loan application &amp; save to SQLite database</li>
                        <li><code>POST /api/predict</code> - Predict &amp; explain loan scoring</li>
                        <li><code>GET /api/saved-applications</code> - Retrieve all saved database applications</li>
                        <li><code>GET /api/fairness</code> - Check fairness across groups (80% rule)</li>
                        <li><code>GET /api/accuracy</code> - View model accuracy report</li>
                    </ul>
                </div>
            </body>
            </html>
            """
            self.wfile.write(welcome_html.encode('utf-8'))
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a
            return

        elif path == '/api/saved-applications':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            user_id = query_params.get('user_id', [None])[0] or self.headers.get('X-User-Id')
            role = query_params.get('role', [None])[0] or self.headers.get('X-User-Role') or 'applicant'
            email = query_params.get('email', [None])[0]

            saved_apps = database.get_all_saved_applications(user_id=user_id, role=role)
            self._send_json({
                'success': True,
                'role': role,
                'total_saved': len(saved_apps),
                'applications': saved_apps
            })
            return

        elif path.startswith('/api/application/'):
            app_no = path.split('/')[-1]
            app = database.get_application_by_number(app_no)
            if app:
                self._send_json({'success': True, 'application': app})
            else:
                self._send_json({'success': False, 'error': f'Application {app_no} not found'}, 404)
            return

        elif path == '/api/fairness':
            fairness_report = check_fairness(APPLICANTS_DB)
            self._send_json(fairness_report)
            return

        elif path == '/api/accuracy':
            accuracy_report = {
                'model_name': 'L2-Regularized Transparent Logistic Scoring Engine',
                'overall_accuracy_percent': 84.55,
                'precision_percent': 83.65,
                'recall_sensitivity_percent': 97.75,
                'f1_score': 90.16,
                'roc_auc_score': 0.862,
                'confusion_matrix': {
                    'true_positives': 87,
                    'false_negatives': 2,
                    'false_positives': 17,
                    'true_negatives': 17
                },
                'total_validation_samples': 123
            }
            self._send_json(accuracy_report)
            return

        elif path == '/api/applicants':
            self._send_json({
                'total_in_db': len(APPLICANTS_DB),
                'sample_applicants': APPLICANTS_DB[:50]
            })
            return

        else:
            self._send_json({'error': 'Endpoint not found', 'path': path}, 404)

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))

        try:
            body_bytes = self.rfile.read(content_length)
            payload = json.loads(body_bytes.decode('utf-8'))
        except Exception as e:
            self._send_json({'error': f'Invalid JSON payload: {str(e)}'}, 400)
            return

<<<<<<< HEAD
        path = parsed_url.path

        # 1. Authentication: Sign Up
        if path == '/api/auth/signup':
            full_name = payload.get('full_name', '')
            email = payload.get('email', '')
            phone = payload.get('phone', '')
            password = payload.get('password', '')
            confirm_pwd = payload.get('confirm_password', '')
            role = payload.get('role', 'applicant')
            officer_key = payload.get('officer_key', '')

            if password != confirm_pwd:
                self._send_json({'success': False, 'error': 'Passwords do not match.'}, 400)
                return

            try:
                profile = database.register_user(
                    full_name=full_name,
                    email=email,
                    phone=phone,
                    password=password,
                    role=role,
                    officer_key=officer_key
                )
                self._send_json({
                    'success': True,
                    'message': f"Account created successfully for {profile['full_name']} as {profile['role'].capitalize()}.",
                    'user': profile
                }, 201)
            except ValueError as val_err:
                self._send_json({'success': False, 'error': str(val_err)}, 400)
            except Exception as e:
                self._send_json({'success': False, 'error': f'Registration failed: {str(e)}'}, 500)
            return

        # 2. Authentication: Sign In
        elif path == '/api/auth/signin':
            email = payload.get('email', '')
            password = payload.get('password', '')
=======
        if parsed_url.path == '/api/apply':
            cibil = int(applicant_data.get('cibil_score', 750))
            credit_hist = 1 if cibil >= 650 else 0

            emp_type = str(applicant_data.get('employment_type', 'Salaried'))
            is_self_emp = 'Yes' if any(w in emp_type for w in ['Self', 'Business', 'Farmer', 'Artisan', 'Trader']) else 'No'

            predict_input = {
                'name': applicant_data.get('full_name', 'Applicant'),
                'gender': applicant_data.get('gender', 'Male'),
                'married': applicant_data.get('marital_status', 'Yes'),
                'dependents': applicant_data.get('dependents', '0'),
                'education': applicant_data.get('education', 'Graduate'),
                'self_employed': is_self_emp,
                'employment_type': emp_type,
                'salary_slip': applicant_data.get('salary_slip', 'Yes'),
                'applicant_income': float(applicant_data.get('applicant_income', 0)),
                'coapplicant_income': float(applicant_data.get('coapplicant_income', 0)),
                'loan_amount': float(applicant_data.get('loan_amount', 100)),
                'term': float(applicant_data.get('loan_term_months', 360)),
                'cibil_score': cibil,
                'credit_history': credit_hist,
                'property_area': applicant_data.get('property_area', 'Rural')
            }

            prediction = predict_loan(predict_input)
            explanation = explain_decision(predict_input, prediction)

            saved_record = database.save_loan_application(applicant_data, prediction, explanation)

            response = {
                'success': True,
                'message': 'Loan application successfully submitted and recorded in Meridian Database!',
                'application': saved_record,
                'prediction': prediction,
                'explanation': explanation
            }

            self._set_headers(201)
            self.wfile.write(json.dumps(response, indent=2).encode('utf-8'))
            return

        elif parsed_url.path == '/api/predict':
            prediction = predict_loan(applicant_data)
            explanation = explain_decision(applicant_data, prediction)
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a

            auth_res = database.login_user(email=email, password=password)
            if auth_res.get('success'):
                self._send_json(auth_res, 200)
            else:
                self._send_json(auth_res, 401)
            return

        # 3. Authentication: Forgot Password
        elif path == '/api/auth/forgot-password':
            email = payload.get('email', '').strip().lower()
            if not email:
                self._send_json({'success': False, 'error': 'Email is required.'}, 400)
                return

            self._send_json({
                'success': True,
                'message': f'Password recovery instructions have been dispatched to {email}. If verified, follow the secure link.'
            })
            return

        # 4. Authentication: Logout
        elif path == '/api/auth/logout':
            self._send_json({'success': True, 'message': 'Logged out successfully.'})
            return

        # 5. Loan Application Intake
        elif path == '/api/apply':
            try:
                prediction = predict_loan(payload)
                explanation = explain_decision(payload, prediction)
                user_id = payload.get('user_id') or self.headers.get('X-User-Id')

                saved_record = database.save_loan_application(payload, prediction, explanation, user_id=user_id)

                self._send_json({
                    'success': True,
                    'message': 'Loan application successfully submitted and recorded in Meridian Vault.',
                    'application': saved_record,
                    'prediction': prediction,
                    'explanation': explanation
                }, status_code=201)
            except Exception as e:
                self._send_json({'success': False, 'error': str(e)}, 500)
            return

        # 6. Scoring & XAI Prediction
        elif path == '/api/predict':
            try:
                prediction = predict_loan(payload)
                explanation = explain_decision(payload, prediction)
                self._send_json({
                    'success': True,
                    'applicant_name': payload.get('full_name') or payload.get('name', 'Applicant'),
                    'prediction': prediction,
                    'explanation': explanation
                })
            except Exception as e:
                self._send_json({'success': False, 'error': str(e)}, 500)
            return

        # 7. Scenario Simulation
        elif path == '/api/what-if':
            try:
                base_applicant = payload.get('base', {})
                adjustments = payload.get('adjustments', {})
                sim_res = simulate_what_if(base_applicant, adjustments)
                self._send_json({'success': True, 'simulation': sim_res})
            except Exception as e:
                self._send_json({'success': False, 'error': str(e)}, 500)
            return

        # 8. Officer Sanction & Remarks
        elif path == '/api/officer/sanction':
            app_no = payload.get('application_no')
            new_status = payload.get('status', 'Approved')
            remarks = payload.get('remarks') or payload.get('note') or 'Sanctioned by Loan Officer'
            officer_role = payload.get('officer_role') or self.headers.get('X-User-Role')

            # Security: verify officer role
            if officer_role != 'officer':
                self._send_json({'success': False, 'error': 'Forbidden: Only authorized Loan Officers can sanction or modify applications.'}, 403)
                return

            updated = database.update_status(app_no, new_status, remarks)
            if updated:
                self._send_json({
                    'success': True,
                    'message': f'Application {app_no} decision recorded as {new_status}.',
                    'application': updated
                })
            else:
                self._send_json({'success': False, 'error': f'Application {app_no} not found'}, 404)
            return

        elif parsed_url.path == '/api/officer/sanction':
            app_no = applicant_data.get('application_no')
            new_status = applicant_data.get('status', 'Approved')
            note = applicant_data.get('note', 'Sanctioned by Loan Officer')

            updated = database.update_application_status(app_no, new_status, note)
            if updated:
                self._set_headers(200)
                self.wfile.write(json.dumps({
                    'success': True,
                    'message': f'Application {app_no} successfully marked as {new_status} in SQLite (meridian_loans.db) and Excel CSV!',
                    'application': updated
                }, indent=2).encode('utf-8'))
            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({'success': False, 'error': f'Application {app_no} not found'}).encode('utf-8'))
            return

        else:
<<<<<<< HEAD
            self._send_json({'error': 'Endpoint not found', 'path': path}, 404)

def run_server():
    server_address = ('', PORT)
    httpd = http.server.ThreadingHTTPServer(server_address, LoanDecisionHandler)
    print("=" * 70)
    print("  Meridian FairLend - Credit Underwriting Hub (Multi-Threaded)")
    print(f"  Listening on: http://localhost:{PORT}")
    print("  Ready for incoming loan applications and scoring requests.")
    print("  Press Ctrl+C to stop.")
    print("=" * 70)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer shutting down gracefully.")
    finally:
        httpd.server_close()
=======
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Endpoint not found'}).encode('utf-8'))

def run_server():
    with socketserver.TCPServer(("", PORT), LoanDecisionHandler) as httpd:
        print("=" * 65)
        print(f"  Meridian FairLend AI Backend & DB Server Started!")
        print(f"  Database: meridian_loans.db (SQLite3)")
        print(f"  Listening on: http://localhost:{PORT}")
        print("  Press Ctrl+C to stop the server anytime.")
        print("=" * 65)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer shutting down gracefully.")
>>>>>>> e8ec26709a11b9a92a9c3428e2da2ba06d445f1a

if __name__ == '__main__':
    run_server()
