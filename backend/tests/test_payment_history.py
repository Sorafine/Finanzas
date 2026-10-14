import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
from app import main, history_routes as history


class PaymentHistory(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patch = patch.object(main,'DB',Path(self.tmp.name)/'finance.db')
        self.patch.start(); main.init_finance_db()
        self.account = main.add_account(main.AccountIn(name='Banco',kind='bank',opening_cents=50000))

    def tearDown(self):
        self.patch.stop(); self.tmp.cleanup()

    def plan(self,frequency='monthly',due='2026-01-31'):
        return main.add_scheduled(main.ScheduledIn(name='Internet',amount_cents=1000,due_date=due,frequency=frequency,account_id=self.account['id']))

    def pay(self,plan,amount=1000,account=None):
        return history.pay_scheduled(plan['id'],history.PayIn(due_date=plan['due_date'],account_id=account or self.account['id'],amount_cents=amount))

    def search(self,**kwargs):
        return history.history(page=kwargs.pop('page',1),page_size=kwargs.pop('page_size',30),q=kwargs.pop('q',''),**kwargs)

    def balance(self):
        return main.get_accounts()[-1]['balance_cents']

    def test_pay_updates_balance_receipt_and_next_occurrence(self):
        p=self.plan(); result=self.pay(p,1250)
        self.assertEqual(self.balance(),48750)
        self.assertEqual(result['next_due_date'],'2026-02-28')
        h=self.search(kind='payment')['items'][0]
        self.assertEqual((h['source'],h['payment_due_date'],h['amount_cents']),('payment','2026-01-31',1250))
        self.assertEqual(main.summary()['expense_cents'],1250)
        self.assertEqual(main.get_scheduled()[0]['amount_cents'],1000)

    def test_concurrent_retry_only_debits_once(self):
        p=self.plan()
        with ThreadPoolExecutor(max_workers=2) as pool:
            result=list(pool.map(lambda _:self.pay(p),range(2)))
        self.assertEqual(self.balance(),49000)
        self.assertEqual(self.search(kind='payment')['total'],1)
        self.assertEqual(result[0]['id'],result[1]['id'])
        self.assertTrue(any(r['already_paid'] for r in result))

    def test_month_end_anchor_survives_february(self):
        self.pay(self.plan()); self.pay(main.get_scheduled()[0])
        self.assertEqual(main.get_scheduled()[0]['due_date'],'2026-03-31')
        self.assertEqual(self.search(kind='payment')['total'],2)

    def test_weekly_and_leap_year_recurrence(self):
        self.assertEqual(history.next_due(date(2026,12,28),'weekly',date(2026,12,28)),date(2027,1,4))
        self.assertEqual(history.next_due(date(2024,2,29),'yearly',date(2024,2,29)),date(2025,2,28))
        self.assertEqual(history.next_due(date(2027,2,28),'yearly',date(2024,2,29)),date(2028,2,29))

    def test_once_completed_cannot_be_reactivated_or_paid_twice(self):
        p=self.plan('once');self.pay(p)
        updated=main.get_scheduled()[0]
        self.assertEqual((updated['active'],updated['completed']),(0,1))
        self.assertTrue(self.pay(p)['already_paid'])
        with self.assertRaises(HTTPException):main.toggle_scheduled(p['id'])
        self.assertEqual(self.balance(),49000)

    def test_failure_does_not_mutate_balance_or_due_date(self):
        p=self.plan()
        for amount,account in ((50001,self.account['id']),(1000,9999)):
            with self.assertRaises(HTTPException):self.pay(p,amount,account)
        self.assertEqual(self.balance(),50000)
        self.assertEqual(main.get_scheduled()[0]['due_date'],p['due_date'])
        self.assertEqual(self.search()['total'],0)
        main.toggle_scheduled(p['id'])
        with self.assertRaises(HTTPException):self.pay(p)

    def test_stale_occurrence_rejected(self):
        p=self.plan();p['due_date']='2026-02-01'
        with self.assertRaises(HTTPException) as error:self.pay(p)
        self.assertEqual(error.exception.status_code,409)
        self.assertEqual(self.balance(),50000)

    def test_history_pages_include_older_than_previous_150_limit(self):
        for i in range(165):
            main.add_movement(main.MovementIn(kind='income',amount_cents=100,concept=f'Sueldo {i}',account_id=self.account['id']))
        first=self.search();last=self.search(page=6)
        self.assertEqual((first['total'],len(first['items']),len(last['items'])),(165,30,15))
        self.assertEqual(last['items'][-1]['concept'],'Sueldo 0')
        self.assertEqual(last['totals']['income_cents'],16500)

    def test_filter_amounts_source_and_literal_search(self):
        self.pay(self.plan());main.add_movement(main.MovementIn(kind='income',amount_cents=100,concept='100% premio_',account_id=self.account['id']))
        self.assertEqual(self.search(q='%')['total'],1)
        self.assertEqual(self.search(q='_')['total'],1)
        self.assertEqual(self.search(q='premio',kind='expense')['total'],0)
        self.assertEqual(self.search(kind='payment')['totals']['expense_cents'],1000)
        cash=main.get_accounts()[1]
        main.add_movement(main.MovementIn(kind='withdrawal',amount_cents=500,fee_cents=10,concept='Cajero',account_id=self.account['id'],destination_id=cash['id']))
        h=self.search(account_id=cash['id'])
        self.assertEqual((h['total'],h['totals']['expense_cents']),(1,10))
        self.assertEqual(h['items'][0]['destination_name'],'Mi efectivo')

    def test_peru_date_boundaries(self):
        m=main.add_movement(main.MovementIn(kind='income',amount_cents=100,concept='Noche',account_id=self.account['id']))
        with main.connection() as db:db.execute('UPDATE movements SET created_at=? WHERE id=?',('2026-10-15T04:59:00+00:00',m['id']))
        self.assertEqual(self.search(date_from=date(2026,10,14),date_to=date(2026,10,14))['total'],1)
        self.assertEqual(self.search(date_from=date(2026,10,15))['total'],0)
        with self.assertRaises(HTTPException):self.search(date_from=date(2026,10,15),date_to=date(2026,10,14))

    def test_initialization_preserves_existing_history(self):
        p=self.plan();self.pay(p);main.init_finance_db();main.init_finance_db()
        self.assertEqual(self.search(kind='payment')['total'],1)
        self.assertEqual(self.balance(),49000)



    def test_calendar_resync_keeps_original_month_end(self):
        from unittest.mock import MagicMock
        from app import google_routes as google
        plan=self.plan();self.pay(plan)
        service=MagicMock()
        service.events.return_value.update.return_value.execute.return_value={'id':'stable'}
        with patch.object(google,'credentials',return_value=object()), patch('googleapiclient.discovery.build',return_value=service):
            google.reminder(google.ReminderIn(scheduled_id=plan['id']))
        body=service.events.return_value.update.call_args.kwargs['body']
        self.assertEqual(body['start']['date'],'2026-02-28')
        self.assertEqual(body['recurrence'],['RRULE:FREQ=MONTHLY;BYMONTHDAY=31,-1;BYSETPOS=1'])



class PrivatePaymentAPI(unittest.TestCase):
    def test_existing_profile_upgrade_and_private_payment_requests(self):
        import secrets
        from fastapi.testclient import TestClient
        from app import auth
        with tempfile.TemporaryDirectory() as temporary, patch.object(auth,'DATA_DIR',Path(temporary)), patch.object(auth,'PUBLIC_URL',''):
            auth.init_auth_db();password=secrets.token_urlsafe(20)
            owner=auth.create_user('owner',password);auth.create_user('member',password)
            context=auth.current_database.set(auth.user_database(owner))
            try:
                a=main.add_account(main.AccountIn(name='Privado',kind='bank',opening_cents=5000))
                plan=main.add_scheduled(main.ScheduledIn(name='Internet privado',amount_cents=500,due_date='2026-10-14',frequency='once',account_id=a['id']))
                with main.connection() as db:db.execute('DROP TABLE payment_receipts')
            finally:auth.current_database.reset(context)
            with TestClient(main.app) as client, TestClient(main.app) as member:
                self.assertEqual(client.get('/api/history').status_code,401)
                headers={'X-CSRF-Token':client.post('/api/auth/login',json={'username':'owner','password':password}).json()['csrf_token']}
                other={'X-CSRF-Token':member.post('/api/auth/login',json={'username':'member','password':password}).json()['csrf_token']}
                payload={'due_date':plan['due_date'],'account_id':a['id'],'amount_cents':500}
                self.assertEqual(client.post(f'/api/scheduled/{plan["id"]}/pay',json=payload).status_code,403)
                self.assertEqual(member.post(f'/api/scheduled/{plan["id"]}/pay',json=payload,headers=other).status_code,404)
                result=client.post(f'/api/scheduled/{plan["id"]}/pay',json=payload,headers=headers)
                self.assertEqual(result.status_code,200,result.text)
                self.assertEqual(client.get('/api/history?kind=payment').json()['total'],1)
                self.assertEqual(member.get('/api/history').json()['total'],0)
                self.assertEqual(client.get('/api/history?page_size=1000').status_code,422)
                self.assertEqual(client.get('/api/history?page=0').status_code,422)
                self.assertEqual(client.get('/api/history?kind=bad').status_code,422)
                self.assertEqual(client.post(f'/api/scheduled/{plan["id"]}/pay',json={**payload,'amount_cents':0},headers=headers).status_code,422)

if __name__=='__main__':unittest.main()
