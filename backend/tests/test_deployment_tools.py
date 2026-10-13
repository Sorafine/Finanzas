import importlib.util
from pathlib import Path
import secrets
import sqlite3
import tempfile
import unittest
from contextlib import closing
from unittest.mock import patch

from app import auth, main

path = Path(__file__).resolve().parents[2] / 'scripts/manage.py'
spec = importlib.util.spec_from_file_location('finanzas_manage', path)
manage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manage)


class DeploymentTools(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.source = self.base / 'source'
        self.auth_patch = patch.object(auth, 'DATA_DIR', self.source)
        self.manage_patch = patch.object(manage, 'DATA', self.source)
        self.auth_patch.start()
        self.manage_patch.start()
        auth.init_auth_db()
        self.password = secrets.token_urlsafe(18)
        self.user = auth.create_user('test-user', self.password)
        token = auth.current_database.set(auth.user_database(self.user))
        try:
            main.init_finance_db()
            main.add_account(main.AccountIn(name='Cuenta respaldada',kind='bank',opening_cents=12345))
        finally:
            auth.current_database.reset(token)
        self.output = self.base / 'encrypted.backup'

    def tearDown(self):
        self.manage_patch.stop()
        self.auth_patch.stop()
        self.tmp.cleanup()

    def test_encrypted_backup_and_restore_preserve_accounts_and_key(self):
        with patch.object(manage.getpass, 'getpass', side_effect=[self.password,self.password]):
            manage.backup(str(self.output))
        content = self.output.read_bytes()
        self.assertTrue(content.startswith(b'FINANZAS1'))
        self.assertNotIn(b'Cuenta respaldada', content)
        target = self.base / 'restore'
        with patch.object(manage, 'DATA', target), patch.object(manage.getpass, 'getpass', return_value=self.password):
            manage.restore(str(self.output))
        self.assertEqual((self.source/'token.key').read_bytes(), (target/'token.key').read_bytes())
        with closing(sqlite3.connect(target/'users'/f'{self.user}.sqlite3')) as db:
            self.assertEqual(db.execute('SELECT balance_cents FROM accounts WHERE name=?',('Cuenta respaldada',)).fetchone()[0],12345)
        with closing(sqlite3.connect(target/'auth.sqlite3')) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0],0)

    def test_wrong_backup_password_cannot_write_data(self):
        with patch.object(manage.getpass,'getpass',side_effect=[self.password,self.password]):
            manage.backup(str(self.output))
        target = self.base/'invalid'
        with patch.object(manage,'DATA',target),patch.object(manage.getpass,'getpass',return_value='wrong-password'):
            with self.assertRaises(ValueError):
                manage.restore(str(self.output))
        self.assertFalse(target.exists())

    def test_restore_never_overwrites_existing_installation(self):
        with self.assertRaises(ValueError):
            manage.restore('nonexistent.backup')
        self.assertTrue((self.source/'token.key').exists())

    def test_cli_creates_an_independent_empty_profile(self):
        with patch.object(manage.getpass,'getpass',side_effect=[self.password,self.password]):
            manage.add_user('new-person')
        with auth.registry() as db:
            user = db.execute('SELECT id FROM users WHERE username=?',('new-person',)).fetchone()[0]
        with closing(sqlite3.connect(self.source/'users'/f'{user}.sqlite3')) as db:
            self.assertEqual(db.execute('SELECT SUM(balance_cents) FROM accounts').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM movements').fetchone()[0],0)

    def test_cli_password_reset_revokes_existing_sessions(self):
        with auth.registry() as db:
            db.execute('INSERT INTO sessions VALUES(?,?,?,?)',('fixture-session',self.user,'fixture-csrf',9999999999))
        password = secrets.token_urlsafe(18)
        with patch.object(manage.getpass,'getpass',side_effect=[password,password]):
            manage.reset_password('test-user')
        with auth.registry() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0],0)
            encoded=db.execute('SELECT password_hash FROM users WHERE id=?',(self.user,)).fetchone()[0]
            self.assertTrue(auth.password_matches(password,encoded))
            self.assertFalse(auth.password_matches(self.password,encoded))

    def test_tunnel_preflight_refuses_another_running_service(self):
        import socket
        with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as service:
            service.bind(('127.0.0.1',0))
            service.listen()
            with self.assertRaises(ValueError):
                manage.ensure_free_port(service.getsockname()[1])

    def test_server_binds_only_loopback_and_disables_sensitive_access_logs(self):
        command = manage.server_command(8787)
        self.assertEqual(command[command.index('--host')+1], '127.0.0.1')
        self.assertIn('--no-access-log', command)
        self.assertIn('--no-proxy-headers', command)


if __name__ == '__main__':
    unittest.main()
