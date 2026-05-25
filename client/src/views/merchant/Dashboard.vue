<template>
  <div class="dashboard">
    <h2 class="page-title">工作台</h2>

    <el-row :gutter="16" class="stat-cards">
      <el-col :span="4" v-for="item in statCards" :key="item.key">
        <el-card shadow="hover" class="stat-card" :class="item.key" @click="goToList(item.key)">
          <div class="stat-value">{{ stats[item.key] }}</div>
          <div class="stat-label">{{ item.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top: 24px;">
      <el-col :span="16">
        <el-card>
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>最近待处理</span>
              <el-button text type="primary" @click="$router.push('/merchant/service-list')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recentPending" style="width: 100%" v-loading="store.loading">
            <el-table-column prop="service_no" label="服务单号" width="180" />
            <el-table-column prop="product_name" label="商品" />
            <el-table-column prop="type" label="类型" width="80">
              <template #default="{ row }">{{ typeMap[row.type] }}</template>
            </el-table-column>
            <el-table-column prop="buyer_name" label="买家" width="80" />
            <el-table-column prop="created_at" label="申请时间" width="170" />
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button text type="primary" @click="$router.push(`/merchant/service/${row.id}`)">处理</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card>
          <template #header><span>快捷操作</span></template>
          <div class="quick-actions">
            <el-button type="primary" plain @click="$router.push('/merchant/service-list')">服务单管理</el-button>
            <el-button type="success" plain @click="$router.push('/consumer/apply')">模拟消费者申请</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useServiceOrderStore } from '../../stores/serviceOrder'

const router = useRouter()
const store = useServiceOrderStore()
const stats = ref({ pending: 0, approved: 0, rejected: 0, feedback_required: 0, completed: 0, total: 0 })
const recentPending = ref([])
const typeMap = { return: '退货', exchange: '换货', repair: '维修' }

const statCards = [
  { key: 'total', label: '全部' },
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'feedback_required', label: '待反馈' },
  { key: 'completed', label: '已完成' }
]

function goToList(status) {
  if (status === 'total') {
    router.push('/merchant/service-list')
  } else {
    router.push({ path: '/merchant/service-list', query: { status } })
  }
}

onMounted(async () => {
  await store.fetchStats()
  stats.value = store.stats
  await store.fetchList({ status: 'pending', page: 1, pageSize: 5 })
  recentPending.value = store.list
})
</script>

<style scoped>
.page-title { margin: 0 0 20px; font-size: 20px; color: #303133; }

.stat-cards .stat-card { cursor: pointer; text-align: center; transition: all 0.3s; }
.stat-cards .stat-card:hover { transform: translateY(-2px); }
.stat-value { font-size: 32px; font-weight: 700; line-height: 1.2; }
.stat-label { font-size: 14px; color: #909399; margin-top: 4px; }

.stat-card.total .stat-value { color: #409eff; }
.stat-card.pending .stat-value { color: #e6a23c; }
.stat-card.approved .stat-value { color: #67c23a; }
.stat-card.rejected .stat-value { color: #f56c6c; }
.stat-card.feedback_required .stat-value { color: #909399; }
.stat-card.completed .stat-value { color: #303133; }

.quick-actions { display: flex; flex-direction: column; gap: 12px; }
.quick-actions .el-button { width: 100%; }
</style>
