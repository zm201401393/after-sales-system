<template>
  <div class="apply-page">
    <el-card>
      <template #header>
        <h2>申请售后服务</h2>
      </template>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" style="max-width: 700px;">
        <el-form-item label="选择订单" prop="order_id">
          <el-select v-model="form.order_id" placeholder="请选择需要售后的订单" filterable style="width: 100%;">
            <el-option
              v-for="order in orders"
              :key="order.id"
              :value="order.id"
              :label="`${order.order_no} - ${order.product_name}`"
            >
              <div style="display: flex; align-items: center; gap: 10px;">
                <img :src="order.product_image" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;" />
                <div>
                  <div>{{ order.product_name }}</div>
                  <div style="font-size: 12px; color: #999;">{{ order.order_no }} | ¥{{ order.price }}</div>
                </div>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="服务类型" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio-button value="return">退货</el-radio-button>
            <el-radio-button value="exchange">换货</el-radio-button>
            <el-radio-button value="repair">维修</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="申请原因" prop="reason">
          <el-select v-model="form.reason" placeholder="请选择原因" allow-create filterable style="width: 100%;">
            <el-option v-for="r in reasonOptions" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>

        <el-form-item label="详细描述">
          <el-input v-model="form.description" type="textarea" :rows="4" placeholder="请详细描述问题（选填）" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSubmit" :loading="submitting">提交申请</el-button>
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
import { useServiceOrderStore } from '../../stores/serviceOrder'

const store = useServiceOrderStore()
const formRef = ref()
const orders = ref([])
const submitting = ref(false)

const form = ref({
  order_id: null,
  type: 'return',
  reason: '',
  description: ''
})

const rules = {
  order_id: [{ required: true, message: '请选择订单', trigger: 'change' }],
  type: [{ required: true, message: '请选择服务类型', trigger: 'change' }],
  reason: [{ required: true, message: '请选择或填写原因', trigger: 'change' }]
}

const reasonOptions = computed(() => {
  const map = {
    return: ['商品质量问题', '商品与描述不符', '收到错误商品', '不想要了', '其他'],
    exchange: ['尺码不合适', '颜色/款式选错', '商品有瑕疵需换新', '收到错误商品', '其他'],
    repair: ['使用故障', '外观损坏', '零部件缺失', '功能异常', '其他']
  }
  return map[form.value.type] || []
})

onMounted(async () => {
  const { data } = await axios.get('/api/orders')
  orders.value = data
})

async function handleSubmit() {
  await formRef.value.validate()
  submitting.value = true
  try {
    const result = await store.createServiceOrder(form.value)
    ElMessage.success(`申请成功！服务单号：${result.service_no}`)
    handleReset()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '提交失败')
  } finally {
    submitting.value = false
  }
}

function handleReset() {
  form.value = { order_id: null, type: 'return', reason: '', description: '' }
  formRef.value?.resetFields()
}
</script>

<style scoped>
.apply-page { max-width: 800px; margin: 0 auto; }
h2 { margin: 0; font-size: 18px; }
</style>
