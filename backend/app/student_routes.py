"""Private student workspace: weighted grades, timetable, study and wellbeing."""
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from typing import Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator
from .main import connection
from .organizer_routes import TitleIn, today_in_peru

router = APIRouter(prefix='/student', tags=['Agenda del estudiante'])
PERU = ZoneInfo('America/Lima')


def init_student(db):
    db.executescript('''
        CREATE TABLE IF NOT EXISTS student_courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
            color TEXT NOT NULL, maximum REAL NOT NULL, passing REAL NOT NULL,
            rounding TEXT NOT NULL DEFAULT 'none'
        );
        CREATE TABLE IF NOT EXISTS student_assessments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL REFERENCES student_courses(id) ON DELETE CASCADE,
            title TEXT NOT NULL, weight REAL NOT NULL, grade REAL
        );
        CREATE TABLE IF NOT EXISTS student_classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL REFERENCES student_courses(id) ON DELETE CASCADE,
            weekday INTEGER NOT NULL, starts TEXT NOT NULL, ends TEXT NOT NULL, room TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS student_moods (day TEXT PRIMARY KEY, mood INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS student_preferences (
            id INTEGER PRIMARY KEY CHECK(id=1), sleep_hours REAL NOT NULL DEFAULT 8,
            preparation_minutes INTEGER NOT NULL DEFAULT 60, wake_time TEXT NOT NULL DEFAULT '07:00'
        );
        INSERT OR IGNORE INTO student_preferences(id) VALUES(1);
        CREATE TABLE IF NOT EXISTS student_focus_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER REFERENCES student_courses(id) ON DELETE SET NULL,
            minutes INTEGER NOT NULL, day TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS student_timer (
            id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL,
            course_id INTEGER REFERENCES student_courses(id) ON DELETE SET NULL,
            duration INTEGER NOT NULL, remaining REAL NOT NULL, running_since REAL
        );
    ''')
    if 'course_id' not in {r['name'] for r in db.execute('PRAGMA table_info(personal_tasks)')}:
        db.execute('ALTER TABLE personal_tasks ADD COLUMN course_id INTEGER REFERENCES student_courses(id) ON DELETE SET NULL')


class CourseIn(TitleIn):
    color: str = Field(default='#5b93da', pattern=r'^#[0-9a-fA-F]{6}$')
    maximum: Decimal = Field(default=Decimal(20), gt=0, le=100, decimal_places=2)
    passing: Decimal = Field(default=Decimal(11), gt=0, le=100, decimal_places=2)
    rounding: Literal['none', 'half_up_integer'] = 'half_up_integer'

    @model_validator(mode='after')
    def valid_scale(self):
        if self.passing > self.maximum:
            raise ValueError('La nota mínima no puede superar la máxima')
        if self.rounding != 'none' and (self.passing != self.passing.to_integral() or self.maximum != self.maximum.to_integral()):
            raise ValueError('Para redondeo entero usa una escala y una nota mínima enteras')
        return self


class AssessmentIn(TitleIn):
    weight: Decimal = Field(gt=0, le=100, decimal_places=2)
    grade: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)


def grade_projection(course, assessments):
    """Use exact decimal arithmetic; blank grades are pending, zero is evaluated."""
    dec = lambda x: Decimal(str(x))
    total = sum((dec(a['weight']) for a in assessments), Decimal(0))
    evaluated = sum((dec(a['weight']) for a in assessments if a['grade'] is not None), Decimal(0))
    points = sum((dec(a['grade']) * dec(a['weight']) / 100 for a in assessments if a['grade'] is not None), Decimal(0))
    maximum, passing = dec(course['maximum']), dec(course['passing'])
    target = passing if course['rounding'] == 'none' else passing - Decimal('0.5')
    average = points * 100 / evaluated if evaluated else None
    remaining = 100 - evaluated
    required = max(Decimal(0), (target - points) * 100 / remaining) if remaining else None
    maximum_final = points + maximum * remaining / 100
    final = points.quantize(Decimal(1), rounding=ROUND_HALF_UP) if course['rounding'] != 'none' else points
    if total != 100:
        status = 'incomplete_plan'
    elif not remaining:
        status = 'passed' if final >= passing else 'failed'
    elif maximum_final < target:
        status = 'unreachable'
    elif points >= target:
        status = 'secured'
    elif average is None:
        status = 'no_grades'
    elif average < target:
        status = 'at_risk'
    else:
        status = 'on_track'
    return {'total_weight': float(total), 'evaluated_weight': float(evaluated),
            'remaining_weight': float(remaining), 'earned_points': float(points),
            'average': float(average) if average is not None else None,
            'required_average': float(required.quantize(Decimal('.01'), rounding=ROUND_CEILING)) if required is not None and total == 100 else None,
            'maximum_final': float(maximum_final) if total == 100 else None,
            'final_grade': float(final) if evaluated == 100 else None,
            'status': status}


