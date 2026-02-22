const { put, list, get } = require('@vercel/blob');
const GMI_KEY = process.env.GMI_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'openai/gpt-4o-mini';
const API_TIMEOUT = 15000; // 15 seconds
async function fetchPinyin(text) {
  try {
    const res = await fetch('https://api.gmi-serving.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GMI_KEY}` },
      signal: AbortSignal.timeout(API_TIMEOUT),
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: 'You are a pinyin converter for Mandarin Chinese. Output only the pinyin with tone marks (e.g., nǐ hǎo for 你好). Use spaces between words/syllables. No explanations, no other text.' },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 2000,
      }),
    });
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = {}; }
    if (res.status !== 200) {
      const msg = data?.error?.message || data?.message || raw.slice(0, 150);
      return { error: `Pinyin API ${res.status}: ${msg}` };
    }
    const choice = (data?.choices?.[0]) ?? null;
    console.log('Pinyin raw choice:', JSON.stringify(choice).slice(0, 500));
    const content = (choice?.message?.content ?? '').trim();
    const usage = data?.usage || null;
    console.log('Pinyin response:', content.slice(0, 200));
    return { pinyin: content || text, usage };
  } catch (e) {
    return { error: 'Pinyin: ' + (e.message || String(e)) };
  }
}

async function fetchWordBreakdown(text) {
  try {
    const res = await fetch('https://api.gmi-serving.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GMI_KEY}` },
      signal: AbortSignal.timeout(API_TIMEOUT),
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: 'Segment Chinese text into individual words. For each unique word, return a JSON array of objects: {"word": "你", "pinyin": "nǐ", "definition": "you"}. Output ONLY valid JSON, no other text.' },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 4000,
      }),
    });
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = {}; }
    if (res.status !== 200) {
      const msg = data?.error?.message || data?.message || raw.slice(0, 150);
      return { error: `Word breakdown API ${res.status}: ${msg}` };
    }
    const choice = (data?.choices?.[0]) ?? null;
    const content = (choice?.message?.content ?? '').trim();
    const usage = data?.usage || null;
    console.log('Word breakdown response (' + (choice?.finish_reason || '?') + '):', content.slice(0, 300));
    let words;
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { words = JSON.parse(cleaned); } catch {
      console.warn('Word breakdown: could not parse LLM response:', content.slice(0, 500));
      return { error: 'Word breakdown: invalid JSON from LLM', usage };
    }
    return { words, usage };
  } catch (e) {
    return { error: 'Word breakdown: ' + (e.message || String(e)) };
  }
}

