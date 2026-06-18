<template>
  <div class="ai-negotiation" :class="{ collapsed: !expanded }">
    <!-- 顶部控制条 -->
    <div class="control-bar" @click="toggleExpand">
      <div class="bar-left">
        <span class="ai-icon">🤖</span>
        <span class="bar-title">AI 协商助理</span>
        <span class="ai-badge">智能沟通</span>
        <span v-if="engineStatus" class="engine-tag" :class="engineStatus.has_api_key ? 'on' : 'off'">
          {{ engineStatus.has_api_key ? '大模型已接入 · ' + (engineStatus.model || '') : '规则兜底（未配置大模型 Key）' }}
        </span>
      </div>
      <div class="bar-right">
        <span v-if="sessions.length > 0" class="session-count">{{ sessions.length }} 个会话</span>
        <span v-if="hasRunning" class="running-tag">⚡ 进行中</span>
        <button class="link-btn" @click.stop="goToTemplates">agent配置</button>
        <button class="primary-btn small" @click.stop="onClickStart">
          {{ sessions.length > 0 ? '+ 发起AI协商' : '发起 AI 协商' }}
        </button>
        <span class="caret">{{ expanded ? '▾' : '▸' }}</span>
      </div>
    </div>

    <!-- 折叠展开区 -->
    <div v-if="expanded" class="panel-body">
      <!-- 会话切换 -->
      <div v-if="sessions.length > 0" class="session-tabs">
        <div
          v-for="s in sessions"
          :key="s.id"
          class="tab"
          :class="{ active: activeSession?.id === s.id }"
          @click="loadSession(s.id)"
        >
          <span class="tab-channel">{{ s.channel === 'voice' ? '☎ 外呼' : '◉ 会话' }}</span>
          <span class="tab-name">{{ s.template_name || '-' }}</span>
          <span class="tab-status" :class="'st-' + s.status">{{ statusLabel(s) }}</span>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!sessions.length" class="empty-cta">
        <p class="cta-tip">
          消费者填写不清晰，或想协商替代方案？让 AI 助理替您完成多轮沟通。<br />
          <span class="cta-sub">支持 AI 智能外呼 / 在线会话托管，话术自然有人味。</span>
        </p>
      </div>

      <!-- 当前会话面板 -->
      <div v-if="activeSession" class="session-panel">
        <div class="meta-bar">
          <span class="meta-pill">{{ activeSession.channel === 'voice' ? '智能外呼' : '会话托管' }}</span>
          <span class="meta-pill">{{ activeSession.scenario === 'clarify' ? '原因澄清' : '方案协商' }}</span>
          <span v-if="activeSession.template?.name" class="meta-pill">{{ activeSession.template.name }}</span>
          <span class="meta-pill outcome" :class="'st-' + activeSession.status">{{ statusLabel(activeSession) }}</span>
          <span class="meta-pill rounds">已沟通 {{ activeSession.rounds }} 轮</span>
          <span class="head-spacer"></span>
          <button v-if="activeSession.status === 'running' && activeSession.channel !== 'voice'" class="link-btn danger" @click="takeover">人工接管</button>
          <button v-if="activeSession.channel === 'voice' && activeSession.status === 'running'" class="link-btn danger" @click="endVoiceSession">⛔ 结束外呼</button>
          <button v-if="activeSession.channel === 'voice' && activeSession.status !== 'running'" class="link-btn restart" @click="restartCall">🔄 重新发起外呼</button>
        </div>

        <!-- 置顶总结条：切换会话时直接在对话上方给出结论 -->
        <div v-if="activeSession.status !== 'running'" class="pinned-summary" :class="'ps-' + activeSession.outcome">
          <div class="ps-head">
            <span class="ps-icon">{{ outcomeIcon(activeSession.outcome) }}</span>
            <span class="ps-headline">{{ summaryData.headline || statusLabel(activeSession) }}</span>
            <span class="ps-spacer"></span>
            <button class="link-btn" @click="regenSummary" :disabled="summarizing">{{ summarizing ? '生成中...' : '🔄 重新总结' }}</button>
          </div>
          <div v-if="summaryData.summary_text" class="ps-text">{{ summaryData.summary_text }}</div>
          <div v-else-if="summarizing" class="ps-text muted">正在生成总结…</div>
          <div v-if="summaryData.negotiation_steps && summaryData.negotiation_steps.length" class="ps-steps">
            <div class="ps-steps-title">协商过程</div>
            <ol>
              <li v-for="(step, i) in summaryData.negotiation_steps" :key="i">{{ step }}</li>
            </ol>
          </div>
          <div class="ps-foot">
            <span v-if="summaryData.consumer_need" class="ps-tag">诉求：{{ summaryData.consumer_need }}</span>
            <span v-if="summaryData.deal_detail" class="ps-tag deal">方案：{{ summaryData.deal_detail }}</span>
            <span v-if="summaryData.next_action" class="ps-tag action">操作：{{ summaryData.next_action }}</span>
          </div>
        </div>

        <!-- 转人工醒目横幅 -->
        <div v-if="activeSession.outcome === 'handoff'" class="handoff-banner">
          <div class="hb-left">
            <span class="hb-icon">⚠️</span>
            <div>
              <div class="hb-title">AI 已退出，需要您立即接管</div>
              <div class="hb-sub">{{ summaryData.headline || activeSession.outcome_detail || '消费者需要人工跟进' }}</div>
            </div>
          </div>
          <div class="hb-right">
            <button class="hb-btn" @click="onClickTakeoverFollow">立即接手联系</button>
          </div>
        </div>

        <div v-if="activeSession.merchant_remark" class="remark-box">
          <span class="remark-label">本次商家备注（最高优先级）：</span>
          <span class="remark-text">{{ activeSession.merchant_remark }}</span>
        </div>

        <div class="chat-stage" ref="chatStage">
          <div
            v-for="(m, idx) in activeSession.messages"
            :key="m.id"
            class="msg-row"
            :class="{ ai: m.role === 'ai', consumer: m.role === 'consumer' }"
          >
            <div class="avatar">{{ m.role === 'ai' ? '🤖' : '👤' }}</div>
            <div class="bubble-wrap">
              <div class="bubble" v-if="m.content">{{ m.content }}</div>
              <div v-if="msgImages(m).length" class="bubble-imgs">
                <img v-for="(img, i) in msgImages(m)" :key="i" :src="img" class="msg-img" @click="previewImg(img)" />
              </div>
              <div class="meta">
                <span>{{ m.role === 'ai' ? 'AI助理' : '消费者' }}</span>
                <span v-if="m.intent" class="intent">· {{ intentLabel(m.intent) }}</span>
                <span class="time">· {{ formatTime(m.created_at) }}</span>
                <span v-if="m.role === 'ai' && replyDuration(activeSession.messages, idx)" class="dur">· 用时{{ replyDuration(activeSession.messages, idx) }}</span>
              </div>
            </div>
          </div>
          <div v-if="generating" class="msg-row ai">
            <div class="avatar">🤖</div>
            <div class="bubble-wrap">
              <div class="bubble typing"><span></span><span></span><span></span></div>
            </div>
          </div>
        </div>

        <!-- 仅 IM 才显示输入框 -->
        <div v-if="activeSession.status === 'running' && activeSession.channel !== 'voice'" class="reply-input">
          <div class="reply-tip">DEMO 中，您可以模拟消费者输入消息：</div>
          <div class="quick-replies">
            <button v-for="q in quickReplies" :key="q" @click="sendReply(q)">{{ q }}</button>
          </div>
          <div v-if="pendingImages.length" class="pending-imgs">
            <div v-for="(img, i) in pendingImages" :key="i" class="pending-img">
              <img :src="img" />
              <span class="rm" @click="pendingImages.splice(i, 1)">×</span>
            </div>
          </div>
          <div class="reply-row">
            <button class="img-btn" :disabled="generating" @click="triggerUpload" title="模拟消费者发送图片">🖼️</button>
            <input ref="fileInput" type="file" accept="image/*" multiple style="display:none" @change="onPickImages" />
            <input
              v-model="replyText"
              placeholder="输入消费者会回复的内容（模拟）..."
              @keyup.enter="sendReply()"
              class="reply-textbox"
            />
            <button class="send-btn" :disabled="(!replyText.trim() && !pendingImages.length) || generating" @click="sendReply()">发送给AI</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 发起弹窗 -->
    <el-dialog v-model="showStart" title="发起 AI 协商" width="560px" append-to-body>
      <div class="form">
        <div class="form-row">
          <label>沟通渠道</label>
          <el-radio-group v-model="form.channel">
            <el-radio-button value="im">在线会话托管</el-radio-button>
            <el-radio-button value="voice">智能外呼（电话）</el-radio-button>
          </el-radio-group>
        </div>
        <div v-if="form.channel === 'voice'" class="form-row">
          <label>消费者电话</label>
          <el-input v-model="form.phone" placeholder="例：13812345001" maxlength="20">
            <template #prefix>📞</template>
          </el-input>
          <p class="phone-tip">DEMO 模式：AI 使用云端神经语音（真人级音色）+ 浏览器语音识别模拟通话（请允许麦克风权限）。生产可对接电信运营商外呼通道。</p>
        </div>
        <div class="form-row">
          <label>沟通场景</label>
          <el-radio-group v-model="form.scenario">
            <el-radio-button value="clarify">原因澄清</el-radio-button>
            <el-radio-button value="negotiate">方案协商</el-radio-button>
          </el-radio-group>
        </div>
        <div class="form-row">
          <label>选择 agent 模版</label>
          <el-select v-model="form.template_id" placeholder="选择 agent 模版（默认使用对应场景的默认 agent）" style="width: 100%;" clearable>
            <el-option
              v-for="t in templateOptions"
              :key="t.id"
              :label="t.name + (t.is_default ? '（默认）' : '')"
              :value="t.id"
            />
          </el-select>
        </div>
        <div class="form-row">
          <label>本次特别备注（可选，AI 将作为最高优先级遵守）</label>
          <el-input
            v-model="form.merchant_remark"
            type="textarea"
            :rows="3"
            placeholder="例：这单可以最多补20元，不接受换货因为没库存；只能用券不打款；快速结束尽量给券"
          />
        </div>
        <div class="form-tip">
          AI 将以模板配置的人设和方案范围与消费者沟通，遇到强情绪/敏感关键词或主动要求人工时会自动转人工。
        </div>
      </div>
      <template #footer>
        <el-button @click="showStart = false">取消</el-button>
        <el-button type="primary" :loading="starting" @click="start">
          {{ form.channel === 'voice' ? '📞 立即拨打' : '立即发起' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 通话弹窗 -->
    <PhoneCall
      v-model="showPhoneCall"
      v-if="phoneCallProps"
      :service-order-id="phoneCallProps.service_order_id"
      :phone="phoneCallProps.phone"
      :consumer-name="phoneCallProps.consumer_name"
      :agent-name="phoneCallProps.agent_name"
      :template-id="phoneCallProps.template_id"
      :scenario="phoneCallProps.scenario"
      :merchant-remark="phoneCallProps.merchant_remark"
      @ended="onCallEnded"
      @takeover="fetchSessions"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, h, nextTick } from 'vue'
import axios from 'axios'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { useRouter } from 'vue-router'
import PhoneCall from './PhoneCall.vue'

const props = defineProps({
  serviceOrderId: { type: [Number, String], required: true },
  consumerPhone: { type: String, default: '' },
  consumerName: { type: String, default: '' },
  defaultExpanded: { type: Boolean, default: false },
})
const router = useRouter()

const expanded = ref(props.defaultExpanded)
const sessions = ref([])
const activeSession = ref(null)
const templates = ref([])
const showStart = ref(false)
const starting = ref(false)
const generating = ref(false)
const replyText = ref('')
const engineStatus = ref(null)

const showPhoneCall = ref(false)
const phoneCallProps = ref(null)
const summarizing = ref(false)
const summaryCache = ref({})  // key: sessionId, val: summary json
const pendingImages = ref([])  // 待发送的图片（base64 data-uri）
const fileInput = ref(null)
const chatStage = ref(null)

function scrollChatToBottom() {
  nextTick(() => {
    const el = chatStage.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

const summaryData = computed(() => {
  if (!activeSession.value) return {}
  const cached = summaryCache.value[activeSession.value.id]
  if (cached) return cached
  // 尝试解析后端存储的 summary 字段（可能是 JSON 或纯文本）
  const raw = activeSession.value.summary
  if (!raw) return {
    headline: activeSession.value.outcome_detail || statusLabel(activeSession.value),
    consumer_need: '',
    summary_text: '',
    deal_detail: activeSession.value.outcome_detail || '',
    next_action: '',
  }
  try {
    const j = JSON.parse(raw)
    if (j && typeof j === 'object' && j.headline) return j
  } catch {}
  return { headline: raw, consumer_need: '', summary_text: '', deal_detail: activeSession.value.outcome_detail || '', next_action: '' }
})

function outcomeIcon(o) {
  return { deal: '✅', clarified: '📝', handoff: '⚠️', no_deal: '❌' }[o] || '📋'
}

async function regenSummary() {
  if (!activeSession.value) return
  summarizing.value = true
  try {
    const { data } = await axios.post(`/api/ai-sessions/${activeSession.value.id}/summarize`)
    summaryCache.value = { ...summaryCache.value, [activeSession.value.id]: data }
    activeSession.value = { ...activeSession.value, summary: JSON.stringify(data) }
    ElMessage.success('已重新总结')
  } catch (e) {
    ElMessage.error('总结失败')
  } finally {
    summarizing.value = false
  }
}

const form = ref({
  channel: 'im',
  scenario: 'negotiate',
  template_id: null,
  merchant_remark: '',
  phone: props.consumerPhone || '',
})

watch(() => props.consumerPhone, v => { if (v && !form.value.phone) form.value.phone = v })

const templateOptions = computed(() =>
  templates.value.filter(t => t.scenario === form.value.scenario)
)

// 切换沟通场景时，清空已选 agent 模版，避免上个场景的模版残留串台
watch(() => form.value.scenario, () => { form.value.template_id = null })

const hasRunning = computed(() => sessions.value.some(s => s.status === 'running'))

const quickReplies = computed(() => {
  if (form.value.scenario === 'clarify' || activeSession.value?.scenario === 'clarify') {
    return ['屏幕右下角有一个亮点，是收到当天就发现的，已经拍照了', '就是不太好用', '我已经拍了照片可以发给你']
  }
  return ['可以接受', '太少了，能不能再多一点', '我要找人工客服', '不接受，我要投诉']
})

function formatTime(t) { return t ? dayjs(t).format('HH:mm:ss') : '-' }
function toggleExpand() { expanded.value = !expanded.value }

// AI 回复用时：本条 AI 消息与上一条消费者消息的时间差
function replyDuration(msgs, idx) {
  if (!msgs || idx <= 0) return ''
  const cur = msgs[idx], prev = msgs[idx - 1]
  if (!cur?.created_at || !prev?.created_at || prev.role !== 'consumer') return ''
  const diff = dayjs(cur.created_at).diff(dayjs(prev.created_at), 'second')
  if (diff < 0 || diff > 600) return ''
  return diff < 60 ? `${diff}秒` : `${Math.floor(diff / 60)}分${diff % 60}秒`
}

function msgImages(m) {
  if (!m || !m.images) return []
  if (Array.isArray(m.images)) return m.images
  try { const a = JSON.parse(m.images); return Array.isArray(a) ? a : [] } catch { return [] }
}
function previewImg(url) { window.open(url, '_blank') }
function triggerUpload() { fileInput.value && fileInput.value.click() }
function onPickImages(e) {
  const files = Array.from(e.target.files || [])
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue
    if (f.size > 4 * 1024 * 1024) { ElMessage.warning(`图片 ${f.name} 超过4MB，已跳过`); continue }
    const reader = new FileReader()
    reader.onload = () => { pendingImages.value.push(reader.result) }
    reader.readAsDataURL(f)
  }
  e.target.value = ''
}

const intentMap = {
  opening: '开场', empathize: '共情', probe: '追问', propose: '报价', concede: '让步',
  close_deal: '达成', close_no_deal: '未达成', handoff: '转人工', clarify: '澄清说明',
  accept_close: '达成', accept: '接受', reject: '拒绝',
}
function intentLabel(i) { return intentMap[i] || i }

function statusLabel(s) {
  if (!s) return ''
  if (s.status === 'running') return '进行中'
  if (s.outcome === 'deal') return '已达成方案'
  if (s.outcome === 'clarified') return '原因已澄清'
  if (s.outcome === 'handoff') return '已转人工'
  if (s.outcome === 'no_deal') return '未达成'
  return s.status
}

async function fetchTemplates() {
  const { data } = await axios.get('/api/ai-templates')
  templates.value = data
}
async function fetchEngineStatus() {
  try { const { data } = await axios.get('/api/ai-sessions/engine-status'); engineStatus.value = data } catch {}
}
async function fetchSessions() {
  const { data } = await axios.get(`/api/ai-sessions/by-service/${props.serviceOrderId}`)
  sessions.value = data
  if (data.length && !activeSession.value) await loadSession(data[0].id)
  // 有正在进行的会话默认展开
  if (data.some(s => s.status === 'running')) expanded.value = true
}
async function loadSession(id) {
  const { data } = await axios.get(`/api/ai-sessions/${id}`)
  activeSession.value = data
  expanded.value = true
  scrollChatToBottom()
  // 已结束但还没有缓存总结 → 自动生成，置顶总结条立即可见
  if (data.status !== 'running' && !summaryCache.value[id] && !hasStructuredSummary(data)) {
    ensureSummary(id)
  }
}

function hasStructuredSummary(s) {
  if (!s || !s.summary) return false
  try { const j = JSON.parse(s.summary); return !!(j && j.headline) } catch { return false }
}

async function ensureSummary(id) {
  summarizing.value = true
  try {
    const { data } = await axios.post(`/api/ai-sessions/${id}/summarize`)
    summaryCache.value = { ...summaryCache.value, [id]: data }
    if (activeSession.value && activeSession.value.id === id) {
      activeSession.value = { ...activeSession.value, summary: JSON.stringify(data) }
    }
  } catch {} finally {
    summarizing.value = false
  }
}

function onClickStart() {
  expanded.value = true
  showStart.value = true
}

async function start() {
  if (form.value.channel === 'voice' && !form.value.phone) {
    ElMessage.warning('请填写消费者电话')
    return
  }
  // 外呼场景：直接打开通话弹窗（弹窗内自己调用 /start）
  if (form.value.channel === 'voice') {
    const tplId = form.value.template_id
    const tpl = tplId ? templates.value.find(t => t.id === tplId) : templates.value.find(t => t.scenario === form.value.scenario && t.is_default) || templates.value.find(t => t.scenario === form.value.scenario)
    phoneCallProps.value = {
      service_order_id: props.serviceOrderId,
      phone: form.value.phone,
      consumer_name: props.consumerName,
      agent_name: tpl?.agent_name || '小棠',
      template_id: tplId,
      scenario: form.value.scenario,
      merchant_remark: form.value.merchant_remark,
    }
    showStart.value = false
    showPhoneCall.value = true
    return
  }
  // IM
  starting.value = true
  try {
    const payload = {
      service_order_id: props.serviceOrderId,
      channel: form.value.channel,
      scenario: form.value.scenario,
      merchant_remark: form.value.merchant_remark,
    }
    if (form.value.template_id) payload.template_id = form.value.template_id
    const { data } = await axios.post('/api/ai-sessions/start', payload)
    showStart.value = false
    ElMessage.success('AI 协商已发起')
    await fetchSessions()
    await loadSession(data.session_id || data.id)
    // 开场白后台生成中 → 显示"输入中"并轮询，避免点击长时间转圈
    if (data.opening_pending) pollOpening(data.session_id || data.id)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '发起失败')
  } finally {
    starting.value = false
  }
}

// 轮询等待开场白生成（最多约 40s），期间展示"输入中"气泡
async function pollOpening(sessionId) {
  generating.value = true
  try {
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 1000))
      if (!activeSession.value || activeSession.value.id !== sessionId) break
      const { data } = await axios.get(`/api/ai-sessions/${sessionId}`)
      if ((data.messages || []).some(m => m.role === 'ai')) {
        activeSession.value = { ...activeSession.value, ...data, template: activeSession.value.template }
        break
      }
    }
  } catch {} finally {
    generating.value = false
  }
}

