import secrets
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app import main, auth, card_reports as reports


class CardReports(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.patch=patch.object(main,'DB',Path(self.tmp.name)/'finance.db');self.patch.start();main.init_finance_db()
        self.account=main.add_account(main.AccountIn(name='BCP Ahorros',kind='bank',opening_cents=20000))
    def tearDown(self):self.patch.stop();self.tmp.cleanup()
    def card(self,**fields):return main.add_card(main.CardIn(account_id=self.account['id'],name='Visa principal',card_type='credit',last_four='1234',credit_limit_cents=100000,debt_cents=25000,closing_day=20,due_day=5,**fields))
    def report(self,card,**fields):return reports.card_report(card['id'],year=fields.get('year',2026),month=fields.get('month',10))
    def movement(self,kind='expense',**fields):
        m=main.add_movement(main.MovementIn(kind=kind,account_id=self.account['id'],amount_cents=1000,concept='Almuerzo',category='Comida',**fields))
        with main.connection() as db:db.execute('UPDATE movements SET created_at=? WHERE id=?',('2026-10-14T12:00:00+00:00',m['id']))
        return m
    def test_credit_snapshot_is_separate_from_account_activity(self):
        c=self.card();self.movement();self.movement('income');r=self.report(c)
        self.assertEqual(r['issuer'],'bcp')
        self.assertEqual((r['credit']['debt_cents'],r['credit']['available_cents'],r['credit']['used_percent']),(25000,75000,25.0))
        self.assertEqual((r['account_activity']['expense_cents'],r['account_activity']['income_cents']),(1000,1000))
        self.assertEqual(main.get_cards()[0]['debt_cents'],25000)
        self.assertEqual(r['categories'],[{'category':'Comida','amount_cents':1000}])
    def test_issuer_detection_manual_override_and_unknown_fallback(self):
        for name,account,expected in [('Crédito BCP','Otro','bcp'),('Visa','Banco de Crédito','bcp'),('BCPlatinum','Otro','other'),('BBVA Visa','Otro','bbva'),('BBVA Visa','BCP Ahorros','bbva'),('Visa CMR','Otro','falabella'),('Mastercard','Scotiabank','scotiabank'),('Interbank Oro','Otro','interbank'),('Ripley','Otro','ripley'),('Sin banco','Cuenta','other')]:self.assertEqual(reports.detect_issuer(name,account),expected)
        c=self.card(issuer='bbva');self.assertEqual(self.report(c)['issuer'],'bbva')
        c['issuer']='other';main.update_card(c['id'],main.CardUpdate(**{k:v for k,v in c.items() if k!='id'}))
        self.assertEqual(self.report(c)['issuer'],'other')
    def test_debit_report_has_no_credit_and_no_shared_card_attribution(self):
        c=main.add_card(main.CardIn(account_id=self.account['id'],name='Débito',card_type='debit',last_four='1234'));other=self.card();self.movement()
        r=self.report(c);r2=self.report(other);self.assertIsNone(r['credit']);self.assertEqual(r['account_activity'],r2['account_activity'])
        self.assertEqual(r['account']['balance_cents'],19000);self.assertEqual(r['account_activity']['expense_count'],1)
    def test_peru_dates_period_and_withdrawal_fees(self):
        c=self.card();m=self.movement()
        with main.connection() as db:db.execute('UPDATE movements SET created_at=? WHERE id=?',('2026-11-01T04:59:00+00:00',m['id']))
        self.assertEqual(self.report(c)['account_activity']['expense_cents'],1000);self.assertEqual(self.report(c,month=11)['account_activity']['expense_cents'],0)
        cash=main.get_accounts()[1];self.movement('withdrawal',destination_id=cash['id'],fee_cents=20);r=self.report(c)
        self.assertEqual(r['account_activity']['expense_count'],1)
        self.assertEqual((r['account_activity']['withdrawal_cents'],r['account_activity']['fee_cents']),(1000,20));self.assertEqual(r['monthly'][9]['expense_cents'],1020)
    def test_empty_credit_limit_and_unknown_card(self):
        c=main.add_card(main.CardIn(account_id=self.account['id'],name='Sin límite',card_type='credit',last_four='1234'));r=self.report(c)
        self.assertIsNone(r['credit']['used_percent']);self.assertEqual(r['categories'],[]);self.assertEqual(r['account_activity']['expense_count'],0)
        with self.assertRaises(HTTPException):reports.card_report(999,year=2026,month=10)
    def test_next_dates_clip_month_end_and_roll_over(self):
        from datetime import date
        self.assertEqual(reports.next_calendar_day(date(2026,2,10),31),'2026-02-28');self.assertEqual(reports.next_calendar_day(date(2026,12,20),5),'2027-01-05')
        self.assertEqual(reports.next_calendar_day(date(2026,10,14),14),'2026-10-14');self.assertIsNone(reports.next_calendar_day(date(2026,10,14),None))
    def test_existing_card_migration_preserves_data(self):
        c=self.card()
        with main.connection() as db:db.execute('ALTER TABLE cards DROP COLUMN issuer')
        main.init_cards();main.init_cards();restored=main.get_cards()[0]
        self.assertEqual(restored['issuer'],'auto');self.assertEqual((restored['id'],restored['debt_cents'],restored['last_four']),(c['id'],25000,'1234'))


class PrivateCardAPI(unittest.TestCase):
    def test_report_requires_session_and_cannot_read_another_profile(self):
        with tempfile.TemporaryDirectory() as temporary,patch.object(auth,'DATA_DIR',Path(temporary)),patch.object(auth,'PUBLIC_URL',''):
            auth.init_auth_db();password=secrets.token_urlsafe(20);auth.create_user('owner',password);auth.create_user('member',password)
            with TestClient(main.app) as owner,TestClient(main.app) as member:
                self.assertEqual(owner.get('/api/cards/1/report').status_code,401)
                csrf=owner.post('/api/auth/login',json={'username':'owner','password':password}).json()['csrf_token'];member.post('/api/auth/login',json={'username':'member','password':password})
                response=owner.post('/api/cards',headers={'X-CSRF-Token':csrf},json={'account_id':1,'name':'BCP Oro','card_type':'credit','last_four':'1234','issuer':'bcp'})
                self.assertEqual(response.status_code,201,response.text);c=response.json()
                self.assertEqual(owner.get(f'/api/cards/{c["id"]}/report').status_code,200);self.assertEqual(member.get(f'/api/cards/{c["id"]}/report').status_code,404)
                for query in ('month=0','month=13','year=9999'):self.assertEqual(owner.get(f'/api/cards/{c["id"]}/report?{query}').status_code,422)
                body={'account_id':1,'name':'Otro','card_type':'debit','last_four':'1234','issuer':'https://invalid.example/image.svg'}
                self.assertEqual(owner.post('/api/cards',headers={'X-CSRF-Token':csrf},json=body).status_code,422)


if __name__=='__main__':unittest.main()
