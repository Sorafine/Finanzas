"""Account transfers and rolling reports used by the compact dashboard."""
from datetime import date, datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from .main import connection
from .finance_dates import financial_timestamp

router=APIRouter(tags=['Transferencias e informes'])


class TransferIn(BaseModel):
    model_config=ConfigDict(extra='forbid')
    account_id:int
    destination_id:int
    amount_cents:int=Field(gt=0)
    fee_cents:int=Field(default=0,ge=0)
    concept:str=Field(default='Transferencia entre cuentas',min_length=1,max_length=150)
    occurred_on:date|None=None
    request_id:str=Field(min_length=16,max_length=100,pattern=r'^[a-zA-Z0-9_-]+$')


@router.post('/transfers',status_code=201)
def transfer(item:TransferIn):
    stamp=financial_timestamp(item.occurred_on)
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        existing=db.execute('''SELECT m.* FROM account_transfers t JOIN movements m ON m.id=t.movement_id
                               WHERE t.request_id=?''',(item.request_id,)).fetchone()
        if existing:
            if any(existing[key]!=getattr(item,key) for key in ('account_id','destination_id','amount_cents','fee_cents')):
                raise HTTPException(409,'Esta transferencia ya se registró con otros datos. Revisa el historial antes de volver a guardarla.')
            return {'id':existing['id'],'already_transferred':True}
        if item.account_id==item.destination_id:raise HTTPException(400,'Elige dos cuentas diferentes')
        source=db.execute('SELECT * FROM accounts WHERE id=?',(item.account_id,)).fetchone()
        target=db.execute('SELECT * FROM accounts WHERE id=?',(item.destination_id,)).fetchone()
        if not source or not target:raise HTTPException(404,'Cuenta no encontrada')
        debit=item.amount_cents+item.fee_cents
        if source['balance_cents']<debit:raise HTTPException(400,'Saldo insuficiente en la cuenta de origen')
        db.execute('UPDATE accounts SET balance_cents=balance_cents-? WHERE id=?',(debit,item.account_id))
        db.execute('UPDATE accounts SET balance_cents=balance_cents+? WHERE id=?',(item.amount_cents,item.destination_id))
        movement=db.execute('''INSERT INTO movements(kind,amount_cents,concept,account_id,destination_id,fee_cents,created_at)
                               VALUES('withdrawal',?,?,?,?,?,?)''',
                            (item.amount_cents,item.concept.strip() or 'Transferencia entre cuentas',item.account_id,item.destination_id,item.fee_cents,stamp))
        db.execute('INSERT INTO account_transfers VALUES(?,?)',(movement.lastrowid,item.request_id))
        return {'id':movement.lastrowid,'already_transferred':False}


def month_offset(day:date,delta:int)->date:
    year,month=divmod(day.year*12+day.month-1+delta,12)
    return date(year,month+1,1)


@router.get('/insights')
def insights(months:int=Query(default=6,ge=3,le=12)):
    if months not in (3,6,12):raise HTTPException(400,"Selecciona 3, 6 o 12 meses")
    today=datetime.now(ZoneInfo('America/Lima')).date();current=today.replace(day=1)
    first=month_offset(current,1-months);end=month_offset(current,1)
    def bound(day):return datetime(day.year,day.month,1,tzinfo=ZoneInfo('America/Lima')).astimezone(timezone.utc).isoformat()
    with connection() as db:
        monthly=[]
        for i in range(months):
            start=month_offset(first,i);following=month_offset(start,1)
            row=dict(db.execute('''SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount_cents ELSE 0 END),0) AS income_cents,
                COALESCE(SUM(CASE WHEN kind='expense' THEN amount_cents WHEN kind='withdrawal' THEN fee_cents ELSE 0 END),0) AS expense_cents
                FROM movements WHERE created_at>=? AND created_at<?''',(bound(start),bound(following))).fetchone())
            monthly.append({'month':start.strftime('%Y-%m'),**row})
        categories=[dict(r) for r in db.execute('''SELECT COALESCE(NULLIF(trim(category),''),'Otros') AS category,
            SUM(amount_cents) AS amount_cents FROM movements WHERE kind='expense' AND created_at>=? AND created_at<?
            GROUP BY COALESCE(NULLIF(trim(category),''),'Otros') ORDER BY amount_cents DESC''',(bound(current),bound(end)))]
        fees=db.execute("SELECT COALESCE(SUM(fee_cents),0) FROM movements WHERE kind='withdrawal' AND created_at>=? AND created_at<?",(bound(current),bound(end))).fetchone()[0]
        if fees:
            existing=next((c for c in categories if c['category']=='Comisiones'),None)
            if existing: existing['amount_cents']+=fees
            else: categories.append({'category':'Comisiones','amount_cents':fees})
            categories.sort(key=lambda c:c['amount_cents'],reverse=True)
        previous=month_offset(current,-1)
        prev=dict(db.execute('''SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount_cents ELSE 0 END),0) AS income_cents,
            COALESCE(SUM(CASE WHEN kind='expense' THEN amount_cents WHEN kind='withdrawal' THEN fee_cents ELSE 0 END),0) AS expense_cents
            FROM movements WHERE created_at>=? AND created_at<?''',(bound(previous),bound(current))).fetchone())
        def margin(row):return round(100*(row['income_cents']-row['expense_cents'])/row['income_cents'],1) if row['income_cents'] else None
        return {'monthly':monthly,'categories':categories,'current':monthly[-1],
                'margin_percent':margin(monthly[-1]),'previous_margin_percent':margin(prev)}