async function onCallEnded() {
  await fetchSessions()
  if (phoneCallProps.value && sessions.value.length) {
    const latest = sessions.value.find(s => s.channel === 'voice')
    if (latest) {
      await loadSession(latest.id)
      // 已结束 → 拉精炼总结
      if (activeSession.value.status !== 'running') {
        try {
          const { data: s } = await axios.post(`/api/ai-sessions/${activeSession.value.id}/summarize`)
          summaryCache.value = { ...summaryCache.value, [activeSession.value.id]: s }
          activeSession.value = { ...activeSession.value, summary: JSON.stringify(s) }
          if (activeSession.value.outcome === 'handoff') showHandoffNotification(activeSession.value, s.headline)
        } catch {}
      }
    }
  }
}

function resumeCall() {
  if (!activeSession.value || activeSession.value.channel !== 'voice') return
  ElMessage.info('DEMO 中通话已结束，如需继续请重新发起。')
}

// 已结束的外呼 → 重新发起一通新外呼（沿用原会话的模板/场景/备注）
function restartCall() {
  const s = activeSession.value
  if (!s || s.channel !== 'voice') return
  const tpl = s.template_id ? templates.value.find(t => t.id === s.template_id) : templates.value.find(t => t.scenario === s.scenario && t.is_default) || templates.value.find(t => t.scenario === s.scenario)
  phoneCallProps.value = {
    service_order_id: props.serviceOrderId,
    phone: props.consumerPhone || form.value.phone || '',
    consumer_name: props.consumerName,
    agent_name: tpl?.agent_name || '小棠',
    template_id: s.template_id || tpl?.id || null,
    scenario: s.scenario,
    merchant_remark: s.merchant_remark || '',
  }
  showPhoneCall.value = true
}

