<template>
  <el-dialog
    v-model="visible"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    width="420px"
    align-center
    custom-class="phone-call-dialog"
  >
    <div class="phone-stage" :class="state">
      <!-- 状态栏 -->
      <div class="status-bar">
        <span class="dot" :class="state"></span>
        <span class="status-text">{{ statusText }}</span>
        <span class="duration" v-if="state === 'connected' || state === 'ended'">{{ durationStr }}</span>
      </div>

      <!-- 醒目：已转人工 -->
      <div v-if="state === 'ended' && finalOutcome === 'handoff'" class="handoff-flash">
        <span class="hf-icon">👤</span>
        <div class="hf-text">
          <div class="hf-title">已为您转接人工客服</div>
          <div class="hf-sub">AI 已退出本次通话，人工客服将尽快跟进</div>
        </div>
      </div>

      <!-- 头像 + 号码 -->
      <div class="avatar-area">
        <div class="avatar-ring" :class="{ pulse: state === 'connected' && (speaking || listening) }">
          <div class="avatar">
            {{ (consumerName || '').slice(0, 1) || '客' }}
          </div>
        </div>
        <h2 class="caller-name">{{ consumerName || '消费者' }}</h2>
        <div class="caller-phone">{{ phone }}</div>
        <div class="ai-badge-row">
          <span class="ai-tag">🤖 AI 智能外呼</span>
          <span class="agent-name">· {{ agentName }}</span>
        </div>
      </div>

      <!-- 实时字幕 -->
      <div class="subtitle-area" ref="subtitleArea">
        <div v-if="state === 'ringing'" class="dialing">
          <div class="ring ring-1"></div>
          <div class="ring ring-2"></div>
          <div class="ring ring-3"></div>
          <div class="dialing-text">正在拨号...</div>
        </div>
        <div v-else-if="state === 'connected' || state === 'ended'" class="caption-list">
          <template v-for="(m, i) in captions" :key="i">
            <div v-if="m.role === 'system'" class="caption-system">{{ m.content }}</div>
            <div v-else class="caption" :class="m.role">
              <div class="cap-label">{{ m.role === 'ai' ? agentName : (consumerName || '消费者') }}</div>
              <div class="cap-text">{{ m.content }}</div>
            </div>
          </template>
          <div v-if="speaking" class="caption ai live">
            <div class="cap-label">{{ agentName }}</div>
            <div class="cap-text"><span class="speaker-icon">🔊</span> {{ liveSpeakingText || '正在说话...' }}</div>
          </div>
          <div v-if="generating && !speaking" class="caption ai live">
            <div class="cap-label">{{ agentName }}</div>
            <div class="cap-text thinking"><span class="dot-flash"></span><span class="dot-flash"></span><span class="dot-flash"></span> 正在想怎么回您…（您可随时补充）</div>
          </div>
          <div v-if="listening && interimTranscript" class="caption consumer live">
            <div class="cap-label">{{ consumerName || '消费者' }}</div>
            <div class="cap-text"><span class="mic-icon">🎙</span> {{ interimTranscript }}</div>
          </div>
          <div v-else-if="listening && !generating && !speaking" class="caption consumer live">
            <div class="cap-label">{{ consumerName || '消费者' }}</div>
            <div class="cap-text"><span class="mic-icon">🎙</span> 正在聆听...</div>
          </div>
        </div>
      </div>

      <!-- 兜底输入：浏览器不支持 ASR 时手动输入消费者回复 -->
      <div v-if="state === 'connected' && !asrSupported" class="manual-input">
        <div class="manual-tip">⚠ 当前浏览器不支持语音识别，请手动模拟消费者回复：</div>
        <div class="manual-row">
          <input v-model="manualText" placeholder="消费者会怎么说？" @keyup.enter="submitManual" class="manual-textbox" />
          <button class="manual-btn" :disabled="!manualText.trim() || generating" @click="submitManual">发送</button>
        </div>
      </div>

      <!-- 操作区 -->
      <div class="actions">
        <template v-if="state === 'ringing'">
          <button class="btn-hangup" @click="hangup">取消</button>
        </template>
        <template v-else-if="state === 'connected'">
          <button class="btn-mute" @click="toggleMute" :class="{ active: muted }">
            {{ muted ? '🔇' : '🎙' }}<span class="btn-label">{{ muted ? '已静音' : '麦克风' }}</span>
          </button>
          <button class="btn-hangup big" @click="hangup">
            ☎<span class="btn-label">挂断</span>
          </button>
          <button class="btn-takeover" @click="onTakeover">
            👤<span class="btn-label">接管</span>
          </button>
        </template>
        <template v-else>
          <button class="btn-redial" @click="redial">📞<span class="btn-label">重新拨打</span></button>
          <button class="btn-secondary" @click="closeDialog">关闭</button>
        </template>
      </div>

      <!-- 结束态 -->
      <div v-if="state === 'ended' && (finalSummary || summaryDetail)" class="end-summary" :class="'oc-' + (finalOutcome || 'default')">
        <div class="es-title">{{ summaryDetail?.headline || '通话已结束' }}</div>
        <div class="es-grid" v-if="summaryDetail">
          <div class="es-row" v-if="summaryDetail.consumer_need"><span>诉求</span><b>{{ summaryDetail.consumer_need }}</b></div>
          <div class="es-row" v-if="summaryDetail.deal_detail"><span>{{ finalOutcome === 'deal' ? '方案' : '内容' }}</span><b>{{ summaryDetail.deal_detail }}</b></div>
          <div class="es-row" v-if="summaryDetail.next_action"><span>操作</span><b class="next">{{ summaryDetail.next_action }}</b></div>
        </div>
        <div v-else class="es-text">{{ finalSummary }}</div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onUnmounted, onMounted, watch, nextTick } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: Boolean,
  serviceOrderId: { type: [Number, String], required: true },
  phone: { type: String, default: '' },
  consumerName: { type: String, default: '' },
  agentName: { type: String, default: '小棠' },
  templateId: { type: [Number, String], default: null },
  scenario: { type: String, default: 'negotiate' },
  merchantRemark: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'ended', 'takeover'])

