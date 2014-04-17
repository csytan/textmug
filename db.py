import datetime
import os

import peewee


database = peewee.SqliteDatabase('database')
database.connect()


class BaseModel(peewee.Model):
    class Meta:
        database = database


class User(BaseModel):
    id = peewee.TextField(primary_key=True)
    email = peewee.TextField(unique=True, null=True)
    password = peewee.TextField()
    joined = peewee.DateTimeField()

    @classmethod
    def get_by_id(cls, id):
        return cls.select().where(cls.id == id).first()

    def is_admin(self):
        if self.id == 'csytan':
            return True
        return False



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

    @property
    def page_name(self):
        if self.user:
            return self.name.split('/')[1]
        elif self.name is not None:
            return self.name
        return str(self.id)

    def editable(self, user):
        if not self.id or \
            (user and user.is_admin) or \
            (user and self._data['user'] == user.id):
            return True
        return False


peewee.create_model_tables([User, Page], fail_silently=True)

