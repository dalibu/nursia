import asyncio
import smtplib
import ssl
from email.message import EmailMessage

from config.settings import settings


class EmailConfigurationError(Exception):
    pass


class EmailDeliveryError(Exception):
    pass


def _send_smtp_email(recipient: str, subject: str, body: str) -> None:
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        raise EmailConfigurationError("SMTP_HOST and SMTP_FROM_EMAIL must be configured")

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    try:
        if settings.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(
                settings.SMTP_HOST,
                settings.SMTP_PORT,
                timeout=15,
                context=ssl.create_default_context(),
            ) as server:
                _authenticate(server)
                server.send_message(message)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
                if settings.SMTP_STARTTLS:
                    server.starttls(context=ssl.create_default_context())
                _authenticate(server)
                server.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        raise EmailDeliveryError("SMTP delivery failed") from error


def _authenticate(server: smtplib.SMTP) -> None:
    if settings.SMTP_USERNAME:
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)


async def send_email(recipient: str, subject: str, body: str) -> None:
    await asyncio.to_thread(_send_smtp_email, recipient, subject, body)