const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})

const state = ref('idle')   // idle | ringing | connected | ended
const captions = ref([])    // {role:'ai'|'consumer', content}
const subtitleArea = ref(null)
const speaking = ref(false)
const listening = ref(false)
const interimTranscript = ref('')
const liveSpeakingText = ref('')
const muted = ref(false)
const sessionId = ref(null)
const generating = ref(false)
const manualText = ref('')
const finalSummary = ref('')
const finalOutcome = ref('')
const summaryDetail = ref(null)

const startedAt = ref(null)
const duration = ref(0)
let durationTimer = null
const durationStr = computed(() => {
  const s = duration.value
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})

const statusText = computed(() => ({
  idle: '准备中', ringing: '正在拨号', connected: '通话中', ended: '通话已结束'
})[state.value])

// 实时字幕始终滚动到最新
function scrollCaptionsToBottom() {
  nextTick(() => { const el = subtitleArea.value; if (el) el.scrollTop = el.scrollHeight })
}
watch(() => captions.value.length, () => scrollCaptionsToBottom())
watch([speaking, listening, generating, interimTranscript, liveSpeakingText], () => scrollCaptionsToBottom())

/* ============ Web Speech 检测 ============ */
const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const asrSupported = ref(!!SpeechRecognition)
const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
let recognition = null
let recognitionRestartTimer = null
let recogGen = 0           // 识别实例代号：旧实例的回调一律忽略，杜绝多实例并发导致的重复
let followupTimer = null
let followupCount = 0
const MAX_FOLLOWUPS = 2

// 消费者长时间没说话 → AI 主动跟一句，避免冷场
function clearFollowup() {
  if (followupTimer) { clearTimeout(followupTimer); followupTimer = null }
}
function armFollowup() {
  clearFollowup()
  if (state.value !== 'connected') return
  followupTimer = setTimeout(async () => {
    if (state.value !== 'connected' || speaking.value || generating.value || muted.value) return
    if (followupCount >= MAX_FOLLOWUPS) return
    followupCount++
    const prompts = [
      '嗯？您那边方便说话吗？',
      '我在听呢，您慢慢说哈～',
    ]
    const line = prompts[Math.min(followupCount - 1, prompts.length - 1)]
    captions.value.push({ role: 'ai', content: line })
    await speak(line)
    armFollowup()
  }, 2800)
}

