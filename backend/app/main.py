from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB = Path(__file__).resolve().parents[1] / 'finanzas.db'

def connection():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    return db

def init_db():
    with connection() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('bank','cash','wallet')),
                balance_cents INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL CHECK(kind IN ('income','expense','withdrawal')),
                amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
                concept TEXT NOT NULL,
                account_id INTEGER NOT NULL REFERENCES accounts(id),
                destination_id INTEGER REFERENCES accounts(id),
                fee_cents INTEGER NOT NULL DEFAULT 0,
                frequency TEXT,
                classification TEXT,
                category TEXT,
                created_at TEXT NOT NULL
            );
        ''')
        if not db.execute('SELECT 1 FROM accounts LIMIT 1').fetchone():
            db.executemany('INSERT INTO accounts(name,kind,balance_cents) VALUES (?,?,?)',
                [('Mi banco','bank',0),('Mi efectivo','cash',0)])

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    init_cards()
    init_extra()
    with connection() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS gmail_reviews (
            gmail_id TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK(status IN ('dismissed','reviewed'))
        );
        CREATE TABLE IF NOT EXISTS calendar_events (
            scheduled_id INTEGER PRIMARY KEY REFERENCES scheduled_payments(id),
            event_id TEXT NOT NULL
        );
        """)
    yield

app = FastAPI(title='FinanzasApp API', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173','http://127.0.0.1:5173'], allow_credentials=False, allow_methods=['*'], allow_headers=['*'])

class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: Literal['bank','cash','wallet']
    opening_cents: int = Field(default=0, ge=0)

class MovementIn(BaseModel):
    kind: Literal['income','expense','withdrawal']
    amount_cents: int = Field(gt=0)
    concept: str = Field(min_length=1, max_length=150)
    account_id: int
    destination_id: int | None = None
    fee_cents: int = Field(default=0, ge=0)
    classification: Literal['fijo','variable'] | None = None
    category: str | None = None
    frequency: str | None = None

@app.get('/health')
def health(): return {'status':'ok'}

@app.get('/accounts')
def get_accounts():
    with connection() as db:
        return [dict(x) for x in db.execute('SELECT * FROM accounts ORDER BY id')]

@app.post('/accounts', status_code=201)
def add_account(a: AccountIn):
    with connection() as db:
        cursor = db.execute('INSERT INTO accounts(name,kind,balance_cents) VALUES (?,?,?)', (a.name,a.kind,a.opening_cents))
        return dict(db.execute('SELECT * FROM accounts WHERE id=?', (cursor.lastrowid,)).fetchone())

@app.get('/movements')
def get_movements():
    with connection() as db:
        return [dict(x) for x in db.execute('SELECT * FROM movements ORDER BY id DESC LIMIT 150')]

@app.get('/summary')
def summary():
    with connection() as db:
        balances = db.execute("SELECT COALESCE(SUM(balance_cents),0) AS total FROM accounts").fetchone()['total']
        income = db.execute("SELECT COALESCE(SUM(amount_cents),0) AS total FROM movements WHERE kind='income'").fetchone()['total']
        expense = db.execute("SELECT COALESCE(SUM(amount_cents),0) AS total FROM movements WHERE kind='expense'").fetchone()['total']
        fees = db.execute("SELECT COALESCE(SUM(fee_cents),0) AS total FROM movements WHERE kind='withdrawal'").fetchone()['total']
        return {'balance_cents':balances,'income_cents':income,'expense_cents':expense+fees}

@app.post('/movements', status_code=201)
def add_movement(m: MovementIn):
    with connection() as db:
        try:
            db.execute('BEGIN IMMEDIATE')
            account = db.execute('SELECT * FROM accounts WHERE id=?', (m.account_id,)).fetchone()
            if not account: raise HTTPException(404, 'Cuenta de origen no encontrada')
            dest = None
            if m.kind == 'withdrawal':
                if m.destination_id is None or m.destination_id == m.account_id:
                    raise HTTPException(400, 'Selecciona una cuenta de efectivo distinta de la de origen')
                dest = db.execute('SELECT * FROM accounts WHERE id=?', (m.destination_id,)).fetchone()
                if not dest or dest['kind'] != 'cash':
                    raise HTTPException(400, 'El destino debe ser una cuenta de efectivo')
                if account['kind'] == 'cash':
                    raise HTTPException(400, 'El origen no puede ser efectivo')
            elif m.destination_id is not None or m.fee_cents:
                raise HTTPException(400, 'Destino y comisión solo se admiten para retiros')
            debit = (m.amount_cents + m.fee_cents) if m.kind == 'withdrawal' else (m.amount_cents if m.kind == 'expense' else 0)
            if account['balance_cents'] < debit:
                raise HTTPException(400, 'Saldo insuficiente en la cuenta de origen')
            change = m.amount_cents if m.kind == 'income' else -debit
            db.execute('UPDATE accounts SET balance_cents=balance_cents+? WHERE id=?',(change,m.account_id))
            if dest:
                db.execute('UPDATE accounts SET balance_cents=balance_cents+? WHERE id=?',(m.amount_cents,m.destination_id))
            cursor = db.execute('''INSERT INTO movements(kind,amount_cents,concept,account_id,destination_id,fee_cents,frequency,classification,category,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)''',(m.kind,m.amount_cents,m.concept,m.account_id,m.destination_id,m.fee_cents,m.frequency,m.classification,m.category,datetime.now(timezone.utc).isoformat()))
            db.commit()
            return {'id':cursor.lastrowid,'message':'Registrado'}
        except Exception:
            db.rollback()
            raise

# Módulo de tarjetas y edición de cuentas: no conecta con entidades bancarias.
def init_cards():
    with connection() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            name TEXT NOT NULL,
            card_type TEXT NOT NULL CHECK(card_type IN ('debit','credit')),
            last_four TEXT NOT NULL CHECK(length(last_four)=4),
            brand TEXT NOT NULL DEFAULT 'Otra',
            credit_limit_cents INTEGER NOT NULL DEFAULT 0,
            debt_cents INTEGER NOT NULL DEFAULT 0,
            closing_day INTEGER,
            due_day INTEGER
        );''')

class AccountUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

class CardIn(BaseModel):
    account_id: int
    name: str = Field(min_length=1, max_length=80)
    card_type: Literal['debit','credit']
    last_four: str = Field(pattern=r'^\d{4}$')
    brand: str = Field(default='Otra', max_length=40)
    credit_limit_cents: int = Field(default=0, ge=0)
    debt_cents: int = Field(default=0, ge=0)
    closing_day: int | None = Field(default=None, ge=1, le=31)
    due_day: int | None = Field(default=None, ge=1, le=31)

class CardUpdate(CardIn):
    pass

@app.patch('/accounts/{account_id}')
def update_account(account_id:int, account:AccountUpdate):
    with connection() as db:
        cur=db.execute('UPDATE accounts SET name=? WHERE id=?',(account.name.strip(),account_id))
        if not cur.rowcount: raise HTTPException(404,'Cuenta no encontrada')
        return dict(db.execute('SELECT * FROM accounts WHERE id=?',(account_id,)).fetchone())

@app.get('/accounts/{account_id}/movements')
def account_movements(account_id:int):
    with connection() as db:
        if not db.execute('SELECT 1 FROM accounts WHERE id=?',(account_id,)).fetchone():
            raise HTTPException(404,'Cuenta no encontrada')
        return [dict(x) for x in db.execute('SELECT * FROM movements WHERE account_id=? OR destination_id=? ORDER BY id DESC LIMIT 100',(account_id,account_id))]

@app.get('/cards')
def get_cards():
    init_cards()
    with connection() as db:
        return [dict(x) for x in db.execute('SELECT * FROM cards ORDER BY id DESC')]

@app.post('/cards',status_code=201)
def add_card(card:CardIn):
    init_cards()
    if card.card_type=='debit' and (card.credit_limit_cents or card.debt_cents):
        raise HTTPException(400,'Una tarjeta de débito no debe tener deuda o línea de crédito')
    if card.card_type=='credit' and card.debt_cents>card.credit_limit_cents:
        raise HTTPException(400,'La deuda no puede exceder el límite registrado')
    with connection() as db:
        if not db.execute('SELECT 1 FROM accounts WHERE id=?',(card.account_id,)).fetchone():
            raise HTTPException(404,'Cuenta asociada no encontrada')
        fields=card.model_dump()
        columns=','.join(fields)
        marks=','.join('?' for _ in fields)
        cursor=db.execute(f'INSERT INTO cards({columns}) VALUES ({marks})',tuple(fields.values()))
        return dict(db.execute('SELECT * FROM cards WHERE id=?',(cursor.lastrowid,)).fetchone())

