"""Card credit snapshot and explicitly scoped activity of its linked account."""
import re
import unicodedata
from calendar import monthrange
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, HTTPException, Query
from .main import connection

router = APIRouter(prefix='/cards', tags=['Informe de tarjetas'])


def detect_issuer(name: str, account_name: str, choice: str = 'auto') -> str:
    if choice != 'auto': return choice
    patterns = [('bcp',r'\bbcp\b|banco de credito'),('bbva',r'\bbbva\b|continental'),
                ('interbank',r'interbank'),('scotiabank',r'scotiabank|scotia'),
                ('falabella',r'falabella|\bcmr\b'),('ripley',r'ripley')]
    for candidate in (name, account_name):
        text = unicodedata.normalize('NFKD', candidate)
        text = ''.join(c for c in text if not unicodedata.combining(c)).lower()
        for key, pattern in patterns:
            if re.search(pattern, text): return key
    return 'other'


def next_calendar_day(today: date, day: int | None) -> str | None:
    if day is None: return None
    candidate = today.replace(day=min(day,monthrange(today.year,today.month)[1]))
    if candidate < today:
        month=today.month % 12 + 1;year=today.year + (today.month == 12)
        candidate=date(year,month,min(day,monthrange(year,month)[1]))
    return candidate.isoformat()


@router.get('/{card_id}/report')
def card_report(card_id: int, year: int | None = Query(default=None,ge=2000,le=2100),
                month: int | None = Query(default=None,ge=1,le=12)):
    today=datetime.now(ZoneInfo('America/Lima')).date()
    y,mo=year or today.year,month or today.month
    zone=ZoneInfo('America/Lima')
    def boundary(day):return datetime.combine(day,time.min,zone).astimezone(timezone.utc).isoformat()
    start=date(y,mo,1);end=date(y+(mo==12),mo%12+1,1)
    with connection() as db:
        row=db.execute('SELECT * FROM cards WHERE id=?',(card_id,)).fetchone()
        if not row:raise HTTPException(404,'Tarjeta no encontrada')
        card=dict(row);account=dict(db.execute('SELECT * FROM accounts WHERE id=?',(card['account_id'],)).fetchone())
        issuer=detect_issuer(card['name'],account['name'],card['issuer'])
        activity=dict(db.execute('''SELECT
            COALESCE(SUM(CASE WHEN kind='expense' THEN amount_cents ELSE 0 END),0) AS expense_cents,
            COALESCE(SUM(CASE WHEN kind='income' THEN amount_cents ELSE 0 END),0) AS income_cents,
            COALESCE(SUM(CASE WHEN kind='withdrawal' AND account_id=? THEN amount_cents ELSE 0 END),0) AS withdrawal_cents,
            COALESCE(SUM(CASE WHEN kind='withdrawal' AND account_id=? THEN fee_cents ELSE 0 END),0) AS fee_cents,
            SUM(CASE WHEN kind='expense' THEN 1 ELSE 0 END) AS expense_count,COUNT(*) AS movement_count
            FROM movements WHERE (account_id=? OR destination_id=?) AND created_at>=? AND created_at<?''',
            (account['id'],account['id'],account['id'],account['id'],boundary(start),boundary(end))).fetchone())
        activity['expense_count']=activity['expense_count'] or 0
        categories=[dict(r) for r in db.execute('''SELECT COALESCE(NULLIF(trim(category),''),'Sin categoría') AS category,
            SUM(amount_cents) AS amount_cents FROM movements WHERE account_id=? AND kind='expense'
            AND created_at>=? AND created_at<? GROUP BY COALESCE(NULLIF(trim(category),''),'Sin categoría')
            ORDER BY amount_cents DESC''',(account['id'],boundary(start),boundary(end)))]
        monthly=[]
        for m in range(1,13):
            first=date(y,m,1);following=date(y+(m==12),m%12+1,1)
            totals=db.execute('''SELECT COALESCE(SUM(CASE WHEN kind='expense' THEN amount_cents
                WHEN kind='withdrawal' THEN fee_cents ELSE 0 END),0) AS expense_cents,
                COALESCE(SUM(CASE WHEN kind='income' THEN amount_cents ELSE 0 END),0) AS income_cents
                FROM movements WHERE account_id=? AND created_at>=? AND created_at<?''',
                (account['id'],boundary(first),boundary(following))).fetchone()
            monthly.append({'month':m,**dict(totals)})
        recent=[dict(r) for r in db.execute('''SELECT m.*,a.name AS account_name
            FROM movements m JOIN accounts a ON a.id=m.account_id
            WHERE (m.account_id=? OR m.destination_id=?) AND m.created_at>=? AND m.created_at<?
            ORDER BY m.id DESC LIMIT 6''',(account['id'],account['id'],boundary(start),boundary(end)))]
        credit = None
        if card['card_type']=='credit':
            limit,debt=card['credit_limit_cents'],card['debt_cents']
            credit={'limit_cents':limit,'debt_cents':debt,'available_cents':max(0,limit-debt),
                    'used_percent':round(100*debt/limit,1) if limit else None,
                    'next_closing_date':next_calendar_day(today,card['closing_day']),
                    'next_due_date':next_calendar_day(today,card['due_day'])}
        return {'card':card,'issuer':issuer,'account':account,'year':y,'month':mo,
                'credit':credit,'account_activity':activity,'monthly':monthly,'categories':categories,'recent':recent}
