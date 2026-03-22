/* ═══════════════════════════════════════════════════════
   App.js — Main Controller (Gemini Only)
   - Lucide Icons aware
   - Glass-morphism HTML structure
   - Dark mode class-based (Tailwind 'dark' class)
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── State ───
  let currentData = null;
  let currentVideoInfo = null;
  let isAnalyzing = false;

  // ─── DOM Helpers ───
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─── Init ───
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupTheme();
    setupFavoritesModal();
    setupUrlInput();
    setupAnalyze();
    setupExportButtons();
    setupHomeButton();
    loadRecentVideos();
  }

  // ═══════════════════════════════════════
  // HOME BUTTON
  // ═══════════════════════════════════════
  function setupHomeButton() {
    $('#btnHome').addEventListener('click', (e) => {
      e.preventDefault();
      if (isAnalyzing) return;

      // 상태 초기화
      currentData = null;
      currentVideoInfo = null;

      // 입력창 비우기
      const input = $('#youtubeUrl');
      input.value = '';
      $('#btnClearUrl').classList.add('hidden');

      // 섹션 초기화
      hideSection('videoPreview');
      hideSection('progressSection');
      hideSection('resultSection');
      hideSection('errorSection');

      // 최근 영상 섹션 복구
      loadRecentVideos();

      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ═══════════════════════════════════════
  // THEME (Dark / Light)
  // ═══════════════════════════════════════
  function setupTheme() {
    const saved = localStorage.getItem('sermon_analyzer_theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
      updateThemeIcon('dark');
    }

    $('#btnThemeToggle').addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      const next = isDark ? 'dark' : 'light';
      localStorage.setItem('sermon_analyzer_theme', next);
      updateThemeIcon(next);
    });
  }

  function updateThemeIcon(theme) {
    const iconEl = $('#themeIcon');
    if (iconEl) {
      iconEl.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  // ═══════════════════════════════════════
  // FAVORITES MODAL
  // ═══════════════════════════════════════
  function setupFavoritesModal() {
    const modal = $('#favoritesModal');

    $('#btnFavorites').addEventListener('click', () => {
      const stored = localStorage.getItem('sermon_favorites');
      const saved = stored ? JSON.parse(stored) : DEFAULT_FAVORITES;
      $('#fav1Url').value = saved.fav1 || '';
      $('#fav2Url').value = saved.fav2 || '';
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    });

    $('#btnCloseFavModal').addEventListener('click', closeFavModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeFavModal(); });

    function closeFavModal() {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    $('#btnSaveFavorites').addEventListener('click', () => {
      const fav1 = $('#fav1Url').value.trim();
      const fav2 = $('#fav2Url').value.trim();
      localStorage.setItem('sermon_favorites', JSON.stringify({ fav1, fav2 }));
      closeFavModal();
      showToast('success', '즐겨찾기가 저장되었습니다.');
      loadRecentVideos();
    });
  }

  const DEFAULT_FAVORITES = {
    fav1: 'https://www.youtube.com/@양산중앙교회-t6k',
    fav2: ''
  };

  async function loadRecentVideos() {
    const stored = localStorage.getItem('sermon_favorites');
    const saved = stored ? JSON.parse(stored) : DEFAULT_FAVORITES;
    const urls = [saved.fav1, saved.fav2].filter(Boolean);

    if (urls.length === 0) {
      hideSection('recentVideosSection');
      return;
    }

    const grid = $('#recentVideosGrid');
    grid.innerHTML = '';

    // 채널 수에 따라 외부 그리드 레이아웃 설정
    grid.className = urls.length === 2
      ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
      : 'grid grid-cols-1 gap-3';

    // 각 채널별 컬럼 생성 (스켈레톤 로딩)
    const cols = urls.map((_, i) => {
      const col = document.createElement('div');
      // 1채널: 카드 3개를 가로 나열, 2채널: 세로 스택
      col.className = urls.length === 2
        ? 'flex flex-col gap-3'
        : 'grid grid-cols-1 sm:grid-cols-5 gap-3';
      col.innerHTML = [0,1,2,3,4].map(() =>
        `<div class="rounded-xl bg-gray-100 dark:bg-gray-800/50 animate-pulse" style="height:90px"></div>`
      ).join('');
      grid.appendChild(col);
      return col;
    });

    showSection('recentVideosSection');

    // 병렬로 채널 영상 fetch
    await Promise.all(urls.map(async (url, i) => {
      try {
        const res = await fetch(`/api/youtube-feed?channelUrl=${encodeURIComponent(decodeURIComponent(url))}`);
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'API 오류');

        cols[i].innerHTML = '';
        data.videos.forEach(video => cols[i].appendChild(createVideoCard(video)));

        // 채널명으로 섹션 헤더 업데이트
        const label = $('#recentVideosLabel');
        if (label) {
          if (urls.length === 1 && data.channelName) {
            label.textContent = `${data.channelName} 최근 영상`;
          } else {
            label.textContent = '즐겨찾기 최근 영상';
          }
        }
      } catch (err) {
        cols[i].innerHTML = `<p class="text-xs text-red-400 p-2">불러오기 실패: ${err.message}</p>`;
      }
    }));

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function createVideoCard(video) {
    const card = document.createElement('button');
    card.className = 'video-card';
    const date = video.published
      ? new Date(video.published).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
      : '';
    card.innerHTML = `
      <div class="relative aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 mb-2">
        <img src="${video.thumbnail}" alt="" class="w-full h-full object-cover" loading="lazy"
             onerror="this.src='https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg'">
        <div class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
          <div class="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow">
            <i data-lucide="play" class="w-3.5 h-3.5 text-gray-900 ml-0.5"></i>
          </div>
        </div>
      </div>
      <p class="video-card-title">${video.title}</p>
      ${date ? `<p class="video-card-date">${date}</p>` : ''}
    `;
    card.addEventListener('click', () => {
      const urlInput = $('#youtubeUrl');
      urlInput.value = video.url;
      $('#btnClearUrl').classList.remove('hidden');
      urlInput.focus();
      showToast('success', 'URL이 입력되었습니다. 분석 시작을 눌러주세요.');
    });
    return card;
  }

  // ═══════════════════════════════════════
  // URL INPUT
  // ═══════════════════════════════════════
  function setupUrlInput() {
    const input = $('#youtubeUrl');
    const clearBtn = $('#btnClearUrl');

    input.addEventListener('input', () => {
      if (input.value.length > 0) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.add('hidden');
      input.focus();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#btnAnalyze').click();
      }
    });
  }

  // ═══════════════════════════════════════
  // ANALYZE WORKFLOW
  // ═══════════════════════════════════════
  function setupAnalyze() {
    $('#btnAnalyze').addEventListener('click', startAnalysis);
    $('#btnRetry').addEventListener('click', startAnalysis);
  }

  async function startAnalysis() {
    if (isAnalyzing) return;

    const url = $('#youtubeUrl').value.trim();
    if (!url) {
      showToast('error', 'YouTube URL을 입력해주세요.');
      $('#youtubeUrl').focus();
      return;
    }

    const videoId = YouTube.extractVideoId(url);
    if (!videoId) {
      showToast('error', '유효한 YouTube URL이 아닙니다.');
      return;
    }

    isAnalyzing = true;
    currentData = null;
    currentVideoInfo = null;

    hideSection('videoPreview');
    hideSection('resultSection');
    hideSection('errorSection');
    hideSection('recentVideosSection');
    showSection('progressSection');
    resetProgress();
    disableAnalyzeBtn(true);

    // Gemini 직접 분석: 자막 추출 단계 스킵
    updateStep('step2', 'done', '완료');

    try {
      // Step 1: 영상 정보 추출
      updateStep('step1', 'active', '준비중');
      updateProgressBar(15);

      const videoInfo = await YouTube.fetchVideoInfo(videoId);
      currentVideoInfo = videoInfo;

      showVideoPreview(videoInfo);
      updateStep('step1', 'done', '완료');
      updateProgressBar(30);

      // Step 2: 스킵
      updateProgressBar(50);

      // Step 3: 설교 내용 분석
      updateStep('step3', 'active', '설교를 요약하고 있습니다');
      updateProgressBar(60);

      // 분석 중 60% → 90% 서서히 증가
      const progressTimer = setInterval(() => {
        const bar = $('#progressBar');
        const current = parseFloat(bar.style.width) || 60;
        if (current < 90) updateProgressBar(Math.min(current + 0.8, 90));
      }, 300);

      let analysisResult;
      try {
        analysisResult = await Analyzer.analyze(videoInfo);
      } finally {
        clearInterval(progressTimer);
      }
      currentData = analysisResult;

      updateStep('step3', 'done', '완료');
      updateProgressBar(100);

      // Render
      await sleep(400);
      hideSection('progressSection');
      Renderer.render(analysisResult);
      showSection('resultSection');

      showToast('success', '설교 분석이 완료되었습니다!');

    } catch (error) {
      console.error('Analysis error:', error);
      showError(error.message || '분석 중 알 수 없는 오류가 발생했습니다.');

      ['step1', 'step2', 'step3'].forEach(id => {
        const el = $(`#${id}`);
        if (el.classList.contains('active')) {
          updateStep(id, 'error', '실패');
        }
      });
    } finally {
      isAnalyzing = false;
      disableAnalyzeBtn(false);
    }
  }

  // ═══════════════════════════════════════
  // EXPORT BUTTONS
  // ═══════════════════════════════════════
  function setupExportButtons() {
    $('#btnExportMd').addEventListener('click', () => {
      if (!currentData) return;
      Renderer.exportMarkdown(currentData, currentVideoInfo);
      showToast('success', 'Markdown 파일이 다운로드됩니다.');
    });

$('#btnExportHtml').addEventListener('click', () => {
      if (!currentData) return;
      Renderer.exportHtml(currentData);
      showToast('success', 'HTML 파일이 다운로드됩니다.');
    });
  }

  // ═══════════════════════════════════════
  // UI HELPERS
  // ═══════════════════════════════════════
  function showSection(id) {
    const el = $(`#${id}`);
    if (el) el.classList.remove('hidden');
  }

  function hideSection(id) {
    const el = $(`#${id}`);
    if (el) el.classList.add('hidden');
  }

  function showVideoPreview(info) {
    $('#videoThumbnail').src = info.thumbnail;
    $('#videoThumbnail').onerror = () => {
      $('#videoThumbnail').src = info.thumbnailHq;
    };
    $('#videoTitle').textContent = info.title;
    $('#videoChannel').textContent = info.channel;

    const overlay = $('#thumbnailOverlay');
    if (overlay) {
      overlay.onclick = () => window.open(info.url, '_blank');
    }

    showSection('videoPreview');
  }

  function resetProgress() {
    ['step1', 'step2', 'step3'].forEach(id => {
      const el = $(`#${id}`);
      el.className = 'progress-step';
      el.querySelector('.step-status').textContent = '대기 중';
    });
    updateProgressBar(0);
  }

  function updateStep(id, state, statusText) {
    const el = $(`#${id}`);
    el.className = `progress-step ${state}`;
    el.querySelector('.step-status').textContent = statusText;
  }

  function updateProgressBar(percent) {
    $('#progressBar').style.width = `${percent}%`;
    const pct = $('#progressPercent');
    if (pct) pct.textContent = `${Math.round(percent)}%`;
  }

  function disableAnalyzeBtn(disabled) {
    const btn = $('#btnAnalyze');
    btn.disabled = disabled;
    if (disabled) {
      btn.innerHTML = '<span class="spinner"></span><span>분석 중...</span>';
    } else {
      btn.innerHTML = '<i data-lucide="scan-search" class="w-4 h-4"></i><span>분석 시작</span>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  function showError(message) {
    $('#errorMessage').textContent = message;
    hideSection('progressSection');
    showSection('errorSection');
  }

  // ─── Toast ───
  function showToast(type, message) {
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const iconName = type === 'success' ? 'check-circle-2' : 'alert-circle';
    toast.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4 flex-shrink-0"></i><span>${message}</span>`;
    document.body.appendChild(toast);

    if (typeof lucide !== 'undefined') lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


})();
