exports.handler = async (event) => {
  const channelUrl = event.queryStringParameters?.channelUrl;
  if (!channelUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: '채널 URL이 필요합니다.' }) };
  }

  try {
    let channelId;

    // /channel/UCxxx 형식에서 직접 추출
    const directMatch = channelUrl.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (directMatch) {
      channelId = directMatch[1];
    } else {
      // /@handle 등의 형식 — 채널 페이지 HTML에서 channelId 추출
      const normalizedUrl = new URL(channelUrl).href; // 한글 경로를 퍼센트 인코딩
      const pageRes = await fetch(normalizedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SermonAnalyzer/1.0)' }
      });
      if (!pageRes.ok) {
        return { statusCode: 400, body: JSON.stringify({ error: '채널 페이지를 불러올 수 없습니다.' }) };
      }
      const html = await pageRes.text();
      // externalId 우선 — 채널 자신의 ID를 가리키는 키 (browseId는 다른 채널 ID를 먼저 캡처할 수 있음)
      const match =
        html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/) ||
        html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/) ||
        html.match(/"browseId":"(UC[a-zA-Z0-9_-]+)"/);
      if (!match) {
        return { statusCode: 400, body: JSON.stringify({ error: '채널 ID를 찾을 수 없습니다. URL을 확인해주세요.' }) };
      }
      channelId = match[1];
    }

    // RSS 피드 조회
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const rssRes = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SermonAnalyzer/1.0)' }
    });
    if (!rssRes.ok) {
      return { statusCode: 400, body: JSON.stringify({ error: `RSS 피드를 가져올 수 없습니다. (HTTP ${rssRes.status})` }) };
    }
    const xml = await rssRes.text();

    // 라이브 영상 제외 키워드
    const LIVE_KEYWORDS = ['라이브', 'LIVE', 'Live', '실시간', '🔴', '스트리밍', 'streaming', 'Streaming', '새벽기도회'];

    // 최근 3개 항목 파싱 (라이브 제외)
    const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
      .map(m => {
        const entry = m[1];
        const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] || '';
        const rawTitle = entry.match(/<title>([^<]+)<\/title>/)?.[1] || '';
        const title = rawTitle
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] || '';
        return {
          videoId,
          title,
          published,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
        };
      })
      .filter(v => !LIVE_KEYWORDS.some(kw => v.title.includes(kw)))
      .slice(0, 5);

    // 피드 최상위 <title> 태그에서 채널명 추출
    const channelName = xml.match(/<title>([^<]+)<\/title>/)?.[1] || '';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, channelName, videos })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
