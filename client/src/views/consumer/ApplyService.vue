<template>
  <div class="apply-page">
    <el-card>
      <template #header>
        <h2 class="form-title">申请售后服务</h2>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="110px"
        style="max-width: 700px; margin: 0 auto;"
      >
        <el-form-item label="选择订单" prop="order_id">
          <el-select
            v-model="form.order_id"
            placeholder="请选择需要售后的订单"
            filterable
            style="width: 100%;"
            @change="handleOrderChange"
          >
            <el-option
              v-for="order in orders"
              :key="order.id"
              :value="order.id"
              :label="`${order.order_no} - ${order.product_name}`"
            >
              <div class="order-option">
                <img
                  :src="order.product_image || 'https://via.placeholder.com/32'"
                  class="order-option-img"
                />
                <div class="order-option-info">
                  <div class="order-option-name">{{ order.product_name }}</div>
                  <div class="order-option-meta">{{ order.order_no }} | ¥{{ order.price }}</div>
                </div>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="服务类型" prop="type">
          <el-radio-group v-model="form.type" @change="handleTypeChange">
            <el-radio-button value="return">退货</el-radio-button>
            <el-radio-button value="exchange">换货</el-radio-button>
            <el-radio-button value="repair">维修</el-radio-button>
            <el-radio-button value="refund_only">仅退款</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="申请原因" prop="reason">
          <el-select
            v-model="form.reason"
            placeholder="请选择原因"
            allow-create
            filterable
            style="width: 100%;"
          >
            <el-option v-for="r in reasonOptions" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>

        <el-form-item
          label="退款金额"
          prop="refund_amount"
          v-if="form.type === 'return' || form.type === 'refund_only'"
        >
          <el-input-number
            v-model="form.refund_amount"
            :min="0"
            :max="selectedOrderPrice"
            :precision="2"
            :step="0.01"
            style="width: 100%;"
            placeholder="请输入退款金额"
          />
        </el-form-item>

        <el-form-item label="优先级" prop="priority">
          <el-radio-group v-model="form.priority">
            <el-radio-button value="normal">普通</el-radio-button>
            <el-radio-button value="high">高</el-radio-button>
            <el-radio-button value="urgent">紧急</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="详细描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="4"
            placeholder="请详细描述您遇到的问题（选填）"
            maxlength="1000"
            show-word-limit
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSubmit" :loading="submitting">
            提交申请
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { useServiceOrderStore } from '@/stores/serviceOrder'

const store = useServiceOrderStore()
const formRef = ref()
const orders = ref([])
const submitting = ref(false)

const form = ref({
  order_id: null,
  type: 'return',
  reason: '',
  refund_amount: 0,
  priority: 'normal',
  description: ''
})

const selectedOrderPrice = computed(() => {
  const order = orders.value.find(o => o.id === form.value.order_id)
  return order ? order.price : 99999
})

const rules = {
  order_id: [{ required: true, message: '请选择订单', trigger: 'change' }],
  type: [{ required: true, message: '请选择服务类型', trigger: 'change' }],
  reason: [{ required: true, message: '请选择或填写原因', trigger: 'change' }],
  refund_amount: [{ required: true, message: '请输入退款金额', trigger: 'blur' }],
  priority: [{ required: true, message: '请选择优先级', trigger: 'change' }]
}

const reasonOptionsMap = {
  return: ['商品质量问题', '商品与描述不符', '收到错误商品', '不想要了', '其他'],
  exchange: ['尺码不合适', '颜色/款式选错', '商品有瑕疵需换新', '其他'],
  repair: ['使用故障', '外观损坏', '零部件缺失', '功能异常', '其他'],
  refund_only: ['商品质量问题', '商品与描述不符', '未收到货', '不想要了', '其他']
}

const reasonOptions = computed(() => {
  return reasonOptionsMap[form.value.type] || []
})

function handleOrderChange(orderId) {
  const order = orders.value.find(o => o.id === orderId)
  if (order && (form.value.type === 'return' || form.value.type === 'refund_only')) {
    form.value.refund_amount = order.price
  }
}

function handleTypeChange() {
  form.value.reason = ''
  if (form.value.type === 'return' || form.value.type === 'refund_only') {
    const order = orders.value.find(o => o.id === form.value.order_id)
    if (order) {
      form.value.refund_amount = order.price
    }
  } else {
    form.value.refund_amount = 0
  }
}

onMounted(async () => {
  try {
    const { data } = await axios.get('/api/orders')
    orders.value = Array.isArray(data) ? data : (data.list || data.data || [])
  } catch (e) {
    console.error('Failed to load orders:', e)
    ElMessage.error('加载订单列表失败')
  }
})

async function handleSubmit() {
  try {
    await formRef.value.validate()
  } catch (e) {
    return
  }

  submitting.value = true
  try {
    const payload = {
      order_id: form.value.order_id,
      type: form.value.type,
      reason: form.value.reason,
      priority: form.value.priority,
      description: form.value.description
    }
    if (form.value.type === 'return' || form.value.type === 'refund_only') {
      payload.refund_amount = form.value.refund_amount
    }
    const result = await store.createServiceOrder(payload)
    ElMessage.success(`申请成功！服务单号：${result.service_no}`)
    handleReset()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '提交失败')
  } finally {
    submitting.value = false
  }
}

function handleReset() {
  form.value = {
    order_id: null,
    type: 'return',
    reason: '',
    refund_amount: 0,
    priority: 'normal',
    description: ''
  }
  formRef.value?.resetFields()
}
</script>

<style scoped>
.apply-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.form-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.order-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.order-option-img {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}

.order-option-info {
  flex: 1;
  overflow: hidden;
}

.order-option-name {
  font-size: 14px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-option-meta {
  font-size: 12px;
  color: #909399;
}
</style>
