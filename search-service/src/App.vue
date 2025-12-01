<template>
  <div class="app-shell">
    <header class="top-bar">
      <div class="brand">🧲 AuroraMag</div>
      <div class="controls" style="display: flex; align-items: center; gap: 10px;">
        <el-tag v-if="autoTheme" size="small" effect="plain">自动切换: {{ themeLabel }}</el-tag>
        <el-tooltip content="切换明亮/暗黑模式" placement="bottom">
          <el-button circle :icon="themeIcon" @click="toggleTheme" />
        </el-tooltip>
        <el-link v-if="!autoTheme" type="info" @click="enableAuto">恢复自动</el-link>
      </div>
    </header>

    <main class="content">
      <section class="search-panel">
        <div class="search-title">Bitmagnet 搜索</div>
        <div class="search-subtitle">简洁、纯净，仅使用后端 GraphQL/Torznab 数据</div>
        <div class="search-row">
          <el-input
            v-model="query"
            size="large"
            placeholder="输入关键词后回车"
            clearable
            @keyup.enter="onSearch"
          />
          <el-select v-model="sort" placeholder="排序" size="large" style="width: 150px;">
            <el-option label="相关度" value="relevance" />
            <el-option label="做种优先" value="seeders" />
            <el-option label="下载优先" value="leechers" />
            <el-option label="文件大小" value="size" />
            <el-option label="时间" value="published_at" />
          </el-select>
          <el-button type="primary" size="large" :loading="loading" @click="onSearch">
            搜索
          </el-button>
        </div>
      </section>

      <section>
        <el-alert v-if="error" :title="error" type="error" show-icon style="margin-bottom: 12px;" />

        <div class="result-meta" v-if="showMeta">
          找到 <strong>{{ totalCount }}</strong> 个结果， 用时 {{ timeText }}
        </div>

        <el-empty v-else-if="!query && !loading" description="输入关键词开始搜索" />

        <div class="result-list">
          <div v-for="item in items" :key="item.infoHash" class="result-item">
            <div class="card-title">
              <a :href="`/details/${item.infoHash}`" target="_blank">
                {{ item.title || item.name || item.infoHash }}
              </a>
            </div>
            <div class="card-meta">
              <span>大小：{{ formatSize(item.size || 0) }}</span>
              <span>健康：↑{{ item.seeders ?? 0 }} / ↓{{ item.leechers ?? 0 }}</span>
              <span v-if="item.filesCount !== undefined">文件数：{{ item.filesCount }}</span>
              <span v-if="item.publishedAt || item.pubDate">时间：{{ formatDate(item.publishedAt || item.pubDate) }}</span>
            </div>
            <div class="card-actions">
              <el-button type="primary" plain size="small" @click="openMagnet(item)">磁力</el-button>
              <el-button text size="small" @click="openDetails(item.infoHash)">详情</el-button>
            </div>
          </div>
        </div>

        <div ref="sentinel" class="sentinel">
          <el-icon v-if="loadingMore"><Loading /></el-icon>
          <span v-else-if="hasMore">下拉即可加载更多</span>
          <span v-else-if="items.length && !loading">没有更多了</span>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Loading, Moon, Sunny } from '@element-plus/icons-vue';
import { searchTorrents, magnetLink } from './api';
import type { SortOption, TorrentNode } from './types';

const query = ref('');
const items = ref<TorrentNode[]>([]);
const totalCount = ref(0);
const error = ref('');
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(false);
const limit = 40;
const sort = ref<SortOption>('relevance');
const searchTime = ref<number | null>(null);
const hasQueried = ref(false);