async function fetchTts(text) {
  try {
    const res = await fetch('https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GMI_KEY}` },
      signal: AbortSignal.timeout(API_TIMEOUT),
      body: JSON.stringify({
        model: 'inworld-tts-1.5-max',
        payload: {
          text,
          voice_id: 'Jing',
          audio_encoding: 'MP3',
          sample_rate_hertz: 22050,
          speaking_rate: 0.85,
          temperature: 1.1,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { error: `TTS ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = await res.json();
    const audioUrl = data?.outcome?.media?.[0]?.url || data?.outcome?.audio_url;
    if (!audioUrl) {
      return { error: 'TTS: no audio URL in response' };
    }
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return { error: `TTS audio download ${audioRes.status}` };
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    return { audioBase64: buf.toString('base64') };
  } catch (e) {
    return { error: 'TTS: ' + (e.message || String(e)) };
  }
}

module.exports = async function handler(req, res) {
  console.log('Vercel environment check. Token available:', !!process.env.BLOB_READ_WRITE_TOKEN, 'Request mode:', req.body.mode);
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { mode, text: input, id } = req.body;

    if (!input && mode !== 'share-load') {
      res.json({ ok: false, error: 'No text provided.' });
      return;
    }

    if (mode === 'share-save') {
      const data = { text: input, pinyin: req.body?.pinyin || null, words: req.body?.words || null };
      const id = Math.random().toString(36).slice(2, 8);
      try {
        const blob = await put('shares/' + id + '.json', JSON.stringify(data), {
          contentType: 'application/json',
          access: 'private'
        });
        res.json({ ok: true, id });
      } catch (e) {
        console.error('Share save error:', e);
        res.json({ ok: false, error: 'Could not save share' });
      }
      return;
    }

    if (mode === 'share-load') {
      const id = (req.body?.id || '').replace(/[^a-z0-9]/gi, '');
      if (!id) { res.json({ ok: false, error: 'No share ID' }); return; }
      try {
        const { blobs } = await list({ prefix: 'shares/' + id + '.json', limit: 1 });
        if (!blobs.length) { res.json({ ok: false, error: 'Share not found' }); return; }
        const blob = await get(blobs[0].url, {
          access: 'private',
          token: process.env.BLOB_READ_WRITE_TOKEN
        });
        const data = await new Response(blob.stream).json();
        res.json({ ok: true, ...data });
      } catch (e) {
        console.error('Share load error:', e);
        res.json({ ok: false, error: 'Could not load share' });
      }
      return;
    }

    if (mode === 'tts') {
      if (!GMI_KEY) { res.json({ ok: false, error: 'TTS: GMI_API_KEY not set.' }); return; }
      const tr = await fetchTts(input);
      res.json({ ok: !tr.error, error: tr.error || null, audioBase64: tr.audioBase64 || null });
      return;
    }

    if (mode === 'pinyin') {
      if (!GMI_KEY) { res.json({ ok: false, error: 'GMI_API_KEY not set.' }); return; }
      const pr = await fetchPinyin(input);
      res.json({ ok: !pr.error, error: pr.error || null, pinyin: pr.pinyin || null, usage: pr.usage || null });
      return;
    }

    if (mode === 'words') {
      if (!GMI_KEY) { res.json({ ok: false, error: 'GMI_API_KEY not set.' }); return; }
      const wr = await fetchWordBreakdown(input);
      const pinyin = Array.isArray(wr.words) ? wr.words.map(w => w.pinyin).join(' ') : null;
      res.json({ ok: !wr.error, error: wr.error || null, words: wr.words || null, pinyin, usage: wr.usage || null });
      return;
    }

    // Legacy: ttsOnly flag
    if (req.body?.ttsOnly === true) {
      if (!GMI_KEY) { res.json({ ok: false, error: 'TTS: GMI_API_KEY not set.' }); return; }
      const tr = await fetchTts(input);
      res.json({ ok: !tr.error, error: tr.error || null, audioBase64: tr.audioBase64 || null });
      return;
    }

    const errors = [];
    let pinyin = input;
    let audioBase64 = null;
    let words = null;
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    if (GMI_KEY) {
      const [pr, wr, tr] = await Promise.all([fetchPinyin(input), fetchWordBreakdown(input), fetchTts(input)]);
      if (pr.error) { errors.push(pr.error); } else { pinyin = pr.pinyin; }
      if (tr.error) { errors.push(tr.error); } else { audioBase64 = tr.audioBase64; }
      if (wr.error) { errors.push(wr.error); } else { words = wr.words; }
      if (pr.usage) { totalUsage.prompt_tokens += pr.usage.prompt_tokens; totalUsage.completion_tokens += pr.usage.completion_tokens; totalUsage.total_tokens += pr.usage.total_tokens; }
      if (wr.usage) { totalUsage.prompt_tokens += wr.usage.prompt_tokens; totalUsage.completion_tokens += wr.usage.completion_tokens; totalUsage.total_tokens += wr.usage.total_tokens; }
    }

    res.json({
      ok: errors.length === 0,
      error: errors.join(', ') || null,
      pinyin,
      audioBase64,
      words,
      usage: totalUsage.total_tokens > 0 ? totalUsage : null,
    });
  } catch (e) {
    console.error('Internal server error:', e);
    res.status(500).json({ ok: false, error: 'Internal server error: ' + e.message });
  }
};