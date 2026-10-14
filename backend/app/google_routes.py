"""Google OAuth and integrations bound to the authenticated person."""
import os
import re
import secrets
import uuid
import hashlib
import time
import base64
import unicodedata
from html.parser import HTMLParser
from decimal import Decimal, InvalidOperation
from datetime import date, timedelta
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from .main import connection, MovementIn, add_movement
from .auth import identity, registry, cipher, google_token, save_google_token, PUBLIC_URL, setting_enabled

router = APIRouter(prefix='/google', tags=['Google'])
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.events']
REDIRECT = os.getenv('GOOGLE_REDIRECT_URI') or ((PUBLIC_URL + '/api/google/callback') if PUBLIC_URL else 'http://localhost:8787/api/google/callback')
FRONTEND_URL = PUBLIC_URL or os.getenv('FINANZAS_FRONTEND_URL', 'http://localhost:8787')


def config():
    client = os.getenv('GOOGLE_CLIENT_ID')
    secret = os.getenv('GOOGLE_CLIENT_SECRET')
    if not client or not secret:
        raise HTTPException(503, 'La conexión Google aún no está configurada')
    return {'web': {'client_id': client, 'client_secret': secret,
        'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
        'token_uri': 'https://oauth2.googleapis.com/token', 'redirect_uris': [REDIRECT]}}


def flow(state=None, verifier=None):
    from google_auth_oauthlib.flow import Flow
    result = Flow.from_client_config(config(), scopes=SCOPES, state=state,
        code_verifier=verifier, autogenerate_code_verifier=verifier is None)
    result.redirect_uri = REDIRECT
    return result


def credentials():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    info = google_token()
    if not info:
        raise HTTPException(401, 'Conecta tu cuenta Google primero')
    result = Credentials.from_authorized_user_info(info)
    if not result.valid:
        if result.expired and result.refresh_token:
            try:
                result.refresh(Request())
                save_google_token(result, info.get('finanzas_account_key'))
            except Exception:
                raise HTTPException(401, 'Vuelve a conectar tu cuenta Google') from None
        else:
            raise HTTPException(401, 'Vuelve a conectar tu cuenta Google')
    return result


@router.get('/status')
def status():
    info = google_token()
    return {'configured': bool(os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET')),
        'connected': info is not None, 'enabled':setting_enabled('google_enabled'), 'mode': 'private_users'}


@router.get('/connect')
def connect():
    user = identity()
    state = secrets.token_urlsafe(32)
    f = flow(state=state)
    url, _ = f.authorization_url(access_type='offline', prompt='consent', state=state)
    verifier = cipher().encrypt(f.code_verifier.encode()).decode()
    with registry() as db:
        db.execute('DELETE FROM oauth_states WHERE expires_at<=?', (int(time.time()),))
        db.execute('INSERT INTO oauth_states VALUES(?,?,?,?,?)',
            (hashlib.sha256(state.encode()).hexdigest(), user.user_id, user.session_hash, verifier, int(time.time())+600))
    return RedirectResponse(url)


@router.get('/callback')
def callback(state: str, code: str | None = None, error: str | None = None):
    user = identity()
    state_hash = hashlib.sha256(state.encode()).hexdigest()
    with registry() as db:
        db.execute('BEGIN IMMEDIATE')
        saved = db.execute('SELECT * FROM oauth_states WHERE state_hash=? AND user_id=? AND session_hash=? AND expires_at>?',
            (state_hash, user.user_id, user.session_hash, int(time.time()))).fetchone()
        if not saved:
            raise HTTPException(400, 'La conexión ha caducado. Vuelve a conectar Google.')
        db.execute('DELETE FROM oauth_states WHERE state_hash=?', (state_hash,))
    if error or not code:
        return RedirectResponse(FRONTEND_URL + '/?google=cancelled')
    verifier = cipher().decrypt(saved['verifier'].encode()).decode()
    f = flow(state=state, verifier=verifier)
    try:
        f.fetch_token(code=code)
        from googleapiclient.discovery import build
        profile = build('gmail', 'v1', credentials=f.credentials, cache_discovery=False).users().getProfile(userId='me').execute()
        account_key = hashlib.sha256(profile['emailAddress'].lower().encode()).hexdigest()
        save_google_token(f.credentials, account_key)
    except Exception:
        raise HTTPException(400, 'No se pudo completar la conexión Google. Vuelve a intentarlo.') from None
    return RedirectResponse(FRONTEND_URL + '/?google=connected')


@router.post('/disconnect')
def disconnect():
    user = identity()
    with registry() as db:
        db.execute('DELETE FROM google_credentials WHERE user_id=?', (user.user_id,))
        db.execute('DELETE FROM oauth_states WHERE user_id=?', (user.user_id,))
    # Keep the stable IDs so reconnecting cannot duplicate an existing event.
    return {'message': 'Google desconectado de tu usuario. Puedes revocar sus permisos en tu cuenta Google.'}

def gmail_key(message_id):
    info = google_token()
    if not info or not info.get('finanzas_account_key'):
        raise HTTPException(401, 'Vuelve a conectar Google para identificar tu buzón')
    return info['finanzas_account_key'] + ':' + message_id


CONSUMPTION_QUERY = ('newer_than:30d -category:promotions -category:social -in:spam -in:trash '
    '{subject:consumo subject:compra subject:recibo subject:"cargo aprobado" '
    'subject:"transaccion aprobada" subject:"pago realizado" subject:"pago aprobado" subject:"pago exitoso"}')


class MailText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.chunks = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if tag in ('br', 'p', 'div', 'tr', 'td', 'li'): self.chunks.append(' ')

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.hidden: self.hidden -= 1
        if tag in ('p', 'div', 'tr', 'td', 'li'): self.chunks.append(' ')

    def handle_data(self, data):
        if not self.hidden: self.chunks.append(data)


def message_text(payload):
    if payload.get('filename'): return ''  # Never classify attached files as the message itself.
    parts = payload.get('parts', [])
    if parts:
        if payload.get('mimeType') == 'multipart/alternative':
            plain = next((p for p in parts if p.get('mimeType') == 'text/plain'), None)
            if plain:
                text = message_text(plain)
                if text: return text
        return ' '.join(message_text(p) for p in parts)
    kind = payload.get('mimeType', '')
    data = payload.get('body', {}).get('data', '')
    if kind not in ('text/plain', 'text/html') or not data or len(data) > 700000: return ''
    try:
        text = base64.urlsafe_b64decode(data + '=' * (-len(data) % 4)).decode('utf-8', errors='replace')
    except (ValueError, TypeError): return ''
    if kind == 'text/html':
        parser = MailText()
        parser.feed(text)
        text = ' '.join(parser.chunks)
    return text


def normalized(text):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFKD', text.lower())
        if not unicodedata.combining(c)).split())


