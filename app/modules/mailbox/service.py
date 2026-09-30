import re
import ssl
import email
import logging
import imaplib
from email.header import decode_header
import html
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.config import settings
from app.modules.mailbox.models import MailAccount, MailMessage

logger = logging.getLogger("my_secretary.mailbox.service")


KNOWN_IMAP_PROVIDERS = {
    "gmail.com": ("imap.gmail.com", 993, True),
    "googlemail.com": ("imap.gmail.com", 993, True),
    "ukr.net": ("imap.ukr.net", 993, True),
    "yahoo.com": ("imap.mail.yahoo.com", 993, True),
    "outlook.com": ("outlook.office365.com", 993, True),
    "hotmail.com": ("outlook.office365.com", 993, True),
    "live.com": ("outlook.office365.com", 993, True),
    "icloud.com": ("imap.mail.me.com", 993, True),
    "me.com": ("imap.mail.me.com", 993, True),
    "meta.ua": ("imap.meta.ua", 993, True),
    "i.ua": ("imap.i.ua", 993, True),
    "email.ua": ("imap.i.ua", 993, True),
}


def resolve_imap_settings(email_addr: str, custom_server: Optional[str] = None, custom_port: Optional[int] = None) -> Tuple[str, int, bool]:
    """Автоматично визначає IMAP-сервер та порт за доменом адреси."""
    if custom_server and custom_server.strip():
        return custom_server.strip(), custom_port or 993, True

    clean_email = email_addr.strip().lower()
    if "@" in clean_email:
        domain = clean_email.split("@", 1)[1]
        if domain in KNOWN_IMAP_PROVIDERS:
            return KNOWN_IMAP_PROVIDERS[domain]
        return f"imap.{domain}", 993, True

    return "imap.gmail.com", 993, True


def decode_mime(raw_header: Optional[str]) -> str:
    """Декодує MIME-заголовки листів з будь-яких кодувань (UTF-8, Windows-1251, Base64)."""
    if not raw_header:
        return ""
    try:
        decoded_parts = decode_header(raw_header)
        text_parts = []
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                enc = encoding or "utf-8"
                try:
                    text_parts.append(part.decode(enc, errors="replace"))
                except Exception:
                    text_parts.append(part.decode("utf-8", errors="replace"))
            else:
                text_parts.append(str(part))
        return " ".join(text_parts).strip()
    except Exception as e:
        logger.debug(f"decode_mime fallback for {raw_header}: {e}")
        return str(raw_header)


def clean_html_to_text(html_content: str) -> str:
    """Очищає HTML-розмітку та повертає чистий текст без зовнішніх бібліотек."""
    if not html_content:
        return ""
    # Remove script and style elements
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html_content, flags=re.DOTALL | re.IGNORECASE)
    # Replace breaks and paragraphs with spaces
    text = re.sub(r"<(br|p|div|tr)[^>]*>", " ", text, flags=re.IGNORECASE)
    # Strip all remaining tags
    text = re.sub(r"<[^>]+>", " ", text)
    # Decode HTML entities like &nbsp;, &quot;
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def extract_body_snippet(msg: email.message.Message, max_len: int = 300) -> str:
    """Витягує короткий текстовий зміст листа, очищаючи HTML-теги."""
    body_text = ""
    try:
        if msg.is_multipart():
            for part in msg.walk():
                ctype = part.get_content_type()
                cdispo = str(part.get("Content-Disposition", ""))
                if "attachment" in cdispo:
                    continue
                if ctype == "text/plain":
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        body_text = payload.decode(charset, errors="replace")
                        break
                elif ctype == "text/html" and not body_text:
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        raw_html = payload.decode(charset, errors="replace")
                        body_text = clean_html_to_text(raw_html)
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                raw = payload.decode(charset, errors="replace")
                if msg.get_content_type() == "text/html":
                    body_text = clean_html_to_text(raw)
                else:
                    body_text = raw
    except Exception as e:
        logger.debug(f"Error extracting body snippet: {e}")

    # Clean whitespace and strip
    cleaned = re.sub(r"\s+", " ", body_text).strip()
    return cleaned[:max_len]


def test_imap_connection(email_addr: str, password: str, server: str, port: int, use_ssl: bool = True) -> Dict[str, Any]:
    """Перевіряє коректність логіну та пароля до поштового сервера."""
    try:
        if use_ssl:
            client = imaplib.IMAP4_SSL(server, port, timeout=10)
        else:
            client = imaplib.IMAP4(server, port, timeout=10)

        typ, res = client.login(email_addr.strip(), password.strip())
        client.logout()
        return {"success": True, "message": "Підключення до пошти успішне!"}
    except imaplib.IMAP4.error as e:
        err_msg = str(e)
        if "Application-specific password" in err_msg or "password" in err_msg.lower() or "authenticationfailed" in err_msg.lower():
            if "gmail" in server.lower():
                err_msg = "Gmail вимагає 'Пароль додатка' (App Password). Створіть його в налаштуваннях Google: Безпека ➔ Двоетапна перевірка ➔ Паролі додатків."
            elif "ukr.net" in server.lower():
                err_msg = "Ukr.net вимагає увімкнення IMAP та створення 'Пароля для зовнішніх програм' в налаштуваннях пошти Ukr.net."
        return {"success": False, "message": f"Помилка авторизації: {err_msg}"}
    except Exception as e:
        return {"success": False, "message": f"Не вдалося з'єднатися із сервером {server}:{port}: {str(e)}"}


