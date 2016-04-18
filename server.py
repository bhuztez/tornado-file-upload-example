#!/usr/bin/env python3

import os.path
ROOTDIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(ROOTDIR, 'upload')
STATIC_DIR = os.path.join(ROOTDIR, 'static')

THREAD_POOL_SIZE = 10
PORT = 8000

from tornado.ioloop import IOLoop
from tornado.web import (
    Application, RequestHandler, StaticFileHandler, stream_request_body)
from tornado.gen import coroutine
from tornado.concurrent import run_on_executor
from concurrent.futures import ThreadPoolExecutor
import os
import re

RANGE_PATTERN = re.compile(r'(\d+)-\d+/(?:\d+|\*)')


@stream_request_body
class UploadHandler(RequestHandler):
    executor = ThreadPoolExecutor(THREAD_POOL_SIZE)

    def initialize(self, path):
        self.root = path

    @run_on_executor
    def open_file(self, path, pos):
        fd = os.open(path, (os.O_RDWR | os.O_CREAT))
        f = os.fdopen(fd, 'rb+')
        if pos is not None:
            f.seek(pos)
        return f

    @coroutine
    def prepare(self):
        content_range = self.request.headers.get('Content-Range', None)
        pos = None

        if content_range is not None:
            content_range = content_range.strip()
            if content_range.startswith('bytes '):
                m = RANGE_PATTERN.match(content_range[6:])
                if m is not None:
                    pos = int(m.group(1))

        self.file = yield self.open_file(
            os.path.join(self.root, self.path_args[0]), pos)

    def on_finish(self):
        if hasattr(self, 'file'):
            del self.file

    @run_on_executor
    def write_data(self, file, chunk):
        file.write(chunk)

    @coroutine
    def data_received(self, chunk):
        yield self.write_data(self.file, chunk)

    def put(self, filename):
        self.file.close()
        self.write('OK')


class MyStaticFileHandler(StaticFileHandler):

    def should_return_304(self):
        return False


def make_app():
    return Application([
        (r"/files/(.*)", MyStaticFileHandler, {'path': UPLOAD_DIR}),
        (r"/upload/(.*)", UploadHandler, {'path': UPLOAD_DIR}),
        (r"/(.*)", MyStaticFileHandler, {'path': STATIC_DIR}),
    ])


def main():
    app = make_app()
    app.listen(PORT)
    IOLoop.current().start()


if __name__ == '__main__':
    main()
