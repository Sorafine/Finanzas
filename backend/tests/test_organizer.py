import secrets
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from app import auth, main, organizer_routes as organizer


class OrganizerFlows(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data_patch = patch.object(auth, 'DATA_DIR', Path(self.tmp.name))
        self.url_patch = patch.object(auth, 'PUBLIC_URL', '')
        self.data_patch.start()
        self.url_patch.start()
        self.client = TestClient(main.app).__enter__()
        self.password = secrets.token_urlsafe(20)
        self.uid = auth.create_user('student', self.password)
        self.headers = self.login(self.client, 'student')

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.url_patch.stop()
        self.data_patch.stop()
        self.tmp.cleanup()

    def login(self, client, name):
        response = client.post('/api/auth/login', json={'username': name, 'password': self.password})
        self.assertEqual(response.status_code, 200, response.text)
        return {'X-CSRF-Token': response.json()['csrf_token']}

    def post(self, path, data):
        response = self.client.post('/api/organizer/' + path, headers=self.headers, json=data)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()['id']

    def overview(self):
        response = self.client.get('/api/organizer')
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_task_lifecycle_keeps_financial_data_unchanged(self):
        before = self.client.get('/api/summary').json()
        task = self.post('tasks', {'title': '  Estudiar álgebra  ', 'area': 'study', 'due_on': '2026-11-05', 'priority': 'high'})
        row = self.overview()['tasks'][0]
        self.assertEqual((row['title'], row['due_on'], row['completed']), ('Estudiar álgebra', '2026-11-05', 0))
        url = f'/api/organizer/tasks/{task}'
        response = self.client.put(url, headers=self.headers, json={'title': 'Repasar matemática', 'area': 'personal', 'due_on': None})
        self.assertEqual(response.status_code, 200)
        self.client.patch(url, headers=self.headers, json={'completed': True}).raise_for_status()
        self.assertEqual(self.overview()['tasks'][0]['completed'], 1)
        self.client.patch(url, headers=self.headers, json={'completed': False}).raise_for_status()
        row = self.overview()['tasks'][0]
        self.assertEqual((row['title'], row['completed'], row['due_on']), ('Repasar matemática', 0, None))
        self.assertEqual(self.client.delete(url, headers=self.headers).status_code, 200)
        self.assertEqual(self.overview()['tasks'], [])
        self.assertEqual(self.client.get('/api/summary').json(), before)

    def test_habit_rollover_retry_undo_and_cascade(self):
        habit = self.post('habits', {'title': 'Leer 15 minutos'})
        url = f'/api/organizer/habits/{habit}'
        with patch.object(organizer, 'today_in_peru', return_value=date(2026, 10, 14)):
            for _ in range(2):
                self.client.patch(url, headers=self.headers, json={'completed': True}).raise_for_status()
            self.assertEqual(self.overview()['habits'][0]['days'], ['2026-10-14'])
        with patch.object(organizer, 'today_in_peru', return_value=date(2026, 10, 15)):
            overview = self.overview()
            self.assertEqual(overview['today'], '2026-10-15')
            self.assertEqual(overview['week'], [f'2026-10-{i:02d}' for i in range(9, 16)])
            self.client.patch(url, headers=self.headers, json={'completed': True}).raise_for_status()
            self.client.patch(url, headers=self.headers, json={'completed': False}).raise_for_status()
            self.assertEqual(self.overview()['habits'][0]['days'], ['2026-10-14'])
        self.client.put(url, headers=self.headers, json={'title': 'Leer un capítulo'}).raise_for_status()
        self.assertEqual(self.overview()['habits'][0]['title'], 'Leer un capítulo')
        self.client.delete(url, headers=self.headers).raise_for_status()
        token = auth.current_database.set(auth.user_database(self.uid))
        try:
            with main.connection() as db:
                self.assertEqual(db.execute('SELECT count(*) FROM personal_habit_days').fetchone()[0], 0)
        finally:
            auth.current_database.reset(token)

    def test_peru_date_at_utc_midnight(self):
        instant = datetime(2026, 10, 15, 0, 30, tzinfo=timezone.utc)
        with patch.object(organizer, 'datetime') as clock:
            clock.now.side_effect = lambda zone: instant.astimezone(zone)
            self.assertEqual(organizer.today_in_peru(), date(2026, 10, 14))

    def test_validation_and_unknown_records(self):
        for body in ({'title': '   '}, {'title': 'x' * 151}, {'title': 'Examen', 'area': 'unknown'}, {'title': 'Examen', 'due_on': '1999-01-01'}, {'title': 'Examen', 'due_on': '2026-02-30'}, {'title': 'Examen', 'user_id': 'other'}):
            self.assertEqual(self.client.post('/api/organizer/tasks', headers=self.headers, json=body).status_code, 422)
        self.assertEqual(self.client.post('/api/organizer/habits', headers=self.headers, json={'title': '  '}).status_code, 422)
        for kind in ('tasks', 'habits'):
            self.assertEqual(self.client.patch(f'/api/organizer/{kind}/999', headers=self.headers, json={'completed': True}).status_code, 404)
            self.assertEqual(self.client.delete(f'/api/organizer/{kind}/999', headers=self.headers).status_code, 404)
            self.assertEqual(self.client.patch(f'/api/organizer/{kind}/999', headers=self.headers, json={'completed': 'false'}).status_code, 422)
        self.assertEqual(self.overview()['tasks'], [])

    def test_private_profiles_and_csrf(self):
        task = self.post('tasks', {'title': 'Tarea privada'})
        habit = self.post('habits', {'title': 'Rutina privada'})
        auth.create_user('other', self.password)
        with TestClient(main.app) as other:
            self.assertEqual(other.get('/api/organizer').status_code, 401)
            self.assertEqual(other.post('/api/organizer/tasks', json={'title': 'Intruso'}).status_code, 401)
            headers = self.login(other, 'other')
            self.assertEqual(other.get('/api/organizer').json()['tasks'], [])
            self.assertEqual(other.get('/api/organizer').json()['habits'], [])
            for kind, item_id in (('tasks', task), ('habits', habit)):
                url = f'/api/organizer/{kind}/{item_id}'
                self.assertEqual(other.patch(url, headers=headers, json={'completed': True}).status_code, 404)
                self.assertEqual(other.put(url, headers=headers, json={'title': 'Intruso'}).status_code, 404)
                self.assertEqual(other.delete(url, headers=headers).status_code, 404)
        self.assertEqual(self.client.patch(f'/api/organizer/tasks/{task}', json={'completed': True}).status_code, 403)
        self.assertEqual(self.client.get('/api/admin/overview').status_code, 403)
        self.assertEqual(self.overview()['tasks'][0]['title'], 'Tarea privada')

    def test_additive_upgrade_and_new_login_keep_existing_records(self):
        self.post('tasks', {'title': 'Examen pendiente', 'area': 'study'})
        self.post('habits', {'title': 'Preparar mochila'})
        token = auth.current_database.set(auth.user_database(self.uid))
        try:
            for _ in range(2):
                main.init_finance_db()
        finally:
            auth.current_database.reset(token)
        self.client.post('/api/auth/logout', headers=self.headers).raise_for_status()
        self.headers = self.login(self.client, 'student')
        self.assertEqual(self.overview()['tasks'][0]['title'], 'Examen pendiente')
        self.assertEqual(self.overview()['habits'][0]['title'], 'Preparar mochila')


if __name__ == '__main__':
    unittest.main()
