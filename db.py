import datetime
import os
import sqlite3


db_path = os.path.join(os.path.dirname(__file__), 'database')
db_exists = os.path.isfile(db_path)
con = sqlite3.connect(db_path)


def dict_factory(cursor, row):
    return {
        col[0]: row[i] for i, col in enumerate(cursor.description)
    }

con.row_factory = dict_factory


if not db_exists:
    # Initialize DB

    con.execute("""
    CREATE TABLE users(
        username TEXT PRIMARY KEY,
        joined TEXT,
        email TEXT UNIQUE,
        password TEXT
    );""")

    con.execute("""
    CREATE TABLE pages(
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        username TEXT,
        text TEXT,
        private INTEGER DEFAULT 0,
        encrypted INTEGER DEFAULT 0,
        FOREIGN KEY(username) REFERENCES users(username)
    );
    """)


def execute_table(sql, table, **kwargs):
    """
    Takes kwargs, and formats them for parameter substitution in an SQL command

        prepare_data(name="Joe", email="joe@joe.com", age=21)

        Returns: [['name', 'email', 'age'], ['Joe', 'joe@joe.com', 21]]
    """
    keys, values = zip(*kwargs.items())
    con.execute(sql, [table] + keys + values)


def insert(table, **kwargs):
    sql = 'INSERT INTO {}({}) VALUES({})'
    keys, values = zip(*kwargs.items())
    sql = sql.format(table, ','.join(keys), ','.join('?' * len(values)))
    con.execute(sql, values)


def get_user(username):
    sql = 'SELECT * FROM users WHERE username=?'
    cur = con.execute(sql, [username])
    return cur.fetchone()

def create_user(username, password, email=None):
    sql = 'INSERT INTO users(username, email, password) VALUES(?,?,?)'
    cur = con.execute(sql, [username, email, password])
    con.commit()
    return cur.lastrowid

def update_user(id, email, password):
    sql = 'UPDATE users SET email=?, password=? WHERE id=?'
    cur = con.execute(sql, [email, password, id])
    con.commit()
    return cur.lastrowid


def get_page(id):
    sql = 'SELECT * FROM pages WHERE id=?'
    cur = con.execute(sql, [id])
    return cur.fetchone()

def create_page(text, username=None, private=False, encrypted=False):
    sql = 'INSERT INTO pages(text, username, private, encrypted) VALUES(?,?,?,?)'
    cur = con.execute(sql, [text, username, private, encrypted])
    con.commit()
    return cur.lastrowid

def update_page(id, text, private=False, encrypted=False):
    sql = 'UPDATE pages SET text=?, private=?, encrypted=? WHERE id=?'
    cur = con.execute(sql, [text, private, encrypted, id])
    con.commit()
    return cur.lastrowid








