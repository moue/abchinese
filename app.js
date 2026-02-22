(function () {
    var form = document.getElementById('form');
    var textEl = document.getElementById('text');
    var errorsEl = document.getElementById('errors');
    var resultsEl = document.getElementById('results');
    var actionsEl = document.getElementById('actions');
    var tryAgainBtn = document.getElementById('tryAgain');
    var clearResultsBtn = document.getElementById('clearResults');

    var CACHE_PREFIX = 'readforme:';
    var lastPayload = null;

    function cacheKey(text) {
        return CACHE_PREFIX + text;
    }

    function getCached(text) {
        try {
            var raw = localStorage.getItem(cacheKey(text));
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function setCached(text, data) {
        try {
            localStorage.setItem(cacheKey(text), JSON.stringify(data));
        } catch (e) { }
    }

    function showError(msg) {
        errorsEl.textContent = msg;
        errorsEl.style.display = msg ? 'block' : 'none';
    }

    function showResults(payload) {
        lastPayload = payload;
        errorsEl.style.display = 'none';
        resultsEl.innerHTML = '';

        var card = document.createElement('div');
        card.className = 'result-card';

        var p = document.createElement('p');
        p.className = 'pinyin';
        p.textContent = payload.pinyin || payload.text;
        p.setAttribute('aria-label', 'pinyin');
        card.appendChild(p);

        var chars = document.createElement('p');
        chars.className = 'characters';
        chars.textContent = payload.text;
        chars.setAttribute('aria-label', 'characters');
        card.appendChild(chars);

        if (payload.audioBase64) {
            var playBtn = document.createElement('button');
            playBtn.type = 'button';
            playBtn.className = 'btn-play';
            playBtn.textContent = '\uD83D\uDD0A Play';
            playBtn.setAttribute('aria-label', 'Play speech');
            playBtn.onclick = function () {
                var audio = new Audio('data:audio/mp3;base64,' + payload.audioBase64);
                audio.play();
            };
            card.appendChild(playBtn);
        }

        resultsEl.appendChild(card);
        actionsEl.style.display = 'flex';
    }

    function run(text) {
        text = (text || '').trim();
        if (!text) {
            showError('Please paste some text.');
            return;
        }

        var cached = getCached(text);
        if (cached && (cached.pinyin !== undefined || cached.text)) {
            showError('');
            showResults({
                text: cached.text,
                pinyin: cached.pinyin !== undefined ? cached.pinyin : cached.text,
                audioBase64: cached.audioBase64 || null
            });
            return;
        }

        showError('');
        resultsEl.innerHTML = '<p class="loading">Loading\u2026</p>';

        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function () {
            var res;
            try {
                res = JSON.parse(xhr.responseText);
            } catch (e) {
                var msg = xhr.status ? 'HTTP ' + xhr.status + ': ' : '';
                showError(msg + (xhr.responseText ? xhr.responseText.slice(0, 200) : 'Invalid response from server.'));
                resultsEl.innerHTML = '';
                actionsEl.style.display = 'flex';
                return;
            }
            if (res.error) {
                showError(res.error);
                resultsEl.innerHTML = '';
                lastPayload = null;
            } else {
                showResults({
                    text: res.text,
                    pinyin: res.pinyin,
                    audioBase64: res.audioBase64 || null
                });
                setCached(res.text, {
                    text: res.text,
                    pinyin: res.pinyin,
                    audioBase64: res.audioBase64 || null
                });
            }
            actionsEl.style.display = 'flex';
        };
        xhr.onerror = function () {
            showError('Network error.');
            resultsEl.innerHTML = '';
            actionsEl.style.display = 'flex';
        };
        xhr.send(JSON.stringify({ text: text }));
    }

    form.onsubmit = function (e) {
        e.preventDefault();
        run(textEl.value);
    };

    tryAgainBtn.onclick = function () {
        if (lastPayload) {
            run(lastPayload.text);
        } else {
            run(textEl.value);
        }
    };

    clearResultsBtn.onclick = function () {
        lastPayload = null;
        errorsEl.textContent = '';
        errorsEl.style.display = 'none';
        resultsEl.innerHTML = '';
        actionsEl.style.display = 'none';
    };

    var charCountEl = document.getElementById('charCount');
    if (charCountEl) {
        textEl.addEventListener('input', function () {
            var len = textEl.value.length;
            charCountEl.textContent = len + (len === 1 ? ' character' : ' characters');
        });
    }
})();