def classify_email(subject: str, sender: str, snippet: str, raw_headers: Dict[str, str]) -> Tuple[str, bool, Optional[str]]:
    """
    Класифікує лист на:
    - spam: рекламні розсилки, промо, казино, холодні пропозиції
    - important: рахунки, чеки, клієнти, офіційні служби, підтвердження
    - other: звичайні інформаційні листи
    Повертає (category, is_spam, spam_reason)
    """
    full_text = f"{subject} {sender} {snippet}".lower()

    # 1. Ознаки важливих листів (мають найвищий пріоритет)
    important_keywords = [
        "рахунок", "чек", "оплата", "сплата", "договір", "акт виконаних",
        "нова пошта", "укрпошта", "monobank", "приватбанк", "privat24", "ощадбанк",
        "квитанція", "замовлення №", "заказ №", "податкова", "клієнт", "оренда",
        "код підтвердження", "код безпеки", "відновлення паролю", "бронь", "квиток"
    ]
    for kw in important_keywords:
        if kw in full_text:
            return "important", False, None

    # 2. Ознаки сміття та спаму
    # А. Наявність заголовка List-Unsubscribe або прецеденту bulk
    has_unsubscribe = "list-unsubscribe" in raw_headers or "відписатися" in full_text or "unsubscribe" in full_text or "отписаться" in full_text
    
    spam_signals = [
        ("казино", "Азартні ігри / Казино"),
        ("casino", "Азартні ігри / Казино"),
        ("free spins", "Азартні ігри / Казино"),
        ("фриспины", "Азартні ігри / Казино"),
        ("слоти", "Азартні ігри / Казино"),
        ("вигравай", "Азартні ігри / Лотерея"),
        ("ставки на спорт", "Букмекери / Ставки"),
        ("знижки до", "Маркетингова розсилка"),
        ("скидки до", "Маркетингова розсилка"),
        ("знижка -", "Маркетингова розсилка"),
        ("акція діє", "Рекламна акція"),
        ("чорна п'ятниця", "Рекламна акція"),
        ("розпродаж", "Рекламна розсилка"),
        ("кредит онлайн", "Фінансовий спам"),
        ("швидка позика", "Фінансовий спам"),
        ("деньги до зарплаты", "Фінансовий спам"),
        ("заработок в интернете", "Спам про заробіток"),
        ("криптовалюта", "Фінансовий спам"),
        ("newsletter", "Маркетинговий дайджест"),
        ("дайджест", "Новинний дайджест"),
        ("спеціальна пропозиція", "Рекламна пропозиція"),
        ("специальное предложение", "Рекламна пропозиція"),
        ("promo", "Промо-розсилка"),
        ("aliexpress", "Промо маркетплейсу"),
        ("temu", "Промо маркетплейсу"),
        ("вебинар", "Реклама вебінару"),
        ("купите со скидкой", "Маркетингова розсилка"),
    ]

    for trigger, reason in spam_signals:
        if trigger in full_text:
            return "spam", True, reason

    if has_unsubscribe:
        # Лист із посиланням на відписку зазвичай є рекламною або автоматичною розсилкою
        return "spam", True, "Автоматична розсилка (з посиланням на відписку)"

    # Відправники-боти
    if any(bot in sender.lower() for bot in ["noreply", "no-reply", "marketing", "mailer", "newsletter", "promo"]):
        return "spam", True, "Автоматичний робот-відправник"

    return "other", False, None