function showHandoffNotification(session, summaryHeadline) {
  ElNotification({
    title: '⚠ AI 已转人工，需要您接管',
    message: summaryHeadline || session.outcome_detail || '消费者需要人工跟进',
    type: 'warning',
    duration: 0,
    position: 'top-right',
    customClass: 'handoff-notification',
  })
}

// 手动结束外呼（结束 + 自动总结）
async function endVoiceSession() {
  if (!activeSession.value) return
  const id = activeSession.value.id
  try {
    await axios.post(`/api/ai-sessions/${id}/takeover`)
    showPhoneCall.value = false
    await loadSession(id)
    await ensureSummary(id)
    await fetchSessions()
    ElMessage.success('外呼已结束，已生成总结')
  } catch (e) { ElMessage.error('结束失败') }
}

// 离开服务单时，自动结束仍在进行的外呼，避免再进来还显示"进行中"
async function autoEndRunningVoiceOnLeave() {
  const running = sessions.value.filter(s => s.channel === 'voice' && s.status === 'running')
  for (const s of running) {
    try {
      await axios.post(`/api/ai-sessions/${s.id}/takeover`)
      axios.post(`/api/ai-sessions/${s.id}/summarize`).catch(() => {})
    } catch {}
  }
}

async function sendReply(text) {
  if (generating.value) return  // 防并发：生成中再次点击/回车/快捷回复，直接忽略，避免重复发起
  const content = text || replyText.value
  const images = text ? [] : pendingImages.value.slice()
  if (!content.trim() && !images.length) return
  if (!activeSession.value) return
  generating.value = true
  if (!text) { replyText.value = ''; pendingImages.value = [] }
  // 乐观更新：消费者消息立即上屏，不等模型回复
  const optimistic = { id: 'tmp-' + Date.now(), role: 'consumer', content, images: JSON.stringify(images), created_at: new Date().toISOString() }
  activeSession.value = { ...activeSession.value, messages: [...(activeSession.value.messages || []), optimistic] }
  scrollChatToBottom()
  try {
    const { data } = await axios.post(`/api/ai-sessions/${activeSession.value.id}/reply`, { content, images })
    activeSession.value = { ...activeSession.value, ...data.session, messages: data.messages, template: activeSession.value.template }
    scrollChatToBottom()
    if (data.session.status !== 'running') {
      // 已结束 → 自动拉取精炼总结
      try {
        const { data: s } = await axios.post(`/api/ai-sessions/${activeSession.value.id}/summarize`)
        summaryCache.value = { ...summaryCache.value, [activeSession.value.id]: s }
        activeSession.value = { ...activeSession.value, summary: JSON.stringify(s) }
        if (data.session.outcome === 'handoff') showHandoffNotification(data.session, s.headline)
        else ElMessage.success(`沟通结束：${s.headline || statusLabel(data.session)}`)
      } catch {
        if (data.session.outcome === 'handoff') showHandoffNotification(data.session)
        else ElMessage.success(`沟通结束：${statusLabel(data.session)}`)
      }
      await fetchSessions()
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '生成回复失败')
  } finally {
    generating.value = false
  }
}
async function takeover() {
  try {
    await ElMessageBox.confirm('确认要由您接管这次会话吗？AI 将停止响应。', '提示', { type: 'warning' })
  } catch { return }
  await axios.post(`/api/ai-sessions/${activeSession.value.id}/takeover`)
  ElMessage.success('已接管')
  await loadSession(activeSession.value.id)
  await fetchSessions()
}
function goToTemplates() { router.push(`/merchant/ai-templates?from=${props.serviceOrderId}`) }