function setupRecognition() {
  if (!SpeechRecognition) return null
  const r = new SpeechRecognition()
  const myGen = ++recogGen      // 本实例代号；之后只认这个代号的回调
  r._gen = myGen
  r.lang = 'zh-CN'
  r.continuous = true            // 持续监听
  r.interimResults = true
  r.maxAlternatives = 1
  let pendingFinal = ''
  let latestInterim = ''
  let silenceTimer = null

  const isStale = () => myGen !== recogGen   // 已被新实例取代 → 回调作废

  // 静音后提交：合并 final + 还没转正的 interim（快语速时引擎常只给 interim）
  function flush() {
    if (isStale()) return
    const text = (pendingFinal + latestInterim).trim()
    pendingFinal = ''
    latestInterim = ''
    interimTranscript.value = ''
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null }
    if (text) onConsumerSaid(text)
  }
  function armSilence() {
    if (silenceTimer) clearTimeout(silenceTimer)
    // 停顿 450ms 即认为一句话说完（更快接话；快语速也不丢字）
    silenceTimer = setTimeout(flush, 450)
  }

  r.onresult = (ev) => {
    if (isStale()) return
    let interim = '', finalT = ''
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript
      if (ev.results[i].isFinal) finalT += t
      else interim += t
    }
    if (interim || finalT) {
      // 消费者出声：说话中=打断（停止播报），思考中=静默收集补充
      if (speaking.value) {
        try { window.speechSynthesis.cancel() } catch {}
        stopCurrentAudio()
        speaking.value = false
        liveSpeakingText.value = ''
      }
      clearFollowup()
    }
    if (finalT) { pendingFinal += finalT }
    latestInterim = interim
    interimTranscript.value = (pendingFinal + interim) || ''
    // 任意结果（含 interim）都重置静音计时 → 快语速不丢字
    if (interim || finalT) armSilence()
  }

  // 引擎判定说话结束 → 立即提交（比静音计时更快接话）
  r.onspeechend = () => { if (!isStale()) flush() }

  r.onend = () => {
    if (isStale()) return     // 旧实例结束，不重连（避免多实例并发→重复识别）
    listening.value = false
    scheduleRestart()
  }
  r.onerror = (e) => {
    if (isStale()) return
    listening.value = false
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      asrSupported.value = false
      ElMessage.warning('未授权麦克风，请在浏览器允许麦克风权限，或使用下方文本框模拟消费者回复')
      return
    }
    // no-speech / network / aborted 等瞬时错误 → 重连，不放弃
    scheduleRestart()
  }
  return r
}

// 健壮的识别重启：通话中且未静音就不断尝试，直到成功
function scheduleRestart() {
  if (recognitionRestartTimer) clearTimeout(recognitionRestartTimer)
  if (state.value !== 'connected' || muted.value || !recognition) return
  recognitionRestartTimer = setTimeout(() => {
    if (state.value !== 'connected' || muted.value || !recognition) return
    try {
      recognition.start()
      listening.value = true
    } catch (e) {
      // 引擎还没释放完 → 稍后再试
      scheduleRestart()
    }
  }, 250)
}

function startListening() {
  if (!recognition || muted.value) return
  try {
    recognition.start()
    listening.value = true
  } catch (e) { /* 已经在 listening */ }
}
function stopListening() {
  if (recognition) try { recognition.stop() } catch {}
  listening.value = false
}

// 重建一个干净的识别实例（仅在确需时调用，如静音/长时间无结果）。bump 代号让旧实例回调全部作废
function recycleRecognition() {
  if (!asrSupported.value || muted.value || state.value !== 'connected') return
  recogGen++   // 作废旧实例的所有回调
  try {
    if (recognition) { recognition.onresult = null; recognition.onend = null; recognition.onerror = null; recognition.onspeechend = null; try { recognition.stop() } catch {}; try { recognition.abort() } catch {} }
  } catch {}
  recognition = setupRecognition()
  startListening()
}

/* ============ TTS（更自然的中文女声 + 节奏控制） ============ */
let _cachedVoice = null
function pickBestVoice() {
  if (_cachedVoice) return _cachedVoice
  const voices = window.speechSynthesis.getVoices() || []
  // 优先级：微软晓晓/晓伊 > 微软中文女声 > 系统中文女声 > 任意中文
  const preferred = [
    /Xiaoxiao/i, /Xiaoyi/i, /Yunyang/i, /Yating/i, /Tianxiang/i,
    /Microsoft.*(?:Huihui|Yaoyao|Kangkang|Hanhan).*Chinese/i,
    /Chinese.*Female/i, /zh-CN.*female/i,
  ]
  for (const re of preferred) {
    const v = voices.find(v => re.test(v.name) || re.test(v.voiceURI || ''))
    if (v) { _cachedVoice = v; return v }
  }
  const anyZh = voices.find(v => /zh/i.test(v.lang))
  _cachedVoice = anyZh || voices[0]
  return _cachedVoice
}

