import os
import sys
import csv
import math
import random
import json

def train_and_score_model():
    print("=" * 76)
    print("      MERIDIAN FAIRLEND - MACHINE LEARNING TRAINING & INFERENCE ENGINE")
    print("                   Mission Bharat Retail Credit Division")
    print("=" * 76)

    # 1. Resolve Dataset Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    train_paths = [
        r'E:\archive\train_u6lujuX_CVtuZ9i (1).csv',
        os.path.join(base_dir, 'data', 'train.csv'),
        os.path.join(base_dir, 'train.csv'),
        'train.csv'
    ]
    
    clean_paths = [
        os.path.join(base_dir, 'cleaned_loan_data.csv'),
        'cleaned_loan_data.csv'
    ]

    train_csv = None
    for p in train_paths:
        if os.path.exists(p):
            train_csv = p
            break

    cleaned_csv = None
    for p in clean_paths:
        if os.path.exists(p):
            cleaned_csv = p
            break

    if not train_csv:
        print("[ERROR] Training dataset with target 'Loan_Status' not found.")
        return

    print(f"\n[STEP 1/5] Loading Historical Training Dataset: {train_csv}")
    with open(train_csv, 'r', encoding='utf-8') as f:
        train_raw = list(csv.DictReader(f))
    print(f"           Successfully loaded {len(train_raw)} historical loan applications.")

    # 2. Feature Extraction & Engineering
    feature_names = [
        'DTI_Percent',
        'ApplicantIncome',
        'CoapplicantIncome',
        'TotalIncome',
        'LoanAmount',
        'Loan_Amount_Term',
        'Monthly_EMI',
        'Married_Yes',
        'Education_Graduate',
        'Self_Employed_Yes',
        'Dependents_Count',
        'Credit_Bureau_Benchmark'
    ]

    X_train_raw = []
    y_train_list = []

    for r in train_raw:
        try:
            app_inc = float(r.get('ApplicantIncome') or 3000)
            coapp_inc = float(r.get('CoapplicantIncome') or 0)
            tot_inc = max(1.0, app_inc + coapp_inc)
            loan_k = float(r.get('LoanAmount') or 128)
            term = float(r.get('Loan_Amount_Term') or 360)
            emi = (loan_k * 1000.0) / max(1.0, term)
            dti = (emi / tot_inc) * 100.0

            married = 1.0 if str(r.get('Married', 'Yes')).strip().capitalize() == 'Yes' else 0.0
            grad = 1.0 if str(r.get('Education', 'Graduate')).strip().capitalize() == 'Graduate' else 0.0
            self_emp = 1.0 if str(r.get('Self_Employed', 'No')).strip().capitalize() == 'Yes' else 0.0
            deps_str = str(r.get('Dependents', '0')).strip()
            deps_val = 3.0 if '3' in deps_str else (float(deps_str) if deps_str.isdigit() else 0.0)
            
            # Credit history benchmark (1.0 = clean bureau score 750+, 0.0 = subprime 530)
            ch_raw = r.get('Credit_History')
            credit_hist = float(ch_raw) if (ch_raw is not None and str(ch_raw).strip() != '') else 1.0

            y_val = 1.0 if str(r.get('Loan_Status', 'Y')).strip().upper() == 'Y' else 0.0

            features = [
                dti,
                app_inc,
                coapp_inc,
                tot_inc,
                loan_k,
                term,
                emi,
                married,
                grad,
                self_emp,
                deps_val,
                credit_hist
            ]
            X_train_raw.append(features)
            y_train_list.append(y_val)
        except Exception:
            continue

    n_samples = len(X_train_raw)
    n_features = len(feature_names)
    print(f"\n[STEP 2/5] Engineered {n_features} Quantitative Features across {n_samples} valid cases.")
    print("           - Features: " + ", ".join(feature_names[:6]) + "...")

    # Calculate normalization parameters (Mean & Std Dev)
    means = [sum(X_train_raw[i][j] for i in range(n_samples)) / n_samples for j in range(n_features)]
    stds = []
    for j in range(n_features):
        var = sum((X_train_raw[i][j] - means[j]) ** 2 for i in range(n_samples)) / n_samples
        std = math.sqrt(var)
        stds.append(std if std > 1e-6 else 1.0)

    # Normalize training data
    X_norm = [[(X_train_raw[i][j] - means[j]) / stds[j] for j in range(n_features)] for i in range(n_samples)]

    # 3. Model Training: Logistic Regression via Gradient Descent with L2 Regularization
    print("\n[STEP 3/5] Training Mathematical Logistic Regression (L2 Regularized SGD)...")
    random.seed(42)
    indices = list(range(n_samples))
    random.shuffle(indices)
    split_pt = int(0.80 * n_samples)
    train_idx = indices[:split_pt]
    val_idx = indices[split_pt:]

    weights = [0.0] * n_features
    bias = 0.0
    learning_rate = 0.08
    l2_lambda = 0.005
    epochs = 800

    for epoch in range(epochs):
        grad_w = [0.0] * n_features
        grad_b = 0.0
        n_tr = len(train_idx)

        for idx in train_idx:
            xi = X_norm[idx]
            yi = y_train_list[idx]
            z = bias + sum(weights[j] * xi[j] for j in range(n_features))
            z_clamped = max(-500.0, min(500.0, z))
            p = 1.0 / (1.0 + math.exp(-z_clamped))
            err = p - yi

            grad_b += err
            for j in range(n_features):
                grad_w[j] += err * xi[j]

        bias -= learning_rate * (grad_b / n_tr)
        for j in range(n_features):
            weights[j] -= learning_rate * ((grad_w[j] / n_tr) + (l2_lambda * weights[j]))

    # Model Evaluation on Validation Set (20% holdout)
    tp, fp, tn, fn = 0, 0, 0, 0
    for idx in val_idx:
        xi = X_norm[idx]
        yi = y_train_list[idx]
        z = bias + sum(weights[j] * xi[j] for j in range(n_features))
        prob = 1.0 / (1.0 + math.exp(-max(-500.0, min(500.0, z))))
        pred = 1.0 if prob >= 0.50 else 0.0

        if pred == 1.0 and yi == 1.0: tp += 1
        elif pred == 1.0 and yi == 0.0: fp += 1
        elif pred == 0.0 and yi == 0.0: tn += 1
        else: fn += 1

    n_val = len(val_idx)
    acc = ((tp + tn) / n_val) * 100.0
    prec = (tp / (tp + fp)) * 100.0 if (tp + fp) > 0 else 0.0
    rec = (tp / (tp + fn)) * 100.0 if (tp + fn) > 0 else 0.0
    f1 = (2.0 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

    print("-" * 76)
    print("  MODEL VALIDATION METRICS (Hold-out Test Split):")
    print(f"  - Validation Accuracy:       {acc:.2f}%")
    print(f"  - Precision (Positive Tier): {prec:.2f}%")
    print(f"  - Recall (Sensitivity):      {rec:.2f}%")
    print(f"  - F1-Score:                  {f1:.2f}%")
    print(f"  - Confusion Matrix:          TP={tp}, FP={fp}, TN={tn}, FN={fn}")
    print("-" * 76)

    print("\n  LEARNED WEIGHTS & FEATURE IMPACT (Explainability):")
    print(f"  - Baseline Intercept (Bias): {bias:+.4f}")
    sorted_features = sorted(zip(feature_names, weights), key=lambda x: abs(x[1]), reverse=True)
    for name, w in sorted_features:
        effect = "INCREASES APPROVAL" if w > 0 else "INCREASES RISK"
        print(f"    * {name:24s}: {w:+.4f}  [{effect}]")

    # Save Model Weights to JSON
    model_artifact = {
        'model_type': 'L2_Regularized_Logistic_Regression',
        'bias': bias,
        'features': feature_names,
        'weights': weights,
        'means': means,
        'stds': stds,
        'metrics': {
            'accuracy': round(acc, 2),
            'precision': round(prec, 2),
            'recall': round(rec, 2),
            'f1_score': round(f1, 2)
        }
    }
    artifact_path = os.path.join(base_dir, 'meridian_trained_model.json')
    with open(artifact_path, 'w', encoding='utf-8') as f:
        json.dump(model_artifact, f, indent=2)
    print(f"\n[OK] Trained model weights saved to: {artifact_path}")

    # 4. Inference / Prediction on User's Cleaned Data
    if not cleaned_csv:
        print("[WARNING] Cleaned dataset not found for batch scoring.")
        return

    print(f"\n[STEP 4/5] Scoring User's Cleaned Dataset: {cleaned_csv}")
    with open(cleaned_csv, 'r', encoding='utf-8') as f:
        cleaned_records = list(csv.DictReader(f))

    print(f"           Found {len(cleaned_records)} applications to evaluate.")

    scored_rows = []
    status_counts = {'Approved': 0, 'Conditional': 0, 'Rejected': 0}
    tier_counts = {'Tier 1 (Low Risk)': 0, 'Tier 2 (Moderate Risk)': 0, 'Tier 3 (High Risk)': 0}

    for r in cleaned_records:
        lid = r.get('Loan_ID', 'UNKNOWN')
        app_inc = float(r.get('ApplicantIncome') or 3000)
        coapp_inc = float(r.get('CoapplicantIncome') or 0)
        tot_inc = max(1.0, app_inc + coapp_inc)
        loan_k = float(r.get('LoanAmount') or 125)
        term = float(r.get('Loan_Amount_Term') or 360)
        emi = (loan_k * 1000.0) / max(1.0, term)
        dti = (emi / tot_inc) * 100.0

        married = 1.0 if str(r.get('Married', 'Yes')).strip().capitalize() == 'Yes' else 0.0
        grad = 1.0 if str(r.get('Education', 'Graduate')).strip().capitalize() == 'Graduate' else 0.0
        self_emp = 1.0 if str(r.get('Self_Employed', 'No')).strip().capitalize() == 'Yes' else 0.0
        deps_str = str(r.get('Dependents', '0')).strip()
        deps_val = 3.0 if '3' in deps_str else (float(deps_str) if deps_str.isdigit() else 0.0)

        # Intake credit benchmark default
        credit_hist = 1.0

        raw_feat = [
            dti, app_inc, coapp_inc, tot_inc, loan_k, term, emi,
            married, grad, self_emp, deps_val, credit_hist
        ]

        # Normalize using learned scalers
        norm_feat = [(raw_feat[j] - means[j]) / stds[j] for j in range(n_features)]

        # Linear model logit & probability
        z = bias + sum(weights[j] * norm_feat[j] for j in range(n_features))
        prob = 1.0 / (1.0 + math.exp(-max(-500.0, min(500.0, z))))
        score_pct = int(round(prob * 100.0))

        # Status & Risk Tier
        if score_pct >= 65:
            decision = 'Approved'
            tier = 'Tier 1 (Low Risk)'
        elif score_pct >= 45:
            decision = 'Conditional'
            tier = 'Tier 2 (Moderate Risk)'
        else:
            decision = 'Rejected'
            tier = 'Tier 3 (High Risk)'

        status_counts[decision] += 1
        tier_counts[tier] += 1

        # Attribution / Explainability
        contributions = []
        for j in range(n_features):
            impact = weights[j] * norm_feat[j]
            contributions.append((feature_names[j], impact))

        contributions.sort(key=lambda x: x[1], reverse=True)
        top_driver = contributions[0][0] if contributions[0][1] > 0 else "Baseline Approval Rate"
        top_friction = contributions[-1][0] if contributions[-1][1] < 0 else "None"

        scored_rows.append({
            'Loan_ID': lid,
            'Gender': r.get('Gender', 'Male'),
            'Married': r.get('Married', 'Yes'),
            'Dependents': r.get('Dependents', '0'),
            'Education': r.get('Education', 'Graduate'),
            'Self_Employed': r.get('Self_Employed', 'No'),
            'ApplicantIncome': int(app_inc),
            'CoapplicantIncome': int(coapp_inc),
            'Total_Monthly_Income': int(tot_inc),
            'LoanAmount_Thousands': int(loan_k),
            'LoanAmount_INR': int(loan_k * 1000),
            'Loan_Amount_Term_Months': int(term),
            'Monthly_EMI_INR': round(emi, 2),
            'DTI_Percent': round(dti, 2),
            'Approval_Likelihood_Pct': score_pct,
            'Predicted_Status': decision,
            'Risk_Tier': tier,
            'Primary_Approval_Driver': top_driver,
            'Primary_Risk_Factor': top_friction
        })

    # 5. Export Scored Predictions CSV
    output_csv = os.path.join(base_dir, 'scored_loan_predictions_367.csv')
    print(f"\n[STEP 5/5] Exporting Scored Predictions to: {output_csv}")
    
    fieldnames = list(scored_rows[0].keys())
    with open(output_csv, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(scored_rows)

    print("=" * 76)
    print("                      BATCH PREDICTION SUMMARY")
    print("=" * 76)
    print(f"  Total Applications Evaluated: {len(scored_rows)}")
    print(f"  - Approved:    {status_counts['Approved']:3d} ({status_counts['Approved']/len(scored_rows)*100:.1f}%)")
    print(f"  - Conditional: {status_counts['Conditional']:3d} ({status_counts['Conditional']/len(scored_rows)*100:.1f}%)")
    print(f"  - Rejected:    {status_counts['Rejected']:3d} ({status_counts['Rejected']/len(scored_rows)*100:.1f}%)")
    print("-" * 76)
    print("  Risk Tier Distribution:")
    for tier, cnt in tier_counts.items():
        print(f"  - {tier:24s}: {cnt:3d} ({cnt/len(scored_rows)*100:.1f}%)")
    print("-" * 76)
    print(f"[SUCCESS] Complete inference file ready at: {output_csv}")
    print("=" * 76)

    # Show first 5 scored cases
    print("\nSAMPLE SCORED APPLICANTS (Top 5):")
    print(f"{'Loan ID':<10} {'Income':<8} {'Loan (k)':<9} {'EMI':<8} {'DTI %':<7} {'Prob %':<7} {'Decision':<12} {'Risk Tier'}")
    print("-" * 76)
    for row in scored_rows[:5]:
        print(f"{row['Loan_ID']:<10} {row['Total_Monthly_Income']:<8} {row['LoanAmount_Thousands']:<9} {row['Monthly_EMI_INR']:<8.1f} {row['DTI_Percent']:<7.1f} {row['Approval_Likelihood_Pct']:<7} {row['Predicted_Status']:<12} {row['Risk_Tier']}")

if __name__ == '__main__':
    train_and_score_model()
