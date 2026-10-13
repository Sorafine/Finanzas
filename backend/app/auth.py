"""Private user registry, opaque sessions and encrypted per-user Google tokens."""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from pathlib import Path
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

DATA_DIR = Path(os.environ.get('FINANZAS_DATA_DIR', str(Path.home() / '.local/share/finanzasapp')))
PUBLIC_URL = os.environ.get('FINANZAS_PUBLIC_URL', '').rstrip('/')
COOKIE = 'finanzas_session'
SESSION_SECONDS = 7 * 24 * 60 * 60


@dataclass(frozen=True)
class Identity:
    user_id: str
    username: str
    session_hash: str
    csrf_token: str


current_identity: ContextVar[Identity | None] = ContextVar('finanzas_identity', default=None)
current_database: ContextVar[Path | None] = ContextVar('finanzas_database', default=None)


def user_database(user_id):
    if not re.fullmatch(r'[0-9a-f]{32}', user_id):
        raise ValueError('Identificador de usuario inválido')
    return DATA_DIR / 'users' / f'{user_id}.sqlite3'


@contextmanager
def registry():
    db = sqlite3.connect(DATA_DIR / 'auth.sqlite3', timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    try:
        with db:
            yield db
    finally:
        db.close()


def init_auth_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    (DATA_DIR / 'users').mkdir(exist_ok=True, mode=0o700)
    if PUBLIC_URL:
        parsed = urlsplit(PUBLIC_URL)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.path not in ('', '/') or parsed.query or parsed.fragment or parsed.username:
            raise RuntimeError('FINANZAS_PUBLIC_URL debe ser un origen HTTPS sin ruta ni credenciales')
    with registry() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
            csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS login_attempts (
            bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS google_credentials (
            user_id TEXT PRIMARY KEY REFERENCES users(id), encrypted TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS oauth_states (
            state_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
            session_hash TEXT NOT NULL, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
        );
        ''')
        db.execute('DELETE FROM sessions WHERE expires_at <= ?', (int(time.time()),))
        db.execute('DELETE FROM oauth_states WHERE expires_at <= ?', (int(time.time()),))
    key_path = DATA_DIR / 'token.key'
    if not key_path.exists():
        with registry() as db:
            if db.execute('SELECT 1 FROM google_credentials LIMIT 1').fetchone():
                raise RuntimeError('Falta token.key: restaura la clave desde tu respaldo antes de arrancar')
        try:
            descriptor = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'wb') as output:
                output.write(Fernet.generate_key())
        except FileExistsError:
            pass
    for path in (DATA_DIR, DATA_DIR / 'users'):
        path.chmod(0o700)
    for path in (DATA_DIR / 'auth.sqlite3', key_path):
        path.chmod(0o600)
    cipher()  # Reject an invalid key before serving requests.


def cipher():
    return Fernet((DATA_DIR / 'token.key').read_bytes())


def password_hash(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
    return f'scrypt${salt.hex()}${digest.hex()}'


def password_matches(password, encoded):
    _, salt, expected = encoded.split('$')
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1, dklen=32)
    return hmac.compare_digest(digest.hex(), expected)


def normalize_username(username):
    name = username.strip().lower()
    if not re.fullmatch(r'[a-z0-9][a-z0-9_.@-]{2,63}', name):
        raise ValueError('Usuario: 3–64 caracteres; letras, números, punto, @, guion o guion bajo')
    return name


def create_user(username, password):
    name = normalize_username(username)
    if not 12 <= len(password) <= 128:
        raise ValueError('Usa una contraseña de 12 a 128 caracteres')
    user_id = secrets.token_hex(16)
    with registry() as db:
        try:
            db.execute('INSERT INTO users VALUES(?,?,?,?)', (user_id, name, password_hash(password), int(time.time())))
        except sqlite3.IntegrityError:
            raise ValueError('Ese usuario ya existe') from None
    return user_id


def identity():
    value = current_identity.get()
    if not value:
        raise HTTPException(401, 'Inicia sesión para continuar')
    return value


def session_from_cookie(token):
    if not token or len(token) > 128:
        return None
    digest = hashlib.sha256(token.encode()).hexdigest()
    with registry() as db:
        row = db.execute('''SELECT s.*,u.username FROM sessions s JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=? AND s.expires_at>?''', (digest, int(time.time()))).fetchone()
    return Identity(row['user_id'], row['username'], digest, row['csrf_token']) if row else None


def google_token():
    user = identity()
    with registry() as db:
        row = db.execute('SELECT encrypted FROM google_credentials WHERE user_id=?', (user.user_id,)).fetchone()
    if not row:
        return None
    try:
        return json.loads(cipher().decrypt(row['encrypted'].encode()))
    except (InvalidToken, ValueError):
        raise HTTPException(503, 'No se pudo leer tu conexión de Google; revisa el respaldo de la clave') from None


def save_google_token(credentials, account_key=None):
    info = json.loads(credentials.to_json())
    if account_key:
        info['finanzas_account_key'] = account_key
    encrypted = cipher().encrypt(json.dumps(info).encode()).decode()
    with registry() as db:
        db.execute('INSERT INTO google_credentials VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted=excluded.encrypted', (identity().user_id, encrypted))


router = APIRouter(prefix='/auth', tags=['Sesión'])


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


@router.post('/login')
def login(payload: LoginIn, request: Request):
    name = payload.username.strip().lower()
    # Per-name and per-peer limits are persistent across process restarts.
    now = int(time.time())
    peer = request.client.host if request.client else 'unknown'
    buckets = [(f'user:{name}', 8, 300), (f'peer:{peer}', 40, 300)]
    with registry() as db:
        db.execute('BEGIN IMMEDIATE')
        for bucket, maximum, _ in buckets:
            row = db.execute('SELECT * FROM login_attempts WHERE bucket=?', (bucket,)).fetchone()
            if row and row['resets_at'] > now and row['count'] >= maximum:
                return JSONResponse({'detail': 'Demasiados intentos. Espera unos minutos.'}, status_code=429, headers={'Retry-After': str(row['resets_at'] - now)})
        for bucket, _, duration in buckets:
            db.execute('''INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET
                count=CASE WHEN resets_at<=? THEN 1 ELSE count+1 END,
                resets_at=CASE WHEN resets_at<=? THEN excluded.resets_at ELSE resets_at END''', (bucket, now+duration, now, now))
        user = db.execute('SELECT * FROM users WHERE username=?', (name,)).fetchone()
    # Same expensive computation for nonexistent names avoids a timing shortcut.
    dummy = 'scrypt$' + '00'*16 + '$' + '00'*32
    valid = password_matches(payload.password, user['password_hash'] if user else dummy)
    if not user or not valid:
        return JSONResponse({'detail': 'Usuario o contraseña incorrectos'}, status_code=401)
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    with registry() as db:
        db.execute('DELETE FROM login_attempts WHERE bucket=?', (f'user:{name}',))
        db.execute('DELETE FROM sessions WHERE expires_at<=?', (now,))
        db.execute('INSERT INTO sessions VALUES(?,?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user['id'], csrf, now+SESSION_SECONDS))
    response = JSONResponse({'username': user['username'], 'csrf_token': csrf})
    response.set_cookie(COOKIE, token, httponly=True, secure=bool(PUBLIC_URL), samesite='lax', max_age=SESSION_SECONDS, path='/')
    return response


@router.get('/me')
def me():
    user = identity()
    return {'username': user.username, 'csrf_token': user.csrf_token}


@router.post('/logout')
def logout():
    user = identity()
    with registry() as db:
        db.execute('DELETE FROM sessions WHERE token_hash=?', (user.session_hash,))
        db.execute('DELETE FROM oauth_states WHERE session_hash=?', (user.session_hash,))
    response = JSONResponse({'ok': True})
    response.delete_cookie(COOKIE, path='/', secure=bool(PUBLIC_URL), httponly=True, samesite='lax')
    return response


class PrivateAppMiddleware:
    """Authenticates both /api and legacy routes, binds each request to its DB."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        scope = dict(scope)
        path = scope['path']
        is_api = path == '/api' or path.startswith('/api/')
        if is_api:
            scope['path'] = path[4:] or '/'
            scope['raw_path'] = scope['path'].encode()
        path = scope['path']
        request = Request(scope)
        public_files = ('/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.ico')
        public = path in ('/auth/login', '/health') or (not is_api and (path in public_files or path.startswith('/assets/')))
        expected_host = urlsplit(PUBLIC_URL).hostname
        host = urlsplit('http://' + request.headers.get('host', '')).hostname
        if host not in {'localhost', '127.0.0.1', 'testserver', expected_host}:
            await JSONResponse({'detail':'Dirección de acceso no autorizada'}, status_code=400)(scope, receive, send)
            return
        origin = request.headers.get('origin')
        allowed = {PUBLIC_URL} if PUBLIC_URL else {'http://localhost:5173','http://127.0.0.1:5173','http://localhost:8787','http://127.0.0.1:8787','http://testserver'}
        if not PUBLIC_URL:
            allowed.add(str(request.base_url).rstrip('/'))
        if request.method not in ('GET','HEAD','OPTIONS') and origin and origin not in allowed:
            await JSONResponse({'detail':'Origen no autorizado'}, status_code=403)(scope, receive, send)
            return
        user = None if public else session_from_cookie(request.cookies.get(COOKIE))
        if not public and not user:
            await JSONResponse({'detail':'Inicia sesión para continuar'}, status_code=401, headers={'X-Auth-Required':'1','Cache-Control':'no-store'})(scope, receive, send)
            return
        if user and request.method not in ('GET','HEAD','OPTIONS'):
            if not hmac.compare_digest(request.headers.get('x-csrf-token',''), user.csrf_token):
                await JSONResponse({'detail':'Tu sesión necesita actualizarse. Vuelve a entrar.'}, status_code=403)(scope, receive, send)
                return
        identity_token = current_identity.set(user)
        db_token = current_database.set(user_database(user.user_id) if user else None)
        async def safe_send(message):
            if message['type']=='http.response.start':
                headers=list(message.get('headers',[]))
                if path == '/health' and os.environ.get('FINANZAS_INSTANCE_ID'):
                    headers.append((b'x-finanzas-instance',os.environ['FINANZAS_INSTANCE_ID'].encode()))
                headers.extend([(b'x-content-type-options',b'nosniff'),(b'x-frame-options',b'DENY'),(b'referrer-policy',b'no-referrer'),(b'permissions-policy',b'camera=(), microphone=(), geolocation=()')])
                if path == '/' or is_api or not public:
                    headers.append((b'cache-control',b'no-store'))
                # Vite development uses a WebSocket and inline preamble; the
                # compiled production app only loads scripts from this origin.
                if os.environ.get('FINANZAS_STATIC_DIR'):
                    headers.append((b'content-security-policy',b"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"))
                message={**message,'headers':headers}
            await send(message)
        try:
            await self.app(scope, receive, safe_send)
        finally:
            current_database.reset(db_token)
            current_identity.reset(identity_token)
