<template>
  <el-container class="app-layout">
    <el-aside width="200px" class="app-sidebar">
      <div class="sidebar-logo">
        <div class="logo-icon">✦</div>
        <span class="logo-text">售后服务</span>
      </div>
      <nav class="sidebar-nav">
        <a
          v-for="item in menuItems"
          :key="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
          @click="$router.push(item.path)"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </a>
      </nav>
    </el-aside>

    <el-container class="app-main-container">
      <header class="app-header">
        <div class="header-left">
          <h2 class="page-title">{{ currentTitle }}</h2>
        </div>
        <div class="header-right">
          <div class="user-avatar">M</div>
        </div>
      </header>

      <main class="app-main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const menuItems = [
  { path: '/merchant/dashboard', label: '工作台', icon: '◉' },
  { path: '/merchant/service-list', label: '服务单管理', icon: '◎' },
  { path: '/merchant/ai-templates', label: '协商agent管理', icon: '✦' },
  { path: '/consumer/apply', label: '消费者申请', icon: '✎' },
  { path: '/consumer/my-services', label: '我的售后', icon: '◈' }
]

function isActive(path) {
  if (path === '/merchant/service-list' && route.path.startsWith('/merchant/service/')) return true
  return route.path === path
}

const currentTitle = computed(() => route.meta?.title || '售后服务管理系统')
</script>

<style scoped>
.app-layout {
  height: 100vh;
  overflow: hidden;
}

.app-sidebar {
  background: #0f172a;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.logo-icon {
  font-size: 18px;
  color: #818cf8;
}

.logo-text {
  font-size: 15px;
  font-weight: 600;
  color: #f1f5f9;
  letter-spacing: 0.5px;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none;
}

.nav-item:hover {
  background: rgba(255,255,255,0.06);
}

.nav-item.active {
  background: rgba(99,102,241,0.15);
}

.nav-icon {
  font-size: 14px;
  color: #64748b;
  width: 20px;
  text-align: center;
}

.nav-item.active .nav-icon {
  color: #818cf8;
}

.nav-label {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 400;
}

.nav-item.active .nav-label {
  color: #e2e8f0;
  font-weight: 500;
}

.app-main-container {
  flex-direction: column;
  overflow: hidden;
  background: #f8fafc;
}

.app-header {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.app-main {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