def course_exists(db, course_id):
    row = db.execute('SELECT * FROM student_courses WHERE id=?', (course_id,)).fetchone()
    if not row:
        raise HTTPException(404, 'Curso no encontrado')
    return row


@router.get('/courses')
def courses():
    with connection() as db:
        result = []
        for row in db.execute('SELECT * FROM student_courses ORDER BY id'):
            course = dict(row)
            assessments = [dict(a) for a in db.execute('SELECT * FROM student_assessments WHERE course_id=? ORDER BY id', (row['id'],))]
            result.append({**course, 'assessments': assessments, 'projection': grade_projection(course, assessments)})
        return result


@router.post('/courses', status_code=201)
def add_course(item: CourseIn):
    with connection() as db:
        row = db.execute('INSERT INTO student_courses(title,color,maximum,passing,rounding) VALUES(?,?,?,?,?)',
                         (item.title, item.color, float(item.maximum), float(item.passing), item.rounding))
        return {'id': row.lastrowid}


@router.put('/courses/{course_id}')
def edit_course(course_id: int, item: CourseIn):
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        course_exists(db, course_id)
        if db.execute('SELECT 1 FROM student_assessments WHERE course_id=? AND grade>?', (course_id, float(item.maximum))).fetchone():
            raise HTTPException(400, 'La nueva escala dejaría notas fuera de rango. Corrígelas antes de cambiarla.')
        db.execute('UPDATE student_courses SET title=?,color=?,maximum=?,passing=?,rounding=? WHERE id=?',
                   (item.title, item.color, float(item.maximum), float(item.passing), item.rounding, course_id))
        return {'updated': True}


@router.delete('/courses/{course_id}')
def delete_course(course_id: int):
    with connection() as db:
        course_exists(db, course_id)
        db.execute('DELETE FROM student_courses WHERE id=?', (course_id,))
        return {'deleted': True}


def save_assessment(course_id, item, assessment_id=None):
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        course = course_exists(db, course_id)
        if assessment_id is not None and not db.execute('SELECT 1 FROM student_assessments WHERE id=? AND course_id=?', (assessment_id, course_id)).fetchone():
            raise HTTPException(404, 'Evaluación no encontrada')
        if item.grade is not None and item.grade > Decimal(str(course['maximum'])):
            raise HTTPException(400, 'La nota supera la escala del curso')
        weights = [Decimal(str(r['weight'])) for r in db.execute('SELECT weight FROM student_assessments WHERE course_id=? AND id!=?', (course_id, assessment_id or -1))]
        if sum(weights, Decimal(0)) + item.weight > 100:
            raise HTTPException(400, 'Los pesos de las evaluaciones no pueden superar 100%')
        values = (item.title, float(item.weight), float(item.grade) if item.grade is not None else None)
        if assessment_id is None:
            row = db.execute('INSERT INTO student_assessments(title,weight,grade,course_id) VALUES(?,?,?,?)', (*values, course_id))
            return {'id': row.lastrowid}
        db.execute('UPDATE student_assessments SET title=?,weight=?,grade=? WHERE id=? AND course_id=?', (*values, assessment_id, course_id))
        return {'updated': True}


@router.post('/courses/{course_id}/assessments', status_code=201)
def add_assessment(course_id: int, item: AssessmentIn):
    return save_assessment(course_id, item)


@router.put('/courses/{course_id}/assessments/{assessment_id}')
def edit_assessment(course_id: int, assessment_id: int, item: AssessmentIn):
    return save_assessment(course_id, item, assessment_id)


@router.delete('/courses/{course_id}/assessments/{assessment_id}')
def delete_assessment(course_id: int, assessment_id: int):
    with connection() as db:
        if not db.execute('DELETE FROM student_assessments WHERE id=? AND course_id=?', (assessment_id, course_id)).rowcount:
            raise HTTPException(404, 'Evaluación no encontrada')
        return {'deleted': True}


class ClassIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    course_id: int
    weekday: int = Field(ge=0, le=6)
    starts: str = Field(pattern=r'^([01][0-9]|2[0-3]):[0-5][0-9]$')
    ends: str = Field(pattern=r'^([01][0-9]|2[0-3]):[0-5][0-9]$')
    room: str = Field(default='', max_length=100)

    @model_validator(mode='after')
    def valid_time(self):
        if self.ends <= self.starts:
            raise ValueError('La hora final debe ser posterior al inicio, en el mismo día')
        return self


@router.get('/classes')
def classes():
    with connection() as db:
        return [dict(r) for r in db.execute('''SELECT s.*,c.title AS course_title,c.color FROM student_classes s
            JOIN student_courses c ON c.id=s.course_id ORDER BY weekday,starts,id''')]


def save_class(item, class_id=None):
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        course_exists(db, item.course_id)
        if class_id is not None and not db.execute('SELECT 1 FROM student_classes WHERE id=?', (class_id,)).fetchone():
            raise HTTPException(404, 'Clase no encontrada')
        if db.execute('SELECT 1 FROM student_classes WHERE weekday=? AND starts<? AND ends>? AND id!=?',
                      (item.weekday, item.ends, item.starts, class_id or -1)).fetchone():
            raise HTTPException(409, 'Esta clase se cruza con otra de tu horario')
        values = (item.course_id, item.weekday, item.starts, item.ends, item.room.strip())
        if class_id is None:
            return {'id': db.execute('INSERT INTO student_classes(course_id,weekday,starts,ends,room) VALUES(?,?,?,?,?)', values).lastrowid}
        db.execute('UPDATE student_classes SET course_id=?,weekday=?,starts=?,ends=?,room=? WHERE id=?', (*values, class_id))
        return {'updated': True}


@router.post('/classes', status_code=201)
def add_class(item: ClassIn):
    return save_class(item)


@router.put('/classes/{class_id}')
def edit_class(class_id: int, item: ClassIn):
    return save_class(item, class_id)


@router.delete('/classes/{class_id}')
def delete_class(class_id: int):
    with connection() as db:
        if not db.execute('DELETE FROM student_classes WHERE id=?', (class_id,)).rowcount:
            raise HTTPException(404, 'Clase no encontrada')
        return {'deleted': True}


class MoodIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mood: int = Field(ge=1, le=5, strict=True)


@router.put('/mood')
def save_mood(item: MoodIn):
    with connection() as db:
        db.execute('INSERT INTO student_moods(day,mood) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET mood=excluded.mood', (today_in_peru().isoformat(), item.mood))
        return {'saved': True}


@router.delete('/mood')
def delete_mood():
    with connection() as db:
        db.execute('DELETE FROM student_moods WHERE day=?', (today_in_peru().isoformat(),))
        return {'deleted': True}


class PreferencesIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    sleep_hours: Decimal = Field(ge=6, le=12, decimal_places=1)
    preparation_minutes: int = Field(ge=0, le=240)
    wake_time: str = Field(pattern=r'^([01][0-9]|2[0-3]):[0-5][0-9]$')


@router.put('/preferences')
def save_preferences(item: PreferencesIn):
    with connection() as db:
        db.execute('UPDATE student_preferences SET sleep_hours=?,preparation_minutes=?,wake_time=? WHERE id=1',
                   (float(item.sleep_hours), item.preparation_minutes, item.wake_time))
        return {'saved': True}


@router.get('/wellbeing')
def wellbeing():
    today = today_in_peru()
    tomorrow = today + timedelta(days=1)
    first = today - timedelta(days=6)
    with connection() as db:
        prefs = dict(db.execute('SELECT * FROM student_preferences WHERE id=1').fetchone())
        moods = [dict(r) for r in db.execute('SELECT * FROM student_moods WHERE day>=? AND day<=? ORDER BY day', (first.isoformat(), today.isoformat()))]
        next_class = db.execute('''SELECT s.starts,c.title FROM student_classes s JOIN student_courses c ON c.id=s.course_id
            WHERE weekday=? ORDER BY starts LIMIT 1''', (tomorrow.weekday(),)).fetchone()
        wake = datetime.combine(tomorrow, time.fromisoformat(prefs['wake_time']), PERU)
        if next_class:
            before_class = datetime.combine(tomorrow, time.fromisoformat(next_class['starts']), PERU) - timedelta(minutes=prefs['preparation_minutes'])
            wake = min(wake, before_class)
        bedtime = wake - timedelta(hours=prefs['sleep_hours'])
        habit_count = db.execute('SELECT count(*) FROM personal_habits').fetchone()[0]
        marks = db.execute('SELECT count(*) FROM personal_habit_days WHERE day>=? AND day<=?', (first.isoformat(), today.isoformat())).fetchone()[0]
        return {'today': today.isoformat(), 'preferences': prefs, 'moods': moods,
                'tomorrow_class': dict(next_class) if next_class else None,
                'wake_at': wake.isoformat(), 'bedtime': bedtime.isoformat(),
                'habit_marks': marks, 'habit_opportunities': habit_count * 7}


