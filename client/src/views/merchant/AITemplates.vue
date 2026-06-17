<template>
  <div class="ai-templates">
    <div class="page-head">
      <div>
        <div class="title-row">
          <button v-if="fromServiceOrder" class="back-btn" @click="backToServiceOrder">← 返回服务单</button>
          <h2>协商 agent 管理</h2>
        </div>
        <p class="page-sub">配置 AI 协商 agent 的人设、可用方案、让步阶梯等。商家发起 AI 协商时可以选择不同 agent。</p>
      </div>
      <button class="primary-btn" @click="openCreate">+ 新建 agent</button>
    </div>

    <div class="grid">
      <div v-for="t in templates" :key="t.id" class="tpl-card">
        <div class="tpl-head">
          <div>
            <span class="scenario-tag" :class="'sc-' + t.scenario">{{ t.scenario === 'clarify' ? '原因澄清' : '方案协商' }}</span>
            <span v-if="t.is_default" class="default-badge">默认</span>
          </div>
          <div class="actions">
            <button class="link-btn" @click="openEdit(t)">编辑</button>
            <button class="link-btn danger" @click="del(t)">删除</button>
          </div>
        </div>
        <h3 class="tpl-name">{{ t.name }}</h3>
        <p class="tpl-desc">{{ t.description || '—' }}</p>
        <div class="tpl-meta">
          <span class="meta-pill">人设：{{ t.agent_name }} · {{ styleLabel(t.agent_style) }}</span>
          <span class="meta-pill">最大轮次：{{ t.max_rounds }}</span>
        </div>
        <div class="tpl-allow">
          <span :class="['allow-chip', t.allow_refund ? 'on' : 'off']">打款 ¥{{ t.refund_ceiling }} 上限</span>
          <span :class="['allow-chip', t.allow_coupon ? 'on' : 'off']">优惠券</span>
          <span :class="['allow-chip', t.allow_reship ? 'on' : 'off']">补发</span>
          <span :class="['allow-chip', t.allow_exchange ? 'on' : 'off']">换货</span>
        </div>
      </div>
    </div>

    <!-- AI 协商数据效果 -->
    <div class="analytics" v-if="stats">
      <div class="ana-head">
        <h3>📊 AI 协商数据效果</h3>
        <span class="ana-sub">基于已发起的 {{ stats.total_sessions }} 次 AI 协商</span>
      </div>

      <div class="ana-cards">
        <div class="ana-card">
          <div class="ac-num">{{ stats.used_service_orders }}</div>
          <div class="ac-label">使用 AI 协商的服务单</div>
        </div>
        <div class="ana-card">
          <div class="ac-num">{{ stats.total_sessions }}</div>
          <div class="ac-label">AI 协商总次数</div>
        </div>
        <div class="ana-card success">
          <div class="ac-num">{{ stats.success_rate }}%</div>
          <div class="ac-label">协商成功率（{{ stats.success_count }}/{{ stats.ended }}）</div>
        </div>
        <div class="ana-card warn">
          <div class="ac-num">{{ stats.fail_count }}</div>
          <div class="ac-label">未达成 / 转人工</div>
        </div>
      </div>

      <div class="ana-grid">
        <!-- 渠道占比 -->
        <div class="ana-block">
          <div class="ab-title">沟通渠道占比</div>
          <div class="bar-row" v-for="c in channelBars" :key="c.key">
            <span class="bar-label">{{ c.label }}</span>
            <div class="bar-track"><div class="bar-fill" :class="c.key" :style="{ width: c.pct + '%' }"></div></div>
            <span class="bar-val">{{ c.count }}（{{ c.pct }}%）</span>
          </div>
        </div>

        <!-- 成功明细（分场景） -->
        <div class="ana-block">
          <div class="ab-title">协商成功明细</div>
          <div class="succ-detail">
            <div class="sd-item">
              <span class="sd-icon">🤝</span>
              <div>
                <div class="sd-num">{{ stats.success_by_scenario.negotiate }}</div>
                <div class="sd-label">方案协商成功<br/><i>消费者同意了方案</i></div>
              </div>
            </div>
            <div class="sd-item">
              <span class="sd-icon">📝</span>
              <div>
                <div class="sd-num">{{ stats.success_by_scenario.clarify }}</div>
                <div class="sd-label">原因澄清成功<br/><i>完整获取了用户信息</i></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 失败原因下钻 -->
        <div class="ana-block wide">
          <div class="ab-title">未达成原因下钻分析</div>
          <div v-if="stats.fail_analysis.length" class="fail-list">
            <div class="fail-row" v-for="(f, i) in stats.fail_analysis" :key="i">
              <span class="fail-cause">{{ f.cause }}</span>
              <div class="bar-track"><div class="bar-fill fail" :style="{ width: failPct(f.count) + '%' }"></div></div>
              <span class="bar-val">{{ f.count }} 单</span>
            </div>
          </div>
          <div v-else class="fail-empty">暂无失败记录 🎉</div>
          <p class="fail-tip">💡 提示：「方案未达成」多为话术或额度配置问题，可在对应 agent 中调整让步阶梯/上限；「转人工」多为诉求超出 AI 权限。</p>
        </div>
      </div>
    </div>

    <el-dialog v-model="showForm" :title="form.id ? '编辑模板' : '新建模板'" width="640px">
      <div class="tpl-form">
        <div class="row two">
          <div class="field">
            <label>模板名称</label>
            <el-input v-model="form.name" placeholder="例：标准退款协商" />
          </div>
          <div class="field">
            <label>场景</label>
            <el-select v-model="form.scenario" style="width: 100%;">
              <el-option label="原因澄清" value="clarify" />
              <el-option label="方案协商" value="negotiate" />
            </el-select>
          </div>
        </div>

        <div class="row two">
          <div class="field">
            <label>AI 助理名字</label>
            <el-input v-model="form.agent_name" placeholder="小棠" />
          </div>
          <div class="field">
            <label>语气风格</label>
            <el-select v-model="form.agent_style" style="width: 100%;">
              <el-option label="温暖亲切" value="warm" />
              <el-option label="专业稳重" value="professional" />
              <el-option label="轻松随和" value="chill" />
            </el-select>
          </div>
        </div>

        <div class="field">
          <label>开场白模板（{product} {consumer} {order_no} 可作为变量）</label>
          <el-input v-model="form.opening_line" type="textarea" :rows="2" />
        </div>

        <div class="row two">
          <div class="field">
            <label>最大沟通轮次</label>
            <el-input-number v-model="form.max_rounds" :min="2" :max="20" style="width: 100%;" />
          </div>
          <div class="field">
            <label>设为该场景默认模板</label>
            <el-switch v-model="form.is_default" :active-value="1" :inactive-value="0" />
          </div>
        </div>

        <div class="section-title" v-if="form.scenario === 'negotiate'">可用方案与让步</div>
        <template v-if="form.scenario === 'negotiate'">
          <div class="row two">
            <div class="field">
              <label>允许小额打款</label>
              <el-switch v-model="form.allow_refund" :active-value="1" :inactive-value="0" />
            </div>
            <div class="field">
              <label>打款金额上限（元）</label>
              <el-input-number v-model="form.refund_ceiling" :min="0" :max="9999" :step="5" style="width: 100%;" :disabled="!form.allow_refund" />
            </div>
          </div>
          <div class="field">
            <label>打款占订单金额比例上限（取上限和比例的较小值）</label>
            <el-slider v-model="form.refund_ratio" :min="0" :max="0.5" :step="0.01" :format-tooltip="v => Math.round(v*100)+'%'" :disabled="!form.allow_refund" />
          </div>

          <div class="row two">
            <div class="field">
              <label>允许发优惠券</label>
              <el-switch v-model="form.allow_coupon" :active-value="1" :inactive-value="0" />
            </div>
            <div class="field">
              <label>可用券面额（逗号分隔，元）</label>
              <el-input v-model="form.coupon_options_str" placeholder="10,15,20" :disabled="!form.allow_coupon" />
            </div>
          </div>

          <div class="row two">
            <div class="field">
              <label>允许补发商品</label>
              <el-switch v-model="form.allow_reship" :active-value="1" :inactive-value="0" />
            </div>
            <div class="field">
              <label>允许换货</label>
              <el-switch v-model="form.allow_exchange" :active-value="1" :inactive-value="0" />
            </div>
          </div>
        </template>

        <div class="section-title">沟通边界</div>
        <div class="field">
          <label>转人工关键词（逗号分隔）</label>
          <el-input v-model="form.handoff_keywords_str" placeholder="投诉,315,律师,曝光,媒体" />
          <p class="tip">消费者消息中出现以上任意关键词，AI 立即转人工不再尝试协商。</p>
        </div>

        <div class="field">
          <label>模板说明</label>
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="给商家看的简介" />
        </div>
      </div>
      <template #footer>
        <el-button @click="showForm = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const route = useRoute()
