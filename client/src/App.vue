<template>
  <el-container class="app-layout">
    <el-aside width="220px" class="app-sidebar">
      <div class="sidebar-logo">
        <span class="logo-text">售后服务管理</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :router="true"
        class="sidebar-menu"
        background-color="#ffffff"
        text-color="#606266"
        active-text-color="#409eff"
      >
        <el-menu-item index="/merchant/dashboard">
          <el-icon><Monitor /></el-icon>
          <span>工作台</span>
        </el-menu-item>
        <el-menu-item index="/merchant/service-list">
          <el-icon><Document /></el-icon>
          <span>服务单管理</span>
        </el-menu-item>
        <el-menu-item index="/consumer/apply">
          <el-icon><EditPen /></el-icon>
          <span>消费者申请</span>
        </el-menu-item>
        <el-menu-item index="/consumer/my-services">
          <el-icon><User /></el-icon>
          <span>我的售后</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container class="app-main-container">
      <el-header class="app-header">
        <div class="header-left">
          <h2 class="page-title">{{ currentTitle }}</h2>
        </div>
        <div class="header-right">
          <el-avatar :size="36" class="user-avatar">
            <el-icon><User /></el-icon>
          </el-avatar>
        </div>
      </el-header>

      <el-main class="app-main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Monitor, Document, EditPen, User } from '@element-plus/icons-vue'

const route = useRoute()

const activeMenu = computed(() => {
  if (route.path.startsWith('/merchant/service/')) return '/merchant/service-list'
  return route.path
})

const currentTitle = computed(() => {
  return route.meta?.title || '售后服务管理系统'
})
</script>

<style scoped>
.app-layout {
  height: 100vh;
  overflow: hidden;
}

.app-sidebar {
  background: #ffffff;
  border-right: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-logo {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: #409eff;
  letter-spacing: 1px;
}

.sidebar-menu {
  border-right: none;
  flex: 1;
  overflow-y: auto;
  padding-top: 8px;
}

.sidebar-menu .el-menu-item {
  height: 50px;
  line-height: 50px;
  margin: 4px 8px;
  border-radius: 8px;
}

.sidebar-menu .el-menu-item.is-active {
  background-color: #ecf5ff;
  font-weight: 500;
}

.sidebar-menu .el-menu-item:hover {
  background-color: #f5f7fa;
}

.app-main-container {
  flex-direction: column;
  overflow: hidden;
}

.app-header {
  height: 64px;
  background: #ffffff;
  border-bottom: 1px solid #ebeef5;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}

.header-left .page-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-avatar {
  background-color: #409eff;
  cursor: pointer;
}

.app-main {
  padding: 24px;
  background-color: #f5f7fa;
  overflow-y: auto;
  flex: 1;
}
</style>
