/* ═══════════════════════════════════════════════════════
   captions — YouTube 영상 자막 추출
   ANDROID Innertube Player API로 captionTracks 조회 후
   서명된 baseUrl로 timedtext XML 호출하여 자막 텍스트 반환
   API 키 불필요
   ═══════════════════════════════════════════════════════ */

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
    // Innertube Player API (ANDROID 클라이언트)로 자막 트랙 조회
    const playerRes = await fetch(INNERTUBE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_UA,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: ANDROID_VERSION,
          },
        },
        videoId: videoId,
      }),
    });

    if (!playerRes.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
    }

    const playerData = await playerRes.json();
    const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
    }

    // 한국어 자막 트랙 선택 (수동 우선, 자동생성 폴백)
    const isKo = (t) => /^ko(-[A-Za-z]+)?$/.test(t.languageCode);
    const isAsr = (t) => (t.kind || '').toLowerCase() === 'asr';

    const koManual = tracks.find(t => isKo(t) && !isAsr(t));
    const koAuto = tracks.find(t => isKo(t) && isAsr(t));
    const selected = koManual || koAuto;

    if (!selected) {
      return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
    }

    // 서명된 baseUrl로 timedtext API 호출
    const fullText = await fetchCaptionText(selected.baseUrl);

    if (!fullText || fullText.length < 100) {
      return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ captions: fullText }) };

  } catch (e) {
    console.error(`[captions] 에러:`, e.message);
    return { statusCode: 200, headers, body: JSON.stringify({ captions: null }) };
  }
};

/**
 * timedtext API에서 자막 텍스트 추출
 * srv3(XML) 형식과 json3 형식 모두 지원
 */
async function fetchCaptionText(baseUrl) {
  try {
    const res = await fetch(baseUrl, {
      headers: { 'User-Agent': ANDROID_UA },
    });

    if (!res.ok) return null;
    const xml = await res.text();
    if (!xml || xml.length === 0) return null;

    // srv3 형식: <p t="ms" d="ms"><s>텍스트</s></p> 또는 <text start="" dur="">텍스트</text>
    let texts = [];

    // <p> + <s> 형식 (srv3)
    const pRegex = /<p\s+t="\d+"\s+d="\d+"[^>]*>([\s\S]*?)<\/p>/g;
    let m;
    while ((m = pRegex.exec(xml)) !== null) {
      const inner = m[1];
      // <s> 태그 안의 텍스트 추출
      const sTexts = [];
      const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
      let sm;
      while ((sm = sRegex.exec(inner)) !== null) {
        sTexts.push(sm[1]);
      }
      // <s> 태그가 없으면 태그 제거 후 텍스트
      const text = sTexts.length > 0 ? sTexts.join('') : inner.replace(/<[^>]+>/g, '');
      const decoded = decodeEntities(text).trim();
      if (decoded) texts.push(decoded);
    }

    // <text> 형식 (기본 XML) 폴백
    if (texts.length === 0) {
      const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
      while ((m = textRegex.exec(xml)) !== null) {
        const decoded = decodeEntities(m[1]).trim();
        if (decoded) texts.push(decoded);
      }
    }

    return texts.join(' ').replace(/\s+/g, ' ').trim();
  } catch (e) {
    console.error(`[captions] fetchCaptionText 에러:`, e.message);
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