// 给文本加自然停顿（在长句中插入空格让 TTS 自然换气）
function addNaturalPauses(text) {
  if (!text) return text
  // 句末、逗号、分号后保留；句中遇到"那个/这样/啊/呢"等填充词稍微留白
  return text
    .replace(/([，。！？；])/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
}

/* ============ 当前播放的音频（云端神经语音） ============ */
let currentAudio = null
let currentSpeakResolve = null   // 当前 speak() 的 resolve，用于被打断时立即结束
function stopCurrentAudio() {
  if (currentAudio) {
    try { currentAudio.onended = null; currentAudio.onerror = null; currentAudio.pause(); currentAudio.src = '' } catch {}
    currentAudio = null
  }
  // 被打断 → 立即结束挂起的 speak()，不让对话卡住
  if (currentSpeakResolve) {
    const r = currentSpeakResolve
    currentSpeakResolve = null
    speaking.value = false
    liveSpeakingText.value = ''
    r()
  }
}

// 优先云端神经语音（真人级），失败降级浏览器 TTS
function speak(text) {
  return new Promise(async (resolve) => {
    if (!text) return resolve()
    currentSpeakResolve = resolve
    speaking.value = true
    liveSpeakingText.value = text
    try { window.speechSynthesis.cancel() } catch {}
    if (currentAudio) { try { currentAudio.onended = null; currentAudio.onerror = null; currentAudio.pause() } catch {}; currentAudio = null }

    // 尝试云端神经 TTS
    try {
      const resp = await axios.post('/api/ai-sessions/tts', { text }, { responseType: 'blob', timeout: 15000 })
      if (resp.data && resp.data.size > 0 && currentSpeakResolve === resolve) {
        const url = URL.createObjectURL(resp.data)
        const audio = new Audio(url)
        currentAudio = audio
        const done = () => {
          URL.revokeObjectURL(url)
          if (currentAudio === audio) currentAudio = null
          if (currentSpeakResolve === resolve) {
            currentSpeakResolve = null
            speaking.value = false
            liveSpeakingText.value = ''
            resolve()
          }
        }
        audio.onended = done
        audio.onerror = () => { done() }
        await audio.play()
        return
      }
      if (currentSpeakResolve !== resolve) return  // 已被打断
    } catch (e) {
      // 云端不可用 → 降级浏览器 TTS
    }
    browserSpeak(text, () => {
      if (currentSpeakResolve === resolve) { currentSpeakResolve = null; resolve() }
    })
  })
}

// 浏览器内置 TTS（降级方案）
function browserSpeak(text, resolve) {
  if (!ttsSupported) { speaking.value = false; liveSpeakingText.value = ''; return resolve() }
  const processedText = addNaturalPauses(text)
  const utter = new SpeechSynthesisUtterance(processedText)
  utter.lang = 'zh-CN'
  utter.rate = 1.08
  utter.pitch = 1.05
  utter.volume = 1.0
  const v = pickBestVoice()
  if (v) utter.voice = v
  utter.onend = () => { speaking.value = false; liveSpeakingText.value = ''; resolve() }
  utter.onerror = () => { speaking.value = false; liveSpeakingText.value = ''; resolve() }
  window.speechSynthesis.speak(utter)
}

// 浏览器首次拿不到 voices 时延迟拿
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => { _cachedVoice = null; pickBestVoice() }
}

