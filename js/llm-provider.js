/* ═══════════════════════════════════════════════════════
   LLM Provider — Netlify 프록시 경유 Gemini 호출
   브라우저에서 /api/gemini 엔드포인트로 POST 요청
   ═══════════════════════════════════════════════════════ */

const LLMProvider = (() => {

  /**
   * 통합 인터페이스
   * @param {string} prompt - 분석 프롬프트
   * @param {object} options - { youtubeUrl }
   */
  async function generate(prompt, options = {}) {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, youtubeUrl: options.youtubeUrl || null })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `API 오류 (${res.status})`);
    if (!data.text) throw new Error('응답에서 텍스트를 추출할 수 없습니다.');

    return data.text;
  }

  return { generate };
})();
