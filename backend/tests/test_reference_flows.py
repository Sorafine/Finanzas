import secrets
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app import main, auth, design_routes as design, history_routes as history
from app.finance_dates import financial_timestamp


class ReferenceFlows(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.db=patch.object(main,'DB',Path(self.tmp.name)/'db.sqlite3');self.db.start();main.init_finance_db()
        self.bank=main.add_account(main.AccountIn(name='Banco',kind='bank',opening_cents=20000));self.cash=main.get_accounts()[1]
    def tearDown(self):self.db.stop();self.tmp.cleanup()
    def item(self,**values):return design.TransferIn(account_id=values.pop('account_id',self.bank['id']),destination_id=values.pop('destination_id',self.cash['id']),amount_cents=values.pop('amount_cents',1000),request_id=values.pop('request_id',secrets.token_hex(16)),**values)
    def search(self,**args):return history.history(page=1,page_size=100,q='',**args)
    def test_transfer_preserves_total_except_fee_and_cash_can_return_to_bank(self):
        before=main.summary();design.transfer(self.item(fee_cents=25))
        after=main.summary();self.assertEqual(after['balance_cents'],before['balance_cents']-25);self.assertEqual(after['expense_cents'],25)
        design.transfer(self.item(account_id=self.cash['id'],destination_id=self.bank['id'],amount_cents=500))
        self.assertEqual(main.get_accounts()[1]['balance_cents'],500)
        h=self.search(kind='transfer');self.assertEqual(h['total'],2);self.assertEqual(h['items'][0]['kind'],'transfer');self.assertEqual(h['totals']['expense_cents'],25)
    def test_concurrent_transfer_retry_is_idempotent(self):
        item=self.item()
        with ThreadPoolExecutor(max_workers=2) as pool:result=list(pool.map(lambda _:design.transfer(item),range(2)))
        self.assertEqual(result[0]['id'],result[1]['id']);self.assertTrue(any(r['already_transferred'] for r in result));self.assertEqual(self.search()['total'],1)
        with self.assertRaises(HTTPException) as e:design.transfer(self.item(request_id=item.request_id,amount_cents=2000))
        self.assertEqual(e.exception.status_code,409)
    def test_invalid_transfer_rolls_back_both_accounts(self):
        for item in [self.item(amount_cents=20001),self.item(destination_id=999),self.item(destination_id=self.bank['id'])]:
            with self.assertRaises(HTTPException):design.transfer(item)
        self.assertEqual(main.summary()['balance_cents'],20000);self.assertEqual(self.search()['total'],0)
    def test_backdate_and_future_rejection(self):
        from zoneinfo import ZoneInfo
        from datetime import datetime
        today=datetime.now(ZoneInfo('America/Lima')).date();yesterday=today-timedelta(days=1)
        main.add_movement(main.MovementIn(kind='expense',amount_cents=100,concept='Ayer',account_id=self.bank['id'],occurred_on=yesterday))
        h=self.search(date_from=yesterday,date_to=yesterday);self.assertEqual(h['total'],1)
        for action in [lambda:financial_timestamp(today+timedelta(days=1)),lambda:design.transfer(self.item(occurred_on=today+timedelta(days=1)))]:
            with self.assertRaises(HTTPException):action()
        self.assertEqual(main.summary()['balance_cents'],19900)
    def test_csv_uses_same_filters_and_escapes_formula_text(self):
        main.add_movement(main.MovementIn(kind='income',amount_cents=100,concept='=formula',account_id=self.bank['id']))
        main.add_movement(main.MovementIn(kind='expense',amount_cents=500,concept='Almuerzo',account_id=self.bank['id']))
        exported=self.search(kind='income',format='csv').body.decode()
        self.assertIn("'=formula",exported);self.assertNotIn('Almuerzo',exported);self.assertIn('Fecha (Perú)',exported)
    def test_goal_icon_migration_and_recurrence_preview(self):
        goal=main.add_goal(main.GoalIn(name='Viaje',target_cents=10000,icon='travel'));self.assertEqual(goal['icon'],'travel')
        with main.connection() as db:db.execute('ALTER TABLE savings_goals DROP COLUMN icon')
        main.init_finance_db();self.assertEqual(main.get_goals()[0]['name'],'Viaje');self.assertEqual(main.get_goals()[0]['icon'],'other')
        p=main.add_scheduled(main.ScheduledIn(name='Internet',amount_cents=1000,due_date='2026-01-31',frequency='monthly',account_id=self.bank['id']))
        self.assertEqual(main.get_scheduled()[0]['next_due_date'],'2026-02-28')
        history.pay_scheduled(p['id'],history.PayIn(due_date=p['due_date'],account_id=self.bank['id'],amount_cents=1000))
        self.assertEqual(main.get_scheduled()[0]['next_due_date'],'2026-03-31')
    def test_rolling_reports_cross_year_and_exclude_transferred_principal(self):
        self.assertEqual(design.month_offset(date(2026,1,1),-1),date(2025,12,1))
        design.transfer(self.item(fee_cents=20));r=design.insights(months=6)
        self.assertEqual(len(r['monthly']),6);self.assertEqual(r['current']['expense_cents'],20);self.assertIsNone(r['margin_percent'])


class ReferenceAPI(unittest.TestCase):
    def test_transfer_and_export_are_private_and_validate_periods(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(auth,'DATA_DIR',Path(tmp)),patch.object(auth,'PUBLIC_URL',''):
            auth.init_auth_db();password=secrets.token_urlsafe(20);auth.create_user('owner',password);auth.create_user('member',password)
            with TestClient(main.app) as owner,TestClient(main.app) as member:
                self.assertEqual(owner.get('/api/history?format=csv').status_code,401)
                csrf=owner.post('/api/auth/login',json={'username':'owner','password':password}).json()['csrf_token'];member.post('/api/auth/login',json={'username':'member','password':password})
                owner.post('/api/movements',headers={'X-CSRF-Token':csrf},json={'kind':'income','amount_cents':1000,'account_id':1,'concept':'Sueldo'})
                body={'account_id':1,'destination_id':2,'amount_cents':100,'request_id':secrets.token_hex(16)}
                self.assertEqual(owner.post('/api/transfers',json=body).status_code,403)
                self.assertEqual(owner.post('/api/transfers',json=body,headers={'X-CSRF-Token':csrf}).status_code,201)
                self.assertEqual(member.get('/api/history?kind=transfer').json()['total'],0)
                exported=owner.get('/api/history?format=csv&kind=transfer');self.assertEqual(exported.status_code,200);self.assertIn('Transferencia',exported.text);self.assertNotIn('Sueldo',exported.text)
                for n in (3,6,12):self.assertEqual(owner.get(f'/api/insights?months={n}').status_code,200)
                self.assertEqual(owner.get('/api/insights?months=13').status_code,422)


if __name__=='__main__':unittest.main()
