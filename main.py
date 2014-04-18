import datetime
import logging
import os
import sys
import threading
import uuid

import tornado.ioloop
import tornado.web
import tornado.gen

import db



class Base(tornado.web.RequestHandler):
    def get_current_user(self):
        username = self.get_secure_cookie('user')
        if username:
            return db.User.get_by_id(username)

    def reload(self, message):
        self.set_secure_cookie('flash', message)
        self.redirect(self.request.path)

    def get_template_namespace(self):
        namespace = super(Base, self).get_template_namespace()
        namespace.update({
            'relative_date': self.relative_date
        })
        return namespace

    @staticmethod
    def relative_date(date):
        td = datetime.datetime.now() - date
        if td.days == 1:
            return '1 day ago'
        elif td.days:
            return str(td.days) + ' days ago'
        elif td.seconds / 60 / 60 == 1:
            return '1 hour ago'
        elif td.seconds > 60 * 60:
            return str(td.seconds / 60 / 60) + ' hours ago'
        elif td.seconds / 60 == 1:
            return '1 minute ago'
        elif td.seconds > 60:
            return str(td.seconds / 60) + ' minutes ago'
        else:
            return str(td.seconds) + ' seconds ago'


class Index(Base):
    def get(self):
        self.render('index.html', text=None)


class User(Base):
    def get(self, id):
        user = db.User.get_by_id(id)
        if not user:
            raise tornado.web.HTTPError(404)
        self.render('user.html', user=user, pages=user.pages)


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

    @tornado.gen.coroutine
    def post(self):
        username = self.get_argument('username', None)
        email = self.get_argument('email', None)
        password = self.get_argument('password', None)

        if not username or not password:
            self.reload('Please enter a username and password')
            raise tornado.gen.Return()

        user = db.User(id=username, joined=datetime.datetime.now())
        yield user.set_password(password)
        user.save(force_insert=True)

        if user.id:
            self.set_secure_cookie('user', user.id)
            self.redirect('/' + user.id)
        else:
            self.redirect('/signup')


class Login(Base):
    def get(self):
        self.render('login.html')

    @tornado.gen.coroutine
    def post(self):
        username = self.get_argument('username', None)
        email = self.get_argument('email', None)
        password = self.get_argument('password', None)

        if not username or not password:
            self.set_secure_cookie('flash', 'Username or Password Incorrect')
            self.reload()
            raise tornado.gen.Return()

        user = db.User.get_by_id(username)
        if not user:
            self.set_secure_cookie('flash', 'Username or Password Incorrect')
            self.reload()
            raise tornado.gen.Return()

        correct_password = yield user.check_password(password)
        if correct_password:
            self.set_secure_cookie('user', user.id)
            self.redirect('/' + user.id)
        else:
            self.set_secure_cookie('flash', 'Username or Password Incorrect')
            self.reload()


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
    'static_path': os.path.join(os.path.dirname(__file__), 'static'),
    'login_url': '/login',
    'debug': False,
    'xsrf_cookies': True,
    'cookie_secret': str(uuid.uuid4())
}


if __name__ == '__main__':
    if 'debug' in sys.argv:
        settings['debug'] = True
    app = tornado.web.Application(routes, **settings)
    app.listen(8888, address='127.0.0.1')
    tornado.ioloop.IOLoop.instance().start()


