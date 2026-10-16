"""Opt-in, per-account timetable sync with durable IDs and a retry queue."""
import json
import os
import re
import time
from datetime import date, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from .main import connection
from .auth import google_token, save_google_token, setting_enabled

router = APIRouter(tags=['Calendar académico'])
PERU = ZoneInfo('America/Lima')


def init_student_calendar(db):
    db.executescript('''
        CREATE TABLE IF NOT EXISTS student_calendar_settings (
            id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0,
            lease_token TEXT, lease_until REAL NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO student_calendar_settings(id) VALUES(1);
        CREATE TABLE IF NOT EXISTS student_calendar_links (
            account_key TEXT NOT NULL, class_id INTEGER NOT NULL,
            event_id TEXT NOT NULL UNIQUE, first_week TEXT NOT NULL,
            desired_payload TEXT, synced_payload TEXT, error TEXT,
            PRIMARY KEY(account_key,class_id)
        );
    ''')


def account_info():
    info = google_token()
    key = info.get('finanzas_account_key') if info else None
    return info, key if isinstance(key, str) and re.fullmatch(r'[0-9a-f]{64}', key) else None


def initial_week(item):
    now = datetime.now(PERU)
    first = now.date() + timedelta(days=(item['weekday'] - now.weekday()) % 7)
    if first == now.date() and now.strftime('%H:%M') >= item['ends']:
        first += timedelta(days=7)
    return (first - timedelta(days=first.weekday())).isoformat()


def payload(item, first_week):
    first = date.fromisoformat(first_week) + timedelta(days=item['weekday'])
    return json.dumps({
        'summary': 'Clase: ' + item['course_title'],
        'location': item['room'],
        'description': 'Clase del horario de Balance. Los cambios se administran desde Balance. Serie de 16 sesiones semanales.',
        'start': {'dateTime': first.isoformat() + 'T' + item['starts'] + ':00-05:00', 'timeZone': 'America/Lima'},
        'end': {'dateTime': first.isoformat() + 'T' + item['ends'] + ':00-05:00', 'timeZone': 'America/Lima'},
        'recurrence': ['RRULE:FREQ=WEEKLY;COUNT=16'],
    }, sort_keys=True, ensure_ascii=False)


def stage_changes(key):
    """Reconcile from source rows, also recovering a crash after a local save."""
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        enabled = bool(db.execute('SELECT enabled FROM student_calendar_settings WHERE id=1').fetchone()[0])
        items = {r['id']: dict(r) for r in db.execute('''SELECT s.*,c.title AS course_title FROM student_classes s
            JOIN student_courses c ON c.id=s.course_id''')}
        links = list(db.execute('SELECT * FROM student_calendar_links'))
        for link in links:
            item = items.get(link['class_id'])
            desired = payload(item, link['first_week']) if enabled and item and (not key or link['account_key'] == key) else None
            if desired != link['desired_payload']:
                db.execute('UPDATE student_calendar_links SET desired_payload=?,error=NULL WHERE account_key=? AND class_id=?',
                           (desired, link['account_key'], link['class_id']))
        if enabled and key:
            for item in items.values():
                week = initial_week(item)
                db.execute('''INSERT OR IGNORE INTO student_calendar_links(account_key,class_id,event_id,first_week,desired_payload)
                    VALUES(?,?,?,?,?)''', (key, item['id'], uuid4().hex, week, payload(item, week)))


