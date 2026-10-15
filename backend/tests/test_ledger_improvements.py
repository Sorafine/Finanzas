import secrets
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date,datetime,timedelta
from pathlib import Path
from unittest.mock import MagicMock,patch
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app import main,auth,ledger_routes as ledger,history_routes as history,design_routes as design,card_reports,google_routes as google
from test_gmail_consumptions import message


class LedgerImprovements(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.db_patch=patch.object(main,'DB',Path(self.tmp.name)/'db.sqlite3');self.db_patch.start();main.init_finance_db()
        self.bank=main.add_account(main.AccountIn(name='Banco',kind='bank',opening_cents=100000))['id'];self.cash=main.get_accounts()[1]['id'];self.today=datetime.now(ZoneInfo('America/Lima')).date()
    def tearDown(self):self.db_patch.stop();self.tmp.cleanup()
    def expense(self,**fields):return main.add_movement(main.MovementIn(kind=fields.pop('kind','expense'),account_id=self.bank,amount_cents=fields.pop('amount_cents',1000),concept=fields.pop('concept','Compra'),**fields))
    def row(self,id):
        with main.connection() as db:return dict(db.execute('SELECT * FROM movements WHERE id=?',(id,)).fetchone())
    def balance(self,id=None):return next(a['balance_cents'] for a in main.get_accounts() if a['id']==(id or self.bank))
    def correction(self,id,**values):
        m=self.row(id);return ledger.Correction(expected_revision=m['revision'],reason='Importe corregido',amount_cents=values.pop('amount_cents',m['amount_cents']),concept=m['concept'],account_id=values.pop('account_id',m['account_id']),destination_id=values.pop('destination_id',m['destination_id']),fee_cents=values.pop('fee_cents',m['fee_cents']),category='Comida',occurred_on=self.today,**values)
    def card(self,**fields):return main.add_card(main.CardIn(account_id=self.bank,name='BCP Visa',card_type=fields.pop('card_type','credit'),last_four='1234',credit_limit_cents=fields.pop('credit_limit_cents',10000),debt_cents=fields.pop('debt_cents',0),due_day=fields.pop('due_day',5),**fields))
    def plan(self):return main.add_scheduled(main.ScheduledIn(name='Internet',amount_cents=1000,due_date=self.today,frequency='monthly',account_id=self.bank))
    def void(self,id,revision=1):return ledger.void(id,ledger.VoidIn(expected_revision=revision,reason='Registro equivocado'))
    def test_edit_and_void_reverse_only_the_difference_with_audit(self):
        m=self.expense()['id'];change=self.correction(m,amount_cents=2500);ledger.correct(m,change);self.assertEqual(self.balance(),97500)
        with self.assertRaises(HTTPException) as e:ledger.correct(m,change)
        self.assertEqual(e.exception.status_code,409);self.assertEqual(self.balance(),97500)
        self.void(m,2);self.assertEqual(self.balance(),100000);self.assertEqual([a['action'] for a in ledger.corrections()],['void','edit'])
        self.assertEqual(main.get_movements(),[]);self.assertEqual(main.summary()['expense_cents'],0)
    def test_transfer_edit_moves_both_sides_and_void_preserves_request_tombstone(self):
        req=secrets.token_hex(16);item=design.TransferIn(account_id=self.bank,destination_id=self.cash,amount_cents=5000,fee_cents=20,request_id=req)
        mid=design.transfer(item)['id'];ledger.correct(mid,self.correction(mid,amount_cents=3000,fee_cents=10))
        self.assertEqual((self.balance(),self.balance(self.cash)),(96990,3000));self.void(mid,2);self.assertEqual((self.balance(),self.balance(self.cash)),(100000,0))
        with self.assertRaises(HTTPException):design.transfer(item)
    def test_correction_of_spent_income_is_rejected_and_rolls_back(self):
        income=main.add_movement(main.MovementIn(kind='income',account_id=self.cash,amount_cents=500,concept='Propina'))['id']
        main.add_movement(main.MovementIn(kind='expense',account_id=self.cash,amount_cents=400,concept='Pasaje'))
        with self.assertRaises(HTTPException):self.void(income)
        self.assertEqual(self.balance(self.cash),100);self.assertEqual(ledger.corrections(),[])
    def test_payment_reuse_does_not_debit_and_void_reopens_latest_occurrence(self):
        plan=self.plan();m=self.expense()['id'];receipt=history.pay_scheduled(plan['id'],history.PayIn(due_date=plan['due_date'],account_id=self.bank,amount_cents=1000,existing_movement_id=m))
        self.assertEqual(receipt['id'],m);self.assertEqual(self.balance(),99000)
        self.void(m);self.assertEqual(self.balance(),100000);self.assertEqual(main.get_scheduled()[0]['due_date'],self.today.isoformat())
    def test_cannot_void_earlier_payment_before_later_receipt(self):
        plan=self.plan();first=history.pay_scheduled(plan['id'],history.PayIn(due_date=plan['due_date'],account_id=self.bank,amount_cents=1000))['id']
        second=history.pay_scheduled(plan['id'],history.PayIn(due_date=main.get_scheduled()[0]['due_date'],account_id=self.bank,amount_cents=1000))['id']
        with self.assertRaises(HTTPException):self.void(first)
        self.void(second);self.void(first);self.assertEqual(self.balance(),100000)
    def test_movement_retries_are_idempotent_even_after_void(self):
        item=main.MovementIn(kind='expense',account_id=self.bank,amount_cents=1000,concept='Compra',request_id=secrets.token_hex(16))
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:main.add_movement(item),range(2)))
        self.assertEqual(results[0]['id'],results[1]['id']);self.assertEqual(self.balance(),99000);self.void(results[0]['id'])
        with self.assertRaises(HTTPException):main.add_movement(item)
    def test_credit_consumption_and_payment_never_count_the_purchase_twice(self):
        card=self.card();mid=self.expense(card_id=card['id'],amount_cents=2500)['id'];self.assertEqual(self.balance(),100000);self.assertEqual(main.get_cards()[0]['debt_cents'],2500)
        ledger.correct(mid,self.correction(mid,amount_cents=2000));self.assertEqual(main.get_cards()[0]['debt_cents'],2000)
        paid=ledger.repay(card['id'],ledger.CardPaymentIn(account_id=self.bank,amount_cents=500,request_id=secrets.token_hex(16)))['id']
        self.assertEqual(self.balance(),99500);self.assertEqual(main.get_cards()[0]['debt_cents'],1500);self.assertEqual(main.summary()['expense_cents'],2000)
        self.assertEqual(history.history(page=1,page_size=30,q='',kind='card_payment')['total'],1)
        self.void(paid);self.assertEqual(self.balance(),100000);self.assertEqual(main.get_cards()[0]['debt_cents'],2000)
        self.void(mid,2);self.assertEqual(main.get_cards()[0]['debt_cents'],0)
    def test_debit_consumption_changes_cash_and_two_cards_have_separate_reports(self):
        debit=self.card(card_type='debit',credit_limit_cents=0);credit=self.card();self.expense(card_id=debit['id']);self.expense(card_id=credit['id'],amount_cents=2000)
        self.assertEqual(self.balance(),99000)
        for card,expected in ((debit,1000),(credit,2000)):
            r=card_reports.card_report(card['id'],year=self.today.year,month=self.today.month);self.assertEqual(r['card_activity']['expense_cents'],expected)
    def test_credit_limits_and_overpayment_are_atomic(self):
        c=self.card(debt_cents=9500)
        with self.assertRaises(HTTPException):self.expense(card_id=c['id'])
        with self.assertRaises(HTTPException):ledger.repay(c['id'],ledger.CardPaymentIn(account_id=self.bank,amount_cents=9600,request_id=secrets.token_hex(16)))
        self.assertEqual(self.balance(),100000);self.assertEqual(main.get_cards()[0]['debt_cents'],9500);self.assertEqual(main.get_movements(),[])
    def test_linked_credit_schedule_does_not_double_reserve_or_double_expense(self):
        c=self.card(debt_cents=3000);pid=ledger.schedule_card(c['id'])['id'];self.assertEqual(ledger.schedule_card(c['id'])['id'],pid)
        self.assertEqual(ledger.availability()['available_cents'],97000);self.expense(card_id=c['id']);self.assertEqual(main.get_scheduled()[0]['amount_cents'],4000)
        with self.assertRaises(HTTPException):ledger.repay(c['id'],ledger.CardPaymentIn(account_id=self.bank,amount_cents=1000,request_id=secrets.token_hex(16)))
        p=main.get_scheduled()[0];history.pay_scheduled(pid,history.PayIn(due_date=p['due_date'],account_id=self.bank,amount_cents=4000))
        self.assertEqual(main.get_cards()[0]['debt_cents'],0);self.assertEqual(self.balance(),96000);self.assertEqual(main.summary()['expense_cents'],1000);self.assertEqual(main.get_scheduled()[0]['active'],0)
        self.expense(card_id=c['id']);self.assertEqual(main.get_scheduled()[0]['active'],1)
    def test_gmail_similar_consumption_requires_link_or_explicit_confirmation(self):
        mid=self.expense()['id'];api=MagicMock();api.users.return_value.messages.return_value.get.return_value.execute.return_value=message('Compra aprobada','Importe S/10')
        with patch.object(google,'gmail_key',side_effect=lambda key:'box:'+key),patch.object(google,'credentials',return_value=object()),patch('googleapiclient.discovery.build',return_value=api):
            for key in ('first','second'):
                with self.assertRaises(HTTPException) as e:google.import_expense(google.GmailImportIn(gmail_id=key,account_id=self.bank,amount_cents=1000,concept='Compra'))
                self.assertEqual(e.exception.status_code,409)
                result=google.import_expense(google.GmailImportIn(gmail_id=key,account_id=self.bank,amount_cents=1000,concept='Compra',existing_movement_id=mid));self.assertTrue(result['linked_existing'])
            self.assertEqual(self.balance(),99000);self.assertEqual(len(main.get_movements()),1)
            result=google.import_expense(google.GmailImportIn(gmail_id='third',account_id=self.bank,amount_cents=1000,concept='Otra compra',allow_duplicate=True));self.assertNotEqual(result['id'],mid)
            self.void(mid)
            with main.connection() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM gmail_links').fetchone()[0],0);self.assertEqual(db.execute('SELECT COUNT(*) FROM gmail_reviews').fetchone()[0],3)
    def test_reserving_goals_changes_available_money_without_moving_cash(self):
        goal=main.add_goal(main.GoalIn(name='Viaje',target_cents=10000));main.contribute_goal(goal['id'],main.GoalContribution(amount_cents=2000))
        self.assertEqual(ledger.availability()['available_cents'],100000)
        ledger.reserve_goal(goal['id'],ledger.GoalReserveIn(reserve=True));self.assertEqual(ledger.availability()['available_cents'],98000);self.assertEqual(self.balance(),100000)
        ledger.reserve_goal(goal['id'],ledger.GoalReserveIn(reserve=False));self.assertEqual(ledger.availability()['reserved_cents'],0)
    def test_payment_similar_manual_expense_requires_reconciliation(self):
        self.expense();plan=self.plan()
        with self.assertRaises(HTTPException) as e:history.pay_scheduled(plan['id'],history.PayIn(due_date=plan['due_date'],account_id=self.bank,amount_cents=1000))
        self.assertEqual(e.exception.status_code,409);self.assertEqual(self.balance(),99000)
        history.pay_scheduled(plan['id'],history.PayIn(due_date=plan['due_date'],account_id=self.bank,amount_cents=1000,allow_duplicate=True));self.assertEqual(self.balance(),98000)
    def test_card_edit_cannot_overwrite_concurrent_debt_or_change_ledger_type(self):
        c=self.card();self.expense(card_id=c['id']);fields={k:v for k,v in c.items() if k!='id'}
        with self.assertRaises(HTTPException):main.update_card(c['id'],main.CardUpdate(**fields,expected_debt_cents=0))
        fields.update(card_type='debit',credit_limit_cents=0,debt_cents=0)
        with self.assertRaises(HTTPException):main.update_card(c['id'],main.CardUpdate(**fields))
    def test_credit_due_day_31_survives_a_first_due_date_in_february(self):
        c=self.card(debt_cents=3000,due_day=31);pid=ledger.schedule_card(c['id'])['id']
        with main.connection() as db:db.execute('UPDATE scheduled_payments SET due_date=? WHERE id=?',('2026-02-28',pid))
        self.assertEqual(main.get_scheduled()[0]['next_due_date'],'2026-03-31')
        result=history.pay_scheduled(pid,history.PayIn(due_date='2026-02-28',account_id=self.bank,amount_cents=1000));self.assertEqual(result['next_due_date'],'2026-03-31')
    def test_ordinary_bill_can_reuse_a_debit_or_credit_consumption(self):
        for kind in ('debit','credit'):
            c=self.card(card_type=kind,credit_limit_cents=0 if kind=='debit' else 10000)
            mid=self.expense(card_id=c['id'])['id'];before=self.balance();plan=self.plan()
            found=ledger.expense_matches(amount_cents=1000,account_id=self.bank,occurred_on=self.today,days=31,card_id=None,any_card=True)
            self.assertIn(mid,[m['id'] for m in found])
            history.pay_scheduled(plan['id'],history.PayIn(due_date=plan['due_date'],account_id=self.bank,amount_cents=1000,existing_movement_id=mid))
            self.assertEqual(self.balance(),before)
    def test_migration_is_repeatable_and_does_not_lose_accounts_or_movements(self):
        self.expense();main.init_finance_db();main.init_finance_db();self.assertEqual(self.balance(),99000);self.assertEqual(len(main.get_movements()),1)