/* ============ 通话主流程 ============ */
async function startCall() {
  // 重置全部状态（支持重新拨打）
  state.value = 'ringing'
  captions.value = []
  finalSummary.value = ''
  finalOutcome.value = ''
  summaryDetail.value = null
  sessionId.value = null
  duration.value = 0
  speaking.value = false
  listening.value = false
  interimTranscript.value = ''
  liveSpeakingText.value = ''
  followupCount = 0
  clearFollowup()
  pendingText = ''
  turnSeq++
  lastConsumerCapAt = 0
  lastSubmittedText = ''
  lastSubmittedAt = 0
  if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }

  // 模拟拨号 1.8s
  await new Promise(r => setTimeout(r, 1800))

  // 调用后端发起 session（同时拿到开场白）
  try {
    const payload = {
      service_order_id: props.serviceOrderId,
      channel: 'voice',
      scenario: props.scenario,
      merchant_remark: props.merchantRemark,
      phone: props.phone,
    }
    if (props.templateId) payload.template_id = props.templateId
    const { data } = await axios.post('/api/ai-sessions/start', payload)
    sessionId.value = data.session_id || data.id
    state.value = 'connected'
    startedAt.value = Date.now()
    durationTimer = setInterval(() => {
      duration.value = Math.floor((Date.now() - startedAt.value) / 1000)
    }, 1000)

    if (asrSupported.value) recognition = setupRecognition()
    // 先开监听（这样 AI 还在说时消费者也能打断）
    if (asrSupported.value && !muted.value) startListening()

    // 开场白后台异步生成 → 轮询拿到后再播报
    let aiOpening = (data.messages || []).find(m => m.role === 'ai')
    if (!aiOpening && data.opening_pending) {
      generating.value = true
      for (let i = 0; i < 40 && state.value === 'connected'; i++) {
        await new Promise(r => setTimeout(r, 1000))
        try {
          const { data: s } = await axios.get(`/api/ai-sessions/${sessionId.value}`)
          aiOpening = (s.messages || []).find(m => m.role === 'ai')
          if (aiOpening) break
        } catch {}
      }
      generating.value = false
    }
    if (aiOpening && state.value === 'connected') {
      captions.value.push({ role: 'ai', content: aiOpening.content })
      await speak(aiOpening.content)
      armFollowup()
    }
  } catch (e) {
    state.value = 'ended'
    finalSummary.value = e.response?.data?.error || '拨号失败'
    finalOutcome.value = 'no_deal'
  }
}

/* ============ 轮次管理：支持思考中插话 + 打断重答 ============ */
let turnSeq = 0          // 每次消费者新说话就 +1，使在途回复作废
let pendingText = ''     // 攒着还没发出的消费者话（多句合并）
let settleTimer = null   // 消费者说完后的小延迟，等他把话说完整再发
let lastConsumerCapAt = 0  // 上一条消费者气泡的时间戳（用于合并）
let lastSubmittedText = '' // 上一次提交的文本（去重，防同句被识别多遍）
let lastSubmittedAt = 0

// 折叠文本里被识别引擎重复吐出的同一句（如"你还在吗你还在吗你还在吗"→"你还在吗"）
function dedupRepeats(s) {
  if (!s) return s
  let t = s.trim().replace(/\s+/g, ' ')
  // 整串由同一短语重复 N 次组成 → 只保留一次
  for (let len = 1; len <= Math.floor(t.length / 2); len++) {
    const unit = t.slice(0, len)
    if (unit.repeat(Math.floor(t.length / len)) === t.slice(0, len * Math.floor(t.length / len)) && t.length % len === 0) {
      return unit
    }
  }
  // 相邻重复短语（用标点/空格分隔的相同片段）去重
  const parts = t.split(/[，,。\s]+/).filter(Boolean)
  const out = []
  for (const p of parts) { if (out[out.length - 1] !== p) out.push(p) }
  return out.join('，') || t
}

function pushConsumerCaption(text) {
  const nowMs = Date.now()
  const caps = captions.value
  const last = caps[caps.length - 1]
  // 与上一条消费者气泡间隔 <5s → 合并为同一条；否则新起一条
  if (last && last.role === 'consumer' && (nowMs - lastConsumerCapAt) < 5000) {
    // 若新内容与已有内容重复，不再追加
    if (!last.content.includes(text)) last.content = dedupRepeats((last.content + ' ' + text))
  } else {
    caps.push({ role: 'consumer', content: text })
  }
  lastConsumerCapAt = nowMs
}

