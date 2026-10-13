"""Google OAuth, Gmail suggestions and Calendar reminder endpoints.
Local-development single-user integration; do not deploy as multi-user service.
"""
import os
import re
import secrets
from datetime import date,timedelta
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from .main import connection

router=APIRouter(prefix='/google', tags=['Google (desarrollo local)'])
SCOPES=['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/calendar.events']
REDIRECT='http://localhost:8000/google/callback'
_credentials=None
_state=None

def config():
    client=os.getenv('GOOGLE_CLIENT_ID')
    secret=os.getenv('GOOGLE_CLIENT_SECRET')
    if not client or not secret:
        raise HTTPException(503,'Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el backend')
    return {'web':{'client_id':client,'client_secret':secret,
        'auth_uri':'https://accounts.google.com/o/oauth2/auth',
        'token_uri':'https://oauth2.googleapis.com/token','redirect_uris':[REDIRECT]}}

def flow(state=None):
    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError:
        raise HTTPException(503,'Instala las dependencias de Google indicadas en requirements.txt')
    result=Flow.from_client_config(config(),scopes=SCOPES,state=state)
    result.redirect_uri=REDIRECT
    return result

def credentials():
    global _credentials
    if _credentials is None:
        raise HTTPException(401,'Conecta Google primero')
    from google.auth.transport.requests import Request
    if not _credentials.valid:
        if _credentials.expired and _credentials.refresh_token:
            try: _credentials.refresh(Request())
            except Exception: raise HTTPException(401,'Vuelve a conectar Google')
        else: raise HTTPException(401,'Vuelve a conectar Google')
    return _credentials

@router.get('/status')
def status():
    return {'configured':bool(os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET')),'connected':_credentials is not None,'mode':'local_single_user'}

@router.get('/connect')
def connect():
    global _state
    _state=secrets.token_urlsafe(32)
    url,state=flow().authorization_url(access_type='offline',prompt='consent',state=_state)
    _state=state
    return RedirectResponse(url)

@router.get('/callback')
def callback(code:str,state:str):
    global _state,_credentials
    if not _state or not secrets.compare_digest(state,_state):
        raise HTTPException(400,'Estado OAuth inválido')
    _state=None
    f=flow(state=state)
    try: f.fetch_token(code=code)
    except Exception: raise HTTPException(400,'No se pudo completar OAuth')
    _credentials=f.credentials
    return RedirectResponse('http://localhost:5173/?google=connected')

@router.post('/disconnect')
def disconnect():
    global _credentials,_state
    _credentials=None
    _state=None
    return {'message':'Desconectado localmente. Revoca permisos desde tu cuenta Google si lo deseas.'}

@router.get('/gmail/suggestions')
def suggestions():
    from googleapiclient.discovery import build
    service=build('gmail','v1',credentials=credentials(),cache_discovery=False)
    try:
        response=service.users().messages().list(userId='me',q='newer_than:30d (compra OR consumo OR retiro OR transferencia OR pago)',maxResults=15).execute()
        out=[]
        with connection() as db:
            existing={x[0] for x in db.execute("SELECT gmail_id FROM gmail_reviews WHERE status IN ('dismissed','reviewed')")}
        for m in response.get('messages',[]):
            if m['id'] in existing: continue
            record=service.users().messages().get(userId='me',id=m['id'],format='metadata',metadataHeaders=['Subject','From','Date']).execute()
            headers={h['name'].lower():h['value'] for h in record.get('payload',{}).get('headers',[])}
            snippet=record.get('snippet','')
            text=headers.get('subject','')+' '+snippet
            match=re.search(r'(?:S/|PEN)\s*(\d[\d.,]*)',text,re.IGNORECASE)
            out.append({'gmail_id':m['id'],'subject':headers.get('subject',''),'sender':headers.get('from',''), 'date':headers.get('date',''),'snippet':snippet,'amount_detected':match.group(1) if match else None,'status':'pending_review'})
        return {'suggestions':out}
    except Exception as e:
        raise HTTPException(502,'Error al consultar Gmail') from e

class ReviewIn(BaseModel):
    gmail_id:str=Field(min_length=1,max_length=200)
    status:str=Field(pattern='^(dismissed|reviewed)$')

@router.post('/gmail/review')
def review(item:ReviewIn):
    with connection() as db:
        db.execute('INSERT INTO gmail_reviews(gmail_id,status) VALUES (?,?) ON CONFLICT(gmail_id) DO UPDATE SET status=excluded.status',(item.gmail_id,item.status))
    return {'ok':True,'status':item.status}

class ReminderIn(BaseModel):
    scheduled_id:int=Field(gt=0)

@router.post('/calendar/reminder')
def reminder(payload:ReminderIn):
    from googleapiclient.discovery import build
    with connection() as db:
        plan=db.execute('SELECT * FROM scheduled_payments WHERE id=?',(payload.scheduled_id,)).fetchone()
        if not plan: raise HTTPException(404,'Pago programado no encontrado')
        existing=db.execute('SELECT event_id FROM calendar_events WHERE scheduled_id=?',(payload.scheduled_id,)).fetchone()
    try: day=date.fromisoformat(plan['due_date'])
    except ValueError: raise HTTPException(400,'Fecha inválida')
    event={'summary':'Pagar: '+plan['name'],'description':f"Importe registrado: S/ {plan['amount_cents']/100:.2f}. Recordatorio, no confirmación bancaria.", 'start':{'date':day.isoformat()},'end':{'date':(day+timedelta(days=1)).isoformat()},'reminders':{'useDefault':False,'overrides':[{'method':'popup','minutes':1440}]}}
    service=build('calendar','v3',credentials=credentials(),cache_discovery=False)
    try:
        if existing:
            obj=service.events().update(calendarId='primary',eventId=existing['event_id'],body=event).execute()
        else:
            obj=service.events().insert(calendarId='primary',body=event).execute()
    except Exception as e:
        raise HTTPException(502,'No se pudo sincronizar Calendar; revisa la conexión') from e
    with connection() as db:
        db.execute('INSERT INTO calendar_events(scheduled_id,event_id) VALUES (?,?) ON CONFLICT(scheduled_id) DO UPDATE SET event_id=excluded.event_id',(payload.scheduled_id,obj['id']))
    return {'message':'Recordatorio sincronizado','event_id':obj['id'],'event_url':obj.get('htmlLink')}