class RecoveryAndAccess(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.data_patch=patch.object(auth,'DATA_DIR',Path(self.tmp.name));self.data_patch.start();self.public_patch=patch.object(auth,'PUBLIC_URL','');self.public_patch.start()
        self.client=TestClient(main.app);self.client.__enter__();self.password=secrets.token_urlsafe(20);auth.create_user('owner',self.password);auth.grant_admin('owner');auth.create_user('member',self.password)
        self.csrf=self.client.post('/api/auth/login',json={'username':'owner','password':self.password}).json()['csrf_token'];self.headers={'X-CSRF-Token':self.csrf}
    def tearDown(self):self.client.__exit__(None,None,None);self.public_patch.stop();self.data_patch.stop();self.tmp.cleanup()
    def test_one_time_recovery_code_hash_rotation_sessions_and_disabled_user(self):
        self.assertEqual(self.client.post('/api/auth/security/recovery-code',json={'current_password':self.password}).status_code,403)
        code=self.client.post('/api/auth/security/recovery-code',headers=self.headers,json={'current_password':self.password}).json()['recovery_code']
        with auth.registry() as db:self.assertNotEqual(db.execute("SELECT recovery_hash FROM users WHERE username='owner'").fetchone()[0],code)
        guest=TestClient(main.app);new=secrets.token_urlsafe(20)
        try:
            r=guest.post('/api/auth/recover',json={'username':'owner','password':new,'recovery_code':code});self.assertEqual(r.status_code,200,r.text);self.assertTrue(r.json()['is_admin'])
            self.assertEqual(self.client.get('/api/auth/me').status_code,401)
            self.assertEqual(guest.post('/api/auth/recover',json={'username':'owner','password':self.password,'recovery_code':code}).status_code,401)
        finally:guest.close()
    def test_change_password_requires_current_password_and_invalidates_recovery(self):
        self.client.post('/api/auth/security/recovery-code',headers=self.headers,json={'current_password':self.password})
        new=secrets.token_urlsafe(20)
        self.assertEqual(self.client.post('/api/auth/security/password',headers=self.headers,json={'current_password':'wrong','new_password':new}).status_code,401)
        self.assertEqual(self.client.post('/api/auth/security/password',headers=self.headers,json={'current_password':self.password,'new_password':new}).status_code,200)
        self.assertEqual(self.client.get('/api/auth/me').status_code,401)
        r=self.client.post('/api/auth/login',json={'username':'owner','password':new});self.assertEqual(r.status_code,200)
        self.assertFalse(self.client.get('/api/auth/security').json()['recovery_enabled'])
    def test_new_routes_are_private_and_member_cannot_change_owner_ledger(self):
        guest=TestClient(main.app)
        try:
            for route in ('/api/corrections','/api/availability','/api/expense-matches?amount_cents=1&account_id=1','/api/auth/security'):self.assertEqual(guest.get(route).status_code,401)
            self.client.post('/api/movements',headers=self.headers,json={'kind':'income','amount_cents':1000,'account_id':1,'concept':'Ingreso'})
            csrf=guest.post('/api/auth/login',json={'username':'member','password':self.password}).json()['csrf_token']
            self.assertEqual(guest.post('/api/movements/1/void',headers={'X-CSRF-Token':csrf},json={'expected_revision':1,'reason':'Prueba'}).status_code,404)
            self.assertEqual(self.client.get('/api/summary').json()['balance_cents'],1000)
        finally:guest.close()
    def test_recovery_rate_limit_is_persistent_and_inactive_account_stays_blocked(self):
        code=self.client.post('/api/auth/security/recovery-code',headers=self.headers,json={'current_password':self.password}).json()['recovery_code']
        with auth.registry() as db:db.execute("UPDATE users SET is_active=0 WHERE username='owner'")
        guest=TestClient(main.app)
        try:
            for _ in range(7):self.assertEqual(guest.post('/api/auth/recover',json={'username':'owner','password':self.password,'recovery_code':code}).status_code,401)
            self.assertEqual(guest.post('/api/auth/recover',json={'username':'owner','password':self.password,'recovery_code':code}).status_code,429)
        finally:guest.close()

if __name__=='__main__':unittest.main()