def timer_state(db):
    row = db.execute('SELECT * FROM student_timer WHERE id=1').fetchone()
    if not row:
        db.execute('INSERT INTO student_timer VALUES(1,?,NULL,1500,1500,NULL)', (uuid4().hex,))
        row = db.execute('SELECT * FROM student_timer WHERE id=1').fetchone()
    state = dict(row)
    now = datetime.now(PERU).timestamp()
    state['remaining'] = max(0, state['remaining'] - max(0, now - state['running_since'])) if state['running_since'] else state['remaining']
    state['logged'] = bool(db.execute('SELECT 1 FROM student_focus_sessions WHERE request_id=?', ('timer-' + state['token'],)).fetchone())
    return state


@router.get('/focus')
def focus():
    today = today_in_peru()
    monday = today - timedelta(days=today.weekday())
    with connection() as db:
        timer = timer_state(db)
        sessions = [dict(r) for r in db.execute('''SELECT s.*,c.title AS course_title,c.color FROM student_focus_sessions s
            LEFT JOIN student_courses c ON c.id=s.course_id WHERE day>=? AND day<=? ORDER BY s.id DESC''', (monday.isoformat(), today.isoformat()))]
        return {'timer': timer, 'sessions': sessions}


class TimerIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['reset', 'start', 'pause', 'log']
    token: str = Field(min_length=32, max_length=32)
    minutes: Literal[5, 25, 50] = 25
    course_id: int | None = None


@router.post('/timer')
def update_timer(item: TimerIn):
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        state = timer_state(db)
        if state['token'] != item.token:
            raise HTTPException(409, 'El temporizador cambió en otra ventana. Actualiza antes de continuar.')
        if item.action == 'reset':
            if item.course_id is not None:
                course_exists(db, item.course_id)
            db.execute('UPDATE student_timer SET token=?,course_id=?,duration=?,remaining=?,running_since=NULL WHERE id=1',
                       (uuid4().hex, item.course_id, item.minutes * 60, item.minutes * 60))
        elif item.action == 'start':
            if not state['running_since'] and state['remaining'] > 0:
                db.execute('UPDATE student_timer SET running_since=? WHERE id=1', (datetime.now(PERU).timestamp(),))
        elif item.action == 'pause':
            db.execute('UPDATE student_timer SET remaining=?,running_since=NULL WHERE id=1', (state['remaining'],))
        else:
            if state['duration'] == 300:
                raise HTTPException(400, 'Los descansos no se registran como estudio')
            if state['remaining'] > 0:
                raise HTTPException(400, 'La sesión todavía no termina. Puedes registrar aparte los minutos que ya estudiaste.')
            db.execute('INSERT OR IGNORE INTO student_focus_sessions(course_id,minutes,day,request_id) VALUES(?,?,?,?)',
                       (state['course_id'], state['duration'] // 60, today_in_peru().isoformat(), 'timer-' + state['token']))
        return timer_state(db)


class SessionIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    course_id: int | None = None
    minutes: int = Field(ge=1, le=480, strict=True)
    request_id: str = Field(min_length=16, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')


@router.post('/focus/sessions', status_code=201)
def add_session(item: SessionIn):
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        existing = db.execute('SELECT * FROM student_focus_sessions WHERE request_id=?', (item.request_id,)).fetchone()
        if existing:
            if existing['course_id'] != item.course_id or existing['minutes'] != item.minutes:
                raise HTTPException(409, 'Esta sesión ya se guardó con otros datos')
            return {'id': existing['id']}
        if item.course_id is not None:
            course_exists(db, item.course_id)
        row = db.execute('INSERT INTO student_focus_sessions(course_id,minutes,day,request_id) VALUES(?,?,?,?)',
                         (item.course_id, item.minutes, today_in_peru().isoformat(), item.request_id))
        return {'id': row.lastrowid}


@router.delete('/focus/sessions/{session_id}')
def delete_session(session_id: int):
    with connection() as db:
        if not db.execute('DELETE FROM student_focus_sessions WHERE id=?', (session_id,)).rowcount:
            raise HTTPException(404, 'Sesión no encontrada')
        return {'deleted': True}