const templates = ref([])
const stats = ref(null)
const showForm = ref(false)
const saving = ref(false)
const form = ref(emptyForm())

// 是否从某个服务单跳转而来（带 from 查询参数）
const fromServiceOrder = computed(() => !!route.query.from)
function backToServiceOrder() {
  router.push(`/merchant/service/${route.query.from}`)
}

const channelBars = computed(() => {
  if (!stats.value) return []
  const total = stats.value.total_sessions || 1
  return [
    { key: 'voice', label: '☎ 智能外呼', count: stats.value.by_channel.voice, pct: Math.round(stats.value.by_channel.voice / total * 100) },
    { key: 'im', label: '◉ 在线会话', count: stats.value.by_channel.im, pct: Math.round(stats.value.by_channel.im / total * 100) },
  ]
})
function failPct(count) {
  if (!stats.value || !stats.value.fail_count) return 0
  return Math.round(count / stats.value.fail_count * 100)
}

async function fetchStats() {
  try { const { data } = await axios.get('/api/ai-sessions/stats'); stats.value = data } catch {}
}

function emptyForm() {
  return {
    id: null,
    name: '',
    scenario: 'negotiate',
    agent_name: '小棠',
    agent_style: 'warm',
    opening_line: '您好呀，我是XX店铺的售后助理小棠～',
    max_rounds: 6,
    is_default: 0,
    allow_refund: 1, refund_ceiling: 30, refund_ratio: 0.2,
    allow_coupon: 1, coupon_options_str: '10,15,20',
    allow_reship: 0, allow_exchange: 0,
    handoff_keywords_str: '投诉,315,律师,曝光,媒体,起诉',
    description: '',
  }
}

