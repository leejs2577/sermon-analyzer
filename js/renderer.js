/* ═══════════════════════════════════════════════════════
   Renderer v2 — 분석 결과 HTML 렌더링 + 내보내기
   - Lucide Icons aware (re-init after DOM changes)
   - New glass-morphism design
   ═══════════════════════════════════════════════════════ */

const Renderer = (() => {

  /**
   * 분석 결과를 DOM에 렌더링
   */
  function render(data) {
    renderInfoCard(data.meta);
    renderSummary(data.summary);
    renderSections(data.sections);
    renderConclusion(data.conclusion);

    // Re-render Lucide icons for dynamically generated content
    if (typeof lucide !== 'undefined') {
      setTimeout(() => lucide.createIcons(), 50);
    }
  }

  function renderInfoCard(meta) {
    const el = (id) => document.getElementById(id);

    el('sermonType').textContent = meta.worshipType || '예배';
    el('sermonTitle').textContent = meta.title || '설교 제목';
    el('sermonDate').textContent = meta.date || '날짜 미상';
    el('sermonPreacher').textContent = meta.preacher || '설교자 미상';
    el('sermonScripture').textContent = meta.scripture || '본문 미상';

    const tagsContainer = el('sermonTags');
    tagsContainer.innerHTML = '';
    if (meta.tags && meta.tags.length > 0) {
      meta.tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = `#${tag}`;
        tagsContainer.appendChild(span);
      });
    }
  }

  function renderSummary(summary) {
    const container = document.getElementById('summaryText');
    container.innerHTML = formatText(summary || '');
  }

  function renderSections(sections) {
    const container = document.getElementById('contentSections');
    container.innerHTML = '';

    if (!sections || sections.length === 0) return;

    sections.forEach(section => {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'content-section';

      // Header
      const header = document.createElement('div');
      header.className = 'content-section-header';

      const numEl = document.createElement('span');
      numEl.className = 'section-number';
      numEl.textContent = section.number;

      const titleWrap = document.createElement('div');
      const titleEl = document.createElement('span');
      titleEl.className = 'section-title';
      titleEl.textContent = section.title;
      titleWrap.appendChild(titleEl);

      if (section.subtitle) {
        const subtitleEl = document.createElement('span');
        subtitleEl.className = 'section-subtitle';
        subtitleEl.textContent = ` — ${section.subtitle}`;
        titleWrap.appendChild(subtitleEl);
      }

      header.appendChild(numEl);
      header.appendChild(titleWrap);
      sectionEl.appendChild(header);

      // Body
      const body = document.createElement('div');
      body.className = 'section-body';

      // Content paragraphs
      if (section.content) {
        const paragraphs = section.content.split('\n').filter(p => p.trim());
        paragraphs.forEach(p => {
          const pEl = document.createElement('p');
          pEl.innerHTML = formatText(p);
          body.appendChild(pEl);
        });
      }

      // Key Point
      if (section.keyPoint) {
        const kp = document.createElement('div');
        kp.className = 'key-point';
        kp.innerHTML = `
          <span class="key-point-icon"><i data-lucide="lightbulb" class="w-4 h-4"></i></span>
          <span>${escapeHtml(section.keyPoint)}</span>
        `;
        body.appendChild(kp);
      }

      // Scripture Quotes
      if (section.scriptureQuotes && section.scriptureQuotes.length > 0) {
        section.scriptureQuotes.forEach(quote => {
          if (quote.text) {
            const bq = document.createElement('blockquote');
            bq.className = 'scripture-quote';
            bq.innerHTML = `"${escapeHtml(quote.text)}"`;
            if (quote.reference) {
              const ref = document.createElement('span');
              ref.className = 'scripture-ref';
              ref.textContent = `— ${quote.reference}`;
              bq.appendChild(ref);
            }
            body.appendChild(bq);
          }
        });
      }

      sectionEl.appendChild(body);
      container.appendChild(sectionEl);
    });
  }

  function renderConclusion(conclusion) {
    // Points
    const pointsContainer = document.getElementById('conclusionText');
    pointsContainer.innerHTML = '';

    if (conclusion.points && conclusion.points.length > 0) {
      const ul = document.createElement('ul');
      conclusion.points.forEach(point => {
        const li = document.createElement('li');
        li.innerHTML = formatText(point);
        ul.appendChild(li);
      });
      pointsContainer.appendChild(ul);
    }

    // Meditation Questions
    const medContainer = document.getElementById('meditationQuestions');
    medContainer.innerHTML = '';

    if (conclusion.meditation && conclusion.meditation.length > 0) {
      const h4 = document.createElement('h4');
      h4.innerHTML = '<i data-lucide="heart" class="w-3.5 h-3.5"></i> 묵상과 적용';
      medContainer.appendChild(h4);

      const ol = document.createElement('ol');
      conclusion.meditation.forEach(q => {
        const li = document.createElement('li');
        li.textContent = q;
        ol.appendChild(li);
      });
      medContainer.appendChild(ol);
    }

    // Closing Verse
    const verseContainer = document.getElementById('closingVerse');
    if (conclusion.closingVerse && conclusion.closingVerse.text) {
      verseContainer.innerHTML = `"${escapeHtml(conclusion.closingVerse.text)}"`;
      if (conclusion.closingVerse.reference) {
        const ref = document.createElement('cite');
        ref.style.cssText = 'display:block;margin-top:8px;font-size:13px;font-style:normal;font-weight:600;';
        ref.textContent = `— ${conclusion.closingVerse.reference}`;
        verseContainer.appendChild(ref);
      }
    } else {
      verseContainer.innerHTML = '';
    }
  }

  // ═══════════════════════════════════════
  // EXPORT FUNCTIONS
  // ═══════════════════════════════════════

  function exportMarkdown(data, videoInfo) {
    const md = generateMarkdown(data, videoInfo);
    const filename = `${data.meta.date || 'sermon'}_${data.meta.title || '설교분석'}.md`
      .replace(/[/\\?%*:|"<>]/g, '_');
    downloadFile(md, filename, 'text/markdown;charset=utf-8');
  }

  function generateMarkdown(data, videoInfo) {
    let md = '';

    // Frontmatter
    md += '---\n';
    md += `date: ${data.meta.date || ''}\n`;
    md += `preacher: "${data.meta.preacher || ''}"\n`;
    md += `scripture: ${data.meta.scripture || ''}\n`;
    md += `title: ${data.meta.title || ''}\n`;
    md += `church: "${data.meta.church || ''}"\n`;
    md += 'tags:\n';
    (data.meta.tags || []).forEach(tag => {
      md += `  - ${tag}\n`;
    });
    md += `source: ${videoInfo?.url || ''}\n`;
    md += '---\n\n';

    // Title
    md += `# ${data.meta.worshipType || '예배'} — ${data.meta.title || '설교'}\n\n`;
    md += `- **제목 : ${data.meta.title || ''}**\n`;
    md += `- **말씀 : ${data.meta.scripture || ''}**\n`;
    if (data.meta.preacher) md += `- **설교자 : ${data.meta.preacher}**\n`;
    if (data.meta.church) md += `- **교회 : ${data.meta.church}**\n`;
    md += '\n';

    // Summary
    md += `> [!summary] 설교 요약\n`;
    md += `> ${data.summary || ''}\n\n`;
    md += '---\n\n';

    // Sections
    (data.sections || []).forEach(section => {
      const subtitle = section.subtitle ? ` — ${section.subtitle}` : '';
      md += `## ${section.number}. ${section.title}${subtitle}\n\n`;
      md += `${section.content || ''}\n\n`;

      if (section.keyPoint) {
        md += `> **${section.keyPoint}**\n\n`;
      }

      (section.scriptureQuotes || []).forEach(q => {
        if (q.text) {
          md += `> "${q.text}"\n`;
          if (q.reference) md += `> — ${q.reference}\n`;
          md += '\n';
        }
      });

      md += '---\n\n';
    });

    // Conclusion
    md += '## 결론 및 묵상\n\n';
    (data.conclusion?.points || []).forEach(p => {
      md += `- ${p}\n`;
    });
    md += '\n';

    if (data.conclusion?.meditation?.length > 0) {
      md += '**묵상과 적용:**\n\n';
      data.conclusion.meditation.forEach((q, i) => {
        md += `${i + 1}. ${q}\n`;
      });
      md += '\n';
    }

    if (data.conclusion?.closingVerse?.text) {
      md += `> "${data.conclusion.closingVerse.text}"`;
      if (data.conclusion.closingVerse.reference) {
        md += ` (${data.conclusion.closingVerse.reference})`;
      }
      md += '\n';
    }

    return md;
  }

  async function exportPdf(data) {
    const element = document.getElementById('resultContent');
    if (!element) return;

    const filename = `${data.meta.date || 'sermon'}_${data.meta.title || '설교분석'}.pdf`
      .replace(/[/\\?%*:|"<>]/g, '_');

    document.body.classList.add('export-mode');

    const options = {
      margin: [8, 10, 8, 10],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#FFFFFF'
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
      },
      pagebreak: { mode: ['css', 'legacy'] }
    };

    try {
      await html2pdf().set(options).from(element).save();
    } finally {
      document.body.classList.remove('export-mode');
    }
  }

  async function exportImage(data) {
    const element = document.getElementById('resultContent');
    if (!element) return;

    const filename = `${data.meta.date || 'sermon'}_${data.meta.title || '설교분석'}.png`
      .replace(/[/\\?%*:|"<>]/g, '_');

    document.body.classList.add('export-mode');

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#FFFFFF'
      });

      const blob = await new Promise(r => canvas.toBlob(r, 'image/png', 1.0));
      if (blob) triggerDownload(blob, filename);
    } finally {
      document.body.classList.remove('export-mode');
    }
  }

  function exportHtml(data) {
    const element = document.getElementById('resultContent');
    if (!element) return;

    const filename = `${data.meta.date || 'sermon'}_${data.meta.title || '설교분석'}.html`
      .replace(/[/\\?%*:|"<>]/g, '_');

    // 현재 페이지의 style.css 내용을 가져옴
    const styleSheets = Array.from(document.styleSheets);
    let cssText = '';
    styleSheets.forEach(sheet => {
      try {
        if (sheet.href && sheet.href.includes('style.css')) {
          Array.from(sheet.cssRules).forEach(rule => {
            cssText += rule.cssText + '\n';
          });
        }
      } catch (e) {
        // CORS로 접근 불가한 스타일시트 무시
      }
    });

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.meta.title || '설교분석')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700;900&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet">
  <style>
    body {
      font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FAFAF8;
      color: #1A1A1A;
      margin: 0;
      padding: 24px;
    }
    #resultContent {
      max-width: 768px;
      margin: 0 auto;
    }
    #resultContent > * + * {
      margin-top: 20px;
    }
    ${cssText}
  </style>
</head>
<body>
  ${element.outerHTML}
</body>
</html>`;

    downloadFile(html, filename, 'text/html;charset=utf-8');
  }

  // ═══════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatText(text) {
    let html = escapeHtml(text);
    // ==하이라이트== → <mark>
    html = html.replace(/==(.*?)==/g, '<mark class="highlight-mark">$1</mark>');
    // **bold** → <strong>
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-emphasis">$1</strong>');
    return html;
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    triggerDownload(blob, filename);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
  }

  return {
    render,
    exportMarkdown,
    exportPdf,
    exportImage,
    exportHtml,
    generateMarkdown
  };
})();
