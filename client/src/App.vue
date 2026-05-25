<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <div class="header-left">
        <h1 class="logo">售后服务管理系统</h1>
      </div>
      <el-menu
        :default-active="activeMenu"
        mode="horizontal"
        router
        class="header-menu"
      >
        <el-menu-item index="/merchant/dashboard">工作台</el-menu-item>
        <el-menu-item index="/merchant/service-list">服务单管理</el-menu-item>
        <el-menu-item index="/consumer/apply">消费者申请</el-menu-item>
      </el-menu>
    </el-header>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activeMenu = computed(() => {
  if (route.path.startsWith('/merchant/service/')) return '/merchant/service-list'
  return route.path
})
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; background: #f0f2f5; }

.app-container { min-height: 100vh; }

.app-header {
  background: #fff;
  display: flex;
  align-items: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  padding: 0 24px;
  z-index: 10;
}

.header-left { display: flex; align-items: center; margin-right: 40px; }
.logo { font-size: 18px; color: #409eff; white-space: nowrap; }

.header-menu { border-bottom: none; flex: 1; }

.app-main { padding: 24px; max-width: 1400px; margin: 0 auto; width: 100%; }
</style>
