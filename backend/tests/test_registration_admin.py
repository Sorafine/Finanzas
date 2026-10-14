import secrets
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app import auth, main


class RegistrationAdministration(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.data=Path(self.tmp.name)
        self.data_patch=patch.object(auth,'DATA_DIR',self.data)
        self.public_patch=patch.object(auth,'PUBLIC_URL','')
        self.data_patch.start();self.public_patch.start()
        self.client=TestClient(main.app);self.client.__enter__()
        self.password=secrets.token_urlsafe(20)
        self.owner_id=auth.create_user('owner',self.password)
        auth.grant_admin('owner')
        self.member_id=auth.create_user('member',self.password)
        self.headers=self.login(self.client,'owner')
        self.member=TestClient(main.app)
        self.member_headers=self.login(self.member,'member')

    def tearDown(self):
        self.member.close();self.client.__exit__(None,None,None)
        self.public_patch.stop();self.data_patch.stop();self.tmp.cleanup()

    def login(self,client,name):
        response=client.post('/api/auth/login',json={'username':name,'password':self.password})
        self.assertEqual(response.status_code,200,response.text)
        return {'X-CSRF-Token':response.json()['csrf_token']}

    def settings(self,registration=True,google=True):
        result=self.client.patch('/api/admin/settings',headers=self.headers,json={'registration_enabled':registration,'google_enabled':google})
        self.assertEqual(result.status_code,200)

    def test_registration_creates_a_normal_user_with_private_empty_accounts(self):
        guest=TestClient(main.app)
        try:
            self.assertTrue(guest.get('/api/auth/options').json()['registration_enabled'])
            response=guest.post('/api/auth/register',json={'username':'new-person','password':self.password})
            self.assertEqual(response.status_code,201,response.text)
            self.assertFalse(response.json()['is_admin'])
            self.assertEqual(guest.get('/api/summary').json()['balance_cents'],0)
            self.assertEqual(len(guest.get('/api/accounts').json()),2)
            self.assertEqual(guest.get('/api/admin/overview').status_code,403)
            self.assertEqual(guest.get('/api/google/status').json()['connected'],False)
        finally:guest.close()

    def test_registration_cannot_request_admin_privileges(self):
        guest=TestClient(main.app)
        try:
            for flag in ['is_admin','role','is_active']:
                response=guest.post('/api/auth/register',json={'username':'intruder','password':self.password,flag:True})
                self.assertEqual(response.status_code,422)
            with auth.registry() as db:
                self.assertIsNone(db.execute('SELECT 1 FROM users WHERE username=?',('intruder',)).fetchone())
        finally:guest.close()

    def test_duplicate_or_invalid_registration_preserves_existing_data(self):
        before=set((self.data/'users').glob('*.sqlite3'))
        guest=TestClient(main.app)
        try:
            self.assertEqual(guest.post('/api/auth/register',json={'username':'member','password':self.password}).status_code,400)
            self.assertEqual(guest.post('/api/auth/register',json={'username':'../escape','password':self.password}).status_code,400)
            self.assertEqual(guest.post('/api/auth/register',json={'username':'new-person','password':'short'}).status_code,422)
            self.assertEqual(before,set((self.data/'users').glob('*.sqlite3')))
            self.assertEqual(self.member.get('/api/accounts').status_code,200)
        finally:guest.close()

    def test_owner_can_pause_registration_but_member_cannot_change_settings(self):
        denied=self.member.patch('/api/admin/settings',headers=self.member_headers,json={'registration_enabled':False,'google_enabled':False})
        self.assertEqual(denied.status_code,403)
        self.settings(registration=False)
        self.assertFalse(self.member.get('/api/auth/options').json()['registration_enabled'])
        guest=TestClient(main.app)
        try:self.assertEqual(guest.post('/api/auth/register',json={'username':'blocked','password':self.password}).status_code,403)
        finally:guest.close()
        self.settings()
        self.assertTrue(self.member.get('/api/auth/options').json()['registration_enabled'])

    def test_only_one_admin_and_no_public_promotion(self):
        with self.assertRaises(ValueError):auth.grant_admin('member')
        self.assertTrue(self.client.get('/api/auth/me').json()['is_admin'])
        self.assertFalse(self.member.get('/api/auth/me').json()['is_admin'])
        # Compiled static-file fallback returns405 for an unknown POST; API-only
        # development returns404. Neither exposes a public promotion endpoint.
        self.assertIn(self.member.post('/api/admin/grant',headers=self.member_headers,json={'username':'member'}).status_code,(404,405))
        self.assertFalse(self.member.get('/api/auth/me').json()['is_admin'])

    def test_admin_overview_shows_only_access_and_connection_metadata(self):
        result=self.client.get('/api/admin/overview')
        self.assertEqual(result.status_code,200)
        for user in result.json()['users']:
            self.assertEqual(set(user),{'id','username','created_at','is_active','is_admin','google_connected'})
        self.assertNotIn('password_hash',result.text)
        self.assertNotIn('encrypted',result.text)
        self.assertNotIn('balance_cents',result.text)
        self.assertNotIn('csrf_token',result.text)

    def test_owner_disconnects_selected_user_and_member_cannot_disconnect_others(self):
        fake=MagicMock();fake.to_json.return_value='{"token":"fixture-only"}'
        identity=auth.session_from_cookie(self.member.cookies.get(auth.COOKIE))
        context=auth.current_identity.set(identity)
        try:auth.save_google_token(fake,'fixture-account')
        finally:auth.current_identity.reset(context)
        self.assertTrue(self.member.get('/api/google/status').json()['connected'])
        self.assertEqual(self.member.post(f'/api/admin/users/{self.owner_id}/disconnect-google',headers=self.member_headers).status_code,403)
        self.assertEqual(self.client.post(f'/api/admin/users/{self.member_id}/disconnect-google',headers=self.headers).status_code,200)
        self.assertFalse(self.member.get('/api/google/status').json()['connected'])
        self.assertEqual(self.member.get('/api/accounts').status_code,200)

    def test_pausing_a_user_revokes_sessions_and_keeps_their_data(self):
        account=self.member.post('/api/accounts',headers=self.member_headers,json={'name':'Personal','kind':'cash','opening_cents':3000}).json()
        response=self.client.patch(f'/api/admin/users/{self.member_id}/active',headers=self.headers,json={'is_active':False})
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.member.get('/api/accounts').status_code,401)
        self.assertEqual(self.member.post('/api/auth/login',json={'username':'member','password':self.password}).status_code,401)
        self.client.patch(f'/api/admin/users/{self.member_id}/active',headers=self.headers,json={'is_active':True})
        self.member_headers=self.login(self.member,'member')
        self.assertTrue(any(a['id']==account['id'] and a['balance_cents']==3000 for a in self.member.get('/api/accounts').json()))
        self.assertEqual(self.client.patch(f'/api/admin/users/{self.owner_id}/active',headers=self.headers,json={'is_active':False}).status_code,400)

    def test_google_pause_blocks_operations_but_allows_status_and_disconnect(self):
        self.settings(google=False)
        self.assertFalse(self.member.get('/api/google/status').json()['enabled'])
        self.assertEqual(self.member.get('/api/google/connect').status_code,503)
        self.assertEqual(self.member.get('/api/google/gmail/suggestions').status_code,503)
        self.assertEqual(self.member.post('/api/google/calendar/reminder',headers=self.member_headers,json={'scheduled_id':1}).status_code,503)
        self.assertEqual(self.member.post('/api/google/disconnect',headers=self.member_headers).status_code,200)

    def test_registration_requires_owner_bootstrap_and_limits_repeated_attempts(self):
        with auth.registry() as db:db.execute('UPDATE users SET is_admin=0')
        self.assertFalse(self.client.get('/api/auth/options').json()['registration_enabled'])
        guest=TestClient(main.app)
        try:
            self.assertEqual(guest.post('/api/auth/register',json={'username':'first-admin','password':self.password}).status_code,403)
            auth.grant_admin('owner')
            for _ in range(12):
                self.assertEqual(guest.post('/api/auth/register',json={'username':'member','password':self.password}).status_code,400)
            self.assertEqual(guest.post('/api/auth/register',json={'username':'new-account','password':self.password}).status_code,429)
        finally:guest.close()

    def test_registration_origin_and_admin_csrf_are_enforced(self):
        guest=TestClient(main.app)
        try:self.assertEqual(guest.post('/api/auth/register',headers={'Origin':'https://other.example'},json={'username':'other-person','password':self.password}).status_code,403)
        finally:guest.close()
        self.assertEqual(self.client.patch('/api/admin/settings',json={'registration_enabled':False,'google_enabled':False}).status_code,403)


class ExistingAccountMigration(unittest.TestCase):
    def test_old_user_and_sessions_survive_and_no_admin_is_assigned_automatically(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)
            with closing(sqlite3.connect(path/'auth.sqlite3')) as db:
                db.execute('CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL)')
                db.execute('INSERT INTO users VALUES(?,?,?,?)',('a'*32,'existing','old-password-hash',123))
                db.commit()
            with patch.object(auth,'DATA_DIR',path):
                auth.init_auth_db()
                auth.init_auth_db()
                with auth.registry() as db:
                    row=db.execute('SELECT * FROM users').fetchone()
                    self.assertEqual(row['password_hash'],'old-password-hash')
                    self.assertEqual(row['id'],'a'*32)
                    self.assertEqual(row['is_active'],1)
                    self.assertEqual(row['is_admin'],0)
                auth.grant_admin('existing')
                with auth.registry() as db:self.assertEqual(db.execute('SELECT is_admin FROM users').fetchone()[0],1)


if __name__=='__main__':unittest.main()
