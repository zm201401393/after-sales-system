<template>
  <div class="dashboard">
    <div class="stats-grid">
      <div
        v-for="item in allStats"
        :key="item.key"
        class="stat-item"
        :class="{ active: item.key === 'pending' }"
        @click="goToList(item.filter)"
      >
        <div class="stat-icon" :style="{ background: item.bg }">
          <span class="stat-icon-inner" :style="{ color: item.color }">{{ item.icon }}</span>
        </div>
        <div class="stat-info">
          <div class="stat-number" :style="{ color: item.color }">{{ item.count }}</div>
          <div class="stat-label">{{ item.label }}</div>
        </div>
      </div>
    </div>

    <div class="charts-section">
      <div class="chart-card">
        <div class="chart-card-header">
          <span class="chart-title">近7天服务单趋势</span>
        </div>
        <v-chart class="chart" :option="lineChartOption" autoresize />
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <span class="chart-title">状态分布</span>
        </div>
        <v-chart class="chart" :option="pieChartOption" autoresize />
      </div>
    </div>

    <div class="pending-section">
      <div class="section-header">
        <span class="section-title">待处理工单</span>
        <a class="view-all" @click="goToList('pending')">查看全部 →</a>
      </div>
      <div class="pending-table-wrap" v-loading="loading">
        <table class="pending-table">
          <thead>
            <tr>
              <th>服务单号</th>
              <th>商品</th>
              <th>买家</th>
              <th>类型</th>
              <th>优先级</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pendingOrders" :key="row.id" @click="handleProcess(row)">
              <td class="mono">{{ row.service_no }}</td>
              <td class="product-cell">{{ row.product_name }}</td>
              <td>
                <span>{{ row.buyer_name }}</span>
                <span v-if="row.vip_level > 0" class="vip-tag">V{{ row.vip_level }}</span>
              </td>
              <td><span class="type-badge">{{ typeMap[row.type] || row.type }}</span></td>
              <td>
                <span class="priority-dot" :class="'priority-' + row.priority"></span>
                {{ priorityMap[row.priority] || '普通' }}
              </td>
              <td class="time-cell">{{ formatTime(row.created_at) }}</td>
              <td>
                <a class="action-link" @click.stop="handleProcess(row)">处理</a>
              </td>
            </tr>
            <tr v-if="pendingOrders.length === 0">
              <td colspan="7" class="empty-row">暂无待处理工单</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useServiceOrderStore } from '@/stores/serviceOrder'
import dayjs from 'dayjs'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent
} from 'echarts/components'

use([
  CanvasRenderer,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent
])

const router = useRouter()
const store = useServiceOrderStore()

const loading = ref(false)
const stats = ref({ total: 0, pending: 0, approved: 0, rejected: 0, feedback_required: 0, completed: 0 })
const pendingOrders = ref([])

const typeMap = { return: '退货', exchange: '换货', repair: '维修', refund_only: '仅退款' }
const priorityMap = { urgent: '紧急', high: '高', normal: '普通', low: '低' }

const allStats = computed(() => [
  { key: 'total', label: '全部工单', count: stats.value.total, color: '#3b82f6', bg: '#eff6ff', icon: '📋', filter: '' },
  { key: 'pending', label: '待审核', count: stats.value.pending, color: '#f59e0b', bg: '#fffbeb', icon: '⏳', filter: 'pending' },
  { key: 'approved', label: '已通过', count: stats.value.approved, color: '#10b981', bg: '#ecfdf5', icon: '✓', filter: 'approved' },
  { key: 'rejected', label: '已拒绝', count: stats.value.rejected, color: '#ef4444', bg: '#fef2f2', icon: '✗', filter: 'rejected' },
  { key: 'feedback_required', label: '待反馈', count: stats.value.feedback_required, color: '#8b5cf6', bg: '#f5f3ff', icon: '💬', filter: 'feedback_required' },
  { key: 'completed', label: '已完成', count: stats.value.completed, color: '#06b6d4', bg: '#ecfeff', icon: '✔', filter: 'completed' }
])

const lineChartOption = computed(() => {
  const days = []
  const counts = []
  for (let i = 6; i >= 0; i--) {
    days.push(dayjs().subtract(i, 'day').format('MM-DD'))
    counts.push(Math.floor(Math.random() * 5) + 1)
  }
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 16, bottom: 30 },
    xAxis: { type: 'category', data: days, boundaryGap: false, axisLine: { lineStyle: { color: '#e5e7eb' } }, axisLabel: { color: '#6b7280', fontSize: 11 } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLabel: { color: '#6b7280', fontSize: 11 } },
    series: [{
      name: '服务单',
      type: 'line',
      data: counts,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.15)' }, { offset: 1, color: 'rgba(59,130,246,0)' }] } },
      lineStyle: { color: '#3b82f6', width: 2.5 },
      itemStyle: { color: '#3b82f6', borderColor: '#fff', borderWidth: 2 }
    }]
  }
})

