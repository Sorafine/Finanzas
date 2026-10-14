"""Confirmed scheduled expenses and searchable, paginated financial history."""
from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
import csv
import io
from .finance_dates import financial_timestamp
from pydantic import BaseModel, ConfigDict, Field
from .main import connection

router = APIRouter(tags=['Historial y pagos'])


def next_due(current: date, frequency: str, anchor: date) -> date | None:
    if frequency == 'once':
        return None
    if frequency == 'weekly':
        return current + timedelta(days=7)
    if frequency == 'monthly':
        month = current.month % 12 + 1
        year = current.year + (current.month == 12)
    else:
        month, year = anchor.month, current.year + 1
    return date(year, month, min(anchor.day, monthrange(year, month)[1]))


class PayIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    due_date: date
    account_id: int
    amount_cents: int = Field(gt=0)
    paid_on: date | None = None


@router.post('/scheduled/{scheduled_id}/pay')
def pay_scheduled(scheduled_id: int, payment: PayIn):
    with connection() as db:
        # One transaction covers the balance, receipt, expense and next occurrence.
        db.execute('BEGIN IMMEDIATE')
        receipt = db.execute('SELECT movement_id FROM payment_receipts WHERE scheduled_id=? AND due_date=?',
                             (scheduled_id, payment.due_date.isoformat())).fetchone()
        if receipt:
            return {'id': receipt['movement_id'], 'already_paid': True}
        plan = db.execute('SELECT * FROM scheduled_payments WHERE id=?', (scheduled_id,)).fetchone()
        if not plan:
            raise HTTPException(404, 'Pago no encontrado')
        if not plan['active']:
            raise HTTPException(400, 'Activa el pago antes de registrarlo')
        if plan['due_date'] != payment.due_date.isoformat():
            raise HTTPException(409, 'El vencimiento cambió. Actualiza los pagos y vuelve a intentarlo.')
        account = db.execute('SELECT * FROM accounts WHERE id=?', (payment.account_id,)).fetchone()
        if not account:
            raise HTTPException(404, 'Cuenta no encontrada')
        if account['balance_cents'] < payment.amount_cents:
            raise HTTPException(400, 'Saldo insuficiente. Revisa la cuenta o registra el dinero recibido.')
        first = db.execute('SELECT MIN(due_date) FROM payment_receipts WHERE scheduled_id=?', (scheduled_id,)).fetchone()[0]
        anchor = date.fromisoformat(first or plan['due_date'])
        try:
            following = next_due(payment.due_date, plan['frequency'], anchor)
        except (ValueError, OverflowError):
            raise HTTPException(400, 'No se puede calcular el siguiente vencimiento')
        now = financial_timestamp(payment.paid_on)
        db.execute('UPDATE accounts SET balance_cents=balance_cents-? WHERE id=?', (payment.amount_cents, payment.account_id))
        movement = db.execute('''INSERT INTO movements(kind,amount_cents,concept,account_id,classification,category,created_at)
                                 VALUES('expense',?,?,?,'fijo',?,?)''',
                              (payment.amount_cents, plan['name'], payment.account_id, plan['category'], now))
        db.execute('INSERT INTO payment_receipts(scheduled_id,due_date,movement_id) VALUES(?,?,?)',
                   (scheduled_id, plan['due_date'], movement.lastrowid))
        if following:
            db.execute('UPDATE scheduled_payments SET due_date=? WHERE id=?', (following.isoformat(), scheduled_id))
        else:
            db.execute('UPDATE scheduled_payments SET active=0 WHERE id=?', (scheduled_id,))
        return {'id': movement.lastrowid, 'already_paid': False, 'next_due_date': following.isoformat() if following else None}


