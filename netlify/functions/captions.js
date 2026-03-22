/* ═══════════════════════════════════════════════════════
   captions — YouTube 영상 자막 추출
   YouTube watch 페이지에서 captionTracks를 파싱하고
   timedtext API로 자막 텍스트 반환
   API 키 불필요
   ═══════════════════════════════════════════════════════ */

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const videoId = event.queryStringParameters?.videoId;
  if (!videoId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'videoId required' }) };
  }

  try {
    // 1. YouTube watch 페이지 HTML fetch
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!res.ok) throw new Error(`YouTube 페이지 요청 실패: ${res.status}`);
    const html = await res.text();

    // 2. captionTracks 배열 직접 추출 (전체 JSON 파싱 회피)
    const tracksMatch = html.match(/"captionTracks":(\[.*?\]),"translationLanguages"/);
    if (!tracksMatch) {
      return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
    }

    let tracks;
    try {
      tracks = JSON.parse(tracksMatch[1]);
    } catch {
      return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
    }

    if (!tracks || tracks.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
    }

    // 3. 한국어 자막 트랙 선택 (수동 우선, 자동생성 폴백)
    const koManual = tracks.find(t => t.languageCode === 'ko' && t.kind !== 'asr');
    const koAuto = tracks.find(t => t.languageCode === 'ko' && t.kind === 'asr');
    const selected = koManual || koAuto;

    if (!selected) {
      return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
    }

    // 4. timedtext API 호출로 자막 XML 획득
    const captionRes = await fetch(selected.baseUrl);
    if (!captionRes.ok) throw new Error('자막 API 요청 실패');
    const xml = await captionRes.text();

    // 5. XML에서 <text> 태그 텍스트 추출
    const texts = [];
    const regex = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let m;
    while ((m = regex.exec(xml)) !== null) {
      texts.push(decodeEntities(m[1]));
    }
    const fullText = texts.join(' ').replace(/\s+/g, ' ').trim();

    // 자막이 너무 짧으면 불충분한 것으로 판단
    if (fullText.length < 100) {
      return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ captions: fullText }) };

  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
  }
};

/**
 * HTML 엔티티 디코딩
 */
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\\n/g, '\n');
}
