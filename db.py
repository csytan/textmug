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



class Page(BaseModel):
    id = peewee.PrimaryKeyField()
    user = peewee.ForeignKeyField(User, null=True, related_name='pages')
    created = peewee.DateTimeField()
    text = peewee.TextField()
    public = peewee.BooleanField(default=False)
    encrypted = peewee.BooleanField(default=False)

    @classmethod
    def get_by_id(cls, id):
        return cls.select().where(cls.id == id).first()



peewee.create_model_tables([User, Page], fail_silently=True)

