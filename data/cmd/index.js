'use strict';

var list = document.getElementById('list');
var search = document.querySelector('input[type=search]');

var url;
var tab = {};
var usernames = [];

document.body.dataset.top = window.top === window;

var send = (obj, callback) => chrome.runtime.sendMessage(Object.assign(obj, {
  tabId: tab.id
}), callback);

var cookie = {
  get host() {
    return (new URL(url)).hostname;
  },
  get: () => {
    const key = document.cookie.split(`${cookie.host}=`);
    if (key.length > 1) {
      return key[1].split(';')[0];
    }
  },
  set: value => {
    const days = 60;
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));

    document.cookie = `${cookie.host}=${value}; expires=${date.toGMTString()}`;
  }
};

function add(login, name, password) {
  const entry = Object.assign(document.createElement('option'), {
    textContent: login + (name ? ` - ${name}` : ''),
    value: login
  });
  entry.dataset.password = password || '';
  list.appendChild(entry);
}

function submit() {
  const query = search.value || url;
  search.value = query;
  list.textContent = '';
  [...document.getElementById('toolbar').querySelectorAll('input')].forEach(input => {
    if (input.dataset.cmd !== 'close') {
      input.disabled = true;
    }
  });

  send({
    cmd: 'logins',
    query
  }, ({error, response}) => {
    if (error) {
      add(error);
    }
    else {
      response.Entries = response.Entries || [];
      response.Entries.forEach(e => add(e.Login, e.Name, e.Password));
      if (response.Success === 'false') {
        focus();
        add('Something went wrong!');
      }
      else {
        if (response.Entries.length === 0) {
          add('No match!');
        }
        else {// select an item
          const username = response.Entries.map(e => e.Login).filter(u => usernames.indexOf(u) !== -1).shift() ||
            cookie.get() ||
            response.Entries[0].Login;
          list.value = username;
          list.dispatchEvent(new Event('change', {
            bubbles: true
          }));
          if (response.Entries.length === 1) {
            chrome.storage.local.get({
              'auto-login': false,
              'auto-submit': true
            }, prefs => prefs['auto-login'] && document.querySelector('[data-cmd="insert-both"]').dispatchEvent(
              new CustomEvent('click', {
                'detail': prefs['auto-submit'] ? '' : 'no-submit',
                'bubbles': true
              })
            ));
          }
        }
      }
    }
    window.focus();
    list.focus();
  });
}

function copy(str) {
  document.oncopy = event => {
    event.clipboardData.setData('text/plain', str);
    event.preventDefault();
  };
  document.execCommand('Copy', false, null);
}

document.addEventListener('search', submit);

document.addEventListener('change', e => {
  const target = e.target;
  if (target.nodeName === 'SELECT') {
    const disabled = target.selectedOptions.length === 0 || !target.selectedOptions[0].dataset.password;
    [...document.getElementById('toolbar').querySelectorAll('input')]
      .filter(input => input.dataset.cmd !== 'close')
      .forEach(input => input.disabled = disabled);
  }
});

document.addEventListener('keydown', e => {
  const metaKey = e.metaKey || e.altKey || e.ctrlKey;
  if (e.code === 'Escape') {
    document.querySelector('[data-cmd="close"]').click();
    e.preventDefault();
  }
  else if (metaKey && e.code === 'KeyC') {
    document.querySelector('[data-cmd="copy"]').click();
    e.preventDefault();
  }
  else if (metaKey && e.code === 'KeyX') {
    document.querySelector('[data-cmd="copy"]').dispatchEvent(
      new CustomEvent('click', {
        'detail': 'password',
        'bubbles': true
      })
    );
    e.preventDefault();
  }
  else if (metaKey && e.code === 'KeyB') {
    if (e.shiftKey) {
      document.querySelector('[data-cmd="insert-both"]').click();
    }
    else {
      document.querySelector('[data-cmd="insert-both"]').dispatchEvent(
        new CustomEvent('click', {
          'detail': 'no-submit',
          'bubbles': true
        })
      );
    }
    e.preventDefault();
  }
  else if (metaKey && e.code === 'KeyU') {
    document.querySelector('[data-cmd="insert-login"]').click();
    e.preventDefault();
  }
  else if (metaKey && e.code === 'KeyP') {
    document.querySelector('[data-cmd="insert-password"]').click();
    e.preventDefault();
  }
  else if (metaKey && e.code === 'KeyF') {
    search.focus();
    e.preventDefault();
  }
  else if (e.code === 'Enter') {
    if (e.target.nodeName === 'SELECT') {
      document.querySelector('[data-cmd="insert-both"]').click();
    }
  }
});

document.addEventListener('click', e => {
  const target = e.target;
  const cmd = target.dataset.cmd || '';

  // cache
  if (cmd && (cmd.startsWith('insert-') || cmd.startsWith('copy'))) {
    cookie.set(list.value);
  }
  //
  if (cmd && cmd.startsWith('insert-')) {
    const checked = list.selectedOptions[0];
    send({
      cmd,
      detail: e.detail,
      login: list.value,
      password: checked.dataset.password
    });
  }
  else if (cmd && cmd.startsWith('copy')) {
    if (e.detail === 'password') {
      const checked = list.selectedOptions[0];
      copy(checked.dataset.password);
    }
    else {
      copy(list.value);
    }
    send({
      cmd: 'notify',
      message: (e.detail === 'password' ? 'Password' : 'Login name') + ' is copied to the clipboard'
    });
  }
  else if (cmd === 'close') {
    send({
      cmd: 'close-me',
      tabId: tab.id
    });
  }
  if (cmd === 'close' || cmd.startsWith('insert-')) {
    if (window.top === window) {
      window.close();
    }
  }
});

// keep focus
window.addEventListener('blur', () => window.setTimeout(window.focus, 0));

// init
const init = t => {
  tab = t;
  send({
    cmd: 'fetch-guesses'
  }, resp => {
    usernames = resp || [];
    [...list.querySelectorAll('option')].map(o => o.value)
      .filter(u => usernames.indexOf(u) !== -1)
      .forEach(u => list.value = u);
  });

  url = tab.url;
  search.value = url;
  submit();
};
if (window.top === window) {
  send({cmd: 'command'}, () => {
    chrome.tabs.query({
      currentWindow: true,
      active: true
    }, ([tab]) => init(tab));
  });
}
else {
  send({
    cmd: 'introduce-me'
  }, init);
}
