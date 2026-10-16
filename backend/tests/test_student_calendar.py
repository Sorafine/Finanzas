import copy
import json
import secrets
import tempfile
import time
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from fastapi.testclient import TestClient
from googleapiclient.errors import HttpError
from httplib2 import Response
from app import auth, main, student_routes as student, student_calendar as calendar


def not_found():
    return HttpError(Response({'status': '404'}), b'{}')


class Call:
    def __init__(self, run): self.run = run
    def execute(self): return self.run()


class FakeCalendar:
    def __init__(self):
        self.items = {}
        self.calls = []
        self.fail_insert_after = False
        self.fail_delete_after = False
        self.before_patch = None
        self.before_delete = None
    def events(self): return self
    def get(self, **args):
        def run():
            self.calls.append(('get', args['eventId']))
            if args['eventId'] not in self.items: raise not_found()
            return copy.deepcopy(self.items[args['eventId']])
        return Call(run)
    def insert(self, **args):
        def run():
            body = copy.deepcopy(args['body']); event_id = body['id']
            self.calls.append(('insert', event_id))
            if event_id in self.items: raise HttpError(Response({'status':'409'}), b'{}')
            self.items[event_id] = body
            if self.fail_insert_after:
                self.fail_insert_after = False
                raise TimeoutError('response lost')
            return body
        return Call(run)
    def patch(self, **args):
        def run():
            self.calls.append(('patch', args['eventId']))
            if self.before_patch:
                callback, self.before_patch = self.before_patch, None
                callback()
            if args['eventId'] not in self.items: raise not_found()
            self.items[args['eventId']].update(copy.deepcopy(args['body']))
            return copy.deepcopy(self.items[args['eventId']])
        return Call(run)
    def delete(self, **args):
        def run():
            self.calls.append(('delete', args['eventId']))
            if self.before_delete:
                callback, self.before_delete = self.before_delete, None
                callback()
            if args['eventId'] not in self.items: raise not_found()
            del self.items[args['eventId']]
            if self.fail_delete_after:
                self.fail_delete_after = False
                raise TimeoutError('response lost')
            return {}
        return Call(run)


