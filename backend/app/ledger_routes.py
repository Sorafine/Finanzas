"""Local ledger corrections, explicit card attribution and expense reconciliation."""
import json
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from .main import connection
from .finance_dates import financial_timestamp

router=APIRouter(tags=['Correcciones y tarjetas'])


def init_ledger(db):
    for table, column, definition in (
        ('savings_goals','reserve','INTEGER NOT NULL DEFAULT 0'),
        ('movements','card_id','INTEGER REFERENCES cards(id)'),
        ('movements','is_card_payment','INTEGER NOT NULL DEFAULT 0'),
        ('movements','revision','INTEGER NOT NULL DEFAULT 1'),
        ('scheduled_payments','card_id','INTEGER REFERENCES cards(id)'),
    ):
        if column not in {r['name'] for r in db.execute(f'PRAGMA table_info({table})')}:
            db.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')
    db.executescript('''
        CREATE TABLE IF NOT EXISTS gmail_links (
            gmail_id TEXT PRIMARY KEY, movement_id INTEGER NOT NULL REFERENCES movements(id)
        );
        CREATE TABLE IF NOT EXISTS ledger_audit (
            id INTEGER PRIMARY KEY, movement_id INTEGER NOT NULL, action TEXT NOT NULL,
            before_json TEXT NOT NULL, after_json TEXT, reason TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS movement_requests (
            request_id TEXT PRIMARY KEY, movement_id INTEGER, payload TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS scheduled_card_unique ON scheduled_payments(card_id) WHERE card_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS movement_card ON movements(card_id,created_at);
    ''')


def effects(db, item):
    """Return cash/debt deltas without applying them; corrections combine both versions."""
    item=dict(item);cash={};debt={};amount=item['amount_cents'];card_id=item.get('card_id')
    if card_id:
        card=db.execute('SELECT * FROM cards WHERE id=?',(card_id,)).fetchone()
        if not card:raise HTTPException(404,'Tarjeta no encontrada')
        if item.get('is_card_payment'):
            if card['card_type']!='credit':raise HTTPException(400,'Solo puedes pagar deuda de una tarjeta de crédito')
            cash[item['account_id']]=-amount;debt[card_id]=-amount
        elif item['kind']=='expense':
            if item['account_id']!=card['account_id']:raise HTTPException(400,'La compra debe usar la cuenta vinculada a la tarjeta')
            if card['card_type']=='credit':debt[card_id]=amount
            else:cash[item['account_id']]=-amount
        else:raise HTTPException(400,'Selecciona tarjeta solo para consumos')
    else:
        cash[item['account_id']]=amount if item['kind']=='income' else -amount-item.get('fee_cents',0)
        if item.get('destination_id'):cash[item['destination_id']]=cash.get(item['destination_id'],0)+amount
    return cash,debt


def apply_effects(db, before=None, after=None):
    deltas=({}, {})
    for item,sign in ((before,-1),(after,1)):
        if item:
            for combined,part in zip(deltas,effects(db,item)):
                for key,value in part.items():combined[key]=combined.get(key,0)+sign*value
    for account_id,delta in deltas[0].items():
        row=db.execute('SELECT balance_cents FROM accounts WHERE id=?',(account_id,)).fetchone()
        if not row:raise HTTPException(404,'Cuenta no encontrada')
        if row[0]+delta<0:raise HTTPException(409,'La corrección dejaría una cuenta sin fondos. Corrige primero los movimientos relacionados.')
        db.execute('UPDATE accounts SET balance_cents=balance_cents+? WHERE id=?',(delta,account_id))
    for card_id,delta in deltas[1].items():
        row=db.execute('SELECT debt_cents,credit_limit_cents FROM cards WHERE id=?',(card_id,)).fetchone()
        value=row[0]+delta
        if value<0 or value>row[1]:raise HTTPException(409,'La deuda quedaría fuera del límite o por debajo de cero. Revisa los consumos y pagos relacionados.')
        db.execute('UPDATE cards SET debt_cents=? WHERE id=?',(value,card_id))
        db.execute('UPDATE scheduled_payments SET amount_cents=? WHERE card_id=?',(max(1,value),card_id))


def audit(db, old, new, reason):
    details=dict(old)
    details['receipts']=[dict(r) for r in db.execute('SELECT * FROM payment_receipts WHERE movement_id=?',(old['id'],))]
    details['gmail']=[dict(r) for r in db.execute('SELECT * FROM gmail_imports WHERE movement_id=? UNION ALL SELECT * FROM gmail_links WHERE movement_id=?',(old['id'],old['id']))]
    db.execute('INSERT INTO ledger_audit(movement_id,action,before_json,after_json,reason,created_at) VALUES(?,?,?,?,?,?)',
        (old['id'],'edit' if new else 'void',json.dumps(details),json.dumps(new) if new else None,reason,datetime.now(timezone.utc).isoformat()))


class Correction(BaseModel):
    model_config=ConfigDict(extra='forbid')
    expected_revision:int=Field(ge=1)
    reason:str=Field(min_length=3,max_length=200)
    amount_cents:int=Field(gt=0)
    concept:str=Field(min_length=1,max_length=150)
    account_id:int
    destination_id:int|None=None
    fee_cents:int=Field(default=0,ge=0)
    category:str|None=Field(default=None,max_length=80)
    occurred_on:date


