import hashlib
import json
import secrets
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from app import auth, main, google_routes as google


class PrivateAccess(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = Path(self.tmp.name)
        self.data_patch = patch.object(auth, 'DATA_DIR', self.data)
        self.public_patch = patch.object(auth, 'PUBLIC_URL', '')
        self.data_patch.start()
        self.public_patch.start()
        self.client = TestClient(main.app)
        self.client.__enter__()
        self.password = secrets.token_urlsafe(18)
        self.users = {}
        for name in ('alice', 'bob'):
            user_id = auth.create_user(name, self.password)
            self.users[name] = user_id
            token = auth.current_database.set(auth.user_database(user_id))
            try:
                main.init_finance_db()
            finally:
                auth.current_database.reset(token)
        self.other_clients = []

    def tearDown(self):
        self.client.__exit__(None, None, None)
        for client in self.other_clients:
            client.close()
        self.public_patch.stop()
        self.data_patch.stop()
        self.tmp.cleanup()

    def login(self, name, client=None):
        client = client or self.client
        response = client.post('/api/auth/login', json={'username':name,'password':self.password})
        self.assertEqual(response.status_code, 200, response.text)
        return {'X-CSRF-Token': response.json()['csrf_token']}

    def second_client(self):
        client = TestClient(main.app)
        self.other_clients.append(client)
        return client

    def test_every_financial_route_requires_login(self):
        for path in ('/accounts','/api/accounts','/api/movements','/api/cards','/api/summary','/api/goals','/api/scheduled','/api/reports/export.csv','/api/google/status','/api/auth/me'):
            result = self.client.get(path)
            self.assertEqual(result.status_code, 401, path)
            self.assertEqual(result.headers.get('X-Auth-Required'), '1')
        self.assertEqual(self.client.get('/api/health').status_code, 200)

    def test_users_do_not_share_accounts_balances_or_exports(self):
        a_headers = self.login('alice')
        account = self.client.post('/api/accounts', headers=a_headers, json={'name':'Solo Alice','kind':'bank','opening_cents':5000}).json()
        other = self.second_client()
        b_headers = self.login('bob', other)
        self.assertEqual(other.get('/api/summary').json()['balance_cents'], 0)
        self.assertNotIn('Solo Alice', other.get('/api/accounts').text)
        self.assertEqual(other.patch('/api/accounts/'+str(account['id']), headers=b_headers, json={'name':'Intruso'}).status_code, 404)
        self.assertEqual(other.post('/api/movements', headers=b_headers, json={'kind':'expense','amount_cents':100,'concept':'Intruso','account_id':account['id']}).status_code, 404)
        self.assertNotIn('Solo Alice', other.get('/api/reports/export.csv').text)
        self.assertEqual(self.client.get('/api/summary').json()['balance_cents'], 5000)

    def test_csrf_and_origin_protect_mutations(self):
        headers = self.login('alice')
        payload = {'name':'Cuenta','kind':'cash'}
        self.assertEqual(self.client.post('/api/accounts', json=payload).status_code, 403)
        self.assertEqual(self.client.post('/api/accounts', headers={**headers,'Origin':'https://evil.example'}, json=payload).status_code, 403)
        self.assertEqual(self.client.post('/api/accounts', headers=headers, json=payload).status_code, 201)
        self.assertEqual(self.client.post('/api/auth/login', headers={'Origin':'https://evil.example'}, json={'username':'alice','password':self.password}).status_code, 403)

    def test_local_login_accepts_the_configured_port(self):
        result = self.client.post('/api/auth/login', headers={'Origin':'http://testserver'}, json={'username':'alice','password':self.password})
        self.assertEqual(result.status_code, 200)

    def test_gmail_ids_are_scoped_to_each_google_mailbox(self):
        self.login('alice')
        session = auth.session_from_cookie(self.client.cookies.get(auth.COOKIE))
        token = auth.current_identity.set(session)
        fake = MagicMock()
        fake.to_json.return_value = json.dumps({'token':'fixture-token'})
        try:
            auth.save_google_token(fake, 'first-mailbox')
            first = google.gmail_key('same-id')
            auth.save_google_token(fake, 'second-mailbox')
            second = google.gmail_key('same-id')
            self.assertNotEqual(first, second)
        finally:
            auth.current_identity.reset(token)

    def test_logout_revokes_cookie_and_server_session(self):
        headers = self.login('alice')
        token = self.client.cookies.get(auth.COOKIE)
        self.assertEqual(self.client.post('/api/auth/logout', headers=headers).status_code, 200)
        self.client.cookies.set(auth.COOKIE, token)
        self.assertEqual(self.client.get('/api/accounts').status_code, 401)

    def test_expired_session_is_rejected(self):
        self.login('alice')
        with auth.registry() as db:
            db.execute('UPDATE sessions SET expires_at=0')
        self.assertEqual(self.client.get('/api/accounts').status_code, 401)

    def test_login_rate_limit(self):
        for _ in range(8):
            self.assertEqual(self.client.post('/api/auth/login', json={'username':'alice','password':'incorrect'}).status_code, 401)
        result = self.client.post('/api/auth/login', json={'username':'alice','password':self.password})
        self.assertEqual(result.status_code, 429)
        self.assertIn('Retry-After', result.headers)

    def test_public_cookie_is_secure_and_credentials_are_not_returned(self):
        with patch.object(auth, 'PUBLIC_URL', 'https://finance.example'):
            client = TestClient(main.app, base_url='https://finance.example')
            self.other_clients.append(client)
            self.login('alice', client)
            cookie = client.cookies.get(auth.COOKIE)
            self.assertIsNotNone(cookie)
            result = client.post('/api/auth/login',json={'username':'alice','password':self.password})
            self.assertIn('Secure', result.headers['set-cookie'])
            self.assertIn('HttpOnly', result.headers['set-cookie'])
            self.assertIn('SameSite=lax', result.headers['set-cookie'])
            self.assertNotIn('password', result.text)
        with auth.registry() as db:
            self.assertNotIn(self.password, db.execute('SELECT password_hash FROM users LIMIT 1').fetchone()[0])

    def test_google_tokens_are_encrypted_isolated_and_survive_new_client(self):
        self.login('alice')
        fake = MagicMock()
        fake.to_json.return_value = json.dumps({'token':'fixture-google-token','refresh_token':'fixture-refresh'})
        token = auth.current_identity.set(auth.session_from_cookie(self.client.cookies.get(auth.COOKIE)))
        try:
            auth.save_google_token(fake)
            self.assertEqual(auth.google_token()['token'], 'fixture-google-token')
        finally:
            auth.current_identity.reset(token)
        self.assertNotIn(b'fixture-google-token', (self.data/'auth.sqlite3').read_bytes())
        other = self.second_client()
        self.login('bob', other)
        self.assertFalse(other.get('/api/google/status').json()['connected'])
        new_client = self.second_client()
        self.login('alice', new_client)
        self.assertTrue(new_client.get('/api/google/status').json()['connected'])

    def test_oauth_state_is_bound_to_user_session_and_consumed_once(self):
        self.login('alice')
        session = auth.session_from_cookie(self.client.cookies.get(auth.COOKIE))
        state = secrets.token_urlsafe(32)
        with auth.registry() as db:
            db.execute('INSERT INTO oauth_states VALUES(?,?,?,?,?)', (hashlib.sha256(state.encode()).hexdigest(),session.user_id,session.session_hash,auth.cipher().encrypt(b'verifier').decode(),int(time.time())+600))
        other = self.second_client()
        self.login('bob', other)
        self.assertEqual(other.get('/api/google/callback',params={'state':state,'error':'access_denied'}).status_code, 400)
        result = self.client.get('/api/google/callback',params={'state':state,'error':'access_denied'},follow_redirects=False)
        self.assertEqual(result.status_code, 307)
        self.assertIn('google=cancelled', result.headers['location'])
        self.assertEqual(self.client.get('/api/google/callback',params={'state':state,'error':'access_denied'}).status_code, 400)

    def test_username_cannot_escape_data_folder(self):
        with self.assertRaises(ValueError):
            auth.create_user('../other-user', self.password)
        with self.assertRaises(ValueError):
            auth.user_database('../outside')


if __name__ == '__main__':
    unittest.main()
