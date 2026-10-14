from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException


def financial_timestamp(day: date | None = None) -> str:
    now=datetime.now(ZoneInfo('America/Lima'))
    if day and day > now.date(): raise HTTPException(400,'La fecha no puede ser futura. Para un próximo pago usa Pagos.')
    if day and day != now.date(): now=datetime.combine(day,time(12),ZoneInfo('America/Lima'))
    return now.astimezone(timezone.utc).isoformat()