def consumption(record):
    """Conservative receipt detection; a price in an email never suffices."""
    headers = {h['name'].lower(): h['value'] for h in record.get('payload', {}).get('headers', [])}
    subject = headers.get('subject', '')
    title = normalized(subject)
    body = message_text(record.get('payload', {})) or record.get('snippet', '')
    text = normalized(subject + ' ' + body)
    if re.search(r'\b(oferta|ofertas|promocion|promociones|regalo|regalos|descuento|descuentos|'
                 r'gratis|postula|vacante|vacantes|empleo|ganaste|gana|sorteo|cashback)\b|solo por hoy', title):
        return None
    if re.search(r'\b(retiro|transferencia|abono|deposito|devolucion|reembolso|extorno|vencimiento|'
                 r'recordatorio|estado de cuenta|pago minimo)\b|'
                 r'\bpago de (?:tu |la |un )?(?:tarjeta|prestamo|deuda)\b', title):
        return None
    if re.search(r'\b(compra|consumo|pago|transaccion|cargo)\b.{0,45}\b(rechazad[oa]|'
                 r'denegad[oa]|pendiente|cancelad[oa]|anulad[oa]|fallid[oa])\b|'
                 r'\b(no se realizo|no fue aprobad[oa]|intento de compra|pago por realizar|'
                 r'transferencia realizada|retiro realizado)\b', text):
        return None
    noun = r'(?:compra|consumo|pago|transaccion|cargo)'
    done = r'(?:realizad[oa]|aprobad[oa]|confirmad[oa]|registrad[oa]|procesad[oa]|exitos[oa]|efectuad[oa])'
    evidence = re.search(r'\b' + noun + r'\b.{0,70}\b' + done + r'\b|'
        r'\b(?:realizaste|has realizado|se ha realizado|se realizo|efectuaste|registramos|confirmamos)\b.{0,50}\b' + noun + r'\b|'
        r'\b(?:confirmacion|comprobante|recibo)\b.{0,25}\b(?:de|del)\b.{0,15}\b(?:tu )?' + noun + r'\b', text)
    if not evidence: return None
    non_expense = r'(?:transferencia|retiro|abono|deposito|devolucion|reembolso|extorno)'
    if re.search(r'\b' + non_expense + r'\b.{0,60}\b' + done + r'\b|'
        r'\b(?:realizaste|has realizado|se ha realizado|se realizo|recibiste)\b.{0,50}\b' + non_expense + r'\b', text):
        return None
    # Prefer the amount next to the confirmed operation, not the available balance.
    amount_pattern = r'(?:S/\.?|PEN|soles)\s*(\d[\d.,]*)'
    window = text[evidence.start():evidence.end()+180]
    match = None
    for candidate in re.finditer(amount_pattern, window, re.IGNORECASE):
        prefix = re.split(r'[.;]', window[max(0,candidate.start()-55):candidate.start()])[-1]
        if not re.search(r'\b(saldo|limite|disponible|cashback|descuento|comision|ahorro)\b', prefix):
            match = candidate
            break
    if not match:
        match = re.search(r'\b(?:importe|monto|total)(?: de (?:la|tu) compra)?\s*[:\-]?\s*' + amount_pattern, text, re.IGNORECASE)
    if not match: return None
    detected = match.group(1).rstrip('.,')
    amount = parse_amount(detected)
    if amount is None: return None
    return {'gmail_id':record['id'], 'subject':subject, 'sender':headers.get('from',''),
        'date':headers.get('date',''), 'snippet':record.get('snippet',''),
        'amount_detected':detected, 'amount_cents':amount, 'status':'pending_review'}


