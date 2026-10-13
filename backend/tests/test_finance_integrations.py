import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException
from googleapiclient.errors import HttpError
from httplib2 import Response
from app import main, google_routes as google


class FinanceIntegrations(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(main, 'DB', Path(self.tmp.name) / 'test.db')
        self.db_patch.start()
        main.init_finance_db()
        self.account = main.add_account(main.AccountIn(name='Pruebas', kind='bank', opening_cents=10000))

    def tearDown(self):
        self.db_patch.stop()
        self.tmp.cleanup()

    def movement(self, **extra):
        return main.MovementIn(kind='expense', amount_cents=1000, concept='Internet', account_id=self.account['id'], **extra)

    def plan(self, frequency='monthly', due='2026-10-31'):
        return main.add_scheduled(main.ScheduledIn(name='Internet', amount_cents=1000, due_date=due, account_id=self.account['id'], frequency=frequency))

    def test_fixed_expense_creates_next_payment_atomically(self):
        result = main.add_movement(self.movement(classification='fijo', frequency='mensual', recurring_due_date='2026-11-13'))
        self.assertIsNotNone(result['scheduled_id'])
        self.assertEqual(main.get_scheduled()[0]['frequency'], 'monthly')
        self.assertEqual(main.get_accounts()[-1]['balance_cents'], 9000)

    def test_invalid_fixed_payment_rolls_back(self):
        with self.assertRaises(HTTPException):
            main.add_movement(self.movement(classification='fijo', frequency='mensual', recurring_due_date='invalid'))
        self.assertEqual(main.get_scheduled(), [])
        self.assertEqual(main.get_movements(), [])
        self.assertEqual(main.get_accounts()[-1]['balance_cents'], 10000)

    def test_concurrent_gmail_confirmation_debits_only_once(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: main.add_movement(self.movement(gmail_id='same-message')), range(2)))
        self.assertEqual(len(main.get_movements()), 1)
        self.assertEqual(main.get_accounts()[-1]['balance_cents'], 9000)
        self.assertEqual(results[0]['id'], results[1]['id'])
        self.assertTrue(any(r.get('already_imported') for r in results))

    def test_failed_gmail_import_can_be_retried(self):
        with self.assertRaises(HTTPException):
            main.add_movement(main.MovementIn(kind='expense', amount_cents=20000, concept='Compra', account_id=self.account['id'], gmail_id='retry'))
        result = main.add_movement(self.movement(gmail_id='retry'))
        self.assertFalse(result.get('already_imported', False))
        self.assertEqual(main.get_accounts()[-1]['balance_cents'], 9000)

    def test_gmail_endpoint_requires_connection(self):
        with self.assertRaises(HTTPException) as error:
            google.import_expense(google.GmailImportIn(gmail_id='x', account_id=self.account['id'], amount_cents=100, concept='Compra'))
        self.assertEqual(error.exception.status_code, 401)

    def test_currency_formats(self):
        for value, expected in [('1,234.56',123456),('1.234,56',123456),('12,50',1250),('12.50',1250),('1,234',123400),('1.234',123400),('0',None),('bad',None)]:
            self.assertEqual(google.parse_amount(value), expected, value)

    def test_calendar_monthly_recurrence_and_retry(self):
        plan = self.plan()
        events = MagicMock()
        events.update.return_value.execute.side_effect = [HttpError(Response({'status':'404'}), b'{}'), {'id':'existing'}]
        events.insert.return_value.execute.side_effect = lambda: {'id': events.insert.call_args.kwargs['body']['id']}
        service = MagicMock()
        service.events.return_value = events
        with patch.object(google,'credentials',return_value=object()), patch('googleapiclient.discovery.build',return_value=service):
            google.reminder(google.ReminderIn(scheduled_id=plan['id']))
            first_id = events.insert.call_args.kwargs['body']['id']
            google.reminder(google.ReminderIn(scheduled_id=plan['id']))
        self.assertEqual(events.insert.call_count, 1)
        self.assertEqual(events.update.call_args.kwargs['eventId'], first_id)
        body = events.insert.call_args.kwargs['body']
        self.assertEqual(body['recurrence'], ['RRULE:FREQ=MONTHLY;BYMONTHDAY=31,-1;BYSETPOS=1'])
        self.assertEqual(body['end']['date'], '2026-11-01')

    def test_once_event_has_no_recurrence(self):
        plan = self.plan('once')
        service = MagicMock()
        service.events.return_value.update.return_value.execute.return_value = {'id':'once'}
        with patch.object(google,'credentials',return_value=object()), patch('googleapiclient.discovery.build',return_value=service):
            google.reminder(google.ReminderIn(scheduled_id=plan['id']))
        self.assertNotIn('recurrence', service.events.return_value.update.call_args.kwargs['body'])

    def test_calendar_paused_payment_is_rejected(self):
        plan = self.plan()
        main.toggle_scheduled(plan['id'])
        with self.assertRaises(HTTPException) as error:
            google.reminder(google.ReminderIn(scheduled_id=plan['id']))
        self.assertEqual(error.exception.status_code, 400)

    def test_remove_calendar_series(self):
        plan = self.plan()
        with main.connection() as db:
            db.execute('INSERT INTO calendar_events VALUES (?,?)', (plan['id'],'event-id'))
        service = MagicMock()
        with patch.object(google,'credentials',return_value=object()), patch('googleapiclient.discovery.build',return_value=service):
            google.remove_reminder(plan['id'])
        service.events.return_value.delete.assert_called_once_with(calendarId='primary',eventId='event-id')
        with main.connection() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM calendar_events').fetchone()[0],0)


if __name__ == '__main__':
    unittest.main()
