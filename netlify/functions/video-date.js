/* ═══════════════════════════════════════════════════════
   video-date — YouTube 영상 발행 날짜 조회
   YouTube watch 페이지 HTML에서 datePublished 추출
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
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SermonAnalyzer/1.0)',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });

    if (!res.ok) throw new Error(`YouTube 페이지 요청 실패: ${res.status}`);

    const html = await res.text();

    // 방법 1: JSON-LD schema.org (가장 신뢰도 높음)
    const ldMatch = html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
    if (ldMatch) {
      return { statusCode: 200, headers, body: JSON.stringify({ publishedAt: ldMatch[1] }) };
    }

    // 방법 2: ytInitialData publishDate (ISO 8601 전체 형식 포함)
    const pdMatch = html.match(/"publishDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
    if (pdMatch) {
      return { statusCode: 200, headers, body: JSON.stringify({ publishedAt: pdMatch[1] }) };
    }

    // 날짜를 찾지 못한 경우
    return { statusCode: 200, headers, body: JSON.stringify({ publishedAt: null }) };

  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ publishedAt: null }) };
  }
};