@router.get('/gmail/suggestions')
def suggestions():
    from googleapiclient.discovery import build
    service=build('gmail','v1',credentials=credentials(),cache_discovery=False)
    try:
        out=[]
        with connection() as db:
            existing={x[0] for x in db.execute("SELECT gmail_id FROM gmail_reviews UNION SELECT gmail_id FROM gmail_imports")}
        page = None
        for _ in range(3):  # Bounded scan; irrelevant first-page mail cannot crowd out receipts.
            args = {'userId':'me', 'q':CONSUMPTION_QUERY, 'maxResults':50}
            if page: args['pageToken'] = page
            response = service.users().messages().list(**args).execute()
            for m in response.get('messages',[]):
                if gmail_key(m['id']) in existing: continue
                record=service.users().messages().get(userId='me',id=m['id'],format='full').execute()
                candidate = consumption(record)
                if candidate:
                    out.append(candidate)
                    if len(out) == 15: return {'suggestions':out}
            page = response.get('nextPageToken')
            if not page: break
        return {'suggestions':out}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502,'Error al consultar Gmail') from e

def parse_amount(value):
    if not value: return None
    if ',' in value and '.' in value:
        decimal = ',' if value.rfind(',') > value.rfind('.') else '.'
        value = value.replace('.' if decimal == ',' else ',', '').replace(decimal, '.')
    elif ',' in value or '.' in value:
        separator = ',' if ',' in value else '.'
        parts = value.split(separator)
        if len(parts[-1]) == 3:
            value = ''.join(parts)
        elif len(parts) == 2 and len(parts[-1]) in (1, 2):
            value = value.replace(separator, '.')
        else: return None
    try:
        cents = Decimal(value) * 100
        return int(cents) if cents > 0 and cents == cents.to_integral_value() else None
    except (InvalidOperation, ValueError): return None

class GmailImportIn(BaseModel):
    gmail_id: str = Field(min_length=1, max_length=200)
    account_id: int = Field(gt=0)
    amount_cents: int = Field(gt=0)
    concept: str = Field(min_length=1, max_length=150)
    category: str = Field(default='Otros', max_length=80)

@router.post('/gmail/import')
def import_expense(item:GmailImportIn):
    from googleapiclient.discovery import build
    key = gmail_key(item.gmail_id)
    with connection() as db:
        existing = db.execute('SELECT movement_id FROM gmail_imports WHERE gmail_id=?',(key,)).fetchone()
    if existing:
        return {'id':existing['movement_id'], 'message':'Este correo ya está registrado', 'already_imported':True}
    service = build('gmail','v1',credentials=credentials(),cache_discovery=False)
    try:
        record = service.users().messages().get(userId='me',id=item.gmail_id,format='full').execute()
    except Exception:
        raise HTTPException(502,'No se pudo comprobar el consumo en Gmail. Vuelve a intentarlo.') from None
    if not consumption(record):
        raise HTTPException(400,'Este correo no contiene un comprobante de consumo realizado con importe en soles')
    return add_movement(MovementIn(kind='expense', amount_cents=item.amount_cents,
        concept=item.concept, account_id=item.account_id, category=item.category,
        classification='variable', gmail_id=key))

