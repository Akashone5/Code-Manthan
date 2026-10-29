"""
=============================================================================
MERIDIAN - MISSION BHARAT
Simple HTTP Backend Server (Port 5000)
Connected to SQLite3 Database (meridian_loans.db)
=============================================================================

This server handles:
1. Loan evaluation & AI prediction (POST /api/predict)
2. Complete Loan Application submission into Database (POST /api/apply)
3. Viewing all saved database loan records (GET /api/saved-applications)
4. Fairness & accuracy compliance audits (GET /api/fairness, GET /api/accuracy)

Zero complex frameworks used - pure standard library!
=============================================================================
"""

import http.server
import socketserver
import json
import urllib.parse
from backend import predict_loan, explain_decision, check_fairness, load_sample_dataset
import database

PORT = 5000

# Pre-load sample applicants into memory once at startup
print("Loading loan dataset...")
APPLICANTS_DB = load_sample_dataset()
print(f"Loaded {len(APPLICANTS_DB)} real historical loan records!")


class LoanDecisionHandler(http.server.BaseHTTPRequestHandler):
    """
    A simple web request handler.
    Answers requests from the browser or frontend.
    """

    def _set_headers(self, status_code=200, content_type='application/json'):
        """Helper to send standard HTTP headers with CORS support."""
        self.send_response(status_code)
        self.send_header('Content-Type', content_type)
        # Enable CORS so any frontend can connect to this backend
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        """Allows browsers to make pre-flight CORS checks."""
        self._set_headers(200)

    def do_GET(self):
        """Handles GET requests (when someone asks for data)."""
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # 1. Home / Status Page
        if path == '/' or path == '/api':
            self._set_headers(200, 'text/html')
            saved_apps = database.get_all_saved_applications()
            welcome_html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Meridian Backend & Database Server</title>
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
                    <h1>Meridian Mission Bharat Backend & DB</h1>
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
            return

        # 2. Retrieve All Saved Applications from SQLite Database
        elif path == '/api/saved-applications':
            saved_apps = database.get_all_saved_applications()
            self._set_headers(200)
            self.wfile.write(json.dumps({
                'success': True,
                'total_saved': len(saved_apps),
                'applications': saved_apps
            }, indent=2).encode('utf-8'))
            return

        # 3. Retrieve Single Application by Number
        elif path.startswith('/api/application/'):
            app_no = path.split('/')[-1]
            app = database.get_application_by_number(app_no)
            if app:
                self._set_headers(200)
                self.wfile.write(json.dumps({'success': True, 'application': app}, indent=2).encode('utf-8'))
            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({'success': False, 'error': 'Application not found'}, indent=2).encode('utf-8'))
            return

        # 4. Fairness Audit Route
        elif path == '/api/fairness':
            fairness_report = check_fairness(APPLICANTS_DB)
            self._set_headers(200)
            self.wfile.write(json.dumps(fairness_report, indent=2).encode('utf-8'))
            return

        # 5. Model Accuracy Report Route
        elif path == '/api/accuracy':
            accuracy_report = {
                'model_name': 'L2-Regularized Transparent Logistic Model',
                'overall_accuracy_percent': 79.97,
                'precision_percent': 80.20,
                'recall_sensitivity_percent': 94.08,
                'roc_auc_score': 0.784,
                'confusion_matrix': {
                    'true_positives': 397,
                    'false_negatives': 25,
                    'false_positives': 98,
                    'true_negatives': 94
                },
                'total_test_samples': len(APPLICANTS_DB)
            }
            self._set_headers(200)
            self.wfile.write(json.dumps(accuracy_report, indent=2).encode('utf-8'))
            return

        # 6. List Historical CSV Applicants Route
        elif path == '/api/applicants':
            self._set_headers(200)
            self.wfile.write(json.dumps({
                'total_in_db': len(APPLICANTS_DB),
                'sample_applicants': APPLICANTS_DB[:50]
            }, indent=2).encode('utf-8'))
            return

        # If route not found
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Endpoint not found'}).encode('utf-8'))

    def do_POST(self):
        """Handles POST requests (submitting loan forms and predictions)."""
        parsed_url = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        post_body = self.rfile.read(content_length)

        try:
            applicant_data = json.loads(post_body.decode('utf-8'))
        except Exception:
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': 'Invalid JSON data'}).encode('utf-8'))
            return

        # ROUTE 1: Full Loan Application Fillup (Saves to Database!)
        if parsed_url.path == '/api/apply':
            # 1. Translate CIBIL score into credit history indicator
            cibil = int(applicant_data.get('cibil_score', 750))
            credit_hist = 1 if cibil >= 650 else 0

            # 2. Prepare prediction features
            emp_type = str(applicant_data.get('employment_type', 'Salaried'))
            is_self_emp = 'Yes' if any(w in emp_type for w in ['Self', 'Business', 'Farmer', 'Artisan', 'Trader']) else 'No'

            predict_input = {
                'name': applicant_data.get('full_name', 'Applicant'),
                'gender': applicant_data.get('gender', 'Male'),
                'married': applicant_data.get('marital_status', 'Yes'),
                'dependents': applicant_data.get('dependents', '0'),
                'education': applicant_data.get('education', 'Graduate'),
                'self_employed': is_self_emp,
                'applicant_income': float(applicant_data.get('applicant_income', 0)),
                'coapplicant_income': float(applicant_data.get('coapplicant_income', 0)),
                'loan_amount': float(applicant_data.get('loan_amount', 100)),
                'term': float(applicant_data.get('loan_term_months', 360)),
                'credit_history': credit_hist,
                'property_area': applicant_data.get('property_area', 'Rural')
            }

            # 3. Calculate AI Decision & Plain-English Explanations
            prediction = predict_loan(predict_input)
            explanation = explain_decision(predict_input, prediction)

            # 4. Save into SQLite Database (meridian_loans.db)
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

        # ROUTE 2: Quick Score Prediction
        elif parsed_url.path == '/api/predict':
            prediction = predict_loan(applicant_data)
            explanation = explain_decision(applicant_data, prediction)

            response = {
                'success': True,
                'applicant_name': applicant_data.get('name', 'Applicant'),
                'prediction': prediction,
                'explanation': explanation
            }

            self._set_headers(200)
            self.wfile.write(json.dumps(response, indent=2).encode('utf-8'))
            return

        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Endpoint not found'}).encode('utf-8'))


def run_server():
    """Starts the simple HTTP server."""
    with socketserver.TCPServer(("", PORT), LoanDecisionHandler) as httpd:
        print("=" * 65)
        print(f"  Meridian Mission Bharat Backend & DB Server Started!")
        print(f"  Database: meridian_loans.db (SQLite3)")
        print(f"  Listening on: http://localhost:{PORT}")
        print("  Press Ctrl+C to stop the server anytime.")
        print("=" * 65)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer shutting down gracefully.")


if __name__ == '__main__':
    run_server()
