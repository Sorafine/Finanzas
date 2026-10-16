import secrets
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from fastapi import HTTPException
from app import auth, main, student_routes as student


class GradeCalculations(unittest.TestCase):
    def calculate(self, weights, grades, rounding='half_up_integer', passing=11, maximum=20):
        return student.grade_projection({'maximum': maximum, 'passing': passing, 'rounding': rounding},
                                        [{'weight': w, 'grade': g} for w, g in zip(weights, grades)])

    def test_weighted_needed_uses_10_5_target_and_ceiling(self):
        result = self.calculate([20, 20, 30, 30], [14, 12, None, None])
        self.assertEqual(result['average'], 13)
        self.assertEqual(result['earned_points'], 5.2)
        self.assertEqual(result['required_average'], 8.84)
        self.assertEqual(result['evaluated_weight'], 40)
        self.assertEqual(self.calculate([20, 20, 60], [14, 12, None], rounding='none')['required_average'], 9.67)

    def test_exact_rounding_boundary_applies_only_at_final(self):
        for grade, status, final in [(10.49, 'failed', 10), (10.5, 'passed', 11), (10.51, 'passed', 11)]:
            with self.subTest(grade=grade):
                result = self.calculate([100], [grade])
                self.assertEqual((result['status'], result['final_grade']), (status, final))
        self.assertEqual(self.calculate([50, 50], [10.49, 10.5])['status'], 'failed')
        self.assertEqual(self.calculate([100], [10.99], rounding='none')['status'], 'failed')

    def test_zero_is_evaluated_and_blank_is_pending(self):
        result = self.calculate([50, 50], [0, None])
        self.assertEqual(result['evaluated_weight'], 50)
        self.assertEqual(result['average'], 0)
        self.assertEqual(result['required_average'], 21)
        self.assertEqual(result['status'], 'unreachable')
        self.assertEqual(self.calculate([50, 50], [None, None])['status'], 'no_grades')

    def test_risk_recovery_secured_and_unreachable(self):
        self.assertEqual(self.calculate([25, 75], [9, None])['status'], 'at_risk')
        self.assertEqual(self.calculate([25, 75], [9, None])['required_average'], 11)
        self.assertEqual(self.calculate([75, 25], [14, None])['status'], 'secured')
        self.assertEqual(self.calculate([80, 20], [5, None])['status'], 'unreachable')
        self.assertEqual(self.calculate([80, 20], [5, None])['maximum_final'], 8)

    def test_incomplete_plan_never_claims_pass_or_forecasts(self):
        for weights, grades in [([], []), ([40], [20]), ([33.33, 33.33], [10, 15])]:
            result = self.calculate(weights, grades)
            self.assertEqual(result['status'], 'incomplete_plan')
            self.assertIsNone(result['required_average'])
        self.assertNotEqual(self.calculate([33.33, 33.33, 33.34], [10, 15, None])['status'], 'incomplete_plan')

    def test_other_scale(self):
        result = self.calculate([50, 50], [60, None], maximum=100, passing=70, rounding='none')
        self.assertEqual(result['required_average'], 80)
        self.assertEqual(result['status'], 'at_risk')


