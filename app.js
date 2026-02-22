(function () {
    var form = document.getElementById('form');
    var textEl = document.getElementById('text');
    var errorsEl = document.getElementById('errors');
    var resultsEl = document.getElementById('results');
    var actionsEl = document.getElementById('actions');
    var tryAgainBtn = document.getElementById('tryAgain');
    var clearResultsBtn = document.getElementById('clearResults');
    var shareBtnEl = document.getElementById('shareBtn');

    var CACHE_PREFIX = 'readforme:';
    var TOKEN_LIMIT = 50000;
    var TOKEN_KEY = 'readforme:tokensUsed';
    var USER_KEY_KEY = 'readforme:userApiKey';
    var lastPayload = null;
    var currentAudio = null;

    function getUserKey() {
        return localStorage.getItem(USER_KEY_KEY) || '';
    }

    function setUserKey(key) {
        if (key) localStorage.setItem(USER_KEY_KEY, key.trim());
        else localStorage.removeItem(USER_KEY_KEY);
    }

    // Secret reset: add ?reset=1 to URL
    if (new URLSearchParams(window.location.search).get('reset') === '1') {
        localStorage.setItem(TOKEN_KEY, '0');
        window.history.replaceState({}, '', window.location.pathname);
    }

    function getTokensUsed() {
        return parseInt(localStorage.getItem(TOKEN_KEY) || '0', 10);
    }

    function addTokensUsed(n) {
        var total = getTokensUsed() + n;
        localStorage.setItem(TOKEN_KEY, String(total));
        return total;
    }

    function isOverLimit() {
        return getTokensUsed() >= TOKEN_LIMIT;
    }

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

    function isValidPinyin(pinyin, original) {
        if (!pinyin || pinyin === original) return false;
        return /[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(pinyin);
    }

    function isValidWords(words) {
        if (!Array.isArray(words) || !words.length) return false;
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (!w.word || !w.pinyin || !w.definition) return false;
        }
        return true;
    }

    var loadingMessages = [];
    function getLoadingMessages() {
        fetch('./loading-messages.json')
            .then(function (res) { return res.json(); })
            .then(function (data) { loadingMessages = data; })
            .catch(function () { });
    }

    var timerInterval = null;
    var messageInterval = null;
    function startLoading() {
        resultsEl.innerHTML = '<p class="loading">Loading…</p><p class="loading-time">0.0s</p>';
        var msgEl = resultsEl.querySelector('.loading');
        var timeEl = resultsEl.querySelector('.loading-time');

        var startTime = Date.now();
        timerInterval = setInterval(function () {
            timeEl.textContent = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
        }, 100);

        if (loadingMessages.length) {
            messageInterval = setInterval(function () {
                var msg = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
                msgEl.textContent = msg;
            }, 2000);
            // Set one immediately
            msgEl.textContent = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
        }
    }

    function stopLoading() {
        clearInterval(timerInterval);
        clearInterval(messageInterval);
    }

    function setCached(text, data) {
        if (!isValidPinyin(data.pinyin, text) || !isValidWords(data.words)) return;
        try {
            localStorage.setItem(cacheKey(text), JSON.stringify(data));
        } catch (e) { }
    }

    function showError(msg) {
        stopLoading();
        errorsEl.innerHTML = '';
        if (!msg) {
            errorsEl.style.display = 'none';
            return;
        }
        if (msg === 'limit' || /API\s*(key|unavailable|4[0-9]{2})|Pinyin API/i.test(msg)) {
            errorsEl.innerHTML = '\uD83E\uDD7A Looks like Yuqi ran out of API credits! Get your own key at <a href="https://console.gmicloud.ai?utm_source=yuqi" target="_blank" rel="noopener">console.gmicloud.ai</a> or <a href="https://ko-fi.com/alwaysyuqs" target="_blank" rel="noopener">buy her a coffee</a> to keep this running'
                + '<div class="key-form">'
                + '<input type="text" id="userKeyInput" placeholder="Paste your GMI API key" class="key-input" value="' + (getUserKey() || '') + '">'
                + '<button type="button" id="saveKeyBtn" class="btn btn-primary btn-small">Save key</button>'
                + '</div>';
            var saveBtn = document.getElementById('saveKeyBtn');
            saveBtn.onclick = function () {
                var val = document.getElementById('userKeyInput').value.trim();
                if (!val) return;
                setUserKey(val);
                errorsEl.style.display = 'none';
                run(textEl.value);
            };
        } else {
            errorsEl.textContent = msg;
        }
        errorsEl.style.display = 'block';
    }

    function render(payload) {
        stopLoading();
        resultsEl.innerHTML = '';
        lastPayload = payload;

        var resultCard = document.createElement('div');
        resultCard.className = 'result-card';

        if (payload.pinyin) {
            var pinyinEl = document.createElement('p');
            pinyinEl.className = 'pinyin';
            pinyinEl.textContent = payload.pinyin;
            resultCard.appendChild(pinyinEl);
        }

        var charsEl = document.createElement('p');
        charsEl.className = 'characters';
        charsEl.textContent = payload.text;
        resultCard.appendChild(charsEl);

        if (payload.audioBase64) {
            var audioBtnContainer = document.createElement('span');
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-play';
            btn.textContent = '\uD83D\uDD0A Play';
            btn.setAttribute('aria-label', 'Play speech');
            var playing = false;
            btn.onclick = function () {
                if (playing) {
                    if (currentAudio) {
                        currentAudio.pause();
                        currentAudio.currentTime = 0;
                        currentAudio = null;
                    }
                    btn.textContent = '\uD83D\uDD0A Play';
                    btn.className = 'btn-play';
                    playing = false;
                } else {
                    if (currentAudio) {
                        currentAudio.pause();
                        currentAudio.currentTime = 0;
                    }
                    currentAudio = new Audio('data:audio/mp3;base64,' + payload.audioBase64);
                    currentAudio.play();
                    btn.textContent = '\u23F9 Stop';
                    btn.className = 'btn-stop';
                    playing = true;
                    currentAudio.onended = function () {
                        btn.textContent = '\uD83D\uDD0A Play';
                        btn.className = 'btn-play';
                        playing = false;
                    };
                }
            };
            audioBtnContainer.appendChild(btn);
            resultCard.appendChild(audioBtnContainer);
        }
        resultsEl.appendChild(resultCard);

        var usageEl = document.createElement('p');
        usageEl.className = 'usage';
        if (payload.cached) {
            usageEl.textContent = 'cached';
        } else if (payload.usage && payload.usage.total_tokens) {
            usageEl.textContent = payload.usage.total_tokens + ' tokens used';
        }
        resultsEl.appendChild(usageEl);

        if (payload.words && payload.words.length) {
            var wordsCardEl = document.createElement('div');
            wordsCardEl.className = 'result-card words-card';
            var grid = document.createElement('div');
            grid.className = 'words-grid';
            for (var i = 0; i < payload.words.length; i++) {
                var w = payload.words[i];
                var item = document.createElement('div');
                item.className = 'word-item';
                var wp = document.createElement('span');
                wp.className = 'word-pinyin';
                wp.textContent = w.pinyin;
                var wc = document.createElement('span');
                wc.className = 'word-char';
                wc.textContent = w.word;
                var wd = document.createElement('span');
                wd.className = 'word-def';
                wd.textContent = w.definition;
                item.appendChild(wp);
                item.appendChild(wc);
                item.appendChild(wd);
                grid.appendChild(item);
            }
            wordsCardEl.appendChild(grid);
            resultsEl.appendChild(wordsCardEl);
        }

        actionsEl.style.display = 'flex';
        shareBtnEl.style.display = '';
        shareBtnEl.textContent = 'Share';
        shareBtnEl.onclick = function () {
            if (!lastPayload) return;
            shareBtnEl.textContent = 'Saving…';
            fetch('/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...lastPayload, mode: 'share-save' })
            }).then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.ok && data.id) {
                        var url = window.location.origin + '?s=' + data.id;
                        navigator.clipboard.writeText(url).then(function () {
                            shareBtnEl.textContent = 'Share link copied!';
                            setTimeout(function () { shareBtnEl.textContent = 'Share'; }, 1500);
                        }).catch(function () {
                            shareBtnEl.textContent = 'Error';
                            setTimeout(function () { shareBtnEl.textContent = 'Share'; }, 1500);
                        });
                    } else {
                        shareBtnEl.textContent = 'Error';
                        setTimeout(function () { shareBtnEl.textContent = 'Share'; }, 1500);
                    }
                }).catch(function () {
                    shareBtnEl.textContent = 'Error';
                    setTimeout(function () { shareBtnEl.textContent = 'Share'; }, 1500);
                });
        };
    }

    function run(text) {
        text = (text || '').trim();
        if (!text) {
            showError('Please paste some text.');
            return;
        }
        if (!/[\u4e00-\u9fff]/.test(text)) {
            showError('Hmm, that doesn\'t look like Chinese!');
            return;
        }

        var cached = getCached(text);
        if (cached && (cached.pinyin !== undefined || cached.text) && cached.words) {
            showError('');
            render({ text: text, pinyin: cached.pinyin, words: cached.words, audioBase64: null, usage: null, cached: true });
            // Fetch audio in background
            apiCall(text, 'tts').then(function (res) {
                if (res.audioBase64) { 
                    lastPayload.audioBase64 = res.audioBase64;
                    setCached(text, lastPayload);
                    // Re-render to show play button
                    render(lastPayload);
                }
            }).catch(function () { });
            return;
        }

        var userKey = getUserKey();
        if (!userKey && isOverLimit()) {
            showError('limit');
            return;
        }

        showError('');
        startLoading();

        var pinyinPromise, wordsPromise;
        if (userKey) {
            pinyinPromise = callGmi(userKey, [
                { role: 'system', content: 'Provide pinyin for the following Chinese text. Output only the pinyin with tone marks, space-separated.' },
                { role: 'user', content: text }
            ]);
            wordsPromise = callGmi(userKey, [
                { role: 'system', content: 'Segment Chinese text into individual words. For each unique word, return a JSON array of objects: {"word": "你", "pinyin": "nǐ", "definition": "you"}. Output ONLY valid JSON, no other text.' },
                { role: 'user', content: text }
            ], 4000);
        } else {
            pinyinPromise = apiCall(text, 'pinyin');
            wordsPromise = apiCall(text, 'words');
        }
        var ttsPromise = apiCall(text, 'tts');

        Promise.all([pinyinPromise, wordsPromise, ttsPromise]).then(function (results) {
            var pinyinRes = results[0] || {};
            var wordsRes = results[1] || {};
            var ttsRes = results[2] || {};

            var payload = { text: text };

            if (userKey) {
                if (pinyinRes.choices && pinyinRes.choices[0]) {
                    payload.pinyin = (pinyinRes.choices[0].message.content || '').trim();
                }
                if (wordsRes.choices && wordsRes.choices[0]) {
                    var raw = (wordsRes.choices[0].message.content || '').trim();
                    var cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
                    try { payload.words = JSON.parse(cleaned); } catch (e) { }
                }
                var pinyinUsage = (pinyinRes.usage && pinyinRes.usage.total_tokens) || 0;
                var wordsUsage = (wordsRes.usage && wordsRes.usage.total_tokens) || 0;
                payload.usage = { total_tokens: pinyinUsage + wordsUsage };
            } else {
                payload.pinyin = pinyinRes.pinyin;
                payload.words = wordsRes.words;
                payload.usage = pinyinRes.usage || wordsRes.usage;
                if (payload.usage && payload.usage.total_tokens) {
                    addTokensUsed(payload.usage.total_tokens);
                }
            }

            payload.audioBase64 = ttsRes.audioBase64;

            if (!isValidPinyin(payload.pinyin, text)) payload.pinyin = null;
            if (!isValidWords(payload.words)) payload.words = null;

            render(payload);
            if (payload.pinyin && payload.words) {
                setCached(text, { pinyin: payload.pinyin, words: payload.words, audioBase64: payload.audioBase64 });
            }
        }).catch(function (err) {
            stopLoading();
            showError(err.message || 'An API error occurred. Please try again.');
        });
    }

    function callGmi(key, messages, maxTokens) {
        return fetch('https://api.gmi-serving.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
            body: JSON.stringify({
                model: 'openai/gpt-4o-mini',
                messages: messages,
                temperature: 0,
                max_tokens: maxTokens || 2000
            })
        }).then(function (r) { return r.json(); });
    }

    function apiCall(text, mode) {
        return fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, mode: mode })
        }).then(function (r) { return r.json(); });
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
        shareBtnEl.style.display = 'none';
    };

    var tryExampleBtn = document.getElementById('tryExample');
    if (tryExampleBtn) {
        tryExampleBtn.onclick = function () {
            textEl.value = '\u54C8\u54C8\u54C8\u54C8\u54C8\u54C8\u54C8\u54C8\u592A\u597D\u7B11\u4E86';
            textEl.dispatchEvent(new Event('input'));
            run(textEl.value);
        };
    }

    var charCountEl = document.getElementById('charCount');
    if (charCountEl) {
        textEl.addEventListener('input', function () {
            var len = textEl.value.length;
            charCountEl.textContent = len + (len === 1 ? ' character' : ' characters');
        });
    }

    // Auto-submit from shared link
    var params = new URLSearchParams(window.location.search);
    var shareId = params.get('s');
    if (shareId) {
        window.history.replaceState({}, '', window.location.pathname);
        startLoading();
        fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: '_', mode: 'share-load', id: shareId })
        }).then(function (r) { return r.json(); }).then(function (data) {
            if (data.ok && data.text) {
                textEl.value = data.text;
                textEl.dispatchEvent(new Event('input'));
                showError('');
                var payload = { text: data.text, pinyin: data.pinyin, words: data.words, audioBase64: null, usage: null, cached: true };
                render(payload);
                // Fetch audio in background
                apiCall(data.text, 'tts').then(function (res) {
                    if (res.audioBase64) {
                        lastPayload.audioBase64 = res.audioBase64;
                        render(lastPayload);
                    }
                }).catch(function () { });
            } else {
                stopLoading();
                showError('Share link expired or not found');
            }
        }).catch(function () {
            stopLoading();
            showError('Could not load shared result');
        });
    }

    getLoadingMessages();
})();
