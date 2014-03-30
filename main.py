import logging
import os
import threading

import bcrypt
import tornado.ioloop
import tornado.web

import db


class Base(tornado.web.RequestHandler):
    def get_current_user(self):
        username = self.get_secure_cookie('user')
        if username:
            return db.get_user(username)


class Index(Base):
    def get(self):
        self.render('index.html', text=None)


class Page(Base):
    def get(self, id=None):
        if id:
            page = db.get_page(id)
        else:
            page = {
                'id': None,
                'text': '',
                'encrypted': False
            }
        self.render('page.html', page=page)
        
    def post(self, id=None):
        text = self.get_argument('text', None)
        encrypted = self.get_argument('encrypted', '0')
        encrypted = bool(int(encrypted))

        if not id:
            id = db.create_page(text=text, encrypted=encrypted)
            return self.write('/' + str(id))

        page = db.update_page(id=id, text=text, encrypted=encrypted)
        self.write('1')


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
        if db.create_user(username=username, password=hashed):
            self.set_secure_cookie('user', username)
            self.redirect('/' + str(username))
        else:
            self.redirect('/signup')


class Login(Base):
    def get(self):
        self.render('login.html')

    @tornado.web.asynchronous
    def post(self):
        username = self.get_argument('username', None)
        email = self.get_argument('email', None)
        password = self.get_argument('password', '').encode('utf-8')

        user = db.get_user(username)
        thread = threading.Thread(target=self.check_password, args=(user, password))
        thread.start()

    def check_password(self, user, password):
        if not bcrypt.hashpw(password, user['password']) == user['password']:
            user = None
        tornado.ioloop.IOLoop.instance().add_callback(
            self.post2, user)

    def post2(self, user):
        if user:
            self.set_secure_cookie('user', user['username'])
            self.redirect('/')
        else:
            self.redirect('/login')


class User(Base):
    def get(self):
        pass


settings = {
    'template_path': os.path.join(os.path.dirname(__file__), 'templates'),
    'static_path': os.path.join(os.path.dirname(__file__), 'static'),
    'login_url': '/login',
    'debug': True,
    'xsrf_cookies': True,
    'cookie_secret': '9e333fa1-c53e-4509-baa3-83aba7230ec4'
}

app = tornado.web.Application([
    (r'/', Index),
    (r'/login', Login),
    (r'/signup', SignUp),
    (r'/new', Page),
    (r'/(\d+)', Page),
    (r'/(.+)', User)
], **settings)


if __name__ == '__main__':
    app.listen(8888)
    tornado.ioloop.IOLoop.instance().start()


