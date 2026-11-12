import os
import ssl
import smtplib
from email.message import EmailMessage
from email.utils import parseaddr
from typing import Dict, Any, Optional, Tuple
import requests

def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()

def _parse_sender(raw: str) -> Tuple[str, str]:
    name, addr = parseaddr(raw or "")
    clean_name = (name or "").strip() or "RinDristi FairLend AI"
    clean_addr = (addr or "").strip()
    return clean_name, clean_addr

def _resolve_sender(provider: Optional[str]) -> Tuple[str, str]:
    raw = (
        _env("EMAIL_FROM")
        or _env("BREVO_SENDER_EMAIL")
        or _env("SMTP_FROM")
        or _env("SMTP_USER")
    )
    if provider == "resend" and not raw:
        raw = "RinDristi FairLend AI <onboarding@resend.dev>"
    if provider == "webhook" and not raw:
        raw = "RinDristi FairLend AI <webhook-relay@rindristi.local>"
    return _parse_sender(raw)

def get_configured_provider() -> Optional[str]:
    override = _env("EMAIL_PROVIDER").lower()
    has_brevo = bool(_env("BREVO_API_KEY"))
    has_webhook = bool(_env("EMAIL_WEBHOOK_URL"))
    has_resend = bool(_env("RESEND_API_KEY"))
    has_smtp = bool(_env("SMTP_HOST") and _env("SMTP_USER") and _env("SMTP_PASSWORD"))

    if override == "brevo" and has_brevo:
        return "brevo"
    if override == "webhook" and has_webhook:
        return "webhook"
    if override == "resend" and has_resend:
        return "resend"
    if override == "smtp" and has_smtp:
        return "smtp"
    if override in ("brevo", "webhook", "resend", "smtp"):
        return None

    if has_brevo:
        return "brevo"
    if has_webhook:
        return "webhook"
    if has_resend:
        return "resend"
    if has_smtp:
        return "smtp"
    return None

def is_dev_preview_enabled() -> bool:
    return _env("OTP_ALLOW_DEV_PREVIEW").lower() in ("1", "true", "yes")

def is_configured() -> bool:
    provider = get_configured_provider()
    if not provider:
        return False
    _, sender_email = _resolve_sender(provider)
    return bool(sender_email)

def is_otp_enforced_for_actions() -> bool:
    explicit = _env("REQUIRE_EMAIL_OTP").lower()
    if explicit in ("0", "false", "no", "off"):
        return False
    if explicit in ("1", "true", "yes", "on"):
        return True
    return is_configured()

def get_email_otp_status() -> Dict[str, Any]:
    provider = get_configured_provider()
    _, sender_email = _resolve_sender(provider)
    configured = bool(provider and sender_email)
    enforced = is_otp_enforced_for_actions()
    return {
        "email_otp_configured": configured,
        "provider": provider,
        "sender_configured": bool(sender_email),
        "dev_preview_enabled": is_dev_preview_enabled(),
        "require_otp_on_signup": enforced,
        "require_otp_on_application": False,
        "require_otp_on_forgot_password": True,
        "require_otp_on_email_change": True
    }