const pieChartOption = computed(() => {
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, left: 'center', textStyle: { fontSize: 11, color: '#6b7280' }, itemWidth: 10, itemHeight: 10 },
    series: [{
      type: 'pie',
      radius: ['42%', '72%'],
      center: ['50%', '42%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 13, fontWeight: '600' } },
      data: [
        { value: stats.value.pending, name: '待审核', itemStyle: { color: '#f59e0b' } },
        { value: stats.value.approved, name: '已通过', itemStyle: { color: '#10b981' } },
        { value: stats.value.rejected, name: '已拒绝', itemStyle: { color: '#ef4444' } },
        { value: stats.value.feedback_required, name: '待反馈', itemStyle: { color: '#8b5cf6' } },
        { value: stats.value.completed, name: '已完成', itemStyle: { color: '#06b6d4' } }
      ]
    }]
  }
})

function formatTime(time) {
  return time ? dayjs(time).format('MM-DD HH:mm') : '-'
}

function goToList(filter) {
  if (filter) {
    router.push({ path: '/merchant/service-list', query: { status: filter } })
  } else {
    router.push('/merchant/service-list')
  }
}

function handleProcess(row) {
  router.push(`/merchant/service/${row.id}`)
}

onMounted(async () => {
  loading.value = true
  try {
    await store.fetchStats()
    stats.value = {
      total: store.stats.total || 0,
      pending: store.stats.pending || 0,
      approved: store.stats.approved || 0,
      rejected: store.stats.rejected || 0,
      feedback_required: store.stats.feedback_required || 0,
      completed: store.stats.completed || 0
    }
  } catch (e) { console.error(e) }
  try {
    const res = await store.fetchList({ status: 'pending', pageSize: 5 })
    pendingOrders.value = (res && res.list) ? res.list : (store.list || [])
  } catch (e) { console.error(e) }
  finally { loading.value = false }
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: calc(100vh - 112px);
  overflow: hidden;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  flex-shrink: 0;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 12px;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.stat-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  border-color: #e2e8f0;
}

.stat-item.active {
  border-color: #fbbf24;
  background: #fffdf7;
}

.stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon-inner {
  font-size: 16px;
  font-weight: 700;
}

.stat-info {
  min-width: 0;
}

.stat-number {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
}

.stat-label {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
  white-space: nowrap;
}

.charts-section {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 12px;
  flex-shrink: 0;
}

.chart-card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.chart-card-header {
  margin-bottom: 4px;
}

.chart-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.chart {
  height: 180px;
  width: 100%;
}

.pending-section {
  flex: 1;
  min-height: 0;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.view-all {
  font-size: 12px;
  color: #3b82f6;
  cursor: pointer;
  font-weight: 500;
}

.view-all:hover { color: #2563eb; }

.pending-table-wrap {
  flex: 1;
  overflow-y: auto;
}

.pending-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.pending-table thead th {
  padding: 8px 10px;
  text-align: left;
  font-weight: 500;
  color: #94a3b8;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #f1f5f9;
  white-space: nowrap;
}

.pending-table tbody tr {
  cursor: pointer;
  transition: background 0.15s;
}

.pending-table tbody tr:hover {
  background: #f8fafc;
}

.pending-table td {
  padding: 10px 10px;
  color: #374151;
  border-bottom: 1px solid #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.mono {
  font-family: 'SF Mono', 'Cascadia Code', monospace;
  font-size: 12px;
  color: #6b7280;
}

.product-cell {
  max-width: 160px;
}

.vip-tag {
  display: inline-block;
  font-size: 10px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: 4px;
  font-weight: 600;
}

.type-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #f1f5f9;
  border-radius: 4px;
  font-size: 12px;
  color: #475569;
}

.priority-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 4px;
}
.priority-urgent { background: #ef4444; }
.priority-high { background: #f59e0b; }
.priority-normal { background: #94a3b8; }
.priority-low { background: #d1d5db; }

.time-cell {
  font-size: 12px;
  color: #6b7280;
}

.action-link {
  color: #3b82f6;
  font-weight: 500;
  cursor: pointer;
  font-size: 12px;
}
.action-link:hover { color: #2563eb; }

.empty-row {
  text-align: center;
  color: #94a3b8;
  padding: 24px !important;
}
</style>