def read_status(key, connected):
    with connection() as db:
        settings = db.execute('SELECT * FROM student_calendar_settings WHERE id=1').fetchone()
        rows = [dict(r) for r in db.execute('SELECT * FROM student_calendar_links WHERE (? IS NULL OR account_key=?)', (key, key))]
        other = db.execute('SELECT count(*) FROM student_calendar_links WHERE account_key!=?', (key or '',)).fetchone()[0] if key else 0
        total = db.execute('SELECT count(*) FROM student_classes').fetchone()[0]
        pending = [r for r in rows if r['desired_payload'] is None or r['desired_payload'] != r['synced_payload']]
        return {'enabled': bool(settings['enabled']), 'connected': connected, 'identified': key is not None,
                'configured': bool(os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET')),
                'google_enabled': setting_enabled('google_enabled'),
                'busy': bool(settings['lease_token'] and settings['lease_until'] > time.time()),
                'synced_count': sum(r['desired_payload'] is not None and r['desired_payload'] == r['synced_payload'] for r in rows) if key else 0,
                'pending_count': len(pending), 'other_account_count': other, 'total_classes': total,
                'classes': [{'class_id': r['class_id'], 'synced': r not in pending, 'pending_removal': r['desired_payload'] is None, 'error': r['error']} for r in rows],
                'last_error': next((r['error'] for r in pending if r['error']), None)}


@router.get('/student/calendar/status')
def status():
    info, key = account_info()
    stage_changes(key)
    return read_status(key, info is not None)


def calendar_service(expected_key):
    from googleapiclient.discovery import build
    from google_auth_httplib2 import AuthorizedHttp
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    import httplib2
    info, key = account_info()
    if not info or key != expected_key:
        raise HTTPException(409, 'La cuenta Google cambió. Actualiza antes de sincronizar.')
    result = Credentials.from_authorized_user_info(info)
    if not result.valid:
        if result.expired and result.refresh_token:
            try:
                result.refresh(Request())
                save_google_token(result, key, previous_info=info)
            except Exception:
                raise HTTPException(401, 'Vuelve a conectar Google y autoriza Calendar.') from None
        else:
            raise HTTPException(401, 'Vuelve a conectar Google y autoriza Calendar.')
    # Keep this operation bound to its token snapshot. Do not overwrite a new
    # connection if the person reconnects another account during a refresh.
    return build('calendar', 'v3', http=AuthorizedHttp(result, http=httplib2.Http(timeout=20)), cache_discovery=False)


def error_code(error):
    return getattr(getattr(error, 'resp', None), 'status', None)


def owned(event, event_id):
    if event.get('extendedProperties', {}).get('private', {}).get('balance_class_link') != event_id:
        raise HTTPException(409, 'El evento vinculado ya no se identifica como una clase de Balance. Revísalo en Calendar antes de reintentar.')


def remote_get(events, event_id):
    try:
        return events.get(calendarId='primary', eventId=event_id).execute()
    except Exception as error:
        if error_code(error) == 404:
            return None
        if error_code(error) == 410:
            return {'status': 'cancelled'}
        raise


def rotate_id(link):
    new_id = uuid4().hex
    with connection() as db:
        db.execute('UPDATE student_calendar_links SET event_id=? WHERE account_key=? AND class_id=? AND event_id=?',
                   (new_id, link['account_key'], link['class_id'], link['event_id']))
    link['event_id'] = new_id
    return new_id


def apply_link(events, link):
    event_id = link['event_id']
    remote = remote_get(events, event_id)
    if link['desired_payload'] is None:
        if remote and remote.get('status') != 'cancelled':
            owned(remote, event_id)
            try:
                events.delete(calendarId='primary', eventId=event_id, sendUpdates='none').execute()
            except Exception as error:
                if error_code(error) not in (404, 410):
                    raise
        return
    if remote and remote.get('status') == 'cancelled':
        event_id = rotate_id(link)
        remote = None
    body = json.loads(link['desired_payload'])
    body['extendedProperties'] = {'private': {'balance_class_link': event_id}}
    if remote:
        owned(remote, event_id)
        events.patch(calendarId='primary', eventId=event_id, body=body, sendUpdates='none').execute()
    else:
        try:
            events.insert(calendarId='primary', body={**body, 'id': event_id}, sendUpdates='none').execute()
        except Exception as error:
            if error_code(error) != 409:
                raise
            existing = remote_get(events, event_id)
            if existing and existing.get('status') == 'cancelled':
                event_id = rotate_id(link)
                body['extendedProperties']['private']['balance_class_link'] = event_id
                events.insert(calendarId='primary', body={**body, 'id': event_id}, sendUpdates='none').execute()
            elif existing:
                owned(existing, event_id)
                events.patch(calendarId='primary', eventId=event_id, body=body, sendUpdates='none').execute()
            else:
                raise


def sync_pending(key):
    if not setting_enabled('google_enabled'):
        raise HTTPException(503, 'El administrador ha pausado Google. Los cambios quedan pendientes.')
    with connection() as db:
        pending = [r['class_id'] for r in db.execute('''SELECT * FROM student_calendar_links WHERE account_key=?
            AND (desired_payload IS NULL OR synced_payload IS NULL OR desired_payload!=synced_payload)''', (key,))]
    if not pending:
        return
    service = calendar_service(key)
    lease = uuid4().hex
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        settings = db.execute('SELECT * FROM student_calendar_settings WHERE id=1').fetchone()
        if settings['lease_token'] and settings['lease_until'] > time.time():
            raise HTTPException(409, 'Ya hay una sincronización en curso. Actualiza el estado en unos segundos.')
        db.execute('UPDATE student_calendar_settings SET lease_token=?,lease_until=? WHERE id=1', (lease, time.time() + 120))
    try:
        for class_id in pending:
            with connection() as db:
                db.execute('UPDATE student_calendar_settings SET lease_until=? WHERE id=1 AND lease_token=?', (time.time() + 120, lease))
                row = db.execute('SELECT * FROM student_calendar_links WHERE account_key=? AND class_id=?', (key, class_id)).fetchone()
            if not row:
                continue
            link = dict(row)
            try:
                if account_info()[1] != key:
                    raise HTTPException(409, 'La cuenta Google cambió. Actualiza y revisa la conexión.')
                if not setting_enabled('google_enabled'):
                    raise HTTPException(503, 'Google está pausado. Los cambios quedan pendientes.')
                apply_link(service.events(), link)
                with connection() as db:
                    if link['desired_payload'] is None:
                        db.execute('UPDATE student_calendar_links SET synced_payload=NULL,error=NULL WHERE account_key=? AND class_id=? AND event_id=?', (key, class_id, link['event_id']))
                        db.execute('DELETE FROM student_calendar_links WHERE account_key=? AND class_id=? AND event_id=? AND desired_payload IS NULL',
                                   (key, class_id, link['event_id']))
                    else:
                        # Always record what was sent, even if the source changed while awaiting Google.
                        db.execute('UPDATE student_calendar_links SET synced_payload=?,error=NULL WHERE account_key=? AND class_id=? AND event_id=?',
                                   (link['desired_payload'], key, class_id, link['event_id']))
            except Exception as error:
                message = error.detail if isinstance(error, HTTPException) else 'No se pudo actualizar Calendar. Revisa la conexión y los permisos y vuelve a sincronizar.'
                with connection() as db:
                    db.execute('UPDATE student_calendar_links SET error=? WHERE account_key=? AND class_id=?', (message, key, class_id))
                code = error_code(error)
                if isinstance(error, (TimeoutError, OSError)) or code in (401, 403, 429) or (isinstance(code, int) and code >= 500):
                    break
    finally:
        with connection() as db:
            db.execute('UPDATE student_calendar_settings SET lease_token=NULL,lease_until=0 WHERE id=1 AND lease_token=?', (lease,))


class SyncIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enable: bool = Field(default=False, strict=True)
    force: bool = Field(default=False, strict=True)


@router.post('/google/calendar/student/sync')
def synchronize(item: SyncIn):
    info, key = account_info()
    if not key:
        raise HTTPException(401, 'Conecta o vuelve a conectar tu cuenta Google antes de sincronizar el horario.')
    if not setting_enabled('google_enabled'):
        raise HTTPException(503, 'El administrador ha pausado Google')
    if item.enable:
        with connection() as db:
            db.execute('UPDATE student_calendar_settings SET enabled=1 WHERE id=1')
    stage_changes(key)
    if item.force:
        with connection() as db:
            db.execute('UPDATE student_calendar_links SET synced_payload=NULL WHERE account_key=? AND desired_payload IS NOT NULL', (key,))
    sync_pending(key)
    return read_status(key, info is not None)


@router.post('/student/calendar/disable')
def disable():
    info, key = account_info()
    with connection() as db:
        db.execute('UPDATE student_calendar_settings SET enabled=0 WHERE id=1')
    stage_changes(key)
    if key and setting_enabled('google_enabled'):
        try:
            sync_pending(key)
        except Exception:
            pass
    return read_status(key, info is not None)


def notify_changes():
    """Local saves succeed independently; remote failures remain in the queue."""
    with connection() as db:
        enabled = bool(db.execute('SELECT enabled FROM student_calendar_settings WHERE id=1').fetchone()[0])
        linked = bool(db.execute('SELECT 1 FROM student_calendar_links LIMIT 1').fetchone())
    if not enabled and not linked:
        return {'enabled': False, 'pending': False}
    try:
        info, key = account_info()
        stage_changes(key)
        if key and setting_enabled('google_enabled'):
            sync_pending(key)
        result = read_status(key, info is not None)
        return {'enabled': enabled, 'pending': bool(result['pending_count'] or result['other_account_count'] or ((enabled or linked) and not key)),
                'message': result['last_error'] or ('Hay vínculos de otra cuenta Google pendientes de revisar en Horario.' if result['other_account_count'] else 'Conecta Google para completar los cambios de Calendar.' if not key else '')}
    except Exception:
        return {'enabled': enabled, 'pending': True, 'message': 'Guardado en Balance. Calendar queda pendiente; reintenta desde Horario.'}