const styleLabel = (s) => ({ warm: '温暖亲切', professional: '专业稳重', chill: '轻松随和' })[s] || s

async function fetchTemplates() {
  const { data } = await axios.get('/api/ai-templates')
  templates.value = data
}

function openCreate() {
  form.value = emptyForm()
  showForm.value = true
}

function openEdit(t) {
  form.value = {
    ...t,
    coupon_options_str: (() => { try { return JSON.parse(t.coupon_options || '[]').join(','); } catch { return t.coupon_options || ''; } })(),
    handoff_keywords_str: (() => { try { return JSON.parse(t.handoff_keywords || '[]').join(','); } catch { return t.handoff_keywords || ''; } })(),
  }
  showForm.value = true
}

async function save() {
  if (!form.value.name) { ElMessage.warning('请填写模板名称'); return }
  saving.value = true
  try {
    const payload = {
      ...form.value,
      coupon_options: JSON.stringify((form.value.coupon_options_str || '').split(',').map(s => Number(s.trim())).filter(n => n > 0)),
      handoff_keywords: JSON.stringify((form.value.handoff_keywords_str || '').split(',').map(s => s.trim()).filter(Boolean)),
    }
    delete payload.coupon_options_str
    delete payload.handoff_keywords_str
    if (form.value.id) {
      await axios.put(`/api/ai-templates/${form.value.id}`, payload)
      ElMessage.success('已更新')
    } else {
      await axios.post('/api/ai-templates', payload)
      ElMessage.success('已创建')
    }
    showForm.value = false
    await fetchTemplates()
  } catch (e) { ElMessage.error(e.response?.data?.error || '保存失败') }
  finally { saving.value = false }
}

async function del(t) {
  try { await ElMessageBox.confirm(`确认删除模板"${t.name}"？`, '提示', { type: 'warning' }) } catch { return }
  await axios.delete(`/api/ai-templates/${t.id}`)
  ElMessage.success('已删除')
  await fetchTemplates()
}

onMounted(() => { fetchTemplates(); fetchStats() })
</script>