class ReviewIn(BaseModel):
    gmail_id:str=Field(min_length=1,max_length=200)
    status:str=Field(pattern='^(dismissed|reviewed)$')

@router.post('/gmail/review')
def review(item:ReviewIn):
    with connection() as db:
        db.execute('INSERT INTO gmail_reviews(gmail_id,status) VALUES (?,?) ON CONFLICT(gmail_id) DO UPDATE SET status=excluded.status',(gmail_key(item.gmail_id),item.status))
    return {'ok':True,'status':item.status}

class ReminderIn(BaseModel):
    scheduled_id:int=Field(gt=0)

@router.post('/calendar/reminder')
def reminder(payload:ReminderIn):
    from googleapiclient.discovery import build
    with connection() as db:
        plan=db.execute('SELECT * FROM scheduled_payments WHERE id=?',(payload.scheduled_id,)).fetchone()
        if not plan: raise HTTPException(404,'Pago programado no encontrado')
        if not plan['active']: raise HTTPException(400,'Activa el pago antes de sincronizarlo')
    try: day=date.fromisoformat(plan['due_date'])
    except ValueError: raise HTTPException(400,'Fecha inválida')
    event={'summary':'Pagar: '+plan['name'],'description':f"Importe registrado: S/ {plan['amount_cents']/100:.2f}. Recordatorio, no confirmación bancaria.", 'start':{'date':day.isoformat()},'end':{'date':(day+timedelta(days=1)).isoformat()},'reminders':{'useDefault':False,'overrides':[{'method':'popup','minutes':1440}]}}
    rule={'weekly':'FREQ=WEEKLY','monthly':'FREQ=MONTHLY','yearly':'FREQ=YEARLY'}.get(plan['frequency'])
    if rule:
        if plan['frequency']=='monthly' and day.day>=29:
            rule+=f';BYMONTHDAY={day.day},-1;BYSETPOS=1'
        event['recurrence']=['RRULE:'+rule]
    service=build('calendar','v3',credentials=credentials(),cache_discovery=False)
    # Reserve a stable Google-compatible ID before the request: retrying a
    # timeout cannot create another event for the same payment.
    with connection() as db:
        db.execute('INSERT OR IGNORE INTO calendar_events(scheduled_id,event_id) VALUES(?,?)',(payload.scheduled_id,uuid.uuid4().hex))
        event_id=db.execute('SELECT event_id FROM calendar_events WHERE scheduled_id=?',(payload.scheduled_id,)).fetchone()['event_id']
    try:
        from googleapiclient.errors import HttpError
        try:
            obj=service.events().update(calendarId='primary',eventId=event_id,body=event).execute()
        except HttpError as error:
            if error.resp.status != 404: raise
            try:
                obj=service.events().insert(calendarId='primary',body={**event,'id':event_id}).execute()
            except HttpError as conflict:
                if conflict.resp.status != 409: raise
                obj=service.events().update(calendarId='primary',eventId=event_id,body=event).execute()
    except Exception as e:
        raise HTTPException(502,'No se pudo sincronizar Calendar; revisa la conexión') from e
    with connection() as db:
        db.execute('INSERT INTO calendar_events(scheduled_id,event_id) VALUES (?,?) ON CONFLICT(scheduled_id) DO UPDATE SET event_id=excluded.event_id',(payload.scheduled_id,obj['id']))
    return {'message':'Recordatorio sincronizado','event_id':obj['id'],'event_url':obj.get('htmlLink')}

@router.delete('/calendar/reminder/{scheduled_id}')
def remove_reminder(scheduled_id:int):
    with connection() as db:
        existing=db.execute('SELECT event_id FROM calendar_events WHERE scheduled_id=?',(scheduled_id,)).fetchone()
    if not existing: return {'message':'Sin recordatorio en Calendar'}
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    service=build('calendar','v3',credentials=credentials(),cache_discovery=False)
    try:
        service.events().delete(calendarId='primary',eventId=existing['event_id']).execute()
    except HttpError as error:
        if error.resp.status not in (404,410):
            raise HTTPException(502,'No se pudo quitar el recordatorio de Calendar') from error
    except Exception as error:
        raise HTTPException(502,'No se pudo quitar el recordatorio de Calendar') from error
    with connection() as db:
        db.execute('DELETE FROM calendar_events WHERE scheduled_id=?',(scheduled_id,))
    return {'message':'Recordatorio eliminado de Calendar'}