def _build_otp_email(otp_code: str, purpose: str, lang: str = "en") -> Tuple[str, str, str]:
    is_hi = str(lang or "en").strip().lower() == "hi"
    labels_en = {
        "signup": "Account Registration Verification",
        "forgot_password": "Password Reset Verification",
        "email_change": "Email Address Change Verification"
    }
    labels_hi = {
        "signup": "खाता पंजीकरण सत्यापन",
        "forgot_password": "पासवर्ड रीसेट सत्यापन",
        "email_change": "ईमेल पता परिवर्तन सत्यापन"
    }
    clean_purpose = str(purpose or "signup").strip().lower()
    purpose_label = (labels_hi if is_hi else labels_en).get(clean_purpose, labels_en["signup"])

    if is_hi:
        subject = f"{otp_code} आपका रिनदृष्टि फेयरलेंड OTP है ({purpose_label})"
        text_body = (
            f"रिनदृष्टि फेयरलेंड एआई • मिशन भारत\n"
            f"उद्देश्य: {purpose_label}\n\n"
            f"आपका 6-अंकीय सत्यापन OTP: {otp_code}\n\n"
            f"यह कोड 10 मिनट के लिए मान्य है।\n"
            f"सुरक्षा सूचना: यह OTP किसी के साथ साझा न करें। यदि आपने यह अनुरोध नहीं किया है, तो कृपया इस ईमेल को अनदेखा करें।"
        )
        html_heading = "ईमेल सत्यापन वन-टाइम पासवर्ड (OTP)"
        html_intro = f"<strong>{purpose_label}</strong> पूरा करने के लिए नीचे दिया गया 6-अंकीय सुरक्षा कोड दर्ज करें:"
        html_validity = "यह OTP <strong>10 मिनट</strong> में समाप्त हो जाएगा और केवल एक बार उपयोग किया जा सकता है।"
        html_warn = "सुरक्षा चेतावनी: रिनदृष्टि के अधिकारी कभी भी आपसे यह OTP नहीं मांगते। इसे किसी के साथ साझा न करें।"
    else:
        subject = f"{otp_code} is your RinDristi FairLend verification OTP"
        text_body = (
            f"RinDristi FairLend AI • Mission Bharat\n"
            f"Purpose: {purpose_label}\n\n"
            f"Your 6-digit verification code is: {otp_code}\n\n"
            f"This OTP expires in 10 minutes.\n"
            f"Security Notice: Never share this code with anyone. If you did not request this verification, you can safely ignore this email."
        )
        html_heading = "Email Verification One-Time Password"
        html_intro = f"Enter the 6-digit security code below to complete your <strong>{purpose_label}</strong>:"
        html_validity = "This code expires in <strong>10 minutes</strong> and can only be verified once."
        html_warn = "Security Notice: RinDristi FairLend officers will never ask you for this OTP. Do not share it with anyone."

    html_body = (
        '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#F7F3EB;font-family:Segoe UI,Arial,sans-serif;color:#0B2920;">'
        '<div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:2px solid #E6DDCF;border-radius:14px;overflow:hidden;">'
        '<div style="background:#064E3B;padding:20px 24px;border-bottom:4px solid #F8E7C9;color:#FFFFFF;">'
        '<div style="font-size:18px;font-weight:800;letter-spacing:0.2px;">RinDristi FairLend AI</div>'
        '<div style="font-size:12px;color:#F8E7C9;margin-top:2px;">Mission Bharat • RBI Fair Lending Compliant</div>'
        '</div>'
        '<div style="padding:24px;">'
        f'<h2 style="margin:0 0 10px 0;font-size:18px;color:#064E3B;">{html_heading}</h2>'
        f'<p style="margin:0 0 18px 0;font-size:14px;line-height:1.55;color:#334155;">{html_intro}</p>'
        '<div style="background:#FAF3E6;border:2px dashed #064E3B;border-radius:10px;padding:18px;text-align:center;margin:0 0 18px 0;">'
        f'<span style="font-family:Consolas,monospace;font-size:34px;font-weight:900;letter-spacing:8px;color:#064E3B;">{otp_code}</span>'
        '</div>'
        f'<p style="margin:0 0 12px 0;font-size:13px;color:#4B6359;">{html_validity}</p>'
        f'<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 12px;font-size:12px;color:#991B1B;">{html_warn}</div>'
        '</div>'
        '</div>'
        '</body></html>'
    )
    return subject, text_body, html_body

def _send_via_brevo(to_email: str, subject: str, text_body: str, html_body: str, sender_name: str, sender_email: str) -> Tuple[bool, str]:
    api_key = _env("BREVO_API_KEY")
    if not api_key:
        return False, "BREVO_API_KEY is missing."
    if not sender_email:
        return False, "EMAIL_FROM (verified Brevo sender email) is missing."
    try:
        resp = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            json={
                "sender": {"name": sender_name, "email": sender_email},
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html_body,
                "textContent": text_body
            },
            timeout=12
        )
        if 200 <= resp.status_code < 300:
            return True, "sent"
        err_msg = ""
        try:
            err_json = resp.json()
            err_msg = err_json.get("message") or str(err_json)
        except Exception:
            err_msg = resp.text[:240]
        return False, f"Brevo API error ({resp.status_code}): {err_msg}"
    except Exception as exc:
        return False, f"Brevo delivery failed: {str(exc)}"

