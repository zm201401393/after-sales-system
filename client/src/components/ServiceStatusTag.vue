<template>
  <el-tag :type="tagType" :effect="effect">{{ label }}</el-tag>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, required: true },
  effect: { type: String, default: 'light' }
})

const statusMap = {
  pending: { label: '待审核', type: 'warning' },
  approved: { label: '已通过', type: 'success' },
  rejected: { label: '已拒绝', type: 'danger' },
  feedback_required: { label: '待反馈', type: 'info' },
  completed: { label: '已完成', type: '' }
}

const label = computed(() => statusMap[props.status]?.label || props.status)
const tagType = computed(() => statusMap[props.status]?.type || '')
</script>