function onConsumerSaid(rawText) {
  const text = dedupRepeats(rawText)
  if (!text || !sessionId.value || state.value !== 'connected') return
  // 去重：与上次提交相同且在 3s 内 → 视为识别重复，丢弃
  const nowMs = Date.now()
  if (text === lastSubmittedText && (nowMs - lastSubmittedAt) < 3000) { interimTranscript.value = ''; return }
  lastSubmittedText = text
  lastSubmittedAt = nowMs
  clearFollowup()
  followupCount = 0
  // 立即上屏（一次对话合并为一条，间隔>5s 才拆条）
  pushConsumerCaption(text)
  // 正在播报 → 立刻停（打断）
  if (speaking.value) {
    try { window.speechSynthesis.cancel() } catch {}
    stopCurrentAudio()
    speaking.value = false
    liveSpeakingText.value = ''
  }
  // 任何新输入都让"当前在途回复"作废（思考中插话 / 说话中打断都走这里）
  turnSeq++
  pendingText = pendingText ? pendingText + '，' + text : text
  interimTranscript.value = ''
  // 等他把话说完整（300ms 内没有新句子）再发，允许多句自然合并
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = setTimeout(flushTurn, 300)
}

async function flushTurn() {
  if (!pendingText.trim() || !sessionId.value || state.value !== 'connected') return
  const text = pendingText.trim()
  pendingText = ''
  const myTurn = turnSeq
  generating.value = true
  // 停掉可能残留的播报
  try { window.speechSynthesis.cancel() } catch {}
  stopCurrentAudio()
  speaking.value = false
  liveSpeakingText.value = ''
  try {
    const { data } = await axios.post(`/api/ai-sessions/${sessionId.value}/reply`, { content: text })
    // 期间消费者又说话了 → 本次回复作废，由新一轮处理（不抢话、不错轮次）
    if (myTurn !== turnSeq) return
    const aiMsgs = (data.messages || []).filter(m => m.role === 'ai')
    const lastAi = aiMsgs[aiMsgs.length - 1]
    if (data.session.status !== 'running') {
      finalSummary.value = data.session.summary || data.session.outcome_detail || '通话已结束'
      finalOutcome.value = data.session.outcome
      generating.value = false
      if (lastAi) { captions.value.push({ role: 'ai', content: lastAi.content }); await speak(lastAi.content) }
      if (myTurn !== turnSeq) return
      endCall(true)
      axios.post(`/api/ai-sessions/${sessionId.value}/summarize`).then(({ data: s }) => { summaryDetail.value = s }).catch(() => {})
      return
    }
    if (lastAi) {
      generating.value = false
      captions.value.push({ role: 'ai', content: lastAi.content })
      await speak(lastAi.content)
    }
    // 被打断则不再重建/计时，交给新一轮
    if (myTurn !== turnSeq) return
    // 同一识别实例持续监听即可（不再每轮重建，避免多实例并发→重复识别）
    if (asrSupported.value && !muted.value && !listening.value) startListening()
    armFollowup()
  } catch (e) {
    if (myTurn === turnSeq) ElMessage.error(e.response?.data?.error || 'AI 回复失败')
  } finally {
    if (myTurn === turnSeq) generating.value = false
    // 期间又攒了新话 → settleTimer 会再次触发 flushTurn
    if (pendingText.trim() && state.value === 'connected') {
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(flushTurn, 200)
    }
  }
}

function submitManual() {
  if (!manualText.value.trim()) return
  const t = manualText.value
  manualText.value = ''
  onConsumerSaid(t)
}

function toggleMute() {
  muted.value = !muted.value
  if (muted.value) stopListening()
  else if (asrSupported.value && !speaking.value) startListening()
}

async function hangup() {
  const sid = sessionId.value
  endCall(false)
  // 挂断即代表通话结束：通知后端结束会话 + 触发总结，避免再回到面板还显示"进行中"
  if (sid) {
    try {
      await axios.post(`/api/ai-sessions/${sid}/takeover`)
      finalOutcome.value = finalOutcome.value || 'handoff'
      axios.post(`/api/ai-sessions/${sid}/summarize`).then(({ data: s }) => { summaryDetail.value = s }).catch(() => {})
    } catch {}
    emit('ended', { session_id: sid })
  }
}

function endCall(serverEnded) {
  if (state.value === 'ended') return
  state.value = 'ended'
  if (durationTimer) { clearInterval(durationTimer); durationTimer = null }
  stopListening()
  try { window.speechSynthesis.cancel() } catch {}
  stopCurrentAudio()
  clearFollowup()
  if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
  pendingText = ''
  turnSeq++   // 作废所有在途回复
  if (recognitionRestartTimer) { clearTimeout(recognitionRestartTimer); recognitionRestartTimer = null }
  if (!finalSummary.value) finalSummary.value = `通话时长 ${durationStr.value}`
  emit('ended', { session_id: sessionId.value })
}

