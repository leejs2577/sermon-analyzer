/* ═══════════════════════════════════════════════════════
   captions — YouTube 영상 자막 추출
   1차: Apify Actor (클라우드 환경에서도 동작)
   2차: ANDROID Innertube API (로컬/가정용 IP 폴백)
   ═══════════════════════════════════════════════════════ */

const APIFY_ACTOR = 'karamelo~youtube-transcripts';
const APIFY_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`;

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const ANDROID_VERSION = '20.10.38';
const ANDROID_UA = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14)`;

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
    // 1차: Apify Actor (클라우드 IP에서도 동작)
    const apifyResult = await tryApify(videoId);
    if (apifyResult) {
      return { statusCode: 200, headers, body: JSON.stringify({ captions: apifyResult }) };
    }

    // 2차: ANDROID Innertube (로컬/가정용 IP 폴백)
    const androidResult = await tryAndroidInnertube(videoId);
    if (androidResult) {
      return { statusCode: 200, headers, body: JSON.stringify({ captions: androidResult }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };

  } catch (e) {
    console.error(`[captions] 에러:`, e.message);
    return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
  }
};

/**
 * Apify Actor로 자막 추출
 * 프록시 IP를 사용하므로 클라우드 환경에서도 YouTube 자막 접근 가능
 */
async function tryApify(videoId) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(APIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        urls: [`https://www.youtube.com/watch?v=${videoId}`],
        outputFormat: 'singleStringText',
        language: 'ko',
      }),
    });

    if (!res.ok) {
      console.log(`[captions] Apify 실패: ${res.status}`);
      return null;
    }

    const items = await res.json();
    const text = items?.[0]?.text || items?.[0]?.transcript || items?.[0]?.content || null;

    if (!text || text.length < 100) return null;
    return text;
  } catch (e) {
    console.log(`[captions] Apify 에러: ${e.message}`);
    return null;
  }
}

/**
 * ANDROID Innertube Player API로 자막 추출
 * 가정용 IP에서 동작, 클라우드 IP에서는 LOGIN_REQUIRED
 */
async function tryAndroidInnertube(videoId) {
  try {
    const res = await fetch(INNERTUBE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_UA,
      },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: ANDROID_VERSION } },
        videoId,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data?.playabilityStatus?.status !== 'OK') return null;

    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) return null;

    // 한국어 자막 트랙 선택 (수동 우선, 자동생성 폴백)
    const isKo = (t) => /^ko(-[A-Za-z]+)?$/.test(t.languageCode);
    const isAsr = (t) => (t.kind || '').toLowerCase() === 'asr';
    const selected = tracks.find(t => isKo(t) && !isAsr(t))
      || tracks.find(t => isKo(t) && isAsr(t));
    if (!selected) return null;

    return await fetchCaptionText(selected.baseUrl);
  } catch {
    return null;
  }
}

/**
 * timedtext API에서 자막 텍스트 추출
 */
async function fetchCaptionText(baseUrl) {
  try {
    const res = await fetch(baseUrl, {
      headers: { 'User-Agent': ANDROID_UA },
    });

    if (!res.ok) return null;
    const xml = await res.text();
    if (!xml || xml.length === 0) return null;

    let texts = [];

    // srv3 형식: <p t="ms" d="ms"><s>텍스트</s></p>
    const pRegex = /<p\s+t="\d+"\s+d="\d+"[^>]*>([\s\S]*?)<\/p>/g;
    let m;
    while ((m = pRegex.exec(xml)) !== null) {
      const sTexts = [];
      const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
      let sm;
      while ((sm = sRegex.exec(m[1])) !== null) sTexts.push(sm[1]);
      const text = sTexts.length > 0 ? sTexts.join('') : m[1].replace(/<[^>]+>/g, '');
      const decoded = decodeEntities(text).trim();
      if (decoded) texts.push(decoded);
    }

    // <text> 형식 폴백
    if (texts.length === 0) {
      const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
      while ((m = textRegex.exec(xml)) !== null) {
        const decoded = decodeEntities(m[1]).trim();
        if (decoded) texts.push(decoded);
      }
    }

    const result = texts.join(' ').replace(/\s+/g, ' ').trim();
    return result.length >= 100 ? result : null;
  } catch {
    return null;
  }
}

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
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/\\n/g, '\n');
}
