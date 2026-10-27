#!/usr/bin/env python3
"""Focus Gram's native Linux shell: one toolbar and an embedded Android display."""
import json
import os
from pathlib import Path
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('GdkX11', '3.0')
from gi.repository import Gtk, Gdk, Gio, GLib, GdkX11
from runtime import Runtime, ROOT

CONFIG = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config'))) / 'focus-gram/native.json'

class FocusGram(Gtk.Application):
    def __init__(self):
        super().__init__(application_id='io.github.wizard142.FocusGram.Native',
                         flags=Gio.ApplicationFlags.FLAGS_NONE)
        self.runtime = Runtime()
        self.ready = False
        self.closing = False
        self.serial = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=1)
        try:
            self.preferences = json.loads(CONFIG.read_text())
            if not isinstance(self.preferences, dict):
                raise ValueError('Invalid preferences')
        except (OSError, ValueError):
            self.preferences = {'focus': True, 'dark': True}

    def save(self):
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        CONFIG.write_text(json.dumps(self.preferences))

    def do_activate(self):
        if self.get_active_window():
            self.get_active_window().present()
            return
        self.window = Gtk.ApplicationWindow(application=self, title='Focus Gram')
        self.window.set_default_size(1360, 900)
        self.window.set_wmclass('focus-gram', 'Focus Gram')
        self.window.set_icon_from_file(str(ROOT.parent / 'public/icon.png'))
        self.window.connect('delete-event', self.close)
        self.window.connect('window-state-event', self.window_state)
        header = Gtk.HeaderBar(show_close_button=True, title='Focus Gram')
        self.window.set_titlebar(header)
        self.back = Gtk.Button.new_from_icon_name('go-previous-symbolic', Gtk.IconSize.BUTTON)
        self.back.set_tooltip_text('Back')
        self.back.connect('clicked', lambda _: self.task(self.runtime.back))
        header.pack_start(self.back)
        self.focus = Gtk.ToggleButton(label='Focus')
        self.focus.set_tooltip_text('Block posts and Reels; keep Stories')
        self.focus.set_active(bool(self.preferences.get('focus', True)))
        self.focus.connect('toggled', self.toggle_focus)
        header.pack_start(self.focus)
        self.create = Gtk.MenuButton(label='Create')
        menu = Gtk.Menu()
        for kind, title in [('story', 'Story'), ('post', 'Post'), ('reel', 'Reel')]:
            item = Gtk.MenuItem(label=title)
            item.connect('activate', lambda _, kind=kind: self.choose(kind))
            menu.append(item)
        menu.show_all()
        self.create.set_popup(menu)
        header.pack_end(self.create)
        theme = Gtk.Button(label='Theme')
        theme.set_tooltip_text('Switch light / dark')
        theme.connect('clicked', self.toggle_theme)
        header.pack_end(theme)
        options = Gtk.MenuButton(label='⋯')
        options.set_tooltip_text('Options')
        options_menu = Gtk.Menu()
        keep_ready = Gtk.CheckMenuItem(label='Fast reopen')
        keep_ready.set_active(bool(self.preferences.get('keep_ready', True)))
        keep_ready.set_tooltip_text('Keep Android paused in memory after closing; uses about 4 GB RAM')
        keep_ready.connect('toggled', self.toggle_keep_ready)
        options_menu.append(keep_ready)
        quit_all = Gtk.MenuItem(label='Quit completely')
        quit_all.connect('activate', lambda _: self.close(fully=True))
        options_menu.append(quit_all)
        options_menu.show_all()
        options.set_popup(options_menu)
        header.pack_end(options)
        self.stack = Gtk.Stack()
        loading = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, halign=Gtk.Align.CENTER,
                          valign=Gtk.Align.CENTER)
        self.spinner = Gtk.Spinner()
        self.spinner.start()
        loading.pack_start(self.spinner, False, False, 0)
        self.message = Gtk.Label(label='Starting…')
        loading.pack_start(self.message, False, False, 0)
        self.retry = Gtk.Button(label='Retry')
        self.retry.connect('clicked', self.retry_start)
        loading.pack_start(self.retry, False, False, 0)
        self.stack.add_named(loading, 'loading')
        self.socket = Gtk.Socket()
        self.socket.set_can_focus(True)
        self.socket.connect('plug-removed', self.android_stopped)
        self.stack.add_named(self.socket, 'android')
        self.window.add(self.stack)
        self.set_controls(False)
        self.apply_theme()
        self.window.show_all()
        self.retry.hide()
        self.stack.set_visible_child_name('loading')
        self.started = time.monotonic()
        self.task(self.start, startup=True)

    def report(self, text):
        print(text, flush=True)
        GLib.idle_add(self.message.set_text, text)

    def start(self):
        window = self.runtime.start(self.report)
        self.runtime.focus(bool(self.preferences.get('focus', True)))
        self.runtime.theme(bool(self.preferences.get('dark', True)))
        GLib.idle_add(self.attach, window)

    def attach(self, window):
        if self.closing:
            return
        self.stack.set_visible_child_name('android')
        self.socket.add_id(window)
        self.socket.grab_focus()
        self.ready = True
        self.spinner.stop()
        self.set_controls(True)
        print(f'Native window attached in {time.monotonic() - self.started:.2f}s', flush=True)

    def android_stopped(self, _):
        if not self.closing:
            self.ready = False
            self.set_controls(False)
            self.stack.set_visible_child_name('loading')
            self.spinner.stop()
            self.message.set_text('Android stopped. Open it again with Retry.')
            self.retry.show()
        return True

    def task(self, function, startup=False):
        def worker():
            try:
                with self.serial:
                    if self.closing:
                        return
                    function()
            except Exception as error:
                GLib.idle_add(self.error, str(error), startup)
        self.executor.submit(worker)

    def retry_start(self, _):
        self.retry.hide()
        self.spinner.start()
        self.started = time.monotonic()
        self.task(self.start, startup=True)

    def error(self, text, startup=False):
        print(text, flush=True)
        if self.closing:
            return
        if startup:
            self.spinner.stop()
            self.message.set_text(text)
            self.retry.show()
        else:
            dialog = Gtk.MessageDialog(transient_for=self.window, modal=True,
                message_type=Gtk.MessageType.ERROR, buttons=Gtk.ButtonsType.CLOSE,
                text='Focus Gram could not complete that action.')
            dialog.format_secondary_text(text)
            dialog.run()
            dialog.destroy()

    def set_controls(self, enabled):
        for control in (self.back, self.focus, self.create):
            control.set_sensitive(enabled)

    def toggle_focus(self, button):
        enabled = button.get_active()
        self.preferences['focus'] = enabled
        self.save()
        if self.ready:
            self.task(lambda: self.runtime.focus(enabled))

    def apply_theme(self):
        dark = bool(self.preferences.get('dark', True))
        Gtk.Settings.get_default().set_property('gtk-application-prefer-dark-theme', dark)
        css = Gtk.CssProvider()
        css.load_from_data(("* { font-family: 'Instrument Sans', sans-serif; } window { background: "
                            + ('#171717' if dark else '#faf9f7') + '; }').encode())
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), css, 600)

    def toggle_theme(self, _):
        self.preferences['dark'] = not self.preferences.get('dark', True)
        self.save()
        self.apply_theme()
        if self.ready:
            dark = bool(self.preferences['dark'])
            self.task(lambda: self.runtime.theme(dark))

    def toggle_keep_ready(self, button):
        self.preferences['keep_ready'] = button.get_active()
        self.save()

    def choose(self, kind):
        dialog = Gtk.FileChooserDialog(title='Choose a photo or video', transient_for=self.window,
            action=Gtk.FileChooserAction.OPEN)
        dialog.add_buttons('Cancel', Gtk.ResponseType.CANCEL, 'Open', Gtk.ResponseType.OK)
        dialog.set_default_response(Gtk.ResponseType.OK)
        media = Gtk.FileFilter()
        media.set_name('Videos' if kind == 'reel' else 'Photos and videos')
        media.add_mime_type('video/*')
        if kind != 'reel':
            media.add_mime_type('image/*')
        dialog.add_filter(media)
        response = dialog.run()
        path = dialog.get_filename() if response == Gtk.ResponseType.OK else None
        dialog.destroy()
        if path:
            self.create.set_sensitive(False)
            def send():
                try:
                    self.runtime.share(path, kind)
                finally:
                    GLib.idle_add(self.create.set_sensitive, True)
            self.task(send)

    def window_state(self, _, event):
        if not self.ready or self.closing:
            return False
        minimized = bool(event.new_window_state & Gdk.WindowState.ICONIFIED)
        self.task(lambda: self.runtime.pause(minimized))
        return False

    def close(self, *_, fully=False):
        if self.closing:
            return True
        self.closing = True
        self.runtime.cancelled.set()
        self.executor.shutdown(wait=False, cancel_futures=True)
        park = self.ready and self.preferences.get('keep_ready', True) and not fully
        root_window = self.window.get_screen().get_root_window().get_xid()
        print('Closing: pausing Android' if park else 'Closing: saving Android state', flush=True)
        self.set_controls(False)
        self.stack.set_visible_child_name('loading')
        self.message.set_text('Closing…' if park else 'Saving…')
        self.spinner.start()
        def shutdown():
            try:
                with self.serial:
                    if park:
                        self.runtime.park(root_window)
                    else:
                        self.runtime.close()
            except Exception as error:
                print(str(error), flush=True)
            GLib.idle_add(self.quit)
        threading.Thread(target=shutdown, daemon=True).start()
        return True

if __name__ == '__main__':
    app = FocusGram()
    app.run(None)
