#!/usr/bin/env python3
"""Cross-platform local deployment. Keeps data outside the Git checkout."""
import argparse
from contextlib import closing
import getpass
import json
import os
from pathlib import Path
import queue
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import tomllib
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.finanzas-runtime'
PYTHON = RUNTIME / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
if 'FINANZAS_DATA_DIR' in os.environ:
    DATA = Path(os.environ['FINANZAS_DATA_DIR']).expanduser().resolve()
elif os.name == 'nt':
    DATA = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'FinanzasApp'
elif sys.platform == 'darwin':
    DATA = Path.home() / 'Library/Application Support/FinanzasApp'
else:
    DATA = Path.home() / '.local/share/finanzasapp'


def run(command, cwd=None):
    subprocess.run([str(part) for part in command], cwd=cwd, check=True)


def require_install():
    if not PYTHON.exists() or not (RUNTIME / 'frontend/dist/index.html').is_file():
        raise ValueError('Primero ejecuta el comando install.')


def environment():
    os.environ['FINANZAS_DATA_DIR'] = str(DATA)
    os.environ['FINANZAS_STATIC_DIR'] = str(RUNTIME / 'frontend/dist')
    os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
    config_file = DATA / 'config.toml'
    settings = tomllib.loads(config_file.read_text(encoding='utf-8')) if config_file.exists() else {}
    app, google = settings.get('app', {}), settings.get('google', {})
    bindings = {'FINANZAS_PUBLIC_URL': app.get('public_url', ''), 'FINANZAS_PORT': str(app.get('port', 8787)),
        'GOOGLE_CLIENT_ID': google.get('client_id', ''), 'GOOGLE_CLIENT_SECRET': google.get('client_secret', ''),
        'GOOGLE_REDIRECT_URI': google.get('redirect_uri', '')}
    for name, value in bindings.items():
        if value and not os.environ.get(name):
            os.environ[name] = str(value)
    port = int(os.environ.get('FINANZAS_PORT', '8787'))
    if not 1024 <= port <= 65535:
        raise ValueError('El puerto debe estar entre 1024 y 65535.')
    sys.path.insert(0, str(RUNTIME / 'backend'))
    return port


