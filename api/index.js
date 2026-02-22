const GMI_KEY = process.env.GMI_API_KEY || '';

async function fetchPinyin(text) {
  try {
    const res = await fetch('https://api.gmi-serving.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GMI_KEY}` },
      body: JSON.stringify({
        model: 'zai-org/GLM-5-FP8',
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
    const content = (choice?.message?.content ?? '').trim();
    return { pinyin: content || text };
  } catch (e) {
    return { error: 'Pinyin: ' + (e.message || String(e)) };
  }
}

async function fetchTts(text) {
  try {
    const res = await fetch('https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GMI_KEY}` },
      body: JSON.stringify({
        model: 'inworld-tts-1.5-max',
        payload: {
          text,
          voice_id: 'Xinyi',
          audio_encoding: 'MP3',
          sample_rate_hertz: 22050,
          speaking_rate: 1.0,
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const input = (req.body?.text || '').trim();
    if (!input) {
      res.json({ ok: false, error: 'No text provided.' });
      return;
    }

    const errors = [];
    let pinyin = input;
    let audioBase64 = null;

    if (GMI_KEY) {
      const pr = await fetchPinyin(input);
      if (pr.error) errors.push(pr.error);
      else pinyin = pr.pinyin;
    }

    if (GMI_KEY) {
      const tr = await fetchTts(input);
      if (tr.error) errors.push(tr.error);
      else audioBase64 = tr.audioBase64;
    } else {
      errors.push('TTS: GMI_API_KEY not set.');
    }

    res.json({
      ok: errors.length === 0,
      error: errors.length ? errors.join(' ') : null,
      text: input,
      pinyin,
      audioBase64,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error: ' + (err.message || String(err)) });
  }
}
