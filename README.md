# 售后服务平台

电商售后服务管理系统，提供商家端工单处理和消费者端售后申请的完整流程管理，内置 AI 智能审核建议功能。

## 功能模块

### 商家端

- **工作台**：售后工单统计概览（各状态数量、优先级分布）
- **服务单管理**：工单列表查询、筛选（状态/类型/优先级/日期/关键词）、分页
- **工单详情**：查看完整工单信息、消费者画像、沟通记录、物流追踪、操作时间线
- **工单处理**：审核通过、拒绝、要求补充信息、标记完成
- **批量操作**：批量通过/拒绝
- **AI 审核建议**：基于消费者信用、VIP等级、退货率、工单类型等多维度自动生成处理建议

### 消费者端

- **售后申请**：选择订单，提交退货/换货/维修/仅退款申请
- **我的售后**：查看个人售后单状态及历史记录
- **满意度评价**：对已完成的服务单进行评分和评价

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Vue 3 + Vue Router + Pinia |
| UI 组件库 | Element Plus |
| 图表 | ECharts + vue-echarts |
| 构建工具 | Vite 6 |
| 后端框架 | Express |
| 数据库 | sql.js（SQLite in-memory，文件持久化） |
| HTTP 客户端 | Axios |

## 项目结构

```
after-sales-system/
├── client/                   # 前端
│   ├── src/
│   │   ├── views/
│   │   │   ├── merchant/     # 商家端页面（Dashboard, ServiceList, ServiceDetail）
│   │   │   └── consumer/     # 消费者端页面（ApplyService, MyServices）
│   │   ├── router/           # 路由配置
│   │   ├── stores/           # Pinia 状态管理
│   │   ├── components/       # 公共组件
│   │   ├── App.vue           # 主布局
│   │   └── main.js           # 入口
│   ├── vite.config.js
│   └── package.json
├── server/                   # 后端
│   ├── routes/
│   │   ├── serviceOrders.js  # 售后工单 CRUD 及状态流转
│   │   ├── orders.js         # 订单查询
│   │   ├── consumers.js      # 消费者信息
│   │   └── communications.js # 沟通记录
│   ├── services/
│   │   └── aiSuggestion.js   # AI 审核建议引擎
│   ├── db.js                 # 数据库初始化及种子数据
│   ├── index.js              # 服务入口
│   └── package.json
├── render.yaml               # Render 部署配置
├── railway.json              # Railway 部署配置
└── package.json              # 根级脚本
```

## 快速开始

### 环境要求

- Node.js >= 18

### 本地开发

```bash
# 安装依赖
cd client && npm install
cd ../server && npm install

# 启动后端（端口 3000）
cd server
npm run dev

# 启动前端（端口 5173，自动代理 /api 到后端）
cd client
npm run dev
```

浏览器访问 http://localhost:5173

### 生产构建

```bash
cd client && npm run build
cd ../server && npm start
```

构建后前端静态文件由 Express 托管，统一通过 http://localhost:3000 访问。

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/service-orders/stats` | 工单统计 |
| GET | `/api/service-orders` | 工单列表（支持筛选分页） |
| GET | `/api/service-orders/:id` | 工单详情 |
| POST | `/api/service-orders` | 创建售后单 |
| PUT | `/api/service-orders/:id/approve` | 审核通过 |
| PUT | `/api/service-orders/:id/reject` | 审核拒绝 |
| PUT | `/api/service-orders/:id/feedback` | 要求补充信息 |
| PUT | `/api/service-orders/:id/complete` | 标记完成 |
| PUT | `/api/service-orders/:id/rate` | 满意度评价 |
| POST | `/api/service-orders/batch-approve` | 批量通过 |
| POST | `/api/service-orders/batch-reject` | 批量拒绝 |
| GET | `/api/service-orders/:id/ai-suggestion` | AI 审核建议 |
| GET | `/api/orders` | 订单列表 |
| GET | `/api/consumers` | 消费者列表 |
| GET | `/api/service-orders/:id/communications` | 沟通记录 |
| POST | `/api/service-orders/:id/communications` | 发送消息 |

## 工单状态流转

```
pending（待审核）
  ├── approved（已通过）→ completed（已完成）→ rated（已评价）
  ├── rejected（已拒绝）
  └── feedback_required（待补充信息）→ pending
```

## 部署

项目已配置 Render 和 Railway 一键部署：

- **Render**：推送代码后自动构建部署，配置见 `render.yaml`
- **Railway**：配置见 `railway.json`

## 数据说明

首次启动时自动创建 SQLite 数据库（`server/data.db`）并注入演示数据，包含 5 个消费者、10 个订单、8 个售后工单及相关沟通记录和物流信息。
