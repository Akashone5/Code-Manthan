# Meridian FairLend AI - Mission Bharat
## Cloud Database Infrastructure & PostgreSQL Migration (Supabase)

An Explainable AI (XAI) and Algorithmic Fairness Credit Underwriting platform built in compliance with the **Reserve Bank of India (RBI) Regulatory Framework for Digital Lending**.

---

### Environment & Python Runtime
- **Runtime**: **Python 3.11 (3.11.9)** (Configured in User PATH, `.python-version`, `runtime.txt`, and `pyproject.toml`)
- **Python Binary**: `C:\Users\Akash Kumar\AppData\Local\Programs\Python\Python311\python.exe`
- **IDE Settings**: Configured in `.vscode/settings.json` for automatic interpreter selection.

---

### Project Architecture & Directory Structure

```text
E:\English/
├── .env                                  # Local Supabase credentials & configuration (Protected)
├── .env.example                          # Configuration template for deployment
├── .gitignore                            # Git credential & cache protection
├── supabase_migration.sql                # Complete PostgreSQL DDL & Row Level Security (RLS) script
├── requirements.txt                      # Project Python dependencies
│
├── src/
│   ├── preprocess.py                     # Demographic & financial feature normalization pipeline
│   ├── train.py                          # L2-Regularized Logistic Regression underwriting model
│   ├── explain.py                        # SHAP-style additive factor attribution & roadmap generator
│   ├── fairness.py                       # 80% Disparate Impact Ratio (DIR) demographic equity auditor
│   └── database/
│       ├── supabase_client.py            # Resilient Supabase REST & Auth client
│       ├── database_operations.py        # Unified multi-tenant CRUD layer (Supabase + SQLite fallback)
│       └── migration.py                  # Zero-loss SQLite to Supabase data migration wizard
│
├── app.py                                # Full-featured Streamlit Web Application
├── server.py                             # Python REST API Server (Port 5000)
├── backend.py                            # Underwriting & fairness computation engine
├── database.py                           # Backward-compatible database adapter
├── test_backend.py                       # Automated system test suite
├── view_db.py                            # Terminal database inspector & CSV exporter
├── meridian_loans.db                     # Original SQLite database (100% preserved)
├── meridian_loan_applications_export.csv # Real-time CSV audit mirror
├── index.html                            # Frontend Web Application (HTML5 / Modern CSS)
├── app.js                                # Frontend Controller & Offline State Manager
└── styles.css                            # Modern Forest Green & Champagne Cream Fintech Theme
```

---

### Quick Setup & Supabase Migration Guide

#### Step 1: Execute PostgreSQL Schema in Supabase
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard/project/cendbmmcqxkjjblhvrzx).
2. Click **SQL Editor** in the left sidebar.
3. Click **New query**, paste the entire contents of [`supabase_migration.sql`](supabase_migration.sql), and click **Run**.
4. This creates:
   - The `public.loan_applications` table.
   - Column indexes on `application_no`, `user_id`, `status`, and `created_at`.
   - **Row Level Security (RLS)** policies ensuring authenticated users only see their own loan records.

#### Step 2: Migrate SQLite Records to Supabase
Run the migration script to copy all existing SQLite records into Supabase PostgreSQL without modifying your original SQLite database:
```powershell
python src/database/migration.py
```

#### Step 3: Run the Streamlit Application
```powershell
streamlit run app.py
```

#### Step 4: Run the Full-Stack Web Application (Optional)
If running the lightweight REST server with the HTML/JS frontend:
```powershell
python server.py
# Open index.html in any modern web browser
```

---

### Security & Row Level Security (RLS) Policies

1. **User Tenancy Isolation:** Each loan application in Supabase contains a `user_id UUID REFERENCES auth.users(id)`.
2. **Row Level Security Enabled:**
   - **`SELECT`:** Authenticated users can only read applications matching their own `auth.uid()`, while anonymous baseline cases (`user_id IS NULL`) remain visible for auditing.
   - **`INSERT`:** Authenticated users can only insert records linked to their own `auth.uid()`.
   - **`UPDATE`:** Only owners or authorized credit officers can update loan records.
3. **Zero Secrets in Frontend:** The application only uses the public `anon` key on the client side; administrative keys are never bundled.
