from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
import sqlite3
import os
from typing import Literal
from fastapi import FastAPI, HTTPException
from .auth import current_database, init_auth_db, registry, user_database, PrivateAppMiddleware, router as auth_router
from pydantic import BaseModel, Field

DB = Path(os.environ.get('FINANZAS_DB_PATH', str(Path(__file__).resolve().parents[1] / 'finanzas.db')))

@contextmanager
def connection():
    db = sqlite3.connect(current_database.get() or DB, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    try:
        with db:
            yield db
    finally:
        db.close()

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

def init_finance_db():
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
        CREATE TABLE IF NOT EXISTS gmail_imports (
            gmail_id TEXT PRIMARY KEY,
            movement_id INTEGER NOT NULL UNIQUE REFERENCES movements(id)
        );
        """)
    from .ledger_routes import init_ledger
    with connection() as db: init_ledger(db)
    from .organizer_routes import init_organizer
    with connection() as db: init_organizer(db)
    from .student_routes import init_student
    with connection() as db: init_student(db)
    from .student_calendar import init_student_calendar
    with connection() as db: init_student_calendar(db)
    path = current_database.get() or DB
    path.chmod(0o600)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_auth_db()
    # Apply additive schema upgrades to existing private profiles on restart.
    # Never touch the old single-user database shipped in the checkout.
    with registry() as db:
        users = [row['id'] for row in db.execute('SELECT id FROM users')]
    for user_id in users:
        path = user_database(user_id)
        if path.is_file():
            token = current_database.set(path)
            try:
                init_finance_db()
            finally:
                current_database.reset(token)
    yield

app = FastAPI(title='Balance API', lifespan=lifespan)
app.add_middleware(PrivateAppMiddleware)
app.include_router(auth_router)
from .admin_routes import router as admin_router
app.include_router(admin_router)

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
    recurring_due_date: str | None = None
    gmail_id: str | None = Field(default=None, min_length=1, max_length=300)
    occurred_on: date | None = None
    card_id: int | None = None
    request_id: str | None = Field(default=None,min_length=16,max_length=100)
    allow_duplicate: bool = False

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
        from zoneinfo import ZoneInfo
        from datetime import timedelta
        today = datetime.now(ZoneInfo('America/Lima'))
        start = today.replace(day=1,hour=0,minute=0,second=0,microsecond=0)
        following = (start.replace(day=28)+timedelta(days=4)).replace(day=1)
        monthly = db.execute('''SELECT
            COALESCE(SUM(CASE WHEN kind='income' THEN amount_cents ELSE 0 END),0) AS income,
            COALESCE(SUM(CASE WHEN kind='expense' THEN amount_cents WHEN kind='withdrawal' THEN fee_cents ELSE 0 END),0) AS expense
            FROM movements WHERE created_at>=? AND created_at<?''',
            (start.astimezone(timezone.utc).isoformat(),following.astimezone(timezone.utc).isoformat())).fetchone()
        return {'balance_cents':balances,'income_cents':income,'expense_cents':expense+fees,
                'month_income_cents':monthly['income'],'month_expense_cents':monthly['expense']}

@app.post('/movements', status_code=201)
def add_movement(m: MovementIn):
    with connection() as db:
        try:
            db.execute('BEGIN IMMEDIATE')
            from .finance_dates import financial_timestamp
            occurred_at = financial_timestamp(m.occurred_on)
            if m.request_id:
                import json
                payload=json.dumps(m.model_dump(mode='json'),sort_keys=True)
                prior=db.execute('SELECT * FROM movement_requests WHERE request_id=?',(m.request_id,)).fetchone()
                if prior:
                    if prior['payload']!=payload or not prior['movement_id']:raise HTTPException(409,'Este intento cambió o fue anulado. Revisa el historial.')
                    return {'id':prior['movement_id'],'already_imported':True,'scheduled_id':None}
            if m.gmail_id:
                imported = db.execute('SELECT movement_id FROM gmail_imports WHERE gmail_id=? UNION SELECT movement_id FROM gmail_links WHERE gmail_id=?', (m.gmail_id,m.gmail_id)).fetchone()
                if imported:
                    return {'id': imported['movement_id'], 'message': 'Este correo ya está registrado', 'already_imported': True}
            if m.gmail_id and not m.allow_duplicate:
                from .ledger_routes import expense_matches
                candidates=expense_matches(amount_cents=m.amount_cents,account_id=m.account_id,occurred_on=m.occurred_on,days=3,card_id=m.card_id)
                if candidates:raise HTTPException(409,'Hay un consumo parecido en el historial. Vincula el comprobante a ese movimiento o confirma que es otra compra.')
            if m.recurring_due_date:
                from datetime import date
                try: date.fromisoformat(m.recurring_due_date)
                except ValueError: raise HTTPException(400, 'Fecha de próximo pago inválida')
                if m.kind != 'expense' or m.classification != 'fijo' or m.frequency not in ('mensual', 'semanal', 'anual'):
                    raise HTTPException(400, 'El recordatorio requiere un gasto fijo y una frecuencia válida')
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
            if m.card_id and (m.kind!='expense' or m.recurring_due_date):raise HTTPException(400,'La tarjeta se usa en consumos sin crear un gasto recurrente; programa su deuda desde Mi dinero')
            if not m.card_id and account['balance_cents'] < debit:
                raise HTTPException(400, 'Saldo insuficiente en la cuenta de origen')
            from .ledger_routes import apply_effects
            apply_effects(db,after=m.model_dump())
            cursor = db.execute('''INSERT INTO movements(kind,amount_cents,concept,account_id,destination_id,fee_cents,frequency,classification,category,created_at,card_id)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)''',(m.kind,m.amount_cents,m.concept,m.account_id,m.destination_id,m.fee_cents,m.frequency,m.classification,m.category,occurred_at,m.card_id))
            scheduled_id = None
            if m.recurring_due_date:
                plan = db.execute('INSERT INTO scheduled_payments(name,amount_cents,due_date,frequency,account_id,category,created_at) VALUES(?,?,?,?,?,?,?)',
                    (m.concept, m.amount_cents, m.recurring_due_date, {'mensual':'monthly','semanal':'weekly','anual':'yearly'}[m.frequency], m.account_id, m.category or 'Otros', datetime.now(timezone.utc).isoformat()))
                scheduled_id = plan.lastrowid
            if m.gmail_id:
                db.execute('INSERT INTO gmail_imports(gmail_id,movement_id) VALUES(?,?)', (m.gmail_id, cursor.lastrowid))
                db.execute("INSERT INTO gmail_reviews(gmail_id,status) VALUES(?,'reviewed') ON CONFLICT(gmail_id) DO UPDATE SET status='reviewed'", (m.gmail_id,))
            if m.request_id:db.execute('INSERT INTO movement_requests VALUES(?,?,?)',(m.request_id,cursor.lastrowid,payload))
            db.commit()
            return {'id':cursor.lastrowid,'message':'Registrado','scheduled_id':scheduled_id}
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
        db.execute('BEGIN IMMEDIATE')
        if 'issuer' not in {row['name'] for row in db.execute('PRAGMA table_info(cards)')}:
            db.execute("ALTER TABLE cards ADD COLUMN issuer TEXT NOT NULL DEFAULT 'auto'")

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
    issuer: Literal['auto','bcp','bbva','interbank','scotiabank','falabella','ripley','other'] = 'auto'

class CardUpdate(CardIn):
    expected_debt_cents: int | None = None

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
        return [dict(x) for x in db.execute('SELECT c.*, (SELECT s.id FROM scheduled_payments s WHERE s.card_id=c.id AND s.active=1) AS scheduled_id FROM cards c ORDER BY id DESC')]

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
        db.execute('BEGIN IMMEDIATE')
        old=db.execute('SELECT * FROM cards WHERE id=?',(card_id,)).fetchone()
        if not old:raise HTTPException(404,'Tarjeta no encontrada')
        if card.expected_debt_cents is not None and old['debt_cents']!=card.expected_debt_cents:raise HTTPException(409,'La deuda cambió mientras editabas. Cierra y actualiza antes de guardar.')
        if (old['card_type']!=card.card_type or old['account_id']!=card.account_id) and db.execute('SELECT 1 FROM movements WHERE card_id=? UNION SELECT 1 FROM scheduled_payments WHERE card_id=?',(card_id,card_id)).fetchone():raise HTTPException(409,'Esta tarjeta tiene movimientos o un pago vinculado. Conserva su tipo y cuenta; crea otra tarjeta si cambió.')
        if not db.execute('SELECT 1 FROM accounts WHERE id=?',(card.account_id,)).fetchone():
            raise HTTPException(404,'Cuenta asociada no encontrada')
        fields=card.model_dump(exclude={'expected_debt_cents'})
        cur=db.execute('UPDATE cards SET '+','.join(f'{k}=?' for k in fields)+' WHERE id=?',(*fields.values(),card_id))
        if not cur.rowcount: raise HTTPException(404,'Tarjeta no encontrada')
        db.execute('UPDATE scheduled_payments SET amount_cents=? WHERE card_id=?',(max(1,card.debt_cents),card_id))
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
        CREATE TABLE IF NOT EXISTS payment_receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scheduled_id INTEGER NOT NULL REFERENCES scheduled_payments(id),
            due_date TEXT NOT NULL,
            movement_id INTEGER NOT NULL UNIQUE REFERENCES movements(id),
            UNIQUE(scheduled_id,due_date)
        );
        CREATE TABLE IF NOT EXISTS account_transfers (
            movement_id INTEGER PRIMARY KEY REFERENCES movements(id),
            request_id TEXT NOT NULL UNIQUE
        );
        ''')
        db.execute('BEGIN IMMEDIATE')
        if 'icon' not in {r['name'] for r in db.execute('PRAGMA table_info(savings_goals)')}:
            db.execute("ALTER TABLE savings_goals ADD COLUMN icon TEXT NOT NULL DEFAULT 'other'")

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
    icon: Literal['travel','home','car','study','emergency','phone','gift','other'] = 'other'

class GoalContribution(BaseModel):
    amount_cents: int = Field(gt=0)

@app.get('/scheduled')
def get_scheduled():
    with connection() as db:
        rows = [dict(r) for r in db.execute('''SELECT s.*,
            EXISTS(SELECT 1 FROM payment_receipts p WHERE p.scheduled_id=s.id AND s.frequency='once') AS completed
            FROM scheduled_payments s ORDER BY active DESC,due_date,id''')]
        from .history_routes import next_due, recurrence_anchor
        for row in rows:
            try:
                following = next_due(date.fromisoformat(row['due_date']),row['frequency'],recurrence_anchor(db,row))
                row['next_due_date'] = following.isoformat() if following else None
            except (ValueError,OverflowError): row['next_due_date'] = None
        debts={r['id']:r['debt_cents'] for r in db.execute('SELECT id,debt_cents FROM cards')}
        for row in rows:
            if row.get('card_id'):
                row['amount_cents']=debts.get(row['card_id'],0)
                if not row['amount_cents']:row.update(active=0,completed=1)
        return rows

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
        if db.execute('''SELECT 1 FROM scheduled_payments s JOIN payment_receipts p ON p.scheduled_id=s.id
                         WHERE s.id=? AND s.frequency='once' ''',(item_id,)).fetchone():
            raise HTTPException(400,'Este pago ya se completó. Crea otro si lo necesitas.')
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
        c=db.execute('INSERT INTO savings_goals(name,target_cents,target_date,created_at,icon) VALUES(?,?,?,?,?)',
            (goal.name.strip(),goal.target_cents,goal.target_date.isoformat() if goal.target_date else None,datetime.now(timezone.utc).isoformat(),goal.icon))
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
from .history_routes import router as history_router
app.include_router(history_router)
from .card_reports import router as card_reports_router
app.include_router(card_reports_router)
from .design_routes import router as design_router
app.include_router(design_router)
from .ledger_routes import router as ledger_router
app.include_router(ledger_router)
from .organizer_routes import router as organizer_router
app.include_router(organizer_router)
from .student_routes import router as student_router
app.include_router(student_router)
from .student_calendar import router as student_calendar_router
app.include_router(student_calendar_router)

# One production origin: compiled frontend and authenticated /api routes.
from fastapi.staticfiles import StaticFiles
static_dir = Path(os.environ.get('FINANZAS_STATIC_DIR', str(Path(__file__).resolve().parents[2] / 'frontend/dist')))
if static_dir.is_dir():
    app.mount('/', StaticFiles(directory=static_dir, html=True), name='frontend')
else:
    @app.get('/')
    def missing_frontend():
        raise HTTPException(503, 'Compila el frontend con el script de instalación antes de iniciar la app')
