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
    setupUrlInput();
    setupAnalyze();
    setupExportButtons();
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

$('#btnExportImage').addEventListener('click', async () => {
      if (!currentData) return;
      const btn = $('#btnExportImage');
      btn.classList.add('loading');
      btn.innerHTML = '<span class="spinner"></span> 캡처 중...';
      try {
        await Renderer.exportImage(currentData);
        showToast('success', '이미지가 다운로드됩니다.');
      } catch (e) {
        showToast('error', '이미지 캡처에 실패했습니다.');
      } finally {
        btn.classList.remove('loading');
        btn.innerHTML = '<i data-lucide="image" class="w-3.5 h-3.5"></i> 이미지';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
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