class VoidIn(BaseModel):
    expected_revision:int=Field(ge=1)
    reason:str=Field(min_length=3,max_length=200)


def original(db, movement_id, revision):
    row=db.execute('SELECT * FROM movements WHERE id=?',(movement_id,)).fetchone()
    if not row:raise HTTPException(404,'Movimiento no encontrado; puede que ya esté anulado')
    if row['revision']!=revision:raise HTTPException(409,'El movimiento cambió. Actualiza el historial antes de corregirlo.')
    return dict(row)


@router.put('/movements/{movement_id}')
def correct(movement_id:int,item:Correction):
    with connection() as db:
        db.execute('BEGIN IMMEDIATE');old=original(db,movement_id,item.expected_revision)
        new={**old,**item.model_dump(exclude={'expected_revision','reason','occurred_on'}),'created_at':financial_timestamp(item.occurred_on),'revision':old['revision']+1}
        if not new['concept'].strip():raise HTTPException(400,'Escribe un concepto')
        transfer=old['kind']=='withdrawal' and not old['is_card_payment']
        if transfer:
            if new['destination_id'] is None or new['destination_id']==new['account_id']:raise HTTPException(400,'Elige dos cuentas distintas')
        elif new['destination_id'] is not None or new['fee_cents']:raise HTTPException(400,'Destino y comisión solo corresponden a transferencias')
        apply_effects(db,old,new);audit(db,old,new,item.reason)
        fields=('amount_cents','concept','account_id','destination_id','fee_cents','category','created_at','revision')
        db.execute('UPDATE movements SET '+','.join(f'{k}=?' for k in fields)+' WHERE id=?',(*[new[k] for k in fields],movement_id))
        return {'id':movement_id,'revision':new['revision']}


@router.post('/movements/{movement_id}/void')
def void(movement_id:int,item:VoidIn):
    with connection() as db:
        db.execute('BEGIN IMMEDIATE');old=original(db,movement_id,item.expected_revision)
        receipt=db.execute('SELECT * FROM payment_receipts WHERE movement_id=?',(movement_id,)).fetchone()
        if receipt:
            later=db.execute('SELECT 1 FROM payment_receipts WHERE scheduled_id=? AND due_date>?',(receipt['scheduled_id'],receipt['due_date'])).fetchone()
            if later:raise HTTPException(409,'Anula primero los pagos posteriores de esta serie para conservar el orden de vencimientos.')
        apply_effects(db,old,None);audit(db,old,None,item.reason)
        if receipt:
            db.execute('UPDATE scheduled_payments SET due_date=?,active=1 WHERE id=?',(receipt['due_date'],receipt['scheduled_id']))
            db.execute('DELETE FROM payment_receipts WHERE movement_id=?',(movement_id,))
        for row in db.execute('SELECT gmail_id FROM gmail_imports WHERE movement_id=? UNION SELECT gmail_id FROM gmail_links WHERE movement_id=?',(movement_id,movement_id)).fetchall():
            db.execute("INSERT OR REPLACE INTO gmail_reviews VALUES(?,'dismissed')",(row[0],))
        db.execute('DELETE FROM gmail_imports WHERE movement_id=?',(movement_id,))
        db.execute('DELETE FROM gmail_links WHERE movement_id=?',(movement_id,))
        transfer=db.execute('SELECT request_id FROM account_transfers WHERE movement_id=?',(movement_id,)).fetchone()
        if transfer:db.execute('INSERT OR REPLACE INTO movement_requests VALUES(?,NULL,?)',(transfer[0],'void'))
        db.execute('DELETE FROM account_transfers WHERE movement_id=?',(movement_id,))
        db.execute('UPDATE movement_requests SET movement_id=NULL WHERE movement_id=?',(movement_id,))
        db.execute('DELETE FROM movements WHERE id=?',(movement_id,))
        return {'voided':True,'payment_reopened':bool(receipt)}


@router.get('/corrections')
def corrections():
    with connection() as db:
        return [dict(r) for r in db.execute('SELECT id,movement_id,action,reason,created_at FROM ledger_audit ORDER BY id DESC LIMIT 100')]


@router.get('/expense-matches')
def expense_matches(amount_cents:int=Query(gt=0),account_id:int=Query(gt=0),occurred_on:date|None=None,days:int=Query(default=3,ge=0,le=31),card_id:int|None=None,any_card:bool=False):
    day=occurred_on or datetime.now(ZoneInfo('America/Lima')).date()
    try: first,last=(day-timedelta(days=days)).isoformat(),(day+timedelta(days=days)).isoformat()
    except OverflowError:raise HTTPException(400,'Fecha fuera de rango')
    with connection() as db:
        return [dict(r) for r in db.execute('''SELECT m.id,m.concept,m.amount_cents,m.created_at,m.card_id,m.is_card_payment,
            EXISTS(SELECT 1 FROM payment_receipts p WHERE p.movement_id=m.id) AS linked_payment
            FROM movements m WHERE amount_cents=? AND account_id=? AND (kind='expense' OR is_card_payment=1)
            AND (COALESCE(card_id,0)=? OR (? AND kind='expense')) AND date(datetime(created_at,'-5 hours')) BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 20''',
            (amount_cents,account_id,card_id or 0,int(any_card),first,last))]


