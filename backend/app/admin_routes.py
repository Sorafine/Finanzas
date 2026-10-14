"""Owner-only account and connection controls; never exposes financial data or tokens."""
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool
from .auth import administrator, registry, setting_enabled, registration_enabled

router = APIRouter(prefix='/admin', tags=['Administración'])


@router.get('/overview')
def overview():
    administrator()
    with registry() as db:
        users = [dict(row) for row in db.execute('''
            SELECT u.id,u.username,u.created_at,u.is_active,u.is_admin,
                   EXISTS(SELECT 1 FROM google_credentials g WHERE g.user_id=u.id) AS google_connected
            FROM users u ORDER BY u.is_admin DESC,u.created_at,u.username''')]
    from .google_routes import REDIRECT
    return {'users':users, 'registration_enabled':registration_enabled(),
        'google_enabled':setting_enabled('google_enabled'),
        'oauth_configured':bool(os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET')),
        'callback_url':REDIRECT}


class SettingsIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    registration_enabled: StrictBool
    google_enabled: StrictBool


@router.patch('/settings')
def update_settings(payload:SettingsIn):
    administrator()
    with registry() as db:
        for name,value in payload.model_dump().items():
            db.execute('INSERT INTO app_settings VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value', (name,'1' if value else '0'))
    return {'ok':True}


@router.post('/users/{user_id}/disconnect-google')
def disconnect_user(user_id:str):
    administrator()
    with registry() as db:
        if not db.execute('SELECT 1 FROM users WHERE id=?',(user_id,)).fetchone():
            raise HTTPException(404,'Usuario no encontrado')
        db.execute('DELETE FROM google_credentials WHERE user_id=?',(user_id,))
        db.execute('DELETE FROM oauth_states WHERE user_id=?',(user_id,))
    return {'message':'Conexión Google retirada de la aplicación'}


class ActiveIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    is_active: StrictBool


@router.patch('/users/{user_id}/active')
def set_active(user_id:str, payload:ActiveIn):
    administrator()
    with registry() as db:
        user = db.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone()
        if not user: raise HTTPException(404,'Usuario no encontrado')
        if user['is_admin']: raise HTTPException(400,'La cuenta del administrador permanece activa')
        db.execute('UPDATE users SET is_active=? WHERE id=?',(int(payload.is_active),user_id))
        if not payload.is_active:
            db.execute('DELETE FROM sessions WHERE user_id=?',(user_id,))
            db.execute('DELETE FROM oauth_states WHERE user_id=?',(user_id,))
    return {'ok':True}