def _send_via_resend(to_email: str, subject: str, text_body: str, html_body: str, sender_name: str, sender_email: str) -> Tuple[bool, str]:
    api_key = _env("RESEND_API_KEY")
    if not api_key:
        return False, "RESEND_API_KEY is missing."
    from_val = f"{sender_name} <{sender_email}>" if sender_email else "RinDristi FairLend AI <onboarding@resend.dev>"
    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "from": from_val,
                "to": [to_email],
                "subject": subject,
                "html": html_body,
                "text": text_body
            },
            timeout=12
        )
        if 200 <= resp.status_code < 300:
            return True, "sent"
        err_msg = ""
        try:
            err_json = resp.json()
            err_msg = err_json.get("message") or str(err_json)
        except Exception:
            err_msg = resp.text[:240]
        return False, f"Resend API error ({resp.status_code}): {err_msg}"
    except Exception as exc:
        return False, f"Resend delivery failed: {str(exc)}"

def _send_via_smtp(to_email: str, subject: str, text_body: str, html_body: str, sender_name: str, sender_email: str) -> Tuple[bool, str]:
    host = _env("SMTP_HOST")
    user = _env("SMTP_USER")
    password = _env("SMTP_PASSWORD")
    port_raw = _env("SMTP_PORT", "587")
    try:
        port = int(port_raw)
    except ValueError:
        port = 587
    use_ssl = _env("SMTP_USE_SSL").lower() in ("1", "true", "yes") or port == 465

    if not (host and user and password):
        return False, "SMTP configuration incomplete (SMTP_HOST, SMTP_USER, SMTP_PASSWORD required)."

    from_addr = sender_email or user
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{sender_name} <{from_addr}>"
    msg["To"] = to_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()
    try:
        if use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=12, context=context) as server:
                server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=12) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(user, password)
                server.send_message(msg)
        return True, "sent"
    except Exception as exc:
        return False, f"SMTP delivery failed: {str(exc)}"

def _send_via_webhook(to_email: str, subject: str, text_body: str, html_body: str, sender_name: str, sender_email: str) -> Tuple[bool, str]:
    webhook_url = _env("EMAIL_WEBHOOK_URL")
    webhook_secret = _env("EMAIL_WEBHOOK_SECRET")
    if not webhook_url or not (webhook_url.startswith("https://") or webhook_url.startswith("http://")):
        return False, "EMAIL_WEBHOOK_URL must be a valid http(s) URL."
    payload = {
        "to": to_email,
        "subject": subject,
        "textBody": text_body,
        "htmlBody": html_body,
        "senderName": sender_name
    }
    if webhook_secret:
        payload["secret"] = webhook_secret
    try:
        resp = requests.post(
            webhook_url,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            json=payload,
            timeout=15
        )
        text_preview = (resp.text or "").strip()
        if text_preview.lower().startswith("<!doctype") or text_preview.lower().startswith("<html"):
            return False, "Webhook returned HTML instead of JSON. Deploy Google Apps Script as Web App with access set to Anyone."
        if 200 <= resp.status_code < 300:
            try:
                res_json = resp.json()
                if isinstance(res_json, dict):
                    if res_json.get("success") is False or str(res_json.get("status", "")).lower() == "error":
                        return False, str(res_json.get("error") or res_json.get("message") or "Webhook rejected email send.")
            except ValueError:
                pass
            return True, "sent"
        return False, f"Webhook error ({resp.status_code}): {text_preview[:240]}"
    except Exception as exc:
        return False, f"Webhook delivery failed: {str(exc)}"

def send_otp_email(to_email: str, otp_code: str, purpose: str, lang: str = "en") -> Tuple[bool, str]:
    provider = get_configured_provider()
    if not provider:
        return False, "Real Email OTP provider is not configured on the server."

    sender_name, sender_email = _resolve_sender(provider)
    if not sender_email:
        return False, f"Sender email missing for {provider}: please set EMAIL_FROM."

    subject, text_body, html_body = _build_otp_email(otp_code=otp_code, purpose=purpose, lang=lang)
    clean_to = (to_email or "").strip()

    if provider == "brevo":
        return _send_via_brevo(clean_to, subject, text_body, html_body, sender_name, sender_email)
    if provider == "webhook":
        return _send_via_webhook(clean_to, subject, text_body, html_body, sender_name, sender_email)
    if provider == "resend":
        return _send_via_resend(clean_to, subject, text_body, html_body, sender_name, sender_email)
    if provider == "smtp":
        return _send_via_smtp(clean_to, subject, text_body, html_body, sender_name, sender_email)
    return False, f"Unsupported email provider: {provider}"