class CardPaymentIn(BaseModel):
    account_id:int
    amount_cents:int=Field(gt=0)
    occurred_on:date|None=None
    request_id:str=Field(min_length=16,max_length=100)


@router.post('/cards/{card_id}/pay',status_code=201)
def repay(card_id:int,item:CardPaymentIn):
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        payload=json.dumps({'card_id':card_id,**item.model_dump(mode='json')},sort_keys=True)
        found=db.execute('SELECT * FROM movement_requests WHERE request_id=?',(item.request_id,)).fetchone()
        if found:
            if found['payload']!=payload or not found['movement_id']:raise HTTPException(409,'Este intento ya cambió o fue anulado. Revisa el historial.')
            return {'id':found['movement_id'],'already_paid':True}
        card=db.execute("SELECT * FROM cards WHERE id=? AND card_type='credit'",(card_id,)).fetchone()
        if not card:raise HTTPException(404,'Tarjeta de crédito no encontrada')
        if db.execute('SELECT 1 FROM scheduled_payments WHERE card_id=? AND active=1',(card_id,)).fetchone():raise HTTPException(409,'La deuda está vinculada a Pagos. Confírmala allí para avanzar su vencimiento sin duplicar registros.')
        stamp=financial_timestamp(item.occurred_on)
        movement={'kind':'withdrawal','amount_cents':item.amount_cents,'account_id':item.account_id,'card_id':card_id,'is_card_payment':1,'fee_cents':0}
        apply_effects(db,after=movement)
        cur=db.execute('''INSERT INTO movements(kind,amount_cents,concept,account_id,card_id,is_card_payment,created_at)
            VALUES('withdrawal',?,?,?,?,1,?)''',(item.amount_cents,'Pago de '+card['name'],item.account_id,card_id,stamp))
        db.execute('INSERT INTO movement_requests VALUES(?,?,?)',(item.request_id,cur.lastrowid,payload))
        return {'id':cur.lastrowid,'already_paid':False}


@router.post('/cards/{card_id}/schedule')
def schedule_card(card_id:int):
    from .card_reports import next_calendar_day
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        card=db.execute("SELECT * FROM cards WHERE id=? AND card_type='credit'",(card_id,)).fetchone()
        if not card:raise HTTPException(404,'Tarjeta de crédito no encontrada')
        if not card['due_day'] or not card['debt_cents']:raise HTTPException(400,'Configura el día de pago y registra deuda antes de programarla')
        existing=db.execute('SELECT id FROM scheduled_payments WHERE card_id=?',(card_id,)).fetchone()
        if existing:
            db.execute('UPDATE scheduled_payments SET active=1 WHERE id=?',(existing[0],));return {'id':existing[0]}
        today=datetime.now(ZoneInfo('America/Lima')).date();due=next_calendar_day(today,card['due_day'])
        cur=db.execute('''INSERT INTO scheduled_payments(name,amount_cents,due_date,frequency,account_id,category,created_at,card_id)
            VALUES(?,?,?,'monthly',?,'Tarjeta',?,?)''',('Pago de '+card['name'],card['debt_cents'],due,card['account_id'],datetime.now(timezone.utc).isoformat(),card_id))
        return {'id':cur.lastrowid}


@router.get('/availability')
def availability():
    today=datetime.now(ZoneInfo('America/Lima')).date();end=today.strftime('%Y-%m')+'-31'
    with connection() as db:
        db.execute('BEGIN')
        total=db.execute('SELECT COALESCE(SUM(balance_cents),0) FROM accounts').fetchone()[0]
        payments=db.execute('SELECT COALESCE(SUM(amount_cents),0) FROM scheduled_payments WHERE active=1 AND card_id IS NULL AND due_date<=?',(end,)).fetchone()[0]
        debt=db.execute("SELECT COALESCE(SUM(debt_cents),0) FROM cards WHERE card_type='credit'").fetchone()[0]
        reserved=db.execute('SELECT COALESCE(SUM(saved_cents),0) FROM savings_goals WHERE reserve=1').fetchone()[0]
        # All credit debt is reserved once, including debt without a scheduled payment.
        return {'balance_cents':total,'scheduled_cents':payments,'credit_debt_cents':debt,'reserved_cents':reserved,'committed_cents':payments+debt+reserved,'available_cents':total-payments-debt-reserved}


class GoalReserveIn(BaseModel):
    reserve:bool


@router.patch('/goals/{goal_id}/reserve')
def reserve_goal(goal_id:int,item:GoalReserveIn):
    with connection() as db:
        cur=db.execute('UPDATE savings_goals SET reserve=? WHERE id=?',(int(item.reserve),goal_id))
        if not cur.rowcount:raise HTTPException(404,'Meta no encontrada')
        return {'reserved':item.reserve}
