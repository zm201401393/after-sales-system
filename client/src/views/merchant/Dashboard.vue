<template>
  <div class="dashboard-container">
    <!-- Top row: 4 stat cards -->
    <el-row :gutter="16" class="stat-row">
      <el-col :span="6" v-for="item in topStats" :key="item.key">
        <el-card
          class="stat-card"
          :style="{ borderLeft: `4px solid ${item.color}` }"
          shadow="hover"
          @click="goToList(item.filter)"
        >
          <div class="stat-content">
            <div class="stat-number" :style="{ color: item.color }">{{ item.count }}</div>
            <div class="stat-label">{{ item.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Second row: 2 additional stat cards -->
    <el-row :gutter="16" class="stat-row">
      <el-col :span="6" v-for="item in bottomStats" :key="item.key">
        <el-card
          class="stat-card"
          :style="{ borderLeft: `4px solid ${item.color}` }"
          shadow="hover"
          @click="goToList(item.filter)"
        >
          <div class="stat-content">
            <div class="stat-number" :style="{ color: item.color }">{{ item.count }}</div>
            <div class="stat-label">{{ item.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Charts row -->
    <el-row :gutter="20" class="chart-row">
      <el-col :span="14">
        <el-card shadow="hover">
          <template #header>
            <span class="card-title">近7天服务单趋势</span>
          </template>
          <v-chart class="chart" :option="lineChartOption" autoresize />
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="hover">
          <template #header>
            <span class="card-title">状态分布</span>
          </template>
          <v-chart class="chart" :option="pieChartOption" autoresize />
        </el-card>
      </el-col>
    </el-row>

    <!-- Bottom: pending orders table -->
    <el-card shadow="hover" class="pending-card">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="card-title">最近待处理</span>
          <el-button text type="primary" @click="goToList('pending')">查看全部</el-button>
        </div>
      </template>
      <el-table :data="pendingOrders" stripe style="width: 100%" v-loading="loading">
        <el-table-column prop="service_no" label="服务单号" width="180" />
        <el-table-column prop="product_name" label="商品名称" min-width="150" />
        <el-table-column prop="buyer_name" label="买家" width="120" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ typeMap[row.type] || row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="100">
          <template #default="{ row }">
            <el-tag :type="priorityTagType[row.priority]" size="small">
              {{ priorityMap[row.priority] || row.priority }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="申请时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleProcess(row)">
              处理
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
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
const stats = ref({
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  feedback_required: 0,
  completed: 0
})
const pendingOrders = ref([])

const typeMap = {
  return: '退货',
  exchange: '换货',
  repair: '维修',
  refund_only: '仅退款'
}

const priorityMap = {
  urgent: '紧急',
  high: '高',
  normal: '普通',
  low: '低'
}

const priorityTagType = {
  urgent: 'danger',
  high: 'warning',
  normal: '',
  low: 'info'
}

const topStats = computed(() => [
  { key: 'total', label: '全部', count: stats.value.total, color: '#409EFF', filter: '' },
  { key: 'pending', label: '待审核', count: stats.value.pending, color: '#E6A23C', filter: 'pending' },
  { key: 'approved', label: '已通过', count: stats.value.approved, color: '#67C23A', filter: 'approved' },
  { key: 'rejected', label: '已拒绝', count: stats.value.rejected, color: '#F56C6C', filter: 'rejected' }
])

const bottomStats = computed(() => [
  { key: 'feedback_required', label: '待反馈', count: stats.value.feedback_required, color: '#909399', filter: 'feedback_required' },
  { key: 'completed', label: '已完成', count: stats.value.completed, color: '#00d1b2', filter: 'completed' }
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
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: days, boundaryGap: false },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: '服务单数量',
        type: 'line',
        data: counts,
        smooth: true,
        areaStyle: { opacity: 0.15 },
        itemStyle: { color: '#409EFF' }
      }
    ]
  }
})

const pieChartOption = computed(() => {
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: '0%', left: 'center' },
    series: [
      {
        name: '状态分布',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
        data: [
          { value: stats.value.pending, name: '待审核', itemStyle: { color: '#E6A23C' } },
          { value: stats.value.approved, name: '已通过', itemStyle: { color: '#67C23A' } },
          { value: stats.value.rejected, name: '已拒绝', itemStyle: { color: '#F56C6C' } },
          { value: stats.value.feedback_required, name: '待反馈', itemStyle: { color: '#909399' } },
          { value: stats.value.completed, name: '已完成', itemStyle: { color: '#00d1b2' } }
        ]
      }
    ]
  }
})

function formatTime(time) {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
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
  } catch (e) {
    console.error('Failed to fetch stats:', e)
  }

  try {
    const res = await store.fetchList({ status: 'pending', pageSize: 5 })
    if (res && res.list) {
      pendingOrders.value = res.list
    } else {
      pendingOrders.value = store.list
    }
  } catch (e) {
    console.error('Failed to fetch pending orders:', e)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.dashboard-container {
  padding: 20px;
}

.stat-row {
  margin-bottom: 16px;
}

.stat-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.stat-content {
  text-align: center;
  padding: 10px 0;
}

.stat-number {
  font-size: 36px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 8px;
}

.chart-row {
  margin-bottom: 16px;
}

.chart {
  height: 320px;
  width: 100%;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}

.pending-card {
  margin-bottom: 16px;
}
</style>