// 重新拨打：结束后直接发起一通新的外呼（新建 session）
function redial() {
  callStarted = true
  startCall()
}

function closeDialog() {
  visible.value = false
  // 清理状态
  state.value = 'idle'
  captions.value = []
  duration.value = 0
  sessionId.value = null
}

async function onTakeover() {
  if (!sessionId.value) return
  await axios.post(`/api/ai-sessions/${sessionId.value}/takeover`)
  ElMessage.success('已接管')
  finalSummary.value = '商家已接管通话'
  finalOutcome.value = 'handoff'
  endCall(true)
  emit('takeover')
}

// 防止重复拨号：watch 与 onMounted 可能同时触发
let callStarted = false
function maybeStartCall() {
  if (callStarted) return
  if (state.value === 'ringing' || state.value === 'connected') return
  callStarted = true
  nextTick(() => startCall())
}

// 组件挂载时若已可见（首次点击：v-if 懒创建 + visible 已为 true），立即拨号
onMounted(() => {
  if (visible.value) maybeStartCall()
})

watch(visible, (v) => {
  if (v) maybeStartCall()
  else callStarted = false   // 关闭后允许下次重新拨号
})

onUnmounted(() => {
  try { window.speechSynthesis.cancel() } catch {}
  stopListening()
  stopCurrentAudio()
  if (durationTimer) clearInterval(durationTimer)
  if (followupTimer) clearTimeout(followupTimer)
})
</script>

<style scoped>
:deep(.phone-call-dialog) { border-radius: 20px; overflow: hidden; }
:deep(.phone-call-dialog .el-dialog__header) { display: none; }
:deep(.phone-call-dialog .el-dialog__body) { padding: 0; }