class CalendarSync(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(main, 'DB', Path(self.tmp.name)/'private.sqlite3'); self.db_patch.start()
        main.init_finance_db()
        self.key = 'a'*64; self.connected = True; self.allowed = True
        self.services = {}
        self.account_patch = patch.object(calendar, 'account_info', side_effect=lambda: ({'finanzas_account_key':self.key}, self.key) if self.connected else (None,None)); self.account_patch.start()
        self.allowed_patch = patch.object(calendar, 'setting_enabled', side_effect=lambda _: self.allowed); self.allowed_patch.start()
        self.service_patch = patch.object(calendar, 'calendar_service', side_effect=lambda key:self.services.setdefault(key,FakeCalendar())); self.service_patch.start()
        self.cid = student.add_course(student.CourseIn(title='Cálculo II'))['id']
        self.sid = student.add_class(student.ClassIn(course_id=self.cid,weekday=0,starts='08:00',ends='10:00',room='A-301'))['id']
    def tearDown(self):
        self.service_patch.stop(); self.allowed_patch.stop(); self.account_patch.stop(); self.db_patch.stop(); self.tmp.cleanup()
    def sync(self, enable=False): return calendar.synchronize(calendar.SyncIn(enable=enable))
    def remote(self): return self.services.setdefault(self.key,FakeCalendar())
    def edit(self, **kw):
        return student.edit_class(self.sid, student.ClassIn(course_id=self.cid,weekday=kw.pop('weekday',0),starts=kw.pop('starts','08:00'),ends=kw.pop('ends','10:00'),room=kw.pop('room','A-301'),**kw))

    def test_opt_in_creates_only_classes_with_peru_recurrence_and_stable_id(self):
        self.assertFalse(calendar.status()['enabled']); self.assertEqual(self.services,{})
        before = main.summary()
        result = self.sync(True)
        self.assertEqual((result['synced_count'],result['pending_count']), (1,0))
        event_id = next(iter(self.remote().items)); body = self.remote().items[event_id]
        self.assertEqual(body['summary'],'Clase: Cálculo II')
        self.assertEqual(body['recurrence'], ['RRULE:FREQ=WEEKLY;COUNT=16'])
        self.assertEqual(body['start']['timeZone'],'America/Lima')
        self.assertTrue(body['start']['dateTime'].endswith('T08:00:00-05:00'))
        self.assertEqual(body['location'],'A-301')
        self.assertNotIn('grade',json.dumps(body)); self.assertNotIn('mood',json.dumps(body))
        calls=len(self.remote().calls);self.sync();self.assertEqual(len(self.remote().calls),calls)
        self.assertEqual(main.summary(),before)

    def test_lost_insert_response_retries_without_duplicate(self):
        self.remote().fail_insert_after=True
        result=self.sync(True);self.assertEqual(result['pending_count'],1)
        self.assertTrue(result['last_error']);event_id=next(iter(self.remote().items))
        result=self.sync();self.assertEqual(result['pending_count'],0)
        self.assertEqual(list(self.remote().items),[event_id])
        self.assertEqual(sum(kind=='insert' for kind,_ in self.remote().calls),1)

    def test_class_edit_and_course_rename_update_same_series_and_keep_anchor(self):
        self.sync(True);event_id=next(iter(self.remote().items));first=self.remote().items[event_id]['start']['dateTime'][:10]
        with patch.object(calendar,'datetime') as clock:
            clock.now.return_value=datetime(2027,3,2,12,tzinfo=ZoneInfo('America/Lima'))
            self.edit(starts='09:00',ends='11:00',room='B-204')
        self.assertEqual(list(self.remote().items),[event_id])
        self.assertEqual(self.remote().items[event_id]['start']['dateTime'][:10],first)
        self.assertTrue(self.remote().items[event_id]['start']['dateTime'].endswith('T09:00:00-05:00'))
        student.edit_course(self.cid,student.CourseIn(title='Matemática'))
        self.assertEqual(self.remote().items[event_id]['summary'],'Clase: Matemática')
        self.assertEqual(calendar.status()['pending_count'],0)

    def test_deleted_course_keeps_tombstone_until_remote_removal_confirmed(self):
        self.sync(True);self.remote().items['payment-event']={'summary':'Pagar internet'}
        self.remote().fail_delete_after=True
        result=student.delete_course(self.cid);self.assertTrue(result['calendar_sync']['pending'])
        self.assertEqual(student.classes(),[])
        with main.connection() as db:self.assertIsNone(db.execute('SELECT desired_payload FROM student_calendar_links').fetchone()[0])
        self.sync();self.assertEqual(list(self.remote().items),['payment-event'])
        self.assertEqual(calendar.status()['pending_count'],0)
        with main.connection() as db:self.assertEqual(db.execute('SELECT count(*) FROM student_calendar_links').fetchone()[0],0)

    def test_disconnected_delete_is_queued_and_resume_removes_it(self):
        self.sync(True);service=self.remote();self.connected=False
        result=student.delete_class(self.sid);self.assertTrue(result['calendar_sync']['pending']);self.assertEqual(len(service.items),1)
        self.connected=True;self.sync();self.assertEqual(service.items,{})

    def test_disable_removes_only_managed_events_and_keeps_local_classes(self):
        self.sync(True);self.remote().items['unrelated']={'summary':'Cumpleaños'}
        result=calendar.disable();self.assertFalse(result['enabled']);self.assertEqual(result['pending_count'],0)
        self.assertEqual(len(student.classes()),1);self.assertEqual(list(self.remote().items),['unrelated'])
        self.edit(room='Local only');self.assertEqual(list(self.remote().items),['unrelated'])
        self.sync(True);self.assertEqual(len(self.remote().items),2)

    def test_pause_by_admin_blocks_sync_but_preserves_local_edits(self):
        self.sync(True);event_id=next(iter(self.remote().items));self.allowed=False
        result=self.edit(room='Pending room');self.assertTrue(result['calendar_sync']['pending'])
        self.assertEqual(self.remote().items[event_id]['location'],'A-301')
        with self.assertRaises(HTTPException) as error:self.sync()
        self.assertEqual(error.exception.status_code,503)
        self.allowed=True;self.sync();self.assertEqual(self.remote().items[event_id]['location'],'Pending room')

    def test_account_switch_uses_separate_ids_and_old_account_cleanup(self):
        self.sync(True);old_service=self.remote();old_id=next(iter(old_service.items))
        self.key='b'*64;result=self.sync()
        self.assertEqual(result['other_account_count'],1);new_id=next(iter(self.remote().items));self.assertNotEqual(old_id,new_id)
        self.assertTrue(self.edit(room='New account room')['calendar_sync']['pending'])
        self.assertEqual(old_service.items[old_id]['location'],'A-301')
        calendar.disable();self.assertEqual(self.remote().items,{})
        self.key='a'*64;self.sync();self.assertEqual(old_service.items,{})

    def test_confirmed_cancelled_event_gets_new_stable_id(self):
        self.sync(True);old_id=next(iter(self.remote().items));self.remote().items[old_id]={'status':'cancelled'}
        self.edit(room='Changed')
        active=[key for key,value in self.remote().items.items() if value.get('status')!='cancelled']
        self.assertEqual(len(active),1);self.assertNotEqual(active[0],old_id)
        self.sync();self.assertEqual(len(self.remote().items),2)

    def test_force_sync_reconciles_manual_changes_even_if_locally_clean(self):
        self.sync(True)
        event_id=next(iter(self.remote().items))
        self.remote().items[event_id]['location']='Changed in Google'
        self.assertEqual(calendar.status()['pending_count'],0)
        calendar.synchronize(calendar.SyncIn(force=True))
        self.assertEqual(self.remote().items[event_id]['location'],'A-301')
        del self.remote().items[event_id]
        calendar.synchronize(calendar.SyncIn(force=True))
        self.assertEqual(len(self.remote().items),1)

    def test_no_unrelated_event_is_overwritten_or_deleted(self):
        self.sync(True);event_id=next(iter(self.remote().items));self.remote().items[event_id]={'summary':'Unrelated'}
        self.edit(room='Changed');self.assertEqual(self.remote().items[event_id],{'summary':'Unrelated'})
        result=calendar.disable();self.assertEqual(result['pending_count'],1)
        self.assertEqual(self.remote().items[event_id],{'summary':'Unrelated'})

    def test_edit_during_sync_is_not_marked_clean_until_resent(self):
        self.sync(True)
        with main.connection() as db:db.execute('UPDATE student_classes SET room=? WHERE id=?',('Version A',self.sid))
        def change():
            with main.connection() as db:db.execute('UPDATE student_classes SET room=? WHERE id=?',('Version B',self.sid))
            calendar.stage_changes(self.key)
        self.remote().before_patch=change
        result=self.sync();self.assertEqual(result['pending_count'],1)
        self.sync();self.assertEqual(calendar.status()['pending_count'],0)
        self.assertEqual(next(iter(self.remote().items.values()))['location'],'Version B')

    def test_reenable_during_removal_does_not_falsely_mark_deleted_event_synced(self):
        self.sync(True)
        def reenable():
            with main.connection() as db:db.execute('UPDATE student_calendar_settings SET enabled=1 WHERE id=1')
            calendar.stage_changes(self.key)
        self.remote().before_delete=reenable
        result=calendar.disable();self.assertEqual(result['pending_count'],1)
        self.assertEqual(self.remote().items,{})
        self.sync();self.assertEqual(len(self.remote().items),1)
        self.assertEqual(calendar.status()['pending_count'],0)

    def test_persistent_lease_prevents_parallel_remote_writes(self):
        calendar.stage_changes(self.key)
        with main.connection() as db:
            db.execute('UPDATE student_calendar_settings SET enabled=1,lease_token=?,lease_until=? WHERE id=1',('other',time.time()+90))
        with self.assertRaises(HTTPException) as error:self.sync()
        self.assertEqual(error.exception.status_code,409);self.assertEqual(self.remote().calls,[])

    def test_status_recovers_changes_saved_before_a_crash(self):
        self.sync(True)
        with main.connection() as db:db.execute('UPDATE student_classes SET room=? WHERE id=?',('After restart',self.sid))
        self.assertEqual(calendar.status()['pending_count'],1)
        self.sync();self.assertEqual(next(iter(self.remote().items.values()))['location'],'After restart')


class CalendarPermissions(unittest.TestCase):
    def test_refresh_cannot_replace_new_consent_or_resurrect_disconnected_tokens(self):
        class Credentials:
            def __init__(self,token): self.token=token
            def to_json(self): return json.dumps({'token':self.token,'refresh_token':'fixture-refresh'})
        with tempfile.TemporaryDirectory() as tmp, patch.object(auth,'DATA_DIR',Path(tmp)):
            auth.init_auth_db();uid=auth.create_user('refreshuser',secrets.token_urlsafe(20))
            token=auth.current_identity.set(auth.Identity(uid,'refreshuser','fixture-session','fixture-csrf'))
            try:
                auth.save_google_token(Credentials('first'),'a'*64);previous=auth.google_token()
                auth.save_google_token(Credentials('new-consent'),'b'*64)
                self.assertFalse(auth.save_google_token(Credentials('late-refresh'),'a'*64,previous_info=previous))
                self.assertEqual(auth.google_token()['token'],'new-consent')
                with auth.registry() as db:db.execute('DELETE FROM google_credentials WHERE user_id=?',(uid,))
                self.assertFalse(auth.save_google_token(Credentials('late-refresh'),'a'*64,previous_info=previous))
                self.assertIsNone(auth.google_token())
                auth.save_google_token(Credentials('first'),'a'*64);previous=auth.google_token()
                self.assertTrue(auth.save_google_token(Credentials('fresh'),'a'*64,previous_info=previous))
                self.assertEqual(auth.google_token()['token'],'fresh')
            finally:auth.current_identity.reset(token)

    def test_routes_are_private_csrf_protected_and_bound_to_each_profile(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(auth,'DATA_DIR',Path(tmp)),patch.object(auth,'PUBLIC_URL',''),TestClient(main.app) as client:
            password=secrets.token_urlsafe(20);auth.create_user('alice',password);auth.create_user('bob',password)
            for path,method in [('/api/student/calendar/status','get'),('/api/google/calendar/student/sync','post'),('/api/student/calendar/disable','post')]:
                self.assertEqual(getattr(client,method)(path).status_code,401)
            login=client.post('/api/auth/login',json={'username':'alice','password':password}).json();headers={'X-CSRF-Token':login['csrf_token']}
            self.assertEqual(client.post('/api/student/calendar/disable').status_code,403)
            self.assertEqual(client.post('/api/google/calendar/student/sync',headers=headers,json={'enable':True}).status_code,401)
            self.assertEqual(client.get('/api/student/calendar/status').json()['enabled'],False)
            with patch.object(calendar,'account_info',return_value=({'finanzas_account_key':'a'*64},'a'*64)):
                self.assertEqual(client.post('/api/google/calendar/student/sync',headers=headers,json={'enable':True}).status_code,200)
            with TestClient(main.app) as other:
                other.post('/api/auth/login',json={'username':'bob','password':password})
                self.assertFalse(other.get('/api/student/calendar/status').json()['enabled'])
                self.assertEqual(other.get('/api/student/calendar/status').json()['classes'],[])
            self.assertEqual(client.get('/api/admin/overview').status_code,403)
