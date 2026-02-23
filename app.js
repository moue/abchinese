(function () {
    var form = document.getElementById('form');
    var textEl = document.getElementById('text');
    var errorsEl = document.getElementById('errors');
    var resultsEl = document.getElementById('results');
    var actionsEl = document.getElementById('actions');
    var tryAgainBtn = document.getElementById('tryAgain');
    var clearResultsBtn = document.getElementById('clearResults');
    var shareBtnEl = document.getElementById('shareBtn');
    var rootEl = document.documentElement;
    var shareLinkWrapEl = document.getElementById('shareLinkWrap');
    var shareLinkInputEl = document.getElementById('shareLinkInput');
    var copyShareLinkBtnEl = document.getElementById('copyShareLink');
    var shareLinkStatusEl = document.getElementById('shareLinkStatus');

    var CACHE_PREFIX = 'readforme:';
    var TOKEN_LIMIT = 50000;
    var TOKEN_KEY = 'readforme:tokensUsed';
    var USER_KEY_KEY = 'readforme:userApiKey';
    var lastPayload = null;
    var currentAudio = null;

    function setActionsVisibility(showActions, showTryAgain) {
        actionsEl.style.display = showActions ? 'flex' : 'none';
        if (tryAgainBtn) {
            tryAgainBtn.style.display = showActions ? '' : 'none';
        }
    }

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
        // If we're surfacing an error, clear stale loading content.
        if (msg) {
            resultsEl.innerHTML = '';
        }
        errorsEl.innerHTML = '';
        if (!msg) {
            errorsEl.style.display = 'none';
            return;
        }
        if (msg === 'limit' || /Pinyin API/i.test(msg) || /Invalid key/i.test(msg)) {
            var invalidKeyNote = (msg && /Invalid key/i.test(msg))
                ? '<p class="key-inline-error">Invalid key, try again.</p>'
                : '';
            errorsEl.innerHTML = '\uD83E\uDD7A Looks like Yuqi ran out of API credits! Get your own key at <a class="plain-link" href="https://console.gmicloud.ai?utm_source=yuqi" target="_blank" rel="noopener">console.gmicloud.ai</a> or <a class="plain-link" href="https://ko-fi.com/alwaysyuqs" target="_blank" rel="noopener">buy her a coffee</a> to keep this running'
                + '<div class="key-form">'
                + '<input type="text" id="userKeyInput" placeholder="Paste your GMI API key" class="key-input" value="' + (getUserKey() || '') + '">'
                + '<button type="button" id="saveKeyBtn" class="btn btn-primary btn-small">Save key</button>'
                + '</div>'
                + invalidKeyNote;
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

    function copyTextToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return false; });
        }
        return new Promise(function (resolve) {
            var textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.setAttribute('readonly', '');
            textArea.style.position = 'fixed';
            textArea.style.top = 0;
            textArea.style.left = 0;
            textArea.style.opacity = 0;
            textArea.style.fontSize = '16px'; // Prevent iOS Safari zoom while selecting.
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            textArea.setSelectionRange(0, textArea.value.length);
            var copied = false;
            try {
                copied = document.execCommand('copy');
            } catch (e) {
                copied = false;
            }
            document.body.removeChild(textArea);
            resolve(copied);
        });
    }

    function setShareLink(url) {
        if (!shareLinkWrapEl || !shareLinkInputEl || !shareLinkStatusEl) return;
        if (!url) {
            shareLinkInputEl.value = '';
            shareLinkStatusEl.textContent = '';
            shareLinkWrapEl.style.display = 'none';
            return;
        }
        shareLinkInputEl.value = url;
        shareLinkStatusEl.textContent = '';
        shareLinkWrapEl.style.display = 'block';
    }

    if (copyShareLinkBtnEl) {
        copyShareLinkBtnEl.onclick = function () {
            if (!shareLinkInputEl || !shareLinkInputEl.value) return;
            copyTextToClipboard(shareLinkInputEl.value).then(function (copied) {
                setShareLink(shareLinkInputEl.value);
            });
        };
    }

    if (shareLinkInputEl) {
        shareLinkInputEl.onclick = function () {
            shareLinkInputEl.focus();
            shareLinkInputEl.select();
            shareLinkInputEl.setSelectionRange(0, shareLinkInputEl.value.length);
        };
    }

    function render(payload) {
        stopLoading();
        resultsEl.innerHTML = '';
        setShareLink('');
        setActionsVisibility(true, false);
        // Only cache valid payloads
        if (payload && typeof payload.text === 'string' && Array.isArray(payload.words)) {
            lastPayload = payload;
        }

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

            function resetToPlayState() {
                btn.textContent = '\uD83D\uDD0A Play';
                btn.className = 'btn-play';
            }

            // Create audio object early if it doesn't exist or has changed
            if (!currentAudio || !currentAudio.src.endsWith(payload.audioBase64)) {
                if (currentAudio) {
                    currentAudio.pause(); // Stop any previous audio
                }
                currentAudio = new Audio('data:audio/mpeg;base64,' + payload.audioBase64);
            } else if (!currentAudio.paused) {
                // If re-rendering while the correct audio is already playing, stop it and reset button for the new render
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }
            // Always bind ended handler to the currently rendered button instance.
            currentAudio.onended = resetToPlayState;

            // Simplified click handler
            btn.onclick = function () {
                if (currentAudio.paused) {
                    currentAudio.play();
                    btn.textContent = '\u23F9 Stop';
                    btn.className = 'btn-stop';
                } else {
                    currentAudio.pause();
                    currentAudio.currentTime = 0; // Reset on stop
                    resetToPlayState();
                }
            };
            audioBtnContainer.appendChild(btn);
            resultCard.appendChild(audioBtnContainer);
        } else if (payload.showAudioPlaceholder) {
            var audioPlaceholderContainer = document.createElement('span');
            var placeholderBtn = document.createElement('button');
            placeholderBtn.type = 'button';
            placeholderBtn.className = 'btn-play';
            placeholderBtn.textContent = '\uD83D\uDD0A Audio\u2026';
            placeholderBtn.disabled = true;
            placeholderBtn.style.opacity = '0.6';
            audioPlaceholderContainer.appendChild(placeholderBtn);
            resultCard.appendChild(audioPlaceholderContainer);
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

        shareBtnEl.style.display = '';
        shareBtnEl.textContent = 'Share';
        shareBtnEl.onclick = function () {
            if (!lastPayload) return;
            shareBtnEl.textContent = 'Saving…';
            shareBtnEl.disabled = true;
            fetch('/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...lastPayload, mode: 'share-save' })
            }).then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.ok && data.id) {
                        var url = window.location.origin + '/s/' + data.id;
                        setShareLink(url);
                        if (shareLinkWrapEl) {
                            shareLinkWrapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                        return copyTextToClipboard(url).then(function (copied) {
                            shareBtnEl.textContent = 'Share';
                            setShareLink(url);
                            if (shareLinkInputEl) {
                                shareLinkInputEl.focus();
                                shareLinkInputEl.select();
                                shareLinkInputEl.setSelectionRange(0, shareLinkInputEl.value.length);
                            }
                        });
                    } else {
                        showError(data.error || 'Could not save share');
                        shareBtnEl.textContent = 'Error';
                    }
                }).catch(function () {
                    showError('Could not save share');
                    shareBtnEl.textContent = 'Error';
                }).finally(function () {
                    setTimeout(function () {
                        shareBtnEl.textContent = 'Share';
                        shareBtnEl.disabled = false;
                    }, 2000);
                });
        };
    }

    function run(text) {
        text = (text || '').trim();
        if (!text) {
            showError('Please paste some text.');
            setActionsVisibility(false, false);
            return;
        }
        if (!/[\u4e00-\u9fff]/.test(text)) {
            showError('Hmm, that doesn\'t look like Chinese!');
            setActionsVisibility(false, false);
            return;
        }

        // Restore caching
        if (lastPayload && lastPayload.text === text) {
            render(lastPayload);
            return;
        }

        var cached = getCached(text);
        if (cached && (cached.pinyin !== undefined || cached.text) && cached.words) {
            showError('');
            var cachedPayload = {
                text: text,
                pinyin: cached.pinyin,
                words: cached.words,
                audioBase64: cached.audioBase64 || null,
                usage: null,
                cached: true
            };
            render(cachedPayload);

            // Fetch audio only if this cache entry does not already have it.
            if (!cachedPayload.audioBase64) {
                apiCall(text, 'tts').then(function (res) {
                    if (res.audioBase64) {
                        lastPayload.audioBase64 = res.audioBase64;
                        setCached(text, lastPayload);
                        // Re-render to show play button
                        render(lastPayload);
                    }
                }).catch(function () { });
            }
            return;
        }

        var userKey = getUserKey();
        if (!userKey && isOverLimit()) {
            showError('limit');
            setActionsVisibility(true, true);
            return;
        }

        showError('');
        setActionsVisibility(false, false);
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
            setActionsVisibility(true, true);
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
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) {
                    var errMsg = (data && data.error && (data.error.message || data.error.code)) || ('GMI API error ' + r.status);
                    if (r.status === 401 || r.status === 403) {
                        throw new Error('Invalid key. Please check your API key and try again.');
                    }
                    throw new Error(errMsg);
                }
                if (data && data.error) {
                    var msg = data.error.message || data.error.code || 'GMI API error';
                    throw new Error(msg);
                }
                if (!data || !Array.isArray(data.choices) || !data.choices[0] || !data.choices[0].message) {
                    throw new Error('Invalid key. Please check your API key and try again.');
                }
                return data;
            }).catch(function (e) {
                if (e && e.message) throw e;
                throw new Error('Could not read API response.');
            });
        });
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

    if (tryAgainBtn) {
        tryAgainBtn.onclick = function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (lastPayload && lastPayload.text) {
                run(lastPayload.text);
            } else {
                run(textEl.value);
            }
        };
    }

    clearResultsBtn.onclick = function () {
        lastPayload = null;
        errorsEl.textContent = '';
        errorsEl.style.display = 'none';
        resultsEl.innerHTML = '';
        textEl.value = '';
        textEl.dispatchEvent(new Event('input'));
        setShareLink('');
        setActionsVisibility(false, false);
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
    var shareMatch = window.location.pathname.match(/^\/s\/([a-z0-9]+)$/i);
    var shareId = shareMatch ? shareMatch[1] : '';
    if (shareId) {
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
                var payload = {
                    text: data.text,
                    pinyin: data.pinyin,
                    words: data.words,
                    audioBase64: data.audioBase64 || null,
                    showAudioPlaceholder: !data.audioBase64,
                    usage: null,
                    cached: true
                };

                render(payload);
                if (!payload.audioBase64) {
                    apiCall(data.text, 'tts').then(function (res) {
                        if (res.audioBase64) {
                            payload.audioBase64 = res.audioBase64;
                            payload.showAudioPlaceholder = false;
                            if (lastPayload && lastPayload.text === payload.text) {
                                lastPayload.audioBase64 = res.audioBase64;
                                lastPayload.showAudioPlaceholder = false;
                            }
                            render(payload);
                        }
                    }).catch(function () { });
                }
            } else {
                stopLoading();
                showError('Share link expired or not found');
                setActionsVisibility(true, true);
            }
        }).catch(function () {
            stopLoading();
            showError('Could not load shared result');
            setActionsVisibility(true, true);
        }).finally(function () {
            rootEl.classList.remove('share-loading');
        });
    }

    setActionsVisibility(false, false);
    getLoadingMessages();
})();
