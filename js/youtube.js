/* ═══════════════════════════════════════════════════════
   YouTube Module v4
   - URL 파싱 (videoId 추출)
   - oEmbed API로 메타정보 (제목, 채널, 썸네일)
   - 자막 추출 (한국어 우선, 자동생성 폴백)
   ═══════════════════════════════════════════════════════ */

const YouTube = (() => {

  /**
   * YouTube URL에서 videoId 추출
   */
  function extractVideoId(url) {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * oEmbed API + 발행 날짜 + 자막 병렬 조회
   */
  async function fetchVideoInfo(videoId) {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

    const [oembedResult, dateResult, captionsResult] = await Promise.allSettled([
      fetch(oembedUrl).then(r => { if (!r.ok) throw new Error('oEmbed 실패'); return r.json(); }),
      fetch(`/api/video-date?videoId=${videoId}`).then(r => r.json()),
      fetch(`/api/captions?videoId=${videoId}`).then(r => r.json()),
    ]);

    const oembed = oembedResult.status === 'fulfilled' ? oembedResult.value : null;
    const dateData = dateResult.status === 'fulfilled' ? dateResult.value : {};
    const captionsData = captionsResult.status === 'fulfilled' ? captionsResult.value : {};

    if (!oembed) {
      return {
        title: '영상 정보를 가져올 수 없습니다',
        channel: '',
        channelUrl: '',
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        thumbnailHq: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        videoId: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: dateData.publishedAt || null,
        captions: captionsData.captions || null,
      };
    }

    return {
      title: oembed.title || '',
      channel: oembed.author_name || '',
      channelUrl: oembed.author_url || '',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      thumbnailHq: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      videoId: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt: dateData.publishedAt || null,
      captions: captionsData.captions || null,
    };
  }

  return {
    extractVideoId,
    fetchVideoInfo
  };
})();