@app.put('/cards/{card_id}')
def update_card(card_id:int,card:CardUpdate):
    init_cards()
    if card.card_type=='debit' and (card.credit_limit_cents or card.debt_cents):
        raise HTTPException(400,'Débito no admite deuda ni línea de crédito')
    if card.card_type=='credit' and card.debt_cents>card.credit_limit_cents:
        raise HTTPException(400,'La deuda no puede superar el límite')
    with connection() as db:
        if not db.execute('SELECT 1 FROM accounts WHERE id=?',(card.account_id,)).fetchone():
            raise HTTPException(404,'Cuenta asociada no encontrada')
        fields=card.model_dump()
        cur=db.execute('UPDATE cards SET '+','.join(f'{k}=?' for k in fields)+' WHERE id=?',(*fields.values(),card_id))
        if not cur.rowcount: raise HTTPException(404,'Tarjeta no encontrada')
        return dict(db.execute('SELECT * FROM cards WHERE id=?',(card_id,)).fetchone())

# Módulos adicionales: reportes, pagos futuros y metas. No descuentan dinero al programarlos.
from datetime import date
from fastapi.responses import Response
import csv
import io

def init_extra():
    with connection() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS scheduled_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
            due_date TEXT NOT NULL,
            frequency TEXT NOT NULL CHECK(frequency IN ('once','weekly','monthly','yearly')),
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            category TEXT NOT NULL DEFAULT 'Otros',
            active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS savings_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            target_cents INTEGER NOT NULL CHECK(target_cents > 0),
            saved_cents INTEGER NOT NULL DEFAULT 0 CHECK(saved_cents >= 0),
            target_date TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_movements_date ON movements(created_at);
        CREATE INDEX IF NOT EXISTS idx_movements_category ON movements(category);
        CREATE INDEX IF NOT EXISTS idx_movements_account ON movements(account_id);
        ''')

class ScheduledIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    amount_cents: int = Field(gt=0)
    due_date: date
    frequency: Literal['once','weekly','monthly','yearly'] = 'monthly'
    account_id: int
    category: str = Field(default='Otros',max_length=80)

class GoalIn(BaseModel):
    name: str = Field(min_length=1,max_length=120)
    target_cents: int = Field(gt=0)
    target_date: date | None = None

class GoalContribution(BaseModel):
    amount_cents: int = Field(gt=0)

@app.get('/scheduled')
def get_scheduled():
    with connection() as db:
        return [dict(r) for r in db.execute('SELECT * FROM scheduled_payments ORDER BY active DESC,due_date,id')]

@app.post('/scheduled',status_code=201)
def add_scheduled(item:ScheduledIn):
    with connection() as db:
        if not db.execute('SELECT 1 FROM accounts WHERE id=?',(item.account_id,)).fetchone():
            raise HTTPException(404,'Cuenta no encontrada')
        c=db.execute('INSERT INTO scheduled_payments(name,amount_cents,due_date,frequency,account_id,category,created_at) VALUES(?,?,?,?,?,?,?)',
             (item.name.strip(),item.amount_cents,item.due_date.isoformat(),item.frequency,item.account_id,item.category,datetime.now(timezone.utc).isoformat()))
        return dict(db.execute('SELECT * FROM scheduled_payments WHERE id=?',(c.lastrowid,)).fetchone())

@app.patch('/scheduled/{item_id}/toggle')
def toggle_scheduled(item_id:int):
    with connection() as db:
        c=db.execute('UPDATE scheduled_payments SET active=1-active WHERE id=?',(item_id,))
        if not c.rowcount: raise HTTPException(404,'Plan no encontrado')
        return dict(db.execute('SELECT * FROM scheduled_payments WHERE id=?',(item_id,)).fetchone())

@app.get('/goals')
def get_goals():
    with connection() as db:
        return [dict(r) for r in db.execute('SELECT * FROM savings_goals ORDER BY id DESC')]

@app.post('/goals',status_code=201)
def add_goal(goal:GoalIn):
    with connection() as db:
        c=db.execute('INSERT INTO savings_goals(name,target_cents,target_date,created_at) VALUES(?,?,?,?)',
            (goal.name.strip(),goal.target_cents,goal.target_date.isoformat() if goal.target_date else None,datetime.now(timezone.utc).isoformat()))
        return dict(db.execute('SELECT * FROM savings_goals WHERE id=?',(c.lastrowid,)).fetchone())

@app.post('/goals/{goal_id}/contribute')
def contribute_goal(goal_id:int,contribution:GoalContribution):
    # Progreso informativo; no descuenta una cuenta bancaria.
    with connection() as db:
        c=db.execute('UPDATE savings_goals SET saved_cents=saved_cents+? WHERE id=?',(contribution.amount_cents,goal_id))
        if not c.rowcount: raise HTTPException(404,'Meta no encontrada')
        return dict(db.execute('SELECT * FROM savings_goals WHERE id=?',(goal_id,)).fetchone())

@app.get('/reports/overview')
def reports_overview(year:int | None=None):
    y=year or date.today().year
    if not 2000<=y<=2100: raise HTTPException(400,'Año fuera de rango')
    start=f'{y}-01-01';end=f'{y+1}-01-01'
    with connection() as db:
        rows=[dict(r) for r in db.execute('''
          SELECT substr(created_at,1,7) AS month,
          COALESCE(SUM(CASE WHEN kind='income' THEN amount_cents ELSE 0 END),0) income_cents,
          COALESCE(SUM(CASE WHEN kind='expense' THEN amount_cents WHEN kind='withdrawal' THEN fee_cents ELSE 0 END),0) expense_cents,
          COUNT(*) AS transactions
          FROM movements WHERE created_at>=? AND created_at<?
          GROUP BY substr(created_at,1,7) ORDER BY month''',(start,end))]
        categories=[dict(r) for r in db.execute('''
          SELECT COALESCE(NULLIF(trim(category),''),'Sin categoría') AS category,
          SUM(amount_cents) AS amount_cents, COUNT(*) AS transactions
          FROM movements WHERE kind='expense' AND created_at>=? AND created_at<?
          GROUP BY COALESCE(NULLIF(trim(category),''),'Sin categoría')
          ORDER BY amount_cents DESC''',(start,end))]
        accounts=[dict(r) for r in db.execute('''
          SELECT a.id,a.name,a.kind,a.balance_cents,COUNT(m.id) AS transaction_count
          FROM accounts a LEFT JOIN movements m ON m.account_id=a.id OR m.destination_id=a.id
          GROUP BY a.id ORDER BY a.id''')]
        totals={'income_cents':sum(r['income_cents'] for r in rows),
                'expense_cents':sum(r['expense_cents'] for r in rows),
                'transactions':sum(r['transactions'] for r in rows)}
        totals['net_cents']=totals['income_cents']-totals['expense_cents']
        return {'year':y,'totals':totals,'monthly':rows,'categories':categories,'accounts':accounts}

@app.get('/reports/export.csv')
def export_csv(year:int | None=None):
    y=year or date.today().year
    if not 2000<=y<=2100: raise HTTPException(400,'Año fuera de rango')
    with connection() as db:
        rows=db.execute('''SELECT m.id,m.created_at,m.kind,m.concept,m.classification,
                m.category,m.amount_cents,m.fee_cents,a.name AS account,d.name AS destination
            FROM movements m JOIN accounts a ON a.id=m.account_id
            LEFT JOIN accounts d ON d.id=m.destination_id
            WHERE m.created_at>=? AND m.created_at<? ORDER BY m.created_at DESC''',
            (f'{y}-01-01',f'{y+1}-01-01')).fetchall()
    output=io.StringIO();writer=csv.writer(output)
    writer.writerow(['ID','Fecha UTC','Tipo','Concepto','Clasificacion','Categoria','Importe S/','Comision S/','Cuenta','Destino'])
    for r in rows:
        writer.writerow([r['id'],r['created_at'],r['kind'],r['concept'],r['classification'] or '',r['category'] or '',
                         f"{r['amount_cents']/100:.2f}",f"{r['fee_cents']/100:.2f}",r['account'],r['destination'] or ''])
    return Response('\ufeff'+output.getvalue(),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':f'attachment; filename="finanzas_{y}.csv"'})

# Import al final para evitar dependencias circulares al registrar el router.
from .google_routes import router as google_router
app.include_router(google_router)