@router.get('/history')
def history(page: int = Query(default=1, ge=1), page_size: int = Query(default=30, ge=1, le=100),
            kind: Literal['all','income','expense','withdrawal','transfer','payment'] = 'all',
            q: str = Query(default='', max_length=150), account_id: int | None = None,
            date_from: date | None = None, date_to: date | None = None, format: Literal['json','csv'] = 'json'):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(400, 'La fecha inicial debe ser anterior a la final')
    filters, values = [], []
    if kind == 'payment':
        filters.append('p.id IS NOT NULL')
    elif kind != 'all':
        filters.append('m.kind=?'); values.append('withdrawal' if kind=='transfer' else kind)
    if account_id is not None:
        filters.append('(m.account_id=? OR m.destination_id=?)'); values.extend([account_id,account_id])
    if q.strip():
        filters.append("(m.concept LIKE ? ESCAPE '\\' OR COALESCE(m.category,'') LIKE ? ESCAPE '\\')")
        search = q.strip().replace('\\','\\\\').replace('%','\\%').replace('_','\\_')
        values.extend([f'%{search}%', f'%{search}%'])
    for value, operator in ((date_from, '>='), (date_to, '<')):
        if value:
            try:
                day = value if operator == '>=' else value + timedelta(days=1)
                boundary = datetime.combine(day, time.min, ZoneInfo('America/Lima')).astimezone(timezone.utc).isoformat()
            except OverflowError:
                raise HTTPException(400, 'Fecha fuera de rango')
            filters.append(f'm.created_at{operator}?'); values.append(boundary)
    source = '''FROM movements m JOIN accounts a ON a.id=m.account_id
                LEFT JOIN accounts d ON d.id=m.destination_id
                LEFT JOIN payment_receipts p ON p.movement_id=m.id
                LEFT JOIN gmail_imports g ON g.movement_id=m.id
                LEFT JOIN account_transfers t ON t.movement_id=m.id'''
    where = ' WHERE ' + ' AND '.join(filters) if filters else ''
    with connection() as db:
        totals = dict(db.execute('''SELECT COUNT(*) AS count,
            COALESCE(SUM(CASE WHEN m.kind='income' THEN m.amount_cents ELSE 0 END),0) AS income_cents,
            COALESCE(SUM(CASE WHEN m.kind='expense' THEN m.amount_cents WHEN m.kind='withdrawal' THEN m.fee_cents ELSE 0 END),0) AS expense_cents
            ''' + source + where, values).fetchone())
        pagination = '' if format=='csv' else ' LIMIT ? OFFSET ?'
        args = values if format=='csv' else [*values,page_size,(page-1)*page_size]
        items = [dict(row) for row in db.execute('''SELECT m.*, a.name AS account_name, d.name AS destination_name,t.movement_id AS transfer_id,
                  p.scheduled_id, p.due_date AS payment_due_date,
                  CASE WHEN p.id IS NOT NULL THEN 'payment' WHEN g.gmail_id IS NOT NULL THEN 'gmail' ELSE 'manual' END AS source
                  ''' + source + where + ' ORDER BY m.created_at DESC,m.id DESC' + pagination,args)]
        for item in items:
            if item['transfer_id'] is not None: item['kind']='transfer'
        if format=='csv':
            output=io.StringIO();writer=csv.writer(output)
            writer.writerow(['Fecha (Perú)','Tipo','Concepto','Cuenta','Destino','Categoría','Importe S/','Comisión S/'])
            def cell(value):
                text=str(value or '')
                return "'"+text if text.lstrip().startswith(('=','+','-','@')) else text
            labels={'income':'Ingreso','expense':'Gasto','withdrawal':'Retiro de efectivo','transfer':'Transferencia'}
            for item in items:
                day=datetime.fromisoformat(item['created_at']).astimezone(ZoneInfo('America/Lima')).date().isoformat()
                writer.writerow([day,labels[item['kind']],cell(item['concept']),cell(item['account_name']),cell(item['destination_name']),cell(item['category']),f"{item['amount_cents']/100:.2f}",f"{item['fee_cents']/100:.2f}"])
            return Response('\ufeff'+output.getvalue(),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':'attachment; filename="finanzas_historial.csv"'})
        return {'items':items,'total':totals['count'],'totals':totals,'page':page,'page_size':page_size}
