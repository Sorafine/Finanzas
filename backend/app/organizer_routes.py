"""Personal tasks and daily habits, stored in the authenticated user's database."""
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .main import connection

router = APIRouter(prefix='/organizer', tags=['Mi día'])


def today_in_peru():
    return datetime.now(ZoneInfo('America/Lima')).date()


def init_organizer(db):
    db.executescript('''
        CREATE TABLE IF NOT EXISTS personal_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            area TEXT NOT NULL CHECK(area IN ('study','personal','home')),
            due_on TEXT,
            priority TEXT NOT NULL CHECK(priority IN ('normal','high')),
            completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1))
        );
        CREATE TABLE IF NOT EXISTS personal_habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS personal_habit_days (
            habit_id INTEGER NOT NULL REFERENCES personal_habits(id) ON DELETE CASCADE,
            day TEXT NOT NULL,
            PRIMARY KEY(habit_id,day)
        );
    ''')


class TitleIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=150)

    @field_validator('title')
    @classmethod
    def nonempty(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('Escribe un nombre')
        return value


class TaskIn(TitleIn):
    area: Literal['study', 'personal', 'home'] = 'personal'
    due_on: date | None = None
    priority: Literal['normal', 'high'] = 'normal'
    course_id: int | None = None

    @field_validator('due_on')
    @classmethod
    def valid_year(cls, value):
        if value and not 2000 <= value.year <= 2100:
            raise ValueError('Elige un año entre 2000 y 2100')
        return value


class CompletionIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    completed: bool = Field(strict=True)


@router.get('')
def overview():
    today = today_in_peru()
    days = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    with connection() as db:
        tasks = [dict(row) for row in db.execute('''SELECT t.*,c.title AS course_title,c.color AS course_color FROM personal_tasks t
            LEFT JOIN student_courses c ON c.id=t.course_id
            ORDER BY t.completed, CASE WHEN t.due_on IS NULL THEN 1 ELSE 0 END,
            t.due_on, CASE WHEN t.priority='high' THEN 0 ELSE 1 END, t.id DESC''')]
        habits = [dict(row) for row in db.execute('SELECT * FROM personal_habits ORDER BY id')]
        marks = {}
        for row in db.execute('SELECT habit_id,day FROM personal_habit_days WHERE day>=? AND day<=?', (days[0], days[-1])):
            marks.setdefault(row['habit_id'], []).append(row['day'])
        for habit in habits:
            habit['days'] = sorted(marks.get(habit['id'], []))
        return {'today': today.isoformat(), 'week': days, 'tasks': tasks, 'habits': habits}


@router.post('/tasks', status_code=201)
def add_task(item: TaskIn):
    with connection() as db:
        if item.course_id is not None:
            from .student_routes import course_exists
            course_exists(db, item.course_id)
        row = db.execute('INSERT INTO personal_tasks(title,area,due_on,priority,course_id) VALUES(?,?,?,?,?)',
                         (item.title, item.area, item.due_on.isoformat() if item.due_on else None, item.priority, item.course_id))
        return {'id': row.lastrowid}


@router.put('/tasks/{task_id}')
def edit_task(task_id: int, item: TaskIn):
    with connection() as db:
        if item.course_id is not None:
            from .student_routes import course_exists
            course_exists(db, item.course_id)
        row = db.execute('UPDATE personal_tasks SET title=?,area=?,due_on=?,priority=?,course_id=? WHERE id=?',
                         (item.title, item.area, item.due_on.isoformat() if item.due_on else None, item.priority, item.course_id, task_id))
        if not row.rowcount:
            raise HTTPException(404, 'Tarea no encontrada')
        return {'updated': True}


@router.patch('/tasks/{task_id}')
def complete_task(task_id: int, item: CompletionIn):
    with connection() as db:
        if not db.execute('UPDATE personal_tasks SET completed=? WHERE id=?', (int(item.completed), task_id)).rowcount:
            raise HTTPException(404, 'Tarea no encontrada')
        return {'completed': item.completed}


@router.delete('/tasks/{task_id}')
def delete_task(task_id: int):
    with connection() as db:
        if not db.execute('DELETE FROM personal_tasks WHERE id=?', (task_id,)).rowcount:
            raise HTTPException(404, 'Tarea no encontrada')
        return {'deleted': True}


@router.post('/habits', status_code=201)
def add_habit(item: TitleIn):
    with connection() as db:
        row = db.execute('INSERT INTO personal_habits(title) VALUES(?)', (item.title,))
        return {'id': row.lastrowid}


@router.put('/habits/{habit_id}')
def edit_habit(habit_id: int, item: TitleIn):
    with connection() as db:
        if not db.execute('UPDATE personal_habits SET title=? WHERE id=?', (item.title, habit_id)).rowcount:
            raise HTTPException(404, 'Hábito no encontrado')
        return {'updated': True}


@router.patch('/habits/{habit_id}')
def mark_habit(habit_id: int, item: CompletionIn):
    day = today_in_peru().isoformat()
    with connection() as db:
        if not db.execute('SELECT 1 FROM personal_habits WHERE id=?', (habit_id,)).fetchone():
            raise HTTPException(404, 'Hábito no encontrado')
        if item.completed:
            db.execute('INSERT OR IGNORE INTO personal_habit_days(habit_id,day) VALUES(?,?)', (habit_id, day))
        else:
            db.execute('DELETE FROM personal_habit_days WHERE habit_id=? AND day=?', (habit_id, day))
        return {'day': day, 'completed': item.completed}


@router.delete('/habits/{habit_id}')
def delete_habit(habit_id: int):
    with connection() as db:
        if not db.execute('DELETE FROM personal_habits WHERE id=?', (habit_id,)).rowcount:
            raise HTTPException(404, 'Hábito no encontrado')
        return {'deleted': True}
