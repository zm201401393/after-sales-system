/**
 * 神经网络语音合成（TTS）—— 基于 msedge-tts，免费、无需 API Key。
 * 通过微软 Edge 在线 TTS 服务（Azure 神经音色）合成 mp3。
 * 失败时返回 null，前端自动降级到浏览器 SpeechSynthesis。
 */
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const DEFAULT_VOICE = process.env.TTS_VOICE || 'zh-CN-XiaoxiaoNeural';
const FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS) || 12000;

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// 合成语音，返回 mp3 Buffer；任何失败返回 null（让前端降级）
async function synthesize(text, voice = DEFAULT_VOICE) {
  if (!text || !text.trim()) return null;
  const tts = new MsEdgeTTS();
  const run = (async () => {
    await tts.setMetadata(voice, FORMAT);
    // 语速接近自然偏快、音调微高 —— 干练不拖沓，又不失亲和
    const { audioStream } = await tts.toStream(text, { rate: '+8%', pitch: '+3%', volume: '+0%' });
    return await streamToBuffer(audioStream);
  })();

  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('tts timeout')), TTS_TIMEOUT_MS); });
  try {
    const buf = await Promise.race([run, timeout]);
    return buf && buf.length ? buf : null;
  } catch (e) {
    console.warn('[tts] 合成失败，前端将降级浏览器TTS:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
    try { tts.close(); } catch {}
  }
}

module.exports = { synthesize, DEFAULT_VOICE };
