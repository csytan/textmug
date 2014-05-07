import concurrent.futures
import datetime
import json
import os
import uuid

import bcrypt
import peewee



database = peewee.SqliteDatabase('database')
database.connect()

thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)


def future_thread(func):
    def wrapper(*args, **kwargs):
        return thread_pool.submit(func, *args, **kwargs)
    return wrapper



class BaseModel(peewee.Model):
    class Meta:
        database = database


class Settings(BaseModel):
    id = peewee.PrimaryKeyField()
    value = peewee.TextField()

    @classmethod
    def get_setting(cls, arg):
        try:
            settings = cls.get(cls.id == '1')
        except peewee.DoesNotExist:
            defaults = json.dumps({
                'cookie_secret': str(uuid.uuid4())
            })
            settings = cls.create(value=defaults)
        settings = json.loads(settings.value)
        return settings['cookie_secret']


class User(BaseModel):
    id = peewee.CharField(primary_key=True, max_length=20)
    email = peewee.TextField(unique=True, null=True)
    password_hash = peewee.TextField()
    joined = peewee.DateTimeField()

    @classmethod
    def get_by_id(cls, id):
        return cls.select().where(cls.id == id).first()

    @classmethod
    def get_users(cls):
        return cls.select().order_by(cls.id)

    def is_admin(self):
        if self.id == 'csytan':
            return True
        return False

    @future_thread
    def set_password(self, password):
        self.password_hash = bcrypt.hashpw(password, bcrypt.gensalt())

    @future_thread
    def check_password(self, password):
        return bcrypt.checkpw(password, self.password_hash)

    def get_pages(self, current_user=False):
        q = self.pages.order_by(Page.name)
        if not current_user:
            q = q.where(Page.public == True)
        return [p for p in q]



class Page(BaseModel):
    id = peewee.PrimaryKeyField()
    name = peewee.TextField(unique=True, null=True)
    user = peewee.ForeignKeyField(User, null=True, related_name='pages')
    created = peewee.DateTimeField()
    text = peewee.TextField(default='')
    public = peewee.BooleanField(default=True)
    encrypted = peewee.BooleanField(default=False)

    @classmethod
    def get_by_id(cls, id):
        return cls.select().where(cls.id == id).first()

    @classmethod
    def get_by_name(cls, name):
        return cls.select().where(cls.name == name).first()

    @classmethod
    def get_recent(cls):
        return cls.select().where(cls.public == True).order_by(cls.created.desc())

    @property
    def page_name(self):
        if self.user and self.name:
            return self.name.split('/')[1]
        elif self.name is not None:
            return self.name
        return str(self.id)

    def editable(self, user):
        if not self.id or \
            (user and user.is_admin()) or \
            (user and self._data['user'] == user.id):
            return True
        return False


peewee.create_model_tables([Settings, User, Page], fail_silently=True)