class StudentWorkspace(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data_patch = patch.object(auth, 'DATA_DIR', Path(self.tmp.name))
        self.url_patch = patch.object(auth, 'PUBLIC_URL', '')
        self.data_patch.start(); self.url_patch.start()
        self.client = TestClient(main.app).__enter__()
        self.password = secrets.token_urlsafe(20)
        self.uid = auth.create_user('student', self.password)
        self.headers = self.login(self.client, 'student')

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.url_patch.stop(); self.data_patch.stop(); self.tmp.cleanup()

    def login(self, client, name):
        r = client.post('/api/auth/login', json={'username': name, 'password': self.password})
        self.assertEqual(r.status_code, 200, r.text)
        return {'X-CSRF-Token': r.json()['csrf_token']}

    def post(self, path, body):
        r = self.client.post('/api/student' + path, headers=self.headers, json=body)
        self.assertEqual(r.status_code, 201 if path != '/timer' else 200, r.text)
        return r.json()

    def course(self, **kw):
        return self.post('/courses', {'title': 'Cálculo II', **kw})['id']

    def test_course_assessments_rules_and_atomic_validation(self):
        cid = self.course()
        course = self.client.get('/api/student/courses').json()[0]
        self.assertEqual((course['maximum'], course['passing'], course['rounding']), (20, 11, 'half_up_integer'))
        aid = self.post(f'/courses/{cid}/assessments', {'title': 'PC', 'weight': 40, 'grade': 12})['id']
        self.post(f'/courses/{cid}/assessments', {'title': 'Final', 'weight': 60})
        course = self.client.get('/api/student/courses').json()[0]
        self.assertEqual(course['projection']['required_average'], 9.5)
        self.assertEqual(self.client.post(f'/api/student/courses/{cid}/assessments', headers=self.headers, json={'title': 'Extra', 'weight': 1}).status_code, 400)
        self.assertEqual(self.client.put(f'/api/student/courses/{cid}/assessments/{aid}', headers=self.headers, json={'title': 'PC', 'weight': 40, 'grade': 21}).status_code, 400)
        self.assertEqual(self.client.put(f'/api/student/courses/{cid}', headers=self.headers, json={'title': 'Cambio', 'maximum': 10, 'passing': 6}).status_code, 400)
        self.assertEqual(self.client.get('/api/student/courses').json()[0]['title'], 'Cálculo II')
        self.assertEqual(self.client.delete(f'/api/student/courses/{cid}/assessments/{aid}', headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get('/api/student/courses').json()[0]['projection']['status'], 'incomplete_plan')

    def test_task_link_deleting_course_preserves_tasks_and_sessions(self):
        cid = self.course()
        task = self.client.post('/api/organizer/tasks', headers=self.headers, json={'title': 'Entrega', 'course_id': cid}).json()['id']
        self.post('/classes', {'course_id': cid, 'weekday': 0, 'starts': '08:00', 'ends': '10:00'})
        self.post('/focus/sessions', {'course_id': cid, 'minutes': 25, 'request_id': secrets.token_hex(16)})
        row = self.client.get('/api/organizer').json()['tasks'][0]
        self.assertEqual((row['id'], row['course_title']), (task, 'Cálculo II'))
        self.client.delete(f'/api/student/courses/{cid}', headers=self.headers).raise_for_status()
        self.assertEqual(self.client.get('/api/student/classes').json(), [])
        row = self.client.get('/api/organizer').json()['tasks'][0]
        self.assertIsNone(row['course_id'])
        self.assertIsNone(self.client.get('/api/student/focus').json()['sessions'][0]['course_id'])

    def test_concurrent_scale_and_grade_changes_keep_valid_grades(self):
        cid = self.course()
        aid = self.post(f'/courses/{cid}/assessments', {'title': 'Examen', 'weight': 100, 'grade': 8})['id']
        def change(action):
            token = auth.current_database.set(auth.user_database(self.uid))
            try:
                if action == 'scale':
                    student.edit_course(cid, student.CourseIn(title='Cálculo II', maximum=10, passing=6))
                else:
                    student.edit_assessment(cid, aid, student.AssessmentIn(title='Examen', weight=100, grade=15))
                return 200
            except HTTPException as error:
                return error.status_code
            finally:
                auth.current_database.reset(token)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(change, ('scale', 'grade')))
        self.assertEqual(sorted(results), [200, 400])
        row = self.client.get('/api/student/courses').json()[0]
        self.assertLessEqual(row['assessments'][0]['grade'], row['maximum'])

    def test_schedule_validation_conflicts_and_adjacent_classes(self):
        cid = self.course()
        first = self.post('/classes', {'course_id': cid, 'weekday': 0, 'starts': '08:00', 'ends': '10:00'})['id']
        body = {'course_id': cid, 'weekday': 0, 'starts': '09:00', 'ends': '11:00'}
        self.assertEqual(self.client.post('/api/student/classes', headers=self.headers, json=body).status_code, 409)
        self.post('/classes', {**body, 'starts': '10:00'})
        self.assertEqual(self.client.put(f'/api/student/classes/{first}', headers=self.headers, json={**body, 'starts': '08:00', 'ends': '10:00'}).status_code, 200)
        for values in [{'starts': '25:00'}, {'ends': '07:00'}, {'weekday': 7}]:
            self.assertEqual(self.client.post('/api/student/classes', headers=self.headers, json={**body, **values}).status_code, 422)

    def test_mood_sleep_and_peru_week_boundaries(self):
        cid = self.course()
        self.post('/classes', {'course_id': cid, 'weekday': 4, 'starts': '06:00', 'ends': '08:00'})
        prefs = {'sleep_hours': 8, 'preparation_minutes': 60, 'wake_time': '07:00'}
        self.client.put('/api/student/preferences', headers=self.headers, json=prefs).raise_for_status()
        with patch.object(student, 'today_in_peru', return_value=date(2026, 10, 15)):
            for mood in (2, 4):
                self.client.put('/api/student/mood', headers=self.headers, json={'mood': mood}).raise_for_status()
            data = self.client.get('/api/student/wellbeing').json()
            self.assertEqual(data['moods'], [{'day': '2026-10-15', 'mood': 4}])
            self.assertEqual(data['wake_at'], '2026-10-16T05:00:00-05:00')
            self.assertEqual(data['bedtime'], '2026-10-15T21:00:00-05:00')
            self.client.delete('/api/student/mood', headers=self.headers).raise_for_status()
            self.assertEqual(self.client.get('/api/student/wellbeing').json()['moods'], [])
        for mood in (0, 6, '3'):
            self.assertEqual(self.client.put('/api/student/mood', headers=self.headers, json={'mood': mood}).status_code, 422)

    def test_focus_manual_retry_and_weekly_filter(self):
        cid = self.course()
        body = {'course_id': cid, 'minutes': 25, 'request_id': secrets.token_hex(16)}
        with patch.object(student, 'today_in_peru', return_value=date(2026, 10, 11)):
            self.post('/focus/sessions', {**body, 'request_id': secrets.token_hex(16)})
        with patch.object(student, 'today_in_peru', return_value=date(2026, 10, 12)):
            first = self.post('/focus/sessions', body)
            self.assertEqual(self.post('/focus/sessions', body), first)
            data = self.client.get('/api/student/focus').json()
            self.assertEqual(len(data['sessions']), 1)
            self.assertEqual(data['sessions'][0]['minutes'], 25)
            self.assertEqual(self.client.post('/api/student/focus/sessions', headers=self.headers, json={**body, 'minutes': 30}).status_code, 409)
            self.client.delete('/api/student/focus/sessions/'+str(first['id']), headers=self.headers).raise_for_status()
            self.assertEqual(self.client.get('/api/student/focus').json()['sessions'], [])

    def test_timer_pause_resume_reset_and_single_completion(self):
        instant = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
        with patch.object(student, 'datetime') as clock:
            clock.now.return_value = instant
            token = self.client.get('/api/student/focus').json()['timer']['token']
            self.post('/timer', {'action': 'start', 'token': token})
            clock.now.return_value = instant + timedelta(seconds=100)
            paused = self.post('/timer', {'action': 'pause', 'token': token})
            self.assertEqual(paused['remaining'], 1400)
            self.assertIsNone(paused['running_since'])
            clock.now.return_value = instant + timedelta(seconds=200)
            self.assertEqual(self.client.get('/api/student/focus').json()['timer']['remaining'], 1400)
            self.post('/timer', {'action': 'start', 'token': token})
            self.assertEqual(self.client.post('/api/student/timer', headers=self.headers, json={'action': 'log', 'token': token}).status_code, 400)
            clock.now.return_value = instant + timedelta(seconds=1600)
            for _ in range(2):
                self.assertTrue(self.post('/timer', {'action': 'log', 'token': token})['logged'])
            self.assertEqual(len(self.client.get('/api/student/focus').json()['sessions']), 1)
            reset = self.post('/timer', {'action': 'reset', 'token': token, 'minutes': 5})
            self.assertNotEqual(reset['token'], token)
            self.assertEqual(self.client.post('/api/student/timer', headers=self.headers, json={'action': 'start', 'token': token}).status_code, 409)
            self.post('/timer', {'action': 'start', 'token': reset['token'], 'minutes': 5})
            clock.now.return_value = instant + timedelta(seconds=1901)
            self.assertEqual(self.client.post('/api/student/timer', headers=self.headers, json={'action': 'log', 'token': reset['token']}).status_code, 400)

    def test_all_student_data_is_private_and_csrf_protected(self):
        cid = self.course()
        aid = self.post(f'/courses/{cid}/assessments', {'title': 'Examen privado', 'weight': 100})['id']
        class_id = self.post('/classes', {'course_id': cid, 'weekday': 0, 'starts': '08:00', 'ends': '10:00'})['id']
        auth.create_user('other', self.password)
        with TestClient(main.app) as other:
            for path in ('courses', 'classes', 'wellbeing', 'focus'):
                self.assertEqual(other.get('/api/student/'+path).status_code, 401)
            headers = self.login(other, 'other')
            self.assertEqual(other.get('/api/student/courses').json(), [])
            self.assertEqual(other.get('/api/student/classes').json(), [])
            for path in (f'/courses/{cid}', f'/courses/{cid}/assessments/{aid}', f'/classes/{class_id}'):
                self.assertEqual(other.delete('/api/student'+path, headers=headers).status_code, 404)
            self.assertEqual(other.post('/api/organizer/tasks', headers=headers, json={'title': 'Intruso', 'course_id': cid}).status_code, 404)
        self.assertEqual(self.client.post('/api/student/courses', json={'title': 'Sin CSRF'}).status_code, 403)
        self.assertEqual(self.client.get('/api/admin/overview').status_code, 403)
        self.assertEqual(self.client.get('/api/student/courses').json()[0]['title'], 'Cálculo II')

    def test_migrations_and_student_actions_do_not_change_finances(self):
        before = self.client.get('/api/summary').json()
        cid = self.course()
        self.post('/focus/sessions', {'minutes': 25, 'request_id': secrets.token_hex(16)})
        token = auth.current_database.set(auth.user_database(self.uid))
        try:
            main.init_finance_db(); main.init_finance_db()
        finally:
            auth.current_database.reset(token)
        self.assertEqual(self.client.get('/api/student/courses').json()[0]['id'], cid)
        self.assertEqual(len(self.client.get('/api/student/focus').json()['sessions']), 1)
        self.assertEqual(self.client.get('/api/summary').json(), before)


if __name__ == '__main__':
    unittest.main()