const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const formatSize = (bytes: number) => {
  if (!bytes) return '—';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / (1024 ** 2)).toFixed(2)} MB`;
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

const openMagnet = (item: TorrentNode) => {
  const link = magnetLink(item);
  if (link) window.open(link, '_blank');
};

const openDetails = (infoHash: string) => {
  window.open(`/details/${infoHash}`, '_blank');
};

const timeText = computed(() => {
  if (searchTime.value === null) return '--';
  return `${searchTime.value.toFixed(2)} 秒`;
});

const showMeta = computed(() => hasQueried.value && !loading.value);

const themeOptions = ['light', 'dark'] as const;
type ThemeMode = (typeof themeOptions)[number];

const timeBasedTheme = (): ThemeMode => {
  const hour = new Date().getHours();
  return hour >= 19 || hour < 7 ? 'dark' : 'light';
};

const storedTheme = localStorage.getItem('auroramag-theme');
const autoTheme = ref(!storedTheme);
const theme = ref<ThemeMode>(storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : timeBasedTheme());
const themeLabel = computed(() => (theme.value === 'dark' ? '暗黑' : '明亮'));
const themeIcon = computed(() => (theme.value === 'dark' ? Sunny : Moon));

const applyTheme = (mode: ThemeMode) => {
  document.documentElement.classList.toggle('dark', mode === 'dark');
};

let themeTimer: number | undefined;
const startThemeClock = () => {
  if (themeTimer) window.clearInterval(themeTimer);
  themeTimer = window.setInterval(() => {
    if (autoTheme.value) {
      const nextMode = timeBasedTheme();
      if (nextMode !== theme.value) {
        theme.value = nextMode;
      }
    }
  }, 60_000);
};

const toggleTheme = () => {
  autoTheme.value = false;
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  localStorage.setItem('auroramag-theme', theme.value);
};

const enableAuto = () => {
  autoTheme.value = true;
  localStorage.removeItem('auroramag-theme');
  theme.value = timeBasedTheme();
};

watch(theme, (mode) => {
  applyTheme(mode);
  if (!autoTheme.value) {
    localStorage.setItem('auroramag-theme', mode);
  }
});

const observeSentinel = () => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (!sentinel.value) return;
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      loadMore();
    }
  }, { rootMargin: '120px' });
  observer.observe(sentinel.value);
};

const onSearch = async () => {
  if (!query.value.trim()) {
    items.value = [];
    totalCount.value = 0;
    hasMore.value = false;
    hasQueried.value = false;
    searchTime.value = null;
    return;
  }
  loading.value = true;
  loadingMore.value = false;
  error.value = '';
  searchTime.value = null;
  const started = performance.now();
  try {
    const resp = await searchTorrents(query.value, limit, 0, sort.value, true);
    items.value = (resp.edges || []).map((edge) => edge.node).filter(Boolean);
    totalCount.value = resp.totalCount || items.value.length;
    hasMore.value = !!resp.hasMore;
    searchTime.value = (performance.now() - started) / 1000;
    hasQueried.value = true;
  } catch (err) {
    console.error(err);
    error.value = err instanceof Error ? err.message : '搜索失败';
    items.value = [];
    totalCount.value = 0;
    hasMore.value = false;
    hasQueried.value = true;
  } finally {
    loading.value = false;
    await nextTick();
    observeSentinel();
  }
};

const loadMore = async () => {
  if (!hasMore.value || loading.value || loadingMore.value) return;
  loadingMore.value = true;
  try {
    const offset = items.value.length;
    const resp = await searchTorrents(query.value, limit, offset, sort.value, true);
    const nodes = (resp.edges || []).map((edge) => edge.node).filter(Boolean);
    items.value.push(...nodes);
    totalCount.value = resp.totalCount || totalCount.value;
    hasMore.value = !!resp.hasMore;
  } catch (err) {
    console.error(err);
    ElMessage.error(err instanceof Error ? err.message : '加载更多失败');
  } finally {
    loadingMore.value = false;
  }
};

onMounted(() => {
  applyTheme(theme.value);
  startThemeClock();
  observeSentinel();
});

onUnmounted(() => {
  if (observer) observer.disconnect();
  if (themeTimer) window.clearInterval(themeTimer);
});
</script>
