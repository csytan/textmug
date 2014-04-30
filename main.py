import datetime
import logging
import os
import sys

import tornado.ioloop
import tornado.web
import tornado.gen

import db


class Base(tornado.web.RequestHandler):
    def get_current_user(self):
        username = self.get_secure_cookie('user')
        if username:
            return db.User.get_by_id(username)

    def reload(self, flash=None):
        if flash:
            self.set_secure_cookie('flash', flash)
        self.redirect(self.request.path)

    def get_and_clear_flash(self):
        flash = self.get_secure_cookie('flash')
        self.clear_cookie('flash')
        return flash

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
        if self.current_user == user:
            pages = user.pages
        else:
            pages = user.pages.where(db.Page.public == True)
        self.render('user.html', user=user, pages=pages)


class Page(Base):
    def get(self, name=None, id=None):
        page = self.fetch_page(name, id)
        if not page or (not page.public and not page.editable(self.current_user)):
            raise tornado.web.HTTPError(404)
        self.render('page.html', page=page)
        
    def post(self, name=None, id=None):
        page = self.fetch_page(name, id)
        if page.user != self.current_user:
            if not self.current_user or not self.current_user.is_admin():
                raise tornado.web.HTTPError(401)
        
        action = self.get_argument('action', None)
        if action == 'save':
            page.text = self.get_argument('text', '', strip=False)
            redirect = False if page.id else True

            if self.current_user:
                can_has_chars = 'abcdefghijklmnopqrstuvwxyz0123456789._-'
                page_name = self.get_argument('page_name', '').lower()
                page_name = ''.join(c for c in page_name if c in can_has_chars)
                if not page_name:
                    page.save()
                    page_name = str(page.id)
                page_name = self.current_user.id + '/' + page_name[:30]
                if page_name != page.name:
                    redirect = True
                page.name = page_name
                page.encrypted = True if self.get_argument('encrypted', None) == 'true' else False
                page.public = True if self.get_argument('public', None) == 'true' else False
            page.save()

            if redirect:
                self.write('/' + (page.name or str(page.id)))
            else:
                self.write('1')
        elif action == 'delete':
            page.delete_instance()
            self.set_secure_cookie('flash', 'Page deleted')
            self.write('/' + self.current_user.id)

    def fetch_page(self, name=None, id=None):
        page = None
        if self.request.path == '/':
            page = db.Page.get_by_id(1)
        elif self.request.path == '/new':
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
            self.reload('Incorrect login')
            raise tornado.gen.Return()

        user = db.User(
            id=''.join(c for c in username.lower() if c.isalnum())[:20],
            joined=datetime.datetime.now())
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
        try:
            if not username or not password:
                raise tornado.gen.Return()
            user = db.User.get_by_id(username)
            if not user:
                raise tornado.gen.Return()
            correct_password = yield user.check_password(password)
            if correct_password:
                self.set_secure_cookie('user', user.id)
                self.redirect('/' + user.id)
            else:
                raise tornado.gen.Return()
        except tornado.gen.Return:
            self.reload('Incorrect Login')


class Logout(Base):
    def get(self):
        self.clear_cookie('user')
        self.redirect('/')


routes = [
    (r'/', Page),
    (r'/login', Login),
    (r'/signup', SignUp),
    (r'/logout', Logout),
    (r'/new', Page),
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
    'cookie_secret': db.Settings.get_setting('cookie_secret')
}


if __name__ == '__main__':
    if 'debug' in sys.argv:
        settings['debug'] = True
    app = tornado.web.Application(routes, **settings)
    app.listen(8888, address='127.0.0.1')
    tornado.ioloop.IOLoop.instance().start()


