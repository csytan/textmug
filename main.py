import datetime
import logging
import os
import sys
import threading
import uuid

import bcrypt
import tornado.ioloop
import tornado.web

import db



class Base(tornado.web.RequestHandler):
    def get_current_user(self):
        username = self.get_secure_cookie('user')
        if username:
            return db.User.get_by_id(username)

    def reload(self):
        self.redirect(self.request.path)


class Index(Base):
    def get(self):
        self.render('index.html', text=None)


class User(Base):
    def get(self, id):
        user = db.User.get_by_id(id)
        pages = user.pages
        self.render('user.html', user=user, pages=pages)


class Page(Base):
    def get(self, name=None, id=None):
        self.render('page.html', page=self.fetch_page(name, id))
        
    def post(self, name=None, id=None):
        page = self.fetch_page(name, id)
        if page.user and \
            (page.user != self.current_user) or \
            (self.current_user and not self.current_user.is_admin()):
            raise tornado.web.HTTPError(401)
        
        page.text = self.get_argument('text', '', strip=False)

        redirect = False if page.id else True
        if self.current_user:
            can_has_chars = 'abcdefghijklmnopqrstuvwxyz0123456789._-'
            page_name = self.get_argument('page_name', '').lower()
            page_name = ''.join(s for s in page_name if s in can_has_chars)
            if page_name:
                page_name = self.current_user.id + '/' + page_name[:30]
                if page_name != page.name:
                    redirect = True
                page.name = page_name

            page.encrypted = bool(self.get_argument('encrypted', False))
            page.public = bool(self.get_argument('public', False))

        page.save()

        if redirect:
            self.write('/' + (page.name or str(page.id)))
        else:
            self.write('1')

    def fetch_page(self, name=None, id=None):
        page = None
        if name == '/':
            page = db.Page.get_by_id(1)
        elif name == '/new':
            page = db.Page(
                user=self.current_user,
                created=datetime.datetime.now())
        elif id:
            page = db.Page.get_by_id(int(id))
        elif name is not None:
            page = db.Page.get_by_name(name)

        if not page:
            raise tornado.web.HTTPError(404)
        return page


class SignUp(Base):
    def get(self):
        self.render('signup.html')

    @tornado.web.asynchronous
    def post(self):
        username = self.get_argument('username', None)
        email = self.get_argument('email', None)
        password = self.get_argument('password', '').encode('utf-8')
        thread = threading.Thread(target=self.hash_password, args=(username, password))
        thread.start()

    def hash_password(self, username, password):
        hashed = bcrypt.hashpw(password, bcrypt.gensalt())
        tornado.ioloop.IOLoop.instance().add_callback(
            self.post2, username, hashed)

    def post2(self, username, hashed):
        user = db.User(id=username, password=hashed, joined=datetime.datetime.now())
        user.save(force_insert=True)
        if user.id:
            self.set_secure_cookie('user', user.id)
            self.redirect('/' + user.id)
        else:
            self.redirect('/signup')


class Login(Base):
    def get(self):
        self.render('login.html')

    @tornado.web.asynchronous
    def post(self):
        username = self.get_argument('username', '').encode('utf8')
        email = self.get_argument('email', None)
        password = self.get_argument('password', '').encode('utf8')
        user = db.User.get_by_id(username)
        if not user:
            self.set_secure_cookie('flash', 'Username or Password Incorrect')
            return self.reload()
        thread = threading.Thread(target=self.check_password, args=(user, password))
        thread.start()

    def check_password(self, user, password):
        db_password = user.password.encode('utf8')
        if not bcrypt.hashpw(password, db_password) == db_password:
            user = None
        tornado.ioloop.IOLoop.instance().add_callback(
            self.post2, user)

    def post2(self, user):
        if user:
            self.set_secure_cookie('user', user.id)
            self.redirect('/' + user.id)
        else:
            self.redirect('/login')


class Logout(Base):
    def get(self):
        self.clear_cookie('user')
        self.redirect('/')


routes = [
    (r'(/)', Page),
    (r'/login', Login),
    (r'/signup', SignUp),
    (r'/logout', Logout),
    (r'(/new)', Page),
    (r'/(?P<id>\d+)', Page),
    (r'/(.+/.+)', Page),
    (r'/(.+)', User)
]

settings = {
    'template_path': os.path.join(os.path.dirname(__file__), 'templates'),
    'login_url': '/login',
    'debug': False,
    'xsrf_cookies': True,
    'cookie_secret': str(uuid.uuid4())
}


if __name__ == '__main__':
    if 'debug' in sys.argv:
        settings['debug'] = True
        settings['static_path'] = os.path.join(os.path.dirname(__file__), 'static')
    app = tornado.web.Application(routes, **settings)
    app.listen(8888, address='127.0.0.1')
    tornado.ioloop.IOLoop.instance().start()


