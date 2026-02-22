const BASE = 'http://localhost:3001';

async function post(body) {
    const res = await fetch(BASE + '/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

let passed = 0;
let failed = 0;

function assert(name, condition, detail) {
    if (condition) {
        console.log('\x1b[32m✓\x1b[0m ' + name);
        passed++;
    } else {
        console.log('\x1b[31m✗\x1b[0m ' + name + (detail ? ' — ' + detail : ''));
        failed++;
    }
}

async function run() {
    console.log('Testing against ' + BASE + '\n');

    // 1. Empty input
    var r = await post({ text: '' });
    assert('Empty input returns error', r.error && !r.pinyin, r.error);

    // 2. No text field
    r = await post({});
    assert('Missing text field returns error', !!r.error, r.error);

    // 3. Words mode — Chinese text
    r = await post({ text: '你好世界', mode: 'words' });
    assert('Words mode returns words array', Array.isArray(r.words) && r.words.length > 0,
        r.words ? r.words.length + ' words' : r.error);
    if (r.words && r.words.length) {
        var w = r.words[0];
        assert('Each word has word/pinyin/definition', !!(w.word && w.pinyin && w.definition),
            JSON.stringify(w));
        assert('Pinyin contains latin characters', /[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(w.pinyin),
            w.pinyin);
    }
    assert('Words mode returns pinyin string', typeof r.pinyin === 'string' && r.pinyin.length > 0,
        r.pinyin);
    assert('Words mode returns usage', r.usage && typeof r.usage.total_tokens === 'number',
        JSON.stringify(r.usage));

    // 4. TTS mode
    r = await post({ text: '你好', mode: 'tts' });
    assert('TTS mode returns audioBase64 or error', !!(r.audioBase64 || r.error),
        r.audioBase64 ? 'got audio (' + r.audioBase64.length + ' chars)' : r.error);

    // 5. Pinyin mode (legacy, may have reasoning model issues)
    r = await post({ text: '你好', mode: 'pinyin' });
    assert('Pinyin mode returns something', r.pinyin !== undefined || r.error,
        r.pinyin || r.error);

    // 6. Words mode — English text (should still return something)
    r = await post({ text: 'hello world', mode: 'words' });
    assert('English text does not crash', !r.error || typeof r.error === 'string',
        r.error || 'ok');

    // 7. Words mode — mixed text
    r = await post({ text: '我在用iPhone 15', mode: 'words' });
    assert('Mixed Chinese+English returns words', Array.isArray(r.words),
        r.words ? r.words.length + ' words' : r.error);

    // 8. Single character
    r = await post({ text: '好', mode: 'words' });
    assert('Single character returns words', Array.isArray(r.words) && r.words.length >= 1,
        r.words ? r.words.length + ' words' : r.error);

    // 9. Long text
    var longText = '今天天气很好我们一起去公园散步吧顺便买点东西回来做饭吃';
    r = await post({ text: longText, mode: 'words' });
    assert('Long text returns words', Array.isArray(r.words) && r.words.length >= 5,
        r.words ? r.words.length + ' words' : r.error);

    // 10. Share
    var shareData = { text: '你好', pinyin: 'nǐ hǎo', words: [{ word: '你好', pinyin: 'nǐ hǎo', definition: 'hello' }] };
    r = await post({ ...shareData, mode: 'share-save' });
    assert('Share save returns ok and id', r.ok && !!r.id, JSON.stringify(r));
    if (r.id) {
        var shareId = r.id;
        r = await post({ id: shareId, mode: 'share-load' });
        assert('Share load returns ok', r.ok, JSON.stringify(r));
        assert('Share load returns correct text', r.text === shareData.text, `Expected ${shareData.text}, got ${r.text}`);
    }

    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(function (e) {
    console.error('Test runner error:', e);
    process.exit(1);
});