def fetch_account_emails(account: MailAccount, limit: int = 30) -> List[Dict[str, Any]]:
    """Підключається до поштової скриньки за IMAP та зчитує останні листи."""
    results = []
    client = None
    try:
        if account.use_ssl:
            client = imaplib.IMAP4_SSL(account.imap_server, account.imap_port, timeout=12)
        else:
            client = imaplib.IMAP4(account.imap_server, account.imap_port, timeout=12)

        client.login(account.email, account.password)
        typ, data = client.select("INBOX", readonly=True)
        if typ != "OK":
            logger.warning(f"Could not select INBOX for {account.email}: {data}")
            return []

        # Get latest UIDs
        typ, search_data = client.uid("search", None, "ALL")
        if typ != "OK" or not search_data or not search_data[0]:
            return []

        uids = search_data[0].split()
        latest_uids = uids[-limit:]  # get last N messages
        latest_uids.reverse()  # newest first

        for uid_bytes in latest_uids:
            uid_str = uid_bytes.decode()
            typ, msg_data = client.uid("fetch", uid_bytes, "(RFC822.HEADER BODY.PEEK[TEXT])")
            if typ != "OK" or not msg_data or not msg_data[0]:
                continue

            raw_header = msg_data[0][1] if isinstance(msg_data[0], tuple) else b""
            parsed_msg = email.message_from_bytes(raw_header)

            subject = decode_mime(parsed_msg.get("Subject", "(Без теми)"))
            sender = decode_mime(parsed_msg.get("From", ""))
            recipient = decode_mime(parsed_msg.get("To", account.email))
            date_str = parsed_msg.get("Date")

            msg_date = None
            if date_str:
                try:
                    msg_date = email.utils.parsedate_to_datetime(date_str)
                    if msg_date.tzinfo:
                        msg_date = msg_date.astimezone(timezone.utc).replace(tzinfo=None)
                except Exception:
                    msg_date = datetime.utcnow()
            else:
                msg_date = datetime.utcnow()

            # Extract sender clean email
            sender_email_match = re.search(r"<([^>]+)>", sender)
            clean_sender_email = sender_email_match.group(1).lower() if sender_email_match else sender.strip().lower()

            raw_headers_dict = {k.lower(): v for k, v in parsed_msg.items()}
            snippet = extract_body_snippet(parsed_msg, max_len=250)

            category, is_spam, spam_reason = classify_email(subject, sender, snippet, raw_headers_dict)

            results.append({
                "message_uid": uid_str,
                "subject": subject,
                "sender": sender,
                "sender_email": clean_sender_email,
                "recipient": recipient,
                "date": msg_date,
                "snippet": snippet,
                "category": category,
                "is_spam": is_spam,
                "spam_reason": spam_reason,
            })

    except Exception as e:
        logger.error(f"Error fetching emails for {account.email}: {e}")
    finally:
        if client:
            try:
                client.close()
                client.logout()
            except Exception:
                pass

    return results


def delete_emails_imap(account: MailAccount, uids: List[str]) -> int:
    """Видаляє листи за IMAP UID (переміщує в Кошик або маркує \\Deleted + EXPUNGE)."""
    if not uids:
        return 0

    client = None
    deleted_count = 0
    try:
        if account.use_ssl:
            client = imaplib.IMAP4_SSL(account.imap_server, account.imap_port, timeout=15)
        else:
            client = imaplib.IMAP4(account.imap_server, account.imap_port, timeout=15)

        client.login(account.email, account.password)
        typ, _ = client.select("INBOX", readonly=False)
        if typ != "OK":
            return 0

        # Discover trash folder if exists
        trash_folder = None
        try:
            typ, folders = client.list()
            if typ == "OK" and folders:
                for f in folders:
                    line = f.decode("utf-8", errors="replace")
                    if any(t in line.lower() for t in ["\\trash", "кошик", "trash", "deleted"]):
                        # Extract folder name in quotes or end of line
                        parts = line.split(' "/" ')
                        if len(parts) > 1:
                            trash_folder = parts[1].strip().strip('"')
                        else:
                            trash_folder = line.split()[-1].strip().strip('"')
                        break
        except Exception as e:
            logger.debug(f"Could not discover trash folder: {e}")

        # Batch in chunks of 50 UIDs
        chunk_size = 50
        for i in range(0, len(uids), chunk_size):
            chunk = uids[i:i + chunk_size]
            uid_set = ",".join(chunk)

            moved = False
            if trash_folder:
                try:
                    move_typ, _ = client.uid("MOVE", uid_set, trash_folder)
                    if move_typ == "OK":
                        moved = True
                        deleted_count += len(chunk)
                except Exception:
                    moved = False

            if not moved:
                # Fallback to \Deleted flag + EXPUNGE
                client.uid("STORE", uid_set, "+FLAGS", "(\\Deleted)")
                deleted_count += len(chunk)

        try:
            client.expunge()
        except Exception:
            pass

    except Exception as e:
        logger.error(f"Error deleting emails on {account.email}: {e}")
    finally:
        if client:
            try:
                client.close()
                client.logout()
            except Exception:
                pass

    return deleted_count


def generate_mail_digest(accounts_count: int, total_new: int, spam_count: int, important_count: int, important_subjects: List[str]) -> str:
    """Генерує стислий голосовий звіт про стан пошти."""
    if accounts_count == 0:
        return "Немає підключених поштових скриньок. Додайте пошту в налаштуваннях."

    parts = [f"Перевірено поштові скриньки (всього: {accounts_count})."]
    if total_new == 0:
        parts.append("Нових листів не знайдено, у скриньках чисто.")
        return " ".join(parts)

    parts.append(f"Знайдено {total_new} листів.")
    if spam_count > 0:
        parts.append(f"Виявлено {spam_count} рекламного сміття та спаму (готовий видалити в 1 клік).")
    
    if important_count > 0:
        parts.append(f"Важливих листів: {important_count}.")
        if important_subjects:
            top_subjects = ", ".join([f"«{s[:35]}»" for s in important_subjects[:3]])
            parts.append(f"Серед них: {top_subjects}.")
    else:
        parts.append("Важливих повідомлень немає.")

    return " ".join(parts)