def install():
    if sys.version_info < (3, 11):
        raise ValueError('Instala Python 3.12 o superior (mínimo 3.11).')
    node, npm = shutil.which('node'), shutil.which('npm')
    if not node or not npm:
        raise ValueError('Instala Node.js 22.12+ o 24 y vuelve a ejecutar install.')
    version = subprocess.check_output([node, '--version'], text=True).strip().lstrip('v')
    major, minor, *_ = map(int, version.split('.'))
    if major < 22 or (major == 22 and minor < 12):
        raise ValueError('Necesitas Node.js 22.12+ o 24.')
    RUNTIME.mkdir(exist_ok=True)
    backend, frontend = RUNTIME / 'backend', RUNTIME / 'frontend'
    backend.mkdir(exist_ok=True)
    frontend.mkdir(exist_ok=True)
    shutil.copytree(ROOT / 'backend/app', backend / 'app', dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    for name in ('requirements.txt', 'requirements-dev.txt'):
        shutil.copy2(ROOT / 'backend' / name, backend / name)
    for name in ('package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html'):
        shutil.copy2(ROOT / 'frontend' / name, frontend / name)
    for name in ('src', 'public'):
        target = frontend / name
        # These are generated copies, never the original sources or private data.
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(ROOT / 'frontend' / name, target)
    if not PYTHON.exists():
        run([sys.executable, '-m', 'venv', RUNTIME / '.venv'])
    run([PYTHON, '-m', 'pip', 'install', '--cache-dir', RUNTIME / 'pip-cache', '-r', backend / 'requirements-dev.txt'])
    run([npm, 'ci', '--cache', RUNTIME / 'npm-cache', '--no-audit', '--no-fund'], frontend)
    run([npm, 'run', 'build'], frontend)
    print('Instalación completa. Crea cada usuario con user-add y luego ejecuta serve o tunnel.')


def auth_module():
    from app import auth
    auth.init_auth_db()
    return auth


def ensure_users():
    auth = auth_module()
    with auth.registry() as db:
        if not db.execute('SELECT 1 FROM users LIMIT 1').fetchone():
            raise ValueError('Crea al menos un usuario con user-add antes de iniciar.')


def add_user(username):
    from app import main
    auth = auth_module()
    password = getpass.getpass('Contraseña nueva (mínimo 12 caracteres): ')
    if password != getpass.getpass('Repite la contraseña: '):
        raise ValueError('Las contraseñas no coinciden.')
    user_id = auth.create_user(username, password)
    token = auth.current_database.set(auth.user_database(user_id))
    try:
        main.init_finance_db()
    finally:
        auth.current_database.reset(token)
    print('Usuario creado con cuentas vacías. Sus datos anteriores no se importan automáticamente.')


def reset_password(username):
    auth = auth_module()
    name = auth.normalize_username(username)
    password = getpass.getpass('Contraseña nueva (mínimo 12 caracteres): ')
    if not 12 <= len(password) <= 128 or password != getpass.getpass('Repite la contraseña: '):
        raise ValueError('Usa 12–128 caracteres y confirma la misma contraseña.')
    with auth.registry() as db:
        user = db.execute('SELECT id FROM users WHERE username=?', (name,)).fetchone()
        if not user:
            raise ValueError('Usuario no encontrado.')
        db.execute('UPDATE users SET password_hash=? WHERE id=?', (auth.password_hash(password), user['id']))
        db.execute('DELETE FROM sessions WHERE user_id=?', (user['id'],))
        db.execute('DELETE FROM oauth_states WHERE user_id=?', (user['id'],))
    print('Contraseña actualizada; las sesiones anteriores quedaron cerradas.')


def configure(google=False):
    DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = DATA / 'config.toml'
    settings = tomllib.loads(target.read_text(encoding='utf-8')) if target.exists() else {}
    if google:
        section = settings.setdefault('google', {})
        client = input('Google Client ID (Enter conserva el actual): ').strip()
        secret = getpass.getpass('Google Client Secret (Enter conserva el actual): ').strip()
        if client:
            section['client_id'] = client
        if secret:
            section['client_secret'] = secret
        redirect = input('Callback HTTPS autorizado en Google (Enter usa el enlace público + /api/google/callback): ').strip()
        if redirect and (not redirect.startswith('https://') or urlsplit(redirect).path != '/api/google/callback'):
            raise ValueError('El callback debe ser HTTPS y terminar en /api/google/callback.')
        section['redirect_uri'] = redirect
    else:
        section = settings.setdefault('app', {})
        address = input('Enlace HTTPS estable (Enter usa un túnel temporal o acceso local): ').strip().rstrip('/')
        if address:
            parsed = urlsplit(address)
            if parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username:
                raise ValueError('Usa un origen HTTPS, sin ruta ni credenciales.')
        section['public_url'] = address
        raw_port = input('Puerto local [8787]: ').strip() or '8787'
        if not raw_port.isdigit() or not 1024 <= int(raw_port) <= 65535:
            raise ValueError('Puerto inválido.')
        section['port'] = int(raw_port)
    lines = []
    for table, values in settings.items():
        if not re.fullmatch(r'[A-Za-z0-9_]+', table):
            raise ValueError('Nombre de sección inválido en config.toml.')
        lines.append(f'[{table}]')
        for key, value in values.items():
            if not re.fullmatch(r'[A-Za-z0-9_]+', key) or not isinstance(value, (str, int)):
                raise ValueError('Formato de configuración no compatible.')
            lines.append(f'{key} = {json.dumps(value, ensure_ascii=True)}')
        lines.append('')
    descriptor, temporary = tempfile.mkstemp(dir=DATA, prefix='.config-')
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write('\n'.join(lines))
        os.replace(temporary, target)
        target.chmod(0o600)
    finally:
        if Path(temporary).exists():
            Path(temporary).unlink()
    print('Configuración guardada de forma local. Reinicia la app para aplicarla.')


def server_command(port):
    return [str(PYTHON), '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(port), '--no-proxy-headers', '--no-access-log']


def ensure_free_port(port):
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(('127.0.0.1', port))
        except OSError:
            raise ValueError(f'El puerto {port} está ocupado. Detén la otra instancia antes de abrir un túnel.') from None


def serve(port):
    ensure_users()
    print(f'App compilada y API en el puerto local {port}. Ctrl+C para detener.')
    process = subprocess.Popen(server_command(port), cwd=RUNTIME / 'backend')
    try:
        process.wait()
        if process.returncode:
            raise ValueError('El servidor terminó con un error.')
    finally:
        stop_process(process)


def stop_process(process):
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def wait_health(port, process, instance):
    from urllib.request import urlopen
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise ValueError('El servidor no pudo arrancar; revisa el error anterior y el puerto.')
        try:
            with urlopen(f'http://127.0.0.1:{port}/api/health', timeout=1) as response:
                if response.headers.get('X-Finanzas-Instance') == instance and json.load(response) == {'status': 'ok'}:
                    return
        except Exception:
            pass
        time.sleep(0.2)
    raise ValueError('El servidor no respondió a la comprobación de salud.')


def tunnel(port, name=None):
    ensure_users()
    ensure_free_port(port)
    # Creating the HTTPS URL does not grant access: the app always requires login.
    binary = shutil.which('cloudflared')
    if not binary:
        raise ValueError('Instala cloudflared: Windows: winget install --exact --id Cloudflare.cloudflared; macOS: brew install cloudflared. Linux: consulta docs/ACCESO_IPHONE.md.')
    if name and not os.environ.get('FINANZAS_PUBLIC_URL'):
        raise ValueError('Configura primero la dirección HTTPS de tu túnel con configure.')
    cloud, server = None, None
    env = os.environ.copy()
    try:
        if not name:
            cloud = subprocess.Popen([binary, 'tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', f'http://127.0.0.1:{port}'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace', bufsize=1)
            lines = queue.Queue(maxsize=200)
            def read_output():
                for line in cloud.stdout:
                    try:
                        lines.put_nowait(line)
                    except queue.Full:
                        pass
                try:
                    lines.put_nowait(None)
                except queue.Full:
                    pass
            threading.Thread(target=read_output, daemon=True).start()
            deadline = time.monotonic() + 60
            public = None
            while time.monotonic() < deadline:
                try:
                    line = lines.get(timeout=0.5)
                except queue.Empty:
                    if cloud.poll() is not None:
                        break
                    continue
                if line is None:
                    break
                match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
                if match:
                    public = match.group(0)
                    break
            if not public:
                raise ValueError('Cloudflare no entregó un enlace. Comprueba Internet y que no haya un config.yml de túnel nombrado en ~/.cloudflared; no se modificó ese archivo.')
            # Every quick tunnel has a different URL. Ignore a stale callback.
            env['FINANZAS_PUBLIC_URL'] = public
            env['GOOGLE_REDIRECT_URI'] = public + '/api/google/callback'
        else:
            public = env['FINANZAS_PUBLIC_URL']
        # Validate users in the child environment to avoid importing auth with
        # an old public origin before the temporary URL is known.
        import secrets
        instance = secrets.token_hex(16)
        env['FINANZAS_INSTANCE_ID'] = instance
        server = subprocess.Popen(server_command(port), cwd=RUNTIME / 'backend', env=env)
        wait_health(port, server, instance)
        if name:
            cloud = subprocess.Popen([binary, 'tunnel', '--no-autoupdate', '--protocol', 'http2', 'run', name])
        print(f'\nAbre este enlace en Safari: {public}', flush=True)
        print('Usa tu usuario y contraseña. El enlace temporal cambia al reiniciar.', flush=True)
        print(f'Callback de Google para este enlace: {public}/api/google/callback', flush=True)
        print('Google debe autorizar exactamente ese callback; no está validado automáticamente. Ctrl+C cierra app y túnel.', flush=True)
        while True:
            if server.poll() is not None or cloud.poll() is not None:
                raise ValueError('La app o el túnel se detuvo. Revisa la conexión y vuelve a iniciarlo.')
            time.sleep(0.5)
    finally:
        stop_process(server)
        stop_process(cloud)


def funnel(port):
    """Optional free hostname from the owner's Tailscale node; no purchased domain."""
    ensure_users()
    ensure_free_port(port)
    binary = shutil.which('tailscale')
    if not binary:
        raise ValueError('Instala Tailscale y conecta esta computadora a tu cuenta antes de usar funnel.')
    try:
        status = json.loads(subprocess.check_output([binary, 'status', '--json'], text=True, timeout=15))
        hostname = status.get('Self', {}).get('DNSName', '').rstrip('.')
    except (subprocess.CalledProcessError, json.JSONDecodeError, subprocess.TimeoutExpired):
        raise ValueError('Tailscale no está conectado. Abre Tailscale e inicia sesión.') from None
    if status.get('BackendState') != 'Running' or not re.fullmatch(r'[a-z0-9.-]+\.ts\.net', hostname):
        raise ValueError('Hace falta una computadora conectada con MagicDNS y HTTPS habilitados en Tailscale.')
    public = 'https://' + hostname
    env = os.environ.copy()
    env['FINANZAS_PUBLIC_URL'] = public
    env['GOOGLE_REDIRECT_URI'] = public + '/api/google/callback'
    import secrets
    instance = secrets.token_hex(16)
    env['FINANZAS_INSTANCE_ID'] = instance
    server, proxy = None, None
    try:
        server = subprocess.Popen(server_command(port), cwd=RUNTIME / 'backend', env=env)
        wait_health(port, server, instance)
        # Foreground mode removes this temporary handler when the process exits;
        # never reset existing Tailscale services or change the tailnet policy.
        proxy = subprocess.Popen([binary, 'funnel', '--https=443', f'http://127.0.0.1:{port}'])
        print(f'Enlace de esta computadora: {public}', flush=True)
        print(f'Callback Google: {public}/api/google/callback', flush=True)
        print('Tailscale puede pedir habilitar Funnel en tu cuenta. El servicio anuncia cuando el enlace está activo; Ctrl+C lo cierra.', flush=True)
        while True:
            if proxy.poll() is not None or server.poll() is not None:
                raise ValueError('El servidor o Funnel se detuvo. Revisa los requisitos de Tailscale.')
            time.sleep(0.5)
    finally:
        stop_process(proxy)
        stop_process(server)


def backup(output=None):
    from cryptography.fernet import Fernet
    import base64
    import hashlib
    import io
    import zipfile
    ensure_users()
    password = getpass.getpass('Contraseña para cifrar el respaldo (mínimo 12 caracteres): ')
    if len(password) < 12 or password != getpass.getpass('Repite la contraseña del respaldo: '):
        raise ValueError('La contraseña debe coincidir y tener al menos 12 caracteres.')
    destination = Path(output).expanduser().resolve() if output else RUNTIME / 'backups' / (time.strftime('finanzas-%Y%m%d-%H%M%S')+'.backup')
    if destination.exists():
        raise ValueError('Ese respaldo ya existe; elige otro nombre.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        staging = Path(temporary)
        for source in [DATA / 'auth.sqlite3', *(DATA / 'users').glob('*.sqlite3')]:
            relative = source.relative_to(DATA)
            target = staging / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with closing(sqlite3.connect(source)) as original, closing(sqlite3.connect(target)) as snapshot:
                original.backup(snapshot)
        for name in ('token.key', 'config.toml'):
            if (DATA / name).exists():
                shutil.copy2(DATA / name, staging / name)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            for source in staging.rglob('*'):
                if source.is_file():
                    archive.write(source, source.relative_to(staging).as_posix())
        salt = os.urandom(16)
        key = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
        encrypted = b'FINANZAS1' + salt + Fernet(base64.urlsafe_b64encode(key)).encrypt(buffer.getvalue())
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as result:
            result.write(encrypted)
    print(f'Respaldo cifrado creado: {destination}. Conserva su contraseña por separado.')


def restore(source):
    from cryptography.fernet import Fernet, InvalidToken
    import base64
    import hashlib
    import io
    import zipfile
    if DATA.exists() and any(DATA.iterdir()):
        raise ValueError('La carpeta de datos debe estar vacía. No se sobrescribe una instalación existente.')
    content = Path(source).expanduser().read_bytes()
    if not content.startswith(b'FINANZAS1'):
        raise ValueError('Formato de respaldo no reconocido.')
    password = getpass.getpass('Contraseña del respaldo: ')
    key = hashlib.scrypt(password.encode(), salt=content[9:25], n=16384, r=8, p=1, dklen=32)
    try:
        plain = Fernet(base64.urlsafe_b64encode(key)).decrypt(content[25:])
    except InvalidToken:
        raise ValueError('Contraseña incorrecta o respaldo alterado.') from None
    with zipfile.ZipFile(io.BytesIO(plain)) as archive:
        names = archive.namelist()
        allowed = re.compile(r'^(auth\.sqlite3|token\.key|config\.toml|users/[0-9a-f]{32}\.sqlite3)$')
        if len(names)!=len(set(names)) or any(not allowed.fullmatch(name) for name in names) or not {'auth.sqlite3','token.key'}.issubset(names):
            raise ValueError('Contenido del respaldo inválido.')
        if sum(item.file_size for item in archive.infolist()) > 1024**3:
            raise ValueError('Respaldo demasiado grande para esta herramienta.')
        DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
        for name in names:
            destination = DATA / name
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'wb') as result:
                result.write(archive.read(name))
    with sqlite3.connect(DATA / 'auth.sqlite3') as db:
        db.execute('DELETE FROM sessions')
        db.execute('DELETE FROM oauth_states')
    print('Respaldo restaurado; las sesiones anteriores se han cerrado. Revisa la dirección pública antes de arrancar.')


def main():
    parser = argparse.ArgumentParser(description='FinanzasApp para tu computadora e iPhone')
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('install','serve','configure','google-configure','check-users','test','funnel'):
        commands.add_parser(name)
    for name in ('user-add','password-reset','admin-grant'):
        commands.add_parser(name).add_argument('username')
    tunneling = commands.add_parser('tunnel')
    tunneling.add_argument('--name', help='Nombre de un túnel Cloudflare ya configurado; omitir para enlace gratuito temporal')
    commands.add_parser('backup').add_argument('--output')
    commands.add_parser('restore').add_argument('file')
    args = parser.parse_args()
    if args.command == 'install':
        install()
        return
    require_install()
    if Path(sys.prefix).resolve() != (RUNTIME / '.venv').resolve():
        run([PYTHON, __file__, *sys.argv[1:]], ROOT)
        return
    port = environment()
    actions = {
        'admin-grant': lambda: (auth_module().grant_admin(args.username), print('Administración asignada. Vuelve a entrar en la app.')),
        'user-add': lambda: add_user(args.username), 'password-reset': lambda: reset_password(args.username),
        'configure': configure, 'google-configure': lambda: configure(True), 'serve': lambda: serve(port),
        'tunnel': lambda: tunnel(port, args.name), 'funnel': lambda: funnel(port), 'check-users': ensure_users,
        'backup': lambda: backup(args.output), 'restore': lambda: restore(args.file),
        'test': lambda: run([PYTHON,'-m','unittest','discover','-s',ROOT/'backend/tests','-v'],RUNTIME/'backend')}
    actions[args.command]()


if __name__ == '__main__':
    def terminate(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, terminate)
    try:
        main()
    except KeyboardInterrupt:
        print('\nDetenido.')
    except (ValueError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f'Error: {error}', file=sys.stderr)
        sys.exit(1)