<style scoped>
.ai-templates { max-width: 1200px; margin: 0 auto; }
.page-head { display:flex; justify-content: space-between; align-items: flex-end; margin-bottom: 18px; }
.page-head h2 { margin: 0 0 4px; font-size: 18px; color: #1e293b; }
.page-sub { margin: 0; color: #64748b; font-size: 12px; }
.title-row { display: flex; align-items: center; gap: 12px; }
.back-btn { background: #fff; border: 1px solid #c7d2fe; color: #4f46e5; padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 500; }
.back-btn:hover { background: #eef2ff; }
.primary-btn { border:none; background: linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff; padding: 8px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
.primary-btn:hover { opacity: 0.9; }

/* 数据分析 */
.analytics { margin-top: 24px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; }
.ana-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 16px; }
.ana-head h3 { margin: 0; font-size: 16px; color: #1e293b; }
.ana-sub { font-size: 12px; color: #94a3b8; }
.ana-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
.ana-card { background: linear-gradient(135deg, #f8fafc, #f1f5f9); border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
.ana-card.success { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-color: #86efac; }
.ana-card.warn { background: linear-gradient(135deg, #fffbeb, #fef3c7); border-color: #fcd34d; }
.ac-num { font-size: 26px; font-weight: 700; color: #1e293b; }
.ac-label { font-size: 12px; color: #64748b; margin-top: 4px; }
.ana-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.ana-block { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 10px; padding: 14px 16px; }
.ana-block.wide { grid-column: 1 / -1; }
.ab-title { font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 12px; }
.bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 12px; }
.bar-label { width: 84px; flex-shrink: 0; color: #475569; }
.bar-track { flex: 1; height: 16px; background: #e2e8f0; border-radius: 8px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 8px; transition: width 0.4s; }
.bar-fill.voice { background: linear-gradient(90deg, #6366f1, #8b5cf6); }
.bar-fill.im { background: linear-gradient(90deg, #06b6d4, #0891b2); }
.bar-fill.fail { background: linear-gradient(90deg, #f59e0b, #ef4444); }
.bar-val { width: 78px; flex-shrink: 0; text-align: right; color: #64748b; }
.succ-detail { display: flex; gap: 20px; }
.sd-item { display: flex; gap: 10px; align-items: center; }
.sd-icon { font-size: 26px; }
.sd-num { font-size: 22px; font-weight: 700; color: #16a34a; }
.sd-label { font-size: 11px; color: #64748b; line-height: 1.4; }
.sd-label i { color: #94a3b8; font-style: normal; }
.fail-list { display: flex; flex-direction: column; gap: 10px; }
.fail-row { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.fail-cause { width: 220px; flex-shrink: 0; color: #475569; }
.fail-empty { color: #16a34a; font-size: 13px; padding: 8px 0; }
.fail-tip { margin: 12px 0 0; font-size: 11px; color: #94a3b8; line-height: 1.6; background: #fffbeb; border-radius: 6px; padding: 8px 10px; }

.grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.tpl-card { background:#fff; border:1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; transition: all 0.15s; }
.tpl-card:hover { border-color: #c7d2fe; box-shadow: 0 4px 14px rgba(99,102,241,0.08); }
.tpl-head { display:flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.scenario-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
.scenario-tag.sc-clarify { background: #fef3c7; color: #92400e; }
.scenario-tag.sc-negotiate { background: #dbeafe; color: #1d4ed8; }
.default-badge { margin-left: 6px; font-size: 10px; background: #ecfdf5; color: #16a34a; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
.actions { display: flex; gap: 8px; }
.link-btn { background: none; border: none; cursor: pointer; color: #6366f1; font-size: 12px; }
.link-btn.danger { color: #dc2626; }
.tpl-name { margin: 4px 0 4px; font-size: 15px; color: #1e293b; }
.tpl-desc { margin: 0 0 10px; font-size: 12px; color: #64748b; line-height: 1.6; min-height: 36px; }
.tpl-meta { display:flex; gap:6px; flex-wrap: wrap; margin-bottom: 8px; }
.meta-pill { font-size: 11px; padding: 2px 8px; background: #f1f5f9; color: #475569; border-radius: 4px; }
.tpl-allow { display:flex; gap:6px; flex-wrap: wrap; }
.allow-chip { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.allow-chip.on { background: #ecfdf5; color: #16a34a; }
.allow-chip.off { background: #fef2f2; color: #dc2626; text-decoration: line-through; }

.tpl-form { display: flex; flex-direction: column; gap: 14px; }
.row.two { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display:flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12px; color: #475569; font-weight: 500; }
.section-title { font-size: 13px; font-weight: 600; color: #1e293b; padding-top: 10px; border-top: 1px dashed #e2e8f0; }
.tip { margin: 4px 0 0; font-size: 11px; color: #94a3b8; }
</style>