function onClickTakeoverFollow() {
  ElMessage.success('已切换到人工跟进模式，请使用下方协商记录区域继续沟通')
  // 滚动到协商记录
  setTimeout(() => {
    document.querySelector('.chat-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 100)
}

watch(() => props.serviceOrderId, async (newId, oldId) => {
  // 切换服务单前，结束旧服务单仍在进行的外呼
  if (oldId) await autoEndRunningVoiceOnLeave()
  activeSession.value = null
  await fetchSessions()
})

// 消息变化 / 生成中 → 自动滚到底，无需手动拖动
watch(() => activeSession.value?.messages?.length, () => scrollChatToBottom())
watch(generating, v => { if (v) scrollChatToBottom() })

onMounted(async () => {
  await Promise.all([fetchTemplates(), fetchSessions(), fetchEngineStatus()])
})

// 离开页面（关闭服务单详情）→ 自动结束进行中的外呼
onBeforeUnmount(() => { autoEndRunningVoiceOnLeave() })

defineExpose({ refresh: fetchSessions, expand: () => { expanded.value = true } })
</script>

<style scoped>
.ai-negotiation { background: #fff; border-radius: 12px; border: 1px solid #e0e7ff; overflow: hidden; box-shadow: 0 2px 8px rgba(99,102,241,0.06); margin-bottom: 14px; }
.ai-negotiation.collapsed { box-shadow: none; }

.control-bar { display: flex; align-items: center; padding: 12px 16px; cursor: pointer; background: linear-gradient(135deg, #fafbff 0%, #f5f3ff 100%); transition: background 0.15s; }
.control-bar:hover { background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); }
.bar-left { display:flex; align-items: center; gap: 8px; flex: 1; min-width: 0; flex-wrap: wrap; }
.ai-icon { font-size: 18px; }
.bar-title { font-size: 14px; font-weight: 600; color: #1e293b; }
.ai-badge { font-size: 10px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 500; }
.engine-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.engine-tag.on { background: #ecfdf5; color: #16a34a; }
.engine-tag.off { background: #fef3c7; color: #b45309; }

.bar-right { display:flex; align-items: center; gap: 10px; }
.session-count { font-size: 11px; color: #64748b; }
.running-tag { font-size: 11px; color: #d97706; background: #fffbeb; padding: 2px 8px; border-radius: 4px; }
.link-btn { background: transparent; border: none; color: #6366f1; cursor: pointer; font-size: 12px; }
.link-btn:hover { text-decoration: underline; }
.link-btn.danger { color: #dc2626; }
.primary-btn { border:none; background: linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
.primary-btn:hover { opacity: 0.9; }
.caret { color: #94a3b8; font-size: 12px; }

.panel-body { padding: 12px 16px 16px; border-top: 1px solid #f1f5f9; }

.empty-cta { padding: 14px 8px; text-align: center; }
.cta-tip { color: #475569; font-size: 13px; line-height: 1.7; margin: 0; }
.cta-sub { color: #94a3b8; font-size: 12px; }

.session-tabs { display:flex; gap:8px; padding-bottom: 12px; flex-wrap: wrap; align-items: center; }
.tab { padding:6px 10px; background:#fff; border: 1px solid #e2e8f0; border-radius: 6px; cursor:pointer; font-size: 12px; display:flex; gap:6px; align-items:center; transition: all 0.15s; }
.tab:hover { border-color: #c7d2fe; }
.tab.active { border-color: #6366f1; background: #eef2ff; }
.tab-channel { color: #64748b; }
.tab-name { color: #1e293b; font-weight: 500; }
.tab-status { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #f1f5f9; color: #64748b; }
.tab-status.st-running { background: #dbeafe; color: #1d4ed8; }
.tab-status.st-achieved { background: #dcfce7; color: #16a34a; }
.tab-status.st-handoff { background: #fef3c7; color: #b45309; }

.session-panel { display: flex; flex-direction: column; }
.chat-stage { background: #f8fafc; border-radius: 8px; padding: 16px; height: 300px; overflow-y: auto; display:flex; flex-direction: column; gap: 14px; }
.meta-bar { display:flex; gap:6px; align-items:center; margin-bottom: 10px; flex-wrap: wrap; }
.head-spacer { flex: 1; }
.meta-pill { font-size: 11px; padding: 2px 8px; background: #f1f5f9; color: #475569; border-radius: 4px; }
.meta-pill.rounds { background: #ecfeff; color: #0891b2; }
.meta-pill.outcome.st-running { background: #dbeafe; color: #1d4ed8; }
.meta-pill.outcome.st-achieved { background: #dcfce7; color: #16a34a; }
.meta-pill.outcome.st-handoff { background: #fef3c7; color: #b45309; }

.remark-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; font-size: 12px; margin-bottom: 12px; }
.remark-label { color: #92400e; font-weight: 600; margin-right: 4px; }
.remark-text { color: #78350f; }

.msg-row { display: flex; gap: 8px; align-items: flex-start; }
.msg-row.consumer { flex-direction: row-reverse; }
.avatar { width: 32px; height: 32px; border-radius: 8px; background: #fff; display:flex; align-items:center; justify-content:center; font-size: 16px; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.msg-row.ai .avatar { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
.bubble-wrap { max-width: 78%; }
.bubble { padding: 11px 15px; border-radius: 12px; font-size: 14px; line-height: 1.65; background: #fff; color: #1e293b; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.03); white-space: pre-wrap; }
.msg-row.consumer .bubble { background: #2563eb; color: #fff; border-color: #2563eb; }
.bubble.typing { display:inline-flex; gap:4px; padding: 14px; }
.bubble.typing span { width:6px; height:6px; border-radius:50%; background:#cbd5e1; animation: bounce 1.4s infinite; }
.bubble.typing span:nth-child(2){animation-delay:0.2s}
.bubble.typing span:nth-child(3){animation-delay:0.4s}
@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-4px)} }
.meta { font-size: 11px; color: #94a3b8; margin-top: 4px; display:flex; gap: 4px; }
.msg-row.consumer .meta { justify-content: flex-end; }
.intent { color: #6366f1; }
.dur { color: #0891b2; }

.outcome-box { margin-top: 14px; padding: 14px 16px; border-radius: 10px; background: linear-gradient(135deg, #f0f9ff 0%, #ecfeff 100%); border: 1px solid #a5f3fc; }
.outcome-box.oc-deal { background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-color: #86efac; }
.outcome-box.oc-handoff, .outcome-box.oc-no_deal { background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-color: #fde68a; }
.outcome-box.oc-clarified { background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%); border-color: #fde047; }

/* 置顶总结条 */
.pinned-summary { margin-bottom: 12px; padding: 12px 14px; border-radius: 10px; background: linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%); border: 1px solid #c7d2fe; box-shadow: 0 2px 8px rgba(99,102,241,0.08); }
.pinned-summary.ps-deal { background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-color: #86efac; }
.pinned-summary.ps-handoff, .pinned-summary.ps-no_deal { background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-color: #fcd34d; }
.pinned-summary.ps-clarified { background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%); border-color: #fde047; }
.ps-head { display: flex; align-items: center; gap: 8px; }
.ps-icon { font-size: 18px; }
.ps-headline { font-size: 14px; font-weight: 700; color: #1e293b; }
.ps-spacer { flex: 1; }
.ps-text { margin-top: 8px; font-size: 13px; line-height: 1.7; color: #334155; }
.ps-text.muted { color: #94a3b8; }
.ps-foot { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.ps-tag { font-size: 11px; background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.06); color: #475569; padding: 3px 8px; border-radius: 6px; }
.ps-tag.action { color: #b45309; font-weight: 600; }
.ps-tag.deal { color: #0f766e; font-weight: 600; }
.ps-steps { margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(0,0,0,0.1); }
.ps-steps-title { font-size: 11px; color: #64748b; font-weight: 600; margin-bottom: 4px; }
.ps-steps ol { margin: 0; padding-left: 18px; }
.ps-steps li { font-size: 12px; line-height: 1.7; color: #334155; }
.link-btn.restart { color: #0891b2; }

/* 消息图片 */
.bubble-imgs { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
.msg-row.consumer .bubble-imgs { justify-content: flex-end; }
.msg-img { width: 90px; height: 90px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; cursor: pointer; transition: transform 0.12s; }
.msg-img:hover { transform: scale(1.04); }

/* 待发送图片预览 */
.pending-imgs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.pending-img { position: relative; }
.pending-img img { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; }
.pending-img .rm { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; line-height: 16px; text-align: center; background: #ef4444; color: #fff; border-radius: 50%; font-size: 13px; cursor: pointer; }
.img-btn { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0 12px; font-size: 16px; cursor: pointer; }
.img-btn:hover { background: #e2e8f0; }
.img-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.oc-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.oc-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: #1e293b; line-height: 1.4; }
.oc-icon { font-size: 18px; }

.oc-grid { display: flex; flex-direction: column; gap: 8px; }
.oc-row { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; }
.oc-label { color: #64748b; min-width: 70px; flex-shrink: 0; font-weight: 500; }
.oc-val { color: #1e293b; line-height: 1.6; }
.oc-val.highlight { font-weight: 600; color: #0f172a; }
.oc-val.next-action { color: #b45309; font-weight: 600; }
.oc-row.next { padding-top: 8px; border-top: 1px dashed rgba(0,0,0,0.08); }

.handoff-banner { background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%); border: 1px solid #fca5a5; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; animation: handoff-pulse 1.8s ease-in-out infinite; }
@keyframes handoff-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); } 50% { box-shadow: 0 0 0 6px rgba(220,38,38,0.12); } }
.hb-left { display: flex; gap: 10px; align-items: center; }
.hb-icon { font-size: 24px; }
.hb-title { font-size: 13px; font-weight: 700; color: #991b1b; }
.hb-sub { font-size: 12px; color: #b91c1c; margin-top: 2px; }
.hb-btn { background: #dc2626; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0; transition: background 0.15s; }
.hb-btn:hover { background: #b91c1c; }

.reply-input { margin-top: 14px; border-top: 1px dashed #e2e8f0; padding-top: 12px; flex-shrink: 0; }
.reply-tip { font-size: 11px; color: #94a3b8; margin-bottom: 8px; }
.quick-replies { display:flex; gap:6px; flex-wrap: wrap; margin-bottom: 8px; }
.quick-replies button { background:#f1f5f9; border:none; padding:5px 10px; border-radius: 12px; font-size: 11px; color: #475569; cursor: pointer; }
.quick-replies button:hover { background: #e2e8f0; }
.reply-row { display:flex; gap:8px; }
.reply-textbox { flex:1; border:1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; font-size: 13px; outline:none; }
.reply-textbox:focus { border-color: #6366f1; }
.send-btn { background: #6366f1; color:#fff; border: none; padding: 0 16px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 500; }
.send-btn:disabled { background: #cbd5e1; cursor: not-allowed; }

.form { display: flex; flex-direction: column; gap: 14px; }
.form-row { display:flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 12px; color: #475569; font-weight: 500; }
.form-tip { font-size: 11px; color: #94a3b8; line-height: 1.6; padding-top: 4px; border-top: 1px dashed #e2e8f0; }
.phone-tip { margin: 4px 0 0; font-size: 11px; color: #94a3b8; line-height: 1.5; }
</style>