.phone-stage {
  background: linear-gradient(160deg, #1e293b 0%, #0f172a 100%);
  color: #f1f5f9;
  padding: 24px 24px 20px;
  min-height: 540px;
  display: flex;
  flex-direction: column;
}

.status-bar { display:flex; align-items:center; gap: 8px; font-size: 12px; color: #94a3b8; padding: 4px 0 18px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #64748b; }
.handoff-flash { display: flex; align-items: center; gap: 12px; background: linear-gradient(135deg, #f59e0b, #ea580c); border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; animation: hf-pop 0.4s ease, hf-glow 1.6s ease-in-out infinite; }
@keyframes hf-pop { 0% { transform: scale(0.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes hf-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); } 50% { box-shadow: 0 0 0 6px rgba(245,158,11,0.25); } }
.hf-icon { font-size: 28px; }
.hf-title { font-size: 15px; font-weight: 700; color: #fff; }
.hf-sub { font-size: 12px; color: rgba(255,255,255,0.85); margin-top: 2px; }
.dot.ringing { background: #f59e0b; animation: blink 1s infinite; }
.dot.connected { background: #10b981; }
.dot.ended { background: #64748b; }
@keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.3; } }
.duration { margin-left: auto; font-family: 'SF Mono', monospace; color: #cbd5e1; }

.avatar-area { text-align: center; padding: 8px 0 16px; }
.avatar-ring { display:inline-block; padding: 6px; border-radius: 50%; background: rgba(255,255,255,0.05); position: relative; }
.avatar-ring.pulse::before, .avatar-ring.pulse::after {
  content:''; position:absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(99,102,241,0.6);
  animation: ring-pulse 1.5s infinite;
}
.avatar-ring.pulse::after { animation-delay: 0.7s; }
@keyframes ring-pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.6); opacity: 0; } }
.avatar { width: 84px; height: 84px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 600; color: #fff; }
.caller-name { font-size: 18px; margin: 14px 0 4px; font-weight: 600; }
.caller-phone { font-size: 13px; color: #94a3b8; font-family: 'SF Mono', monospace; }
.ai-badge-row { margin-top: 10px; font-size: 11px; color: #c7d2fe; }
.ai-tag { background: rgba(99,102,241,0.2); padding: 3px 8px; border-radius: 12px; }
.agent-name { color: #94a3b8; }

.subtitle-area { flex: 1; min-height: 160px; max-height: 240px; overflow-y: auto; margin: 14px 0; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 12px; }

.dialing { display: flex; flex-direction: column; align-items: center; padding: 30px 0; position: relative; }
.dialing .ring { position:absolute; width: 60px; height: 60px; border-radius: 50%; border: 2px solid rgba(245,158,11,0.4); top: 30px; animation: dialing-ring 1.5s infinite; }
.ring-2 { animation-delay: 0.5s; }
.ring-3 { animation-delay: 1s; }
@keyframes dialing-ring { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(1.8); opacity: 0; } }
.dialing-text { color: #94a3b8; font-size: 13px; margin-top: 80px; }

.caption-list { display: flex; flex-direction: column; gap: 10px; }
.caption { display:flex; flex-direction: column; gap: 2px; }
.caption.consumer { align-items: flex-end; }
.cap-label { font-size: 10px; color: #94a3b8; padding: 0 8px; }
.cap-text { font-size: 13px; line-height: 1.6; padding: 6px 10px; border-radius: 8px; max-width: 90%; }
.caption.ai .cap-text { background: rgba(99,102,241,0.18); color: #e0e7ff; }
.caption.consumer .cap-text { background: rgba(16,185,129,0.18); color: #d1fae5; }
.caption.live .cap-text { opacity: 0.75; font-style: italic; }
.cap-text.thinking { display: inline-flex; align-items: center; gap: 4px; }
.dot-flash { width: 5px; height: 5px; border-radius: 50%; background: #c7d2fe; display: inline-block; animation: dot-bounce 1.3s infinite; }
.dot-flash:nth-child(2) { animation-delay: 0.2s; }
.dot-flash:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-3px); opacity: 1; } }
.caption-system { text-align: center; font-size: 11px; color: #fbbf24; opacity: 0.85; padding: 4px 0; }
.speaker-icon, .mic-icon { margin-right: 4px; }

.manual-input { background: rgba(255,255,255,0.05); padding: 10px; border-radius: 10px; margin-bottom: 12px; }
.manual-tip { font-size: 11px; color: #fbbf24; margin-bottom: 6px; }
.manual-row { display: flex; gap: 6px; }
.manual-textbox { flex:1; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #f1f5f9; padding: 6px 10px; border-radius: 6px; outline: none; font-size: 12px; }
.manual-btn { background: #6366f1; color: #fff; border: none; padding: 0 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.manual-btn:disabled { opacity: 0.5; }

.actions { display:flex; gap: 12px; justify-content: center; padding-top: 6px; }
.actions button {
  display:flex; flex-direction: column; align-items: center; gap: 4px;
  border: none; padding: 12px 16px; border-radius: 12px; cursor: pointer;
  background: rgba(255,255,255,0.08); color: #f1f5f9; font-size: 16px; min-width: 70px;
  transition: all 0.15s;
}
.actions button:hover { background: rgba(255,255,255,0.15); }
.btn-label { font-size: 11px; color: #94a3b8; }
.btn-mute.active { background: rgba(239,68,68,0.2); color: #fecaca; }
.btn-hangup { background: rgba(239,68,68,0.85) !important; color: #fff !important; }
.btn-hangup .btn-label { color: rgba(255,255,255,0.8); }
.btn-hangup.big { padding: 14px 22px; font-size: 18px; }
.btn-takeover { background: rgba(245,158,11,0.2) !important; }

.btn-secondary { background: rgba(255,255,255,0.1); color: #f1f5f9; border: none; padding: 8px 24px; border-radius: 8px; cursor: pointer; }
.btn-redial { background: rgba(16,185,129,0.85) !important; color: #fff !important; }
.btn-redial .btn-label { color: rgba(255,255,255,0.85); }

.end-summary { margin-top: 16px; padding: 12px 14px; border-radius: 10px; background: rgba(255,255,255,0.06); border-left: 3px solid #6366f1; }
.end-summary.oc-deal { border-left-color: #10b981; }
.end-summary.oc-handoff, .end-summary.oc-no_deal { border-left-color: #f59e0b; }
.es-title { font-size: 14px; font-weight: 700; color: #f1f5f9; margin-bottom: 8px; }
.es-grid { display: flex; flex-direction: column; gap: 6px; }
.es-row { display: flex; gap: 8px; font-size: 12px; line-height: 1.5; }
.es-row span { color: #94a3b8; min-width: 36px; flex-shrink: 0; }
.es-row b { color: #f1f5f9; font-weight: 500; }
.es-row b.next { color: #fbbf24; }
.es-text { font-size: 13px; line-height: 1.6; color: #f1f5f9; }
</style>
